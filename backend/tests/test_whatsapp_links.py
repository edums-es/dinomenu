import asyncio
import os
import sys
from pathlib import Path
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/dinomenu_test")

import whatsapp


class _Restaurants:
    def __init__(self, restaurant):
        self.restaurant = restaurant

    async def find_one(self, query, projection=None):
        return self.restaurant if query.get("id") == self.restaurant.get("id") else None


def test_restaurant_public_url_uses_central_domain_by_default():
    assert whatsapp._restaurant_public_url({"slug": "openfoods"}) == "https://app.easygrowth.com.br"


def test_restaurant_public_url_allows_store_specific_domain():
    assert whatsapp._restaurant_public_url({"custom_domain": "loja.example.com"}) == "https://loja.example.com"


def test_restaurant_public_url_allows_explicit_legacy_domain_for_its_owner():
    assert whatsapp._restaurant_public_url({"custom_domain": "www.marisco27.com.br"}) == "https://www.marisco27.com.br"


def test_chatbot_menu_link_does_not_use_legacy_customer_domain():
    message = whatsapp._chatbot("cardapio", {"slug": "openfoods"})

    assert "https://app.easygrowth.com.br/cardapio/openfoods" in message
    assert "marisco27" not in message


def test_status_notification_tracking_link_does_not_use_legacy_customer_domain(monkeypatch):
    restaurant = {
        "id": "restaurant-1",
        "name": "Open Foods",
        "slug": "openfoods",
        "wa_notify_statuses": ["out_for_delivery"],
    }
    sent = {}

    async def fake_send_whatsapp(_restaurant, phone, message):
        sent["phone"] = phone
        sent["message"] = message
        return True

    monkeypatch.setattr(whatsapp, "db", SimpleNamespace(restaurants=_Restaurants(restaurant)))
    monkeypatch.setattr(whatsapp, "send_whatsapp", fake_send_whatsapp)

    asyncio.run(whatsapp.notify_order_status({
        "id": "order-1",
        "restaurant_id": "restaurant-1",
        "order_number": 33,
        "customer": {"name": "Karol", "phone": "(27) 99999-9999"},
    }, "out_for_delivery"))

    assert "https://app.easygrowth.com.br/pedido/order-1" in sent["message"]
    assert "marisco27" not in sent["message"]
