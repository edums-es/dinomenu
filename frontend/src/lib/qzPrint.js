import api from "@/lib/api";

const QZ_CDN_URL = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.js";

export const QZ_PRINT_ENABLED_KEY = "eg_qz_print_enabled";
export const QZ_PRINT_TRIGGER_KEY = "eg_qz_print_trigger";
export const QZ_PRINT_PRINTER_KEY = "eg_qz_print_printer";
export const QZ_KITCHEN_ENABLED_KEY = "eg_qz_kitchen_enabled";
export const QZ_KITCHEN_PRINTER_KEY = "eg_qz_kitchen_printer";

let qzLoadPromise = null;

export function getQzPrintSettings() {
  return {
    enabled: localStorage.getItem(QZ_PRINT_ENABLED_KEY) === "true",
    trigger: localStorage.getItem(QZ_PRINT_TRIGGER_KEY) || "pending",
    printer: localStorage.getItem(QZ_PRINT_PRINTER_KEY) || "",
    kitchenEnabled: localStorage.getItem(QZ_KITCHEN_ENABLED_KEY) === "true",
    kitchenPrinter: localStorage.getItem(QZ_KITCHEN_PRINTER_KEY) || "",
  };
}

export function saveQzPrintSettings(settings = {}) {
  localStorage.setItem(QZ_PRINT_ENABLED_KEY, settings.enabled ? "true" : "false");
  localStorage.setItem(QZ_PRINT_TRIGGER_KEY, settings.trigger || "pending");
  localStorage.setItem(QZ_PRINT_PRINTER_KEY, settings.printer || "");
  localStorage.setItem(QZ_KITCHEN_ENABLED_KEY, settings.kitchenEnabled ? "true" : "false");
  localStorage.setItem(QZ_KITCHEN_PRINTER_KEY, settings.kitchenPrinter || "");
}

function configureQzSecurity(qz) {
  if (qz.__egDeliveryConfigured) return;

  qz.security.setCertificatePromise((resolve, reject) => {
    api.get("/admin/printing/qz/certificate", { responseType: "text", skipCache: true })
      .then((res) => resolve(res.data))
      .catch((err) => reject(err));
  });

  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
    api.post("/admin/printing/qz/signature", { request: toSign })
      .then((res) => resolve(res.data.signature))
      .catch((err) => reject(err));
  });

  qz.__egDeliveryConfigured = true;
}

export async function loadQzTray() {
  if (window.qz) {
    configureQzSecurity(window.qz);
    return window.qz;
  }

  if (!qzLoadPromise) {
    qzLoadPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${QZ_CDN_URL}"]`);
      const script = existing || document.createElement("script");
      script.src = QZ_CDN_URL;
      script.async = true;
      script.onload = () => {
        if (!window.qz) {
          reject(new Error("QZ Tray nao carregou no navegador."));
          return;
        }
        configureQzSecurity(window.qz);
        resolve(window.qz);
      };
      script.onerror = () => reject(new Error("Nao foi possivel carregar o QZ Tray."));
      if (!existing) document.head.appendChild(script);
    });
  }

  return qzLoadPromise;
}

export async function connectQzTray() {
  const qz = await loadQzTray();
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect({ retries: 1, delay: 0 });
  }
  return qz;
}

export async function listQzPrinters() {
  const qz = await connectQzTray();
  return qz.printers.find();
}

export async function printQzText(text, printerName) {
  const qz = await connectQzTray();
  const config = qz.configs.create(printerName || undefined, { encoding: "UTF-8" });
  return qz.print(config, [{ type: "raw", format: "plain", data: text }]);
}
