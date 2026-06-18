import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Users, Phone, BadgeCheck } from "lucide-react";

const emptyForm = {
  name: "",
  phone: "",
  code: "",
  shift: "",
  is_active: true,
  notes: "",
};

function WaiterModal({ waiter, onClose, onSaved }) {
  const isEdit = !!waiter?.id;
  const [form, setForm] = useState({ ...emptyForm, ...(waiter || {}) });
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do garcom");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) await api.put(`/admin/waiters/${waiter.id}`, form);
      else await api.post("/admin/waiters", form);
      toast.success(isEdit ? "Garcom atualizado" : "Garcom cadastrado");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar garcom");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form onSubmit={save} className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-[#1E2430]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold dark:text-white">{isEdit ? "Editar garcom" : "Novo garcom"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">x</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Nome</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Telefone</span>
            <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Codigo interno</span>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Turno</span>
            <input value={form.shift} onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value }))}
              placeholder="Ex: noite, fim de semana"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:text-white">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Ativo
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Observacoes</span>
            <textarea rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
          </label>
        </div>
        <div className="mt-5 flex gap-2">
          <Button type="button" variant="outline" className="flex-1 dark:border-gray-700 dark:text-gray-300" onClick={onClose}>Cancelar</Button>
          <Button type="submit" className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        </div>
      </form>
    </div>
  );
}

export default function Waiters() {
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/waiters");
      setWaiters(data || []);
    } catch {
      toast.error("Erro ao carregar garcons");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (waiter) => {
    if (!window.confirm(`Excluir ${waiter.name}? As mesas vinculadas ficarao sem garcom fixo.`)) return;
    try {
      await api.delete(`/admin/waiters/${waiter.id}`);
      toast.success("Garcom removido");
      load();
    } catch {
      toast.error("Erro ao remover garcom");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold dark:text-white">Garcons</h1>
          <p className="text-sm text-gray-400">Controle de atendimento por mesa e pedidos do salao.</p>
        </div>
        <Button onClick={() => setModal({})} className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus className="mr-2 h-4 w-4" /> Novo garcom
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-gray-400">Carregando...</div>
      ) : waiters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400 dark:border-gray-700">
          <Users className="mx-auto mb-3 h-10 w-10 opacity-40" />
          Nenhum garcom cadastrado.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {waiters.map((waiter) => (
            <div key={waiter.id} className="rounded-2xl border border-gray-100 bg-white p-4 dark:border-gray-700 dark:bg-[#1E2430]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-lg font-bold dark:text-white">{waiter.name}</p>
                  <p className="mt-1 flex items-center gap-1 text-sm text-gray-400"><Phone className="h-3.5 w-3.5" /> {waiter.phone || "Sem telefone"}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${waiter.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
                  {waiter.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
                  <BadgeCheck className="mb-1 h-4 w-4 text-indigo-500" />
                  {waiter.tables_count || 0} mesa(s)
                </div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
                  <Users className="mb-1 h-4 w-4 text-cyan-500" />
                  {waiter.open_orders_count || 0} pedido(s) aberto(s)
                </div>
              </div>
              {waiter.shift && <p className="mt-3 text-xs text-gray-400">Turno: {waiter.shift}</p>}
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 dark:border-gray-700 dark:text-gray-300" onClick={() => setModal(waiter)}>
                  <Edit2 className="mr-1 h-4 w-4" /> Editar
                </Button>
                <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600 dark:border-gray-700" onClick={() => remove(waiter)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <WaiterModal waiter={modal.id ? modal : null} onClose={() => setModal(null)} onSaved={load} />}
    </div>
  );
}
