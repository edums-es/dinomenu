import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from plan_entitlements import (
    DEFAULT_FEATURE_FLAGS,
    is_legacy_lifetime_plan,
    normalize_feature_flags,
    normalize_plan_payload,
    updates_policy_for,
)


def test_lifetime_subscription_is_paid_upgrade_policy():
    assert is_legacy_lifetime_plan(
        restaurant={"plan": "pro"},
        plan={"name": "EG Pro", "slug": "pro"},
        subscription={"billing_cycle": "lifetime"},
    )
    assert updates_policy_for(subscription={"billing_cycle": "lifetime"}) == "paid_upgrades"


def test_legacy_plan_type_locks_future_updates():
    plan = normalize_plan_payload({"name": "EG Vitalicio", "slug": "vitalicio", "plan_type": "legacy_lifetime"})

    assert plan["updates_policy"] == "paid_upgrades"
    assert is_legacy_lifetime_plan(plan=plan)


def test_normal_subscription_keeps_updates_included():
    assert updates_policy_for(
        restaurant={"plan": "pro"},
        plan={"name": "EG Pro", "slug": "pro", "updates_policy": "included"},
        subscription={"billing_cycle": "monthly"},
    ) == "included"


def test_feature_flags_are_normalized_without_unknown_keys():
    flags = normalize_feature_flags({"orders": True, "pdv": 1, "unknown": True})

    assert flags["orders"] is True
    assert flags["pdv"] is True
    assert "unknown" not in flags
    assert set(flags) == set(DEFAULT_FEATURE_FLAGS)
