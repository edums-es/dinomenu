import pytest

from flemy import normalize_phone, public_order, safe_webhook_url, whatsapp_phone


def test_normalize_phone_uses_suffix_for_customer_matching():
    assert normalize_phone("+55 (27) 99999-1234") == "99991234"


def test_whatsapp_phone_adds_brazil_country_code():
    assert whatsapp_phone("(27) 99999-1234") == "5527999991234"
    assert whatsapp_phone("+55 (27) 99999-1234") == "5527999991234"


def test_safe_webhook_url_rejects_local_targets():
    with pytest.raises(ValueError):
        safe_webhook_url("http://localhost:8000/hook")
    assert safe_webhook_url("https://hooks.example.com/flemy") == "https://hooks.example.com/flemy"


def test_public_order_exposes_only_automation_contract():
    result = public_order({
        "id": "order-1",
        "order_number": 42,
        "status": "pending",
        "customer": {"name": "Ana", "phone": "27999991234", "private": "x"},
        "items": [{"product_id": "p1", "product_name": "Combo", "quantity": 1, "unit_price": 20, "total_price": 20}],
        "internal_secret": "never",
    })

    assert result["number"] == 42
    assert result["customer"] == {"name": "Ana", "phone": "27999991234"}
    assert result["tracking_url"].endswith("/pedido/order-1")
    assert "internal_secret" not in result
