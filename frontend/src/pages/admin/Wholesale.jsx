import { useEffect, useState, useMemo, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Building2, Plus, Pencil, Trash2, Printer, Search, X,
  ClipboardList, ChevronRight, CheckCircle2, XCircle, TrendingUp,
  DollarSign, Package, Clock, ChevronDown, Filter, AlertCircle,
  CreditCard, RefreshCw,
} from "lucide-react";
import { maskPhone, maskCNPJ, isValidCNPJ, isValidPhone } from "@/lib/masks";

/* ─── constants ────────────────────────────────── */

const MERCHANT_STATUS_LABELS = { pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado" };
const MERCHANT_STATUS_COLORS = {
  pending:  "bg-yellow-100 text-yellow-700 border-yellow-300",
  approved: "bg-green-100 text-green-700 border-green-300",
  rejected: "bg-red-100 text-red-700 border-red-300",
};

const ORDER_STATUS_FLOW = {
  pending: "confirmed", confirmed: "producing", producing: "ready", ready: "delivered",
};
const ORDER_STATUS_LABELS = {
  pending: "Pendente", confirmed: "Confirmado", producing: "Produzindo",
  ready: "Pronto", delivered: "Entregue", cancelled: "Cancelado",
};
const ORDER_STATUS_COLORS = {
  pending:   "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  producing: "bg-purple-100 text-purple-700",
  ready:     "bg-green-100 text-green-700",
  delivered: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-600",
};

const PAYMENT_STATUS_LABELS = { pending: "A receber", paid: "Pago", overdue: "Vencido" };
const PAYMENT_STATUS_COLORS = {
  pending: "bg-orange-100 text-orange-700",
  paid:    "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
};

const PAYMENT_METHOD_LABELS = {
  invoice: "Fatura", pix: "PIX", bank_transfer: "Transferência", cash: "Dinheiro", card: "Cartão",
};

const EMPTY_MERCHANT = {
  company_name: "", contact_name: "", cnpj: "", phone: "",
  email: "", address: "", status: "pending", notes: "",
};
const EMPTY_ORDER = {
  merchant_id: "", items: [], discount: "0", notes: "",
  delivery_date: "", payment_method: "invoice", payment_status: "pending",
};

/* ─── MerchantsTab ────────────────────────────── */

function MerchantsTab() {
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_MERCHANT);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await api.get("/admin/wholesale/merchants");
      setMerchants(r.data);
    } catch { toast.error("Erro ao carregar comerciantes"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return merchants;
    const q = search.toLowerCase();
    return merchants.filter(
      (m) => m.company_name.toLowerCase().includes(q) || (m.contact_name || "").toLowerCase().includes(q)
    );
  }, [merchants, search]);

  const openNew  = () => { setForm({ ...EMPTY_MERCHANT }); setEditId(null); setOpen(true); };
  const openEdit = (m) => { setForm({ ...EMPTY_MERCHANT, ...m }); setEditId(m.id); setOpen(true); };
  const setProp  = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.company_name.trim()) return toast.error("Informe o nome da empresa");
    if (!form.phone.trim()) return toast.error("Informe o telefone");
    if (!isValidPhone(form.phone)) return toast.error("Telefone inválido — use (XX) XXXXX-XXXX");
    if (form.cnpj && !isValidCNPJ(form.cnpj)) return toast.error("CNPJ inválido");
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/admin/wholesale/merchants/${editId}`, form);
        toast.success("Comerciante atualizado");
      } else {
        await api.post("/admin/wholesale/merchants", form);
        toast.success("Comerciante cadastrado");
      }
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir este comerciante?")) return;
    try {
      await api.delete(`/admin/wholesale/merchants/${id}`);
      toast.success("Comerciante excluído");
      load();
    } catch { toast.error("Erro ao excluir"); }
  };

  /* stats */
  const stats = useMemo(() => ({
    total: merchants.length,
    approved: merchants.filter((m) => m.status === "approved").length,
    pending:  merchants.filter((m) => m.status === "pending").length,
  }), [merchants]);

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total", value: stats.total, color: "text-gray-700", bg: "bg-gray-50" },
          { label: "Aprovados", value: stats.approved, color: "text-green-700", bg: "bg-green-50" },
          { label: "Pendentes", value: stats.pending, color: "text-yellow-700", bg: "bg-yellow-50" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-gray-100 dark:border-gray-700`}>
            <p className={`font-extrabold text-2xl ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por empresa ou contato..."
            className="pl-9 dark:bg-gray-800 dark:border-gray-600"
          />
        </div>
        <Button onClick={openNew} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Novo Comerciante
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                {["Empresa", "Contato", "CNPJ", "Telefone", "E-mail", "Status", "Ações"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-400 text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <Building2 className="w-10 h-10 text-gray-200 dark:text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-400 dark:text-gray-600">
                      {search ? "Nenhum resultado encontrado" : "Nenhum comerciante cadastrado"}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{m.company_name}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.contact_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{m.cnpj || "—"}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.phone}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{m.email || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={MERCHANT_STATUS_COLORS[m.status]}>
                        {MERCHANT_STATUS_LABELS[m.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(m)} className="dark:border-gray-600 dark:text-gray-200 h-8 w-8 p-0">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => remove(m.id)} className="text-red-500 border-red-200 hover:border-red-300 h-8 w-8 p-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg dark:bg-gray-900 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editId ? "Editar Comerciante" : "Novo Comerciante"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5 col-span-2">
                <Label className="dark:text-gray-200">Empresa *</Label>
                <Input value={form.company_name} onChange={(e) => setProp("company_name", e.target.value)} className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">Contato</Label>
                <Input value={form.contact_name} onChange={(e) => setProp("contact_name", e.target.value)} className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">CNPJ</Label>
                <Input value={form.cnpj} onChange={(e) => setProp("cnpj", maskCNPJ(e.target.value))} placeholder="00.000.000/0001-00" maxLength={18} className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">Telefone *</Label>
                <Input value={form.phone} onChange={(e) => setProp("phone", maskPhone(e.target.value))} placeholder="(XX) XXXXX-XXXX" maxLength={15} className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setProp("email", e.target.value)} className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="dark:text-gray-200">Endereço</Label>
                <Input value={form.address} onChange={(e) => setProp("address", e.target.value)} className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">Status</Label>
                <Select value={form.status} onValueChange={(v) => setProp("status", v)}>
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="approved">Aprovado</SelectItem>
                    <SelectItem value="rejected">Rejeitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="dark:text-gray-200">Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setProp("notes", e.target.value)} rows={2} className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving} className="dark:border-gray-600 dark:text-gray-200">Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : editId ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Order card (expandable detail) ─────────── */

function OrderCard({ order, merchants, onAdvance, onCancel, onEdit, onPrint, advancing }) {
  const [expanded, setExpanded] = useState(false);
  const merchant = merchants.find((m) => m.id === order.merchant_id) || {};
  const nextStatus = ORDER_STATUS_FLOW[order.status];
  const orderTotal = (order.items || []).reduce((a, i) => a + i.unit_price * i.quantity, 0);
  const finalTotal = Math.max(0, orderTotal - (order.discount || 0));
  const canAdvance = !!nextStatus;
  const canCancel  = !["delivered", "cancelled"].includes(order.status);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="font-bold text-gray-900 dark:text-white">OS #{order.order_number || order.id}</p>
              <Badge className={ORDER_STATUS_COLORS[order.status]}>{ORDER_STATUS_LABELS[order.status] || order.status}</Badge>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{order.merchant_name || merchant.company_name || "—"}</p>
          </div>
          <div className="text-right">
            <p className="font-extrabold text-lg text-gray-900 dark:text-white">{brl(finalTotal)}</p>
            <Badge className={PAYMENT_STATUS_COLORS[order.payment_status || "pending"]}>
              {PAYMENT_STATUS_LABELS[order.payment_status || "pending"]}
            </Badge>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-3 flex-wrap">
          <span className="flex items-center gap-1"><Package className="w-3.5 h-3.5" />{(order.items || []).length} item(ns)</span>
          {order.delivery_date && (
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Entrega: {new Date(order.delivery_date).toLocaleDateString("pt-BR")}
            </span>
          )}
          {order.payment_method && (
            <span className="flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" />
              {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
            </span>
          )}
          <span className="ml-auto text-gray-300 dark:text-gray-600">
            {new Date(order.created_at || Date.now()).toLocaleDateString("pt-BR")}
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {canAdvance && (
            <Button size="sm" onClick={() => onAdvance(order)} disabled={advancing === order.id} className="gap-1">
              <ChevronRight className="w-3.5 h-3.5" />
              {ORDER_STATUS_LABELS[nextStatus]}
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" onClick={() => onCancel(order)} className="gap-1 text-red-500 border-red-200 hover:border-red-300">
              <XCircle className="w-3.5 h-3.5" /> Cancelar
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => onEdit(order)} className="gap-1 dark:border-gray-600 dark:text-gray-200">
            <Pencil className="w-3.5 h-3.5" /> Editar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onPrint(order)} className="gap-1 dark:border-gray-600 dark:text-gray-200">
            <Printer className="w-3.5 h-3.5" /> Imprimir
          </Button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="ml-auto text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 text-xs"
          >
            {expanded ? "Ocultar" : "Detalhar"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 px-4 py-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="text-left pb-2">Produto</th>
                <th className="text-center pb-2">Qtd</th>
                <th className="text-right pb-2">Preço Un.</th>
                <th className="text-right pb-2">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(order.items || []).map((item, idx) => (
                <tr key={idx} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="py-1.5 text-gray-700 dark:text-gray-300">{item.product_name}</td>
                  <td className="py-1.5 text-center text-gray-500">{item.quantity}</td>
                  <td className="py-1.5 text-right text-gray-500">{brl(item.unit_price)}</td>
                  <td className="py-1.5 text-right font-medium text-gray-700 dark:text-gray-300">{brl(item.unit_price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex justify-end gap-6 text-sm border-t border-gray-100 dark:border-gray-700 pt-2">
            <span className="text-gray-400">Subtotal: <span className="text-gray-600 dark:text-gray-300">{brl(orderTotal)}</span></span>
            {order.discount > 0 && <span className="text-gray-400">Desconto: <span className="text-red-500">-{brl(order.discount)}</span></span>}
            <span className="font-bold text-gray-900 dark:text-white">Total: {brl(finalTotal)}</span>
          </div>
          {order.notes && (
            <div className="mt-3 text-xs text-gray-500 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800/50 rounded-lg px-3 py-2">
              <span className="font-semibold">Obs:</span> {order.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── OrdersTab ───────────────────────────────── */

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [form, setForm] = useState(EMPTY_ORDER);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productSearchResults, setProductSearchResults] = useState([]);
  const [advancingId, setAdvancingId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [merchantFilter, setMerchantFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, merchantsRes, productsRes] = await Promise.all([
        api.get("/admin/wholesale/orders"),
        api.get("/admin/wholesale/merchants"),
        api.get("/admin/products"),
      ]);
      setOrders(ordersRes.data);
      setMerchants(merchantsRes.data);
      setProducts(productsRes.data);
    } catch { toast.error("Erro ao carregar dados"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!productSearch.trim()) { setProductSearchResults([]); return; }
    const q = productSearch.toLowerCase();
    setProductSearchResults(
      products.filter((p) => p.name.toLowerCase().includes(q) && !form.items.find((i) => i.product_id === p.id)).slice(0, 8)
    );
  }, [productSearch, products, form.items]);

  const openNew = () => {
    setForm({ ...EMPTY_ORDER, items: [] });
    setEditOrder(null);
    setProductSearch("");
    setProductSearchResults([]);
    setOpen(true);
  };

  const openEdit = (order) => {
    setForm({
      merchant_id: order.merchant_id || "",
      items: (order.items || []).map((i) => ({ ...i })),
      discount: String(order.discount || "0"),
      notes: order.notes || "",
      delivery_date: order.delivery_date ? order.delivery_date.slice(0, 10) : "",
      payment_method: order.payment_method || "invoice",
      payment_status: order.payment_status || "pending",
    });
    setEditOrder(order);
    setProductSearch("");
    setProductSearchResults([]);
    setOpen(true);
  };

  const addItem = (product) => {
    setForm((f) => ({ ...f, items: [...f.items, { product_id: product.id, product_name: product.name, unit_price: product.price, quantity: 1 }] }));
    setProductSearch("");
    setProductSearchResults([]);
  };

  const updateItemQty   = (pid, qty)   => setForm((f) => ({ ...f, items: f.items.map((i) => i.product_id === pid ? { ...i, quantity: Math.max(1, Number(qty)) } : i) }));
  const updateItemPrice = (pid, price) => setForm((f) => ({ ...f, items: f.items.map((i) => i.product_id === pid ? { ...i, unit_price: price } : i) }));
  const removeItem      = (pid)        => setForm((f) => ({ ...f, items: f.items.filter((i) => i.product_id !== pid) }));

  const subtotal = form.items.reduce((a, i) => a + Number(i.unit_price) * i.quantity, 0);
  const total    = Math.max(0, subtotal - Number(form.discount || 0));

  const save = async () => {
    if (!form.merchant_id) return toast.error("Selecione um comerciante");
    if (form.items.length === 0) return toast.error("Adicione pelo menos um item");
    setSaving(true);
    try {
      const payload = {
        merchant_id:    form.merchant_id,
        items:          form.items.map((i) => ({ product_id: i.product_id, product_name: i.product_name, quantity: i.quantity, unit_price: Number(i.unit_price) })),
        discount:       Number(form.discount || 0),
        notes:          form.notes,
        delivery_date:  form.delivery_date || null,
        payment_method: form.payment_method,
        payment_status: form.payment_status,
      };
      if (editOrder) {
        await api.put(`/admin/wholesale/orders/${editOrder.id}`, payload);
        toast.success("OS atualizada");
      } else {
        await api.post("/admin/wholesale/orders", payload);
        toast.success("Ordem de serviço criada");
      }
      setOpen(false);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Erro ao salvar OS"); }
    finally { setSaving(false); }
  };

  const advanceStatus = async (order) => {
    const next = ORDER_STATUS_FLOW[order.status];
    if (!next) return;
    setAdvancingId(order.id);
    try {
      await api.put(`/admin/wholesale/orders/${order.id}/status`, { status: next });
      toast.success(`Status → "${ORDER_STATUS_LABELS[next]}"`);
      load();
    } catch { toast.error("Erro ao atualizar status"); }
    finally { setAdvancingId(null); }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm(`Cancelar a OS #${order.order_number || order.id}?`)) return;
    try {
      await api.put(`/admin/wholesale/orders/${order.id}/status`, { status: "cancelled" });
      toast.success("OS cancelada");
      load();
    } catch { toast.error("Erro ao cancelar"); }
  };

  const markPaid = async (order) => {
    try {
      await api.put(`/admin/wholesale/orders/${order.id}`, { ...order, payment_status: "paid" });
      toast.success("Pagamento registrado");
      load();
    } catch { toast.error("Erro ao registrar pagamento"); }
  };

  /* filtered + stats */
  const filtered = useMemo(() => orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (merchantFilter !== "all" && o.merchant_id !== merchantFilter) return false;
    if (paymentFilter !== "all" && (o.payment_status || "pending") !== paymentFilter) return false;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      if (!String(o.order_number || o.id).includes(q) && !(o.merchant_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [orders, statusFilter, merchantFilter, paymentFilter, searchText]);

  const stats = useMemo(() => {
    const active = orders.filter((o) => !["delivered", "cancelled"].includes(o.status));
    const gmv = orders.filter((o) => o.status !== "cancelled").reduce((a, o) => {
      const t = (o.items || []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
      return a + Math.max(0, t - (o.discount || 0));
    }, 0);
    const toReceive = orders.filter((o) => (o.payment_status || "pending") === "pending" && o.status !== "cancelled").reduce((a, o) => {
      const t = (o.items || []).reduce((s, i) => s + i.unit_price * i.quantity, 0);
      return a + Math.max(0, t - (o.discount || 0));
    }, 0);
    return { total: orders.length, active: active.length, gmv, toReceive };
  }, [orders]);

  const printOrder = (order) => {
    const merchant = merchants.find((m) => m.id === order.merchant_id) || {};
    const win = window.open("", "_blank", "width=800,height=700");
    const itemsHtml = (order.items || []).map((i) =>
      `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${i.product_name}</td>
       <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
       <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${brl(i.unit_price)}</td>
       <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${brl(i.unit_price * i.quantity)}</td></tr>`
    ).join("");
    const orderTotal = (order.items || []).reduce((a, i) => a + i.unit_price * i.quantity, 0);
    const finalTotal = Math.max(0, orderTotal - (order.discount || 0));
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
      <title>OS #${order.order_number || order.id}</title>
      <style>body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px}
      h1{font-size:22px;margin-bottom:4px}.header{display:flex;justify-content:space-between;margin-bottom:24px}
      .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;background:#f8f8f8;padding:12px;border-radius:6px}
      .info-grid div{font-size:12px}.info-grid strong{display:block;font-size:11px;color:#555}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}thead{background:#f0f0f0}
      th{padding:8px;text-align:left;font-size:12px}.totals{text-align:right;font-size:13px}
      .total-line{display:flex;justify-content:flex-end;gap:24px;margin-top:4px}
      .total-line.final{font-size:16px;font-weight:bold;margin-top:8px;border-top:2px solid #ccc;padding-top:8px}
      .footer{margin-top:32px;font-size:11px;color:#777;border-top:1px solid #ddd;padding-top:12px}
      .status-badge{display:inline-block;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:bold}
      </style></head><body>
      <div class="header">
        <div><h1>MariscoDelivery</h1><p style="color:#555;margin:0">Ordem de Serviço</p></div>
        <div style="text-align:right">
          <p style="font-size:18px;font-weight:bold;margin:0">OS #${order.order_number || order.id}</p>
          <p style="color:#555;margin:0">Status: ${ORDER_STATUS_LABELS[order.status] || order.status}</p>
          <p style="color:#555;margin:0">${new Date(order.created_at || Date.now()).toLocaleDateString("pt-BR")}</p>
        </div>
      </div>
      <div class="info-grid">
        <div><strong>Empresa</strong>${merchant.company_name || order.merchant_name || "—"}</div>
        <div><strong>CNPJ</strong>${merchant.cnpj || "—"}</div>
        <div><strong>Contato</strong>${merchant.contact_name || "—"}</div>
        <div><strong>Telefone</strong>${merchant.phone || "—"}</div>
        <div><strong>Entrega prevista</strong>${order.delivery_date ? new Date(order.delivery_date).toLocaleDateString("pt-BR") : "—"}</div>
        <div><strong>Pagamento</strong>${PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method || "—"} · ${PAYMENT_STATUS_LABELS[order.payment_status || "pending"]}</div>
      </div>
      <table><thead><tr><th>Produto</th><th style="text-align:center">Qtd</th><th style="text-align:right">Preço Un.</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${itemsHtml}</tbody></table>
      <div class="totals">
        <div class="total-line"><span>Subtotal:</span><span>${brl(orderTotal)}</span></div>
        ${order.discount ? `<div class="total-line"><span>Desconto:</span><span>-${brl(order.discount)}</span></div>` : ""}
        <div class="total-line final"><span>Total:</span><span>${brl(finalTotal)}</span></div>
      </div>
      ${order.notes ? `<div style="margin-top:16px;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;font-size:12px"><strong>Obs:</strong> ${order.notes}</div>` : ""}
      <div class="footer"><p>Gerado em ${new Date().toLocaleString("pt-BR")} — MariscoDelivery</p></div>
      <script>window.onload=()=>{window.print()};</script></body></html>`);
    win.document.close();
  };

  const approvedMerchants = merchants.filter((m) => m.status === "approved");

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { icon: ClipboardList, label: "Total de OS", value: stats.total, color: "#6366f1", bg: "#6366f110" },
          { icon: Package,       label: "Em andamento", value: stats.active, color: "#f59e0b", bg: "#f59e0b10" },
          { icon: TrendingUp,    label: "GMV Atacado", value: brl(stats.gmv), color: "#10b981", bg: "#10b98110" },
          { icon: DollarSign,    label: "A Receber",   value: brl(stats.toReceive), color: "#ef4444", bg: "#ef444410" },
        ].map((s) => (
          <div key={s.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm">
            <div className="w-9 h-9 rounded-lg grid place-items-center mb-2" style={{ background: s.bg }}>
              <s.icon className="w-4 h-4" style={{ color: s.color }} />
            </div>
            <p className="font-extrabold text-xl text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar OS ou comerciante..."
            className="pl-9 dark:bg-gray-800 dark:border-gray-600"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 dark:bg-gray-800 dark:border-gray-600 dark:text-white">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={merchantFilter} onValueChange={setMerchantFilter}>
          <SelectTrigger className="w-44 dark:bg-gray-800 dark:border-gray-600 dark:text-white">
            <SelectValue placeholder="Comerciante" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all">Todos os comerciantes</SelectItem>
            {merchants.map((m) => <SelectItem key={m.id} value={m.id}>{m.company_name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-36 dark:bg-gray-800 dark:border-gray-600 dark:text-white">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button onClick={load} variant="outline" size="icon" className="dark:border-gray-600 dark:text-gray-200" title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>

        <Button onClick={openNew} className="gap-2 ml-auto shrink-0">
          <Plus className="w-4 h-4" /> Nova OS
        </Button>
      </div>

      {/* Filter info */}
      {filtered.length !== orders.length && (
        <p className="text-xs text-gray-400">
          Exibindo {filtered.length} de {orders.length} ordens
        </p>
      )}

      {/* Order list */}
      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ClipboardList className="w-12 h-12 text-gray-200 dark:text-gray-700 mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {orders.length === 0 ? "Nenhuma ordem de serviço" : "Nenhuma OS encontrada com os filtros atuais"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              merchants={merchants}
              onAdvance={advanceStatus}
              onCancel={cancelOrder}
              onEdit={openEdit}
              onPrint={printOrder}
              advancing={advancingId}
            />
          ))}
        </div>
      )}

      {/* New/Edit OS Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl dark:bg-gray-900 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editOrder ? `Editar OS #${editOrder.order_number || editOrder.id}` : "Nova Ordem de Serviço"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Merchant */}
            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">Comerciante *</Label>
              <Select value={form.merchant_id} onValueChange={(v) => setForm((f) => ({ ...f, merchant_id: v }))}>
                <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                  <SelectValue placeholder="Selecionar comerciante aprovado" />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  {approvedMerchants.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Items */}
            <div className="space-y-3">
              <Label className="dark:text-gray-200">Itens *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar produto para adicionar..."
                  className="pl-9 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                {productSearchResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-lg overflow-hidden">
                    {productSearchResults.map((p) => (
                      <button key={p.id} onClick={() => addItem(p)}
                        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-left">
                        <span className="text-gray-900 dark:text-white">{p.name}</span>
                        <span className="text-gray-400 text-xs">{brl(p.price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.items.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                  Nenhum item adicionado
                </p>
              ) : (
                <div className="space-y-2">
                  {form.items.map((item) => (
                    <div key={item.product_id} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
                      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">{item.product_name}</span>
                      <Input
                        type="number" step="0.01" min={0} value={item.unit_price}
                        onChange={(e) => updateItemPrice(item.product_id, e.target.value)}
                        className="w-24 text-right h-8 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs"
                      />
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateItemQty(item.product_id, item.quantity - 1)} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm font-bold hover:bg-gray-100">−</button>
                        <span className="w-8 text-center text-sm font-semibold dark:text-white">{item.quantity}</span>
                        <button onClick={() => updateItemQty(item.product_id, item.quantity + 1)} className="w-7 h-7 rounded-lg border border-gray-200 dark:border-gray-600 flex items-center justify-center text-sm font-bold hover:bg-gray-100">+</button>
                      </div>
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 w-20 text-right">{brl(Number(item.unit_price) * item.quantity)}</span>
                      <button onClick={() => removeItem(item.product_id)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                  <div className="flex justify-end gap-5 text-sm pt-1">
                    <span className="text-gray-400">Subtotal: <span className="font-medium text-gray-700 dark:text-gray-300">{brl(subtotal)}</span></span>
                    <span className="font-bold text-gray-900 dark:text-white">Total: {brl(total)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Meta fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">Desconto (R$)</Label>
                <Input type="number" step="0.01" min={0} value={form.discount}
                  onChange={(e) => setForm((f) => ({ ...f, discount: e.target.value }))}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">Data de Entrega</Label>
                <Input type="date" value={form.delivery_date}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">Forma de Pagamento</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="invoice">Fatura</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="bank_transfer">Transferência</SelectItem>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="card">Cartão</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">Status do Pagamento</Label>
                <Select value={form.payment_status || "pending"} onValueChange={(v) => setForm((f) => ({ ...f, payment_status: v }))}>
                  <SelectTrigger className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    <SelectItem value="pending">A receber</SelectItem>
                    <SelectItem value="paid">Pago</SelectItem>
                    <SelectItem value="overdue">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label className="dark:text-gray-200">Observações</Label>
                <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Instruções especiais, condições de entrega..." rows={2}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving} className="dark:border-gray-600 dark:text-gray-200">Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : editOrder ? "Salvar alterações" : "Criar OS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Main ────────────────────────────────────── */

export default function Wholesale() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 grid place-items-center">
          <Building2 className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h1 className="font-bold text-2xl text-gray-900 dark:text-white">Gestão de Atacado</h1>
          <p className="text-sm text-gray-400">Comerciantes, ordens de serviço e pagamentos</p>
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList className="dark:bg-gray-800">
          <TabsTrigger value="orders" className="dark:data-[state=active]:bg-gray-700 dark:text-gray-300">
            Ordens de Serviço
          </TabsTrigger>
          <TabsTrigger value="merchants" className="dark:data-[state=active]:bg-gray-700 dark:text-gray-300">
            Comerciantes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="orders" className="mt-5">
          <OrdersTab />
        </TabsContent>
        <TabsContent value="merchants" className="mt-5">
          <MerchantsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
