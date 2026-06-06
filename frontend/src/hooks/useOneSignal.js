/**
 * OneSignal push notifications.
 * App ID buscado do backend (/api/public/platform-config) com fallback para
 * REACT_APP_ONESIGNAL_APP_ID caso esteja definido no .env.
 * Se nenhum App ID estiver configurado, é no-op silencioso.
 */
import { useEffect } from "react";

// Cache para evitar múltiplas requisições ao backend
let _cachedAppId = undefined;

async function resolveAppId() {
  // 1. Env var tem prioridade (desenvolvimento local)
  const envId = process.env.REACT_APP_ONESIGNAL_APP_ID;
  if (envId) return envId;

  // 2. Cache da última consulta
  if (_cachedAppId !== undefined) return _cachedAppId;

  // 3. Busca do backend (configurado pelo Super Admin)
  try {
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";
    const res = await fetch(`${BACKEND_URL}/api/public/platform-config`);
    if (res.ok) {
      const cfg = await res.json();
      if (cfg.push_enabled === false) {
        _cachedAppId = "";
        return "";
      }
      _cachedAppId = cfg.onesignal_app_id || "";
      return _cachedAppId;
    }
  } catch {
    // Se o backend não responder, segue sem push
  }
  _cachedAppId = "";
  return "";
}

// Permite invalidar o cache quando o super admin salvar novas configurações
export function clearOneSignalCache() {
  _cachedAppId = undefined;
}

export function useOneSignal({ restaurantId, enabled = true }) {
  useEffect(() => {
    if (!enabled || !restaurantId) return;
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function init() {
      const appId = await resolveAppId();
      if (!appId || cancelled) return;

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal) => {
        try {
          await OneSignal.init({
            appId,
            notifyButton: { enable: false },
            allowLocalhostAsSecureOrigin: true,
          });

          // Tag para filtrar notificações por restaurante no backend
          await OneSignal.User.addTag("restaurant_id", restaurantId);

          // Pede permissão se ainda não foi solicitada
          const permission = await OneSignal.Notifications.permission;
          if (!permission) {
            await OneSignal.Notifications.requestPermission();
          }
        } catch (e) {
          console.warn("[OneSignal] init error:", e);
        }
      });
    }

    init();
    return () => { cancelled = true; };
  }, [restaurantId, enabled]);
}
