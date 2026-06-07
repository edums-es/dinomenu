"""Security-critical order calculations and atomic sequencing."""
import logging
from datetime import datetime, timezone

from fastapi import HTTPException


logger = logging.getLogger(__name__)


def money(value) -> float:
    return round(float(value or 0), 2)


def _parse_datetime(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def _active_coupon(coupon: dict) -> bool:
    now = datetime.now(timezone.utc)
    starts_at = _parse_datetime(coupon.get("starts_at"))
    expires_at = _parse_datetime(coupon.get("expires_at"))
    if starts_at and starts_at.tzinfo is None:
        starts_at = starts_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return not ((starts_at and now < starts_at) or (expires_at and now > expires_at))


async def calculate_order(db, restaurant: dict, requested_items, coupon_code=None) -> dict:
    """Build canonical items and totals exclusively from persisted product data."""
    if not requested_items:
        raise HTTPException(status_code=400, detail="Adicione pelo menos um item ao pedido")

    restaurant_id = restaurant["id"]
    canonical_items = []
    reservations = []
    subtotal = 0.0
    item_count = 0

    for requested in requested_items:
        quantity = int(requested.quantity)
        if quantity < 1 or quantity > 100:
            raise HTTPException(status_code=400, detail="Quantidade de produto invalida")

        product = await db.products.find_one({
            "id": requested.product_id,
            "restaurant_id": restaurant_id,
            "is_available": True,
        })
        if not product:
            raise HTTPException(status_code=400, detail="Produto indisponivel ou invalido")

        if product.get("track_stock") and int(product.get("stock_quantity") or 0) < quantity:
            raise HTTPException(status_code=409, detail=f"Estoque insuficiente para {product['name']}")

        base_price = product.get("promotional_price")
        if base_price is None or float(base_price) <= 0:
            base_price = product.get("price") or 0
        base_price = money(base_price)

        requested_by_group = {}
        for selected in requested.options or []:
            requested_by_group.setdefault(selected.group, []).append(selected)

        canonical_options = []
        options_total = 0.0
        known_groups = {group.get("name"): group for group in product.get("option_groups") or []}
        unknown_groups = set(requested_by_group) - set(known_groups)
        if unknown_groups:
            raise HTTPException(status_code=400, detail="Adicional invalido para o produto")

        for group_name, group in known_groups.items():
            selected = requested_by_group.get(group_name, [])
            min_selected = max(int(group.get("min") or 0), 1 if group.get("required") else 0)
            max_selected = int(group.get("max") or (1 if group.get("type") == "single" else 100))
            if group.get("type") == "single":
                max_selected = 1
            if len(selected) < min_selected or len(selected) > max_selected:
                raise HTTPException(
                    status_code=400,
                    detail=f"Selecao invalida no grupo {group_name}",
                )

            available = {option.get("name"): option for option in group.get("options") or []}
            selected_names = [option.name for option in selected]
            if len(selected_names) != len(set(selected_names)):
                raise HTTPException(status_code=400, detail="Adicional duplicado no pedido")
            for option_name in selected_names:
                option = available.get(option_name)
                if not option:
                    raise HTTPException(status_code=400, detail="Adicional indisponivel ou invalido")
                option_price = money(option.get("price"))
                canonical_options.append({
                    "group": group_name,
                    "name": option_name,
                    "price": option_price,
                })
                options_total += option_price

        item_total = money((base_price + options_total) * quantity)
        subtotal = money(subtotal + item_total)
        item_count += quantity
        canonical_items.append({
            "product_id": product["id"],
            "product_name": product["name"],
            "quantity": quantity,
            "unit_price": base_price,
            "options": canonical_options,
            "notes": (requested.notes or "")[:500],
            "total_price": item_total,
        })
        if product.get("track_stock"):
            reservations.append({"product_id": product["id"], "quantity": quantity})

    coupon = None
    coupon_discount = 0.0
    if coupon_code:
        coupon = await db.coupons.find_one({
            "restaurant_id": restaurant_id,
            "code": str(coupon_code).strip().upper(),
            "is_active": True,
        })
        if not coupon or not _active_coupon(coupon):
            raise HTTPException(status_code=400, detail="Cupom invalido ou expirado")
        if subtotal < money(coupon.get("min_order")):
            raise HTTPException(status_code=400, detail="Pedido nao atingiu o minimo do cupom")
        if coupon.get("usage_limit") and int(coupon.get("used_count") or 0) >= int(coupon["usage_limit"]):
            raise HTTPException(status_code=400, detail="Cupom esgotado")
        if coupon.get("discount_type") == "percent":
            coupon_discount = money(subtotal * min(max(float(coupon.get("discount_value") or 0), 0), 100) / 100)
        else:
            coupon_discount = money(coupon.get("discount_value"))
        coupon_discount = min(coupon_discount, subtotal)

    quantity_discount = 0.0
    min_items = max(int(restaurant.get("quantity_discount_min_items") or 0), 0)
    percent = min(max(float(restaurant.get("quantity_discount_percent") or 0), 0), 100)
    if min_items > 0 and item_count >= min_items and percent > 0:
        quantity_discount = money(subtotal * percent / 100)

    discount = min(money(coupon_discount + quantity_discount), subtotal)

    return {
        "items": canonical_items,
        "subtotal": subtotal,
        "discount": discount,
        "coupon_discount": coupon_discount,
        "quantity_discount": quantity_discount,
        "item_count": item_count,
        "coupon": coupon,
        "reservations": reservations,
    }


async def reserve_stock(db, restaurant_id: str, reservations: list[dict]):
    reserved = []
    for item in reservations:
        result = await db.products.update_one(
            {
                "id": item["product_id"],
                "restaurant_id": restaurant_id,
                "track_stock": True,
                "stock_quantity": {"$gte": item["quantity"]},
            },
            {"$inc": {"stock_quantity": -item["quantity"]}},
        )
        if result.modified_count != 1:
            await release_stock(db, restaurant_id, reserved)
            raise HTTPException(status_code=409, detail="Estoque alterado durante o pedido. Revise o carrinho.")
        reserved.append(item)
    return reserved


async def release_stock(db, restaurant_id: str, reservations: list[dict]):
    for item in reservations:
        await db.products.update_one(
            {"id": item["product_id"], "restaurant_id": restaurant_id, "track_stock": True},
            {"$inc": {"stock_quantity": item["quantity"]}},
        )


async def next_sequence(db, restaurant_id: str, sequence_type: str, collection_name: str, number_field: str) -> int:
    """Return a collision-free, per-restaurant sequence while preserving existing numbers."""
    collection = db[collection_name]
    latest = await collection.find_one(
        {"restaurant_id": restaurant_id},
        {number_field: 1, "_id": 0},
        sort=[(number_field, -1)],
    )
    current_max = int((latest or {}).get(number_field) or 0)
    key = {"restaurant_id": restaurant_id, "type": sequence_type}
    await db.sequences.update_one(key, {"$max": {"value": current_max}}, upsert=True)
    sequence = await db.sequences.find_one_and_update(
        key,
        {"$inc": {"value": 1}},
    )
    return int(sequence["value"])


def log_client_total_mismatch(order, calculated: dict, final_total: float):
    if (
        abs(money(order.subtotal) - calculated["subtotal"]) > 0.01
        or abs(money(order.discount) - calculated["discount"]) > 0.01
        or abs(money(order.total) - money(final_total)) > 0.01
    ):
        logger.warning("Pedido recebido com valores divergentes; valores do servidor foram aplicados")
