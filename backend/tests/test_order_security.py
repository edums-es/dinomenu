import asyncio
import ast
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from models import OrderItemIn, OrderItemOption
from order_security import calculate_order, next_sequence, reserve_stock


class FakeCollection:
    def __init__(self, documents):
        self.documents = documents

    async def find_one(self, query, *args, **kwargs):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document.copy()
        return None

    async def update_one(self, query, update, **kwargs):
        for document in self.documents:
            matches = True
            for key, value in query.items():
                if isinstance(value, dict) and "$gte" in value:
                    matches = matches and document.get(key, 0) >= value["$gte"]
                else:
                    matches = matches and document.get(key) == value
            if matches:
                for key, value in update.get("$inc", {}).items():
                    document[key] = document.get(key, 0) + value
                return SimpleNamespace(modified_count=1)
        return SimpleNamespace(modified_count=0)


class FakeSequenceCollection:
    def __init__(self):
        self.value = 0

    async def update_one(self, query, update, **kwargs):
        self.value = max(self.value, update.get("$max", {}).get("value", self.value))
        return SimpleNamespace(modified_count=1)

    async def find_one_and_update(self, query, update, **kwargs):
        self.value += update["$inc"]["value"]
        return {"value": self.value}


class FakeOrdersCollection:
    async def find_one(self, query, projection, sort=None):
        return {"order_number": 8}


class FakeSequenceDb:
    def __init__(self):
        self.orders = FakeOrdersCollection()
        self.sequences = FakeSequenceCollection()

    def __getitem__(self, name):
        return getattr(self, name)


def sample_product(**overrides):
    product = {
        "id": "product-a",
        "restaurant_id": "restaurant-a",
        "name": "Produto oficial",
        "price": 20.0,
        "promotional_price": None,
        "is_available": True,
        "track_stock": True,
        "stock_quantity": 5,
        "option_groups": [{
            "name": "Adicionais",
            "type": "multiple",
            "required": False,
            "min": 0,
            "max": 2,
            "options": [{"name": "Bacon", "price": 5.0}],
        }],
    }
    product.update(overrides)
    return product


def requested_item(product_id="product-a", quantity=2):
    return OrderItemIn(
        product_id=product_id,
        product_name="Nome manipulado",
        quantity=quantity,
        unit_price=0.01,
        options=[OrderItemOption(group="Adicionais", name="Bacon", price=0.0)],
        total_price=0.01,
    )


def test_calculator_ignores_client_prices_and_validates_options():
    product = sample_product()
    db = SimpleNamespace(
        products=FakeCollection([product]),
        coupons=FakeCollection([]),
    )

    result = asyncio.run(calculate_order(db, {"id": "restaurant-a"}, [requested_item()]))

    assert result["items"][0]["product_name"] == "Produto oficial"
    assert result["items"][0]["unit_price"] == 20.0
    assert result["items"][0]["options"][0]["price"] == 5.0
    assert result["items"][0]["total_price"] == 50.0
    assert result["subtotal"] == 50.0


def test_calculator_applies_quantity_discount_from_restaurant_settings():
    product = sample_product(track_stock=False, option_groups=[])
    db = SimpleNamespace(
        products=FakeCollection([product]),
        coupons=FakeCollection([]),
    )
    item = requested_item(quantity=3)
    item.options = []

    result = asyncio.run(calculate_order(
        db,
        {
            "id": "restaurant-a",
            "quantity_discount_min_items": 3,
            "quantity_discount_percent": 10,
        },
        [item],
    ))

    assert result["subtotal"] == 60.0
    assert result["quantity_discount"] == 6.0
    assert result["discount"] == 6.0


def test_calculator_does_not_accept_product_from_another_restaurant():
    db = SimpleNamespace(
        products=FakeCollection([sample_product(restaurant_id="restaurant-b")]),
        coupons=FakeCollection([]),
    )

    with pytest.raises(HTTPException) as error:
        asyncio.run(calculate_order(db, {"id": "restaurant-a"}, [requested_item()]))

    assert error.value.status_code == 400


def test_stock_reservation_is_atomic_and_rejects_insufficient_stock():
    product = sample_product(stock_quantity=1)
    db = SimpleNamespace(products=FakeCollection([product]))

    with pytest.raises(HTTPException) as error:
        asyncio.run(reserve_stock(db, "restaurant-a", [{"product_id": "product-a", "quantity": 2}]))

    assert error.value.status_code == 409
    assert product["stock_quantity"] == 1


def test_order_numbers_are_unique_and_continue_existing_sequence():
    async def run():
        db = FakeSequenceDb()
        return await asyncio.gather(*[
            next_sequence(db, "restaurant-a", "order", "orders", "order_number")
            for _ in range(25)
        ])

    numbers = asyncio.run(run())
    assert len(set(numbers)) == 25
    assert min(numbers) == 9
    assert max(numbers) == 33


def test_admin_core_entities_are_always_tenant_scoped():
    source = (BACKEND_DIR / "routes_admin.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    protected = {"products", "categories", "orders", "banners", "coupons"}
    unsafe = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr not in {"find_one", "update_one", "delete_one"} or not node.args:
            continue
        collection = getattr(getattr(node.func.value, "attr", None), "strip", lambda: "")()
        if collection not in protected or not isinstance(node.args[0], ast.Dict):
            continue
        keys = {
            key.value for key in node.args[0].keys
            if isinstance(key, ast.Constant) and isinstance(key.value, str)
        }
        if "id" in keys and "restaurant_id" not in keys:
            unsafe.append((collection, node.lineno))

    assert unsafe == []
