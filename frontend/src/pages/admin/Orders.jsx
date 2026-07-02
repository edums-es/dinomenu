import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageCircle, Printer, Loader2, ClipboardList,
  Clock, MapPin, User, Phone, ChevronRight, ChevronDown,
  ShoppingBag, CheckCircle2, XCircle, Bike, Bell, Search, Filter,
  Download, Archive, CalendarClock, BarChart3, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { useOrdersWS } from "@/hooks/useOrdersWS";
import { useAuth } from "@/context/AuthContext";

// ── Status config ──────────────────────────────────────────────────────────
const COLUMNS = [
  { key: "pending",          label: "Novos",       color: "#F59E0B", bg: "#FEF3C7", icon: Bell },
  { key: "accepted",         label: "Aceitos",      color: "#3B82F6", bg: "#DBEAFE", icon: CheckCircle2 },
  { key: "preparing",        label: "Em preparo",   color: "#8B5CF6", bg: "#EDE9FE", icon: ShoppingBag },
  { key: "ready",            label: "Prontos",      color: "#10B981", bg: "#D1FAE5", icon: CheckCircle2 },
  { key: "out_for_delivery", label: "Em entrega",   color: "#06B6D4", bg: "#CFFAFE", icon: Bike },
  { key: "completed",        label: "Finalizados",  color: "#6B7280", bg: "#F3F4F6", icon: CheckCircle2 },
  { key: "cancelled",        label: "Cancelados",   color: "#EF4444", bg: "#FEE2E2", icon: XCircle },
];

const COL_MAP = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

const NEXT_STATUS = {
  pending:          ["accepted", "cancelled"],
  accepted:         ["preparing", "cancelled"],
  preparing:        ["ready", "cancelled"],
  ready:            ["out_for_delivery", "completed", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  completed:        [],
  cancelled:        [],
};

const STATUS_LABEL = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label]));

const ORDER_SOUND = {
  new: "/sounds/new-order.wav",
  cancel: "/sounds/cancel-order.wav",
};

const BROWSER_PRINT_ENABLED_KEY = "eg_browser_print_enabled";
const BROWSER_PRINT_TRIGGER_KEY = "eg_browser_print_trigger";

function browserPrintEnabled() {
  return localStorage.getItem(BROWSER_PRINT_ENABLED_KEY) === "true";
}

function browserPrintTrigger() {
  return localStorage.getItem(BROWSER_PRINT_TRIGGER_KEY) || "pending";
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildBrowserReceipt(order) {
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

function printOrderInBrowser(order) {
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
    </head><body><pre>${htmlEscape(buildBrowserReceipt(order))}</pre></body></html>`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  }, 250);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function timeSince(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (diff < 1) return "agora";
  if (diff < 60) return `${diff}min`;
  return `${Math.floor(diff / 60)}h ${diff % 60}min`;
}

function StatusBadge({ status }) {
  const col = COL_MAP[status] || {};
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: col.bg, color: col.color }}>
      {col.label}
    </span>
  );
}

// ── Order card (inside Kanban column) ─────────────────────────────────────
function orderTypeLabel(order) {
  if (order?.type === "dine_in") return `Mesa ${order.table_number || ""}`.trim();
  if (order?.type === "delivery") return "Entrega";
  return "Retirada";
}

function orderTypeIcon(order) {
  if (order?.type === "delivery") return Bike;
  if (order?.type === "dine_in") return ClipboardList;
  return ShoppingBag;
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

function buildQueryParams({ cycleMode, statusFilter, sourceFilter, paymentFilter, dateFrom, dateTo }) {
  const params = { cycle: cycleMode, limit: cycleMode === "current" ? 800 : 3000 };
  if (statusFilter) params.status = statusFilter;
  if (sourceFilter) params.source = sourceFilter;
  if (paymentFilter) params.payment_status = paymentFilter;
  if (dateFrom) params.start_date = dateFrom;
  if (dateTo) params.end_date = dateTo;
  return params;
}

function OrderCard({ order, onSelect, onStatusChange }) {
  const col = COL_MAP[order.status] || {};
  const nexts = NEXT_STATUS[order.status] || [];
  const isPending = order.status === "pending";
  const TypeIcon = orderTypeIcon(order);

  return (
    <div
      onClick={() => onSelect(order)}
      className={`bg-white dark:bg-[#1E2430] rounded-2xl border shadow-sm p-3.5 cursor-pointer hover:shadow-md transition-all group
        ${isPending ? "border-amber-300 ring-2 ring-amber-200 dark:ring-amber-500/30" : "border-gray-100 dark:border-gray-700"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-sm">#{order.order_number}</span>
          {isPending && <span className="animate-pulse w-2 h-2 rounded-full bg-amber-500" />}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />{timeSince(order.created_at)}
        </span>
      </div>

      {/* Customer */}
      <div className="flex items-center gap-1.5 mb-1">
        <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span className="text-sm font-medium truncate">{order.customer?.name || "—"}</span>
        {order.payment_status === "awaiting" && (
          <span className="ml-auto shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
            Aguardando Pix
          </span>
        )}
      </div>

      {/* Type + total */}
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <TypeIcon className="w-3 h-3" /> {orderTypeLabel(order)}
          {" · "}{order.items?.length || 0} {order.items?.length === 1 ? "item" : "itens"}
        </span>
        <span className="font-display font-bold text-sm" style={{ color: col.color }}>{brl(order.total)}</span>
      </div>
      {order.delivery_person?.name && (
        <p className="mt-1 text-[11px] text-cyan-500 dark:text-cyan-300">
          Entregador: {order.delivery_person.name}
          {order.delivery_person.vehicle_plate ? ` (${order.delivery_person.vehicle_plate})` : ""}
        </p>
      )}

      {/* Quick actions */}
      {nexts.length > 0 && (
        <div className="flex gap-1.5 mt-3" onClick={(e) => e.stopPropagation()}>
          {nexts.map((s) => {
            const next = COL_MAP[s];
            const isCancelBtn = s === "cancelled";
            const isAwaitingPix = order.payment_status === "awaiting" && s === "accepted";
            return (
              <button key={s}
                onClick={() => !isAwaitingPix && onStatusChange(order.id, s)}
                disabled={isAwaitingPix}
                title={isAwaitingPix ? "Aguardando confirmação do Pix" : ""}
                className={`flex-1 text-xs font-semibold py-1.5 rounded-xl transition-colors
                  ${isCancelBtn
                    ? "bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100"
                    : isAwaitingPix
                    ? "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    : "text-white hover:opacity-90"}`}
                style={!isCancelBtn && !isAwaitingPix ? { background: next.color } : {}}>
                {isCancelBtn ? "Cancelar" : isAwaitingPix ? "Aguard. Pix..." : next.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Kanban column ─────────────────────────────────────────────────────────
function KanbanColumn({ col, orders, onSelect, onStatusChange, collapsed, onToggle }) {
  const count = orders.length;
  return (
    <div className={`flex flex-col min-w-[260px] max-w-[280px] transition-all ${collapsed ? "min-w-[48px] max-w-[48px]" : ""}`}>
      {/* Column header */}
      <button onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 w-full text-left"
        style={{ background: col.bg }}>
        <col.icon className="w-4 h-4 shrink-0" style={{ color: col.color }} />
        {!collapsed && (
          <>
            <span className="font-semibold text-sm flex-1" style={{ color: col.color }}>{col.label}</span>
            {count > 0 && (
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: col.color }}>{count}</span>
            )}
            <ChevronDown className="w-3.5 h-3.5" style={{ color: col.color }} />
          </>
        )}
        {collapsed && count > 0 && (
          <span className="text-xs font-bold" style={{ color: col.color }}>{count}</span>
        )}
      </button>

      {!collapsed && (
        <div className="flex-1 space-y-2 overflow-y-auto max-h-[calc(100vh-200px)] pr-1 scrollbar-hide">
          {orders.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-4 text-center text-xs text-gray-400">
              Nenhum pedido
            </div>
          ) : (
            orders.map((o) => (
              <OrderCard key={o.id} order={o} onSelect={onSelect} onStatusChange={onStatusChange} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────
function OrderModal({ order, onClose, onStatusChange, onQueuePrint }) {
  if (!order) return null;
  const nexts = NEXT_STATUS[order.status] || [];

  const printOrder = () => {
    const w = window.open("", "_blank");
    const itemsText = order.items.map((it) =>
      `${it.quantity}x ${it.product_name} - ${brl(it.total_price)}` +
      it.options.map((op) => `\n  + ${op.name}`).join("") +
      (it.notes ? `\n  Obs: ${it.notes}` : "")
    ).join("\n");
    w.document.write(`<pre style="font-family:monospace;font-size:13px;padding:16px">
PEDIDO #${order.order_number}
${new Date(order.created_at).toLocaleString("pt-BR")}
────────────────────────────────
Cliente: ${order.customer?.name}
Tel:     ${order.customer?.phone || "—"}
Tipo:    ${orderTypeLabel(order)}
${order.address ? `End:     ${order.address.street}, ${order.address.number} - ${order.address.neighborhood}\n         ${order.address.complement || ""}` : ""}
────────────────────────────────
${itemsText}
────────────────────────────────
Subtotal:  ${brl(order.subtotal)}
Entrega:   ${brl(order.delivery_fee)}
${order.discount > 0 ? `Desconto: -${brl(order.discount)}\n` : ""}TOTAL:     ${brl(order.total)}
Pagamento: ${order.payment_method}
${order.change_for ? `Troco p/: ${brl(order.change_for)}` : ""}
${order.customer_notes ? `Obs: ${order.customer_notes}` : ""}
</pre>`);
    w.print();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg dark:bg-[#1E2430] dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            Pedido #{order.order_number}
            <StatusBadge status={order.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm max-h-[65vh] overflow-y-auto pr-1">
          {/* Customer info */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 space-y-1.5">
            <p className="font-semibold flex items-center gap-2"><User className="w-4 h-4 text-gray-400" />{order.customer?.name}</p>
            {order.customer?.phone && (
              <p className="text-gray-500 flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" />{order.customer.phone}</p>
            )}
            {order.address && (
              <p className="text-gray-500 flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                {order.address.street}, {order.address.number}
                {order.address.complement ? ` - ${order.address.complement}` : ""}
                {" · "}{order.address.neighborhood}
              </p>
            )}
            <p className="text-gray-500">
              {order.type === "delivery" ? "🛵 Entrega" : "🏪 Retirada no local"} · {timeSince(order.created_at)}
            </p>
            {order.customer_notes && (
              <p className="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-2 py-1">
                📝 {order.customer_notes}
              </p>
            )}
          </div>

          {/* Items */}
          <div className="space-y-2">
            <p className="font-semibold text-xs uppercase tracking-wide text-gray-400">Itens do pedido</p>
            {order.items.map((it, idx) => (
              <div key={idx} className="flex justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-2">
                <div>
                  <p className="font-medium">{it.quantity}x {it.product_name}</p>
                  {it.options.map((op, i) => (
                    <p key={i} className="text-xs text-gray-400 pl-3">+ {op.name} {op.price > 0 ? `(+${brl(op.price)})` : ""}</p>
                  ))}
                  {it.notes && <p className="text-xs text-gray-400 italic pl-3">Obs: {it.notes}</p>}
                </div>
                <p className="font-display font-semibold shrink-0">{brl(it.total_price)}</p>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1">
            <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{brl(order.subtotal)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Entrega</span><span>{brl(order.delivery_fee)}</span></div>
            {order.discount > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{brl(order.discount)}</span></div>}
            <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-100 dark:border-gray-700">
              <span>Total</span><span>{brl(order.total)}</span>
            </div>
            <p className="text-gray-500 text-xs pt-1">
              💳 {order.payment_method}
              {order.change_for ? ` · Troco para ${brl(order.change_for)}` : ""}
            </p>
          </div>

          {/* Status actions */}
          {nexts.length > 0 && (
            <div className="space-y-1.5">
              <p className="font-semibold text-xs uppercase tracking-wide text-gray-400">Avançar status</p>
              <div className="flex gap-2 flex-wrap">
                {nexts.map((s) => {
                  const col = COL_MAP[s];
                  const isCancelBtn = s === "cancelled";
                  return (
                    <button key={s}
                      onClick={() => { onStatusChange(order.id, s); onClose(); }}
                      className={`flex-1 text-sm font-semibold py-2 rounded-xl transition-colors min-w-[120px]
                        ${isCancelBtn ? "bg-red-50 dark:bg-red-900/20 text-red-500 hover:bg-red-100" : "text-white hover:opacity-90"}`}
                      style={!isCancelBtn ? { background: col.color } : {}}>
                      {isCancelBtn ? "❌ Cancelar" : `→ ${col.label}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Contact + print */}
          <div className="flex gap-2 pt-1">
            {order.customer?.phone && (
              <a href={`https://wa.me/55${order.customer.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" className="w-full text-green-600 border-green-200 hover:bg-green-50">
                  <MessageCircle className="w-4 h-4 mr-1" /> WhatsApp
                </Button>
              </a>
            )}
            <Button variant="outline" className="flex-1" onClick={printOrder}>
              <Printer className="w-4 h-4 mr-1" /> Navegador
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onQueuePrint(order.id)}>
              <Printer className="w-4 h-4 mr-1" /> Fila
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Orders page ───────────────────────────────────────────────────────
function DeliveryAssignmentModal({ prompt, deliveryPeople, onClose, onConfirm }) {
  const [deliveryPersonId, setDeliveryPersonId] = useState(prompt?.deliveryPersonId || "");
  if (!prompt) return null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md dark:bg-[#1E2430] dark:border-gray-700">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Bike className="w-5 h-5 text-cyan-500" />
            Definir entregador
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Escolha o motoboy/entregador responsavel por esse pedido, ou continue sem vincular.
          </p>
          <select
            value={deliveryPersonId}
            onChange={(e) => setDeliveryPersonId(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none"
          >
            <option value="">Sem entregador definido</option>
            {deliveryPeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
                {person.vehicle_plate ? ` - ${person.vehicle_plate}` : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 dark:border-gray-700 dark:text-gray-300" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 text-white"
              onClick={() => onConfirm(deliveryPersonId)}
            >
              Confirmar entrega
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [deliveryPeople, setDeliveryPeople] = useState([]);
  const [deliveryPrompt, setDeliveryPrompt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cycleLoading, setCycleLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("kanban"); // "kanban" | "list"
  const [cycleMode, setCycleMode] = useState("current"); // "current" | "history" | "all"
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const prevPendingCount = useRef(0);
  const prevCancelCount = useRef(-1);
  const browserAutoReadyRef = useRef(false);
  const browserPrintedRef = useRef(new Set());

  // Auth context para pegar token e restaurant_id
  const { user, token } = useAuth();

  const markBrowserPrinted = useCallback((order) => {
    if (!order?.id) return;
    browserPrintedRef.current.add(order.id);
    const key = `eg_browser_printed:${user?.restaurant_id || "default"}`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    const next = [order.id, ...saved.filter((id) => id !== order.id)].slice(0, 300);
    localStorage.setItem(key, JSON.stringify(next));
  }, [user?.restaurant_id]);

  const hasBrowserPrinted = useCallback((order) => {
    if (!order?.id) return true;
    if (browserPrintedRef.current.has(order.id)) return true;
    const key = `eg_browser_printed:${user?.restaurant_id || "default"}`;
    const saved = JSON.parse(localStorage.getItem(key) || "[]");
    if (saved.includes(order.id)) {
      browserPrintedRef.current.add(order.id);
      return true;
    }
    return false;
  }, [user?.restaurant_id]);

  const printBrowserOrderOnce = useCallback((order) => {
    if (!order || hasBrowserPrinted(order)) return;
    printOrderInBrowser(order);
    markBrowserPrinted(order);
  }, [hasBrowserPrinted, markBrowserPrinted]);

  const processBrowserAutoPrint = useCallback((data = [], initial = false) => {
    if (!browserPrintEnabled()) return;
    const trigger = browserPrintTrigger();
    const candidates = data.filter((order) =>
      order.status === trigger && order.payment_status !== "awaiting"
    );
    if (initial) {
      candidates.forEach((order) => browserPrintedRef.current.add(order.id));
      return;
    }
    candidates.forEach(printBrowserOrderOnce);
  }, [printBrowserOrderOnce]);

  // Toca os alertas configurados em public/sounds.
  const playOrderSound = useCallback((type = "new") => {
    try {
      const audio = new Audio(ORDER_SOUND[type] || ORDER_SOUND.new);
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {}
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = buildQueryParams({ cycleMode, statusFilter, sourceFilter, paymentFilter, dateFrom, dateTo });
      const [ordersRes, summaryRes, cyclesRes, deliveryRes] = await Promise.all([
        api.get("/admin/orders", { params, skipCache: true }),
        api.get("/admin/orders/summary", { params, skipCache: true }),
        api.get("/admin/order-cycles"),
        api.get("/admin/delivery-people", { params: { active_only: true } }),
      ]);
      const data = ordersRes.data || [];
      setOrders(data);
      setSummary(summaryRes.data || null);
      setCycles(cyclesRes.data || []);
      setDeliveryPeople(deliveryRes.data || []);
      processBrowserAutoPrint(data, !browserAutoReadyRef.current);
      browserAutoReadyRef.current = true;

      // Novo pedido — exclui os que estao aguardando Pix (ainda nao foram pagos)
      const pendingNow = data.filter(
        (o) => o.status === "pending" && o.payment_status !== "awaiting"
      ).length;
      if (pendingNow > prevPendingCount.current && prevPendingCount.current >= 0) {
        toast.info(`🔔 ${pendingNow - prevPendingCount.current} novo(s) pedido(s)!`, { duration: 6000 });
        playOrderSound('new');
      }
      prevPendingCount.current = pendingNow;

      // Pedido cancelado
      const cancelNow = data.filter((o) => o.status === "cancelled").length;
      if (prevCancelCount.current >= 0 && cancelNow > prevCancelCount.current) {
        toast.warning(`❌ ${cancelNow - prevCancelCount.current} pedido(s) cancelado(s)`, { duration: 6000 });
        playOrderSound('cancel');
      }
      if (prevCancelCount.current < 0) prevCancelCount.current = cancelNow;
      else prevCancelCount.current = cancelNow;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [cycleMode, statusFilter, sourceFilter, paymentFilter, dateFrom, dateTo, playOrderSound, processBrowserAutoPrint]);

  // WebSocket para tempo real — substitui a maior parte do polling
  useOrdersWS({
    restaurantId: user?.restaurant_id,
    token: token,
    onNewOrder: useCallback((data) => {
      playOrderSound('new');
      toast.info(`🔔 Novo pedido #${data.order_number}!`, { duration: 6000 });
      load(true);
    }, [load, playOrderSound]),
    onOrderUpdated: useCallback(() => {
      load(true);
    }, [load]),
  });

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // Polling de fallback a cada 30s (WS cuida do tempo real)
    const t = setInterval(() => load(true), 30000);
    // Atualiza imediatamente ao focar na aba
    const onVisible = () => { if (document.visibilityState === "visible") load(true); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const updateStatus = async (id, status, extra = {}) => {
    await api.put(`/admin/orders/${id}/status`, { status, ...extra });
    toast.success(`Pedido → ${STATUS_LABEL[status]}`);
    if (browserPrintEnabled() && browserPrintTrigger() === status) {
      const order = orders.find((item) => item.id === id) || selected;
      if (order) printBrowserOrderOnce({ ...order, status });
    }
    load(true);
    if (selected?.id === id) setSelected((s) => s && { ...s, status });
  };

  const requestStatusChange = async (id, status) => {
    if (status === "out_for_delivery" && deliveryPeople.length > 0) {
      setDeliveryPrompt({ orderId: id, status, deliveryPersonId: "" });
      return;
    }
    await updateStatus(id, status);
  };

  const confirmDeliveryAssignment = async (deliveryPersonId) => {
    if (!deliveryPrompt) return;
    await updateStatus(
      deliveryPrompt.orderId,
      deliveryPrompt.status,
      deliveryPersonId ? { delivery_person_id: deliveryPersonId } : {}
    );
    setDeliveryPrompt(null);
  };

  const queuePrint = async (id) => {
    await api.post(`/admin/orders/${id}/print`);
    toast.success("Pedido enviado para a fila de impressão");
  };

  const exportOrders = async () => {
    try {
      const params = buildQueryParams({ cycleMode, statusFilter, sourceFilter, paymentFilter, dateFrom, dateTo });
      const res = await api.get("/admin/orders/export", { params, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedidos-${cycleMode}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Erro ao exportar pedidos");
    }
  };

  const closeCycle = async (period) => {
    const label = period === "week" ? "semana" : "dia";
    if (!window.confirm(`Fechar o ciclo do ${label}? Pedidos finalizados saem do ciclo atual e continuam no historico.`)) return;
    setCycleLoading(true);
    try {
      const { data } = await api.post("/admin/order-cycles/close", { period });
      toast.success(`Ciclo fechado: ${data.orders_count} pedido(s), ${brl(data.revenue)}`);
      if (data.open_orders_left > 0) {
        toast.info(`${data.open_orders_left} pedido(s) em aberto ficaram no ciclo atual`);
      }
      await load(true);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Nao foi possivel fechar o ciclo");
    } finally {
      setCycleLoading(false);
    }
  };

  const reopenCycle = async (cycle) => {
    if (!window.confirm(`Reabrir "${cycle.label}"? Os pedidos voltam para o ciclo atual.`)) return;
    setCycleLoading(true);
    try {
      await api.post(`/admin/order-cycles/${cycle.id}/reopen`);
      toast.success("Ciclo reaberto");
      await load(true);
    } catch {
      toast.error("Erro ao reabrir ciclo");
    } finally {
      setCycleLoading(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(o.order_number).includes(q) ||
      (o.customer?.name || "").toLowerCase().includes(q) ||
      (o.customer?.phone || "").includes(q)
    );
  });

  const byStatus = Object.fromEntries(
    COLUMNS.map((c) => [c.key, filteredOrders.filter((o) => o.status === c.key)])
  );

  const toggleCollapse = (key) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  const stats = summary?.summary || {};
  const lastCycle = summary?.last_cycle;

  if (loading) return (
    <div className="grid place-items-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
    </div>
  );

  return (
    <div className="space-y-4" data-testid="admin-orders">
      {/* Status bar */}
      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"/>
        Atualizando a cada 30s · alertas sonoros automáticos
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Receita do filtro", value: brl(stats.revenue || 0), icon: BarChart3, color: "text-emerald-500" },
          { label: "Pedidos validos", value: stats.valid_orders || 0, icon: ClipboardList, color: "text-indigo-500" },
          { label: "Ticket medio", value: brl(stats.avg_ticket || 0), icon: ShoppingBag, color: "text-amber-500" },
          { label: "Em andamento", value: stats.in_progress || 0, icon: Clock, color: "text-cyan-500" },
        ].map((item) => (
          <div key={item.label} className="bg-white dark:bg-[#1E2430] border border-gray-100 dark:border-gray-700 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{item.label}</p>
              <item.icon className={`w-4 h-4 ${item.color}`} />
            </div>
            <p className="font-display font-bold text-xl mt-2 dark:text-white">{item.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white dark:bg-[#1E2430] border border-gray-100 dark:border-gray-700 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-bold dark:text-white flex items-center gap-2">
              <Archive className="w-4 h-4 text-indigo-500" /> Ciclo de pedidos
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Feche dia ou semana para limpar a operacao atual sem apagar historico.
              {lastCycle && <span> Ultimo fechamento: {shortDateTime(lastCycle.closed_at)}.</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => closeCycle("day")} disabled={cycleLoading} className="dark:border-gray-700 dark:text-gray-300">
              <CalendarClock className="w-4 h-4 mr-1" /> Fechar dia
            </Button>
            <Button size="sm" variant="outline" onClick={() => closeCycle("week")} disabled={cycleLoading} className="dark:border-gray-700 dark:text-gray-300">
              <Archive className="w-4 h-4 mr-1" /> Fechar semana
            </Button>
            <Button size="sm" variant="outline" onClick={exportOrders} className="dark:border-gray-700 dark:text-gray-300">
              <Download className="w-4 h-4 mr-1" /> Exportar
            </Button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <select value={cycleMode} onChange={(e) => setCycleMode(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none">
            <option value="current">Ciclo atual</option>
            <option value="history">Historico fechado</option>
            <option value="all">Todos os pedidos</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none">
            <option value="">Todos status</option>
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none">
            <option value="">Todos canais</option>
            <option value="online">Cardapio online</option>
            <option value="table_qr">Mesa / QR Code</option>
            <option value="pdv">PDV</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <select value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none">
            <option value="">Todos pagamentos</option>
            <option value="pending">Pendente</option>
            <option value="awaiting">Aguardando Pix</option>
            <option value="paid">Pago</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none" />
        </div>

        {cycles.length > 0 && cycleMode === "history" && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {cycles.slice(0, 8).map((cycle) => (
              <div key={cycle.id} className="shrink-0 rounded-xl border border-gray-100 dark:border-gray-700 px-3 py-2 min-w-[220px]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold dark:text-white truncate">{cycle.label}</p>
                  <button onClick={() => reopenCycle(cycle)} className="text-xs text-indigo-500 hover:underline flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" /> reabrir
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">{shortDateTime(cycle.closed_at)} · {cycle.orders_count} pedidos · {brl(cycle.revenue)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl dark:text-white">Pedidos</h1>
          <p className="text-sm text-gray-400">
            {orders.filter(o => o.status === "pending" && o.payment_status !== "awaiting").length} novos
            {orders.filter(o => o.payment_status === "awaiting").length > 0 && (
              <span className="ml-2 text-orange-500">· {orders.filter(o => o.payment_status === "awaiting").length} aguard. Pix</span>
            )}
            {" · "}{orders.filter(o => ["accepted","preparing","ready","out_for_delivery"].includes(o.status)).length} em andamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido ou cliente..."
              className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white text-sm outline-none w-52 focus:border-gray-400" />
          </div>
          {/* View toggle */}
          <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            {[["kanban", "Kanban"], ["list", "Lista"]].map(([v, label]) => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${view === v ? "bg-[#111827] dark:bg-indigo-500 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                {label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => load()} variant="outline" className="dark:border-gray-700 dark:text-gray-300">
            Atualizar
          </Button>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white dark:bg-[#1E2430] rounded-2xl border border-gray-100 dark:border-gray-700 p-16 text-center text-gray-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum pedido ainda</p>
          <p className="text-sm mt-1">Os pedidos aparecem aqui em tempo real.</p>
        </div>
      ) : view === "kanban" ? (
        /* ── KANBAN VIEW ── */
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              col={col}
              orders={byStatus[col.key] || []}
              onSelect={setSelected}
              onStatusChange={requestStatusChange}
              collapsed={!!collapsed[col.key]}
              onToggle={() => toggleCollapse(col.key)}
            />
          ))}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <div className="space-y-2">
          {COLUMNS.map((col) => {
            const items = byStatus[col.key] || [];
            if (items.length === 0) return null;
            return (
              <div key={col.key}>
                <div className="flex items-center gap-2 py-2 px-1">
                  <col.icon className="w-4 h-4" style={{ color: col.color }} />
                  <span className="font-semibold text-sm" style={{ color: col.color }}>{col.label}</span>
                  <span className="text-xs text-gray-400">({items.length})</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((o) => (
                    <OrderCard key={o.id} order={o} onSelect={setSelected} onStatusChange={requestStatusChange} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <OrderModal
        order={selected}
        onClose={() => setSelected(null)}
        onStatusChange={requestStatusChange}
        onQueuePrint={queuePrint}
      />
      <DeliveryAssignmentModal
        prompt={deliveryPrompt}
        deliveryPeople={deliveryPeople}
        onClose={() => setDeliveryPrompt(null)}
        onConfirm={confirmDeliveryAssignment}
      />
    </div>
  );
}
