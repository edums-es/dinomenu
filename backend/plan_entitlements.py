"""Plan entitlement helpers used by billing and restaurant admin."""
from __future__ import annotations

import unicodedata
from typing import Any


FEATURE_CATALOG = [
    {"key": "orders", "label": "Pedidos e kanban", "category": "Operacao"},
    {"key": "menu", "label": "Cardapio digital", "category": "Cardapio"},
    {"key": "pdv", "label": "PDV / caixa", "category": "Operacao"},
    {"key": "automatic_printing", "label": "Impressao automatica", "category": "Operacao"},
    {"key": "whatsapp", "label": "WhatsApp e mensagens", "category": "Atendimento"},
    {"key": "pix", "label": "Pix online", "category": "Pagamento"},
    {"key": "delivery_zones", "label": "Taxa por bairro/regiao", "category": "Entrega"},
    {"key": "tables_qr", "label": "Mesas e QR Code", "category": "Salao"},
    {"key": "waiters", "label": "Garcons", "category": "Salao"},
    {"key": "delivery_people", "label": "Entregadores", "category": "Entrega"},
    {"key": "stock", "label": "Estoque", "category": "Gestao"},
    {"key": "suppliers", "label": "Fornecedores", "category": "Gestao"},
    {"key": "loyalty", "label": "Fidelidade", "category": "Marketing"},
    {"key": "wholesale", "label": "Atacado", "category": "Vendas"},
    {"key": "coupons", "label": "Cupons", "category": "Marketing"},
    {"key": "reports", "label": "Relatorios", "category": "Gestao"},
    {"key": "custom_brand", "label": "Marca e aparencia", "category": "White-label"},
    {"key": "menu_import", "label": "Importar cardapio", "category": "Migracao"},
]

DEFAULT_FEATURE_FLAGS = {item["key"]: False for item in FEATURE_CATALOG}


def normalize_text(value: Any) -> str:
    text = str(value or "").strip().lower()
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def normalize_feature_flags(flags: Any) -> dict:
    normalized = DEFAULT_FEATURE_FLAGS.copy()
    if isinstance(flags, dict):
        for key in normalized:
            normalized[key] = bool(flags.get(key))
    return normalized


def normalize_billing_options(options: Any) -> dict:
    defaults = {"monthly": True, "yearly": True, "lifetime": False}
    if isinstance(options, dict):
        for key in defaults:
            defaults[key] = bool(options.get(key, defaults[key]))
    return defaults


def normalize_plan_payload(plan: dict | None) -> dict:
    data = dict(plan or {})
    data["feature_flags"] = normalize_feature_flags(data.get("feature_flags"))
    data["billing_options"] = normalize_billing_options(data.get("billing_options"))
    data["plan_type"] = data.get("plan_type") or "subscription"
    data["updates_policy"] = data.get("updates_policy") or (
        "paid_upgrades" if data["plan_type"] == "legacy_lifetime" else "included"
    )
    data["upgrade_note"] = data.get("upgrade_note") or ""
    return data


def is_legacy_lifetime_plan(
    restaurant: dict | None = None,
    plan: dict | None = None,
    subscription: dict | None = None,
) -> bool:
    plan = normalize_plan_payload(plan)
    restaurant = restaurant or {}
    subscription = subscription or {}

    if plan.get("plan_type") == "legacy_lifetime":
        return True
    if plan.get("updates_policy") == "paid_upgrades":
        return True
    if subscription.get("billing_cycle") == "lifetime":
        return True
    if restaurant.get("billing_cycle") == "lifetime":
        return True

    plan_words = " ".join([
        normalize_text(plan.get("name")),
        normalize_text(plan.get("slug")),
        normalize_text(restaurant.get("plan")),
    ])
    return any(word in plan_words for word in ("vitalicio", "lifetime", "legado"))


def updates_policy_for(
    restaurant: dict | None = None,
    plan: dict | None = None,
    subscription: dict | None = None,
) -> str:
    return "paid_upgrades" if is_legacy_lifetime_plan(restaurant, plan, subscription) else "included"
