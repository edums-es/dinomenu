import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import {
  Plus, Pencil, Trash2, Loader2, Copy, DollarSign,
  Users, CheckCircle2, XCircle, Search,
} from "lucide-react";

const STATUS_CLASS = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-gray-500/20 text-gray-400",
};

function Toast({ message, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-[#1E2430] border border-white/10 text-gray-100 rounded-xl px-4 py-3 text-sm shadow-lg flex items-center gap-2">
      <CheckCircle2 className="w-4 h-4 text-green-400" /> {message}
    </div>
  );
}

function AffiliateModal({ affiliate, onClose, onSaved }) {
  const [form, setForm] = useState(affiliate?.id ? { ...affiliate } : { name: "", email: "", phone: "", commission_rate: 10, status: "active" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) { setError("Nome e email são obrigatórios."); return; }
    setSaving(true);
    setError("");
    try {
      if (affiliate?.id) {
        await api.put(`/super/affiliates/${affiliate.id}`, form);
      } else {
        await api.post("/super/affiliates", form);
      }
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao salvar afiliado.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/5 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-bold text-gray-100">{affiliate?.id ? "Editar Afiliado" : "Novo Afiliado"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><XCircle className="w-5 h-5" /></button>
        </div>
        <form onSubmit={save} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Nome *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Nome completo" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Email *</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@exemplo.com" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefone</label>
              <input value={form.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-9999" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Comissão (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.commission_rate} onChange={e => set("commission_rate", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          {affiliate?.id && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PayCommissionModal({ affiliate, onClose, onDone }) {
  const [amount, setAmount] = useState(affiliate?.pending_commission || "");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post(`/super/affiliates/${affiliate.id}/pay-commission`, { amount: Number(amount), notes });
      onDone();
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao pagar comissão.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/5 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-bold text-gray-100">Pagar Comissão</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><XCircle className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <p className="text-sm text-gray-400">Afiliado: <span className="text-gray-100 font-medium">{affiliate?.name}</span></p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Ex: PIX em 12/01/2025" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Confirmar Pagamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Affiliates() {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super/affiliates");
      setAffiliates(data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (aff) => {
    if (!window.confirm(`Excluir o afiliado "${aff.name}"?`)) return;
    setDeleting(aff.id);
    try { await api.delete(`/super/affiliates/${aff.id}`); await load(); }
    finally { setDeleting(null); }
  };

  const copyLink = (code) => {
    navigator.clipboard.writeText(`http://localhost:3000/?ref=${code}`);
    setToast("Link de indicação copiado!");
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setToast("Código copiado!");
  };

  const filtered = affiliates.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase()) ||
    a.code?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPending = affiliates.reduce((s, a) => s + (a.pending_commission || 0), 0);
  const totalPaid = affiliates.reduce((s, a) => s + (a.paid_commission || 0), 0);
  const totalRestaurants = affiliates.reduce((s, a) => s + (a.active_restaurants || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Afiliados</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie o sistema de afiliados e comissões</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Afiliado
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
          <Users className="w-5 h-5 text-indigo-400 mb-2" />
          <p className="text-2xl font-extrabold text-gray-100">{affiliates.length}</p>
          <p className="text-sm text-gray-400">Total de Afiliados</p>
        </div>
        <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
          <DollarSign className="w-5 h-5 text-red-400 mb-2" />
          <p className="text-2xl font-extrabold text-red-400">{brl(totalPending)}</p>
          <p className="text-sm text-gray-400">Comissão Pendente</p>
        </div>
        <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
          <CheckCircle2 className="w-5 h-5 text-green-400 mb-2" />
          <p className="text-2xl font-extrabold text-gray-100">{brl(totalPaid)}</p>
          <p className="text-sm text-gray-400">Comissão Paga</p>
        </div>
        <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
          <Users className="w-5 h-5 text-blue-400 mb-2" />
          <p className="text-2xl font-extrabold text-gray-100">{totalRestaurants}</p>
          <p className="text-sm text-gray-400">Restaurantes Indicados</p>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar afiliado..." className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
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
                  {["Nome", "Email", "Código", "Comissão %", "Restaurantes", "Pendente", "Pago", "Status", "Ações"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(aff => (
                  <tr key={aff.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-gray-100 font-medium">{aff.name}</td>
                    <td className="px-4 py-3 text-gray-400">{aff.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <code className="bg-[#1E2430] border border-white/10 text-indigo-300 text-xs px-2 py-0.5 rounded font-mono">{aff.code}</code>
                        <button onClick={() => copyCode(aff.code)} className="text-gray-500 hover:text-gray-300" title="Copiar código"><Copy className="w-3.5 h-3.5" /></button>
                        <button onClick={() => copyLink(aff.code)} className="text-gray-500 hover:text-indigo-400 text-xs border border-white/10 hover:border-indigo-500/50 px-2 py-0.5 rounded" title="Copiar link">Link</button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{aff.commission_rate}%</td>
                    <td className="px-4 py-3 text-gray-400">{aff.active_restaurants || 0}</td>
                    <td className="px-4 py-3">
                      <span className={aff.pending_commission > 0 ? "text-red-400 font-medium" : "text-gray-400"}>{brl(aff.pending_commission || 0)}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{brl(aff.paid_commission || 0)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[aff.status] || "bg-gray-500/20 text-gray-400"}`}>
                        {aff.status === "active" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setModal(aff)} className="text-gray-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-500/10" title="Editar"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => setPayModal(aff)} className="text-gray-400 hover:text-green-400 p-1.5 rounded-lg hover:bg-green-500/10 text-xs flex items-center gap-1" title="Pagar comissão">
                          <DollarSign className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(aff)} disabled={deleting === aff.id} className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50" title="Excluir">
                          {deleting === aff.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-500">Nenhum afiliado encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && <AffiliateModal affiliate={modal?.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {payModal && <PayCommissionModal affiliate={payModal} onClose={() => setPayModal(null)} onDone={() => { setPayModal(null); load(); setToast("Comissão paga com sucesso!"); }} />}
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}
