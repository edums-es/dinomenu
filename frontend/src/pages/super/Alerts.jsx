import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { AlertTriangle, Clock, XCircle, Loader2, RefreshCw, RotateCcw } from "lucide-react";

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
          <p className="text-sm text-gray-400">Plano: <span className="text-gray-100">{sub?.plan?.name}</span></p>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Valor (R$)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Método de Pagamento</label>
            <select value={method} onChange={e => setMethod(e.target.value)}
              className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
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

function AlertItem({ sub, type, onRenew }) {
  const days = sub.days_until_expiry ?? sub.days_overdue ?? null;
  const isExpiring = type === "expiring";

  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border ${isExpiring ? "bg-yellow-500/5 border-yellow-500/20" : "bg-red-500/5 border-red-500/20"}`}>
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full grid place-items-center flex-shrink-0 ${isExpiring ? "bg-yellow-500/20" : "bg-red-500/20"}`}>
          {isExpiring ? <Clock className="w-4 h-4 text-yellow-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
        </div>
        <div>
          <p className="font-medium text-gray-100 text-sm">{sub.restaurant?.name || "Restaurante"}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: (sub.plan?.color || "#6366f1") + "33", color: sub.plan?.color || "#818cf8" }}>
              {sub.plan?.name || "—"}
            </span>
            {days !== null && (
              <span className={`text-xs font-medium ${isExpiring ? "text-yellow-400" : "text-red-400"}`}>
                {isExpiring ? `Vence em ${days} dia${days !== 1 ? "s" : ""}` : `Vencido há ${days} dia${days !== 1 ? "s" : ""}`}
              </span>
            )}
            <span className="text-xs text-gray-500">{brl(sub.amount)}</span>
          </div>
        </div>
      </div>
      <button onClick={() => onRenew(sub)} className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg">
        <RotateCcw className="w-3 h-3" /> Renovar
      </button>
    </div>
  );
}

export default function Alerts() {
  const [alerts, setAlerts] = useState({ expiring: [], overdue: [] });
  const [loading, setLoading] = useState(true);
  const [renewModal, setRenewModal] = useState(null);
  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/super/subscriptions/alerts");
      setAlerts(data || { expiring: [], overdue: [] });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 60000);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  const totalAlerts = (alerts.expiring?.length || 0) + (alerts.overdue?.length || 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Central de Alertas</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Assinaturas que precisam de atenção
            {!loading && <span className="ml-2 text-xs text-gray-500">(atualiza a cada 60s)</span>}
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 border border-white/10 text-gray-400 hover:text-gray-200 px-3 py-2 rounded-xl text-sm">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>
      ) : totalAlerts === 0 ? (
        <div className="bg-[#161B22] border border-white/5 rounded-2xl p-16 text-center">
          <div className="w-14 h-14 bg-green-500/10 rounded-full grid place-items-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-green-400" />
          </div>
          <p className="text-gray-100 font-semibold">Tudo em dia!</p>
          <p className="text-sm text-gray-400 mt-1">Nenhuma assinatura precisa de atenção no momento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Vencendo em 7 dias */}
          <div className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 p-5 border-b border-white/5">
              <div className="w-8 h-8 bg-yellow-500/20 rounded-full grid place-items-center">
                <Clock className="w-4 h-4 text-yellow-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-100">Vencendo em 7 dias</h2>
                <p className="text-xs text-gray-500">{alerts.expiring?.length || 0} assinatura{(alerts.expiring?.length || 0) !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {(alerts.expiring || []).length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhuma assinatura vencendo em breve.</p>
              ) : (
                (alerts.expiring || []).map(sub => (
                  <AlertItem key={sub.id} sub={sub} type="expiring" onRenew={setRenewModal} />
                ))
              )}
            </div>
          </div>

          {/* Vencidos */}
          <div className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 p-5 border-b border-white/5">
              <div className="w-8 h-8 bg-red-500/20 rounded-full grid place-items-center">
                <AlertTriangle className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <h2 className="font-bold text-gray-100">Vencidos / Inadimplentes</h2>
                <p className="text-xs text-gray-500">{alerts.overdue?.length || 0} assinatura{(alerts.overdue?.length || 0) !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {(alerts.overdue || []).length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">Nenhuma assinatura vencida.</p>
              ) : (
                (alerts.overdue || []).map(sub => (
                  <AlertItem key={sub.id} sub={sub} type="overdue" onRenew={setRenewModal} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {renewModal && (
        <RenewModal
          sub={renewModal}
          onClose={() => setRenewModal(null)}
          onDone={() => { setRenewModal(null); load(); }}
        />
      )}
    </div>
  );
}
