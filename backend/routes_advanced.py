"""Advanced systems: Caixa, Order Tracking, Scheduled Orders, Suppliers, QR Tables."""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from db import db
from auth import require_restaurant
from models import clean, new_id, now_iso

router = APIRouter(prefix="/api/admin", tags=["advanced"])
public_router = APIRouter(prefix="/api/public", tags=["advanced-public"])


def rid(user):
    return user["restaurant_id"]


def table_number_values(value):
    text = str(value).strip()
    values = [text]
    if text.isdigit():
        values.append(int(text))
    return values


# ═══════════════════════════════════════════════════════════════════════════
# 1. CONTROLE DE CAIXA
# ═══════════════════════════════════════════════════════════════════════════

class CaixaAbrirIn(BaseModel):
    opening_amount: float = 0.0

class CaixaFecharIn(BaseModel):
    closing_amount: Optional[float] = None
    notes: Optional[str] = None

class MovimentoIn(BaseModel):
    amount: float
    description: Optional[str] = ""
    reason: Optional[str] = None   # alias enviado pelo frontend
    type: Optional[str] = None     # hardcoded pelo endpoint, não obrigatório

    @property
    def motivo(self) -> str:
        return self.description or self.reason or ""


async def _get_caixa_aberto(restaurant_id: str):
    return await db.caixa_sessions.find_one(
        {"restaurant_id": restaurant_id, "status": "open"}, {"_id": 0}
    )


@router.post("/caixa/abrir")
async def abrir_caixa(data: CaixaAbrirIn, user=Depends(require_restaurant)):
    existing = await _get_caixa_aberto(rid(user))
    if existing:
        raise HTTPException(400, "Já existe um caixa aberto. Feche-o antes de abrir outro.")
    doc = {
        "id": new_id(),
        "restaurant_id": rid(user),
        "opened_at": now_iso(),
        "closed_at": None,
        "opening_amount": data.opening_amount,
        "closing_amount": None,
        "status": "open",
        "total_sales": 0.0,
        "movements": [],
        "notes": None,
    }
    await db.caixa_sessions.insert_one(doc)
    return clean(doc)


@router.post("/caixa/fechar")
async def fechar_caixa(data: CaixaFecharIn, user=Depends(require_restaurant)):
    session = await _get_caixa_aberto(rid(user))
    if not session:
        raise HTTPException(404, "Nenhum caixa aberto encontrado.")

    # Busca pedidos completados durante a sessão
    opened_at = session["opened_at"]
    orders = await db.orders.find(
        {
            "restaurant_id": rid(user),
            "status": {"$in": ["completed", "ready", "out_for_delivery"]},
            "created_at": {"$gte": opened_at},
        },
        {"_id": 0},
    ).to_list(10000)

    total_sales = sum(o.get("total", 0) for o in orders)

    # Totais por forma de pagamento
    payment_totals: dict = {}
    for o in orders:
        pm = o.get("payment_method", "outros")
        payment_totals[pm] = round(payment_totals.get(pm, 0) + o.get("total", 0), 2)

    closed_at = now_iso()
    await db.caixa_sessions.update_one(
        {"id": session["id"], "restaurant_id": rid(user)},
        {
            "$set": {
                "closed_at": closed_at,
                "closing_amount": data.closing_amount,
                "status": "closed",
                "total_sales": round(total_sales, 2),
                "payment_totals": payment_totals,
                "orders_count": len(orders),
                "notes": data.notes,
            }
        },
    )
    updated = await db.caixa_sessions.find_one(
        {"id": session["id"], "restaurant_id": rid(user)}, {"_id": 0}
    )
    return clean(updated)


@router.get("/caixa/atual")
async def caixa_atual(user=Depends(require_restaurant)):
    session = await _get_caixa_aberto(rid(user))
    if not session:
        raise HTTPException(404, "Nenhum caixa aberto.")
    return session


@router.get("/caixa/historico")
async def caixa_historico(user=Depends(require_restaurant)):
    sessions = await db.caixa_sessions.find(
        {"restaurant_id": rid(user)}, {"_id": 0}
    ).sort("opened_at", -1).to_list(200)
    return sessions


@router.post("/caixa/sangria")
async def sangria(data: MovimentoIn, user=Depends(require_restaurant)):
    session = await _get_caixa_aberto(rid(user))
    if not session:
        raise HTTPException(404, "Nenhum caixa aberto.")
    mov = {
        "id": new_id(),
        "type": "sangria",
        "amount": data.amount,
        "description": data.motivo,
        "created_at": now_iso(),
    }
    await db.caixa_sessions.update_one(
        {"id": session["id"], "restaurant_id": rid(user)}, {"$push": {"movements": mov}}
    )
    return mov


@router.post("/caixa/suprimento")
async def suprimento(data: MovimentoIn, user=Depends(require_restaurant)):
    session = await _get_caixa_aberto(rid(user))
    if not session:
        raise HTTPException(404, "Nenhum caixa aberto.")
    mov = {
        "id": new_id(),
        "type": "suprimento",
        "amount": data.amount,
        "description": data.motivo,
        "created_at": now_iso(),
    }
    await db.caixa_sessions.update_one(
        {"id": session["id"], "restaurant_id": rid(user)}, {"$push": {"movements": mov}}
    )
    return mov


@router.get("/caixa/movimentos")
async def caixa_movimentos(user=Depends(require_restaurant)):
    session = await _get_caixa_aberto(rid(user))
    if not session:
        raise HTTPException(404, "Nenhum caixa aberto.")
    return session.get("movements", [])


# ═══════════════════════════════════════════════════════════════════════════
# 2. RASTREAMENTO DE PEDIDO (público)
# ═══════════════════════════════════════════════════════════════════════════

_STATUS_LABELS = {
    "pending": "Pedido recebido",
    "accepted": "Pedido aceito",
    "preparing": "Em preparo",
    "ready": "Pronto",
    "out_for_delivery": "Saiu para entrega",
    "completed": "Entregue",
    "cancelled": "Cancelado",
}

_STATUS_ORDER = ["pending", "accepted", "preparing", "ready", "out_for_delivery", "completed"]


def _build_timeline(current_status: str) -> list:
    timeline = []
    try:
        current_idx = _STATUS_ORDER.index(current_status)
    except ValueError:
        current_idx = -1

    for idx, status in enumerate(_STATUS_ORDER):
        timeline.append({
            "status": status,
            "label": _STATUS_LABELS.get(status, status),
            "done": idx <= current_idx,
            "active": idx == current_idx,
        })
    return timeline


@public_router.get("/track/{order_id}")
async def track_order_detail(order_id: str):
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido não encontrado.")

    r = await db.restaurants.find_one({"id": o.get("restaurant_id")}, {"_id": 0})
    restaurant_name = r["name"] if r else ""

    items_simple = [
        {"name": it.get("product_name", ""), "quantity": it.get("quantity", 1)}
        for it in (o.get("items") or [])
    ]

    return {
        "id": o["id"],
        "order_number": o.get("order_number"),
        "status": o.get("status"),
        "created_at": o.get("created_at"),
        "updated_at": o.get("updated_at"),
        "items": items_simple,
        "restaurant_name": restaurant_name,
        "type": o.get("type"),
        "customer_name": (o.get("customer") or {}).get("name", ""),
        "scheduled_for": o.get("scheduled_for"),
    }


@public_router.get("/track/{order_id}/timeline")
async def track_order_timeline(order_id: str):
    o = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not o:
        raise HTTPException(404, "Pedido não encontrado.")
    return {"status": o.get("status"), "timeline": _build_timeline(o.get("status", "pending"))}


# ═══════════════════════════════════════════════════════════════════════════
# 3. PEDIDOS AGENDADOS
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/scheduled-orders")
async def list_scheduled_orders(user=Depends(require_restaurant)):
    orders = await db.orders.find(
        {
            "restaurant_id": rid(user),
            "scheduled_for": {"$ne": None, "$exists": True},
            "status": {"$in": ["pending", "accepted"]},
        },
        {"_id": 0},
    ).sort("scheduled_for", 1).to_list(500)
    return orders


# ═══════════════════════════════════════════════════════════════════════════
# 4. FORNECEDORES
# ═══════════════════════════════════════════════════════════════════════════

class SupplierIn(BaseModel):
    name: str
    contact_name: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    cnpj: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    product_ids: List[str] = []


class PurchaseItemIn(BaseModel):
    product_id: str
    quantity: int
    unit_cost: float


class PurchaseIn(BaseModel):
    items: List[PurchaseItemIn]
    total_cost: float
    notes: Optional[str] = ""


@router.get("/suppliers")
async def list_suppliers(user=Depends(require_restaurant)):
    return await db.suppliers.find(
        {"restaurant_id": rid(user)}, {"_id": 0}
    ).sort("name", 1).to_list(500)


@router.post("/suppliers")
async def create_supplier(data: SupplierIn, user=Depends(require_restaurant)):
    doc = data.model_dump()
    doc.update({"id": new_id(), "restaurant_id": rid(user), "created_at": now_iso()})
    await db.suppliers.insert_one(doc)
    return clean(doc)


@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, data: SupplierIn, user=Depends(require_restaurant)):
    existing = await db.suppliers.find_one({"id": supplier_id, "restaurant_id": rid(user)})
    if not existing:
        raise HTTPException(404, "Fornecedor não encontrado.")
    updates = data.model_dump()
    updates["updated_at"] = now_iso()
    await db.suppliers.update_one(
        {"id": supplier_id, "restaurant_id": rid(user)}, {"$set": updates}
    )
    return clean(await db.suppliers.find_one(
        {"id": supplier_id, "restaurant_id": rid(user)}, {"_id": 0}
    ))


@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, user=Depends(require_restaurant)):
    result = await db.suppliers.delete_one({"id": supplier_id, "restaurant_id": rid(user)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Fornecedor não encontrado.")
    return {"ok": True}


@router.post("/suppliers/{supplier_id}/purchase")
async def register_purchase(supplier_id: str, data: PurchaseIn, user=Depends(require_restaurant)):
    supplier = await db.suppliers.find_one({"id": supplier_id, "restaurant_id": rid(user)})
    if not supplier:
        raise HTTPException(404, "Fornecedor não encontrado.")

    # Incrementa estoque de cada produto
    for item in data.items:
        prod = await db.products.find_one({"id": item.product_id, "restaurant_id": rid(user)})
        if prod:
            new_qty = (prod.get("stock_quantity") or 0) + item.quantity
            await db.products.update_one(
                {"id": item.product_id, "restaurant_id": rid(user)},
                {"$set": {"stock_quantity": new_qty, "track_stock": True}},
            )

    purchase_doc = {
        "id": new_id(),
        "restaurant_id": rid(user),
        "supplier_id": supplier_id,
        "supplier_name": supplier["name"],
        "items": [i.model_dump() for i in data.items],
        "total_cost": data.total_cost,
        "notes": data.notes,
        "created_at": now_iso(),
    }
    await db.purchases.insert_one(purchase_doc)
    return clean(purchase_doc)


@router.get("/suppliers/{supplier_id}/purchases")
async def supplier_purchases(supplier_id: str, user=Depends(require_restaurant)):
    supplier = await db.suppliers.find_one({"id": supplier_id, "restaurant_id": rid(user)})
    if not supplier:
        raise HTTPException(404, "Fornecedor não encontrado.")
    purchases = await db.purchases.find(
        {"supplier_id": supplier_id, "restaurant_id": rid(user)}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)
    return purchases


# ═══════════════════════════════════════════════════════════════════════════
# 5. QR CODE DE MESA
# ═══════════════════════════════════════════════════════════════════════════

class TableIn(BaseModel):
    number: str
    name: Optional[str] = ""
    capacity: int = 4
    waiter_id: Optional[str] = None


class WaiterIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    code: Optional[str] = ""
    shift: Optional[str] = ""
    is_active: bool = True
    notes: Optional[str] = ""


class DeliveryPersonIn(BaseModel):
    name: str
    phone: Optional[str] = ""
    vehicle_type: Optional[str] = "moto"
    vehicle_plate: Optional[str] = ""
    daily_rate: float = 0.0
    delivery_fee: float = 0.0
    is_active: bool = True
    notes: Optional[str] = ""


async def _enrich_tables_with_waiters(tables: list[dict], restaurant_id: str):
    waiter_ids = [t.get("waiter_id") for t in tables if t.get("waiter_id")]
    if not waiter_ids:
        return tables
    waiters = await db.waiters.find(
        {"restaurant_id": restaurant_id, "id": {"$in": waiter_ids}},
        {"_id": 0, "id": 1, "name": 1, "phone": 1, "code": 1},
    ).to_list(len(waiter_ids))
    waiter_map = {w["id"]: w for w in waiters}
    for table in tables:
        table["waiter"] = waiter_map.get(table.get("waiter_id"))
    return tables


@router.get("/tables")
async def list_tables(user=Depends(require_restaurant)):
    tables = await db.tables.find(
        {"restaurant_id": rid(user)}, {"_id": 0}
    ).sort("number", 1).to_list(500)
    return await _enrich_tables_with_waiters(tables, rid(user))


@router.post("/tables")
async def create_table(data: TableIn, user=Depends(require_restaurant)):
    data.number = str(data.number).strip()
    existing = await db.tables.find_one({"restaurant_id": rid(user), "number": {"$in": table_number_values(data.number)}})
    if existing:
        raise HTTPException(400, f"Mesa {data.number} já existe.")
    if data.waiter_id:
        waiter = await db.waiters.find_one({"id": data.waiter_id, "restaurant_id": rid(user), "is_active": True})
        if not waiter:
            raise HTTPException(400, "Garcom invalido.")
    doc = data.model_dump()
    doc.update({"id": new_id(), "restaurant_id": rid(user), "status": "available", "created_at": now_iso()})
    await db.tables.insert_one(doc)
    return clean(doc)


@router.put("/tables/{table_id}")
async def update_table(table_id: str, data: TableIn, user=Depends(require_restaurant)):
    data.number = str(data.number).strip()
    existing = await db.tables.find_one({"id": table_id, "restaurant_id": rid(user)})
    if not existing:
        raise HTTPException(404, "Mesa não encontrada.")
    if data.waiter_id:
        waiter = await db.waiters.find_one({"id": data.waiter_id, "restaurant_id": rid(user), "is_active": True})
        if not waiter:
            raise HTTPException(400, "Garcom invalido.")
    updates = data.model_dump()
    updates["updated_at"] = now_iso()
    await db.tables.update_one(
        {"id": table_id, "restaurant_id": rid(user)}, {"$set": updates}
    )
    return clean(await db.tables.find_one(
        {"id": table_id, "restaurant_id": rid(user)}, {"_id": 0}
    ))


@router.delete("/tables/{table_id}")
async def delete_table(table_id: str, user=Depends(require_restaurant)):
    result = await db.tables.delete_one({"id": table_id, "restaurant_id": rid(user)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Mesa não encontrada.")
    return {"ok": True}


@router.get("/tables/{table_id}/qr-data")
async def table_qr_data(table_id: str, user=Depends(require_restaurant)):
    table = await db.tables.find_one({"id": table_id, "restaurant_id": rid(user)}, {"_id": 0})
    if not table:
        raise HTTPException(404, "Mesa não encontrada.")
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    slug = restaurant.get("slug", "") if restaurant else ""
    import os
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    url = f"{frontend_url}/cardapio/{slug}?mesa={table['number']}"
    return {
        "url": url,
        "table_number": table["number"],
        "table_name": table.get("name") or f"Mesa {table['number']}",
        "table_id": table["id"],
        "capacity": table.get("capacity"),
        "waiter_id": table.get("waiter_id"),
    }


@public_router.get("/restaurants/{slug}/table/{table_number}")
async def validate_table(slug: str, table_number: str):
    restaurant = await db.restaurants.find_one({"slug": slug}, {"_id": 0})
    if not restaurant:
        raise HTTPException(404, "Restaurante não encontrado.")
    table = await db.tables.find_one(
        {"restaurant_id": restaurant["id"], "number": {"$in": table_number_values(table_number)}}, {"_id": 0}
    )
    if not table:
        raise HTTPException(404, "Mesa não encontrada.")
    return {
        "restaurant_name": restaurant.get("name"),
        "restaurant_slug": slug,
        "table_number": table["number"],
        "table_name": table.get("name") or f"Mesa {table_number}",
        "capacity": table.get("capacity"),
        "waiter_id": table.get("waiter_id"),
    }


@router.get("/waiters")
async def list_waiters(active_only: bool = False, user=Depends(require_restaurant)):
    query = {"restaurant_id": rid(user)}
    if active_only:
        query["is_active"] = True
    waiters = await db.waiters.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    for waiter in waiters:
        waiter["tables_count"] = await db.tables.count_documents(
            {"restaurant_id": rid(user), "waiter_id": waiter["id"]}
        )
        waiter["open_orders_count"] = await db.orders.count_documents(
            {
                "restaurant_id": rid(user),
                "waiter_id": waiter["id"],
                "status": {"$nin": ["completed", "cancelled"]},
            }
        )
    return waiters


@router.post("/waiters")
async def create_waiter(data: WaiterIn, user=Depends(require_restaurant)):
    doc = data.model_dump()
    doc.update({"id": new_id(), "restaurant_id": rid(user), "created_at": now_iso()})
    await db.waiters.insert_one(doc)
    return clean(doc)


@router.put("/waiters/{waiter_id}")
async def update_waiter(waiter_id: str, data: WaiterIn, user=Depends(require_restaurant)):
    updates = data.model_dump()
    updates["updated_at"] = now_iso()
    result = await db.waiters.update_one(
        {"id": waiter_id, "restaurant_id": rid(user)}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Garcom nao encontrado.")
    return clean(await db.waiters.find_one({"id": waiter_id, "restaurant_id": rid(user)}, {"_id": 0}))


@router.delete("/waiters/{waiter_id}")
async def delete_waiter(waiter_id: str, user=Depends(require_restaurant)):
    result = await db.waiters.delete_one({"id": waiter_id, "restaurant_id": rid(user)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Garcom nao encontrado.")
    await db.tables.update_many(
        {"restaurant_id": rid(user), "waiter_id": waiter_id},
        {"$unset": {"waiter_id": ""}, "$set": {"updated_at": now_iso()}},
    )
    return {"ok": True}


@router.get("/delivery-people")
async def list_delivery_people(active_only: bool = False, user=Depends(require_restaurant)):
    query = {"restaurant_id": rid(user)}
    if active_only:
        query["is_active"] = True
    people = await db.delivery_people.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    today = datetime.now(timezone.utc).date().isoformat()
    for person in people:
        person["active_orders_count"] = await db.orders.count_documents({
            "restaurant_id": rid(user),
            "delivery_person.id": person["id"],
            "status": "out_for_delivery",
        })
        person["delivered_today"] = await db.orders.count_documents({
            "restaurant_id": rid(user),
            "delivery_person.id": person["id"],
            "status": "completed",
            "updated_at": {"$gte": today},
        })
    return people


@router.post("/delivery-people")
async def create_delivery_person(data: DeliveryPersonIn, user=Depends(require_restaurant)):
    doc = data.model_dump()
    doc.update({"id": new_id(), "restaurant_id": rid(user), "created_at": now_iso()})
    await db.delivery_people.insert_one(doc)
    return clean(doc)


@router.put("/delivery-people/{person_id}")
async def update_delivery_person(person_id: str, data: DeliveryPersonIn, user=Depends(require_restaurant)):
    updates = data.model_dump()
    updates["updated_at"] = now_iso()
    result = await db.delivery_people.update_one(
        {"id": person_id, "restaurant_id": rid(user)}, {"$set": updates}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Entregador nao encontrado.")
    return clean(await db.delivery_people.find_one({"id": person_id, "restaurant_id": rid(user)}, {"_id": 0}))


@router.delete("/delivery-people/{person_id}")
async def delete_delivery_person(person_id: str, user=Depends(require_restaurant)):
    result = await db.delivery_people.delete_one({"id": person_id, "restaurant_id": rid(user)})
    if result.deleted_count == 0:
        raise HTTPException(404, "Entregador nao encontrado.")
    return {"ok": True}
