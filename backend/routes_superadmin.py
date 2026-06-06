"""Super admin endpoints — platform owner only."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from db import db
from auth import require_roles, hash_password
from models import slugify, clean, now_iso
from datetime import datetime, timezone

router = APIRouter(prefix="/api/super", tags=["super"])

SUPER = require_roles("super_admin")


class CreateRestaurant(BaseModel):
    restaurant_name: str
    owner_name: str
    owner_email: EmailStr
    owner_password: str
    plan: str = "basic"


class UpdateRestaurant(BaseModel):
    status: str = None
    plan: str = None
    name: str = None


@router.get("/restaurants")
async def list_restaurants(user=Depends(SUPER)):
    restaurants = await db.restaurants.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for r in restaurants:
        r["order_count"] = await db.orders.count_documents({"restaurant_id": r["id"]})
        r["product_count"] = await db.products.count_documents({"restaurant_id": r["id"]})
    return restaurants


@router.post("/restaurants")
async def create_restaurant(data: CreateRestaurant, user=Depends(SUPER)):
    from seed import create_restaurant_with_owner
    if await db.users.find_one({"email": data.owner_email.lower()}):
        raise HTTPException(status_code=400, detail="E-mail do dono já cadastrado")
    base = slugify(data.restaurant_name)
    slug = base
    n = 1
    while await db.restaurants.find_one({"slug": slug}):
        n += 1
        slug = f"{base}-{n}"
    rid = await create_restaurant_with_owner(
        restaurant_name=data.restaurant_name, slug=slug,
        owner_name=data.owner_name, owner_email=data.owner_email,
        owner_password=data.owner_password, with_demo_data=False, plan=data.plan,
    )
    return {"id": rid, "slug": slug}


@router.put("/restaurants/{rid}")
async def update_restaurant(rid: str, data: UpdateRestaurant, user=Depends(SUPER)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    updates["updated_at"] = now_iso()
    res = await db.restaurants.update_one({"id": rid}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Restaurante não encontrado")
    return await db.restaurants.find_one({"id": rid}, {"_id": 0})


@router.get("/users")
async def list_users(user=Depends(SUPER)):
    users = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    out = []
    for u in users:
        out.append({
            "id": str(u["_id"]), "email": u["email"], "name": u.get("name"),
            "role": u.get("role"), "restaurant_id": u.get("restaurant_id"),
        })
    return out


@router.get("/metrics")
async def metrics(user=Depends(SUPER)):
    total_restaurants = await db.restaurants.count_documents({})
    active = await db.restaurants.count_documents({"status": "active"})
    suspended = await db.restaurants.count_documents({"status": "suspended"})
    total_orders = await db.orders.count_documents({})
    total_users = await db.users.count_documents({})
    orders = await db.orders.find({"status": {"$ne": "cancelled"}}, {"total": 1, "_id": 0}).to_list(50000)
    gmv = round(sum(o.get("total", 0) for o in orders), 2)

    plans = {}
    async for r in db.restaurants.find({}, {"plan": 1, "_id": 0}):
        p = r.get("plan", "basic")
        plans[p] = plans.get(p, 0) + 1

    return {
        "total_restaurants": total_restaurants,
        "active": active,
        "suspended": suspended,
        "total_orders": total_orders,
        "total_users": total_users,
        "gmv": gmv,
        "plans": [{"plan": k, "count": v} for k, v in plans.items()],
    }


# ── Extended Super Admin endpoints ─────────────────────────────────────────

@router.get("/restaurants/{rid}")
async def get_restaurant_detail(rid: str, user=Depends(SUPER)):
    r = await db.restaurants.find_one({"id": rid}, {"_id": 0})
    if not r: raise HTTPException(404, "Não encontrado")
    r["order_count"] = await db.orders.count_documents({"restaurant_id": rid})
    r["product_count"] = await db.products.count_documents({"restaurant_id": rid})
    r["revenue"] = 0
    orders = await db.orders.find({"restaurant_id": rid, "status": {"$ne": "cancelled"}}, {"total": 1, "_id": 0}).to_list(10000)
    r["revenue"] = round(sum(o.get("total", 0) for o in orders), 2)
    return r

@router.delete("/restaurants/{rid}")
async def delete_restaurant(rid: str, user=Depends(SUPER)):
    await db.restaurants.delete_one({"id": rid})
    await db.users.delete_many({"restaurant_id": rid})
    await db.orders.delete_many({"restaurant_id": rid})
    await db.products.delete_many({"restaurant_id": rid})
    await db.categories.delete_many({"restaurant_id": rid})
    return {"ok": True}

@router.post("/restaurants/{rid}/toggle-status")
async def toggle_restaurant_status(rid: str, user=Depends(SUPER)):
    r = await db.restaurants.find_one({"id": rid})
    if not r: raise HTTPException(404, "Não encontrado")
    new_status = "suspended" if r.get("status") == "active" else "active"
    await db.restaurants.update_one({"id": rid}, {"$set": {"status": new_status, "updated_at": now_iso()}})
    return {"status": new_status}

@router.get("/restaurants/{rid}/orders")
async def restaurant_orders(rid: str, user=Depends(SUPER)):
    return await db.orders.find({"restaurant_id": rid}, {"_id": 0}).sort("created_at", -1).to_list(200)

@router.get("/restaurants/{rid}/revenue-chart")
async def restaurant_revenue_chart(rid: str, user=Depends(SUPER)):
    from datetime import timedelta
    orders = await db.orders.find(
        {"restaurant_id": rid, "status": {"$ne": "cancelled"}}, {"total": 1, "created_at": 1, "_id": 0}
    ).to_list(10000)
    # Group by day (last 30 days)
    today = datetime.now(timezone.utc).date()
    days = {}
    for i in range(29, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        days[d] = 0
    for o in orders:
        d = (o.get("created_at") or "")[:10]
        if d in days:
            days[d] = round(days[d] + o.get("total", 0), 2)
    return [{"date": k, "revenue": v} for k, v in days.items()]

@router.put("/users/{uid}")
async def update_user(uid: str, body: dict, user=Depends(SUPER)):
    from bson import ObjectId
    allowed = {"name", "email", "role", "is_active"}
    patch = {k: v for k, v in body.items() if k in allowed}
    patch["updated_at"] = now_iso()
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": patch})
    u = await db.users.find_one({"_id": ObjectId(uid)}, {"password_hash": 0})
    return {"id": str(u["_id"]), "email": u["email"], "name": u.get("name"), "role": u.get("role")}

@router.delete("/users/{uid}")
async def delete_user(uid: str, user=Depends(SUPER)):
    from bson import ObjectId
    await db.users.delete_one({"_id": ObjectId(uid)})
    return {"ok": True}

@router.post("/users/{uid}/reset-password")
async def reset_user_password(uid: str, body: dict, user=Depends(SUPER)):
    from bson import ObjectId
    new_pw = body.get("password", "")
    if len(new_pw) < 6:
        raise HTTPException(400, "Senha deve ter ao menos 6 caracteres")
    await db.users.update_one({"_id": ObjectId(uid)}, {"$set": {"password_hash": hash_password(new_pw)}})
    return {"ok": True}

@router.get("/activity")
async def platform_activity(user=Depends(SUPER)):
    """Recent orders across all restaurants."""
    orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(50)
    # Enrich with restaurant name
    for o in orders:
        r = await db.restaurants.find_one({"id": o.get("restaurant_id")}, {"name": 1, "_id": 0})
        o["restaurant_name"] = r["name"] if r else "—"
    return orders

@router.get("/metrics/chart")
async def metrics_chart(user=Depends(SUPER)):
    from datetime import timedelta
    today = datetime.now(timezone.utc).date()
    days = {}
    for i in range(29, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        days[d] = {"orders": 0, "revenue": 0, "new_restaurants": 0}
    
    orders = await db.orders.find(
        {"status": {"$ne": "cancelled"}}, {"total": 1, "created_at": 1, "_id": 0}
    ).to_list(50000)
    for o in orders:
        d = (o.get("created_at") or "")[:10]
        if d in days:
            days[d]["orders"] += 1
            days[d]["revenue"] = round(days[d]["revenue"] + o.get("total", 0), 2)

    restaurants = await db.restaurants.find({}, {"created_at": 1, "_id": 0}).to_list(10000)
    for r in restaurants:
        d = (r.get("created_at") or "")[:10]
        if d in days:
            days[d]["new_restaurants"] += 1

    return [{"date": k, **v} for k, v in days.items()]


# ── Platform Settings (OneSignal, Twilio global, etc.) ────────────────────

@router.get("/platform-settings")
async def get_platform_settings(user=Depends(SUPER)):
    """Retorna as configurações globais da plataforma."""
    cfg = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0})
    if not cfg:
        cfg = {}
    # Nunca retorna chaves secretas em texto puro — mascara
    safe = {k: ("***" if "secret" in k.lower() or "key" in k.lower() or "token" in k.lower() else v)
            for k, v in cfg.items()}
    return safe


@router.put("/platform-settings")
async def update_platform_settings(body: dict, user=Depends(SUPER)):
    """Salva configurações globais da plataforma."""
    # Remove valores mascarados para não sobrescrever com ***
    clean = {k: v for k, v in body.items() if v != "***" and v is not None and str(v).strip() != ""}
    if not clean:
        return {"ok": True}
    await db.platform_settings.update_one(
        {"_id": "global"},
        {"$set": clean},
        upsert=True,
    )
    return {"ok": True}


@router.post("/test-push")
async def test_push_notification(user=Depends(SUPER)):
    """Envia uma notificação push de teste para todos os clientes OneSignal cadastrados."""
    import httpx as _httpx
    app_id = await get_platform_setting("onesignal_app_id", "")
    api_key = await get_platform_setting("onesignal_api_key", "")
    if not app_id or not api_key:
        raise HTTPException(400, "OneSignal nao configurado. Preencha o App ID e a API Key.")
    try:
        async with _httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://onesignal.com/api/v1/notifications",
                headers={"Authorization": f"Basic {api_key}", "Content-Type": "application/json"},
                json={
                    "app_id": app_id,
                    "included_segments": ["Total Subscriptions"],
                    "headings": {"pt": "Teste da Plataforma"},
                    "contents": {"pt": "Notificacoes push estao funcionando corretamente!"},
                    "priority": 10,
                },
            )
            data = resp.json()
            if resp.status_code >= 400:
                raise HTTPException(400, (data.get("errors") or ["Erro desconhecido"])[0])
            return {"ok": True, "recipients": data.get("recipients", 0)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Falha ao conectar ao OneSignal: {str(e)}")


async def get_platform_setting(key: str, fallback: str = ""):
    """Helper para ler uma configuracao de plataforma do banco."""
    import os as _os
    # Prioridade: banco -> variavel de ambiente -> fallback
    cfg = await db.platform_settings.find_one({"_id": "global"}, {"_id": 0, key: 1})
    return (cfg or {}).get(key) or _os.environ.get(key.upper(), fallback)
