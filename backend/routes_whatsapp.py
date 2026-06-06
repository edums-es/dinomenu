"""
WhatsApp multi-provider: Evolution API ou Kirago.
Super Admin escolhe em platform_settings.wa_provider.
URL e Key do Evolution sao lidas do banco (painel super) com fallback para env.
"""
import os
import re
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_restaurant
from db import db
from models import now_iso

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/admin/whatsapp", tags=["whatsapp"])

TIMEOUT = 15


async def _get_platform(key, fallback=""):
    """Le configuracao do banco (super admin) com fallback para env var."""
    from routes_superadmin import get_platform_setting
    return await get_platform_setting(key, os.environ.get(key.upper(), fallback))


async def _get_provider():
    return (await _get_platform("wa_provider", "evolution")).lower()


async def _evo_url():
    return (await _get_platform("evolution_api_url", "http://evolution-api:8080")).rstrip("/")


async def _evo_key():
    return await _get_platform("evolution_api_key", os.environ.get("EVOLUTION_API_KEY", "menudigital_evo_key"))


def _instance(restaurant_id):
    return re.sub(r"[^a-zA-Z0-9_]", "", restaurant_id)[:32]


def _kira_headers(token):
    return {"token": token, "Content-Type": "application/json"}


def rid(user):
    return user["restaurant_id"]


async def _get_kira_token(restaurant_id):
    r = await db.restaurants.find_one({"id": restaurant_id}, {"kirago_token": 1, "_id": 0})
    return (r or {}).get("kirago_token")


async def _evo(method, path, **kwargs):
    url = await _evo_url()
    key = await _evo_key()
    headers = {"apikey": key, "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await getattr(client, method)(
                f"{url}{path}", headers=headers, **kwargs
            )
            return resp.status_code, resp.json() if resp.content else {}
    except httpx.ConnectError:
        raise HTTPException(503, f"Evolution API indisponivel em {url}. Verifique a URL e o container.")
    except httpx.TimeoutException:
        raise HTTPException(504, "Timeout ao conectar ao Evolution API.")
    except Exception as e:
        raise HTTPException(500, f"Erro Evolution API: {str(e)}")


async def _kira(method, path, token, **kwargs):
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await getattr(client, method)(
                f"https://kirago.com.br{path}",
                headers={"token": token, "Content-Type": "application/json"},
                **kwargs
            )
            return resp.status_code, resp.json() if resp.content else {}
    except httpx.ConnectError:
        raise HTTPException(503, "Kirago API indisponivel.")
    except httpx.TimeoutException:
        raise HTTPException(504, "Timeout Kirago.")
    except Exception as e:
        raise HTTPException(500, f"Erro Kirago: {str(e)}")


async def _evo_ensure_instance(instance, restaurant_id):
    sc, data = await _evo("get", "/instance/fetchInstances")
    if isinstance(data, list):
        exists = any(
            (i.get("instance", {}).get("instanceName") or i.get("instanceName")) == instance
            for i in data
        )
        if exists:
            return
    backend_url = os.environ.get("BACKEND_URL", "http://backend:8001")
    await _evo("post", "/instance/create", json={
        "instanceName": instance,
        "qrcode": True,
        "integration": "WHATSAPP-BAILEYS",
        "webhook": {
            "url": f"{backend_url}/api/whatsapp/webhook/{restaurant_id}",
            "byEvents": True,
            "base64": False,
            "events": ["messages.upsert"],
        },
    })


@router.get("/provider")
async def wa_get_provider(user=Depends(require_restaurant)):
    provider = await _get_provider()
    result = {"provider": provider}
    if provider == "kirago":
        token = await _get_kira_token(rid(user))
        result["has_token"] = bool(token)
    return result


class KiraTokenIn(BaseModel):
    token: str

@router.put("/token")
async def wa_save_token(body: KiraTokenIn, user=Depends(require_restaurant)):
    if not body.token.strip():
        raise HTTPException(400, "Token invalido")
    sc, data = await _kira("get", "/session/status", token=body.token.strip())
    if sc in (401, 403):
        raise HTTPException(401, "Token Kirago invalido")
    await db.restaurants.update_one(
        {"id": rid(user)},
        {"$set": {"kirago_token": body.token.strip(), "updated_at": now_iso()}},
    )
    try:
        await _kira("post", "/session/connect", token=body.token.strip(),
                    json={"Subscribe": ["All"], "Immediate": True})
    except Exception:
        pass
    return {"ok": True}


@router.get("/status")
async def wa_status(user=Depends(require_restaurant)):
    provider = await _get_provider()
    try:
        if provider == "kirago":
            token = await _get_kira_token(rid(user))
            if not token:
                return {"status": "no_token", "provider": "kirago"}
            sc, data = await _kira("get", "/session/status", token=token)
            if sc != 200:
                return {"status": "disconnected", "provider": "kirago"}
            d = data.get("data") or data
            if d.get("Connected") and d.get("LoggedIn"):
                mapped = "connected"
            elif d.get("LoggedIn"):
                mapped = "connecting"
            else:
                mapped = "disconnected"
        else:
            instance = _instance(rid(user))
            sc, data = await _evo("get", f"/instance/connectionState/{instance}")
            if sc == 404:
                return {"status": "disconnected", "provider": "evolution"}
            state = (data.get("instance") or data).get("state", "close")
            mapped = {"open": "connected", "close": "disconnected", "connecting": "connecting"}.get(state, state)

        await db.restaurants.update_one(
            {"id": rid(user)},
            {"$set": {"wa_status": mapped, "wa_updated_at": now_iso()}},
        )
        return {"status": mapped, "provider": provider}
    except HTTPException as e:
        if e.status_code in (503, 504):
            return {"status": "disconnected", "provider": provider}
        raise


@router.get("/qr")
async def wa_qr(user=Depends(require_restaurant)):
    provider = await _get_provider()

    if provider == "kirago":
        token = await _get_kira_token(rid(user))
        if not token:
            return {"status": "no_token", "qr": None, "provider": "kirago"}
        sc, status_data = await _kira("get", "/session/status", token=token)
        d = (status_data.get("data") or status_data)
        if sc == 200 and d.get("Connected") and d.get("LoggedIn"):
            return {"status": "connected", "qr": None, "provider": "kirago"}
        await _kira("post", "/session/connect", token=token,
                    json={"Subscribe": ["All"], "Immediate": True})
        sc, qr_data = await _kira("get", "/session/qr", token=token)
        if sc == 200:
            qr = (qr_data.get("data") or qr_data).get("QRCode")
            if qr:
                return {"status": "qr", "qr": qr, "provider": "kirago"}
        return {"status": "initializing", "qr": None, "provider": "kirago"}

    else:
        instance = _instance(rid(user))
        await _evo_ensure_instance(instance, rid(user))
        try:
            sc, state_data = await _evo("get", f"/instance/connectionState/{instance}")
            state = (state_data.get("instance") or state_data).get("state", "close")
            if state == "open":
                return {"status": "connected", "qr": None, "provider": "evolution"}
        except Exception:
            pass
        sc, qr_data = await _evo("get", f"/instance/connect/{instance}")
        if sc == 200:
            qr = qr_data.get("base64") or (qr_data.get("qrcode") or {}).get("base64")
            if qr:
                return {"status": "qr", "qr": qr, "provider": "evolution"}
        return {"status": "initializing", "qr": None, "provider": "evolution"}


@router.delete("/disconnect")
async def wa_disconnect(user=Depends(require_restaurant)):
    provider = await _get_provider()
    if provider == "kirago":
        token = await _get_kira_token(rid(user))
        if token:
            try:
                await _kira("post", "/session/logout", token=token)
            except Exception:
                pass
        await db.restaurants.update_one(
            {"id": rid(user)},
            {"$unset": {"kirago_token": ""}, "$set": {"wa_status": "disconnected", "wa_updated_at": now_iso()}},
        )
    else:
        instance = _instance(rid(user))
        for path in [f"/instance/logout/{instance}", f"/instance/delete/{instance}"]:
            try:
                await _evo("delete", path)
            except Exception:
                pass
        await db.restaurants.update_one(
            {"id": rid(user)},
            {"$set": {"wa_status": "disconnected", "wa_updated_at": now_iso()}},
        )
    return {"ok": True}


@router.get("/settings")
async def wa_get_settings(user=Depends(require_restaurant)):
    r = await db.restaurants.find_one({"id": rid(user)}, {"wa_notify_statuses": 1, "_id": 0})
    default = ["accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled"]
    return {"notify_statuses": (r or {}).get("wa_notify_statuses", default)}


@router.put("/settings")
async def wa_update_settings(body: dict, user=Depends(require_restaurant)):
    statuses = body.get("notify_statuses", [])
    await db.restaurants.update_one(
        {"id": rid(user)},
        {"$set": {"wa_notify_statuses": statuses, "updated_at": now_iso()}},
    )
    return {"ok": True, "notify_statuses": statuses}


@router.post("/test")
async def wa_send_test(body: dict, user=Depends(require_restaurant)):
    phone = body.get("phone", "").strip()
    if not phone:
        raise HTTPException(400, "Informe o numero de telefone")
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    if not restaurant:
        raise HTTPException(404, "Restaurante nao encontrado")
    from whatsapp import send_whatsapp
    ok = await send_whatsapp(restaurant, phone, "Teste Menu Digital - WhatsApp configurado!")
    if not ok:
        raise HTTPException(400, "Falha ao enviar. Verifique a conexao WhatsApp.")
    return {"ok": True}
