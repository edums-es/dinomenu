"""Business management: Plans, Subscriptions, Billing, Affiliates, Resellers."""
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from db import db
from auth import require_roles
from models import clean, new_id, now_iso

router = APIRouter(prefix="/api/super", tags=["billing"])
SUPER = require_roles("super_admin")

def _now(): return datetime.now(timezone.utc)
def _iso(dt): return dt.isoformat()


# ═══════════════════════════════════════════════════════════════════════════
# PLANS
# ═══════════════════════════════════════════════════════════════════════════

class PlanIn(BaseModel):
    name: str
    slug: str
    description: Optional[str] = ""
    price_monthly: float = 0.0
    price_yearly: Optional[float] = None
    color: str = "#6366f1"
    is_active: bool = True
    is_featured: bool = False
    trial_days: int = 0
    features: List[str] = []
    limits: dict = {}   # e.g. {"max_products": 50, "max_orders_monthly": 500}

@router.get("/plans")
async def list_plans(user=Depends(SUPER)):
    plans = await db.plans.find({}, {"_id": 0}).sort("price_monthly", 1).to_list(50)
    for p in plans:
        p["subscriber_count"] = await db.subscriptions.count_documents({"plan_id": p["id"], "status": "active"})
    return plans

@router.post("/plans")
async def create_plan(data: PlanIn, user=Depends(SUPER)):
    if await db.plans.find_one({"slug": data.slug}):
        raise HTTPException(400, "Slug já existe")
    doc = data.model_dump()
    doc.update({"id": new_id(), "created_at": now_iso()})
    await db.plans.insert_one(doc)
    return clean(doc)

@router.put("/plans/{pid}")
async def update_plan(pid: str, data: PlanIn, user=Depends(SUPER)):
    patch = {**data.model_dump(), "updated_at": now_iso()}
    res = await db.plans.update_one({"id": pid}, {"$set": patch})
    if res.matched_count == 0: raise HTTPException(404, "Plano não encontrado")
    return await db.plans.find_one({"id": pid}, {"_id": 0})

@router.delete("/plans/{pid}")
async def delete_plan(pid: str, user=Depends(SUPER)):
    active = await db.subscriptions.count_documents({"plan_id": pid, "status": "active"})
    if active > 0: raise HTTPException(400, f"Plano tem {active} assinantes ativos. Migre-os antes.")
    await db.plans.delete_one({"id": pid})
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════════
# SUBSCRIPTIONS / ACTIVATIONS
# ═══════════════════════════════════════════════════════════════════════════

class SubscriptionIn(BaseModel):
    restaurant_id: str
    plan_id: str
    billing_cycle: Literal["monthly", "yearly", "lifetime"] = "monthly"
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    affiliate_code: Optional[str] = None
    reseller_id: Optional[str] = None
    trial_days: int = 0
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
    if plan_id: q["plan_id"] = plan_id
    subs = await db.subscriptions.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Enrich
    for s in subs:
        r = await db.restaurants.find_one({"id": s.get("restaurant_id")}, {"name": 1, "slug": 1, "_id": 0})
        s["restaurant_name"] = r["name"] if r else "—"
        s["restaurant_slug"] = r.get("slug", "") if r else ""
        p = await db.plans.find_one({"id": s.get("plan_id")}, {"name": 1, "color": 1, "_id": 0})
        s["plan_name"] = p["name"] if p else "—"
        s["plan_color"] = p.get("color", "#6366f1") if p else "#6366f1"
    if search:
        sq = search.lower()
        subs = [s for s in subs if sq in (s.get("restaurant_name") or "").lower()]
    return subs

@router.post("/subscriptions")
async def create_subscription(data: SubscriptionIn, user=Depends(SUPER)):
    restaurant = await db.restaurants.find_one({"id": data.restaurant_id})
    if not restaurant: raise HTTPException(404, "Restaurante não encontrado")
    plan = await db.plans.find_one({"id": data.plan_id})
    if not plan: raise HTTPException(404, "Plano não encontrado")

    amount = data.amount
    if amount is None:
        amount = plan["price_yearly"] if data.billing_cycle == "yearly" else plan["price_monthly"]

    now = _now()
    trial_end = _iso(now + timedelta(days=data.trial_days)) if data.trial_days > 0 else None
    if data.billing_cycle == "monthly":
        expires_at = _iso(now + timedelta(days=30))
    elif data.billing_cycle == "yearly":
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
        "billing_cycle": data.billing_cycle,
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
    # Update restaurant plan
    await db.restaurants.update_one({"id": data.restaurant_id}, {"$set": {"plan": plan["slug"], "status": "active"}})
    return clean(doc)

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
    return invoices

@router.get("/billing/summary")
async def billing_summary(user=Depends(SUPER)):
    invoices = await db.invoices.find({"status": "paid"}, {"amount": 1, "paid_at": 1, "_id": 0}).to_list(50000)
    total_revenue = round(sum(i["amount"] for i in invoices), 2)
    now = _now()
    this_month = f"{now.year}-{now.month:02d}"
    monthly = round(sum(i["amount"] for i in invoices if (i.get("paid_at") or "")[:7] == this_month), 2)
    active_subs = await db.subscriptions.count_documents({"status": "active"})
    trial_subs = await db.subscriptions.count_documents({"status": "trial"})
    overdue_subs = await db.subscriptions.count_documents({"status": "overdue"})
    mrr = 0
    subs = await db.subscriptions.find({"status": "active", "billing_cycle": "monthly"}, {"amount": 1, "_id": 0}).to_list(10000)
    mrr = round(sum(s.get("amount", 0) for s in subs), 2)
    return {
        "total_revenue": total_revenue, "monthly_revenue": monthly,
        "mrr": mrr, "arr": round(mrr * 12, 2),
        "active_subscriptions": active_subs, "trial": trial_subs, "overdue": overdue_subs,
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
