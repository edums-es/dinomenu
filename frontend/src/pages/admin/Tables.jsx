import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, QrCode, Edit2, Trash2, X, Copy, Check, Users, Hash } from "lucide-react";

const STATUS_COLORS = {
  available: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400",
  occupied: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
  reserved: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400",
};

const STATUS_LABELS = {
  available: "Disponível",
  occupied: "Ocupada",
  reserved: "Reservada",
};

function TableModal({ table, waiters = [], onClose, onSaved }) {
  const isEdit = !!table?.id;
  const [form, setForm] = useState({
    number: table?.number || "",
    name: table?.name || "",
    capacity: table?.capacity || 4,
    waiter_id: table?.waiter_id || "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.number) { toast.error("Número da mesa obrigatório"); return; }
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/admin/tables/${table.id}`, { ...form, waiter_id: form.waiter_id || null });
        toast.success("Mesa atualizada!");
      } else {
        await api.post("/admin/tables", { ...form, waiter_id: form.waiter_id || null });
        toast.success("Mesa criada!");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar mesa");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Editar Mesa" : "Nova Mesa"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Número <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.number}
              onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: 01, A1, VIP-1"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Garçom responsável
            </label>
            <select
              value={form.waiter_id}
              onChange={(e) => setForm((f) => ({ ...f, waiter_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Sem garçom fixo</option>
              {waiters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Nome / Identificação
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Mesa do Canto, Varanda"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Capacidade (pessoas)
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-white font-medium disabled:opacity-50">
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QrModal({ table, onClose }) {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/admin/tables/${table.id}/qr-data`)
      .then((r) => setQrData(r.data))
      .catch(() => {
        const fallbackUrl = `${window.location.origin}/cardapio/${table.restaurant_slug || ""}?mesa=${table.number}`;
        setQrData({ url: fallbackUrl, table_number: table.number, table_name: table.name });
      })
      .finally(() => setLoading(false));
  }, [table.id, table.number, table.name, table.restaurant_slug]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(qrData.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <QrCode size={20} className="text-indigo-600" />
            QR Code — Mesa {table.number}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
          ) : (
            <>
              <div className="bg-white border-4 border-gray-900 dark:border-gray-100 rounded-xl p-6 flex flex-col items-center gap-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrData?.url || "")}`}
                  alt={`QR Code Mesa ${table.number}`}
                  className="w-64 h-64"
                />
                <p className="text-xs text-gray-500 text-center mt-2">
                  QR Code pronto para imprimir e colar na mesa.
                </p>
              </div>

              {/* URL da mesa */}
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Link da mesa:</p>
                <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{qrData?.url}</p>
              </div>

              <button
                onClick={handleCopy}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-colors ${
                  copied
                    ? "bg-green-600 text-white"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                }`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copiado!" : "Copiar Link"}
              </button>

              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  <strong>Como usar:</strong> Imprima este QR Code e coloque na mesa. Ao escanear, o cliente abre o cardapio ja vinculado a mesa.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Tables() {
  const [tables, setTables] = useState([]);
  const [waiters, setWaiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [qrModal, setQrModal] = useState(null);

  const fetchTables = useCallback(async () => {
    try {
      const [tablesRes, waitersRes] = await Promise.all([
        api.get("/admin/tables"),
        api.get("/admin/waiters", { params: { active_only: true } }),
      ]);
      setTables(tablesRes.data || []);
      setWaiters(waitersRes.data || []);
    } catch { toast.error("Erro ao carregar mesas"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTables(); }, [fetchTables]);

  const handleDelete = async (t) => {
    if (!window.confirm(`Excluir a mesa ${t.number}?`)) return;
    try {
      await api.delete(`/admin/tables/${t.id}`);
      toast.success("Mesa excluída");
      fetchTables();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao excluir");
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mesas e QR Code</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{tables.length} mesa{tables.length !== 1 ? "s" : ""} cadastrada{tables.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setModal({})}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors"
        >
          <Plus size={16} /> Nova Mesa
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
      ) : tables.length === 0 ? (
        <div className="text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full mb-4">
            <Hash size={32} className="text-gray-400" />
          </div>
          <p className="text-gray-500 dark:text-gray-400">Nenhuma mesa cadastrada</p>
          <button onClick={() => setModal({})} className="mt-3 text-indigo-600 hover:text-indigo-700 text-sm font-medium">Criar primeira mesa</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tables.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">#{t.number}</span>
                    {t.name && <span className="text-sm text-gray-500 dark:text-gray-400">{t.name}</span>}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-gray-500 dark:text-gray-400 text-sm">
                    <Users size={13} /> {t.capacity} pessoa{t.capacity !== 1 ? "s" : ""}
                  </div>
                  {t.waiter?.name && (
                    <p className="text-xs text-indigo-500 dark:text-indigo-300 mt-1">
                      Garçom: {t.waiter.name}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status] || STATUS_COLORS.available}`}>
                  {STATUS_LABELS[t.status] || "Disponível"}
                </span>
              </div>

              <div className="flex gap-2 mt-auto">
                <button
                  onClick={() => setQrModal(t)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg text-sm font-medium transition-colors"
                >
                  <QrCode size={15} /> Ver QR Code
                </button>
                <button
                  onClick={() => setModal(t)}
                  className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
                >
                  <Edit2 size={16} />
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <TableModal table={modal} waiters={waiters} onClose={() => setModal(null)} onSaved={fetchTables} />}
      {qrModal && <QrModal table={qrModal} onClose={() => setQrModal(null)} />}
    </div>
  );
}
