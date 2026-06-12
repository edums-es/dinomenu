import { useEffect, useState, useCallback, useRef } from "react";
import api, { API } from "@/lib/api";
import { toast } from "sonner";
import {
  MessageCircle, Wifi, WifiOff, RefreshCw, Trash2, Send,
  CheckCircle2, XCircle, Loader2, Info, Bell, Phone, Key, ExternalLink,
  Bot, Copy, Webhook,
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
  const [flemy, setFlemy] = useState({ enabled: false, webhook_url: "", webhook_secret: "", api_token: "", events: [] });
  const [savingFlemy, setSavingFlemy] = useState(false);
  const [testingFlemy, setTestingFlemy] = useState(false);
  const [flemyLogs, setFlemyLogs] = useState([]);
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

  const loadFlemy = useCallback(async () => {
    try {
      const r = await api.get("/integrations/flemy/settings");
      setFlemy((current) => ({ ...current, ...r.data, webhook_secret: "" }));
      const logs = await api.get("/integrations/flemy/logs");
      setFlemyLogs(logs.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    loadProvider();
    checkStatus();
    loadSettings();
    loadFlemy();
  }, [loadProvider, checkStatus, loadSettings, loadFlemy]);

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

  const saveFlemy = async () => {
    setSavingFlemy(true);
    try {
      const { data } = await api.put("/integrations/flemy/settings", flemy);
      setFlemy((current) => ({ ...current, ...data, webhook_secret: "" }));
      toast.success("Integracao Flemy salva!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar Flemy");
    } finally {
      setSavingFlemy(false);
    }
  };

  const testFlemy = async () => {
    setTestingFlemy(true);
    try {
      await api.post("/integrations/flemy/test");
      toast.success("Evento de teste entregue a Flemy!");
      await loadFlemy();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Falha no teste Flemy");
    } finally {
      setTestingFlemy(false);
    }
  };

  const copyText = async (value, message) => {
    await navigator.clipboard.writeText(value);
    toast.success(message);
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

      {/* Flemy CRM */}
      <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/30">
              <Bot className="w-4 h-4 text-violet-600" />
            </span>
            <div>
              <p className="font-semibold text-sm dark:text-white">Flemy CRM / Automacao Plus</p>
              <p className="text-xs text-gray-500 mt-0.5">Pedidos, cancelamentos, ofertas e atendimento inteligente</p>
            </div>
          </div>
          <Switch checked={!!flemy.enabled} onCheckedChange={(enabled) => setFlemy((f) => ({ ...f, enabled }))} />
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 bg-violet-50 dark:bg-violet-900/15 border border-violet-200 dark:border-violet-800 rounded-xl p-4">
            <Webhook className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
            <p className="text-xs text-violet-700 dark:text-violet-300">
              Cole abaixo a URL publica gerada pelo bloco <strong>Receber Webhook</strong> da Flemy. O Dino Menu enviara eventos estruturados e assinados para iniciar seus fluxos.
            </p>
          </div>

          <div>
            <label className="text-sm font-medium dark:text-white block mb-1.5">URL do Receber Webhook Flemy</label>
            <Input value={flemy.webhook_url || ""} onChange={(e) => setFlemy((f) => ({ ...f, webhook_url: e.target.value }))}
              placeholder="https://...webhook..."
              className="font-mono text-xs dark:bg-[#0D1117] dark:border-gray-700" />
          </div>
          <div>
            <label className="text-sm font-medium dark:text-white block mb-1.5">Segredo de assinatura</label>
            <Input type="password" value={flemy.webhook_secret || ""} onChange={(e) => setFlemy((f) => ({ ...f, webhook_secret: e.target.value }))}
              placeholder={flemy.has_webhook_secret ? "Ja configurado - preencha apenas para trocar" : "Crie um segredo forte"}
              className="font-mono text-xs dark:bg-[#0D1117] dark:border-gray-700" />
            <p className="text-xs text-gray-400 mt-1">Enviado no header X-Dino-Signature usando HMAC SHA-256.</p>
          </div>

          <div>
            <p className="text-sm font-medium dark:text-white mb-2">Eventos enviados para a Flemy</p>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                ["order.created", "Pedido criado"],
                ["order.status_changed", "Status alterado"],
                ["order.cancelled", "Pedido cancelado"],
                ["payment.pending", "Pix aguardando"],
                ["payment.paid", "Pagamento confirmado"],
              ].map(([event, label]) => (
                <label key={event} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-800 px-3 py-2 text-sm dark:text-gray-300">
                  {label}
                  <Switch checked={(flemy.events || []).includes(event)} onCheckedChange={() => setFlemy((f) => ({
                    ...f,
                    events: (f.events || []).includes(event) ? f.events.filter((x) => x !== event) : [...(f.events || []), event],
                  }))} />
                </label>
              ))}
            </div>
          </div>

          {flemy.api_token && (
            <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold dark:text-white">Ferramentas para o Agente IA / bloco API</p>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Endpoint POST</label>
                <div className="flex gap-2">
                  <Input readOnly value={`${API.replace(/\/api$/, "")}${flemy.tool_url}`} className="font-mono text-xs dark:bg-[#0D1117] dark:border-gray-700" />
                  <Button variant="outline" size="icon" onClick={() => copyText(`${API.replace(/\/api$/, "")}${flemy.tool_url}`, "Endpoint copiado")}><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Header X-Flemy-Token</label>
                <div className="flex gap-2">
                  <Input readOnly value={flemy.api_token} className="font-mono text-xs dark:bg-[#0D1117] dark:border-gray-700" />
                  <Button variant="outline" size="icon" onClick={() => copyText(flemy.api_token, "Token copiado")}><Copy className="w-4 h-4" /></Button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Acoes disponiveis: get_order_status, get_customer_orders, cancel_order, get_menu, get_offers e get_restaurant_info.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={testFlemy} disabled={testingFlemy || !flemy.enabled} className="gap-2">
              {testingFlemy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Testar
            </Button>
            <Button onClick={saveFlemy} disabled={savingFlemy} className="gap-2">
              {savingFlemy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Salvar Flemy
            </Button>
          </div>

          {flemyLogs.length > 0 && (
            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
              <p className="text-sm font-semibold dark:text-white mb-2">Ultimos eventos</p>
              <div className="space-y-2">
                {flemyLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 dark:bg-[#0D1117] px-3 py-2 text-xs">
                    <span className="font-mono text-gray-600 dark:text-gray-300">{log.event}</span>
                    <span className={log.status === "sent" ? "text-green-500" : "text-red-500"}>
                      {log.status === "sent" ? `Entregue (${log.http_status})` : `Falhou${log.http_status ? ` (${log.http_status})` : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
