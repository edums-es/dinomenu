import os
import sys
from pathlib import Path

from fastapi import HTTPException
import pytest


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/dinomenu_test")

from routes_admin import (
    _cycle_bounds,
    _cycle_orders_query,
    _with_open_status,
    _with_terminal_status,
)


def test_cycle_bounds_respects_selected_dates_for_day_close():
    start_iso, end_iso = _cycle_bounds("day", "2026-07-19", "2026-07-20")

    assert start_iso.startswith("2026-07-19T03:00:00")
    assert end_iso.startswith("2026-07-21T02:59:59")


def test_cycle_bounds_requires_complete_custom_range():
    with pytest.raises(HTTPException, match="Informe data inicial e final"):
        _cycle_bounds("day", "2026-07-19", None)


def test_cycle_orders_query_targets_current_cycle_and_date_range():
    query = _cycle_orders_query("restaurant-1", "2026-07-19T03:00:00+00:00", "2026-07-21T02:59:59+00:00")

    assert {"restaurant_id": "restaurant-1"} in query["$and"]
    assert {"created_at": {"$gte": "2026-07-19T03:00:00+00:00", "$lte": "2026-07-21T02:59:59+00:00"}} in query["$and"]
    assert {"$or": [{"cycle_id": {"$exists": False}}, {"cycle_id": None}]} in query["$and"]


def test_terminal_and_open_queries_keep_cycle_filter():
    base = _cycle_orders_query("restaurant-1")

    terminal = _with_terminal_status(base)
    open_query = _with_open_status(base)

    assert terminal["$and"][0] == base
    assert terminal["$and"][1]["status"]["$in"]
    assert open_query["$and"][0] == base
    assert open_query["$and"][1]["status"]["$nin"]
