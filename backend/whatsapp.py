"""
WhatsApp multi-provider: Evolution API (self-hosted) ou Kirago (SaaS).
URLs e keys lidas do banco (painel super admin) com fallback para env.
"""
import os
import re
import logging
import unicodedata
import httpx

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from db import db
from models import now_iso

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])
DEFAULT_PUBLIC_URL = "https://www.marisco27.com.br"


def _instance_name(restaurant_id):
    return re.sub(r"[^a-zA-Z0-9_]", "", restaurant_id)[:32]


def _brl(value):
    return "R$ {:,.2f}".format(float(value)).replace(",","X").replace(".",",").replace("X",".")


def _normalize(text):
    nfkd = unicodedata.normalize("NFD", text.lower())
    return re.sub(r"[^\w\s]", "", "".join(c for c in nfkd if not unicodedata.combining(c)))


async def _platform(key, fallback=""):
    """Le config do super admin com fallback para env var."""
    from routes_superadmin import get_platform_setting
    return await get_platform_setting(key, os.environ.get(key.upper(), fallback))


def _normalize_public_url(url):
    url = (url or DEFAULT_PUBLIC_URL).strip().rstrip("/")
    if "localhost" in url or "127.0.0.1" in url:
        return DEFAULT_PUBLIC_URL
    return url


async def _public_url():
    return _normalize_public_url(await _platform("public_url", DEFAULT_PUBLIC_URL))


async def _send_via_evolution(restaurant_id, phone, message):
    instance = _instance_name(restaurant_id)
    evo_url = (await _platform("evolution_api_url", "http://evolution-api:8080")).rstrip("/")
    evo_key = await _platform("evolution_api_key", os.environ.get("EVOLUTION_API_KEY", "menudigital_evo_key"))
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{evo_url}/message/sendText/{instance}",
                headers={"apikey": evo_key, "Content-Type": "application/json"},
                json={"number": phone, "text": message},
            )
            if resp.status_code in (200, 201):
                logger.info(f"[WA/Evo] Enviado para {phone}")
                return True
            logger.warning(f"[WA/Evo] {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        logger.error(f"[WA/Evo] Erro: {e}")
    return False


async def _send_via_kirago(kirago_token, phone, message):
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://kirago.com.br/chat/send/text",
                headers={"token": kirago_token, "Content-Type": "application/json"},
                json={"Phone": phone, "Body": message},
            )
            if resp.status_code in (200, 201):
                logger.info(f"[WA/Kira] Enviado para {phone}")
                return True
            logger.warning(f"[WA/Kira] {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        logger.error(f"[WA/Kira] Erro: {e}")
    return False


async def send_whatsapp(restaurant, to_phone, message):
    """Envia WhatsApp usando o provider configurado no painel super admin."""
    raw = re.sub(r"\D", "", to_phone)
    if not raw.startswith("55"):
        raw = "55" + raw

    provider = (await _platform("wa_provider", "evolution")).lower()

    if provider == "kirago":
        token = restaurant.get("kirago_token", "")
        if not token:
            logger.warning(f"[WA/Kira] restaurante {restaurant.get('id')} sem token Kirago")
            return False
        return await _send_via_kirago(token, raw, message)

    return await _send_via_evolution(restaurant["id"], raw, message)


STATUS_MESSAGES = {
    "accepted": (
        "✅ *Pedido #{number} confirmado!*\n\n"
        "Olá, *{name}*! Seu pedido foi aceito e já está sendo preparado com muito carinho.\n\n"
        "\U0001f4f2 Acompanhe o status em tempo real:\n{tracking_url}"
    ),
    "preparing": (
        "\U0001f468‍\U0001f373 *Pedido #{number} em preparo!*\n\n"
        "Olá, *{name}*! Nossa equipe está com a mão na massa preparando o seu pedido agora.\n\n"
        "\U0001f4f2 Acompanhe aqui:\n{tracking_url}"
    ),
    "ready": (
        "\U0001f389 *Pedido #{number} pronto!*\n\n"
        "Olá, *{name}*! Seu pedido ficou prontinho e está quentinho esperando por você!\n\n"
        "\U0001f4f2 Acompanhe:\n{tracking_url}"
    ),
    "out_for_delivery": (
        "\U0001f6f5 *Pedido #{number} saiu para entrega!*\n\n"
        "Olá, *{name}*! Seu pedido está a caminho! Em breve chegará até você.\n\n"
        "\U0001f4f2 Acompanhe em tempo real:\n{tracking_url}"
    ),
    "completed": (
        "⭐ *Pedido #{number} entregue!*\n\n"
        "Olá, *{name}*! Esperamos que tenha gostado!\n"
        "Foi um prazer atendê-lo(a). Obrigado por escolher o *{restaurant}*!\n\n"
        "Até o próximo pedido!"
    ),
    "cancelled": (
        "❌ *Pedido #{number} cancelado*\n\n"
        "Olá, *{name}*. Infelizmente seu pedido foi cancelado.\n\n"
        "Entre em contato conosco para mais informações. Pedimos desculpas pelo transtorno!"
    ),
}


async def notify_order_status(order, new_status):
    if new_status not in STATUS_MESSAGES:
        return
    customer_phone = (order.get("customer") or {}).get("phone", "")
    if not customer_phone:
        return
    restaurant = await db.restaurants.find_one({"id": order["restaurant_id"]}, {"_id": 0})
    if not restaurant:
        return
    default_statuses = ["accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled"]
    if new_status not in restaurant.get("wa_notify_statuses", default_statuses):
        return
    public_url = await _public_url()
    tracking_url = f"{public_url}/pedido/{order.get('id', '')}"
    try:
        msg = STATUS_MESSAGES[new_status].format(
            number=order.get("order_number", ""),
            name=(order.get("customer") or {}).get("name", "cliente"),
            restaurant=restaurant.get("name", ""),
            tracking_url=tracking_url,
        )
        await send_whatsapp(restaurant, customer_phone, msg)
    except Exception as e:
        logger.error(f"[WA] Erro ao enviar status {new_status} para pedido {order.get('id')}: {e}")


@router.post("/webhook/{restaurant_id}")
async def whatsapp_webhook(restaurant_id, request: Request):
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"ok": False})

    event = payload.get("event", "")
    data = payload.get("data", {})
    messages = []

    if event == "messages.upsert":
        messages = data if isinstance(data, list) else [data]
    elif payload.get("Type") == "Message":
        info = payload.get("Info", {})
        body = (payload.get("Text") or {}).get("Body", "")
        sender = info.get("Sender", "")
        if body and sender and not info.get("IsFromMe"):
            messages = [{"_kirago": True, "phone": sender, "body": body}]

    restaurant = await db.restaurants.find_one({"id": restaurant_id}, {"_id": 0})
    if not restaurant:
        return JSONResponse({"ok": True})

    for msg_data in messages:
        if msg_data.get("_kirago"):
            phone = re.sub(r"[^0-9]", "", msg_data["phone"])
            body = msg_data["body"]
        else:
            if (msg_data.get("key") or {}).get("fromMe"):
                continue
            body = (
                (msg_data.get("message") or {}).get("conversation") or
                ((msg_data.get("message") or {}).get("extendedTextMessage") or {}).get("text") or ""
            )
            phone = re.sub(r"[^0-9]", "", (msg_data.get("key") or {}).get("remoteJid", ""))
        if not body or not phone:
            continue
        await db.whatsapp_logs.insert_one({
            "restaurant_id": restaurant_id, "direction": "in",
            "from": phone, "body": body, "created_at": now_iso(),
        })
        response = _chatbot(body, restaurant)
        await send_whatsapp(restaurant, phone, response)

    return JSONResponse({"ok": True})


def _chatbot(text, restaurant):
    q = _normalize(text)
    name = restaurant.get("name", "")
    if re.search(r"\b(oi|ola|bom dia|boa tarde|boa noite|hello|ei)\b", q):
        return f"Ola! Bem-vindo ao {name}!\nComo posso te ajudar?\nendereco | horario | entrega | pagamento | cardapio"
    if re.search(r"\b(enderec|onde|fica|bairro|rua)\b", q):
        parts = [p for p in [restaurant.get("address"), restaurant.get("neighborhood"),
                              restaurant.get("city"), restaurant.get("state")] if p]
        return "Endereco: " + ", ".join(parts) if parts else "Endereco nao cadastrado."
    if re.search(r"\b(horario|hora|abre|fecha|funciona)\b", q):
        h = restaurant.get("opening_hours") or {}
        dm = {"mon":"Seg","tue":"Ter","wed":"Qua","thu":"Qui","fri":"Sex","sat":"Sab","sun":"Dom"}
        lines = [f"{lb}: {h[k]['start']}-{h[k]['end']}" for k, lb in dm.items() if h.get(k, {}).get("open")]
        return "Horarios:\n" + "\n".join(lines) if lines else "Horarios nao cadastrados."
    if re.search(r"\b(entrega|frete|taxa)\b", q):
        fee = restaurant.get("flat_delivery_fee")
        eta = restaurant.get("average_delivery_time")
        parts = []
        if fee is not None: parts.append("Taxa: " + ("gratis!" if fee == 0 else _brl(fee)))
        if eta: parts.append("Tempo: " + str(eta))
        return "Entrega:\n" + "\n".join(parts) if parts else "Consulte a taxa."
    if re.search(r"\b(pagamento|pix|cartao|dinheiro)\b", q):
        methods = restaurant.get("payment_methods") or ["Pix, Cartao, Dinheiro"]
        out = "Pagamento:\n" + "\n".join("- " + m for m in methods)
        if restaurant.get("pix_key"): out += f"\n\nChave Pix: {restaurant['pix_key']}"
        return out
    if re.search(r"\b(cardapio|menu|produto|lanche|comida)\b", q):
        slug = restaurant.get("slug", "")
        url = _normalize_public_url(os.environ.get("PUBLIC_URL"))
        return f"Cardapio: {url}/loja/{slug}"
    if re.search(r"\b(obrigad|valeu|brigad)\b", q):
        return "Por nada! Bom apetite!"
    return "Tente: endereco | horario | entrega | pagamento | cardapio"
