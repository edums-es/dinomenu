"""Storage: Cloudinary (production) com fallback local."""
import os
import uuid
import logging
import io

import asyncio
from functools import partial
import cloudinary
import cloudinary.uploader
from PIL import Image, UnidentifiedImageError
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Response

from db import db
from auth import get_current_user

logger = logging.getLogger(__name__)

# ── Cloudinary config ──────────────────────────────────────────────────────
CLOUDINARY_URL = os.environ.get("CLOUDINARY_URL", "")
USE_CLOUDINARY = bool(CLOUDINARY_URL)

if USE_CLOUDINARY:
    cloudinary.config(cloudinary_url=CLOUDINARY_URL)
    logger.info("Storage: Cloudinary ativo")
else:
    logger.warning("Storage: CLOUDINARY_URL não definida — usando armazenamento local (não persistente)")

# ── Local fallback ─────────────────────────────────────────────────────────
UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "/tmp/uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "webp": "image/webp",
}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_OUTPUT_SIZE = (2400, 2400)
Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


def init_storage():
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    return UPLOAD_DIR


# ── Upload helpers ─────────────────────────────────────────────────────────

async def _upload_cloudinary(data: bytes, ext: str, folder: str) -> str:
    """Envia para Cloudinary de forma não-bloqueante e retorna a URL pública."""
    loop = asyncio.get_event_loop()
    fn = partial(
        cloudinary.uploader.upload,
        data,
        folder=folder,
        resource_type="image",
        format=ext,
        overwrite=False,
    )
    result = await loop.run_in_executor(None, fn)
    return result["secure_url"]


def _upload_local(data: bytes, ext: str, owner: str) -> str:
    """Salva localmente e retorna o path relativo da API."""
    path = f"menudigital/uploads/{owner}/{uuid.uuid4()}.{ext}"
    full_path = os.path.join(UPLOAD_DIR, path.replace("/", os.sep))
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "wb") as f:
        f.write(data)
    return path  # retorna path para montar URL via /api/files/


def _sanitize_image(data: bytes) -> tuple[bytes, str]:
    """Decode and re-encode an image to remove metadata and reject disguised files."""
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            image.thumbnail(MAX_OUTPUT_SIZE)
            has_alpha = image.mode in ("RGBA", "LA") or (
                image.mode == "P" and "transparency" in image.info
            )
            output = io.BytesIO()
            if has_alpha:
                image.convert("RGBA").save(output, format="PNG", optimize=True)
                ext = "png"
            else:
                image.convert("RGB").save(output, format="JPEG", quality=88, optimize=True)
                ext = "jpg"
            return output.getvalue(), ext
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise HTTPException(status_code=400, detail="Arquivo nao e uma imagem valida")


# ── FastAPI router ─────────────────────────────────────────────────────────
router = APIRouter(prefix="/api", tags=["files"])


@router.post("/upload")
async def upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    if ext not in MIME_TYPES:
        raise HTTPException(status_code=400, detail="Formato nao suportado (use jpg, png ou webp)")

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Imagem muito grande (max 8MB)")
    data, ext = _sanitize_image(data)

    owner = user.get("restaurant_id") or str(user["_id"])

    try:
        if USE_CLOUDINARY:
            folder = f"menudigital/{owner}"
            public_url = await _upload_cloudinary(data, ext, folder)
            await db.files.insert_one({
                "id": str(uuid.uuid4()),
                "restaurant_id": user.get("restaurant_id"),
                "storage_type": "cloudinary",
                "url": public_url,
                "original_filename": file.filename,
                "content_type": MIME_TYPES.get(ext, "image/jpeg"),
                "size": len(data),
                "is_deleted": False,
            })
            return {"url": public_url}
        else:
            path = _upload_local(data, ext, owner)
            await db.files.insert_one({
                "id": str(uuid.uuid4()),
                "restaurant_id": user.get("restaurant_id"),
                "storage_type": "local",
                "storage_path": path,
                "original_filename": file.filename,
                "content_type": MIME_TYPES.get(ext, "image/jpeg"),
                "size": len(data),
                "is_deleted": False,
            })
            return {"url": f"/api/files/{path}"}

    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Erro no upload: {str(e)}")


@router.get("/files/{path:path}")
async def download(path: str):
    """Serve arquivos do storage local (fallback apenas)."""
    record = await db.files.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    full_path = os.path.join(UPLOAD_DIR, path.replace("/", os.sep))
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
    with open(full_path, "rb") as f:
        data = f.read()
    ext = path.rsplit(".", 1)[-1].lower()
    content_type = MIME_TYPES.get(ext, "application/octet-stream")
    return Response(content=data, media_type=content_type,
                    headers={"Cache-Control": "public, max-age=86400"})
