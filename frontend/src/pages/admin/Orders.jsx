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
function OrderCard({ order, onSelect, onStatusChange }) {
  const col = COL_MAP[order.status] || {};
  const nexts = NEXT_STATUS[order.status] || [];
  const isPending = order.status === "pending";

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
          {order.type === "delivery"
            ? <><Bike className="w-3 h-3" /> Entrega</>
            : <><ShoppingBag className="w-3 h-3" /> Retirada</>}
          {" · "}{order.items?.length || 0} {order.items?.length === 1 ? "item" : "itens"}
        </span>
        <span className="font-display font-bold text-sm" style={{ color: col.color }}>{brl(order.total)}</span>
      </div>

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
Tipo:    ${order.type === "delivery" ? "Entrega" : "Retirada"}
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
export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState("kanban"); // "kanban" | "list"
  const [collapsed, setCollapsed] = useState({});
  const prevPendingCount = useRef(0);
  const prevCancelCount = useRef(-1);

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
      const { data } = await api.get("/admin/orders");
      setOrders(data);

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
  }, [playOrderSound]);

  // Auth context para pegar token e restaurant_id
  const { user, token } = useAuth();

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

  const updateStatus = async (id, status) => {
    await api.put(`/admin/orders/${id}/status`, { status });
    toast.success(`Pedido → ${STATUS_LABEL[status]}`);
    load(true);
    if (selected?.id === id) setSelected((s) => s && { ...s, status });
  };

  const queuePrint = async (id) => {
    await api.post(`/admin/orders/${id}/print`);
    toast.success("Pedido enviado para a fila de impressão");
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
        Atualizando a cada 5s · alertas sonoros automáticos
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
              onStatusChange={updateStatus}
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
                    <OrderCard key={o.id} order={o} onSelect={setSelected} onStatusChange={updateStatus} />
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
        onStatusChange={updateStatus}
        onQueuePrint={queuePrint}
      />
    </div>
  );
}
