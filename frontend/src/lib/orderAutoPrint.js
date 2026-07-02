import { toast } from "sonner";
import { brl } from "@/lib/format";
import { getQzPrintSettings, printQzText } from "@/lib/qzPrint";

const BROWSER_PRINT_ENABLED_KEY = "eg_browser_print_enabled";
const BROWSER_PRINT_TRIGGER_KEY = "eg_browser_print_trigger";

function browserPrintEnabled() {
  return localStorage.getItem(BROWSER_PRINT_ENABLED_KEY) === "true";
}

function browserPrintTrigger() {
  return localStorage.getItem(BROWSER_PRINT_TRIGGER_KEY) || "pending";
}

export function activePrintSettings() {
  const qz = getQzPrintSettings();
  if (qz.enabled) return { mode: "qz", trigger: qz.trigger || "pending", qz };
  if (browserPrintEnabled()) return { mode: "browser", trigger: browserPrintTrigger() };
  return { mode: "off", trigger: "pending" };
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortDateTime(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function orderTypeLabel(order) {
  if (order?.type === "dine_in") return `Mesa ${order.table_number || ""}`.trim();
  if (order?.type === "delivery") return "Entrega";
  return "Retirada";
}

export function buildAutoPrintReceipt(order) {
  const customer = order.customer || {};
  const address = order.address || {};
  const lines = [
    `PEDIDO #${order.order_number || ""}`,
    shortDateTime(order.created_at),
    "--------------------------------",
    `Cliente: ${customer.name || "Cliente"}`,
  ];
  if (customer.phone) lines.push(`Telefone: ${customer.phone}`);
  lines.push(`Tipo: ${orderTypeLabel(order)}`);
  if (address.street) {
    lines.push(`Endereco: ${address.street}, ${address.number || ""}`);
    if (address.neighborhood) lines.push(`Bairro: ${address.neighborhood}`);
    if (address.complement) lines.push(`Compl.: ${address.complement}`);
    if (address.reference) lines.push(`Ref.: ${address.reference}`);
  }
  lines.push("--------------------------------", "ITENS");
  (order.items || []).forEach((item) => {
    lines.push(`${item.quantity || 1}x ${item.product_name || "Produto"}`);
    (item.options || []).forEach((option) => lines.push(`  + ${option.name || option}`));
    if (item.notes) lines.push(`  Obs: ${item.notes}`);
    lines.push(`  ${brl(item.total_price || 0)}`);
  });
  lines.push(
    "--------------------------------",
    `Subtotal: ${brl(order.subtotal || 0)}`,
    `Entrega:  ${brl(order.delivery_fee || 0)}`
  );
  if (order.discount > 0) lines.push(`Desconto: -${brl(order.discount)}`);
  lines.push(`TOTAL:    ${brl(order.total || 0)}`);
  if (order.payment_method) lines.push(`Pagamento: ${order.payment_method}`);
  if (order.customer_notes) lines.push("--------------------------------", `Obs: ${order.customer_notes}`);
  return lines.join("\n");
}

export function printOrderInBrowser(order) {
  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Pedido ${htmlEscape(order.order_number || "")}</title>
    <style>body{font-family:Consolas,monospace;font-size:13px;margin:0;padding:12px;color:#000}pre{white-space:pre-wrap;margin:0}</style>
    </head><body><pre>${htmlEscape(buildAutoPrintReceipt(order))}</pre></body></html>`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  }, 250);
}

function printedKey(restaurantId) {
  return `eg_browser_printed:${restaurantId || "default"}`;
}

export function markAutoPrinted(order, restaurantId) {
  if (!order?.id) return;
  const key = printedKey(restaurantId);
  const saved = JSON.parse(localStorage.getItem(key) || "[]");
  const next = [order.id, ...saved.filter((id) => id !== order.id)].slice(0, 300);
  localStorage.setItem(key, JSON.stringify(next));
}

export function unmarkAutoPrinted(order, restaurantId) {
  if (!order?.id) return;
  const key = printedKey(restaurantId);
  const saved = JSON.parse(localStorage.getItem(key) || "[]");
  localStorage.setItem(key, JSON.stringify(saved.filter((id) => id !== order.id)));
}

export function hasAutoPrinted(order, restaurantId) {
  if (!order?.id) return true;
  const saved = JSON.parse(localStorage.getItem(printedKey(restaurantId)) || "[]");
  return saved.includes(order.id);
}

export function shouldAutoPrint(order, settings = activePrintSettings()) {
  return settings.mode !== "off"
    && order?.status === settings.trigger
    && order?.payment_status !== "awaiting";
}

export async function printOrderOnce(order, restaurantId, settings = activePrintSettings()) {
  if (!order || hasAutoPrinted(order, restaurantId) || !shouldAutoPrint(order, settings)) return false;
  markAutoPrinted(order, restaurantId);
  if (settings.mode === "qz") {
    const text = buildAutoPrintReceipt(order);
    try {
      await printQzText(text, settings.qz.printer);
      if (settings.qz.kitchenEnabled) {
        await printQzText(text, settings.qz.kitchenPrinter || settings.qz.printer);
      }
    } catch (err) {
      unmarkAutoPrinted(order, restaurantId);
      const detail = err?.response?.data?.detail || err?.message || "QZ Tray nao conectado.";
      toast.error(`Impressao QZ falhou: ${detail}`);
      return false;
    }
    return true;
  }
  printOrderInBrowser(order);
  return true;
}
