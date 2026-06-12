"""Flemy CRM integration: outbound events and secure tool helpers."""
import hashlib
import hmac
import json
import logging
import re
from urllib.parse import urlparse

import httpx

from db import db
from models import new_id, now_iso

logger = logging.getLogger(__name__)

FLEMY_EVENTS = {
    "order.created",
    "order.status_changed",
    "order.cancelled",
    "payment.paid",
    "payment.pending",
}

DEFAULT_FLEMY_EVENTS = sorted(FLEMY_EVENTS)


def normalize_phone(value):
    return re.sub(r"\D", "", value or "")[-8:]


def safe_webhook_url(value: str) -> str:
    value = (value or "").strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("URL de webhook invalida")
    if parsed.hostname.lower() in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Webhook local nao permitido")
    return value


def public_order(order: dict) -> dict:
    customer = order.get("customer") or {}
    return {
        "id": order.get("id"),
        "number": order.get("order_number"),
        "status": order.get("status"),
        "payment_status": order.get("payment_status"),
        "type": order.get("type"),
        "total": order.get("total"),
        "subtotal": order.get("subtotal"),
        "delivery_fee": order.get("delivery_fee"),
        "discount": order.get("discount"),
        "coupon_code": order.get("coupon_code"),
        "payment_method": order.get("payment_method"),
        "customer_notes": order.get("customer_notes"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
        "customer": {"name": customer.get("name"), "phone": customer.get("phone")},
        "address": order.get("address"),
        "items": [
            {
                "product_id": item.get("product_id"),
                "name": item.get("product_name") or item.get("name"),
                "quantity": item.get("quantity"),
                "unit_price": item.get("unit_price"),
                "total_price": item.get("total_price"),
                "options": item.get("options") or [],
            }
            for item in order.get("items") or []
        ],
    }


async def emit_flemy_event(restaurant: dict, event: str, order: dict = None, data: dict = None):
    if not restaurant or not restaurant.get("flemy_enabled") or event not in FLEMY_EVENTS:
        return False
    if event not in restaurant.get("flemy_events", DEFAULT_FLEMY_EVENTS):
        return False
    try:
        webhook_url = safe_webhook_url(restaurant.get("flemy_webhook_url"))
    except ValueError:
        return False

    event_id = new_id()
    payload = {
        "event_id": event_id,
        "event": event,
        "occurred_at": now_iso(),
        "source": "dinomenu",
        "restaurant": {
            "id": restaurant.get("id"),
            "name": restaurant.get("name"),
            "slug": restaurant.get("slug"),
        },
        "order": public_order(order) if order else None,
        "data": data or {},
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
    headers = {
        "Content-Type": "application/json",
        "X-Dino-Event": event,
        "X-Dino-Event-Id": event_id,
    }
    secret = (restaurant.get("flemy_webhook_secret") or "").strip()
    if secret:
        headers["X-Dino-Signature"] = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()

    log = {
        "id": event_id,
        "restaurant_id": restaurant.get("id"),
        "provider": "flemy",
        "event": event,
        "status": "pending",
        "created_at": now_iso(),
    }
    try:
        async with httpx.AsyncClient(timeout=12) as client:
            response = await client.post(webhook_url, content=raw, headers=headers)
        log.update({
            "status": "sent" if 200 <= response.status_code < 300 else "failed",
            "http_status": response.status_code,
            "response": response.text[:500],
        })
        return log["status"] == "sent"
    except Exception as exc:
        log.update({"status": "failed", "error": str(exc)[:500]})
        logger.error("[Flemy] evento %s falhou: %s", event, exc)
        return False
    finally:
        await db.integration_logs.insert_one(log)


async def find_customer_orders(restaurant_id: str, phone: str = "", order_number=None, order_id: str = ""):
    query = {"restaurant_id": restaurant_id}
    if order_id:
        query["id"] = order_id
    if order_number not in (None, ""):
        try:
            query["order_number"] = int(order_number)
        except (TypeError, ValueError):
            return []
    if phone:
        suffix = normalize_phone(phone)
        if not suffix:
            return []
        query["customer_phone_suffix"] = suffix
    if len(query) == 1:
        return []
    return await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(10)
