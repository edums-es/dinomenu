import os
import sys
from datetime import datetime, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/dinomenu_test")

import routes_admin


def test_dashboard_uses_brazil_day_for_utc_order_timestamps():
    assert routes_admin._local_day("2026-08-23T01:30:00+00:00") == "2026-08-22"


def test_dashboard_accepts_datetime_values_from_database():
    created_at = datetime(2026, 8, 23, 1, 30, tzinfo=timezone.utc)

    assert routes_admin._local_day(created_at) == "2026-08-22"
