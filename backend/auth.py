"""Authentication utilities and routes (JWT, email/password)."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import bcrypt
import jwt
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel, EmailStr

from db import db

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_DAYS = 7


# ---------- password helpers ----------
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ---------- jwt helpers ----------
def get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET", "")
    if not secret:
        raise RuntimeError("JWT_SECRET nao configurado")
    if os.environ.get("APP_ENV", "development").lower() == "production" and len(secret) < 32:
        raise RuntimeError("JWT_SECRET deve ter pelo menos 32 caracteres em producao")
    return secret


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_DAYS),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name"),
        "role": user.get("role"),
        "restaurant_id": user.get("restaurant_id"),
    }


# ---------- current user dependency ----------
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except (jwt.InvalidTokenError, InvalidId):
        raise HTTPException(status_code=401, detail="Token inválido")


def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if roles and user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Acesso negado")
        return user
    return checker


async def require_restaurant(user: dict = Depends(get_current_user)) -> dict:
    """Ensures user belongs to a restaurant (owner/manager/attendant/kitchen)."""
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin não possui restaurante")
    if not user.get("restaurant_id"):
        raise HTTPException(status_code=403, detail="Usuário sem restaurante vinculado")
    return user


# ---------- router ----------
router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class RegisterRestaurantInput(BaseModel):
    name: str
    email: EmailStr
    password: str
    restaurant_name: str


@router.post("/login")
async def login(data: LoginInput):
    email = data.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    token = create_access_token(str(user["_id"]), user["email"], user.get("role"))
    return {"token": token, "user": serialize_user(user)}


@router.post("/register")
async def register_restaurant(data: RegisterRestaurantInput):
    from models import slugify
    from seed import create_restaurant_with_owner

    email = data.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="E-mail já cadastrado")

    base_slug = slugify(data.restaurant_name)
    slug = base_slug
    n = 1
    while await db.restaurants.find_one({"slug": slug}):
        n += 1
        slug = f"{base_slug}-{n}"

    restaurant_id = await create_restaurant_with_owner(
        restaurant_name=data.restaurant_name,
        slug=slug,
        owner_name=data.name,
        owner_email=email,
        owner_password=data.password,
        with_demo_data=True,
    )
    user = await db.users.find_one({"email": email})
    token = create_access_token(str(user["_id"]), user["email"], user.get("role"))
    return {"token": token, "user": serialize_user(user), "slug": slug, "restaurant_id": restaurant_id}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    return {"ok": True}


async def verify_token_ws(token: str):
    """Valida JWT para conexões WebSocket (sem HTTPException)."""
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
        user = await db.users.find_one({"_id": ObjectId(user_id)}, {"password_hash": 0})
        if user:
            user["id"] = str(user.pop("_id"))
        return user
    except Exception:
        return None
