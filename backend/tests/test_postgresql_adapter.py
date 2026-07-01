from db import _aggregate, _apply_update, _matches, _project, _sort_documents, _sql_prefilter


def test_matches_nested_fields_and_document_query_operators():
    document = {
        "restaurant_id": "restaurant-1",
        "status": "pending",
        "stock_quantity": 5,
        "customer": {"phone": "(27) 99999-1234"},
    }

    assert _matches(document, {
        "restaurant_id": "restaurant-1",
        "status": {"$in": ["pending", "accepted"]},
        "stock_quantity": {"$gte": 3, "$lt": 10},
        "customer.phone": {"$regex": r"99999[^0-9]*1234"},
    })
    assert not _matches(document, {"status": {"$ne": "pending"}})
    assert _matches(document, {"scheduled_for": {"$exists": False}})


def test_apply_update_supports_application_update_operators():
    document = {"_id": "1", "points": 5, "profile": {"name": "Old"}, "movements": []}

    updated = _apply_update(document, {
        "$set": {"profile.name": "New"},
        "$inc": {"points": 3},
        "$max": {"highest": 10},
        "$push": {"movements": {"type": "credit"}},
        "$unset": {"profile.legacy": ""},
    })

    assert updated["profile"]["name"] == "New"
    assert updated["points"] == 8
    assert updated["highest"] == 10
    assert updated["movements"] == [{"type": "credit"}]


def test_projection_and_sort_preserve_route_contracts():
    documents = [
        {"_id": "1", "name": "B", "created_at": "2026-01-02", "secret": "x"},
        {"_id": "2", "name": "A", "created_at": "2026-01-01", "secret": "y"},
    ]

    projected = _project(documents[0], {"name": 1, "_id": 0})
    sorted_documents = _sort_documents(documents, [("created_at", -1)])

    assert projected == {"name": "B"}
    assert [document["_id"] for document in sorted_documents] == ["1", "2"]


def test_sql_prefilter_extracts_tenant_filters_inside_and_queries():
    query = {
        "$and": [
            {"restaurant_id": "restaurant-1"},
            {"status": "pending"},
            {"$or": [{"cycle_id": {"$exists": False}}, {"cycle_id": None}]},
            {"created_at": {"$gte": "2026-01-01T00:00:00"}},
        ]
    }

    assert _sql_prefilter(query) == {
        "restaurant_id": "restaurant-1",
        "status": "pending",
    }


def test_customer_aggregation_pipeline():
    documents = [
        {
            "restaurant_id": "r1",
            "status": "completed",
            "customer": {"name": "Ana", "phone": "27999999999"},
            "total": 20,
            "created_at": "2026-01-01",
        },
        {
            "restaurant_id": "r1",
            "status": "completed",
            "customer": {"name": "Ana", "phone": "27999999999"},
            "total": 30,
            "created_at": "2026-01-02",
        },
    ]
    pipeline = [
        {"$match": {"restaurant_id": "r1", "status": {"$ne": "cancelled"}}},
        {"$group": {
            "_id": "$customer.phone",
            "name": {"$last": "$customer.name"},
            "phone": {"$last": "$customer.phone"},
            "order_count": {"$sum": 1},
            "total_spent": {"$sum": "$total"},
            "avg_ticket": {"$avg": "$total"},
            "last_order": {"$max": "$created_at"},
            "first_order": {"$min": "$created_at"},
        }},
    ]

    assert _aggregate(documents, pipeline) == [{
        "_id": "27999999999",
        "name": "Ana",
        "phone": "27999999999",
        "order_count": 2,
        "total_spent": 50,
        "avg_ticket": 25,
        "last_order": "2026-01-02",
        "first_order": "2026-01-01",
    }]
