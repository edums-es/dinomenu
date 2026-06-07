"""Public (customer-facing) menu endpoints — no auth required."""
import logging
import html
import os
import json
import asyncio
import base64
import hashlib
import hmac
import ipaddress
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import HTMLResponse, JSONResponse

from db import db
from whatsapp import send_whatsapp
from routes_ws import broadcast as ws_broadcast
from models import OrderIn, clean, is_restaurant_open, new_id, now_iso
from order_security import (
    calculate_order,
    log_client_total_mismatch,
    money,
    next_sequence,
    release_stock,
    reserve_stock,
)

router = APIRouter(prefix="/api/public", tags=["public"])
logger = logging.getLogger(__name__)


def _region_from_address(address: dict) -> dict:
    neighborhood = (
        address.get("suburb")
        or address.get("neighbourhood")
        or address.get("quarter")
        or address.get("city_district")
    )
    city = (
        address.get("city")
        or address.get("town")
        or address.get("municipality")
        or address.get("village")
    )
    state = (
        address.get("state_code")
        or (address.get("ISO3166-2-lvl4") or "").split("-")[-1]
        or address.get("state")
    )
    parts = [neighborhood, f"{city}/{state}" if city and state else city or state]
    return {
        "neighborhood": neighborhood,
        "city": city,
        "state": state,
        "region": ", ".join(part for part in parts if part),
    }


def _client_public_ip(request: Request) -> str | None:
    candidates = request.headers.get("x-forwarded-for", "").split(",")
    if request.client:
        candidates.append(request.client.host)
    for candidate in candidates:
        try:
            parsed = ipaddress.ip_address(candidate.strip())
            if parsed.is_global:
                return str(parsed)
        except ValueError:
            continue
    return None


@router.get("/platform-config")
async def public_platform_config():
    from routes_superadmin import get_platform_setting
    app_id = await get_platform_setting("onesignal_app_id", "")
    push_enabled = await get_platform_setting("push_notifications_enabled", "true")
    return {
        "onesignal_app_id": app_id,
        "push_enabled": str(push_enabled).lower() not in ("false", "0", ""),
    }


@router.get("/location")
async def public_location(request: Request, lat: float = None, lon: float = None):
    headers = {
        "Accept-Language": "pt-BR",
        "User-Agent": "DinoMenu/1.0 (https://dinomenu.online)",
    }
    async with httpx.AsyncClient(timeout=7, headers=headers) as client:
        if lat is not None and lon is not None:
            if not -90 <= lat <= 90 or not -180 <= lon <= 180:
                raise HTTPException(status_code=400, detail="Coordenadas invalidas")
            try:
                response = await client.get(
                    "https://nominatim.openstreetmap.org/reverse",
                    params={
                        "format": "jsonv2",
                        "lat": lat,
                        "lon": lon,
                        "addressdetails": 1,
                        "zoom": 18,
                    },
                )
                response.raise_for_status()
                location = _region_from_address(response.json().get("address") or {})
                if location["region"]:
                    return {**location, "source": "gps"}
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("Falha ao resolver localizacao GPS: %s", exc)

        client_ip = _client_public_ip(request)
        if client_ip:
            try:
                response = await client.get(f"https://ipwho.is/{client_ip}")
                response.raise_for_status()
                payload = response.json()
                if payload.get("success", True):
                    city = payload.get("city")
                    state = payload.get("region_code") or payload.get("region")
                    region = f"{city}/{state}" if city and state else city or state
                    if region:
                        return {
                            "neighborhood": None,
                            "city": city,
                            "state": state,
                            "region": region,
                            "source": "ip",
                        }
            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("Falha ao resolver localizacao por IP: %s", exc)

    return {"region": None, "source": None}


async def _get_restaurant_or_404(slug: str):
    r = await db.restaurants.find_one({"slug": slug})
    if not r or r.get("status") == "suspended":
        raise HTTPException(status_code=404, detail="Restaurante nao encontrado")
    return r


def _absolute_url(value: str, request: Request) -> str:
    if not value:
        return ""
    if value.startswith(("http://", "https://")):
        return value
    return str(request.base_url).rstrip("/") + "/" + value.lstrip("/")


def _frontend_base_url(request: Request) -> str:
    configured = os.environ.get("FRONTEND_URL") or os.environ.get("APP_URL")
    if configured:
        return configured.rstrip("/")

    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    if host.startswith("api."):
        host = "app." + host[4:]
    return f"{proto}://{host}".rstrip("/")


@router.get("/restaurants/{slug}/share", response_class=HTMLResponse)
async def restaurant_share_preview(slug: str, request: Request):
    r = await _get_restaurant_or_404(slug)
    name = html.escape(r.get("name") or "Dino Menu")
    description = html.escape(
        r.get("tagline")
        or r.get("description")
        or "Acesse o cardapio digital e faca seu pedido online."
    )
    frontend_base = _frontend_base_url(request)
    image = _absolute_url(r.get("cover_url") or r.get("logo_url") or f"{frontend_base}/dinomenu-share.svg", request)
    url = f"{frontend_base}/loja/{html.escape(slug)}"
    safe_url = html.escape(url, quote=True)
    redirect_url = json.dumps(url)

    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{name}</title>
    <meta name="description" content="{description}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="{name}" />
    <meta property="og:description" content="{description}" />
    <meta property="og:image" content="{html.escape(image)}" />
    <meta property="og:image:secure_url" content="{html.escape(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="600" />
    <meta property="og:url" content="{safe_url}" />
    <meta property="og:site_name" content="Dino Menu" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="{name}" />
    <meta name="twitter:description" content="{description}" />
    <meta name="twitter:image" content="{html.escape(image)}" />
    <meta http-equiv="refresh" content="0;url={safe_url}" />
    <link rel="canonical" href="{safe_url}" />
  </head>
  <body>
    <script>window.location.replace({redirect_url});</script>
    <a href="{safe_url}">Abrir cardapio</a>
  </body>
</html>"""


@router.get("/restaurants/{slug}/identity")
async def get_restaurant_identity(slug: str):
    r = await db.restaurants.find_one(
        {"slug": slug, "status": {"$ne": "suspended"}},
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "slug": 1,
            "logo_url": 1,
            "cover_url": 1,
            "primary_color": 1,
            "secondary_color": 1,
            "button_text_color": 1,
            "menu_text_color": 1,
            "menu_muted_text_color": 1,
            "tagline": 1,
            "description": 1,
        },
    )
    if not r:
        raise HTTPException(status_code=404, detail="Restaurante nao encontrado")
    return JSONResponse(
        r,
        headers={"Cache-Control": "public, max-age=60, stale-while-revalidate=300"},
    )


@router.get("/restaurants/{slug}")
async def get_menu(slug: str, response: Response):
    response.headers["Cache-Control"] = "public, max-age=15, stale-while-revalidate=60"
    r = await _get_restaurant_or_404(slug)
    categories, products, banners, combos, reviews = await asyncio.gather(
        db.categories.find(
            {"restaurant_id": r["id"], "is_active": True}, {"_id": 0}
        ).sort("sort_order", 1).to_list(200),
        db.products.find(
            {"restaurant_id": r["id"]}, {"_id": 0}
        ).sort("sort_order", 1).to_list(1000),
        db.banners.find(
            {"restaurant_id": r["id"], "is_active": True}, {"_id": 0}
        ).sort("sort_order", 1).to_list(50),
        db.combos.find(
            {"restaurant_id": r["id"], "is_active": True}, {"_id": 0}
        ).sort("sort_order", 1).to_list(100),
        db.reviews.find(
            {"restaurant_id": r["id"]}, {"_id": 0}
        ).sort("created_at", -1).to_list(200),
    )
    avg = round(sum(rv["rating"] for rv in reviews) / len(reviews), 1) if reviews else 0
    restaurant = clean(r)
    restaurant["is_open"] = is_restaurant_open(r)
    return {
        "restaurant": restaurant,
        "categories": categories,
        "products": products,
        "banners": banners,
        "combos": combos,
        "reviews": reviews[:20],
        "reviews_summary": {"average": avg, "count": len(reviews)},
    }


@router.post("/restaurants/{slug}/validate-coupon")
async def validate_coupon(slug: str, payload: dict):
    r = await _get_restaurant_or_404(slug)
    code = (payload.get("code") or "").strip().upper()
    subtotal = float(payload.get("subtotal") or 0)
    coupon = await db.coupons.find_one(
        {"restaurant_id": r["id"], "code": code, "is_active": True}
    )
    if not coupon:
        raise HTTPException(status_code=404, detail="Cupom invalido")
    if subtotal < coupon.get("min_order", 0):
        raise HTTPException(
            status_code=400,
            detail=f"Pedido minimo de R$ {coupon['min_order']:.2f} para este cupom",
        )
    if coupon.get("usage_limit") and coupon.get("used_count", 0) >= coupon["usage_limit"]:
        raise HTTPException(status_code=400, detail="Cupom esgotado")
    discount = 0.0
    if coupon["discount_type"] == "percent":
        discount = round(subtotal * coupon["discount_value"] / 100, 2)
    else:
        discount = coupon["discount_value"]
    return {
        "code": coupon["code"],
        "discount_type": coupon["discount_type"],
        "discount_value": coupon["discount_value"],
        "discount": discount,
        "free_delivery": coupon.get("free_delivery", False),
    }


def brl_fmt(value):
    try:
        return f"R$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "R$ 0,00"


def _normalize_text(value: str) -> str:
    import unicodedata
    value = unicodedata.normalize("NFD", value or "")
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    return value.strip().lower()


def _zone_matches_neighborhood(zone_name: str, neighborhood_name: str) -> bool:
    zone = _normalize_text(zone_name)
    neighborhood = _normalize_text(neighborhood_name)
    return bool(
        zone and neighborhood and (
            zone == neighborhood
            or (len(zone) >= 4 and zone in neighborhood)
            or (len(neighborhood) >= 4 and neighborhood in zone)
        )
    )


def _split_terms(value):
    if isinstance(value, list):
        return value
    return str(value or "").split(",")


def _zone_matches_cep(zone: dict, cep_digits: str) -> bool:
    import re
    prefixes = [re.sub(r"\D", "", p or "") for p in _split_terms(zone.get("cep_prefixes"))]
    return any(prefix and cep_digits.startswith(prefix) for prefix in prefixes)


def _zone_matches_address(zone: dict, address_data: dict, cep_digits: str = "") -> bool:
    neighborhood_name = (address_data or {}).get("bairro") or ""
    city_name = (address_data or {}).get("localidade") or ""
    street_name = (address_data or {}).get("logradouro") or ""
    terms = [zone.get("neighborhood"), *_split_terms(zone.get("aliases"))]
    city_terms = _split_terms(zone.get("city_names"))
    return (
        any(
            _zone_matches_neighborhood(term, value)
            for term in terms
            for value in (neighborhood_name, city_name, street_name)
        )
        or any(_zone_matches_neighborhood(term, city_name) for term in city_terms)
        or _zone_matches_cep(zone, cep_digits)
    )


async def _lookup_cep(cep: str) -> dict:
    import re
    import httpx as _httpx

    digits = re.sub(r"\D", "", cep or "")
    if len(digits) != 8:
        raise HTTPException(status_code=400, detail="Informe um CEP valido para entrega")

    try:
        async with _httpx.AsyncClient(timeout=6) as client:
            resp = await client.get(f"https://viacep.com.br/ws/{digits}/json/")
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Nao foi possivel validar o CEP")
        data = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Nao foi possivel validar o CEP")

    if data.get("erro"):
        raise HTTPException(status_code=400, detail="CEP nao encontrado")
    data["digits"] = digits
    return data


async def _expected_delivery_fee(restaurant: dict, order: OrderIn):
    if order.type != "delivery":
        return 0.0

    if restaurant.get("accepts_delivery") is False:
        raise HTTPException(status_code=400, detail="Restaurante nao aceita entrega")

    return float(restaurant.get("flat_delivery_fee") or 0)


async def _notify_new_order(restaurant: dict, order: dict, order_in=None, pix_via_openpix: bool = False, order_number: int = None):
    """Envia WhatsApp ao dono quando novo pedido chega (ou e pago via Pix)."""
    try:
        from datetime import timedelta
        owner_phone = restaurant.get("whatsapp") or restaurant.get("phone")
        if not owner_phone:
            return

        br_tz = timezone(timedelta(hours=-3))
        dt_str = datetime.now(br_tz).strftime("%d/%m/%Y %H:%M")
        num = order_number or order.get("order_number", "?")

        if order_in:
            # Chamado diretamente de create_order (Pydantic object disponivel)
            items_lines = []
            for it in order_in.items:
                items_lines.append(f"  {it.quantity}x {it.product_name} - {brl_fmt(it.total_price)}")
                for op in (it.options or []):
                    items_lines.append(f"    + {op.name}")
            items_text = "\n".join(items_lines)
            order_type = order_in.type
            if order_type == "delivery" and order_in.address:
                a = order_in.address
                ln = f"  {a.street}, {a.number}"
                if a.complement: ln += f" ({a.complement})"
                addr_parts = [ln]
                if a.neighborhood: addr_parts.append(f"  {a.neighborhood}")
                address_text = "\n*Endereco:*\n" + "\n".join(addr_parts)
            else:
                address_text = ""
            pm = (order_in.payment_method or "").strip()
            subtotal = order_in.subtotal
            delivery_fee = order_in.delivery_fee
            total = order_in.total
            customer_name = order_in.customer.name
            customer_phone = order_in.customer.phone
        else:
            # Chamado do webhook/check-pix: le do documento persistido
            raw_items = order.get("items") or []
            logger.info(f"[notify_order] items={len(raw_items)} subtotal={order.get('subtotal')} total={order.get('total')}")
            items_lines = []
            for it in raw_items:
                qty = it.get("quantity", 1)
                name = it.get("product_name") or it.get("name", "?")
                price = it.get("total_price") or it.get("unit_price", 0)
                items_lines.append(f"  {qty}x {name} - {brl_fmt(price)}")
                for op in (it.get("options") or []):
                    op_name = op.get("name", "") if isinstance(op, dict) else str(op)
                    if op_name: items_lines.append(f"    + {op_name}")
            items_text = "\n".join(items_lines) if items_lines else "(itens nao disponiveis)"
            order_type = order.get("type", "delivery")
            addr = order.get("address") or {}
            if order_type == "delivery" and addr:
                ln = f"  {addr.get('street','')}, {addr.get('number','')}"
                if addr.get("complement"): ln += f" ({addr['complement']})"
                address_text = f"\n*Endereco:*\n{ln}"
                if addr.get("neighborhood"): address_text += f"\n  {addr['neighborhood']}"
            else:
                address_text = ""
            pm = order.get("payment_method", "")
            subtotal = order.get("subtotal") or 0
            delivery_fee = order.get("delivery_fee") or 0
            total = order.get("total") or 0
            cust = order.get("customer") or {}
            customer_name = cust.get("name", "")
            customer_phone = cust.get("phone", "")

        delivery_type = "Entrega" if order_type == "delivery" else "Retirada"
        pm_lower = pm.lower()
        if "pix" in pm_lower:
            payment_label = "Pix pago automatico Openpix" if pix_via_openpix else "Pix aguardando comprovante"
        elif pm_lower == "dinheiro":
            payment_label = "Dinheiro"
        elif "credito" in pm_lower:
            payment_label = "Cartao de credito"
        elif "debito" in pm_lower:
            payment_label = "Cartao de debito"
        elif "vale" in pm_lower:
            payment_label = "Vale refeicao"
        else:
            payment_label = pm if pm else "Nao informado"

        sep = "--------------------"
        entrega_line = f"Entrega: {brl_fmt(delivery_fee)}\n" if order_type == "delivery" else ""
        msg = (
            f"*NOVO PEDIDO #{num}*\n"
            f"Data: {dt_str}\n"
            f"{sep}\n"
            f"*Cliente:* {customer_name}\n"
            f"*Telefone:* {customer_phone}\n"
            f"*Tipo:* {delivery_type}"
            f"{address_text}\n"
            f"{sep}\n"
            f"*Itens:*\n{items_text}\n"
            f"{sep}\n"
            f"Subtotal: {brl_fmt(subtotal)}\n"
            f"{entrega_line}"
            f"*TOTAL: {brl_fmt(total)}*\n"
            f"*Pagamento:* {payment_label}\n"
            f"{sep}"
        )
        await send_whatsapp(restaurant, owner_phone, msg)
    except Exception as exc:
        logger.error(f"_notify_new_order falhou: {exc}", exc_info=True)


async def _push_onesignal(restaurant_id: str, order_number: int, title: str):
    import httpx as _httpx
    from routes_superadmin import get_platform_setting
    app_id = await get_platform_setting("onesignal_app_id")
    api_key = await get_platform_setting("onesignal_api_key")
    if not app_id or not api_key:
        return
    try:
        async with _httpx.AsyncClient(timeout=5) as client:
            await client.post(
                "https://onesignal.com/api/v1/notifications",
                headers={"Authorization": f"Basic {api_key}", "Content-Type": "application/json"},
                json={
                    "app_id": app_id,
                    "filters": [{"field": "tag", "key": "restaurant_id", "relation": "=", "value": restaurant_id}],
                    "headings": {"pt": title},
                    "contents": {"pt": f"Pedido #{order_number} aguardando confirmacao"},
                    "priority": 10,
                },
            )
    except Exception:
        pass


@router.post("/restaurants/{slug}/orders")
async def create_order(slug: str, order: OrderIn):
    r = await _get_restaurant_or_404(slug)
    if not is_restaurant_open(r):
        raise HTTPException(status_code=400, detail="Loja fechada no momento")
    if order.type == "pickup" and r.get("accepts_pickup") is False:
        raise HTTPException(status_code=400, detail="Restaurante nao aceita retirada")

    calculated = await calculate_order(db, r, order.items, order.coupon_code)
    if calculated["subtotal"] < money(r.get("minimum_order")):
        raise HTTPException(
            status_code=400,
            detail=f"Pedido minimo de R$ {money(r.get('minimum_order')):.2f}",
        )

    expected_fee = await _expected_delivery_fee(r, order)
    if calculated["coupon"] and calculated["coupon"].get("free_delivery"):
        expected_fee = 0.0
    expected_fee = money(expected_fee)
    final_total = money(calculated["subtotal"] + expected_fee - calculated["discount"])
    log_client_total_mismatch(order, calculated, final_total)

    order_number = await next_sequence(db, r["id"], "order", "orders", "order_number")
    doc = order.model_dump(exclude={"items", "subtotal", "delivery_fee", "discount", "total"})
    doc.update({
        "id": new_id(),
        "restaurant_id": r["id"],
        "items": calculated["items"],
        "subtotal": calculated["subtotal"],
        "delivery_fee": expected_fee,
        "discount": calculated["discount"],
        "total": final_total,
        "customer_phone_suffix": "".join(ch for ch in (order.customer.phone or "") if ch.isdigit())[-8:],
        "order_number": order_number,
        "status": "pending",
        "payment_status": "pending",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    reserved = await reserve_stock(db, r["id"], calculated["reservations"])
    try:
        await db.orders.insert_one(doc)
    except Exception:
        await release_stock(db, r["id"], reserved)
        raise

    import asyncio

    if calculated["coupon"]:
        await db.coupons.update_one(
            {"id": calculated["coupon"]["id"], "restaurant_id": r["id"]},
            {"$inc": {"used_count": 1}},
        )

    loyalty_cfg = r.get("loyalty", {})
    if loyalty_cfg.get("enabled") and order.customer.phone:
        ppr = loyalty_cfg.get("points_per_real", 1.0)
        pts = int(final_total * ppr)
        if pts > 0:
            acc = await db.loyalty_accounts.find_one({"restaurant_id": r["id"], "phone": order.customer.phone})
            if acc:
                await db.loyalty_accounts.update_one(
                    {"restaurant_id": r["id"], "phone": order.customer.phone},
                    {"$inc": {"points": pts, "total_earned": pts}, "$set": {"name": order.customer.name}},
                )
            else:
                await db.loyalty_accounts.insert_one({
                    "id": new_id(), "restaurant_id": r["id"],
                    "phone": order.customer.phone, "name": order.customer.name,
                    "points": pts, "total_earned": pts, "total_redeemed": 0,
                    "created_at": now_iso(),
                })

    # ── Tenta gerar cobrança OpenPix ─────────────────────────────────────────
    pix_charge = None
    openpix_app_id = (r.get("openpix_app_id") or "").strip()
    is_pix_auto = openpix_app_id and "pix" in order.payment_method.lower()

    if is_pix_auto:
        try:
            import httpx as _httpx
            async with _httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://api.openpix.com.br/api/v1/charge",
                    headers={"Authorization": openpix_app_id, "Content-Type": "application/json"},
                    json={
                        "correlationID": doc["id"],
                        "value": int(round(final_total * 100)),
                        "comment": f"Pedido #{order_number} - {r.get('name', '')}",
                        "customer": {
                            "name": order.customer.name,
                            "phone": order.customer.phone or "",
                        },
                    },
                )
            logger.info(f"[OpenPix] status={resp.status_code} body={resp.text[:300]}")
            if resp.status_code in (200, 201):
                body = resp.json()
                charge = body.get("charge") or body
                qr_img = charge.get("qrCodeImage") or ""
                if qr_img.startswith("data:"):
                    qr_img = qr_img.split(",", 1)[-1]
                br_code = charge.get("brCode") or charge.get("brcode") or ""
                if br_code:
                    pix_charge = {
                        "qr_code_image": qr_img,
                        "br_code": br_code,
                        "correlation_id": charge.get("correlationID") or doc["id"],
                        "status": charge.get("status", "ACTIVE"),
                    }
                    await db.orders.update_one(
                        {"id": doc["id"], "restaurant_id": r["id"]},
                        {"$set": {"pix_charge": pix_charge, "payment_status": "awaiting"}},
                    )
            else:
                logger.error(f"[OpenPix] erro {resp.status_code}: {resp.text[:300]}")
        except Exception as _e:
            logger.error(f"[OpenPix] excecao: {_e}", exc_info=True)

    if is_pix_auto and pix_charge:
        # Pix automático: aguarda confirmação do webhook para notificar restaurante
        # Apenas sinaliza que o pedido existe (sem notificar ainda)
        logger.info(f"[OpenPix] Pedido {doc['id']} aguardando pagamento — restaurante sera notificado apos confirmacao")
    else:
        # Pagamento manual (dinheiro, cartao, pix manual): notifica imediatamente
        asyncio.create_task(ws_broadcast(r["id"], "new_order", {"order_number": order_number, "id": doc["id"]}))
        asyncio.create_task(_push_onesignal(r["id"], order_number, f"Novo pedido #{order_number}!"))
        asyncio.create_task(_notify_new_order(r, clean(doc), OrderIn.model_validate(doc), pix_via_openpix=False))

    result = clean(doc)
    if pix_charge:
        result["pix_charge"] = pix_charge
    return result


@router.post("/openpix/webhook")
async def openpix_webhook(request: Request):
    """Accept a paid-charge event only after HMAC/API verification."""
    try:
        raw_body = await request.body()
        payload = json.loads(raw_body)
    except Exception:
        return JSONResponse({"ok": False}, status_code=400)

    webhook_secret = os.environ.get("OPENPIX_WEBHOOK_SECRET", "").strip()
    if webhook_secret:
        received = request.headers.get("X-OpenPix-Signature", "")
        expected = base64.b64encode(
            hmac.new(webhook_secret.encode(), raw_body, hashlib.sha1).digest()
        ).decode()
        if not received or not hmac.compare_digest(received, expected):
            logger.warning("[OpenPix Webhook] assinatura HMAC invalida")
            return JSONResponse({"ok": False}, status_code=401)

    event = payload.get("event", "")
    logger.info(f"[OpenPix Webhook] event={event} payload_keys={list(payload.keys())}")

    if event != "OPENPIX:CHARGE_COMPLETED":
        return JSONResponse({"ok": True})

    charge = payload.get("charge") or payload.get("transaction") or {}
    correlation_id = charge.get("correlationID") or charge.get("correlationId") or ""

    if not correlation_id:
        logger.warning("[OpenPix Webhook] evento sem correlationID")
        return JSONResponse({"ok": True})

    order = await db.orders.find_one({"id": correlation_id}, {"_id": 0})
    if not order:
        logger.warning(f"[OpenPix Webhook] pedido nao encontrado: {correlation_id}")
        return JSONResponse({"ok": True})

    restaurant = await db.restaurants.find_one({"id": order["restaurant_id"]}, {"_id": 0})
    if not restaurant or not await _openpix_charge_is_paid(order, restaurant):
        logger.warning(f"[OpenPix Webhook] cobranca nao confirmada para pedido {correlation_id}")
        return JSONResponse({"ok": False}, status_code=409)

    updated = await db.orders.update_one(
        {"id": correlation_id, "restaurant_id": order["restaurant_id"], "payment_status": {"$ne": "paid"}},
        {"$set": {"payment_status": "paid", "status": "accepted", "updated_at": now_iso()}},
    )
    if updated.modified_count != 1:
        return JSONResponse({"ok": True})
    logger.info(f"[OpenPix Webhook] pedido {correlation_id} PAGO — notificando restaurante")

    order_number = order.get("order_number", "?")

    # Agora sim notifica o restaurante (pedido confirmado e pago)
    import asyncio
    asyncio.create_task(ws_broadcast(
        order["restaurant_id"], "new_order",
        {"order_number": order_number, "id": order["id"], "payment_status": "paid"},
    ))
    asyncio.create_task(_push_onesignal(order["restaurant_id"], order_number, f"Pix confirmado! Pedido #{order_number}"))

    if restaurant:
        updated_order = await db.orders.find_one({"id": correlation_id}, {"_id": 0})
        asyncio.create_task(_notify_new_order(restaurant, updated_order, pix_via_openpix=True, order_number=order_number))
        # Notifica cliente via WhatsApp que pedido foi aceito
        from whatsapp import notify_order_status
        asyncio.create_task(notify_order_status(updated_order, "accepted"))

    return JSONResponse({"ok": True})


async def _openpix_charge_is_paid(order: dict, restaurant: dict) -> bool:
    """Confirm charge status and amount directly with OpenPix."""
    openpix_app_id = (restaurant.get("openpix_app_id") or "").strip()
    correlation_id = (order.get("pix_charge") or {}).get("correlation_id") or order["id"]
    if not openpix_app_id:
        return False
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                f"https://api.openpix.com.br/api/v1/charge/{correlation_id}",
                headers={"Authorization": openpix_app_id},
            )
        if response.status_code != 200:
            return False
        body = response.json()
        charge = body.get("charge") or body
        expected_value = int(round(money(order.get("total")) * 100))
        return (
            charge.get("status") in ("COMPLETED", "ACTIVE_PAID", "PAID")
            and (charge.get("correlationID") or correlation_id) == correlation_id
            and int(charge.get("value") or -1) == expected_value
        )
    except Exception as exc:
        logger.error(f"[OpenPix] falha ao confirmar cobranca: {exc}")
        return False


@router.get("/orders/{order_id}")
async def track_order(order_id: str):
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")
    r = await db.restaurants.find_one(
        {"id": o["restaurant_id"]},
        {"name": 1, "slug": 1, "logo_url": 1, "primary_color": 1, "phone": 1, "whatsapp": 1, "_id": 0},
    )
    customer = o.get("customer") or {}
    return {
        "id": o["id"],
        "order_number": o["order_number"],
        "status": o["status"],
        "payment_status": o.get("payment_status", "pending"),
        "created_at": o.get("created_at"),
        "updated_at": o.get("updated_at"),
        "customer": customer,
        "customer_name": customer.get("name", ""),
        "items": o.get("items", []),
        "subtotal": o.get("subtotal", 0),
        "delivery_fee": o.get("delivery_fee", 0),
        "discount": o.get("discount", 0),
        "total": o.get("total", 0),
        "type": o.get("type", "delivery"),
        "address": o.get("address"),
        "payment_method": o.get("payment_method"),
        "customer_notes": o.get("customer_notes"),
        "restaurant": {
            "name": r.get("name", "") if r else "",
            "slug": r.get("slug", "") if r else "",
            "logo_url": r.get("logo_url") if r else None,
            "primary_color": r.get("primary_color", "#6B7280") if r else "#6B7280",
            "phone": r.get("phone") if r else None,
            "whatsapp": r.get("whatsapp") if r else None,
        },
    }



@router.get("/orders/{order_id}/check-pix")
async def check_pix_payment(order_id: str):
    """Verifica ativamente na OpenPix se o pagamento foi feito (fallback sem webhook)."""
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(status_code=404, detail="Pedido nao encontrado")

    payment_status = o.get("payment_status", "pending")
    if payment_status == "paid":
        return {"payment_status": "paid", "order_status": o.get("status")}

    pix_charge = o.get("pix_charge")
    if not pix_charge:
        return {"payment_status": payment_status, "order_status": o.get("status")}

    restaurant = await db.restaurants.find_one({"id": o["restaurant_id"]}, {"_id": 0})
    openpix_app_id = (restaurant.get("openpix_app_id") or "").strip() if restaurant else ""
    if not openpix_app_id:
        return {"payment_status": payment_status, "order_status": o.get("status")}

    correlation_id = pix_charge.get("correlation_id") or order_id
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"https://api.openpix.com.br/api/v1/charge/{correlation_id}",
                headers={"Authorization": openpix_app_id},
            )
        logger.info(f"[check-pix] order={order_id} status={resp.status_code}")
        if resp.status_code == 200:
            body = resp.json()
            charge = body.get("charge") or body
            charge_status = charge.get("status", "")
            paid_statuses = ["COMPLETED", "ACTIVE_PAID", "PAID"]
            expected_value = int(round(money(o.get("total")) * 100))
            if (
                charge_status in paid_statuses
                and (charge.get("correlationID") or correlation_id) == correlation_id
                and int(charge.get("value") or -1) == expected_value
            ):
                import asyncio
                updated_result = await db.orders.update_one(
                    {"id": order_id, "restaurant_id": o["restaurant_id"], "payment_status": {"$ne": "paid"}},
                    {"$set": {"payment_status": "paid", "status": "accepted", "updated_at": now_iso()}},
                )
                if updated_result.modified_count != 1:
                    return {"payment_status": "paid", "order_status": o.get("status")}
                order_number = o.get("order_number", "?")
                asyncio.create_task(ws_broadcast(
                    o["restaurant_id"], "new_order",
                    {"order_number": order_number, "id": order_id, "payment_status": "paid"},
                ))
                asyncio.create_task(_push_onesignal(
                    o["restaurant_id"], order_number, f"Pix confirmado! Pedido #{order_number}"
                ))
                if restaurant:
                    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
                    asyncio.create_task(_notify_new_order(
                        restaurant, updated, pix_via_openpix=True, order_number=order_number
                    ))
                    from whatsapp import notify_order_status
                    asyncio.create_task(notify_order_status(updated, "accepted"))
                return {"payment_status": "paid", "order_status": "accepted"}
    except Exception as e:
        logger.error(f"[check-pix] erro: {e}")

    return {"payment_status": payment_status, "order_status": o.get("status")}


@router.get("/track")
async def track_by_phone(phone: str, slug: str = None):
    import re as _re
    raw = _re.sub(r"\D", "", phone)
    if not raw:
        raise HTTPException(400, "Telefone invalido")
    # Usa os ultimos 8 digitos mas com regex que tolera formatacao
    # Ex: busca "96717081" mas o banco tem "(27) 99671-7081" com traço e espacos
    suffix = raw[-8:]
    digit_pattern = "[^0-9]*".join(list(suffix))
    query = {"customer_phone_suffix": suffix}
    slug_restaurant = None
    if slug:
        slug_restaurant = await db.restaurants.find_one(
            {"slug": slug}, {"id": 1, "name": 1, "slug": 1, "_id": 0}
        )
        if not slug_restaurant:
            return []
        query["restaurant_id"] = slug_restaurant["id"]
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(20)
    if not orders:
        legacy_query = {"customer.phone": {"$regex": digit_pattern}}
        if query.get("restaurant_id"):
            legacy_query["restaurant_id"] = query["restaurant_id"]
        orders = await db.orders.find(legacy_query, {"_id": 0}).sort("created_at", -1).to_list(20)
        if orders:
            await db.orders.update_many(
                {"id": {"$in": [o["id"] for o in orders]}},
                {"$set": {"customer_phone_suffix": suffix}},
            )

    restaurants = {}
    if slug_restaurant:
        restaurants[slug_restaurant["id"]] = slug_restaurant
    elif orders:
        restaurant_ids = list({o["restaurant_id"] for o in orders})
        restaurant_docs = await db.restaurants.find(
            {"id": {"$in": restaurant_ids}},
            {"id": 1, "name": 1, "slug": 1, "_id": 0},
        ).to_list(len(restaurant_ids))
        restaurants = {r["id"]: r for r in restaurant_docs}

    result = []
    for o in orders:
        r = restaurants.get(o["restaurant_id"])
        result.append({
            "id": o["id"],
            "order_number": o["order_number"],
            "status": o["status"],
            "created_at": o.get("created_at"),
            "total": o.get("total", 0),
            "type": o.get("type", "delivery"),
            "items": o.get("items", []),
            "restaurant_name": r["name"] if r else "",
            "restaurant_slug": r["slug"] if r else "",
            "payment_method": o.get("payment_method", ""),
        })
    return result


@router.post("/restaurants/{slug}/reviews")
async def submit_review(slug: str, payload: dict):
    r = await _get_restaurant_or_404(slug)
    rating = int(payload.get("rating", 5))
    comment = (payload.get("comment") or "").strip()
    customer_name = (payload.get("customer_name") or "Cliente").strip()
    if not 1 <= rating <= 5:
        raise HTTPException(400, "Rating deve ser entre 1 e 5")
    doc = {
        "id": new_id(),
        "restaurant_id": r["id"],
        "rating": rating,
        "comment": comment,
        "customer_name": customer_name,
        "created_at": now_iso(),
    }
    await db.reviews.insert_one(doc)
    return clean(doc)
