"""Seed data: super admin + demo restaurant with full menu."""
import os
import logging
from datetime import datetime, timezone

from db import db
from auth import hash_password, verify_password
from models import new_id, now_iso, DEFAULT_OPENING_HOURS

logger = logging.getLogger(__name__)


async def create_restaurant_with_owner(
    restaurant_name, slug, owner_name, owner_email, owner_password,
    with_demo_data=False, plan="professional",
):
    restaurant_id = new_id()
    restaurant = {
        "id": restaurant_id,
        "name": restaurant_name,
        "slug": slug,
        "description": "Sabor que você pede. Qualidade que você sente.",
        "tagline": "Sabor que você pede. Qualidade que você sente.",
        "logo_url": None,
        "cover_url": "https://images.pexels.com/photos/31124637/pexels-photo-31124637.jpeg",
        "whatsapp": "5511999999999",
        "phone": "(11) 99999-9999",
        "address": "Rua Exemplo, 123 - Centro",
        "city": "São Paulo",
        "state": "SP",
        "primary_color": "#22E39B",
        "secondary_color": "#F97316",
        "button_text_color": "#04110C",
        "menu_text_color": "#FFFFFF",
        "menu_muted_text_color": "#A7A7A7",
        "is_open_manual": True,
        "accepts_delivery": True,
        "accepts_pickup": True,
        "minimum_order": 20.0,
        "average_delivery_time": "30-45 min",
        "delivery_fee_mode": "fixed",
        "flat_delivery_fee": 5.0,
        "delivery_zones": [],
        "payment_methods": ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito"],
        "pix_key": "contato@burgerlanches.com",
        "pix_name": "Burger Lanches LTDA",
        "opening_hours": DEFAULT_OPENING_HOURS,
        "printing_enabled": False,
        "printing_trigger_status": "accepted",
        "printer_name": "",
        "printer_copies": 1,
        "printer_include_customer_phone": True,
        "printer_include_address": True,
        "printer_include_payment": True,
        "plan": plan,
        "status": "active",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.restaurants.insert_one(restaurant)

    await db.users.insert_one({
        "email": owner_email.lower(),
        "password_hash": hash_password(owner_password),
        "name": owner_name,
        "role": "owner",
        "restaurant_id": restaurant_id,
        "created_at": datetime.now(timezone.utc),
    })

    if with_demo_data:
        await _seed_menu(restaurant_id)
    return restaurant_id


async def _seed_menu(restaurant_id):
    cats = [
        {"name": "Combos", "icon": "Hamburger", "sort_order": 1},
        {"name": "Hambúrgueres", "icon": "Hamburger", "sort_order": 2},
        {"name": "Porções", "icon": "Bowl", "sort_order": 3},
        {"name": "Bebidas", "icon": "Drink", "sort_order": 4},
        {"name": "Sobremesas", "icon": "IceCream", "sort_order": 5},
    ]
    cat_ids = {}
    for c in cats:
        cid = new_id()
        cat_ids[c["name"]] = cid
        await db.categories.insert_one({
            "id": cid, "restaurant_id": restaurant_id, "name": c["name"],
            "icon": c["icon"], "sort_order": c["sort_order"], "is_active": True,
            "created_at": now_iso(),
        })

    ponto_group = {
        "id": new_id(), "name": "Ponto da carne", "type": "single",
        "required": True, "min": 1, "max": 1,
        "options": [
            {"id": new_id(), "name": "Mal passada", "price": 0},
            {"id": new_id(), "name": "Ao ponto", "price": 0},
            {"id": new_id(), "name": "Bem passada", "price": 0},
        ],
    }
    extras_group = {
        "id": new_id(), "name": "Adicionais", "type": "multiple",
        "required": False, "min": 0, "max": 5,
        "options": [
            {"id": new_id(), "name": "Bacon extra", "price": 5.0},
            {"id": new_id(), "name": "Cheddar extra", "price": 4.0},
            {"id": new_id(), "name": "Carne extra", "price": 10.0},
            {"id": new_id(), "name": "Catupiry", "price": 4.0},
        ],
    }

    products = [
        {
            "category": "Hambúrgueres", "name": "Hambúrguer California",
            "description": "Pão brioche, duas carnes, queijo cheddar, bacon crocante, alface, tomate e molho especial da casa.",
            "price": 30.0, "image_url": "https://images.pexels.com/photos/109400/pexels-photo-109400.jpeg",
            "is_featured": True, "is_best_seller": True,
            "option_groups": [ponto_group, extras_group],
        },
        {
            "category": "Hambúrgueres", "name": "Cheese Bacon Duplo",
            "description": "Pão australiano, duas carnes suculentas, dobro de cheddar e bacon.",
            "price": 34.0, "promotional_price": 28.9,
            "image_url": "https://images.unsplash.com/photo-1662452883375-9226ea22c765?ixlib=rb-4.1.0&q=85",
            "is_best_seller": True, "option_groups": [ponto_group, extras_group],
        },
        {
            "category": "Combos", "name": "Combo Smash + Batata + Refri",
            "description": "Smash burger artesanal, porção de batata média e refrigerante lata.",
            "price": 39.9, "is_featured": True,
            "image_url": "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg",
            "option_groups": [extras_group],
        },
        {
            "category": "Porções", "name": "Batata Frita Média",
            "description": "Porção generosa de batatas crocantes com sal.",
            "price": 18.0,
            "image_url": "https://images.pexels.com/photos/1583884/pexels-photo-1583884.jpeg",
            "option_groups": [],
        },
        {
            "category": "Bebidas", "name": "Coca-Cola Lata 350ml",
            "description": "Refrigerante gelado.", "price": 7.0,
            "image_url": "https://images.pexels.com/photos/2983100/pexels-photo-2983100.jpeg",
            "option_groups": [],
        },
        {
            "category": "Sobremesas", "name": "Brownie com Sorvete",
            "description": "Brownie quentinho com bola de sorvete de creme.",
            "price": 16.0,
            "image_url": "https://images.pexels.com/photos/45202/brownie-dessert-cake-sweet-45202.jpeg",
            "option_groups": [],
        },
    ]
    for i, p in enumerate(products):
        await db.products.insert_one({
            "id": new_id(), "restaurant_id": restaurant_id,
            "category_id": cat_ids[p["category"]], "name": p["name"],
            "description": p["description"], "image_url": p.get("image_url"),
            "price": p["price"], "promotional_price": p.get("promotional_price"),
            "is_available": True, "is_featured": p.get("is_featured", False),
            "is_best_seller": p.get("is_best_seller", False), "sort_order": i,
            "option_groups": p["option_groups"], "created_at": now_iso(),
        })

    await db.banners.insert_one({
        "id": new_id(), "restaurant_id": restaurant_id,
        "image_url": "https://images.pexels.com/photos/1639557/pexels-photo-1639557.jpeg",
        "title": "Combo do dia", "subtitle": "Smash + batata + refri por R$ 39,90",
        "is_active": True, "sort_order": 0, "created_at": now_iso(),
    })

    await db.coupons.insert_one({
        "id": new_id(), "restaurant_id": restaurant_id, "code": "PRIMEIRA10",
        "discount_type": "percent", "discount_value": 10.0, "min_order": 0.0,
        "usage_limit": None, "used_count": 0, "is_active": True,
        "free_delivery": False, "created_at": now_iso(),
    })
    await db.coupons.insert_one({
        "id": new_id(), "restaurant_id": restaurant_id, "code": "FRETEGRATIS",
        "discount_type": "fixed", "discount_value": 0.0, "min_order": 50.0,
        "usage_limit": None, "used_count": 0, "is_active": True,
        "free_delivery": True, "created_at": now_iso(),
    })


async def seed():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.restaurants.create_index("slug", unique=True)
    await db.products.create_index("restaurant_id")
    await db.categories.create_index("restaurant_id")
    await db.orders.create_index("restaurant_id")
    await db.categories.create_index([("restaurant_id", 1), ("is_active", 1), ("sort_order", 1)])
    await db.products.create_index([("restaurant_id", 1), ("sort_order", 1)])
    await db.banners.create_index([("restaurant_id", 1), ("is_active", 1), ("sort_order", 1)])
    await db.combos.create_index([("restaurant_id", 1), ("is_active", 1), ("sort_order", 1)])
    await db.reviews.create_index([("restaurant_id", 1), ("created_at", -1)])
    await db.orders.create_index([("restaurant_id", 1), ("customer_phone_suffix", 1), ("created_at", -1)])
    await db.orders.create_index([("restaurant_id", 1), ("order_number", 1)], unique=True)
    await db.sequences.create_index([("restaurant_id", 1), ("type", 1)], unique=True)
    await db.orders.create_index([("customer_phone_suffix", 1), ("created_at", -1)])
    await db.print_jobs.create_index("restaurant_id")
    await db.print_jobs.create_index("dedupe_key", unique=True)
    await db.print_jobs.create_index([("restaurant_id", 1), ("status", 1), ("created_at", 1)])

    # Super admin
    admin_email = os.environ.get("ADMIN_EMAIL", "super@menudigital.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "super123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "email": admin_email, "password_hash": hash_password(admin_password),
            "name": "Super Admin", "role": "super_admin", "restaurant_id": None,
            "created_at": datetime.now(timezone.utc),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})

    # Demo restaurant
    demo = await db.restaurants.find_one({"slug": "burger-lanches"})
    if demo is None:
        await create_restaurant_with_owner(
            restaurant_name="Burger Lanches", slug="burger-lanches",
            owner_name="João Dono", owner_email="dono@burger.com",
            owner_password="dono123", with_demo_data=True, plan="premium",
        )
        logger.info("Demo restaurant seeded")

    # write test credentials
    try:
        os.makedirs("/app/memory", exist_ok=True)
        with open("/app/memory/test_credentials.md", "w") as f:
            f.write(
                "# Test Credentials\n\n"
                "## Super Admin\n"
                f"- Email: {admin_email}\n- Senha: {admin_password}\n- Role: super_admin\n"
                "- Login: POST /api/auth/login | Painel: /super\n\n"
                "## Restaurante Demo (Owner)\n"
                "- Email: dono@burger.com\n- Senha: dono123\n- Role: owner\n"
                "- Slug público: burger-lanches | Cardápio: /loja/burger-lanches\n"
                "- Painel admin: /admin\n\n"
                "## Endpoints auth\n"
                "- POST /api/auth/login\n- POST /api/auth/register\n- GET /api/auth/me\n"
            )
    except Exception as e:
        logger.error(f"Could not write test_credentials: {e}")
