import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import {
  Plus, RefreshCw, Search, Loader2, FileText, RotateCcw,
  CheckCircle2, XCircle, PauseCircle, ChevronDown,
} from "lucide-react";

const STATUS_LABEL = { active: "Ativo", trial: "Trial", overdue: "Vencido", suspended: "Suspenso", cancelled: "Cancelado" };
const STATUS_CLASS = {
  active: "bg-green-500/20 text-green-400",
  trial: "bg-blue-500/20 text-blue-400",
  overdue: "bg-red-500/20 text-red-400",
  suspended: "bg-gray-500/20 text-gray-400",
  cancelled: "bg-gray-500/20 text-gray-400",
};
const CYCLE_LABEL = { monthly: "Mensal", yearly: "Anual", lifetime: "Vitalício" };

function StatusBadge({ status }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[status] || "bg-gray-500/20 text-gray-400"}`}>{STATUS_LABEL[status] || status}</span>;
}

function PlanBadge({ plan }) {
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: (plan?.color || "#6366f1") + "33", color: plan?.color || "#818cf8" }}>{plan?.name || "—"}</span>;
}

function RenewModal({ sub, onClose, onDone }) {
  const [amount, setAmount] = useState(sub?.amount || "");
  const [method, setMethod] = useState("pix");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/super/subscriptions/${sub.id}/renew`, { amount: Number(amount), payment_method: method });
      onDone();
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao renovar.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/5 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-bold text-gray-100">Renovar Assinatura</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><XCircle className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-sm text-gray-400">Restaurante: <span className="text-gray-100 font-medium">{sub?.restaurant?.name}</span></p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Método de Pagamento</label>
            <select value={method} onChange={e => setMethod(e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="boleto">Boleto</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Renovar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewActivationModal({ plans, restaurants, onClose, onDone }) {
  const [form, setForm] = useState({ restaurant_id: "", plan_id: "", cycle: "monthly", amount: "", payment_method: "pix", affiliate_code: "", trial_days: 0, notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [restSearch, setRestSearch] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectedPlan = plans.find(p => String(p.id) === String(form.plan_id));
  const filteredRests = restaurants.filter(r => r.name.toLowerCase().includes(restSearch.toLowerCase())).slice(0, 8);

  const handlePlanChange = (planId) => {
    const plan = plans.find(p => String(p.id) === String(planId));
    set("plan_id", planId);
    if (plan) set("amount", form.cycle === "yearly" ? plan.price_yearly : plan.price_monthly);
  };

  const handleCycleChange = (cycle) => {
    set("cycle", cycle);
    if (selectedPlan) set("amount", cycle === "yearly" ? selectedPlan.price_yearly : selectedPlan.price_monthly);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.restaurant_id || !form.plan_id) { setError("Selecione restaurante e plano."); return; }
    setSaving(true);
    setError("");
    try {
      await api.post("/super/subscriptions", form);
      onDone();
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao criar ativação.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/5 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-bold text-gray-100">Nova Ativação</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><XCircle className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Restaurante *</label>
            <input value={restSearch} onChange={e => { setRestSearch(e.target.value); set("restaurant_id", ""); }} placeholder="Buscar restaurante..." className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 mb-1" />
            {restSearch && !form.restaurant_id && (
              <div className="bg-[#1E2430] border border-white/10 rounded-lg overflow-hidden">
                {filteredRests.map(r => (
                  <button key={r.id} type="button" onClick={() => { set("restaurant_id", r.id); setRestSearch(r.name); }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-white/5">{r.name}</button>
                ))}
                {filteredRests.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">Nenhum resultado</p>}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Plano *</label>
            <select value={form.plan_id} onChange={e => handlePlanChange(e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              <option value="">Selecionar plano...</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Ciclo</label>
              <select value={form.cycle} onChange={e => handleCycleChange(e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
                <option value="lifetime">Vitalício</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Valor (R$)</label>
              <input type="number" step="0.01" min="0" value={form.amount} onChange={e => set("amount", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Método de Pagamento</label>
              <select value={form.payment_method} onChange={e => set("payment_method", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                <option value="pix">PIX</option>
                <option value="card">Cartão</option>
                <option value="boleto">Boleto</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Dias Trial</label>
              <input type="number" min="0" value={form.trial_days} onChange={e => set("trial_days", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Código Afiliado</label>
            <input value={form.affiliate_code} onChange={e => set("affiliate_code", e.target.value)} placeholder="Opcional" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notas</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Activations() {
  const [subs, setSubs] = useState([]);
  const [alerts, setAlerts] = useState({ expiring: [], overdue: [] });
  const [plans, setPlans] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [renewModal, setRenewModal] = useState(null);
  const [newModal, setNewModal] = useState(false);
  const [toggling, setToggling] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (planFilter) params.plan_id = planFilter;
      const [sRes, aRes, pRes, rRes] = await Promise.all([
        api.get("/super/subscriptions", { params }),
        api.get("/super/subscriptions/alerts"),
        api.get("/super/plans"),
        api.get("/super/restaurants"),
      ]);
      setSubs(sRes.data);
      setAlerts(aRes.data || { expiring: [], overdue: [] });
      setPlans(pRes.data);
      setRestaurants(rRes.data);
    } finally { setLoading(false); }
  }, [search, statusFilter, planFilter]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const toggleStatus = async (sub) => {
    const newStatus = sub.status === "active" ? "suspended" : "active";
    setToggling(sub.id);
    try { await api.put(`/super/subscriptions/${sub.id}/status`, { status: newStatus }); await load(); }
    finally { setToggling(null); }
  };

  const kpiActive = subs.filter(s => s.status === "active").length;
  const kpiTrial = subs.filter(s => s.status === "trial").length;
  const kpiExpiring = alerts.expiring?.length || 0;
  const kpiOverdue = subs.filter(s => s.status === "overdue").length;

  const daysLeft = (dateStr) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
    return diff;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Ativações</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie as assinaturas dos restaurantes</p>
        </div>
        <button onClick={() => setNewModal(true)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova Ativação
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Ativas", value: kpiActive, color: "#10b981" },
          { label: "Em Trial", value: kpiTrial, color: "#3b82f6" },
          { label: "Vencendo (7d)", value: kpiExpiring, color: "#f59e0b" },
          { label: "Inadimplentes", value: kpiOverdue, color: "#ef4444" },
        ].map(k => (
          <div key={k.label} className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
            <p className="text-3xl font-extrabold" style={{ color: k.color }}>{k.value}</p>
            <p className="text-sm text-gray-400 mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar restaurante..." className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-[#1E2430] border border-white/10 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={planFilter} onChange={e => setPlanFilter(e.target.value)} className="bg-[#1E2430] border border-white/10 text-gray-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
          <option value="">Todos os planos</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={load} className="flex items-center gap-1.5 border border-white/10 text-gray-400 hover:text-gray-200 px-3 py-2 rounded-xl text-sm">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabela */}
      <div className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {["Restaurante", "Plano", "Status", "Valor", "Ciclo", "Vence em", "Afiliado", "Ações"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {subs.map(sub => {
                  const days = daysLeft(sub.expires_at);
                  return (
                    <tr key={sub.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-gray-100 font-medium">{sub.restaurant?.name || "—"}</td>
                      <td className="px-4 py-3"><PlanBadge plan={sub.plan} /></td>
                      <td className="px-4 py-3"><StatusBadge status={sub.status} /></td>
                      <td className="px-4 py-3 text-gray-300">{brl(sub.amount)}</td>
                      <td className="px-4 py-3 text-gray-400">{CYCLE_LABEL[sub.cycle] || sub.cycle}</td>
                      <td className="px-4 py-3">
                        {sub.expires_at ? (
                          <span className={`text-xs ${days !== null && days <= 7 ? "text-red-400" : "text-gray-400"}`}>
                            {new Date(sub.expires_at).toLocaleDateString("pt-BR")}
                            {days !== null && <span className="ml-1">({days}d)</span>}
                          </span>
                        ) : <span className="text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{sub.affiliate_code || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setRenewModal(sub)} className="text-xs border border-white/10 hover:border-indigo-500/50 text-gray-400 hover:text-indigo-400 rounded-lg px-2 py-1 flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" /> Renovar
                          </button>
                          <button onClick={() => toggleStatus(sub)} disabled={toggling === sub.id} className="text-xs border border-white/10 hover:border-yellow-500/50 text-gray-400 hover:text-yellow-400 rounded-lg px-2 py-1 flex items-center gap-1 disabled:opacity-50">
                            {toggling === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <PauseCircle className="w-3 h-3" />}
                            {sub.status === "active" ? "Suspender" : "Ativar"}
                          </button>
                          <button className="text-xs border border-white/10 hover:border-gray-500/50 text-gray-400 hover:text-gray-200 rounded-lg px-2 py-1 flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Faturas
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {subs.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-500">Nenhuma assinatura encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {renewModal && <RenewModal sub={renewModal} onClose={() => setRenewModal(null)} onDone={() => { setRenewModal(null); load(); }} />}
      {newModal && <NewActivationModal plans={plans} restaurants={restaurants} onClose={() => setNewModal(false)} onDone={() => { setNewModal(false); load(); }} />}
    </div>
  );
}
