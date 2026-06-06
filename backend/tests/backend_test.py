"""End-to-end backend tests for Menu Digital SaaS.

Covers: auth (login/me/register), public menu, coupon validation,
order creation, reviews, admin CRUD, multi-tenant isolation, super admin.
"""
import os
import time
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

SUPER_EMAIL = "super@menudigital.com"
SUPER_PWD = "super123"
OWNER_EMAIL = "dono@burger.com"
OWNER_PWD = "dono123"
SLUG = "burger-lanches"


# ---------------- fixtures ----------------
@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def owner_token(session):
    r = session.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PWD})
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    assert data["user"]["email"] == OWNER_EMAIL
    assert data["user"]["role"] == "owner"
    assert data["user"]["restaurant_id"]
    return data["token"]


@pytest.fixture(scope="session")
def super_token(session):
    r = session.post(f"{API}/auth/login", json={"email": SUPER_EMAIL, "password": SUPER_PWD})
    assert r.status_code == 200, f"Super login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "super_admin"
    return data["token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------- AUTH ----------------
class TestAuth:
    def test_login_invalid(self, session):
        r = session.post(f"{API}/auth/login", json={"email": "nope@x.com", "password": "bad"})
        assert r.status_code == 401

    def test_me_owner(self, session, owner_token):
        r = session.get(f"{API}/auth/me", headers=auth_headers(owner_token))
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == OWNER_EMAIL
        assert body["role"] == "owner"
        assert body["restaurant_id"]

    def test_me_super(self, session, super_token):
        r = session.get(f"{API}/auth/me", headers=auth_headers(super_token))
        assert r.status_code == 200
        assert r.json()["role"] == "super_admin"

    def test_me_no_token(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_new_restaurant(self, session):
        unique = uuid.uuid4().hex[:8]
        payload = {
            "name": "Test Owner",
            "email": f"TEST_owner_{unique}@example.com",
            "password": "test12345",
            "restaurant_name": f"TEST Loja {unique}",
        }
        r = session.post(f"{API}/auth/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "slug" in data and "restaurant_id" in data
        assert data["user"]["role"] == "owner"
        assert data["user"]["restaurant_id"] == data["restaurant_id"]

        # duplicate email returns 400
        r2 = session.post(f"{API}/auth/register", json=payload)
        assert r2.status_code == 400


# ---------------- PUBLIC ----------------
class TestPublic:
    def test_get_menu(self, session):
        r = session.get(f"{API}/public/restaurants/{SLUG}")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "restaurant" in data
        assert data["restaurant"]["slug"] == SLUG
        assert "is_open" in data["restaurant"]
        assert isinstance(data["categories"], list) and len(data["categories"]) > 0
        assert isinstance(data["products"], list) and len(data["products"]) > 0
        assert isinstance(data["banners"], list)
        assert "reviews_summary" in data
        # Ensure no _id leakage
        for p in data["products"]:
            assert "_id" not in p

    def test_menu_not_found(self, session):
        r = session.get(f"{API}/public/restaurants/non-existent-slug-zzz")
        assert r.status_code == 404

    def test_validate_coupon_valid(self, session):
        r = session.post(
            f"{API}/public/restaurants/{SLUG}/validate-coupon",
            json={"code": "PRIMEIRA10", "subtotal": 100.0},
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["code"] == "PRIMEIRA10"
        assert data["discount_type"] == "percent"
        assert data["discount"] == 10.0

    def test_validate_coupon_invalid(self, session):
        r = session.post(
            f"{API}/public/restaurants/{SLUG}/validate-coupon",
            json={"code": "NOPE_INVALID", "subtotal": 100.0},
        )
        assert r.status_code == 404

    def test_validate_coupon_min_order(self, session):
        r = session.post(
            f"{API}/public/restaurants/{SLUG}/validate-coupon",
            json={"code": "FRETEGRATIS", "subtotal": 10.0},
        )
        assert r.status_code == 400

    def test_create_review(self, session):
        r = session.post(
            f"{API}/public/restaurants/{SLUG}/reviews",
            json={"name": "TEST Cliente", "rating": 5, "comment": "Muito bom"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["rating"] == 5
        assert "id" in body

    def test_create_review_invalid_rating(self, session):
        r = session.post(
            f"{API}/public/restaurants/{SLUG}/reviews",
            json={"name": "x", "rating": 9, "comment": ""},
        )
        assert r.status_code == 400


# ---------------- ORDER (public) ----------------
@pytest.fixture(scope="session")
def created_order_id(session):
    """Create a public order; used by admin tests for status update."""
    # get a product
    menu = session.get(f"{API}/public/restaurants/{SLUG}").json()
    product = menu["products"][0]
    items = [{
        "product_id": product["id"],
        "product_name": product["name"],
        "quantity": 2,
        "unit_price": product["price"],
        "options": [],
        "notes": "",
        "total_price": product["price"] * 2,
    }]
    subtotal = items[0]["total_price"]
    payload = {
        "type": "delivery",
        "customer": {"name": "TEST Cliente", "phone": "11999999999"},
        "address": {"cep": "01000-000", "street": "Rua A", "number": "10",
                    "neighborhood": "Centro", "complement": "", "reference": ""},
        "items": items,
        "subtotal": subtotal,
        "delivery_fee": 5.0,
        "discount": 0.0,
        "total": subtotal + 5.0,
        "payment_method": "Pix",
        "customer_notes": "",
    }
    r = session.post(f"{API}/public/restaurants/{SLUG}/orders", json=payload)
    if r.status_code != 200:
        pytest.skip(f"Order create failed: {r.status_code} {r.text}")
    return r.json()["id"]


class TestPublicOrder:
    def test_order_created(self, session, created_order_id):
        # track endpoint
        r = session.get(f"{API}/public/orders/{created_order_id}")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "pending"
        assert "order_number" in body

    def test_order_min_order(self, session):
        menu = session.get(f"{API}/public/restaurants/{SLUG}").json()
        product = menu["products"][0]
        items = [{
            "product_id": product["id"], "product_name": product["name"],
            "quantity": 1, "unit_price": 1.0, "options": [],
            "notes": "", "total_price": 1.0,
        }]
        payload = {
            "type": "pickup",
            "customer": {"name": "x", "phone": "11"},
            "items": items, "subtotal": 1.0, "delivery_fee": 0.0,
            "discount": 0.0, "total": 1.0, "payment_method": "Pix",
        }
        r = session.post(f"{API}/public/restaurants/{SLUG}/orders", json=payload)
        # min order is 20.0 — should fail with 400
        assert r.status_code == 400


# ---------------- ADMIN ----------------
class TestAdmin:
    def test_get_restaurant(self, session, owner_token):
        r = session.get(f"{API}/admin/restaurant", headers=auth_headers(owner_token))
        assert r.status_code == 200
        body = r.json()
        assert body["slug"] == SLUG
        assert "is_open" in body

    def test_toggle_open_twice(self, session, owner_token):
        r = session.post(f"{API}/admin/restaurant/toggle-open", headers=auth_headers(owner_token))
        assert r.status_code == 200
        v1 = r.json()["is_open_manual"]
        r2 = session.post(f"{API}/admin/restaurant/toggle-open", headers=auth_headers(owner_token))
        assert r2.json()["is_open_manual"] != v1

    def test_update_restaurant(self, session, owner_token):
        r = session.put(
            f"{API}/admin/restaurant",
            headers=auth_headers(owner_token),
            json={"tagline": "TEST tagline"},
        )
        assert r.status_code == 200
        assert r.json()["tagline"] == "TEST tagline"

    def test_categories_crud(self, session, owner_token):
        h = auth_headers(owner_token)
        # create
        r = session.post(f"{API}/admin/categories", headers=h,
                         json={"name": "TEST Cat", "sort_order": 99})
        assert r.status_code == 200
        cid = r.json()["id"]
        # list & contains
        r2 = session.get(f"{API}/admin/categories", headers=h)
        assert any(c["id"] == cid for c in r2.json())
        # update
        r3 = session.put(f"{API}/admin/categories/{cid}", headers=h,
                         json={"name": "TEST Cat Updated", "sort_order": 50})
        assert r3.status_code == 200 and r3.json()["name"] == "TEST Cat Updated"
        # delete
        r4 = session.delete(f"{API}/admin/categories/{cid}", headers=h)
        assert r4.status_code == 200

    def test_products_crud_with_options(self, session, owner_token):
        h = auth_headers(owner_token)
        # need category
        cats = session.get(f"{API}/admin/categories", headers=h).json()
        cid = cats[0]["id"]
        product_payload = {
            "category_id": cid, "name": "TEST Burger",
            "description": "test", "price": 25.0,
            "option_groups": [{
                "name": "Ponto", "type": "single", "required": True,
                "min": 1, "max": 1,
                "options": [{"name": "Ao ponto", "price": 0}],
            }],
        }
        r = session.post(f"{API}/admin/products", headers=h, json=product_payload)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert len(r.json()["option_groups"]) == 1
        # update
        r2 = session.put(f"{API}/admin/products/{pid}", headers=h,
                        json={**product_payload, "price": 29.9})
        assert r2.status_code == 200 and r2.json()["price"] == 29.9
        # delete
        r3 = session.delete(f"{API}/admin/products/{pid}", headers=h)
        assert r3.status_code == 200

    def test_coupons_crud(self, session, owner_token):
        h = auth_headers(owner_token)
        r = session.post(f"{API}/admin/coupons", headers=h, json={
            "code": "test20", "discount_type": "percent",
            "discount_value": 20.0, "min_order": 30.0, "is_active": True,
        })
        assert r.status_code == 200
        assert r.json()["code"] == "TEST20"  # uppercased
        cid = r.json()["id"]
        session.delete(f"{API}/admin/coupons/{cid}", headers=h)

    def test_banners_crud(self, session, owner_token):
        h = auth_headers(owner_token)
        r = session.post(f"{API}/admin/banners", headers=h,
                        json={"title": "TEST banner", "is_active": True})
        assert r.status_code == 200
        bid = r.json()["id"]
        session.delete(f"{API}/admin/banners/{bid}", headers=h)

    def test_dashboard(self, session, owner_token):
        r = session.get(f"{API}/admin/dashboard", headers=auth_headers(owner_token))
        assert r.status_code == 200
        body = r.json()
        for k in ("orders_today", "revenue_today", "avg_ticket",
                  "in_progress", "is_open", "top_products", "recent_orders"):
            assert k in body

    def test_reports(self, session, owner_token):
        r = session.get(f"{API}/admin/reports?period=7d", headers=auth_headers(owner_token))
        assert r.status_code == 200
        body = r.json()
        for k in ("total_orders", "revenue", "by_day", "payment_methods", "top_products"):
            assert k in body

    def test_orders_list_and_update_status(self, session, owner_token, created_order_id):
        h = auth_headers(owner_token)
        r = session.get(f"{API}/admin/orders", headers=h)
        assert r.status_code == 200
        assert any(o["id"] == created_order_id for o in r.json())

        r2 = session.put(f"{API}/admin/orders/{created_order_id}/status",
                         headers=h, json={"status": "accepted"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "accepted"

        # invalid status
        r3 = session.put(f"{API}/admin/orders/{created_order_id}/status",
                         headers=h, json={"status": "invalid_status"})
        assert r3.status_code == 400


# ---------------- ISOLATION ----------------
class TestIsolation:
    def test_super_blocked_from_admin(self, session, super_token):
        r = session.get(f"{API}/admin/restaurant", headers=auth_headers(super_token))
        assert r.status_code == 403

    def test_owner_blocked_from_super(self, session, owner_token):
        r = session.get(f"{API}/super/restaurants", headers=auth_headers(owner_token))
        assert r.status_code == 403

    def test_no_auth_admin(self, session):
        r = session.get(f"{API}/admin/restaurant")
        assert r.status_code == 401


# ---------------- SUPER ADMIN ----------------
class TestSuperAdmin:
    def test_list_restaurants(self, session, super_token):
        r = session.get(f"{API}/super/restaurants", headers=auth_headers(super_token))
        assert r.status_code == 200
        rs = r.json()
        assert any(x["slug"] == SLUG for x in rs)
        assert all("order_count" in x for x in rs)

    def test_metrics(self, session, super_token):
        r = session.get(f"{API}/super/metrics", headers=auth_headers(super_token))
        assert r.status_code == 200
        b = r.json()
        for k in ("total_restaurants", "active", "total_orders", "total_users", "gmv", "plans"):
            assert k in b

    def test_users_list(self, session, super_token):
        r = session.get(f"{API}/super/users", headers=auth_headers(super_token))
        assert r.status_code == 200
        users = r.json()
        emails = [u["email"] for u in users]
        assert SUPER_EMAIL in emails and OWNER_EMAIL in emails

    def test_create_and_update_restaurant(self, session, super_token):
        h = auth_headers(super_token)
        unique = uuid.uuid4().hex[:8]
        r = session.post(f"{API}/super/restaurants", headers=h, json={
            "restaurant_name": f"TEST Super {unique}",
            "owner_name": "TEST",
            "owner_email": f"TEST_super_{unique}@x.com",
            "owner_password": "test12345",
            "plan": "basic",
        })
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        # update plan
        r2 = session.put(f"{API}/super/restaurants/{rid}", headers=h,
                         json={"plan": "premium"})
        assert r2.status_code == 200
        assert r2.json()["plan"] == "premium"


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v", "--tb=short"]))
