"""Extra systems: Stock, Combos, Loyalty, Wholesale, Customers CRM, PDV."""
import asyncio
import csv
import io
import math
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse

from db import db
from auth import require_restaurant
from models import (
    ComboIn, LoyaltySettings, LoyaltyTransaction,
    WholesaleMerchantIn, ServiceOrderIn, PDVOrderIn,
    ORDER_STATUSES, clean, new_id, now_iso,
)
from order_security import calculate_order, money, next_sequence, release_stock, reserve_stock
from routes_printing import enqueue_order_print

router = APIRouter(prefix="/api/admin", tags=["extras"])


def rid(user):
    return user["restaurant_id"]


# ═══════════════════════════════════════════════════════════════════════════
# STOCK MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/stock")
async def list_stock(user=Depends(require_restaurant)):
    """All products with stock info."""
    products = await db.products.find(
        {"restaurant_id": rid(user)}, {"_id": 0}
    ).sort("name", 1).to_list(2000)
    return products


@router.put("/stock/{product_id}")
async def update_stock(product_id: str, body: dict, user=Depends(require_restaurant)):
    """Patch stock fields: stock_quantity, track_stock, low_stock_threshold."""
    allowed = {"stock_quantity", "track_stock", "low_stock_threshold"}
    patch = {k: v for k, v in body.items() if k in allowed}
    if not patch:
        raise HTTPException(400, "Nenhum campo válido")
    await db.products.update_one(
        {"id": product_id, "restaurant_id": rid(user)}, {"$set": patch}
    )
    return await db.products.find_one({"id": product_id, "restaurant_id": rid(user)}, {"_id": 0})


@router.post("/stock/{product_id}/adjust")
async def adjust_stock(product_id: str, body: dict, user=Depends(require_restaurant)):
    """Adjust stock_quantity by delta (positive = add, negative = remove)."""
    delta = int(body.get("delta", 0))
    reason = body.get("reason", "ajuste manual")
    product = await db.products.find_one({"id": product_id, "restaurant_id": rid(user)})
    if not product:
        raise HTTPException(404, "Produto não encontrado")
    new_qty = max(0, (product.get("stock_quantity") or 0) + delta)
    await db.products.update_one(
        {"id": product_id, "restaurant_id": rid(user)}, {"$set": {"stock_quantity": new_qty}}
    )
    # Log movement
    await db.stock_movements.insert_one({
        "id": new_id(),
        "restaurant_id": rid(user),
        "product_id": product_id,
        "product_name": product["name"],
        "delta": delta,
        "new_quantity": new_qty,
        "reason": reason,
        "created_at": now_iso(),
    })
    return {"product_id": product_id, "new_quantity": new_qty}


@router.get("/stock/movements")
async def stock_movements(
    user=Depends(require_restaurant),
    product_id: Optional[str] = Query(None),
):
    q: dict = {"restaurant_id": rid(user)}
    if product_id:
        q["product_id"] = product_id
    return await db.stock_movements.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)


@router.get("/stock/alerts")
async def low_stock_alerts(user=Depends(require_restaurant)):
    """Products with stock below threshold."""
    products = await db.products.find(
        {"restaurant_id": rid(user), "track_stock": True}, {"_id": 0}
    ).to_list(2000)
    return [p for p in products if (p.get("stock_quantity") or 0) <= (p.get("low_stock_threshold") or 5)]


# ═══════════════════════════════════════════════════════════════════════════
# COMBOS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/combos")
async def list_combos(user=Depends(require_restaurant)):
    return await db.combos.find({"restaurant_id": rid(user)}, {"_id": 0}).sort("sort_order", 1).to_list(200)


@router.post("/combos")
async def create_combo(data: ComboIn, user=Depends(require_restaurant)):
    doc = data.model_dump()
    doc.update({"id": new_id(), "restaurant_id": rid(user), "created_at": now_iso()})
    await db.combos.insert_one(doc)
    return clean(doc)


@router.put("/combos/{cid}")
async def update_combo(cid: str, data: ComboIn, user=Depends(require_restaurant)):
    patch = {k: v for k, v in data.model_dump().items()}
    patch["updated_at"] = now_iso()
    res = await db.combos.update_one({"id": cid, "restaurant_id": rid(user)}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(404, "Combo não encontrado")
    return await db.combos.find_one({"id": cid, "restaurant_id": rid(user)}, {"_id": 0})


@router.delete("/combos/{cid}")
async def delete_combo(cid: str, user=Depends(require_restaurant)):
    await db.combos.delete_one({"id": cid, "restaurant_id": rid(user)})
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════
# LOYALTY (FIDELIDADE)
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/loyalty/settings")
async def get_loyalty_settings(user=Depends(require_restaurant)):
    r = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    return r.get("loyalty", {
        "enabled": False, "points_per_real": 1.0,
        "min_points_redeem": 100, "points_to_real": 0.10,
    })


@router.put("/loyalty/settings")
async def update_loyalty_settings(data: LoyaltySettings, user=Depends(require_restaurant)):
    await db.restaurants.update_one(
        {"id": rid(user)}, {"$set": {"loyalty": data.model_dump()}}
    )
    return data.model_dump()


@router.get("/loyalty/customers")
async def loyalty_customers(user=Depends(require_restaurant), search: str = Query("")):
    q: dict = {"restaurant_id": rid(user)}
    customers = await db.loyalty_accounts.find(q, {"_id": 0}).sort("points", -1).to_list(500)
    if search:
        s = search.lower()
        customers = [c for c in customers if s in (c.get("name") or "").lower() or s in (c.get("phone") or "")]
    return customers


@router.get("/loyalty/customers/{phone}")
async def get_loyalty_customer(phone: str, user=Depends(require_restaurant)):
    acc = await db.loyalty_accounts.find_one(
        {"restaurant_id": rid(user), "phone": phone}, {"_id": 0}
    )
    if not acc:
        return {"phone": phone, "points": 0, "total_earned": 0, "total_redeemed": 0}
    txns = await db.loyalty_transactions.find(
        {"restaurant_id": rid(user), "customer_phone": phone}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)
    return {**acc, "transactions": txns}


@router.post("/loyalty/adjust")
async def adjust_loyalty(data: LoyaltyTransaction, user=Depends(require_restaurant)):
    phone = data.customer_phone
    delta = data.points if data.type == "earn" else -data.points
    acc = await db.loyalty_accounts.find_one({"restaurant_id": rid(user), "phone": phone})
    if acc:
        new_pts = max(0, acc.get("points", 0) + delta)
        await db.loyalty_accounts.update_one(
            {"restaurant_id": rid(user), "phone": phone},
            {"$set": {"points": new_pts},
             "$inc": {"total_earned" if delta > 0 else "total_redeemed": abs(delta)}}
        )
    else:
        await db.loyalty_accounts.insert_one({
            "id": new_id(), "restaurant_id": rid(user),
            "phone": phone, "name": "",
            "points": max(0, delta),
            "total_earned": max(0, delta), "total_redeemed": 0,
            "created_at": now_iso(),
        })
        new_pts = max(0, delta)
    # Log transaction
    await db.loyalty_transactions.insert_one({
        "id": new_id(), "restaurant_id": rid(user),
        "customer_phone": phone, "points": data.points,
        "type": data.type, "order_id": data.order_id,
        "notes": data.notes, "created_at": now_iso(),
    })
    return {"phone": phone, "points": new_pts}


# ═══════════════════════════════════════════════════════════════════════════
# WHOLESALE / ATACADO
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/wholesale/merchants")
async def list_merchants(user=Depends(require_restaurant), status: str = Query("")):
    q: dict = {"restaurant_id": rid(user)}
    if status:
        q["status"] = status
    return await db.wholesale_merchants.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/wholesale/merchants")
async def create_merchant(data: WholesaleMerchantIn, user=Depends(require_restaurant)):
    doc = data.model_dump()
    doc.update({"id": new_id(), "restaurant_id": rid(user),
                "status": "pending", "created_at": now_iso()})
    await db.wholesale_merchants.insert_one(doc)
    return clean(doc)


@router.put("/wholesale/merchants/{mid}")
async def update_merchant(mid: str, body: dict, user=Depends(require_restaurant)):
    allowed = {"status", "notes", "company_name", "contact_name", "email", "phone", "cnpj", "address", "city", "state"}
    patch = {k: v for k, v in body.items() if k in allowed}
    patch["updated_at"] = now_iso()
    await db.wholesale_merchants.update_one({"id": mid, "restaurant_id": rid(user)}, {"$set": patch})
    return await db.wholesale_merchants.find_one({"id": mid, "restaurant_id": rid(user)}, {"_id": 0})


@router.delete("/wholesale/merchants/{mid}")
async def delete_merchant(mid: str, user=Depends(require_restaurant)):
    await db.wholesale_merchants.delete_one({"id": mid, "restaurant_id": rid(user)})
    return {"ok": True}


# Service Orders (OS)
@router.get("/wholesale/orders")
async def list_service_orders(user=Depends(require_restaurant)):
    return await db.service_orders.find(
        {"restaurant_id": rid(user)}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)


@router.post("/wholesale/orders")
async def create_service_order(data: ServiceOrderIn, user=Depends(require_restaurant)):
    merchant = await db.wholesale_merchants.find_one({"id": data.merchant_id, "restaurant_id": rid(user)})
    if not merchant:
        raise HTTPException(404, "Comerciante não encontrado")

    # Calculate total using wholesale_price if available
    total = 0.0
    items_with_prices = []
    for item in data.items:
        prod = await db.products.find_one({"id": item.product_id, "restaurant_id": rid(user)})
        unit_price = (prod.get("wholesale_price") or prod.get("price") or 0) if prod else 0
        subtotal = unit_price * item.quantity
        total += subtotal
        items_with_prices.append({
            **item.model_dump(),
            "unit_price": unit_price,
            "subtotal": subtotal,
        })

    total = max(0, total - data.discount)
    os_number = await next_sequence(
        db, rid(user), "service_order", "service_orders", "os_number"
    )
    doc = {
        "id": new_id(),
        "os_number": os_number,
        "restaurant_id": rid(user),
        "merchant_id": data.merchant_id,
        "merchant_name": merchant["company_name"],
        "items": items_with_prices,
        "subtotal": total + data.discount,
        "discount": data.discount,
        "total": total,
        "notes": data.notes,
        "delivery_date": data.delivery_date,
        "payment_method": data.payment_method,
        "status": "pending",
        "created_at": now_iso(),
    }
    await db.service_orders.insert_one(doc)
    return clean(doc)


@router.put("/wholesale/orders/{oid}/status")
async def update_os_status(oid: str, body: dict, user=Depends(require_restaurant)):
    status = body.get("status")
    valid = ["pending", "confirmed", "producing", "ready", "delivered", "cancelled"]
    if status not in valid:
        raise HTTPException(400, "Status inválido")
    await db.service_orders.update_one(
        {"id": oid, "restaurant_id": rid(user)},
        {"$set": {"status": status, "updated_at": now_iso()}}
    )
    return await db.service_orders.find_one({"id": oid, "restaurant_id": rid(user)}, {"_id": 0})


# Public registration endpoint (no auth)
from fastapi import APIRouter as _AR
public_wholesale_router = _AR(prefix="/api/public", tags=["wholesale-public"])

@public_wholesale_router.post("/wholesale/register/{restaurant_id}")
async def public_merchant_register(restaurant_id: str, data: WholesaleMerchantIn):
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(404, "Restaurante não encontrado")
    doc = data.model_dump()
    doc.update({"id": new_id(), "restaurant_id": restaurant_id,
                "status": "pending", "source": "self_register", "created_at": now_iso()})
    await db.wholesale_merchants.insert_one(doc)
    return {"ok": True, "message": "Cadastro enviado! Entraremos em contato em breve."}


# ═══════════════════════════════════════════════════════════════════════════
# CUSTOMERS CRM
# ═══════════════════════════════════════════════════════════════════════════

LEAD_SEGMENTS = {
    "vip": {"label": "VIP", "priority": 6},
    "hot": {"label": "Quente", "priority": 5},
    "new": {"label": "Novo", "priority": 4},
    "active": {"label": "Ativo", "priority": 3},
    "at_risk": {"label": "Em risco", "priority": 2},
    "lost": {"label": "Perdido", "priority": 1},
    "cancelled_only": {"label": "So cancelou", "priority": 0},
}

LEAD_STATUS_LABELS = {
    "none": "Sem acao",
    "to_contact": "Contatar",
    "negotiating": "Em conversa",
    "won": "Convertido",
    "paused": "Pausado",
}


def _parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _days_since(value):
    dt = _parse_dt(value)
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return max(0, (datetime.now(timezone.utc) - dt).days)


def _lead_segment(customer):
    valid_orders = int(customer.get("valid_order_count") or 0)
    cancelled_orders = int(customer.get("cancelled_count") or 0)
    total_spent = float(customer.get("total_spent") or 0)
    days = customer.get("days_since_last_order")

    if valid_orders == 0 and cancelled_orders > 0:
        return "cancelled_only"
    if valid_orders >= 5 or total_spent >= 500:
        return "vip"
    if valid_orders <= 1 and (days is None or days <= 14):
        return "new"
    if days is not None and days > 60:
        return "lost"
    if days is not None and days > 30:
        return "at_risk"
    if days is not None and days <= 14:
        return "hot"
    return "active"


def _favorite_items(orders_items):
    counts = {}
    for order_items in orders_items or []:
        for item in order_items or []:
            name = item.get("product_name") or item.get("name")
            if not name:
                continue
            counts[name] = counts.get(name, 0) + int(item.get("quantity") or 1)
    return [
        {"name": name, "quantity": qty}
        for name, qty in sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[:3]
    ]


async def _customer_rows(restaurant_id):
    pipeline = [
        {"$match": {"restaurant_id": restaurant_id, "customer.phone": {"$nin": [None, ""]}}},
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$customer.phone",
            "name": {"$last": "$customer.name"},
            "phone": {"$last": "$customer.phone"},
            "order_count": {"$sum": 1},
            "valid_order_count": {"$sum": {"$cond": [{"$ne": ["$status", "cancelled"]}, 1, 0]}},
            "completed_count": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "cancelled_count": {"$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}},
            "total_spent": {"$sum": {"$cond": [{"$ne": ["$status", "cancelled"]}, "$total", 0]}},
            "last_order_at": {"$max": "$created_at"},
            "first_order_at": {"$min": "$created_at"},
            "last_status": {"$last": "$status"},
            "neighborhoods": {"$addToSet": "$address.neighborhood"},
            "payment_methods": {"$addToSet": "$payment_method"},
            "sources": {"$addToSet": "$source"},
            "items_history": {"$push": "$items"},
        }},
        {"$sort": {"total_spent": -1, "last_order_at": -1}},
    ]
    customers = await db.orders.aggregate(pipeline).to_list(10000)
    phones = [c.get("phone") for c in customers if c.get("phone")]

    lead_profiles = {}
    if phones:
        profiles = await db.customer_leads.find(
            {"restaurant_id": restaurant_id, "phone": {"$in": phones}}, {"_id": 0}
        ).to_list(10000)
        lead_profiles = {p.get("phone"): p for p in profiles}

    loyalty_accounts = {}
    if phones:
        accounts = await db.loyalty_accounts.find(
            {"restaurant_id": restaurant_id, "phone": {"$in": phones}}, {"_id": 0}
        ).to_list(10000)
        loyalty_accounts = {a.get("phone"): a for a in accounts}

    for c in customers:
        total_spent = float(c.get("total_spent") or 0)
        valid_orders = int(c.get("valid_order_count") or 0)
        c["avg_ticket"] = total_spent / valid_orders if valid_orders else 0
        c["days_since_last_order"] = _days_since(c.get("last_order_at"))
        c["segment"] = _lead_segment(c)
        c["segment_label"] = LEAD_SEGMENTS[c["segment"]]["label"]
        c["lead_score"] = min(100, int((valid_orders * 12) + (total_spent / 12)))
        c["favorite_items"] = _favorite_items(c.pop("items_history", []))
        c["neighborhood"] = next((n for n in c.get("neighborhoods") or [] if n), "")
        c["payment_method"] = next((p for p in c.get("payment_methods") or [] if p), "")

        profile = lead_profiles.get(c.get("phone")) or {}
        c["lead_status"] = profile.get("lead_status") or "none"
        c["lead_status_label"] = LEAD_STATUS_LABELS.get(c["lead_status"], c["lead_status"])
        c["lead_notes"] = profile.get("notes") or ""
        c["next_action_at"] = profile.get("next_action_at") or ""
        c["tags"] = profile.get("tags") or []
        c["loyalty_points"] = (loyalty_accounts.get(c.get("phone")) or {}).get("points", 0)

    return customers


def _filter_customers(customers, search="", segment="", lead_status=""):
    rows = customers
    if search:
        s = search.lower()
        rows = [
            c for c in rows
            if s in (c.get("name") or "").lower()
            or s in (c.get("phone") or "")
            or s in (c.get("neighborhood") or "").lower()
        ]
    if segment and segment != "all":
        rows = [c for c in rows if c.get("segment") == segment]
    if lead_status and lead_status != "all":
        rows = [c for c in rows if c.get("lead_status") == lead_status]
    return rows


def _customers_summary(customers):
    return {
        "total": len(customers),
        "vip": sum(1 for c in customers if c.get("segment") == "vip"),
        "hot": sum(1 for c in customers if c.get("segment") == "hot"),
        "at_risk": sum(1 for c in customers if c.get("segment") == "at_risk"),
        "lost": sum(1 for c in customers if c.get("segment") == "lost"),
        "to_contact": sum(1 for c in customers if c.get("lead_status") == "to_contact"),
        "revenue": sum(float(c.get("total_spent") or 0) for c in customers),
    }


@router.get("/customers")
async def list_customers(
    user=Depends(require_restaurant),
    search: str = Query(""),
    segment: str = Query(""),
    lead_status: str = Query(""),
    page: int = Query(1, ge=1),
    per_page: int = Query(30, le=100),
):
    all_customers = await _customer_rows(rid(user))
    summary = _customers_summary(all_customers)
    all_customers = _filter_customers(all_customers, search, segment, lead_status)
    total = len(all_customers)
    skip = (page - 1) * per_page
    return {
        "total": total,
        "pages": math.ceil(total / per_page),
        "page": page,
        "summary": summary,
        "segments": [{"key": k, **v} for k, v in LEAD_SEGMENTS.items()],
        "lead_statuses": [{"key": k, "label": v} for k, v in LEAD_STATUS_LABELS.items()],
        "customers": all_customers[skip:skip + per_page],
    }


@router.get("/customers/export")
async def export_customers(
    user=Depends(require_restaurant),
    search: str = Query(""),
    segment: str = Query(""),
    lead_status: str = Query(""),
):
    rows = _filter_customers(await _customer_rows(rid(user)), search, segment, lead_status)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow([
        "Nome", "Telefone", "Segmento", "Status lead", "Pedidos", "Pedidos validos",
        "Cancelados", "Total gasto", "Ticket medio", "Ultimo pedido", "Dias sem comprar",
        "Bairro", "Forma pagamento", "Itens favoritos", "Observacoes",
    ])
    for c in rows:
        writer.writerow([
            c.get("name") or "",
            c.get("phone") or "",
            c.get("segment_label") or "",
            c.get("lead_status_label") or "",
            c.get("order_count") or 0,
            c.get("valid_order_count") or 0,
            c.get("cancelled_count") or 0,
            f"{float(c.get('total_spent') or 0):.2f}".replace(".", ","),
            f"{float(c.get('avg_ticket') or 0):.2f}".replace(".", ","),
            c.get("last_order_at") or "",
            c.get("days_since_last_order") if c.get("days_since_last_order") is not None else "",
            c.get("neighborhood") or "",
            c.get("payment_method") or "",
            ", ".join(item.get("name") or "" for item in c.get("favorite_items") or []),
            c.get("lead_notes") or "",
        ])
    return PlainTextResponse(
        output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="clientes-leads.csv"'},
    )


@router.get("/customers/{phone}/orders")
async def customer_orders(phone: str, user=Depends(require_restaurant)):
    orders = await db.orders.find(
        {"restaurant_id": rid(user), "customer.phone": phone}, {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return orders


@router.put("/customers/{phone}/lead")
async def update_customer_lead(phone: str, body: dict, user=Depends(require_restaurant)):
    status = body.get("lead_status") or "none"
    if status not in LEAD_STATUS_LABELS:
        raise HTTPException(400, "Status de lead invalido")
    patch = {
        "lead_status": status,
        "notes": str(body.get("notes") or "")[:2000],
        "next_action_at": str(body.get("next_action_at") or "")[:30],
        "tags": [str(tag)[:40] for tag in (body.get("tags") or []) if str(tag).strip()][:10],
        "updated_at": now_iso(),
    }
    await db.customer_leads.update_one(
        {"restaurant_id": rid(user), "phone": phone},
        {"$set": patch, "$setOnInsert": {"restaurant_id": rid(user), "phone": phone, "created_at": now_iso()}},
        upsert=True,
    )
    return {"ok": True, "phone": phone, **patch, "lead_status_label": LEAD_STATUS_LABELS[status]}


# ═══════════════════════════════════════════════════════════════════════════
# PDV — Point of Sale
# ═══════════════════════════════════════════════════════════════════════════

@router.post("/pdv/order")
async def pdv_create_order(data: PDVOrderIn, user=Depends(require_restaurant)):
    restaurant_id = rid(user)
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(404, "Restaurante nao encontrado")
    calculated = await calculate_order(db, restaurant, data.items)
    discount = min(max(money(data.discount), 0), calculated["subtotal"])
    total = money(calculated["subtotal"] - discount)
    order_number = await next_sequence(db, restaurant_id, "order", "orders", "order_number")
    reserved = await reserve_stock(db, restaurant_id, calculated["reservations"])

    loyalty_settings = restaurant.get("loyalty", {})
    points_earned = 0
    if loyalty_settings.get("enabled") and data.customer_phone:
        ppr = loyalty_settings.get("points_per_real", 1.0)
        points_earned = int(total * ppr)

    doc = {
        "id": new_id(),
        "restaurant_id": restaurant_id,
        "order_number": order_number,
        "type": "pickup",
        "source": "pdv",
        "customer": {"name": data.customer_name, "phone": data.customer_phone or ""},
        "items": calculated["items"],
        "subtotal": calculated["subtotal"],
        "delivery_fee": 0.0,
        "discount": discount,
        "total": total,
        "payment_method": data.payment_method,
        "change_for": data.change_for,
        "customer_notes": data.notes,
        "status": "completed",
        "payment_status": "paid",
        "points_earned": points_earned,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    try:
        await db.orders.insert_one(doc)
    except Exception:
        await release_stock(db, restaurant_id, reserved)
        raise
    await enqueue_order_print(restaurant, clean(doc), "created")

    if points_earned > 0:
        await db.loyalty_accounts.update_one(
            {"restaurant_id": restaurant_id, "phone": data.customer_phone},
            {
                "$inc": {"points": points_earned, "total_earned": points_earned},
                "$set": {"name": data.customer_name},
                "$setOnInsert": {
                    "id": new_id(),
                    "total_redeemed": 0,
                    "created_at": now_iso(),
                },
            },
            upsert=True,
        )
    return clean(doc)


@router.get("/pdv/summary")
async def pdv_summary(user=Depends(require_restaurant)):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    orders = await db.orders.find(
        {"restaurant_id": rid(user), "source": "pdv",
         "created_at": {"$gte": today}, "status": {"$ne": "cancelled"}},
        {"_id": 0}
    ).to_list(1000)
    total = sum(o["total"] for o in orders)
    return {
        "orders_today": len(orders),
        "revenue_today": total,
        "by_payment": _group_by(orders, "payment_method"),
    }


def _group_by(items, key):
    result = {}
    for item in items:
        k = item.get(key, "outros")
        result[k] = result.get(k, 0) + item.get("total", 0)
    return result
