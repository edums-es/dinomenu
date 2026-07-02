import { useCallback, useEffect, useRef } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useOrdersWS } from "@/hooks/useOrdersWS";
import {
  activePrintSettings,
  markAutoPrinted,
  printOrderOnce,
  shouldAutoPrint,
} from "@/lib/orderAutoPrint";

export default function AutoPrintMonitor() {
  const { user, token } = useAuth();
  const readyRef = useRef(false);
  const loadingRef = useRef(false);

  const processOrders = useCallback(async (initial = false) => {
    if (!user?.restaurant_id || loadingRef.current) return;
    const settings = activePrintSettings();
    if (settings.mode === "off") return;
    loadingRef.current = true;
    try {
      const { data } = await api.get("/admin/orders", {
        params: { cycle: "current", limit: 800 },
        skipCache: true,
      });
      const candidates = (data || []).filter((order) => shouldAutoPrint(order, settings));
      if (initial) {
        candidates.forEach((order) => markAutoPrinted(order, user.restaurant_id));
        return;
      }
      for (const order of candidates) {
        await printOrderOnce(order, user.restaurant_id, settings);
      }
    } finally {
      loadingRef.current = false;
      readyRef.current = true;
    }
  }, [user?.restaurant_id]);

  const processNow = useCallback(() => {
    processOrders(!readyRef.current);
  }, [processOrders]);

  useOrdersWS({
    restaurantId: user?.restaurant_id,
    token,
    onNewOrder: processNow,
    onOrderUpdated: processNow,
  });

  useEffect(() => {
    readyRef.current = false;
    processOrders(true);
    const interval = setInterval(() => processOrders(false), 10000);
    return () => clearInterval(interval);
  }, [processOrders]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") processOrders(false);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [processOrders]);

  return null;
}
