import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import {
  Plus, X, Pencil, Trash2, Loader2, CheckCircle2, XCircle, Star,
} from "lucide-react";

const EMPTY_PLAN = {
  name: "", slug: "", description: "",
  price_monthly: "", price_yearly: "", trial_days: 0, color: "#6366f1",
  is_active: true, is_featured: false,
  features: [],
  limits: { max_products: "", max_orders_monthly: "" },
};

function Badge({ active }) {
  return active
    ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">Ativo</span>
    : <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-400">Inativo</span>;
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-indigo-600" : "bg-gray-700"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

function Modal({ plan, plans, onClose, onSaved }) {
  const [form, setForm] = useState(plan ? { ...plan, features: [...(plan.features || [])], limits: { ...(plan.limits || {}) } } : { ...EMPTY_PLAN, features: [] });
  const [saving, setSaving] = useState(false);
  const [newFeature, setNewFeature] = useState("");
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setLimit = (k, v) => setForm(f => ({ ...f, limits: { ...f.limits, [k]: v } }));

  const addFeature = () => {
    if (!newFeature.trim()) return;
    setForm(f => ({ ...f, features: [...f.features, newFeature.trim()] }));
    setNewFeature("");
  };

  const removeFeature = (i) => setForm(f => ({ ...f, features: f.features.filter((_, idx) => idx !== i) }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price_monthly) { setError("Nome e preço mensal são obrigatórios."); return; }
    setSaving(true);
    setError("");
    try {
      if (plan?.id) {
        await api.put(`/super/plans/${plan.id}`, form);
      } else {
        await api.post("/super/plans", form);
      }
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao salvar plano.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/5 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-bold text-gray-100">{plan?.id ? "Editar Plano" : "Novo Plano"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ex: Starter" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Slug</label>
              <input value={form.slug} onChange={e => set("slug", e.target.value)} placeholder="starter" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Descrição</label>
            <textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="Descrição do plano..." className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Preço Mensal (R$) *</label>
              <input type="number" min="0" step="0.01" value={form.price_monthly} onChange={e => set("price_monthly", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Preço Anual (R$)</label>
              <input type="number" min="0" step="0.01" value={form.price_yearly} onChange={e => set("price_yearly", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Dias Trial</label>
              <input type="number" min="0" value={form.trial_days} onChange={e => set("trial_days", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Máx. Produtos</label>
              <input type="number" min="0" value={form.limits?.max_products || ""} onChange={e => setLimit("max_products", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Máx. Pedidos/mês</label>
              <input type="number" min="0" value={form.limits?.max_orders_monthly || ""} onChange={e => setLimit("max_orders_monthly", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Cor</label>
              <input type="color" value={form.color} onChange={e => set("color", e.target.value)} className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
            </div>
            <div className="flex items-center gap-6 mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={form.is_active} onChange={v => set("is_active", v)} />
                <span className="text-sm text-gray-300">Ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={form.is_featured} onChange={v => set("is_featured", v)} />
                <span className="text-sm text-gray-300">Destaque</span>
              </label>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-2 block">Features</label>
            <div className="space-y-2 mb-2">
              {form.features.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#1E2430] border border-white/10 rounded-lg px-3 py-2">
                  <span className="flex-1 text-sm text-gray-200">{f}</span>
                  <button type="button" onClick={() => removeFeature(i)} className="text-gray-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={newFeature} onChange={e => setNewFeature(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addFeature())} placeholder="Ex: Até 50 produtos" className="flex-1 bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
              <button type="button" onClick={addFeature} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2"><Plus className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "new" | plan object
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super/plans");
      setPlans(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (plan) => {
    if (!window.confirm(`Excluir o plano "${plan.name}"?`)) return;
    setDeleting(plan.id);
    try { await api.delete(`/super/plans/${plan.id}`); await load(); }
    finally { setDeleting(null); }
  };

  const openEdit = (plan) => setModal(plan);
  const openNew = () => setModal({});

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Planos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie os planos de assinatura da plataforma</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {plans.map(plan => (
            <div key={plan.id} className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
              <div className="h-2" style={{ background: plan.color || "#6366f1" }} />
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h3 className="font-bold text-gray-100 text-lg leading-tight">{plan.name}</h3>
                    {plan.is_featured && (
                      <span className="inline-flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full mt-1">
                        <Star className="w-3 h-3" /> Destaque
                      </span>
                    )}
                  </div>
                  <Badge active={plan.is_active} />
                </div>
                {plan.description && <p className="text-xs text-gray-400 mt-1 mb-3 line-clamp-2">{plan.description}</p>}
                <div className="my-3">
                  <p className="text-3xl font-extrabold text-gray-100">{brl(plan.price_monthly)}<span className="text-sm font-normal text-gray-400">/mês</span></p>
                  {plan.price_yearly && <p className="text-xs text-gray-500 mt-0.5">{brl(plan.price_yearly)}/ano</p>}
                  {plan.trial_days > 0 && <p className="text-xs text-indigo-400 mt-0.5">{plan.trial_days} dias grátis</p>}
                </div>
                {(plan.subscribers_count !== undefined) && (
                  <span className="text-xs text-gray-400 bg-[#1E2430] border border-white/10 rounded-full px-3 py-1 self-start mb-3">
                    {plan.subscribers_count} assinante{plan.subscribers_count !== 1 ? "s" : ""}
                  </span>
                )}
                <ul className="space-y-1.5 flex-1">
                  {(plan.features || []).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: plan.color || "#6366f1" }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                  <button onClick={() => openEdit(plan)} className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-white/10 hover:border-indigo-500/50 text-gray-300 hover:text-indigo-400 rounded-lg py-2 transition-colors">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button onClick={() => handleDelete(plan)} disabled={deleting === plan.id} className="flex items-center justify-center text-xs border border-white/10 hover:border-red-500/50 text-gray-400 hover:text-red-400 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
                    {deleting === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {plans.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-500">Nenhum plano cadastrado.</div>
          )}
        </div>
      )}

      {modal !== null && (
        <Modal plan={modal?.id ? modal : null} plans={plans} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
    </div>
  );
}
