"""
WebSocket endpoint — tempo real de pedidos por restaurante.
Cada restaurante tem seu próprio canal isolado.
"""
import asyncio
import json
import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from auth import verify_token_ws, require_roles

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ws", tags=["websocket"])

# { restaurant_id: set of active websockets }
_rooms: Dict[str, Set[WebSocket]] = {}


def get_room(restaurant_id: str) -> Set[WebSocket]:
    if restaurant_id not in _rooms:
        _rooms[restaurant_id] = set()
    return _rooms[restaurant_id]


async def broadcast(restaurant_id: str, event: str, data: dict):
    """Envia evento para todos os clientes conectados no restaurante."""
    room = _rooms.get(restaurant_id, set())
    if not room:
        return
    msg = json.dumps({"event": event, "data": data})
    dead = set()
    for ws in list(room):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.add(ws)
    room -= dead


SUPER = require_roles("super_admin")


@router.get("/stats")
async def ws_stats(user=Depends(SUPER)):
    """Retorna estatísticas de conexões WebSocket ativas (super admin apenas)."""
    rooms_info = {rid: len(clients) for rid, clients in _rooms.items() if clients}
    return {
        "total_connected": sum(rooms_info.values()),
        "active_rooms": len(rooms_info),
        "rooms": rooms_info,
    }


@router.websocket("/orders/{restaurant_id}")
async def ws_orders(websocket: WebSocket, restaurant_id: str, token: str = Query(...)):
    """
    WebSocket para painel admin — recebe eventos em tempo real.
    Conectar: ws://host/api/ws/orders/{restaurant_id}?token=JWT
    """
    # Valida JWT
    user = await verify_token_ws(token)
    if not user or (str(user.get("restaurant_id", "")) != restaurant_id and user.get("role") != "super_admin"):
        await websocket.close(code=4001)
        return

    await websocket.accept()
    room = get_room(restaurant_id)
    room.add(websocket)
    logger.info(f"WS conectado: {restaurant_id} ({len(room)} clientes)")

    try:
        # Mantém conexão viva com ping/pong
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # Envia ping para checar se cliente ainda está vivo
                try:
                    await websocket.send_text(json.dumps({"event": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        room.discard(websocket)
        logger.info(f"WS desconectado: {restaurant_id} ({len(room)} clientes)")
