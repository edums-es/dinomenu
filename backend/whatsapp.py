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
DEFAULT_PUBLIC_URL = "https://app.easygrowth.com.br"
LEGACY_SHARED_PUBLIC_URLS = {
    "https://marisco27.com.br",
    "https://www.marisco27.com.br",
}


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


def _normalize_public_url(url, fallback=DEFAULT_PUBLIC_URL, block_shared=True):
    url = (url or DEFAULT_PUBLIC_URL).strip().rstrip("/")
    if url and "://" not in url:
        url = f"https://{url}"
    if (
        "localhost" in url
        or "127.0.0.1" in url
        or (block_shared and url in LEGACY_SHARED_PUBLIC_URLS)
    ):
        return fallback
    return url


async def _public_url():
    return _normalize_public_url(await _platform("public_url", DEFAULT_PUBLIC_URL))


def _restaurant_public_url(restaurant):
    for key in ("public_url", "custom_domain", "domain", "whitelabel_domain", "menu_domain"):
        value = (restaurant or {}).get(key)
        if value:
            return _normalize_public_url(value, block_shared=False)
    return DEFAULT_PUBLIC_URL


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
    restaurant_id = restaurant.get("id")

    if provider == "kirago":
        token = restaurant.get("kirago_token", "")
        if not token:
            logger.warning(f"[WA/Kira] restaurante {restaurant.get('id')} sem token Kirago")
            try:
                from operational_alerts import upsert_operational_alert
                await upsert_operational_alert(
                    restaurant_id,
                    "whatsapp_disconnected",
                    "WhatsApp precisa de atencao",
                    "O token do WhatsApp nao esta configurado. As mensagens automaticas para clientes nao serao enviadas.",
                    severity="warning",
                    category="whatsapp",
                    action_label="Configurar WhatsApp",
                    action_url="/supermaster/whatsapp",
                    metadata={"provider": "kirago", "reason": "missing_token"},
                )
            except Exception:
                pass
            return False
        sent = await _send_via_kirago(token, raw, message)
    else:
        sent = await _send_via_evolution(restaurant["id"], raw, message)

    try:
        from operational_alerts import resolve_operational_alert, upsert_operational_alert
        if sent:
            await resolve_operational_alert(restaurant_id, "whatsapp_disconnected")
            await resolve_operational_alert(restaurant_id, "whatsapp_send_failed")
        else:
            await upsert_operational_alert(
                restaurant_id,
                "whatsapp_send_failed",
                "Falha ao enviar WhatsApp",
                "Uma mensagem automatica nao foi entregue. Verifique se o WhatsApp esta conectado e faca um envio de teste.",
                severity="critical",
                category="whatsapp",
                action_label="Testar WhatsApp",
                action_url="/supermaster/whatsapp",
                metadata={"provider": provider, "to": raw[-4:]},
            )
    except Exception:
        pass
    return sent


TRACKING_LINK_MODES = {"first", "all", "none"}
TRACKING_STATUS_ORDER = ["accepted", "preparing", "ready", "out_for_delivery"]

STATUS_MESSAGES = {
    "accepted": (
        "✅ *Pedido #{number} confirmado!*\n\n"
        "Olá, *{name}*! Seu pedido foi aceito e já está sendo preparado com muito carinho."
    ),
    "preparing": (
        "\U0001f468‍\U0001f373 *Pedido #{number} em preparo!*\n\n"
        "Olá, *{name}*! Nossa equipe está com a mão na massa preparando o seu pedido agora."
    ),
    "ready": (
        "\U0001f389 *Pedido #{number} pronto!*\n\n"
        "Olá, *{name}*! Seu pedido ficou prontinho e está quentinho esperando por você!"
    ),
    "out_for_delivery": (
        "\U0001f6f5 *Pedido #{number} saiu para entrega!*\n\n"
        "Olá, *{name}*! Seu pedido está a caminho! Em breve chegará até você."
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


def _status_template(restaurant, status):
    templates = restaurant.get("wa_message_templates") or {}
    custom = templates.get(status)
    if isinstance(custom, str) and custom.strip():
        return custom.strip()
    return STATUS_MESSAGES[status]


def _tracking_link_mode(restaurant):
    mode = (restaurant.get("wa_tracking_link_mode") or "first").strip().lower()
    return mode if mode in TRACKING_LINK_MODES else "first"


def _should_include_tracking_link(restaurant, status, enabled_statuses):
    if status not in TRACKING_STATUS_ORDER:
        return False
    mode = _tracking_link_mode(restaurant)
    if mode == "none":
        return False
    if mode == "all":
        return True
    first_enabled = next((item for item in TRACKING_STATUS_ORDER if item in enabled_statuses), None)
    return status == first_enabled


def _remove_tracking_placeholder_lines(template):
    lines = [line for line in template.splitlines() if "{tracking_url}" not in line]
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines).strip()


def _format_status_template(template, values):
    message = template
    for key, value in values.items():
        message = message.replace("{" + key + "}", str(value))
    return message


def _build_status_message(order, restaurant, status):
    default_statuses = ["accepted", "preparing", "ready", "out_for_delivery", "completed", "cancelled"]
    enabled_statuses = restaurant.get("wa_notify_statuses", default_statuses)
    include_tracking = _should_include_tracking_link(restaurant, status, enabled_statuses)
    public_url = _restaurant_public_url(restaurant)
    tracking_url = f"{public_url}/pedido/{order.get('id', '')}"
    template = _status_template(restaurant, status)

    if not include_tracking:
        template = _remove_tracking_placeholder_lines(template)

    message = _format_status_template(template, {
        "number": order.get("order_number", ""),
        "name": (order.get("customer") or {}).get("name", "cliente"),
        "restaurant": restaurant.get("name", ""),
        "tracking_url": tracking_url if include_tracking else "",
    }).strip()

    if include_tracking and "{tracking_url}" not in template:
        message += f"\n\n\U0001f4f2 Acompanhe seu pedido:\n{tracking_url}"
    return message


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
    try:
        msg = _build_status_message(order, restaurant, new_status)
        if restaurant.get("flemy_push_status_notifications"):
            from flemy import send_flemy_push
            sent = await send_flemy_push(
                restaurant,
                customer_phone,
                msg,
                f"order:{order.get('id', '')}:status:{new_status}",
            )
            if sent:
                return
            logger.warning("[WA] Flemy Push falhou; usando provider Start como fallback")
        sent = await send_whatsapp(restaurant, customer_phone, msg)
        if not sent:
            logger.warning("[WA] notificacao de status nao entregue para pedido %s", order.get("id"))
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
        url = _restaurant_public_url(restaurant)
        return f"Cardapio: {url}/cardapio/{slug}"
    if re.search(r"\b(obrigad|valeu|brigad)\b", q):
        return "Por nada! Bom apetite!"
    return "Tente: endereco | horario | entrega | pagamento | cardapio"
