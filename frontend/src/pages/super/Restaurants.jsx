import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import {
  Store, Plus, Search, ExternalLink, MoreVertical, Trash2,
  CheckCircle2, XCircle, Loader2, TrendingUp, ShoppingBag, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const PLANS = ["basic", "pro", "enterprise"];
const STATUS_COLOR = { active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", suspended: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" };

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ restaurant_name: "", owner_name: "", owner_email: "", owner_password: "", plan: "basic" });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/super/restaurants", form);
      toast.success("Restaurante criado com sucesso!");
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao criar restaurante");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md dark:bg-[#161B22] dark:border-gray-700">
        <DialogHeader><DialogTitle className="dark:text-white">Novo Restaurante</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {[["restaurant_name","Nome do restaurante"],["owner_name","Nome do dono"],["owner_email","E-mail do dono"],["owner_password","Senha inicial"]].map(([k,l]) => (
            <div key={k} className="space-y-1">
              <Label className="dark:text-gray-300">{l}</Label>
              <Input type={k === "owner_password" ? "password" : k === "owner_email" ? "email" : "text"}
                value={form[k]} onChange={(e) => set(k, e.target.value)} required className="dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
            </div>
          ))}
          <div className="space-y-1">
            <Label className="dark:text-gray-300">Plano</Label>
            <select value={form.plan} onChange={(e) => set("plan", e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-white">
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <Button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Criar Restaurante"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DetailModal({ restaurant, onClose, onUpdate }) {
  const [chart, setChart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    api.get(`/super/restaurants/${restaurant.id}/revenue-chart`).then((r) => setChart(r.data));
    api.get(`/super/restaurants/${restaurant.id}/orders`).then((r) => setOrders(r.data));
  }, [restaurant.id]);

  const toggle = async () => {
    try {
      const r = await api.post(`/super/restaurants/${restaurant.id}/toggle-status`);
      toast.success(`Restaurante ${r.data.status === "active" ? "ativado" : "suspenso"}`);
      onUpdate();
    } catch { toast.error("Erro ao atualizar status"); }
  };

  const del = async () => {
    if (!window.confirm(`Excluir "${restaurant.name}"? Esta ação é irreversível!`)) return;
    try {
      await api.delete(`/super/restaurants/${restaurant.id}`);
      toast.success("Restaurante excluído");
      onUpdate(); onClose();
    } catch { toast.error("Erro ao excluir"); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl dark:bg-[#161B22] dark:border-gray-700 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-white flex items-center gap-2">
            <Store className="w-5 h-5 text-indigo-500" /> {restaurant.name}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-100 dark:border-gray-800">
          {["overview","orders"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${tab===t ? "border-indigo-500 text-indigo-600 dark:text-indigo-400" : "border-transparent text-gray-500 dark:text-gray-400"}`}>
              {t === "overview" ? "Visão Geral" : "Pedidos"}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[["Pedidos", restaurant.order_count],[  "Produtos", restaurant.product_count],["Receita", brl(restaurant.revenue || 0)]].map(([l,v]) => (
                <div key={l} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                  <p className="font-display font-bold text-lg dark:text-white">{v}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{l}</p>
                </div>
              ))}
            </div>

            {/* Info */}
            <div className="text-sm space-y-1.5">
              {[["Slug", restaurant.slug],["Plano", restaurant.plan || "basic"],["Status", restaurant.status || "active"],["Criado em", restaurant.created_at ? new Date(restaurant.created_at).toLocaleDateString("pt-BR") : "—"]].map(([l,v]) => (
                <div key={l} className="flex justify-between py-1 border-b border-gray-50 dark:border-gray-800">
                  <span className="text-gray-500 dark:text-gray-400">{l}</span>
                  <span className="font-medium dark:text-white">{v}</span>
                </div>
              ))}
            </div>

            {/* Revenue chart */}
            {chart.length > 0 && (
              <div>
                <p className="text-sm font-semibold dark:text-gray-200 mb-2">Receita — 30 dias</p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chart}>
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip formatter={(v) => brl(v)} />
                    <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <a href={`/loja/${restaurant.slug}`} target="_blank" rel="noreferrer" className="flex-1">
                <Button variant="outline" className="w-full dark:border-gray-700 dark:text-gray-300">
                  <ExternalLink className="w-4 h-4 mr-1" /> Ver cardápio
                </Button>
              </a>
              <Button onClick={toggle} variant="outline"
                className={`flex-1 ${restaurant.status === "active" ? "border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400" : "border-green-200 text-green-600 hover:bg-green-50 dark:border-green-800 dark:text-green-400"}`}>
                {restaurant.status === "active" ? <><XCircle className="w-4 h-4 mr-1" /> Suspender</> : <><CheckCircle2 className="w-4 h-4 mr-1" /> Ativar</>}
              </Button>
              <Button onClick={del} variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {tab === "orders" && (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {orders.length === 0 && <p className="text-center text-gray-400 py-8">Nenhum pedido</p>}
            {orders.map((o) => (
              <div key={o.id} className="flex justify-between items-center py-2 border-b border-gray-50 dark:border-gray-800 text-sm">
                <div>
                  <p className="font-medium dark:text-white">#{o.order_number} — {o.customer?.name}</p>
                  <p className="text-xs text-gray-400">{new Date(o.created_at).toLocaleString("pt-BR")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold dark:text-white">{brl(o.total)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400">{o.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Restaurants() {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.get("/super/restaurants"); setRestaurants(r.data); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = restaurants.filter((r) => {
    const q = search.toLowerCase();
    const match = !q || r.name?.toLowerCase().includes(q) || r.slug?.toLowerCase().includes(q);
    const st = !statusFilter || (r.status || "active") === statusFilter;
    return match && st;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl dark:text-white">Restaurantes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{restaurants.length} no total</p>
        </div>
        <Button onClick={() => setCreating(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-1" /> Novo Restaurante
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar restaurante..." className="pl-9 dark:bg-gray-800 dark:border-gray-700 dark:text-white" />
        </div>
        <div className="flex gap-1">
          {[["", "Todos"],["active","Ativos"],["suspended","Suspensos"]].map(([v,l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              className={`px-3 py-2 text-sm font-medium rounded-xl border transition-colors ${statusFilter===v ? "bg-indigo-600 text-white border-transparent" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="grid place-items-center py-20"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <div key={r.id} className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-2xl p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 grid place-items-center">
                    {r.logo_url ? <img src={r.logo_url} alt="logo" className="w-10 h-10 rounded-xl object-cover" /> : <Store className="w-5 h-5 text-indigo-500" />}
                  </div>
                  <div>
                    <p className="font-display font-bold text-sm dark:text-white">{r.name}</p>
                    <p className="text-xs text-gray-400">/{r.slug}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[r.status || "active"]}`}>
                  {r.status === "suspended" ? "Suspenso" : "Ativo"}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-3">
                {[["Pedidos", r.order_count || 0],["Produtos", r.product_count || 0],["Plano", r.plan || "basic"]].map(([l,v]) => (
                  <div key={l} className="bg-gray-50 dark:bg-gray-800 rounded-lg py-1.5">
                    <p className="font-bold text-sm dark:text-white">{v}</p>
                    <p className="text-[10px] text-gray-400">{l}</p>
                  </div>
                ))}
              </div>
              <Button onClick={() => setSelected(r)} variant="outline" className="w-full text-sm dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                <Eye className="w-3.5 h-3.5 mr-1.5" /> Ver detalhes
              </Button>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateModal onClose={() => setCreating(false)} onCreated={load} />}
      {selected && <DetailModal restaurant={selected} onClose={() => setSelected(null)} onUpdate={load} />}
    </div>
  );
}
