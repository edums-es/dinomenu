import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  MessageCircle, Wifi, WifiOff, RefreshCw, Trash2, Send,
  CheckCircle2, XCircle, Loader2, Info, Bell, Phone, Key, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const STATUS_CFG = {
  connected:    { label: "Conectado",       color: "#10b981", spin: false },
  qr:           { label: "Aguardando scan", color: "#f59e0b", spin: true  },
  connecting:   { label: "Conectando...",   color: "#6366f1", spin: true  },
  initializing: { label: "Iniciando...",    color: "#6366f1", spin: true  },
  disconnected: { label: "Desconectado",    color: "#6b7280", spin: false },
  no_token:     { label: "Token pendente",  color: "#f59e0b", spin: false },
  error:        { label: "Erro",            color: "#ef4444", spin: false },
};

const ALL_STATUSES = [
  { key: "accepted",         label: "Pedido aceito"        },
  { key: "preparing",        label: "Em preparo"           },
  { key: "ready",            label: "Pronto para retirada" },
  { key: "out_for_delivery", label: "Saiu para entrega"    },
  { key: "completed",        label: "Entregue"             },
  { key: "cancelled",        label: "Cancelado"            },
];

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.disconnected;
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-sm px-3 py-1.5 rounded-full"
      style={{ background: cfg.color + "22", color: cfg.color }}>
      {cfg.spin
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : status === "connected"
          ? <CheckCircle2 className="w-4 h-4" />
          : <WifiOff className="w-4 h-4" />
      }
      {cfg.label}
    </span>
  );
}

export default function WhatsApp() {
  const [provider, setProvider]         = useState("evolution");
  const [hasToken, setHasToken]         = useState(false);
  const [status, setStatus]             = useState("disconnected");
  const [qr, setQr]                     = useState(null);
  const [loadingQr, setLoadingQr]       = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [notifyStatuses, setNotifyStatuses] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [testPhone, setTestPhone]       = useState("");
  const [testLoading, setTestLoading]   = useState(false);
  const [kiraToken, setKiraToken]       = useState("");
  const [savingToken, setSavingToken]   = useState(false);
  const pollRef = useRef(null);

  const loadProvider = useCallback(async () => {
    try {
      const r = await api.get("/admin/whatsapp/provider");
      setProvider(r.data.provider || "evolution");
      setHasToken(!!r.data.has_token);
    } catch {}
  }, []);

  const checkStatus = useCallback(async (silent = false) => {
    try {
      const r = await api.get("/admin/whatsapp/status");
      setStatus(r.data.status || "disconnected");
    } catch {
      if (!silent) setStatus("disconnected");
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const r = await api.get("/admin/whatsapp/settings");
      setNotifyStatuses(r.data.notify_statuses || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadProvider();
    checkStatus();
    loadSettings();
  }, [loadProvider, checkStatus, loadSettings]);

  // Polling quando QR visivel ou conectando
  useEffect(() => {
    clearInterval(pollRef.current);
    if (["qr", "connecting", "initializing"].includes(status)) {
      pollRef.current = setInterval(async () => {
        try {
          const r = await api.get("/admin/whatsapp/qr");
          setStatus(r.data.status || "disconnected");
          if (r.data.qr) setQr(r.data.qr);
          else if (r.data.status === "connected") {
            setQr(null);
            toast.success("WhatsApp conectado!");
          }
        } catch {}
      }, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [status]);

  const saveKiraToken = async () => {
    if (!kiraToken.trim()) return;
    setSavingToken(true);
    try {
      await api.put("/admin/whatsapp/token", { token: kiraToken.trim() });
      toast.success("Token salvo! Iniciando conexao...");
      setHasToken(true);
      setKiraToken("");
      await startQr();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Token invalido");
    } finally {
      setSavingToken(false);
    }
  };

  const startQr = async () => {
    setLoadingQr(true);
    setQr(null);
    try {
      const r = await api.get("/admin/whatsapp/qr");
      setStatus(r.data.status || "initializing");
      if (r.data.qr) setQr(r.data.qr);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao gerar QR code");
    } finally {
      setLoadingQr(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Desconectar WhatsApp?")) return;
    setDisconnecting(true);
    try {
      await api.delete("/admin/whatsapp/disconnect");
      setStatus("disconnected");
      setQr(null);
      setHasToken(false);
      toast.success("WhatsApp desconectado");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao desconectar");
    } finally {
      setDisconnecting(false);
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put("/admin/whatsapp/settings", { notify_statuses: notifyStatuses });
      toast.success("Configuracoes salvas!");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleStatus = (key) =>
    setNotifyStatuses((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );

  const sendTest = async () => {
    if (!testPhone) { toast.warning("Informe um telefone"); return; }
    setTestLoading(true);
    try {
      await api.post("/admin/whatsapp/test", { phone: testPhone });
      toast.success("Mensagem de teste enviada!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao enviar teste");
    } finally {
      setTestLoading(false);
    }
  };

  const isConnected = status === "connected";
  const needsToken  = provider === "kirago" && !hasToken;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display font-bold text-2xl dark:text-white flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-green-500" /> WhatsApp
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Conecte seu numero para notificar clientes automaticamente
          <span className="ml-2 inline-flex items-center gap-1 text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
            {provider === "kirago" ? "Kirago" : "Evolution API"}
          </span>
        </p>
      </div>

      {/* Card de conexao */}
      <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/30">
              <Wifi className="w-4 h-4 text-green-600" />
            </span>
            <div>
              <p className="font-semibold text-sm dark:text-white">Conexao WhatsApp</p>
              <p className="text-xs text-gray-400">Sessao do seu restaurante</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            <button onClick={() => checkStatus()} className="text-gray-400 hover:text-gray-600 ml-1">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">

          {/* Kirago: pede token primeiro */}
          {provider === "kirago" && needsToken && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <Key className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Token Kirago necessario</p>
                  <p className="text-xs text-amber-600 dark:text-amber-300">
                    Crie uma conta em kirago.com.br, copie seu token de usuario e cole abaixo.
                  </p>
                  <a href="https://kirago.com.br/dashboard" target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 underline mt-1">
                    Acessar painel Kirago <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input value={kiraToken} onChange={(e) => setKiraToken(e.target.value)}
                    placeholder="Cole seu token Kirago aqui"
                    className="pl-9 font-mono text-sm dark:bg-[#0D1117] dark:border-gray-700" />
                </div>
                <Button onClick={saveKiraToken} disabled={savingToken || !kiraToken.trim()} className="gap-2 shrink-0">
                  {savingToken ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Salvar
                </Button>
              </div>
            </div>
          )}

          {/* Conectado */}
          {isConnected && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-2xl bg-green-100 dark:bg-green-900/30 grid place-items-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold dark:text-white">WhatsApp conectado!</p>
                <p className="text-sm text-gray-400 mt-1">Notificacoes automaticas ativas para os clientes</p>
              </div>
              <Button variant="outline" onClick={disconnect} disabled={disconnecting}
                className="gap-2 text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20">
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Desconectar
              </Button>
            </div>
          )}

          {/* QR Code */}
          {!isConnected && !needsToken && (
            <div className="flex flex-col items-center gap-4">
              {qr ? (
                <>
                  <div className="bg-white p-3 rounded-2xl shadow-md border border-gray-200 inline-block">
                    <img src={qr} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium dark:text-white">Escaneie com o WhatsApp</p>
                    <p className="text-xs text-gray-400">
                      Abra o WhatsApp &gt; Menu &gt; Aparelhos conectados &gt; Conectar aparelho
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Aguardando escaneamento... (atualiza automaticamente)
                  </div>
                </>
              ) : (
                <div className="text-center space-y-3 py-4">
                  <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 grid place-items-center mx-auto">
                    <MessageCircle className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Clique em "Conectar" para gerar o QR code
                  </p>
                  <Button onClick={startQr} disabled={loadingQr} className="gap-2 bg-green-600 hover:bg-green-700">
                    {loadingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                    Conectar WhatsApp
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Notificacoes por status */}
      <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30">
              <Bell className="w-4 h-4 text-indigo-600" />
            </span>
            <div>
              <p className="font-semibold text-sm dark:text-white">Notificacoes Automaticas</p>
              <p className="text-xs text-gray-500 mt-0.5">Escolha quando o cliente recebe mensagem</p>
            </div>
          </div>
          <Button size="sm" onClick={saveSettings} disabled={savingSettings} className="gap-1.5">
            {savingSettings ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Salvar
          </Button>
        </div>
        <div className="p-6 space-y-3">
          {ALL_STATUSES.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between py-1">
              <label className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none" htmlFor={"toggle-"+key}>
                {label}
              </label>
              <Switch id={"toggle-"+key} checked={notifyStatuses.includes(key)} onCheckedChange={() => toggleStatus(key)} />
            </div>
          ))}
          <div className="flex items-start gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              Mensagens enviadas para o telefone informado pelo cliente no pedido.
            </p>
          </div>
        </div>
      </div>

      {/* Teste */}
      {isConnected && (
        <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                <Send className="w-4 h-4 text-blue-600" />
              </span>
              <div>
                <p className="font-semibold text-sm dark:text-white">Enviar Teste</p>
                <p className="text-xs text-gray-500 mt-0.5">Verifique se o envio esta funcionando</p>
              </div>
            </div>
          </div>
          <div className="p-6 flex gap-3">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="pl-9 dark:bg-[#0D1117] dark:border-gray-700" />
            </div>
            <Button onClick={sendTest} disabled={testLoading || !testPhone} className="gap-2 shrink-0">
              {testLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
