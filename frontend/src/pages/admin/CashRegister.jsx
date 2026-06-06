import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import {
  DollarSign, TrendingDown, TrendingUp, Clock, ChevronDown, ChevronUp, X, AlertTriangle
} from "lucide-react";

function MovementModal({ type, onClose, onConfirm }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(parseFloat(amount), reason.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const isSangria = type === "sangria";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            {isSangria ? <TrendingDown className="text-red-500" size={20} /> : <TrendingUp className="text-green-500" size={20} />}
            {isSangria ? "Sangria de Caixa" : "Suprimento de Caixa"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Valor (R$)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="0,00"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Motivo
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={isSangria ? "Ex: Pagamento de fornecedor" : "Ex: Troco inicial"}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 px-4 py-2 rounded-lg text-white font-medium ${
                isSangria ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
              } disabled:opacity-50`}
            >
              {loading ? "Salvando..." : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CloseModal({ caixa, movimentos, onClose, onConfirm }) {
  const [loading, setLoading] = useState(false);

  const sangrias = movimentos.filter((m) => m.type === "sangria").reduce((s, m) => s + m.amount, 0);
  const suprimentos = movimentos.filter((m) => m.type === "suprimento").reduce((s, m) => s + m.amount, 0);

  const handleClose = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" size={20} />
            Fechar Caixa
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-400">Resumo da sessão:</p>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Valor inicial:</span>
              <span className="font-medium text-gray-900 dark:text-white">{brl(caixa?.opening_amount || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Vendas do período:</span>
              <span className="font-medium text-green-600">{brl(caixa?.total_sales || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Suprimentos:</span>
              <span className="font-medium text-green-600">+ {brl(suprimentos)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">Sangrias:</span>
              <span className="font-medium text-red-600">- {brl(sangrias)}</span>
            </div>
            <div className="border-t border-gray-300 dark:border-gray-600 pt-2 flex justify-between font-semibold">
              <span className="text-gray-900 dark:text-white">Total esperado:</span>
              <span className="text-gray-900 dark:text-white">
                {brl((caixa?.opening_amount || 0) + (caixa?.total_sales || 0) + suprimentos - sangrias)}
              </span>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium disabled:opacity-50"
            >
              {loading ? "Fechando..." : "Fechar Caixa"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CashRegister() {
  const [caixa, setCaixa] = useState(null);
  const [movimentos, setMovimentos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingLoading, setOpeningLoading] = useState(false);
  const [movementModal, setMovementModal] = useState(null);
  const [closeModal, setCloseModal] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [histLoading, setHistLoading] = useState(false);

  const fetchCaixa = useCallback(async () => {
    try {
      const res = await api.get("/admin/caixa/atual");
      setCaixa(res.data);
      if (res.data && res.data.status === "open") {
        const movRes = await api.get("/admin/caixa/movimentos");
        setMovimentos(movRes.data || []);
      }
    } catch (err) {
      if (err?.response?.status !== 404) {
        toast.error("Erro ao carregar caixa");
      }
      setCaixa(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaixa();
  }, [fetchCaixa]);

  const fetchHistorico = async () => {
    setHistLoading(true);
    try {
      const res = await api.get("/admin/caixa/historico");
      setHistorico(res.data || []);
    } catch {
      toast.error("Erro ao carregar histórico");
    } finally {
      setHistLoading(false);
    }
  };

  const handleOpen = async (e) => {
    e.preventDefault();
    const val = parseFloat(openingAmount);
    if (isNaN(val) || val < 0) {
      toast.error("Informe um valor inicial válido");
      return;
    }
    setOpeningLoading(true);
    try {
      await api.post("/admin/caixa/abrir", { opening_amount: val });
      toast.success("Caixa aberto com sucesso!");
      setOpeningAmount("");
      fetchCaixa();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao abrir caixa");
    } finally {
      setOpeningLoading(false);
    }
  };

  const handleSangria = async (amount, reason) => {
    await api.post("/admin/caixa/sangria", { amount, reason });
    toast.success("Sangria registrada!");
    fetchCaixa();
  };

  const handleSuprimento = async (amount, reason) => {
    await api.post("/admin/caixa/suprimento", { amount, reason });
    toast.success("Suprimento registrado!");
    fetchCaixa();
  };

  const handleClose = async () => {
    await api.post("/admin/caixa/fechar");
    toast.success("Caixa fechado com sucesso!");
    setCaixa(null);
    setMovimentos([]);
    fetchCaixa();
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return "--";
    return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "--";
    return new Date(dateStr).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
  };

  const sangrias = movimentos.filter((m) => m.type === "sangria").reduce((s, m) => s + m.amount, 0);
  const suprimentos = movimentos.filter((m) => m.type === "suprimento").reduce((s, m) => s + m.amount, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!caixa || !caixa.status === "open") {
    return (
      <div className="max-w-md mx-auto mt-16 p-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full mb-4">
              <DollarSign className="text-indigo-600 dark:text-indigo-400" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Controle de Caixa</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">Nenhum caixa aberto no momento</p>
          </div>
          <form onSubmit={handleOpen} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Valor inicial em caixa (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg"
                placeholder="0,00"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={openingLoading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors"
            >
              {openingLoading ? "Abrindo..." : "Abrir Caixa"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Controle de Caixa</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
            <Clock size={14} />
            Caixa aberto desde {formatTime(caixa.opened_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMovementModal("suprimento")}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            <TrendingUp size={16} /> Suprimento
          </button>
          <button
            onClick={() => setMovementModal("sangria")}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            <TrendingDown size={16} /> Sangria
          </button>
          <button
            onClick={() => setCloseModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 text-white rounded-lg font-medium transition-colors"
          >
            Fechar caixa
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Vendas do período</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{brl(caixa.total_sales || 0)}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{caixa.total_orders || 0} pedidos</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Total em caixa</p>
          <p className="text-2xl font-bold text-indigo-600 mt-1">
            {brl((caixa.opening_amount || 0) + (caixa.total_sales || 0) + suprimentos - sangrias)}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Abertura: {brl(caixa.opening_amount || 0)}</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">Sangrias / Suprimentos</p>
          <p className="text-2xl font-bold text-red-500 mt-1">- {brl(sangrias)}</p>
          <p className="text-xs text-green-500 mt-1">+ {brl(suprimentos)}</p>
        </div>
      </div>

      {/* Tabela de movimentos */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">Movimentos da sessão</h2>
        </div>
        {movimentos.length === 0 ? (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500">
            Nenhum movimento registrado nesta sessão
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Tipo</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Valor</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Motivo</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Horário</th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((m, i) => (
                  <tr key={m.id || i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        m.type === "sangria"
                          ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                          : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      }`}>
                        {m.type === "sangria" ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                        {m.type === "sangria" ? "Sangria" : "Suprimento"}
                      </span>
                    </td>
                    <td className={`py-3 px-4 text-right font-semibold ${
                      m.type === "sangria" ? "text-red-600" : "text-green-600"
                    }`}>
                      {m.type === "sangria" ? "-" : "+"} {brl(m.amount)}
                    </td>
                    <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{m.reason}</td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400">{formatTime(m.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <button
          className="w-full flex items-center justify-between p-4 text-left"
          onClick={() => {
            setShowHistorico((v) => !v);
            if (!showHistorico && historico.length === 0) fetchHistorico();
          }}
        >
          <span className="font-semibold text-gray-900 dark:text-white">Histórico de sessões anteriores</span>
          {showHistorico ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </button>
        {showHistorico && (
          <div className="border-t border-gray-100 dark:border-gray-700">
            {histLoading ? (
              <div className="p-6 text-center text-gray-400">Carregando...</div>
            ) : historico.length === 0 ? (
              <div className="p-6 text-center text-gray-400 dark:text-gray-500">Nenhuma sessão anterior encontrada</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Abertura</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Fechamento</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Valor inicial</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Vendas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historico.map((h, i) => (
                      <tr key={h.id || i} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                        <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{formatDateTime(h.opened_at)}</td>
                        <td className="py-3 px-4 text-gray-700 dark:text-gray-300">{formatDateTime(h.closed_at)}</td>
                        <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{brl(h.opening_amount)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-green-600">{brl(h.total_sales)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {movementModal && (
        <MovementModal
          type={movementModal}
          onClose={() => setMovementModal(null)}
          onConfirm={movementModal === "sangria" ? handleSangria : handleSuprimento}
        />
      )}

      {closeModal && (
        <CloseModal
          caixa={caixa}
          movimentos={movimentos}
          onClose={() => setCloseModal(false)}
          onConfirm={handleClose}
        />
      )}
    </div>
  );
}
