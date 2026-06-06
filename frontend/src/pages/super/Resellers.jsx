import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import {
  Plus, Pencil, Trash2, Loader2, Building2, Search,
  XCircle, Users, Info,
} from "lucide-react";

const STATUS_CLASS = {
  active: "bg-green-500/20 text-green-400",
  inactive: "bg-gray-500/20 text-gray-400",
  suspended: "bg-red-500/20 text-red-400",
};

function Tooltip({ text, children }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 bg-[#1E2430] border border-white/10 text-gray-200 text-xs rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-lg z-50">
          {text}
        </span>
      )}
    </span>
  );
}

function ResellerModal({ reseller, onClose, onSaved }) {
  const [form, setForm] = useState(reseller?.id ? { ...reseller } : {
    company_name: "", contact_name: "", email: "", phone: "", cnpj: "",
    discount_rate: 0, commission_rate: 10, whitelabel_domain: "", notes: "", status: "active",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async (e) => {
    e.preventDefault();
    if (!form.company_name || !form.email) { setError("Empresa e email são obrigatórios."); return; }
    setSaving(true);
    setError("");
    try {
      if (reseller?.id) {
        await api.put(`/super/resellers/${reseller.id}`, form);
      } else {
        await api.post("/super/resellers", form);
      }
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao salvar revendedor.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/5 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <h2 className="font-bold text-gray-100">{reseller?.id ? "Editar Revendedor" : "Novo Revendedor"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><XCircle className="w-5 h-5" /></button>
        </div>
        <form onSubmit={save} className="p-5 space-y-4">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Empresa *</label>
              <input value={form.company_name} onChange={e => set("company_name", e.target.value)} placeholder="Razão social" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Contato</label>
              <input value={form.contact_name} onChange={e => set("contact_name", e.target.value)} placeholder="Nome do contato" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">CNPJ</label>
              <input value={form.cnpj || ""} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0001-00" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Email *</label>
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@empresa.com" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Telefone</label>
              <input value={form.phone || ""} onChange={e => set("phone", e.target.value)} placeholder="(11) 99999-9999" className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Desconto (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.discount_rate} onChange={e => set("discount_rate", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Comissão (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.commission_rate} onChange={e => set("commission_rate", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 flex items-center gap-1.5 block">
              Domínio Whitelabel
              <Tooltip text="Disponível em breve">
                <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full cursor-default">Em breve</span>
              </Tooltip>
            </label>
            <input
              value={form.whitelabel_domain || ""}
              onChange={e => set("whitelabel_domain", e.target.value)}
              placeholder="meudelivery.com.br"
              disabled
              className="w-full bg-[#1E2430] border border-white/5 text-gray-500 placeholder-gray-700 rounded-lg px-3 py-2 text-sm cursor-not-allowed opacity-60"
            />
          </div>
          {reseller?.id && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)} className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="suspended">Suspenso</option>
              </select>
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Notas</label>
            <textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Observações internas..." className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
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

function RestaurantsModal({ reseller, onClose }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/super/resellers/${reseller.id}/restaurants`)
      .then(({ data }) => setRestaurants(data || []))
      .finally(() => setLoading(false));
  }, [reseller.id]);

  const STATUS_CLASS_SUB = {
    active: "bg-green-500/20 text-green-400",
    trial: "bg-blue-500/20 text-blue-400",
    overdue: "bg-red-500/20 text-red-400",
    suspended: "bg-gray-500/20 text-gray-400",
    cancelled: "bg-gray-500/20 text-gray-400",
  };
  const STATUS_LABEL = { active: "Ativo", trial: "Trial", overdue: "Vencido", suspended: "Suspenso", cancelled: "Cancelado" };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/5 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-white/5 flex-shrink-0">
          <div>
            <h2 className="font-bold text-gray-100">Restaurantes de {reseller.company_name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{restaurants.length} restaurante{restaurants.length !== 1 ? "s" : ""} gerenciado{restaurants.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><XCircle className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#161B22]">
                <tr className="border-b border-white/5">
                  {["Restaurante", "Plano", "Status", "Valor"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {restaurants.map(r => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-gray-100">{r.restaurant?.name || r.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: (r.plan?.color || "#6366f1") + "33", color: r.plan?.color || "#818cf8" }}>
                        {r.plan?.name || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS_SUB[r.status] || "bg-gray-500/20 text-gray-400"}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300">{brl(r.amount)}</td>
                  </tr>
                ))}
                {restaurants.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-10 text-gray-500">Nenhum restaurante vinculado.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Resellers() {
  const [resellers, setResellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [restsModal, setRestsModal] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super/resellers");
      setResellers(data || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (r) => {
    if (!window.confirm(`Excluir o revendedor "${r.company_name}"?`)) return;
    setDeleting(r.id);
    try { await api.delete(`/super/resellers/${r.id}`); await load(); }
    finally { setDeleting(null); }
  };

  const filtered = resellers.filter(r =>
    r.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.email?.toLowerCase().includes(search.toLowerCase()) ||
    r.contact_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Revendedores</h1>
          <p className="text-sm text-gray-400 mt-0.5">Gerencie a rede de revendedores da plataforma</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo Revendedor
        </button>
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar revendedor..." className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
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
                  {["Empresa", "Contato", "Email", "CNPJ", "Desconto", "Restaurantes", "Comissão Pend.", "Status", "Ações"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-500/20 rounded-lg grid place-items-center flex-shrink-0">
                          <Building2 className="w-4 h-4 text-indigo-400" />
                        </div>
                        <span className="text-gray-100 font-medium">{r.company_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{r.contact_name || "—"}</td>
                    <td className="px-4 py-3 text-gray-400">{r.email}</td>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{r.cnpj || "—"}</td>
                    <td className="px-4 py-3 text-gray-300">{r.discount_rate}%</td>
                    <td className="px-4 py-3 text-gray-400">{r.managed_restaurants || 0}</td>
                    <td className="px-4 py-3">
                      <span className={r.pending_commission > 0 ? "text-red-400 font-medium" : "text-gray-400"}>{brl(r.pending_commission || 0)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[r.status] || "bg-gray-500/20 text-gray-400"}`}>
                        {r.status === "active" ? "Ativo" : r.status === "suspended" ? "Suspenso" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setRestsModal(r)} className="text-gray-400 hover:text-blue-400 p-1.5 rounded-lg hover:bg-blue-500/10" title="Ver restaurantes">
                          <Users className="w-4 h-4" />
                        </button>
                        <button onClick={() => setModal(r)} className="text-gray-400 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-indigo-500/10" title="Editar">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(r)} disabled={deleting === r.id} className="text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 disabled:opacity-50" title="Excluir">
                          {deleting === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-500">Nenhum revendedor encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal !== null && (
        <ResellerModal reseller={modal?.id ? modal : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />
      )}
      {restsModal && <RestaurantsModal reseller={restsModal} onClose={() => setRestsModal(null)} />}
    </div>
  );
}
