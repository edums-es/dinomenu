"""Printing settings, queue and local print-agent endpoints."""
import io
import json
import os
import secrets
import zipfile
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from auth import require_restaurant
from db import db
from models import clean, new_id, now_iso

router = APIRouter(prefix="/api", tags=["printing"])


def rid(user):
    return user["restaurant_id"]


PRINTING_DEFAULTS = {
    "printing_enabled": False,
    "printing_trigger_status": "accepted",
    "printer_name": "",
    "printer_copies": 1,
    "printer_include_customer_phone": True,
    "printer_include_address": True,
    "printer_include_payment": True,
}


def _find_windows_setup() -> Optional[Path]:
    here = Path(__file__).resolve()
    candidates = [
        here.parent / "installers",
        here.parent / "print-agent" / "dist",
        here.parents[1] / "print-agent" / "dist",
        here.parents[0] / "print-agent" / "dist",
        Path.cwd() / "print-agent" / "dist",
        Path.cwd() / "installers",
        Path.cwd() / "dist",
    ]
    matches = []
    for folder in candidates:
        if folder.exists():
            matches.extend(folder.glob("Dino Menu Impressora Setup*.exe"))
    matches = [p for p in matches if p.exists()]
    if not matches:
        return None
    return sorted(matches, key=lambda p: p.stat().st_mtime, reverse=True)[0]


class PrintingSettingsIn(BaseModel):
    printing_enabled: bool = False
    printing_trigger_status: str = "accepted"
    printer_name: Optional[str] = ""
    printer_copies: int = 1
    printer_include_customer_phone: bool = True
    printer_include_address: bool = True
    printer_include_payment: bool = True


class QzSignatureIn(BaseModel):
    request: str


class AgentClaimIn(BaseModel):
    token: str
    agent_id: Optional[str] = "eg-print-agent"
    limit: int = 5


class AgentCompleteIn(BaseModel):
    token: str
    agent_id: Optional[str] = "eg-print-agent"
    success: bool = True
    error: Optional[str] = None


def _read_env_or_file(value_key: str, path_key: str) -> Optional[str]:
    value = os.getenv(value_key)
    if value:
        return value.replace("\\n", "\n")
    path = os.getenv(path_key)
    if path:
        cert_path = Path(path)
        if cert_path.exists():
            return cert_path.read_text(encoding="utf-8")
    return None


def _generate_qz_material() -> dict:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "BR"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "EG Delivery"),
        x509.NameAttribute(NameOID.COMMON_NAME, "app.easygrowth.com.br"),
    ])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(days=1))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("app.easygrowth.com.br"),
                x509.DNSName("*.easygrowth.com.br"),
            ]),
            critical=False,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CODE_SIGNING]), critical=False)
        .sign(key, hashes.SHA256())
    )
    return {
        "version": 2,
        "certificate": certificate.public_bytes(serialization.Encoding.PEM).decode("utf-8"),
        "private_key": key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        ).decode("utf-8"),
    }


async def _get_qz_material() -> dict:
    env_certificate = _read_env_or_file("QZ_CERTIFICATE", "QZ_CERTIFICATE_PATH")
    env_private_key = _read_env_or_file("QZ_PRIVATE_KEY", "QZ_PRIVATE_KEY_PATH")
    if env_certificate and env_private_key:
        return {"certificate": env_certificate, "private_key": env_private_key}
    if env_certificate or env_private_key:
        raise HTTPException(
            503,
            "QZ Tray parcialmente configurado. Defina certificado e chave privada juntos.",
        )

    stored = await db.platform_settings.find_one({"_id": "qz_tray"}, {"_id": 0})
    if stored and stored.get("version") == 2 and stored.get("certificate") and stored.get("private_key"):
        return {"certificate": stored["certificate"], "private_key": stored["private_key"]}

    generated = _generate_qz_material()
    await db.platform_settings.update_one(
        {"_id": "qz_tray"},
        {"$set": {**generated, "created_at": now_iso(), "updated_at": now_iso()}},
        upsert=True,
    )
    return generated


def _money(value) -> str:
    try:
        return f"R$ {float(value):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "R$ 0,00"


def _line(width=32, char="-") -> str:
    return char * width


def _clean(value, fallback="") -> str:
    return str(value or fallback).strip()


def _receipt_lines(order: dict, restaurant: dict) -> list[str]:
    cfg = {**PRINTING_DEFAULTS, **(restaurant or {})}
    customer = order.get("customer") or {}
    address = order.get("address") or {}
    items = order.get("items") or []

    lines = [
        _clean(restaurant.get("name"), "Dino Menu"),
        f"Pedido #{order.get('order_number', '')}",
        _line(),
        f"Cliente: {_clean(customer.get('name'), 'Cliente')}",
    ]
    if cfg.get("printer_include_customer_phone") and customer.get("phone"):
        lines.append(f"Telefone: {customer.get('phone')}")
    lines.append(f"Tipo: {'Entrega' if order.get('type') == 'delivery' else 'Retirada'}")

    if cfg.get("printer_include_address") and address:
        street = " ".join([
            _clean(address.get("street")),
            _clean(address.get("number")),
        ]).strip()
        if street:
            lines.append(f"Endereco: {street}")
        if address.get("neighborhood"):
            lines.append(f"Bairro: {address.get('neighborhood')}")
        if address.get("complement"):
            lines.append(f"Compl.: {address.get('complement')}")
        if address.get("reference"):
            lines.append(f"Ref.: {address.get('reference')}")

    if order.get("scheduled_for"):
        lines.append(f"Agendado: {order.get('scheduled_for')}")

    lines.extend([_line(), "ITENS"])

    for item in items:
        qty = item.get("quantity", 1)
        name = _clean(item.get("product_name"), "Produto")
        total = _money(item.get("total_price", 0))
        lines.append(f"{qty}x {name}")
        for op in item.get("options") or []:
            price = op.get("price", 0)
            suffix = f" (+{_money(price)})" if price else ""
            lines.append(f"  + {_clean(op.get('name'))}{suffix}")
        if item.get("notes"):
            lines.append(f"  Obs: {item.get('notes')}")
        lines.append(f"  {total}")

    lines.extend([
        _line(),
        f"Subtotal: {_money(order.get('subtotal', 0))}",
        f"Entrega:  {_money(order.get('delivery_fee', 0))}",
    ])
    if order.get("discount", 0):
        lines.append(f"Desconto: -{_money(order.get('discount', 0))}")

    lines.append(f"TOTAL:    {_money(order.get('total', 0))}")

    if cfg.get("printer_include_payment"):
        lines.append(f"Pagamento: {_clean(order.get('payment_method'), '-')}")
        if order.get("change_for"):
            lines.append(f"Troco p/: {_money(order.get('change_for'))}")

    if order.get("customer_notes"):
        lines.extend([_line(), f"Obs: {order.get('customer_notes')}"])

    lines.extend([_line(), ""])
    return lines


async def build_print_payload(order: dict) -> dict:
    restaurant = await db.restaurants.find_one({"id": order["restaurant_id"]}, {"_id": 0}) or {}
    lines = _receipt_lines(order, restaurant)
    return {
        "format": "text",
        "encoding": "utf-8",
        "restaurant_name": restaurant.get("name", "Dino Menu"),
        "order_id": order.get("id"),
        "order_number": order.get("order_number"),
        "copies": max(1, min(int(restaurant.get("printer_copies") or 1), 5)),
        "printer_name": restaurant.get("printer_name") or "",
        "text": "\n".join(lines),
        "lines": lines,
    }


async def enqueue_print_job(order: dict, reason: str = "auto_status") -> Optional[dict]:
    restaurant = await db.restaurants.find_one({"id": order["restaurant_id"]}, {"_id": 0}) or {}
    cfg = {**PRINTING_DEFAULTS, **restaurant}

    if reason == "auto_status":
        if not cfg.get("printing_enabled"):
            return None
        if order.get("status") != cfg.get("printing_trigger_status", "accepted"):
            return None

    dedupe_key = f"{order['restaurant_id']}:{order['id']}:{order.get('status')}:{reason}"
    existing = await db.print_jobs.find_one({"dedupe_key": dedupe_key}, {"_id": 0})
    if existing:
        return existing

    payload = await build_print_payload(order)
    doc = {
        "id": new_id(),
        "restaurant_id": order["restaurant_id"],
        "order_id": order["id"],
        "order_number": order.get("order_number"),
        "dedupe_key": dedupe_key,
        "reason": reason,
        "status": "queued",
        "attempts": 0,
        "payload": payload,
        "error": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.print_jobs.insert_one(doc)
    return clean(doc)


def _settings_from_restaurant(restaurant: dict) -> dict:
    token = restaurant.get("printer_agent_token")
    if not token:
        token = secrets.token_urlsafe(24)
    return {
        **PRINTING_DEFAULTS,
        **{k: restaurant.get(k) for k in PRINTING_DEFAULTS.keys() if k in restaurant},
        "printer_agent_token": token,
        "agent_endpoint": "/api/print-agent/jobs/claim",
    }


@router.get("/admin/printing/settings")
async def get_printing_settings(user=Depends(require_restaurant)):
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    if not restaurant:
        raise HTTPException(404, "Restaurante nao encontrado")
    settings = _settings_from_restaurant(restaurant)
    if not restaurant.get("printer_agent_token"):
        await db.restaurants.update_one({"id": rid(user)}, {"$set": {"printer_agent_token": settings["printer_agent_token"]}})
    return settings


@router.put("/admin/printing/settings")
async def update_printing_settings(data: PrintingSettingsIn, user=Depends(require_restaurant)):
    trigger = data.printing_trigger_status
    if trigger not in ("pending", "accepted", "preparing", "ready"):
        raise HTTPException(400, "Status de impressao invalido")
    payload = data.model_dump()
    payload["printer_copies"] = max(1, min(int(payload.get("printer_copies") or 1), 5))
    payload["updated_at"] = now_iso()
    await db.restaurants.update_one({"id": rid(user)}, {"$set": payload})
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    return _settings_from_restaurant(restaurant or {})


@router.post("/admin/printing/token")
async def regenerate_printing_token(user=Depends(require_restaurant)):
    token = secrets.token_urlsafe(32)
    await db.restaurants.update_one({"id": rid(user)}, {"$set": {"printer_agent_token": token, "updated_at": now_iso()}})
    return {"printer_agent_token": token}


@router.get("/admin/printing/qz/certificate", response_class=PlainTextResponse)
async def get_qz_certificate(user=Depends(require_restaurant)):
    material = await _get_qz_material()
    return material["certificate"]


@router.post("/admin/printing/qz/signature")
async def sign_qz_request(data: QzSignatureIn, user=Depends(require_restaurant)):
    material = await _get_qz_material()
    try:
        import base64
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
    except Exception as exc:
        raise HTTPException(500, f"Biblioteca de assinatura indisponivel: {exc}")

    try:
        key = serialization.load_pem_private_key(material["private_key"].encode("utf-8"), password=None)
        signature = key.sign(data.request.encode("utf-8"), padding.PKCS1v15(), hashes.SHA512())
    except Exception as exc:
        raise HTTPException(500, f"Nao foi possivel assinar requisicao QZ Tray: {exc}")
    return {"signature": base64.b64encode(signature).decode("ascii")}


@router.get("/admin/printing/jobs")
async def list_print_jobs(limit: int = 50, user=Depends(require_restaurant)):
    limit = max(1, min(limit, 200))
    jobs = await db.print_jobs.find({"restaurant_id": rid(user)}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return jobs


@router.get("/admin/printing/agent/download")
async def download_print_agent(request: Request, user=Depends(require_restaurant)):
    restaurant = await db.restaurants.find_one({"id": rid(user)}, {"_id": 0})
    if not restaurant:
        raise HTTPException(404, "Restaurante nao encontrado")
    settings = _settings_from_restaurant(restaurant)
    if not restaurant.get("printer_agent_token"):
        await db.restaurants.update_one({"id": rid(user)}, {"$set": {"printer_agent_token": settings["printer_agent_token"]}})

    api_url = str(request.base_url).rstrip("/") + "/api"
    printer_name = restaurant.get("printer_name") or ""
    setup_exe = _find_windows_setup()

    config = {
        "api": api_url,
        "endpoint": api_url,
        "api_url": api_url,
        "token": settings["printer_agent_token"],
        "store_token": settings["printer_agent_token"],
        "printer_agent_token": settings["printer_agent_token"],
        "chave": settings["printer_agent_token"],
        "key": settings["printer_agent_token"],
        "printer_name": printer_name,
        "poll_ms": 5000,
        "agent_id": f"{restaurant.get('slug') or restaurant.get('id')}-print-agent",
        "agentId": f"{restaurant.get('slug') or restaurant.get('id')}-print-agent",
    }

    if not setup_exe:
        raise HTTPException(
            500,
            "Instalador Windows nao encontrado no servidor. Gere print-agent/dist/Dino Menu Impressora Setup.exe antes do deploy.",
        )

    install_bat = """@echo off
title Instalar Dino Menu Impressora
set "CONFIG_FILE=%~dp0config.egdelivery.json"
if not exist "%CONFIG_FILE%" set "CONFIG_FILE=%~dp0config.json"
if not exist "%CONFIG_FILE%" (
  echo Arquivo de vinculo da loja nao encontrado.
  echo Baixe novamente o instalador pelo painel da loja.
  pause
  exit /b 1
)

taskkill /IM "Dino Menu Impressora.exe" /F >nul 2>nul
taskkill /IM "EG Delivery.exe" /F >nul 2>nul
taskkill /IM "eg-delivery-print-agent.exe" /F >nul 2>nul

for %%D in (
  "%APPDATA%\\Dino Menu Impressora"
  "%APPDATA%\\DinoMenu Impressora"
  "%APPDATA%\\EG Delivery"
  "%APPDATA%\\EG Delivery Printer"
  "%APPDATA%\\EG Delivery Impressora"
  "%APPDATA%\\EG Delivery Impressora Automatica"
  "%APPDATA%\\eg-delivery-print-agent"
  "%APPDATA%\\egdelivery-print-agent"
  "%LOCALAPPDATA%\\Dino Menu Impressora"
  "%LOCALAPPDATA%\\DinoMenu Impressora"
  "%LOCALAPPDATA%\\EG Delivery"
  "%LOCALAPPDATA%\\EG Delivery Printer"
  "%LOCALAPPDATA%\\EG Delivery Impressora"
  "%LOCALAPPDATA%\\EG Delivery Impressora Automatica"
  "%LOCALAPPDATA%\\eg-delivery-print-agent"
  "%LOCALAPPDATA%\\egdelivery-print-agent"
) do (
  mkdir "%%~D" >nul 2>nul
  copy /Y "%CONFIG_FILE%" "%%~D\\config.json" >nul
  copy /Y "%CONFIG_FILE%" "%%~D\\config.egdelivery.json" >nul
)

start "" /wait "%~dp0Dino Menu Impressora Setup.exe"

for %%E in (
  "%LOCALAPPDATA%\\Programs\\Dino Menu Impressora\\Dino Menu Impressora.exe"
  "%LOCALAPPDATA%\\Programs\\EG Delivery\\EG Delivery.exe"
  "%LOCALAPPDATA%\\Dino Menu Impressora\\Dino Menu Impressora.exe"
  "%LOCALAPPDATA%\\EG Delivery\\EG Delivery.exe"
) do (
  if exist "%%~E" start "" "%%~E"
)

echo.
echo Dino Menu Impressora instalado e vinculado a esta loja.
pause
"""

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.write(setup_exe, "Dino Menu Impressora Setup.exe", compress_type=zipfile.ZIP_STORED)
        z.writestr("config.egdelivery.json", json.dumps(config, indent=2, ensure_ascii=False))
        z.writestr("config.json", json.dumps(config, indent=2, ensure_ascii=False))
        z.writestr("1-CLIQUE-AQUI-PARA-INSTALAR-E-VINCULAR.bat", install_bat)
        z.writestr("1-INSTALAR-E-VINCULAR-IMPRESSORA.bat", install_bat)
        z.writestr("Instalar Dino Menu Impressora.bat", install_bat)
        z.writestr("LEIA-ME-PRIMEIRO.txt", (
            "Dino Menu - Instalador da Impressora\n\n"
            "1. Extraia este ZIP no computador da loja conectado a impressora.\n"
            "2. De dois cliques em: 1-CLIQUE-AQUI-PARA-INSTALAR-E-VINCULAR.bat\n"
            "3. Confirme a instalacao do programa.\n"
            "4. Pronto. O icone do Dino Menu ficara perto do relogio do Windows.\n\n"
            "Nao execute apenas o .exe, pois ele instala o app sem vincular a loja.\n\n"
            "Dentro do programa, use Testar impressao para conferir a impressora.\n"
            "Para suporte, abra Logs e suporte no icone da bandeja.\n"
        ))
    buf.seek(0)

    headers = {"Content-Disposition": 'attachment; filename="dino-menu-impressora-windows.zip"'}
    return StreamingResponse(buf, media_type="application/zip", headers=headers)


@router.post("/admin/orders/{oid}/print")
async def manual_print_order(oid: str, user=Depends(require_restaurant)):
    order = await db.orders.find_one({"id": oid, "restaurant_id": rid(user)}, {"_id": 0})
    if not order:
        raise HTTPException(404, "Pedido nao encontrado")
    job = await enqueue_print_job(order, reason="manual")
    return job or {"ok": False}


async def _restaurant_by_token(token: str) -> dict:
    restaurant = await db.restaurants.find_one({"printer_agent_token": token}, {"_id": 0})
    if not restaurant:
        raise HTTPException(401, "Token de impressao invalido")
    return restaurant


@router.post("/print-agent/jobs/claim")
async def claim_print_jobs(data: AgentClaimIn):
    restaurant = await _restaurant_by_token(data.token)
    limit = max(1, min(data.limit, 10))
    stale_before = (datetime.now(timezone.utc) - timedelta(minutes=3)).isoformat()
    await db.print_jobs.update_many(
        {
            "restaurant_id": restaurant["id"],
            "status": "claimed",
            "claimed_at": {"$lt": stale_before},
            "attempts": {"$lt": 5},
        },
        {"$set": {"status": "queued", "error": "Agent timeout; job requeued", "updated_at": now_iso()}},
    )
    jobs = await db.print_jobs.find({
        "restaurant_id": restaurant["id"],
        "status": {"$in": ["queued", "failed"]},
        "attempts": {"$lt": 5},
    }, {"_id": 0}).sort("created_at", 1).to_list(limit)

    claimed = []
    for job in jobs:
        await db.print_jobs.update_one(
            {"id": job["id"], "restaurant_id": restaurant["id"]},
            {"$set": {
                "status": "claimed",
                "agent_id": data.agent_id,
                "claimed_at": now_iso(),
                "updated_at": now_iso(),
            }, "$inc": {"attempts": 1}},
        )
        job["status"] = "claimed"
        job["agent_id"] = data.agent_id
        job["attempts"] = int(job.get("attempts") or 0) + 1
        claimed.append(job)
    return {"jobs": claimed}


@router.post("/print-agent/jobs/{job_id}/complete")
async def complete_print_job(job_id: str, data: AgentCompleteIn):
    restaurant = await _restaurant_by_token(data.token)
    job = await db.print_jobs.find_one({"id": job_id, "restaurant_id": restaurant["id"]}, {"_id": 0})
    if not job:
        raise HTTPException(404, "Job nao encontrado")
    status = "printed" if data.success else "failed"
    await db.print_jobs.update_one(
        {"id": job_id, "restaurant_id": restaurant["id"]},
        {"$set": {
            "status": status,
            "agent_id": data.agent_id,
            "error": data.error,
            "printed_at": now_iso() if data.success else job.get("printed_at"),
            "updated_at": now_iso(),
        }},
    )
    return {"ok": True, "status": status}
