"""Tenant-scoped operational alerts for restaurant owners."""
from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_restaurant
from db import db
from models import new_id, now_iso

router = APIRouter(prefix="/api/admin/alerts", tags=["operational-alerts"])

ACTIVE = "active"
RESOLVED = "resolved"
SEVERITIES = {"info", "warning", "critical"}


def rid(user):
    return user["restaurant_id"]


async def upsert_operational_alert(
    restaurant_id: str,
    key: str,
    title: str,
    message: str,
    *,
    severity: str = "warning",
    category: str = "system",
    action_label: str = "",
    action_url: str = "",
    metadata: dict | None = None,
):
    """Create or refresh one active alert per restaurant/key."""
    if not restaurant_id or not key:
        return None

    severity = severity if severity in SEVERITIES else "warning"
    query = {"restaurant_id": restaurant_id, "key": key, "status": ACTIVE}
    existing = await db.operational_alerts.find_one(query, {"_id": 0})
    patch = {
        "title": title,
        "message": message,
        "severity": severity,
        "category": category,
        "action_label": action_label,
        "action_url": action_url,
        "metadata": metadata or {},
        "last_seen_at": now_iso(),
    }
    if existing:
        await db.operational_alerts.update_one(
            {"id": existing["id"], "restaurant_id": restaurant_id},
            {"$set": patch, "$inc": {"count": 1}},
        )
        return {**existing, **patch, "count": int(existing.get("count") or 1) + 1}

    doc = {
        "id": new_id(),
        "restaurant_id": restaurant_id,
        "key": key,
        "status": ACTIVE,
        "read": False,
        "count": 1,
        "created_at": now_iso(),
        "first_seen_at": now_iso(),
        **patch,
    }
    await db.operational_alerts.insert_one(doc)
    return doc


async def resolve_operational_alert(restaurant_id: str, key: str):
    await db.operational_alerts.update_many(
        {"restaurant_id": restaurant_id, "key": key, "status": ACTIVE},
        {"$set": {"status": RESOLVED, "resolved_at": now_iso(), "updated_at": now_iso()}},
    )


async def read_alerts(restaurant_id: str, include_resolved: bool = False, limit: int = 50):
    query = {"restaurant_id": restaurant_id}
    if not include_resolved:
        query["status"] = ACTIVE
    return await db.operational_alerts.find(query, {"_id": 0}).sort("last_seen_at", -1).to_list(limit)


def alerts_summary(alerts):
    active = [item for item in alerts if item.get("status") == ACTIVE]
    critical = [item for item in active if item.get("severity") == "critical"]
    warning = [item for item in active if item.get("severity") == "warning"]
    unread = [item for item in active if not item.get("read")]
    return {
        "active": len(active),
        "critical": len(critical),
        "warning": len(warning),
        "unread": len(unread),
        "top_alert": critical[0] if critical else (active[0] if active else None),
    }


@router.get("")
async def list_alerts(
    include_resolved: bool = Query(False),
    mark_read: bool = Query(False),
    user=Depends(require_restaurant),
):
    if mark_read:
        await db.operational_alerts.update_many(
            {"restaurant_id": rid(user), "status": ACTIVE, "read": False},
            {"$set": {"read": True, "read_at": now_iso(), "updated_at": now_iso()}},
        )
    alerts = await read_alerts(rid(user), include_resolved=include_resolved, limit=100)
    return {"alerts": alerts, "summary": alerts_summary(alerts)}


@router.get("/summary")
async def get_alerts_summary(user=Depends(require_restaurant)):
    alerts = await read_alerts(rid(user), include_resolved=False, limit=20)
    return alerts_summary(alerts)


@router.put("/{alert_id}/read")
async def mark_alert_read(alert_id: str, user=Depends(require_restaurant)):
    alert = await db.operational_alerts.find_one({"id": alert_id, "restaurant_id": rid(user)}, {"_id": 0})
    if not alert:
        raise HTTPException(404, "Aviso nao encontrado")
    await db.operational_alerts.update_one(
        {"id": alert_id, "restaurant_id": rid(user)},
        {"$set": {"read": True, "read_at": now_iso(), "updated_at": now_iso()}},
    )
    return {"ok": True}


@router.put("/{alert_id}/resolve")
async def resolve_alert(alert_id: str, user=Depends(require_restaurant)):
    alert = await db.operational_alerts.find_one({"id": alert_id, "restaurant_id": rid(user)}, {"_id": 0})
    if not alert:
        raise HTTPException(404, "Aviso nao encontrado")
    await db.operational_alerts.update_one(
        {"id": alert_id, "restaurant_id": rid(user)},
        {"$set": {"status": RESOLVED, "read": True, "resolved_at": now_iso(), "updated_at": now_iso()}},
    )
    return {"ok": True}
