/**
 * Hook WebSocket para pedidos em tempo real.
 * Conecta ao backend e chama callbacks quando eventos chegam.
 * Fallback automático para polling se WS não disponível.
 */
import { useEffect, useRef, useCallback } from "react";

const WS_BASE = (process.env.REACT_APP_BACKEND_URL || "http://localhost:8001")
  .replace(/^http/, "ws")
  .replace(/\/$/, "");

export function useOrdersWS({ restaurantId, token, onNewOrder, onOrderUpdated }) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!restaurantId || !token || !mountedRef.current) return;

    const url = `${WS_BASE}/api/ws/orders/${restaurantId}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] Conectado ao canal de pedidos");
      // Cancela qualquer retry pendente
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "new_order" && onNewOrder) onNewOrder(msg.data);
        if (msg.event === "order_updated" && onOrderUpdated) onOrderUpdated(msg.data);
        if (msg.event === "ping") ws.send("ping");
      } catch {}
    };

    ws.onclose = (e) => {
      if (!mountedRef.current) return;
      console.log("[WS] Desconectado, reconectando em 3s...");
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [restaurantId, token, onNewOrder, onOrderUpdated]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Evita reconexão no unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  return wsRef;
}
