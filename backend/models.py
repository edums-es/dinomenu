"""Pydantic models, helpers and shared domain logic."""
import re
import uuid
import unicodedata
from datetime import datetime, timezone
from typing import List, Optional, Literal

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9\s-]", "", text).strip().lower()
    text = re.sub(r"[\s_-]+", "-", text)
    return text or "loja"


# ---------- Option groups (addons) ----------
class Option(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    price: float = 0.0


class OptionGroup(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    type: Literal["single", "multiple"] = "single"
    required: bool = False
    min: int = 0
    max: int = 1
    options: List[Option] = []


# ---------- Category ----------
class CategoryIn(BaseModel):
    name: str
    icon: Optional[str] = None
    sort_order: int = 0
    is_active: bool = True


# ---------- Product ----------
class ProductIn(BaseModel):
    category_id: Optional[str] = None
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = None
    price: float = 0.0
    wholesale_price: Optional[float] = None
    promotional_price: Optional[float] = None
    is_available: bool = True
    is_featured: bool = False
    is_best_seller: bool = False
    sort_order: int = 0
    option_groups: List[OptionGroup] = []
    # Stock
    track_stock: bool = False
    stock_quantity: int = 0
    low_stock_threshold: int = 5


# ---------- Coupon ----------
class CouponIn(BaseModel):
    code: str
    discount_type: Literal["fixed", "percent"] = "percent"
    discount_value: float = 0.0
    min_order: float = 0.0
    starts_at: Optional[str] = None
    expires_at: Optional[str] = None
    usage_limit: Optional[int] = None
    is_active: bool = True
    free_delivery: bool = False


# ---------- Banner ----------
class BannerIn(BaseModel):
    image_url: Optional[str] = None
    title: Optional[str] = ""
    subtitle: Optional[str] = ""
    link: Optional[str] = None
    product_id: Optional[str] = None   # smart banner: opens product on click
    is_active: bool = True
    sort_order: int = 0


# ---------- Delivery zone ----------
class DeliveryZone(BaseModel):
    id: str = Field(default_factory=new_id)
    neighborhood: str
    fee: float = 0.0
    active: bool = True
    aliases: List[str] = []
    cep_prefixes: List[str] = []
    city_names: List[str] = []


# ---------- Opening hours ----------
class DayHours(BaseModel):
    open: bool = False
    start: str = "18:00"
    end: str = "23:00"


# ---------- Restaurant settings ----------
class RestaurantSettings(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tagline: Optional[str] = None
    logo_url: Optional[str] = None
    cover_url: Optional[str] = None
    whatsapp: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    primary_color: Optional[str] = None
    secondary_color: Optional[str] = None
    button_text_color: Optional[str] = None
    menu_text_color: Optional[str] = None
    menu_muted_text_color: Optional[str] = None
    is_open_manual: Optional[bool] = None
    accepts_delivery: Optional[bool] = None
    accepts_pickup: Optional[bool] = None
    minimum_order: Optional[float] = None
    average_delivery_time: Optional[str] = None
    delivery_fee_mode: Optional[Literal["fixed", "neighborhood"]] = None
    flat_delivery_fee: Optional[float] = None
    delivery_zones: Optional[List[DeliveryZone]] = None
    payment_methods: Optional[List[str]] = None
    pix_key: Optional[str] = None
    pix_name: Optional[str] = None
    openpix_app_id: Optional[str] = None
    opening_hours: Optional[dict] = None
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_whatsapp_number: Optional[str] = None
    neighborhood: Optional[str] = None
    printing_enabled: Optional[bool] = None
    printing_trigger_status: Optional[Literal["pending", "accepted", "preparing", "ready"]] = None
    printer_name: Optional[str] = None
    printer_copies: Optional[int] = None
    printer_include_customer_phone: Optional[bool] = None
    printer_include_address: Optional[bool] = None
    printer_include_payment: Optional[bool] = None


# ---------- Orders ----------
class OrderItemOption(BaseModel):
    group: str
    name: str
    price: float = 0.0


class OrderItemIn(BaseModel):
    product_id: str
    product_name: str
    quantity: int = 1
    unit_price: float
    options: List[OrderItemOption] = []
    notes: Optional[str] = ""
    total_price: float


class CustomerInfo(BaseModel):
    name: str
    phone: str


class AddressInfo(BaseModel):
    cep: Optional[str] = ""
    street: Optional[str] = ""
    number: Optional[str] = ""
    neighborhood: Optional[str] = ""
    complement: Optional[str] = ""
    reference: Optional[str] = ""


class OrderIn(BaseModel):
    type: Literal["delivery", "pickup"] = "delivery"
    customer: CustomerInfo
    address: Optional[AddressInfo] = None
    items: List[OrderItemIn]
    subtotal: float
    delivery_fee: float = 0.0
    discount: float = 0.0
    total: float
    coupon_code: Optional[str] = None
    payment_method: str
    change_for: Optional[float] = None
    customer_notes: Optional[str] = ""
    scheduled_for: Optional[str] = None   # ISO datetime string for scheduled orders
    table_number: Optional[int] = None    # mesa (dine-in / QR code)


ORDER_STATUSES = [
    "pending", "accepted", "preparing", "ready",
    "out_for_delivery", "completed", "cancelled",
]


class StatusUpdate(BaseModel):
    status: str


DEFAULT_OPENING_HOURS = {
    "mon": {"open": True, "start": "18:00", "end": "23:30"},
    "tue": {"open": True, "start": "18:00", "end": "23:30"},
    "wed": {"open": True, "start": "18:00", "end": "23:30"},
    "thu": {"open": True, "start": "18:00", "end": "23:30"},
    "fri": {"open": True, "start": "18:00", "end": "23:59"},
    "sat": {"open": True, "start": "18:00", "end": "23:59"},
    "sun": {"open": True, "start": "18:00", "end": "23:00"},
}

_WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def is_restaurant_open(restaurant: dict) -> bool:
    """Compute open status from manual flag + opening hours (America/Sao_Paulo)."""
    if restaurant.get("is_open_manual") is False:
        return False
    hours = restaurant.get("opening_hours") or DEFAULT_OPENING_HOURS
    try:
        from zoneinfo import ZoneInfo
        nowdt = datetime.now(ZoneInfo("America/Sao_Paulo"))
    except Exception:
        nowdt = datetime.now()
    cur = nowdt.strftime("%H:%M")
    weekday = nowdt.weekday()
    day = hours.get(_WEEKDAY_KEYS[weekday])

    if day and day.get("open"):
        start = day.get("start", "00:00")
        end = day.get("end", "23:59")
        if end <= start:
            if cur >= start:
                return True
        elif start <= cur <= end:
            return True

    prev_day = hours.get(_WEEKDAY_KEYS[(weekday - 1) % 7])
    if prev_day and prev_day.get("open"):
        start = prev_day.get("start", "00:00")
        end = prev_day.get("end", "23:59")
        if end <= start and cur <= end:
            return True

    return False


def clean(doc: dict) -> dict:
    """Strip Mongo _id for JSON responses."""
    if doc and "_id" in doc:
        doc = {k: v for k, v in doc.items() if k != "_id"}
    return doc


# ---------- Combos ----------
class ComboItemIn(BaseModel):
    product_id: str
    product_name: str
    quantity: int = 1

class ComboIn(BaseModel):
    name: str
    description: Optional[str] = ""
    image_url: Optional[str] = None
    price: float = 0.0
    is_active: bool = True
    sort_order: int = 0
    items: List[ComboItemIn] = []

# ---------- Loyalty ----------
class LoyaltySettings(BaseModel):
    enabled: bool = False
    points_per_real: float = 1.0       # points earned per R$ spent
    min_points_redeem: int = 100        # minimum points to redeem
    points_to_real: float = 0.10        # value of each point in R$
    expiry_days: Optional[int] = None   # null = no expiry

class LoyaltyTransaction(BaseModel):
    customer_phone: str
    points: int
    type: Literal["earn", "redeem"]
    order_id: Optional[str] = None
    notes: Optional[str] = None

# ---------- Wholesale / Atacado ----------
class WholesaleMerchantIn(BaseModel):
    company_name: str
    contact_name: str
    email: str
    phone: str
    cnpj: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    notes: Optional[str] = None

class ServiceOrderIn(BaseModel):
    merchant_id: str
    items: List[ComboItemIn]   # reuse item structure
    notes: Optional[str] = None
    delivery_date: Optional[str] = None
    payment_method: Optional[str] = None
    discount: float = 0.0

# ---------- PDV ----------
class PDVOrderIn(BaseModel):
    """Quick in-store order — no address required."""
    customer_name: Optional[str] = "Cliente balcão"
    customer_phone: Optional[str] = None
    items: List[OrderItemIn]
    subtotal: float
    discount: float = 0.0
    total: float
    payment_method: str
    change_for: Optional[float] = None
    notes: Optional[str] = ""
    loyalty_points_redeem: int = 0
