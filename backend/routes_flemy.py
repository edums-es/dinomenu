"""Admin configuration and secure tools consumed by Flemy flows/AI agents."""
import asyncio
import hmac
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException

from auth import require_restaurant
from db import db
from flemy import (
    DEFAULT_FLEMY_EVENTS,
    emit_flemy_event,
    find_customer_orders,
    public_frontend_url,
    public_order,
    safe_webhook_url,
    send_flemy_push,
)
from models import now_iso
from routes_ws import broadcast as ws_broadcast
from whatsapp import notify_order_status
from order_security import release_stock

router = APIRouter(prefix="/api/integrations/flemy", tags=["flemy"])


def rid(user):
    return user["restaurant_id"]


async def require_flemy_restaurant(restaurant_id: str, token: str):
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    expected = (restaurant or {}).get("flemy_api_token") or ""
    if not restaurant or not restaurant.get("flemy_enabled") or not token or not hmac.compare_digest(token, expected):
        raise HTTPException(401, "Token Flemy invalido")
    return restaurant


def bearer_token(authorization: str):
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return ""


@router.get("/settings")
async def get_settings(user=Depends(require_restaurant)):
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    return {
        "enabled": bool(restaurant.get("flemy_enabled")),
        "webhook_url": restaurant.get("flemy_webhook_url", ""),
        "has_webhook_secret": bool(restaurant.get("flemy_webhook_secret")),
        "api_token": restaurant.get("flemy_api_token", ""),
        "events": restaurant.get("flemy_events", DEFAULT_FLEMY_EVENTS),
        "push_enabled": bool(restaurant.get("flemy_push_enabled")),
        "push_url": restaurant.get("flemy_push_url", ""),
        "push_status_notifications": bool(restaurant.get("flemy_push_status_notifications")),
        "push_chatbot_id": restaurant.get("flemy_push_chatbot_id", ""),
        "push_queue_id": restaurant.get("flemy_push_queue_id", ""),
        "push_user_id": restaurant.get("flemy_push_user_id", ""),
        "push_force_department": bool(restaurant.get("flemy_push_force_department")),
        "push_force_user": bool(restaurant.get("flemy_push_force_user")),
        "tool_url": f"/api/integrations/flemy/{rid(user)}/tools",
    }


@router.put("/settings")
async def update_settings(body: dict, user=Depends(require_restaurant)):
    updates = {
        "flemy_enabled": bool(body.get("enabled")),
        "flemy_events": [event for event in body.get("events", []) if event in DEFAULT_FLEMY_EVENTS],
        "flemy_push_enabled": bool(body.get("push_enabled")),
        "flemy_push_status_notifications": bool(body.get("push_status_notifications")),
        "flemy_push_chatbot_id": str(body.get("push_chatbot_id") or "").strip(),
        "flemy_push_queue_id": str(body.get("push_queue_id") or "").strip(),
        "flemy_push_user_id": str(body.get("push_user_id") or "").strip(),
        "flemy_push_force_department": bool(body.get("push_force_department")),
        "flemy_push_force_user": bool(body.get("push_force_user")),
        "updated_at": now_iso(),
    }
    if "webhook_url" in body:
        try:
            updates["flemy_webhook_url"] = safe_webhook_url(body["webhook_url"]) if body["webhook_url"] else ""
        except ValueError as exc:
            raise HTTPException(400, str(exc))
    if "push_url" in body:
        try:
            updates["flemy_push_url"] = safe_webhook_url(body["push_url"]) if body["push_url"] else ""
        except ValueError as exc:
            raise HTTPException(400, str(exc))
    if body.get("webhook_secret"):
        updates["flemy_webhook_secret"] = str(body["webhook_secret"]).strip()
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    if updates["flemy_enabled"] and not (restaurant or {}).get("flemy_api_token"):
        updates["flemy_api_token"] = secrets.token_urlsafe(32)
    await db.restaurants.update_one({"id": rid(user)}, {"$set": updates})
    return await get_settings(user)


@router.post("/regenerate-token")
async def regenerate_token(user=Depends(require_restaurant)):
    token = secrets.token_urlsafe(32)
    await db.restaurants.update_one({"id": rid(user)}, {"$set": {"flemy_api_token": token, "updated_at": now_iso()}})
    return {"api_token": token}


@router.post("/test")
async def test_event(user=Depends(require_restaurant)):
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    ok = await emit_flemy_event(restaurant, "order.status_changed", data={"test": True, "message": "Integracao EG Delivery conectada"})
    if not ok:
        raise HTTPException(400, "Falha ao enviar. Confira URL, ativacao e evento habilitado.")
    return {"ok": True}


@router.post("/test-push")
async def test_push(body: dict, user=Depends(require_restaurant)):
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    ok = await send_flemy_push(
        restaurant,
        body.get("phone", ""),
        f"Teste EG Delivery + Flemy conectado para {restaurant.get('name', '')}.",
        f"egdelivery:test:{now_iso()}",
    )
    if not ok:
        raise HTTPException(400, "Falha no Push. Confira URL autenticada, ativacao e telefone.")
    return {"ok": True}


@router.get("/logs")
async def integration_logs(user=Depends(require_restaurant)):
    return await db.integration_logs.find(
        {"restaurant_id": rid(user), "provider": {"$in": ["flemy", "flemy_push"]}}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)


@router.post("/{restaurant_id}/tools")
async def flemy_tools(
    restaurant_id: str,
    body: dict,
    x_flemy_token: str = Header(""),
    authorization: str = Header(""),
):
    restaurant = await require_flemy_restaurant(restaurant_id, x_flemy_token or bearer_token(authorization))
    action = body.get("action")

    if action in {"get_order_status", "get_customer_orders"}:
        orders = await find_customer_orders(
            restaurant_id,
            phone=body.get("phone", ""),
            order_number=body.get("order_number"),
            order_id=body.get("order_id", ""),
        )
        return {"ok": True, "orders": [public_order(order) for order in orders]}

    if action == "cancel_order":
        if not body.get("phone"):
            raise HTTPException(400, "Telefone do cliente obrigatorio para cancelar")
        if body.get("order_number") in (None, "") and not body.get("order_id"):
            raise HTTPException(400, "Numero ou ID do pedido obrigatorio para cancelar")
        orders = await find_customer_orders(
            restaurant_id,
            phone=body.get("phone", ""),
            order_number=body.get("order_number"),
            order_id=body.get("order_id", ""),
        )
        if not orders:
            raise HTTPException(404, "Pedido nao encontrado")
        order = orders[0]
        if order.get("status") not in {"pending", "accepted"}:
            raise HTTPException(409, "Pedido ja esta em preparo ou finalizado. Transfira para um atendente.")
        result = await db.orders.update_one(
            {"id": order["id"], "restaurant_id": restaurant_id, "status": {"$in": ["pending", "accepted"]}},
            {"$set": {"status": "cancelled", "cancelled_by": "flemy", "cancel_reason": body.get("reason", ""), "updated_at": now_iso()}},
        )
        if result.matched_count == 0:
            raise HTTPException(409, "Pedido mudou de status. Transfira para um atendente.")
        if order.get("stock_reservations") and not order.get("stock_released_at"):
            await release_stock(db, restaurant_id, order["stock_reservations"])
            await db.orders.update_one(
                {"id": order["id"], "restaurant_id": restaurant_id},
                {"$set": {"stock_released_at": now_iso()}},
            )
        updated = await db.orders.find_one({"id": order["id"], "restaurant_id": restaurant_id}, {"_id": 0})
        asyncio.create_task(notify_order_status(updated, "cancelled"))
        asyncio.create_task(ws_broadcast(restaurant_id, "order_updated", {"id": updated["id"], "status": "cancelled"}))
        asyncio.create_task(emit_flemy_event(restaurant, "order.cancelled", updated, {"origin": "flemy"}))
        return {"ok": True, "order": public_order(updated)}

    if action == "get_menu":
        products = await db.products.find(
            {"restaurant_id": restaurant_id, "is_available": True}, {"_id": 0}
        ).sort("sort_order", 1).to_list(100)
        return {
            "ok": True,
            "menu_url": body.get("menu_url") or f"{public_frontend_url()}/cardapio/{restaurant.get('slug', '')}",
            "products": [
                {"id": p.get("id"), "name": p.get("name"), "description": p.get("description"), "price": p.get("promotional_price") or p.get("price")}
                for p in products
            ],
        }

    if action == "get_offers":
        coupons = await db.coupons.find({"restaurant_id": restaurant_id, "is_active": True}, {"_id": 0}).to_list(50)
        return {"ok": True, "coupons": [{"code": c.get("code"), "type": c.get("discount_type"), "value": c.get("discount_value"), "min_order": c.get("min_order"), "free_delivery": c.get("free_delivery", False)} for c in coupons]}

    if action == "get_restaurant_info":
        return {"ok": True, "restaurant": {"name": restaurant.get("name"), "slug": restaurant.get("slug"), "is_open": restaurant.get("is_open_manual", True), "delivery_fee": restaurant.get("flat_delivery_fee"), "average_delivery_time": restaurant.get("average_delivery_time"), "payment_methods": restaurant.get("payment_methods") or []}}

    raise HTTPException(400, "Acao desconhecida")
