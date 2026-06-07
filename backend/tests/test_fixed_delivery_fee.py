import asyncio
import os
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/dinomenu_test")

from models import AddressInfo, CustomerInfo, OrderIn, OrderItemIn
from routes_public import _expected_delivery_fee


def sample_order(order_type="delivery"):
    return OrderIn(
        type=order_type,
        customer=CustomerInfo(name="Cliente", phone="27999999999"),
        address=AddressInfo(
            cep="00000-000",
            street="Rua Teste",
            number="10",
            neighborhood="Bairro distante",
        ) if order_type == "delivery" else None,
        items=[
            OrderItemIn(
                product_id="product-1",
                product_name="Produto",
                quantity=1,
                unit_price=20,
                total_price=20,
            )
        ],
        subtotal=20,
        delivery_fee=999,
        total=1019,
        payment_method="Dinheiro",
    )


def test_delivery_always_uses_flat_fee_and_ignores_legacy_zones():
    restaurant = {
        "accepts_delivery": True,
        "flat_delivery_fee": 7.5,
        "delivery_fee_mode": "neighborhood",
        "delivery_zones": [{"neighborhood": "Centro", "fee": 99, "active": True}],
    }

    fee = asyncio.run(_expected_delivery_fee(restaurant, sample_order()))

    assert fee == 7.5


def test_pickup_has_no_delivery_fee():
    fee = asyncio.run(_expected_delivery_fee({"flat_delivery_fee": 7.5}, sample_order("pickup")))

    assert fee == 0


def test_delivery_disabled_is_still_rejected():
    with pytest.raises(HTTPException, match="Restaurante nao aceita entrega"):
        asyncio.run(_expected_delivery_fee({"accepts_delivery": False}, sample_order()))
