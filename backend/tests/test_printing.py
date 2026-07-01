import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import routes_printing
from routes_printing import enqueue_print_job


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = documents or []

    async def find_one(self, query, *args, **kwargs):
        for document in self.documents:
            if all(document.get(key) == value for key, value in query.items()):
                return document.copy()
        return None

    async def insert_one(self, document):
        self.documents.append(document.copy())
        return SimpleNamespace(inserted_id=document["id"])


def restaurant(**overrides):
    data = {
        "id": "restaurant-a",
        "name": "Loja Teste",
        "printing_enabled": True,
        "printing_trigger_status": "accepted",
        "printer_copies": 1,
    }
    data.update(overrides)
    return data


def order(**overrides):
    data = {
        "id": "order-a",
        "restaurant_id": "restaurant-a",
        "order_number": 12,
        "status": "pending",
        "type": "delivery",
        "customer": {"name": "Cliente", "phone": "11999999999"},
        "items": [{"quantity": 1, "product_name": "Produto", "total_price": 10}],
        "subtotal": 10,
        "delivery_fee": 0,
        "discount": 0,
        "total": 10,
        "payment_method": "Pix",
    }
    data.update(overrides)
    return data


def run_with_fake_db(monkeypatch, restaurant_doc, order_doc):
    fake_db = SimpleNamespace(
        restaurants=FakeCollection([restaurant_doc]),
        print_jobs=FakeCollection([]),
    )
    monkeypatch.setattr(routes_printing, "db", fake_db)
    job = asyncio.run(enqueue_print_job(order_doc, "auto_status"))
    return job, fake_db


def test_print_job_is_created_when_order_enters_pending_trigger(monkeypatch):
    job, fake_db = run_with_fake_db(
        monkeypatch,
        restaurant(printing_trigger_status="pending"),
        order(status="pending"),
    )

    assert job is not None
    assert job["status"] == "queued"
    assert len(fake_db.print_jobs.documents) == 1


def test_print_job_waits_for_configured_accepted_status(monkeypatch):
    job, fake_db = run_with_fake_db(
        monkeypatch,
        restaurant(printing_trigger_status="accepted"),
        order(status="pending"),
    )

    assert job is None
    assert fake_db.print_jobs.documents == []


def test_print_job_is_created_when_order_reaches_accepted_trigger(monkeypatch):
    job, fake_db = run_with_fake_db(
        monkeypatch,
        restaurant(printing_trigger_status="accepted"),
        order(status="accepted"),
    )

    assert job is not None
    assert job["order_id"] == "order-a"
    assert job["payload"]["order_number"] == 12
    assert len(fake_db.print_jobs.documents) == 1


def test_auto_print_job_is_deduplicated_by_order_status(monkeypatch):
    restaurant_doc = restaurant(printing_trigger_status="pending")
    order_doc = order(status="pending")
    fake_db = SimpleNamespace(
        restaurants=FakeCollection([restaurant_doc]),
        print_jobs=FakeCollection([]),
    )
    monkeypatch.setattr(routes_printing, "db", fake_db)

    first = asyncio.run(enqueue_print_job(order_doc, "auto_status"))
    second = asyncio.run(enqueue_print_job(order_doc, "auto_status"))

    assert first["id"] == second["id"]
    assert len(fake_db.print_jobs.documents) == 1
