import base64
import ctypes
import json
import os
import uuid
from ctypes import wintypes
from pathlib import Path


APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "EGDeliveryPrintAgent"
CONFIG_PATH = APP_DIR / "config.json"


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _blob(data):
    buffer = ctypes.create_string_buffer(data)
    return DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char))), buffer


def protect(value):
    if not value:
        return ""
    if os.name != "nt":
        return base64.b64encode(value.encode("utf-8")).decode("ascii")
    source, source_buffer = _blob(value.encode("utf-8"))
    result = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptProtectData(
        ctypes.byref(source), "EG Delivery", None, None, None, 0, ctypes.byref(result)
    ):
        raise ctypes.WinError()
    try:
        encrypted = ctypes.string_at(result.pbData, result.cbData)
        return base64.b64encode(encrypted).decode("ascii")
    finally:
        ctypes.windll.kernel32.LocalFree(result.pbData)
        del source_buffer


def unprotect(value):
    if not value:
        return ""
    encrypted = base64.b64decode(value)
    if os.name != "nt":
        return encrypted.decode("utf-8")
    source, source_buffer = _blob(encrypted)
    result = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(
        ctypes.byref(source), None, None, None, None, 0, ctypes.byref(result)
    ):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(result.pbData, result.cbData).decode("utf-8")
    finally:
        ctypes.windll.kernel32.LocalFree(result.pbData)
        del source_buffer


def load_config():
    defaults = {
        "device_id": str(uuid.uuid4()),
        "device_name": os.environ.get("COMPUTERNAME", "Computador da loja"),
        "api_base": "https://api.easygrowth.com.br/api",
        "printer_name": "",
        "paper_width": "80mm",
        "cut_paper": True,
        "printed_job_ids": [],
        "restaurant_name": "",
        "agent_id": "",
    }
    if CONFIG_PATH.exists():
        try:
            defaults.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))
        except Exception:
            pass
    return defaults


def save_config(config):
    APP_DIR.mkdir(parents=True, exist_ok=True)
    temp_path = CONFIG_PATH.with_suffix(".tmp")
    temp_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(CONFIG_PATH)


def get_access_token(config):
    try:
        return unprotect(config.get("access_token_protected", ""))
    except Exception:
        return ""


def set_access_token(config, token):
    config["access_token_protected"] = protect(token)

