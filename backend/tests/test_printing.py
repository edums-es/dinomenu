import asyncio
from types import SimpleNamespace

import routes_printing


class FakePrintJobs:
    def __init__(self):
        self.documents = []

    async def find_one(self, query, projection=None):
        return next((doc for doc in self.documents if doc.get("job_key") == query.get("job_key")), None)

    async def insert_one(self, document):
        self.documents.append(dict(document))
        return SimpleNamespace(inserted_id=document["id"])


def test_enqueue_is_disabled_by_default(monkeypatch):
    jobs = FakePrintJobs()
    monkeypatch.setattr(routes_printing, "db", SimpleNamespace(print_jobs=jobs))

    created = asyncio.run(
        routes_printing.enqueue_order_print(
            {"id": "restaurant-1"},
            {"id": "order-1", "order_number": 1},
            "created",
        )
    )

    assert created is False
    assert jobs.documents == []


def test_enqueue_is_idempotent(monkeypatch):
    jobs = FakePrintJobs()
    monkeypatch.setattr(routes_printing, "db", SimpleNamespace(print_jobs=jobs))
    restaurant = {
        "id": "restaurant-1",
        "name": "Loja",
        "printing_enabled": True,
        "printing_trigger": "created",
    }
    order = {
        "id": "order-1",
        "order_number": 10,
        "status": "pending",
        "items": [],
        "customer": {},
    }

    first = asyncio.run(routes_printing.enqueue_order_print(restaurant, order, "created"))
    second = asyncio.run(routes_printing.enqueue_order_print(restaurant, order, "created"))

    assert first is True
    assert second is False
    assert len(jobs.documents) == 1
    assert jobs.documents[0]["job_key"] == "restaurant-1:order-1:created:general"


def test_unpaid_pix_is_not_printed(monkeypatch):
    jobs = FakePrintJobs()
    monkeypatch.setattr(routes_printing, "db", SimpleNamespace(print_jobs=jobs))
    restaurant = {
        "id": "restaurant-1",
        "printing_enabled": True,
        "printing_trigger": "created",
    }
    order = {
        "id": "order-1",
        "pix_charge": {"status": "ACTIVE"},
        "payment_status": "awaiting",
    }

    created = asyncio.run(routes_printing.enqueue_order_print(restaurant, order, "created"))

    assert created is False
    assert jobs.documents == []


def test_pairing_token_is_easy_to_type_and_has_enough_entropy():
    token = routes_printing._pairing_token()
    assert len(token) == 14
    assert token[4] == token[9] == "-"
    assert "0" not in token
    assert "O" not in token
