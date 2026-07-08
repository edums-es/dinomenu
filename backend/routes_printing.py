"""Persistent automatic printing queue and Windows agent API."""
import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, EmailStr, Field

from auth import require_restaurant, verify_password
from db import db
from models import new_id, now_iso

logger = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/admin/printing", tags=["printing"])
agent_router = APIRouter(prefix="/api/print-agent", tags=["print-agent"])

LEASE_SECONDS = 90
MAX_ATTEMPTS = 20
RECONCILE_INTERVAL_SECONDS = 60
_last_reconcile = {}


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _restaurant_id(user: dict) -> str:
    return user["restaurant_id"]


def _pairing_token() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    raw = "".join(secrets.choice(alphabet) for _ in range(12))
    return f"{raw[:4]}-{raw[4:8]}-{raw[8:]}"


def _safe_order(order: dict, restaurant: dict) -> dict:
    return {
        "restaurant": {
            "id": restaurant.get("id"),
            "name": restaurant.get("name", ""),
            "phone": restaurant.get("phone", ""),
            "address": restaurant.get("address", ""),
        },
        "order": {
            "id": order.get("id"),
            "order_number": order.get("order_number"),
            "status": order.get("status"),
            "type": order.get("type"),
            "source": order.get("source"),
            "created_at": order.get("created_at"),
            "scheduled_for": order.get("scheduled_for"),
            "table_number": order.get("table_number"),
            "table_name": order.get("table_name"),
            "customer": order.get("customer") or {},
            "address": order.get("address") or {},
            "items": order.get("items") or [],
            "subtotal": order.get("subtotal", 0),
            "delivery_fee": order.get("delivery_fee", 0),
            "discount": order.get("discount", 0),
            "total": order.get("total", 0),
            "payment_method": order.get("payment_method", ""),
            "change_for": order.get("change_for"),
            "customer_notes": order.get("customer_notes", ""),
        },
    }


async def enqueue_order_print(restaurant: dict, order: dict, event: str) -> bool:
    """Create one durable job for the configured order event."""
    if not restaurant or not restaurant.get("printing_enabled"):
        return False
    trigger = restaurant.get("printing_trigger", "created")
    if trigger != event:
        return False
    if event == "created" and order.get("pix_charge") and order.get("payment_status") != "paid":
        return False

    job_key = f"{restaurant['id']}:{order['id']}:{event}:general"
    if await db.print_jobs.find_one({"job_key": job_key}, {"_id": 0, "id": 1}):
        return False

    created_at = now_iso()
    job = {
        "id": new_id(),
        "job_key": job_key,
        "restaurant_id": restaurant["id"],
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "event": event,
        "destination": "general",
        "status": "queued",
        "attempts": 0,
        "next_attempt_at": created_at,
        "payload": _safe_order(order, restaurant),
        "created_at": created_at,
        "updated_at": created_at,
    }
    try:
        await db.print_jobs.insert_one(job)
        return True
    except Exception as exc:
        # The unique job_key index is the final guard when two requests race.
        logger.warning("Could not create print job %s: %s", job_key, exc)
        return False


async def reconcile_print_jobs(restaurant_id: str) -> None:
    """Repair a missed enqueue without ever reviving old orders."""
    current = time.monotonic()
    if current - _last_reconcile.get(restaurant_id, 0) < RECONCILE_INTERVAL_SECONDS:
        return
    _last_reconcile[restaurant_id] = current
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant or not restaurant.get("printing_enabled"):
        return
    enabled_at = restaurant.get("printing_enabled_at")
    if not enabled_at:
        return
    trigger = restaurant.get("printing_trigger", "created")
    if trigger == "accepted":
        query = {
            "restaurant_id": restaurant_id,
            "accepted_at": {"$gte": enabled_at},
        }
    else:
        query = {
            "restaurant_id": restaurant_id,
            "created_at": {"$gte": enabled_at},
            "$or": [
                {"pix_charge": {"$exists": False}},
                {"payment_status": "paid"},
            ],
        }
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    for order in orders:
        await enqueue_order_print(restaurant, order, trigger)


class PrintingSettingsInput(BaseModel):
    enabled: bool = False
    trigger: str = "created"


class PairInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)
    pairing_token: str = Field(min_length=8)
    device_id: str = Field(min_length=6, max_length=128)
    device_name: str = Field(default="Computador da loja", max_length=120)
    app_version: str = Field(default="", max_length=40)


class AgentFailureInput(BaseModel):
    error: str = Field(default="Falha de impressao", max_length=1000)


@admin_router.get("")
async def get_printing_settings(user=Depends(require_restaurant)):
    restaurant_id = _restaurant_id(user)
    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    agents = await db.print_agents.find(
        {"restaurant_id": restaurant_id, "revoked": {"$ne": True}}, {"_id": 0, "token_hash": 0}
    ).sort("last_seen_at", -1).to_list(20)
    recent_jobs = await db.print_jobs.find(
        {"restaurant_id": restaurant_id}, {"_id": 0, "payload": 0}
    ).sort("created_at", -1).to_list(20)
    return {
        "enabled": bool((restaurant or {}).get("printing_enabled")),
        "trigger": (restaurant or {}).get("printing_trigger", "created"),
        "has_pairing_token": bool((restaurant or {}).get("printing_pairing_token_hash")),
        "pairing_token_hint": (restaurant or {}).get("printing_pairing_token_hint", ""),
        "agents": agents,
        "recent_jobs": recent_jobs,
    }


@admin_router.put("")
async def update_printing_settings(body: PrintingSettingsInput, user=Depends(require_restaurant)):
    if body.trigger not in {"created", "accepted"}:
        raise HTTPException(status_code=400, detail="Regra de impressao invalida")
    restaurant = await db.restaurants.find_one({"id": _restaurant_id(user)}, {"_id": 0})
    updates = {
        "printing_enabled": body.enabled,
        "printing_trigger": body.trigger,
        "updated_at": now_iso(),
    }
    if body.enabled and (
        not (restaurant or {}).get("printing_enabled")
        or (restaurant or {}).get("printing_trigger", "created") != body.trigger
    ):
        updates["printing_enabled_at"] = now_iso()
    await db.restaurants.update_one(
        {"id": _restaurant_id(user)},
        {"$set": updates},
    )
    if not body.enabled or (restaurant or {}).get("printing_trigger", "created") != body.trigger:
        await db.print_jobs.update_many(
            {
                "restaurant_id": _restaurant_id(user),
                "status": {"$in": ["queued", "printing"]},
            },
            {"$set": {
                "status": "cancelled",
                "last_error": "Configuracao de impressao alterada",
                "lease_until": None,
                "updated_at": now_iso(),
            }},
        )
    _last_reconcile.pop(_restaurant_id(user), None)
    return {"ok": True, "enabled": body.enabled, "trigger": body.trigger}


@admin_router.post("/pairing-token")
async def regenerate_pairing_token(user=Depends(require_restaurant)):
    token = _pairing_token()
    await db.restaurants.update_one(
        {"id": _restaurant_id(user)},
        {"$set": {
            "printing_pairing_token_hash": _sha256(token.replace("-", "").upper()),
            "printing_pairing_token_hint": token[-4:],
            "updated_at": now_iso(),
        }},
    )
    return {"pairing_token": token}


@admin_router.post("/agents/{agent_id}/revoke")
async def revoke_agent(agent_id: str, user=Depends(require_restaurant)):
    result = await db.print_agents.update_one(
        {"id": agent_id, "restaurant_id": _restaurant_id(user)},
        {"$set": {"revoked": True, "revoked_at": now_iso(), "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Computador nao encontrado")
    return {"ok": True}


@admin_router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: str, user=Depends(require_restaurant)):
    result = await db.print_jobs.update_one(
        {"id": job_id, "restaurant_id": _restaurant_id(user)},
        {"$set": {
            "status": "queued",
            "attempts": 0,
            "next_attempt_at": now_iso(),
            "last_error": "",
            "lease_until": None,
            "agent_id": None,
            "updated_at": now_iso(),
        }},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Impressao nao encontrada")
    return {"ok": True}


async def _require_agent(authorization: str = Header("")) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Agente nao autenticado")
    raw_token = authorization[7:].strip()
    if not raw_token:
        raise HTTPException(status_code=401, detail="Agente nao autenticado")
    agent = await db.print_agents.find_one(
        {"token_hash": _sha256(raw_token), "revoked": {"$ne": True}},
        {"_id": 0},
    )
    if not agent:
        raise HTTPException(status_code=401, detail="Vinculo do aplicativo invalido")
    return agent


@agent_router.post("/pair")
async def pair_agent(body: PairInput):
    user = await db.users.find_one({"email": body.email.lower()})
    if (
        not user
        or not user.get("restaurant_id")
        or user.get("role") not in {"owner", "manager"}
        or not verify_password(body.password, user.get("password_hash", ""))
    ):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")

    restaurant = await db.restaurants.find_one({"id": user["restaurant_id"]}, {"_id": 0})
    normalized_pairing = body.pairing_token.replace("-", "").replace(" ", "").upper()
    expected = (restaurant or {}).get("printing_pairing_token_hash", "")
    if not expected or not hmac.compare_digest(_sha256(normalized_pairing), expected):
        raise HTTPException(status_code=401, detail="Token de pareamento invalido")

    raw_access_token = secrets.token_urlsafe(48)
    token_hash = _sha256(raw_access_token)
    await db.print_agents.update_many(
        {
            "restaurant_id": user["restaurant_id"],
            "device_id": {"$ne": body.device_id},
            "revoked": {"$ne": True},
        },
        {"$set": {"revoked": True, "revoked_at": now_iso(), "updated_at": now_iso()}},
    )
    existing = await db.print_agents.find_one(
        {"restaurant_id": user["restaurant_id"], "device_id": body.device_id},
        {"_id": 0},
    )
    timestamp = now_iso()
    if existing:
        await db.print_agents.update_one(
            {"id": existing["id"], "restaurant_id": user["restaurant_id"]},
            {"$set": {
                "token_hash": token_hash,
                "device_name": body.device_name,
                "app_version": body.app_version,
                "revoked": False,
                "paired_by": str(user["_id"]),
                "last_seen_at": timestamp,
                "updated_at": timestamp,
            }},
        )
        agent_id = existing["id"]
    else:
        agent_id = new_id()
        await db.print_agents.insert_one({
            "id": agent_id,
            "restaurant_id": user["restaurant_id"],
            "device_id": body.device_id,
            "device_name": body.device_name,
            "app_version": body.app_version,
            "token_hash": token_hash,
            "revoked": False,
            "paired_by": str(user["_id"]),
            "last_seen_at": timestamp,
            "created_at": timestamp,
            "updated_at": timestamp,
        })
    return {
        "access_token": raw_access_token,
        "agent_id": agent_id,
        "restaurant": {"id": restaurant["id"], "name": restaurant.get("name", "")},
    }


@agent_router.post("/heartbeat")
async def heartbeat(body: dict, agent=Depends(_require_agent)):
    await db.print_agents.update_one(
        {"id": agent["id"]},
        {"$set": {
            "last_seen_at": now_iso(),
            "app_version": str(body.get("app_version") or agent.get("app_version") or "")[:40],
            "printer_name": str(body.get("printer_name") or "")[:250],
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True}


@agent_router.post("/jobs/claim")
async def claim_job(agent=Depends(_require_agent)):
    await reconcile_print_jobs(agent["restaurant_id"])
    now = now_iso()
    await db.print_jobs.update_many(
        {
            "restaurant_id": agent["restaurant_id"],
            "status": "printing",
            "attempts": {"$gte": MAX_ATTEMPTS},
            "lease_until": {"$lte": now},
        },
        {"$set": {
            "status": "failed",
            "last_error": "Limite de tentativas atingido",
            "lease_until": None,
            "updated_at": now,
        }},
    )
    candidates = await db.print_jobs.find(
        {
            "restaurant_id": agent["restaurant_id"],
            "attempts": {"$lt": MAX_ATTEMPTS},
            "$or": [
                {"status": "queued", "next_attempt_at": {"$lte": now}},
                {"status": "printing", "lease_until": {"$lte": now}},
            ],
        },
        {"_id": 0},
    ).sort("created_at", 1).to_list(10)

    for job in candidates:
        lease_until = (datetime.now(timezone.utc) + timedelta(seconds=LEASE_SECONDS)).isoformat()
        result = await db.print_jobs.update_one(
            {
                "id": job["id"],
                "restaurant_id": agent["restaurant_id"],
                "$or": [
                    {"status": "queued", "next_attempt_at": {"$lte": now}},
                    {"status": "printing", "lease_until": {"$lte": now}},
                ],
            },
            {"$set": {
                "status": "printing",
                "agent_id": agent["id"],
                "lease_until": lease_until,
                "claimed_at": now,
                "updated_at": now,
            }, "$inc": {"attempts": 1}},
        )
        if result.modified_count == 1:
            claimed = await db.print_jobs.find_one({"id": job["id"]}, {"_id": 0})
            return {"job": claimed}
    return {"job": None}


@agent_router.post("/jobs/{job_id}/complete")
async def complete_job(job_id: str, agent=Depends(_require_agent)):
    timestamp = now_iso()
    result = await db.print_jobs.update_one(
        {
            "id": job_id,
            "restaurant_id": agent["restaurant_id"],
            "status": "printing",
            "agent_id": agent["id"],
        },
        {"$set": {
            "status": "printed",
            "printed_at": timestamp,
            "lease_until": None,
            "last_error": "",
            "updated_at": timestamp,
        }},
    )
    if result.matched_count == 0:
        current = await db.print_jobs.find_one(
            {"id": job_id, "restaurant_id": agent["restaurant_id"]}, {"_id": 0, "status": 1}
        )
        if current and current.get("status") == "printed":
            return {"ok": True}
        raise HTTPException(status_code=409, detail="Tarefa nao pertence mais a este computador")
    return {"ok": True}


@agent_router.post("/jobs/{job_id}/fail")
async def fail_job(job_id: str, body: AgentFailureInput, agent=Depends(_require_agent)):
    job = await db.print_jobs.find_one(
        {"id": job_id, "restaurant_id": agent["restaurant_id"], "agent_id": agent["id"]},
        {"_id": 0},
    )
    if not job:
        raise HTTPException(status_code=404, detail="Tarefa nao encontrada")
    attempts = int(job.get("attempts") or 1)
    delay = min(5 * (2 ** min(attempts - 1, 6)), 300)
    retry_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
    status = "failed" if attempts >= MAX_ATTEMPTS else "queued"
    await db.print_jobs.update_one(
        {"id": job_id, "restaurant_id": agent["restaurant_id"]},
        {"$set": {
            "status": status,
            "last_error": body.error,
            "next_attempt_at": retry_at,
            "lease_until": None,
            "updated_at": now_iso(),
        }},
    )
    logger.warning("Print job %s failed on agent %s: %s", job_id, agent["id"], body.error)
    return {"ok": True, "retry_at": retry_at, "status": status}
