from dotenv import load_dotenv
from pathlib import Path
import os
import logging

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware

from db import client
import auth
import storage
import whatsapp
import routes_extras
import routes_ws
import routes_public
import routes_admin
import routes_superadmin
import routes_advanced
import routes_billing
import routes_whatsapp
import routes_flemy
import routes_printing
from seed import seed

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="Menu Digital SaaS")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Menu Digital API", "status": "ok"}


app.include_router(api_router)
app.include_router(auth.router)
app.include_router(storage.router)
app.include_router(whatsapp.router)
app.include_router(routes_extras.router)
app.include_router(routes_extras.public_wholesale_router)
app.include_router(routes_public.router)
app.include_router(routes_admin.router)
app.include_router(routes_superadmin.router)
app.include_router(routes_advanced.router)
app.include_router(routes_advanced.public_router)
app.include_router(routes_billing.router)
app.include_router(routes_ws.router)
app.include_router(routes_whatsapp.router)
app.include_router(routes_flemy.router)
app.include_router(routes_printing.admin_router)
app.include_router(routes_printing.agent_router)

def get_cors_origins() -> list[str]:
    configured = os.environ.get(
        "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
    )
    origins = {origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()}

    # The public site redirects the apex domain to www. Accept both browser
    # origins when either variant is configured.
    for origin in list(origins):
        if origin.startswith("https://www."):
            origins.add(origin.replace("https://www.", "https://", 1))
        elif origin.startswith("https://") and origin.count(".") == 1:
            origins.add(origin.replace("https://", "https://www.", 1))

    return sorted(origins)


cors_origins = get_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.on_event("startup")
async def on_startup():
    if os.environ.get("APP_ENV", "development").lower() == "production":
        auth.get_jwt_secret()
        if not cors_origins or "*" in cors_origins:
            raise RuntimeError("CORS_ORIGINS deve listar dominios explicitos em producao")
    await client.connect()
    try:
        await seed()
        logger.info("Seed complete")
    except Exception as e:
        logger.error(f"Seed failed: {e}")
        raise


@app.on_event("shutdown")
async def shutdown_db_client():
    await client.close()
