"""Business management: Plans, Subscriptions, Billing, Affiliates, Resellers."""
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from db import db
from auth import require_roles
from models import clean, new_id, now_iso
from plan_entitlements import FEATURE_CATALOG, normalize_plan_payload

router = APIRouter(prefix="/api/super", tags=["billing"])
SUPER = require_roles("super_admin")

def _now(): return datetime.now(timezone.utc)
def _iso(dt): return dt.isoformat()


async def _subscription_invoice_fallbacks(restaurant_id: str = ""):
    q = {"status": {"$in": ["active", "trial"]}}
    if restaurant_id:
        q["restaurant_id"] = restaurant_id
    subs = await db.subscriptions.find(q, {"_id": 0}).to_list(10000)
    if not subs:
        return []

    sub_ids = [s.get("id") for s in subs if s.get("id")]
    invoices = await db.invoices.find(
        {"subscription_id": {"$in": sub_ids}},
        {"subscription_id": 1, "_id": 0},
    ).to_list(len(sub_ids))
    invoiced_ids = {i.get("subscription_id") for i in invoices}

    fallbacks = []
    for sub in subs:
        amount = float(sub.get("amount") or 0)
        if not sub.get("id") or sub.get("id") in invoiced_ids or amount <= 0:
            continue
        r = await db.restaurants.find_one({"id": sub.get("restaurant_id")}, {"name": 1, "_id": 0})
        paid_at = sub.get("started_at") or sub.get("created_at") or now_iso()
        fallbacks.append({
            "id": f"activation-{sub['id']}",
            "subscription_id": sub["id"],
            "restaurant_id": sub.get("restaurant_id"),
            "restaurant_name": r["name"] if r else sub.get("restaurant_id", "--"),
            "restaurant": {"name": r["name"]} if r else None,
            "plan_id": sub.get("plan_id"),
            "amount": amount,
            "payment_method": sub.get("payment_method") or "manual",
            "status": "paid",
            "paid_at": paid_at,
            "created_at": paid_at,
            "period_start": paid_at,
            "period_end": sub.get("expires_at"),
            "source": "activation",
        })
    return fallbacks


# ═══════════════════════════════════════════════════════════════════════════
# PLANS
# ═══════════════════════════════════════════════════════════════════════════

class PlanIn(BaseModel):
    name: str
    slug: str
    description: Optional[str] = ""
    price_monthly: float = 0.0
    price_yearly: Optional[float] = None
    price_lifetime: Optional[float] = None
    color: str = "#6366f1"
    is_active: bool = True
    is_featured: bool = False
    is_public: bool = True
    plan_type: Literal["subscription", "legacy_lifetime"] = "subscription"
    updates_policy: Literal["included", "paid_upgrades"] = "included"
    billing_options: Dict[str, bool] = {"monthly": True, "yearly": True, "lifetime": False}
    feature_flags: Dict[str, bool] = {}
    upgrade_note: Optional[str] = ""
    trial_days: int = 0
    features: List[str] = []
    limits: dict = {}   # e.g. {"max_products": 50, "max_orders_monthly": 500}


class FeatureUpdateIn(BaseModel):
    title: str
    version: Optional[str] = ""
    description: Optional[str] = ""
    price: float = 0.0
    features: List[str] = []
    purchase_url: Optional[str] = ""
    is_active: bool = True

@router.get("/plans")
async def list_plans(user=Depends(SUPER)):
    plans = await db.plans.find({}, {"_id": 0}).sort("price_monthly", 1).to_list(50)
    for p in plans:
        p.update(normalize_plan_payload(p))
        sub_rows = await db.subscriptions.find(
            {"plan_id": p["id"], "status": "active"},
            {"restaurant_id": 1, "_id": 0},
        ).to_list(10000)
        restaurant_rows = await db.restaurants.find(
            {"plan": p.get("slug"), "status": "active"},
            {"id": 1, "_id": 0},
        ).to_list(10000)
        subscriber_ids = {s.get("restaurant_id") for s in sub_rows if s.get("restaurant_id")}
        subscriber_ids.update(r.get("id") for r in restaurant_rows if r.get("id"))
        p["subscriber_count"] = len(subscriber_ids)
        p["subscribers_count"] = p["subscriber_count"]
    return plans


@router.get("/plans/catalog")
async def plan_catalog(user=Depends(SUPER)):
    return {
        "features": FEATURE_CATALOG,
        "billing_options": ["monthly", "yearly", "lifetime"],
        "plan_types": ["subscription", "legacy_lifetime"],
        "updates_policies": ["included", "paid_upgrades"],
    }

@router.post("/plans")
async def create_plan(data: PlanIn, user=Depends(SUPER)):
    if await db.plans.find_one({"slug": data.slug}):
        raise HTTPException(400, "Slug já existe")
    doc = normalize_plan_payload(data.model_dump())
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.plans.insert_one(doc)
    return clean(doc)

@router.put("/plans/{pid}")
async def update_plan(pid: str, data: PlanIn, user=Depends(SUPER)):
    patch = {**normalize_plan_payload(data.model_dump()), "updated_at": now_iso()}
    res = await db.plans.update_one({"id": pid}, {"$set": patch})
    if res.matched_count == 0: raise HTTPException(404, "Plano não encontrado")
    plan = await db.plans.find_one({"id": pid}, {"_id": 0})
    return normalize_plan_payload(plan)

@router.delete("/plans/{pid}")
async def delete_plan(pid: str, user=Depends(SUPER)):
    plan = await db.plans.find_one({"id": pid})
    sub_rows = await db.subscriptions.find(
        {"plan_id": pid, "status": "active"},
        {"restaurant_id": 1, "_id": 0},
    ).to_list(10000)
    active_ids = {s.get("restaurant_id") for s in sub_rows if s.get("restaurant_id")}
    if plan:
        restaurant_rows = await db.restaurants.find(
            {"plan": plan.get("slug"), "status": "active"},
            {"id": 1, "_id": 0},
        ).to_list(10000)
        active_ids.update(r.get("id") for r in restaurant_rows if r.get("id"))
    active = len(active_ids)
    if active > 0: raise HTTPException(400, f"Plano tem {active} assinantes ativos. Migre-os antes.")
    await db.plans.delete_one({"id": pid})
    return {"ok": True}


@router.get("/feature-updates")
async def list_feature_updates(user=Depends(SUPER)):
    updates = await db.feature_updates.find({}, {"_id": 0}).sort("created_at", -1).to_list(200)
    for item in updates:
        item["buyer_count"] = await db.restaurant_feature_updates.count_documents({
            "update_id": item["id"],
            "status": {"$in": ["paid", "granted"]},
        })
    return updates


@router.post("/feature-updates")
async def create_feature_update(data: FeatureUpdateIn, user=Depends(SUPER)):
    doc = data.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso(), "updated_at": now_iso()})
    await db.feature_updates.insert_one(doc)
    return clean(doc)


@router.put("/feature-updates/{uid}")
async def update_feature_update(uid: str, data: FeatureUpdateIn, user=Depends(SUPER)):
    patch = {**data.model_dump(), "updated_at": now_iso()}
    res = await db.feature_updates.update_one({"id": uid}, {"$set": patch})
    if res.matched_count == 0:
        raise HTTPException(404, "Atualizacao nao encontrada")
    return await db.feature_updates.find_one({"id": uid}, {"_id": 0})


@router.delete("/feature-updates/{uid}")
async def delete_feature_update(uid: str, user=Depends(SUPER)):
    sold = await db.restaurant_feature_updates.count_documents({"update_id": uid})
    if sold:
        raise HTTPException(400, "Esta atualizacao ja foi liberada para cliente. Desative em vez de excluir.")
    await db.feature_updates.delete_one({"id": uid})
    return {"ok": True}


@router.post("/feature-updates/{uid}/grant")
async def grant_feature_update(uid: str, body: dict, user=Depends(SUPER)):
    restaurant_id = body.get("restaurant_id")
    if not restaurant_id:
        raise HTTPException(400, "Informe o restaurante")
    update = await db.feature_updates.find_one({"id": uid})
    if not update:
        raise HTTPException(404, "Atualizacao nao encontrada")
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(404, "Restaurante nao encontrado")

    existing = await db.restaurant_feature_updates.find_one({"restaurant_id": restaurant_id, "update_id": uid})
    patch = {
        "restaurant_id": restaurant_id,
        "update_id": uid,
        "status": body.get("status") or "granted",
        "price_paid": float(body.get("price_paid", update.get("price", 0)) or 0),
        "granted_at": now_iso(),
        "updated_at": now_iso(),
    }
    if existing:
        await db.restaurant_feature_updates.update_one({"id": existing["id"]}, {"$set": patch})
        return await db.restaurant_feature_updates.find_one({"id": existing["id"]}, {"_id": 0})

    doc = {"id": new_id(), **patch, "created_at": now_iso()}
    await db.restaurant_feature_updates.insert_one(doc)
    return clean(doc)


# ═══════════════════════════════════════════════════════════════════════════
# SUBSCRIPTIONS / ACTIVATIONS
# ═══════════════════════════════════════════════════════════════════════════

class SubscriptionIn(BaseModel):
    restaurant_id: str
    plan_id: str
    billing_cycle: Literal["monthly", "yearly", "lifetime"] = "monthly"
    cycle: Optional[Literal["monthly", "yearly", "lifetime"]] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    affiliate_code: Optional[str] = None
    reseller_id: Optional[str] = None
    trial_days: int = 0
    notes: Optional[str] = None


class SubscriptionUpdateIn(BaseModel):
    restaurant_id: Optional[str] = None
    plan_id: Optional[str] = None
    billing_cycle: Optional[Literal["monthly", "yearly", "lifetime"]] = None
    cycle: Optional[Literal["monthly", "yearly", "lifetime"]] = None
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    affiliate_code: Optional[str] = None
    reseller_id: Optional[str] = None
    trial_days: Optional[int] = None
    expires_at: Optional[str] = None
    status: Optional[Literal["active", "suspended", "cancelled", "trial", "overdue"]] = None
    notes: Optional[str] = None

@router.get("/subscriptions")
async def list_subscriptions(
    user=Depends(SUPER),
    status: str = Query(""),
    plan_id: str = Query(""),
    search: str = Query(""),
):
    q: dict = {}
    if status: q["status"] = status
    else: q["status"] = {"$ne": "cancelled"}
    if plan_id: q["plan_id"] = plan_id
    subs = await db.subscriptions.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Enrich
    for s in subs:
        r = await db.restaurants.find_one({"id": s.get("restaurant_id")}, {"id": 1, "name": 1, "slug": 1, "_id": 0})
        s["restaurant_name"] = r["name"] if r else "--"
        s["restaurant_slug"] = r.get("slug", "") if r else ""
        s["restaurant"] = r or {"name": s["restaurant_name"], "slug": s["restaurant_slug"]}
        p = await db.plans.find_one(
            {"id": s.get("plan_id")},
            {"id": 1, "name": 1, "slug": 1, "color": 1, "plan_type": 1, "is_public": 1, "_id": 0},
        )
        s["plan_name"] = p["name"] if p else "--"
        s["plan_color"] = p.get("color", "#6366f1") if p else "#6366f1"
        s["plan"] = p or {"name": s["plan_name"], "color": s["plan_color"]}
        s["cycle"] = s.get("billing_cycle", "monthly")
    if search:
        sq = search.lower()
        subs = [s for s in subs if sq in (s.get("restaurant_name") or "").lower()]
    return subs

@router.post("/subscriptions")
async def create_subscription(data: SubscriptionIn, user=Depends(SUPER)):
    billing_cycle = data.cycle or data.billing_cycle
    restaurant = await db.restaurants.find_one({"id": data.restaurant_id})
    if not restaurant: raise HTTPException(404, "Restaurante não encontrado")
    plan = await db.plans.find_one({"id": data.plan_id})
    if not plan: raise HTTPException(404, "Plano não encontrado")

    amount = data.amount
    if amount is None:
        if billing_cycle == "lifetime":
            amount = plan.get("price_lifetime") or plan.get("price_yearly") or plan.get("price_monthly") or 0
        elif billing_cycle == "yearly":
            amount = plan.get("price_yearly") or 0
        else:
            amount = plan.get("price_monthly") or 0

    now = _now()
    trial_end = _iso(now + timedelta(days=data.trial_days)) if data.trial_days > 0 else None
    if billing_cycle == "monthly":
        expires_at = _iso(now + timedelta(days=30))
    elif billing_cycle == "yearly":
        expires_at = _iso(now + timedelta(days=365))
    else:
        expires_at = None  # lifetime

    # Handle affiliate commission
    affiliate_id = None
    if data.affiliate_code:
        aff = await db.affiliates.find_one({"code": data.affiliate_code.upper(), "status": "active"})
        if aff:
            affiliate_id = aff["id"]
            commission = round(amount * (aff.get("commission_rate", 0) / 100), 2)
            await db.affiliates.update_one({"id": aff["id"]}, {
                "$inc": {"total_referred": 1, "pending_commission": commission},
            })

    doc = {
        "id": new_id(),
        "restaurant_id": data.restaurant_id,
        "plan_id": data.plan_id,
        "status": "trial" if data.trial_days > 0 else "active",
        "billing_cycle": billing_cycle,
        "amount": amount,
        "payment_method": data.payment_method,
        "affiliate_id": affiliate_id,
        "reseller_id": data.reseller_id,
        "trial_ends_at": trial_end,
        "started_at": now_iso(),
        "expires_at": expires_at,
        "next_billing_at": expires_at,
        "notes": data.notes,
        "created_at": now_iso(),
    }
    await db.subscriptions.insert_one(doc)
    if amount and amount > 0:
        await db.invoices.insert_one({
            "id": new_id(), "subscription_id": doc["id"],
            "restaurant_id": data.restaurant_id, "plan_id": data.plan_id,
            "amount": amount, "payment_method": data.payment_method or "manual",
            "status": "paid", "paid_at": now_iso(), "created_at": now_iso(),
            "period_start": doc["started_at"], "period_end": expires_at,
        })
    # Update restaurant plan
    await db.restaurants.update_one({"id": data.restaurant_id}, {"$set": {"plan": plan["slug"], "billing_cycle": billing_cycle, "status": "active"}})
    return clean(doc)


@router.put("/subscriptions/{sid}")
async def update_subscription(sid: str, data: SubscriptionUpdateIn, user=Depends(SUPER)):
    sub = await db.subscriptions.find_one({"id": sid})
    if not sub:
        raise HTTPException(404, "Assinatura nao encontrada")

    restaurant_id = data.restaurant_id or sub.get("restaurant_id")
    restaurant = await db.restaurants.find_one({"id": restaurant_id})
    if not restaurant:
        raise HTTPException(404, "Restaurante nao encontrado")

    plan_id = data.plan_id or sub.get("plan_id")
    plan = await db.plans.find_one({"id": plan_id})
    if not plan:
        raise HTTPException(404, "Plano nao encontrado")

    billing_cycle = data.cycle or data.billing_cycle or sub.get("billing_cycle", "monthly")
    amount = data.amount
    if amount is None:
        amount = sub.get("amount")
    if amount is None:
        if billing_cycle == "lifetime":
            amount = plan.get("price_lifetime") or plan.get("price_yearly") or plan.get("price_monthly") or 0
        elif billing_cycle == "yearly":
            amount = plan.get("price_yearly") or 0
        else:
            amount = plan.get("price_monthly") or 0

    expires_at = data.expires_at
    if billing_cycle == "lifetime":
        expires_at = None
    elif expires_at is None:
        expires_at = sub.get("expires_at")
        if not expires_at or sub.get("billing_cycle") == "lifetime":
            days = 365 if billing_cycle == "yearly" else 30
            expires_at = _iso(_now() + timedelta(days=days))

    patch = {
        "restaurant_id": restaurant_id,
        "plan_id": plan_id,
        "billing_cycle": billing_cycle,
        "amount": amount,
        "expires_at": expires_at,
        "next_billing_at": expires_at,
        "updated_at": now_iso(),
    }
    optional = {
        "payment_method": data.payment_method,
        "affiliate_code": data.affiliate_code,
        "reseller_id": data.reseller_id,
        "trial_days": data.trial_days,
        "status": data.status,
        "notes": data.notes,
    }
    for key, value in optional.items():
        if value is not None:
            patch[key] = value
    if data.trial_days and data.trial_days > 0:
        patch["trial_ends_at"] = _iso(_now() + timedelta(days=data.trial_days))
        patch.setdefault("status", "trial")

    await db.subscriptions.update_one({"id": sid}, {"$set": patch})
    if patch.get("status", sub.get("status")) in ("active", "trial"):
        await db.restaurants.update_one(
            {"id": restaurant_id},
            {"$set": {"plan": plan["slug"], "billing_cycle": billing_cycle, "status": "active", "updated_at": now_iso()}},
        )
    return await db.subscriptions.find_one({"id": sid}, {"_id": 0})


@router.delete("/subscriptions/{sid}")
async def delete_subscription(sid: str, user=Depends(SUPER)):
    sub = await db.subscriptions.find_one({"id": sid})
    if not sub:
        raise HTTPException(404, "Assinatura nao encontrada")
    await db.subscriptions.update_one({"id": sid}, {"$set": {
        "status": "cancelled",
        "cancelled_at": now_iso(),
        "updated_at": now_iso(),
    }})
    return {"ok": True}

@router.put("/subscriptions/{sid}/status")
async def update_subscription_status(sid: str, body: dict, user=Depends(SUPER)):
    valid = ["active", "suspended", "cancelled", "trial", "overdue"]
    status = body.get("status")
    if status not in valid: raise HTTPException(400, "Status inválido")
    sub = await db.subscriptions.find_one({"id": sid})
    if not sub: raise HTTPException(404)
    await db.subscriptions.update_one({"id": sid}, {"$set": {"status": status, "updated_at": now_iso()}})
    # Sync restaurant status
    if status in ("active", "trial"):
        await db.restaurants.update_one({"id": sub["restaurant_id"]}, {"$set": {"status": "active"}})
    elif status in ("suspended", "cancelled"):
        await db.restaurants.update_one({"id": sub["restaurant_id"]}, {"$set": {"status": status}})
    return await db.subscriptions.find_one({"id": sid}, {"_id": 0})

@router.post("/subscriptions/{sid}/renew")
async def renew_subscription(sid: str, body: dict, user=Depends(SUPER)):
    sub = await db.subscriptions.find_one({"id": sid})
    if not sub: raise HTTPException(404)
    cycle = sub.get("billing_cycle", "monthly")
    days = 365 if cycle == "yearly" else 30
    now = _now()
    expires_at = _iso(now + timedelta(days=days))
    amount = body.get("amount", sub.get("amount", 0))
    payment_method = body.get("payment_method", sub.get("payment_method", ""))

    await db.subscriptions.update_one({"id": sid}, {"$set": {
        "status": "active", "expires_at": expires_at, "next_billing_at": expires_at, "updated_at": now_iso()
    }})
    # Record payment
    invoice_doc = {
        "id": new_id(), "subscription_id": sid,
        "restaurant_id": sub["restaurant_id"], "plan_id": sub.get("plan_id"),
        "amount": amount, "payment_method": payment_method,
        "status": "paid", "paid_at": now_iso(), "created_at": now_iso(),
        "period_start": now_iso(), "period_end": expires_at,
    }
    await db.invoices.insert_one(invoice_doc)
    await db.restaurants.update_one({"id": sub["restaurant_id"]}, {"$set": {"status": "active"}})
    return await db.subscriptions.find_one({"id": sid}, {"_id": 0})

@router.get("/subscriptions/alerts")
async def subscription_alerts(user=Depends(SUPER)):
    """Overdue and expiring soon (within 7 days)."""
    now = _now()
    soon = _iso(now + timedelta(days=7))
    subs = await db.subscriptions.find(
        {"status": {"$in": ["active", "trial"]}, "expires_at": {"$ne": None, "$lte": soon}},
        {"_id": 0}
    ).to_list(500)
    out = []
    for s in subs:
        r = await db.restaurants.find_one({"id": s["restaurant_id"]}, {"name": 1, "_id": 0})
        exp = datetime.fromisoformat(s["expires_at"].replace("Z", "+00:00"))
        days_left = (exp - now).days
        s["restaurant_name"] = r["name"] if r else "—"
        s["days_left"] = days_left
        s["alert_type"] = "overdue" if days_left < 0 else "expiring_soon"
        out.append(s)
    return sorted(out, key=lambda x: x["days_left"])


# ═══════════════════════════════════════════════════════════════════════════
# BILLING / INVOICES
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/invoices")
async def list_invoices(user=Depends(SUPER), restaurant_id: str = Query("")):
    q: dict = {}
    if restaurant_id: q["restaurant_id"] = restaurant_id
    invoices = await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    for inv in invoices:
        r = await db.restaurants.find_one({"id": inv.get("restaurant_id")}, {"name": 1, "_id": 0})
        inv["restaurant_name"] = r["name"] if r else "—"
    for inv in invoices:
        inv["restaurant"] = {"name": inv.get("restaurant_name") or inv.get("restaurant_id") or "--"}
    invoices.extend(await _subscription_invoice_fallbacks(restaurant_id))
    return sorted(invoices, key=lambda i: i.get("paid_at") or i.get("created_at") or "", reverse=True)

@router.get("/billing/summary")
async def billing_summary(user=Depends(SUPER)):
    invoices = await db.invoices.find({"status": "paid"}, {"amount": 1, "paid_at": 1, "_id": 0}).to_list(50000)
    invoices.extend(await _subscription_invoice_fallbacks())
    total_revenue = round(sum(i["amount"] for i in invoices), 2)
    now = _now()
    this_month = f"{now.year}-{now.month:02d}"
    monthly = round(sum(i["amount"] for i in invoices if (i.get("paid_at") or "")[:7] == this_month), 2)
    active_sub_rows = await db.subscriptions.find(
        {"status": "active"},
        {"restaurant_id": 1, "_id": 0},
    ).to_list(10000)
    active_restaurant_rows = await db.restaurants.find(
        {"status": "active"},
        {"id": 1, "plan": 1, "_id": 0},
    ).to_list(10000)
    active_subscriber_ids = {s.get("restaurant_id") for s in active_sub_rows if s.get("restaurant_id")}
    active_subscriber_ids.update(r.get("id") for r in active_restaurant_rows if r.get("id") and r.get("plan"))
    active_subs = len(active_subscriber_ids)
    trial_subs = await db.subscriptions.count_documents({"status": "trial"})
    overdue_subs = await db.subscriptions.count_documents({"status": "overdue"})
    mrr = 0
    subs = await db.subscriptions.find({"status": "active", "billing_cycle": "monthly"}, {"amount": 1, "_id": 0}).to_list(10000)
    mrr = round(sum(s.get("amount", 0) for s in subs), 2)
    return {
        "total_revenue": total_revenue, "monthly_revenue": monthly,
        "mrr": mrr, "arr": round(mrr * 12, 2),
        "active_subscriptions": active_subs, "active_subscribers": active_subs,
        "trial": trial_subs, "overdue": overdue_subs,
    }


# ═══════════════════════════════════════════════════════════════════════════
# AFFILIATES
# ═══════════════════════════════════════════════════════════════════════════

class AffiliateIn(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    commission_rate: float = 10.0  # %
    notes: Optional[str] = None

@router.get("/affiliates")
async def list_affiliates(user=Depends(SUPER)):
    affs = await db.affiliates.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for a in affs:
        a["active_restaurants"] = await db.subscriptions.count_documents(
            {"affiliate_id": a["id"], "status": "active"}
        )
    return affs

@router.post("/affiliates")
async def create_affiliate(data: AffiliateIn, user=Depends(SUPER)):
    import random, string
    code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    while await db.affiliates.find_one({"code": code}):
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    doc = {**data.model_dump(), "id": new_id(), "code": code,
           "status": "active", "total_referred": 0, "total_commission": 0.0,
           "pending_commission": 0.0, "paid_commission": 0.0, "created_at": now_iso()}
    await db.affiliates.insert_one(doc)
    return clean(doc)

@router.put("/affiliates/{aid}")
async def update_affiliate(aid: str, body: dict, user=Depends(SUPER)):
    allowed = {"name", "email", "phone", "commission_rate", "status", "notes"}
    patch = {k: v for k, v in body.items() if k in allowed}
    patch["updated_at"] = now_iso()
    await db.affiliates.update_one({"id": aid}, {"$set": patch})
    return await db.affiliates.find_one({"id": aid}, {"_id": 0})

@router.post("/affiliates/{aid}/pay-commission")
async def pay_commission(aid: str, body: dict, user=Depends(SUPER)):
    amount = float(body.get("amount", 0))
    aff = await db.affiliates.find_one({"id": aid})
    if not aff: raise HTTPException(404)
    await db.affiliates.update_one({"id": aid}, {
        "$inc": {"paid_commission": amount, "total_commission": amount},
        "$set": {"pending_commission": max(0, aff.get("pending_commission", 0) - amount)}
    })
    await db.affiliate_payments.insert_one({
        "id": new_id(), "affiliate_id": aid, "amount": amount,
        "notes": body.get("notes", ""), "created_at": now_iso()
    })
    return {"ok": True}

@router.delete("/affiliates/{aid}")
async def delete_affiliate(aid: str, user=Depends(SUPER)):
    await db.affiliates.delete_one({"id": aid})
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════
# RESELLERS
# ═══════════════════════════════════════════════════════════════════════════

class ResellerIn(BaseModel):
    company_name: str
    contact_name: str
    email: str
    phone: Optional[str] = None
    cnpj: Optional[str] = None
    discount_rate: float = 20.0    # % discount on plan prices
    commission_rate: float = 0.0   # % recurring commission
    whitelabel_domain: Optional[str] = None
    notes: Optional[str] = None

@router.get("/resellers")
async def list_resellers(user=Depends(SUPER)):
    resellers = await db.resellers.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    for r in resellers:
        r["restaurant_count"] = await db.subscriptions.count_documents(
            {"reseller_id": r["id"], "status": "active"}
        )
    return resellers

@router.post("/resellers")
async def create_reseller(data: ResellerIn, user=Depends(SUPER)):
    doc = {**data.model_dump(), "id": new_id(), "status": "active",
           "total_commission": 0.0, "pending_commission": 0.0, "created_at": now_iso()}
    await db.resellers.insert_one(doc)
    return clean(doc)

@router.put("/resellers/{rid}")
async def update_reseller(rid: str, data: ResellerIn, user=Depends(SUPER)):
    patch = {**data.model_dump(), "updated_at": now_iso()}
    await db.resellers.update_one({"id": rid}, {"$set": patch})
    return await db.resellers.find_one({"id": rid}, {"_id": 0})

@router.delete("/resellers/{rid}")
async def delete_reseller(rid: str, user=Depends(SUPER)):
    await db.resellers.delete_one({"id": rid})
    return {"ok": True}

@router.get("/resellers/{rid}/restaurants")
async def reseller_restaurants(rid: str, user=Depends(SUPER)):
    subs = await db.subscriptions.find({"reseller_id": rid}, {"_id": 0}).to_list(500)
    out = []
    for s in subs:
        r = await db.restaurants.find_one({"id": s["restaurant_id"]}, {"name": 1, "slug": 1, "_id": 0})
        if r: out.append({**s, "restaurant_name": r["name"], "restaurant_slug": r.get("slug")})
    return out
