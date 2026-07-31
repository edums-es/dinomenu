import { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Download,
  MessageCircle,
  Phone,
  Search,
  ShoppingBag,
  Star,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

const ORDER_STATUS_LABELS = {
  pending: "Novo",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu p/ entrega",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

const ORDER_STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  accepted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  preparing: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  out_for_delivery: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const SEGMENT_COLORS = {
  vip: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  hot: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  new: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  active: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  at_risk: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  lost: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  cancelled_only: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const LEAD_STATUS_OPTIONS = [
  { key: "none", label: "Sem acao" },
  { key: "to_contact", label: "Contatar" },
  { key: "negotiating", label: "Em conversa" },
  { key: "won", label: "Convertido" },
  { key: "paused", label: "Pausado" },
];

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function safeDate(value, withTime = false) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("pt-BR", withTime ? {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    } : undefined);
  } catch {
    return "-";
  }
}

function waLink(phone, name, segment) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (!digits.startsWith("55")) digits = `55${digits}`;
  const customerName = name ? `, ${name.split(" ")[0]}` : "";
  const messages = {
    vip: `Oi${customerName}! Passando para agradecer pela preferencia. Temos novidades no cardapio hoje.`,
    hot: `Oi${customerName}! Que bom ter voce por aqui. Quer repetir seu ultimo pedido ou ver as novidades?`,
    at_risk: `Oi${customerName}! Sentimos sua falta por aqui. Posso te mandar as ofertas de hoje?`,
    lost: `Oi${customerName}! Faz um tempo que voce nao pede com a gente. Temos uma novidade especial para voce.`,
    new: `Oi${customerName}! Obrigado pelo seu pedido. Qualquer coisa estamos por aqui.`,
  };
  const text = messages[segment] || `Oi${customerName}! Tudo bem? Aqui e do restaurante.`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [summary, setSummary] = useState({});
  const [segments, setSegments] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState("all");
  const [leadStatus, setLeadStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [leadForm, setLeadForm] = useState({
    lead_status: "none",
    notes: "",
    next_action_at: "",
  });
  const [savingLead, setSavingLead] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const pageSize = 30;

  const queryParams = useCallback(() => ({
    search: debouncedSearch || undefined,
    segment: segment === "all" ? undefined : segment,
    lead_status: leadStatus === "all" ? undefined : leadStatus,
    page,
    per_page: pageSize,
  }), [debouncedSearch, leadStatus, page, segment]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/customers", { params: queryParams() });
      setCustomers(r.data.customers || r.data.items || []);
      setTotal(r.data.total || 0);
      setSummary(r.data.summary || {});
      setSegments(r.data.segments || []);
    } catch (error) {
      toast.error(formatApiError(error?.response?.data?.detail) || "Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, segment, leadStatus]);

  useEffect(() => {
    load();
  }, [load]);

  const openHistory = async (customer) => {
    setSelectedCustomer(customer);
    setLeadForm({
      lead_status: customer.lead_status || "none",
      notes: customer.lead_notes || "",
      next_action_at: customer.next_action_at || "",
    });
    setHistoryOpen(true);
    setOrdersLoading(true);
    try {
      const r = await api.get(`/admin/customers/${encodeURIComponent(customer.phone)}/orders`);
      setOrders(r.data || []);
    } catch {
      toast.error("Erro ao carregar historico");
    } finally {
      setOrdersLoading(false);
    }
  };

  const saveLead = async () => {
    if (!selectedCustomer?.phone) return;
    setSavingLead(true);
    try {
      await api.put(`/admin/customers/${encodeURIComponent(selectedCustomer.phone)}/lead`, leadForm);
      toast.success("Lead atualizado");
      setSelectedCustomer((current) => current ? {
        ...current,
        lead_status: leadForm.lead_status,
        lead_status_label: LEAD_STATUS_OPTIONS.find((s) => s.key === leadForm.lead_status)?.label || "Sem acao",
        lead_notes: leadForm.notes,
        next_action_at: leadForm.next_action_at,
      } : current);
      await load();
    } catch (error) {
      toast.error(formatApiError(error?.response?.data?.detail) || "Erro ao salvar lead");
    } finally {
      setSavingLead(false);
    }
  };

  const exportCustomers = async () => {
    setExporting(true);
    try {
      const r = await api.get("/admin/customers/export", {
        params: {
          search: debouncedSearch || undefined,
          segment: segment === "all" ? undefined : segment,
          lead_status: leadStatus === "all" ? undefined : leadStatus,
        },
        responseType: "blob",
        skipCache: true,
      });
      const url = URL.createObjectURL(new Blob([r.data], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "clientes-leads.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Exportacao gerada");
    } catch (error) {
      toast.error(formatApiError(error?.response?.data?.detail) || "Erro ao exportar clientes");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);
  const selectedWaLink = selectedCustomer
    ? waLink(selectedCustomer.phone, selectedCustomer.name, selectedCustomer.segment)
    : "";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-bold text-2xl text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-blue-500" />
            Clientes e leads
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Use pedidos, valor gasto e ultima compra para recuperar e fidelizar clientes.
          </p>
        </div>
        <Button onClick={exportCustomers} disabled={exporting} className="gap-2">
          <Download className="w-4 h-4" />
          {exporting ? "Exportando..." : "Exportar CSV"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Users} label="Base de clientes" value={summary.total || 0} />
        <MetricCard icon={Star} label="VIP" value={summary.vip || 0} tone="amber" />
        <MetricCard icon={TrendingUp} label="Quentes" value={summary.hot || 0} tone="green" />
        <MetricCard icon={AlertTriangle} label="Risco/perdidos" value={(summary.at_risk || 0) + (summary.lost || 0)} tone="orange" />
        <MetricCard icon={Target} label="Receita da base" value={brl(summary.revenue || 0)} tone="blue" />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, telefone ou bairro..."
              className="pl-9 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
            />
          </div>
          <Select value={segment} onValueChange={setSegment}>
            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
              <SelectValue placeholder="Segmento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os segmentos</SelectItem>
              {segments.map((item) => (
                <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={leadStatus} onValueChange={setLeadStatus}>
            <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
              <SelectValue placeholder="Status do lead" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {LEAD_STATUS_OPTIONS.map((item) => (
                <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <Th>Cliente</Th>
                <Th>Segmento</Th>
                <Th>Lead</Th>
                <Th align="right">Pedidos</Th>
                <Th align="right">Receita</Th>
                <Th>Ultima compra</Th>
                <Th>Bairro</Th>
                <Th align="right">Acao</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <Users className="w-5 h-5 animate-pulse" />
                      Carregando clientes...
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400 dark:text-gray-600">
                    Nenhum cliente encontrado
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.phone}
                    onClick={() => openHistory(c)}
                    className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 min-w-[220px]">
                      <span className="font-medium text-gray-900 dark:text-white">{c.name || "-"}</span>
                      <div className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Phone className="w-3.5 h-3.5" />
                        {c.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={SEGMENT_COLORS[c.segment] || SEGMENT_COLORS.active}>
                        {c.segment_label || "Ativo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {c.lead_status_label || "Sem acao"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {c.valid_order_count || c.order_count || 0}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                      {brl(c.total_spent || 0)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {safeDate(c.last_order_at)}
                      {c.days_since_last_order != null && (
                        <span className="block text-xs">{c.days_since_last_order} dia(s)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {c.neighborhood || "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {waLink(c.phone, c.name, c.segment) ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2 dark:border-gray-600 dark:text-gray-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(waLink(c.phone, c.name, c.segment), "_blank", "noreferrer");
                          }}
                        >
                          <MessageCircle className="w-4 h-4" />
                          WhatsApp
                        </Button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Pagina {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-3xl dark:bg-gray-900 dark:border-gray-700 max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              {selectedCustomer?.name || selectedCustomer?.phone}
            </DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <CustomerMetric label="Pedidos" value={selectedCustomer.valid_order_count || selectedCustomer.order_count || 0} />
                <CustomerMetric label="Total gasto" value={brl(selectedCustomer.total_spent || 0)} tone="green" />
                <CustomerMetric label="Ticket medio" value={brl(selectedCustomer.avg_ticket || 0)} tone="blue" />
                <CustomerMetric label="Sem comprar" value={selectedCustomer.days_since_last_order != null ? `${selectedCustomer.days_since_last_order}d` : "-"} />
                <CustomerMetric label="Pontos" value={selectedCustomer.loyalty_points?.toLocaleString("pt-BR") || 0} tone="orange" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
                <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <ShoppingBag className="w-4 h-4 text-gray-500" />
                        Historico de pedidos
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Produtos favoritos: {(selectedCustomer.favorite_items || []).map((item) => item.name).join(", ") || "-"}
                      </p>
                    </div>
                    {selectedWaLink && (
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => window.open(selectedWaLink, "_blank", "noreferrer")}>
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                      </Button>
                    )}
                  </div>

                  {ordersLoading ? (
                    <div className="flex items-center justify-center py-10 text-gray-400">
                      <ShoppingBag className="w-5 h-5 animate-pulse mr-2" />
                      Carregando pedidos...
                    </div>
                  ) : orders.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-600 text-center py-8">
                      Nenhum pedido encontrado
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900"
                        >
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              #{order.order_number || order.id}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {safeDate(order.created_at, true)}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={ORDER_STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"}>
                              {ORDER_STATUS_LABELS[order.status] || order.status}
                            </Badge>
                            <span className="font-semibold text-gray-900 dark:text-white text-sm">
                              {brl(order.total || 0)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                  <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-gray-500" />
                    Gestao do lead
                  </h3>
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
                      <Select
                        value={leadForm.lead_status}
                        onValueChange={(value) => setLeadForm((f) => ({ ...f, lead_status: value }))}
                      >
                        <SelectTrigger className="mt-1 dark:bg-gray-900 dark:border-gray-700 dark:text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUS_OPTIONS.map((item) => (
                            <SelectItem key={item.key} value={item.key}>{item.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Proxima acao</label>
                      <Input
                        type="date"
                        value={leadForm.next_action_at}
                        onChange={(e) => setLeadForm((f) => ({ ...f, next_action_at: e.target.value }))}
                        className="mt-1 dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Observacoes</label>
                      <Textarea
                        value={leadForm.notes}
                        onChange={(e) => setLeadForm((f) => ({ ...f, notes: e.target.value }))}
                        rows={5}
                        placeholder="Ex: gosta de pizza, comprou no fim de semana, oferecer cupom..."
                        className="mt-1 resize-none dark:bg-gray-900 dark:border-gray-700 dark:text-white"
                      />
                    </div>
                    <Button className="w-full" onClick={saveLead} disabled={savingLead}>
                      {savingLead ? "Salvando..." : "Salvar lead"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Th({ children, align = "left" }) {
  return (
    <th className={`px-4 py-3 font-semibold text-gray-600 dark:text-gray-300 ${align === "right" ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function MetricCard({ icon: Icon, label, value, tone = "slate" }) {
  const colors = {
    slate: "text-slate-500 bg-slate-100 dark:bg-slate-800",
    amber: "text-amber-500 bg-amber-100 dark:bg-amber-900/30",
    green: "text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30",
    orange: "text-orange-500 bg-orange-100 dark:bg-orange-900/30",
    blue: "text-blue-500 bg-blue-100 dark:bg-blue-900/30",
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${colors[tone] || colors.slate}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function CustomerMetric({ label, value, tone = "slate" }) {
  const textColors = {
    slate: "text-gray-900 dark:text-white",
    green: "text-green-600 dark:text-green-400",
    blue: "text-blue-600 dark:text-blue-400",
    orange: "text-orange-500 dark:text-orange-400",
  };
  return (
    <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-bold ${textColors[tone] || textColors.slate}`}>{value}</p>
    </div>
  );
}
