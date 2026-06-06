import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Bell, Wifi, Save, Eye, EyeOff, RefreshCw, Send,
  CheckCircle2, XCircle, Loader2, Info, Zap, MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

function SectionCard({ icon: Icon, title, subtitle, color = "#6366f1", children }) {
  return (
    <div className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
        <span className="grid place-items-center w-9 h-9 rounded-xl shrink-0" style={{ background: color + "22" }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </span>
        <div>
          <p className="font-semibold text-sm dark:text-white">{title}</p>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>}
    </div>
  );
}

function SecretInput({ value, onChange, placeholder, disabled }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-10 font-mono text-sm dark:bg-[#0D1117] dark:border-gray-700 dark:text-gray-200"
      />
      <button type="button" onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function StatusDot({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
      ok ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
         : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
    }`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

export default function PlatformSettings() {
  const [settings, setSettings] = useState({});
  const [wsStats, setWsStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const wsRefresh = useRef(null);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get("/super/platform-settings");
      const raw = res.data || {};
      const clean = {};
      for (const [k, v] of Object.entries(raw)) {
        clean[k] = v === "***" ? "" : v;
      }
      setSettings(clean);
    } catch {
      toast.error("Erro ao carregar configuracoes");
    }
  }, []);

  const loadWsStats = useCallback(async () => {
    try {
      const res = await api.get("/ws/stats");
      setWsStats(res.data);
    } catch {
      setWsStats(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([loadSettings(), loadWsStats()]).finally(() => setLoading(false));
    wsRefresh.current = setInterval(loadWsStats, 10000);
    return () => clearInterval(wsRefresh.current);
  }, [loadSettings, loadWsStats]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {};
      for (const [k, v] of Object.entries(settings)) {
        if (v !== "" && v !== null && v !== undefined) payload[k] = v;
      }
      await api.put("/super/platform-settings", payload);
      toast.success("Configuracoes salvas!");
      await loadSettings();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const testPush = async () => {
    if (!settings.onesignal_app_id) { toast.warning("Configure o OneSignal App ID antes"); return; }
    setTestingPush(true);
    try {
      await api.post("/super/test-push");
      toast.success("Notificacao de teste enviada!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao enviar teste");
    } finally {
      setTestingPush(false);
    }
  };

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  if (loading) return (
    <div className="grid place-items-center py-24">
      <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
    </div>
  );

  const waProvider = settings.wa_provider || "evolution";
  const pushConfigured = !!settings.onesignal_app_id;
  const pushEnabled = settings.push_notifications_enabled !== false && settings.push_notifications_enabled !== "false";

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl dark:text-white">Configuracoes da Plataforma</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Aplicado a todos os restaurantes</p>
        </div>
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar
        </Button>
      </div>

      <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
        <p className="text-xs text-indigo-700 dark:text-indigo-300">
          Configuracoes globais — aplicadas a todos os restaurantes da plataforma automaticamente.
        </p>
      </div>

      {/* WebSocket */}
      <SectionCard icon={Wifi} title="WebSocket — Tempo Real" subtitle="Canal persistente para atualizacoes instantaneas" color="#10b981">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium dark:text-white">Conexoes ativas</p>
            <p className="text-xs text-gray-400">Atualizacao a cada 10s</p>
          </div>
          <button onClick={loadWsStats} className="text-gray-400 hover:text-green-500 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {wsStats ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
              <p className="font-display font-bold text-2xl text-green-600 dark:text-green-400">{wsStats.total_connected}</p>
              <p className="text-xs text-gray-500 mt-0.5">Clientes conectados</p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 text-center">
              <p className="font-display font-bold text-2xl text-green-600 dark:text-green-400">{wsStats.active_rooms}</p>
              <p className="text-xs text-gray-500 mt-0.5">Restaurantes online</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-2">Nenhum cliente conectado agora</p>
        )}
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-[#0D1117] rounded-xl px-3 py-2">
          <Zap className="w-4 h-4 text-green-500 shrink-0" />
          <p className="text-xs text-gray-400">WebSocket sempre ativo — reconecta automaticamente.</p>
        </div>
      </SectionCard>

      {/* WhatsApp Provider */}
      <SectionCard icon={MessageCircle} title="WhatsApp — Provider Global" subtitle="Escolha como os restaurantes enviam mensagens aos clientes" color="#25d366">
        <p className="text-sm font-medium dark:text-white">Provider ativo</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: "evolution", label: "Evolution API", sub: "Self-hosted, gratuito, API key global" },
            { value: "kirago", label: "Kirago", sub: "SaaS externo, cada restaurante usa seu proprio token" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => set("wa_provider")(opt.value)}
              className={`text-left p-4 rounded-xl border-2 transition-all ${
                waProvider === opt.value
                  ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                  : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <p className={`font-semibold text-sm ${waProvider === opt.value ? "text-green-700 dark:text-green-400" : "dark:text-white"}`}>
                {waProvider === opt.value && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5" />}
                {opt.label}
              </p>
              <p className="text-xs text-gray-400 mt-1">{opt.sub}</p>
            </button>
          ))}
        </div>

        {waProvider === "evolution" && (
          <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <p className="text-xs text-gray-400">Evolution API e self-hosted. Configure o container no docker-compose e informe as credenciais abaixo.</p>
            <Field label="Evolution API URL" hint="URL interna do container (ex: http://evolution-api:8080)">
              <Input value={settings.evolution_api_url || ""} onChange={(e) => set("evolution_api_url")(e.target.value)}
                placeholder="http://evolution-api:8080"
                className="font-mono text-sm dark:bg-[#0D1117] dark:border-gray-700 dark:text-gray-200" />
            </Field>
            <Field label="Evolution API Key" hint="Chave definida em AUTHENTICATION_API_KEY no container.">
              <SecretInput value={settings.evolution_api_key || ""} onChange={set("evolution_api_key")} placeholder="menudigital_evo_key" />
            </Field>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p className="font-semibold">Como usar Evolution API</p>
              <p>1. O container evolution-api ja esta no docker-compose.</p>
              <p>2. Cada restaurante escaneia seu QR no painel WhatsApp.</p>
              <p>3. Sessoes ficam salvas no volume evolution_instances.</p>
            </div>
          </div>
        )}

        {waProvider === "kirago" && (
          <div className="space-y-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-xs text-green-700 dark:text-green-300 space-y-1">
              <p className="font-semibold">Como usar Kirago</p>
              <p>1. Cada restaurante cria conta em <strong>kirago.com.br</strong>.</p>
              <p>2. Copia o token de usuario no painel Kirago.</p>
              <p>3. Cola no painel WhatsApp do restaurante (Gestao &gt; WhatsApp).</p>
              <p>4. Escaneia o QR code — pronto!</p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* OneSignal */}
      <SectionCard icon={Bell} title="Notificacoes Push — OneSignal" subtitle="Push nativo em mobile e desktop para todos os restaurantes" color="#f59e0b">
        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium dark:text-white">Ativar notificacoes push</p>
            <p className="text-xs text-gray-400">Desativar silencia push em toda a plataforma</p>
          </div>
          <Switch checked={pushEnabled} onCheckedChange={(v) => set("push_notifications_enabled")(v)} />
        </div>
        <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-4">
          <Field label="OneSignal App ID" hint="Visivel no frontend — inicializa o SDK nos navegadores.">
            <Input value={settings.onesignal_app_id || ""} onChange={(e) => set("onesignal_app_id")(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="font-mono text-sm dark:bg-[#0D1117] dark:border-gray-700 dark:text-gray-200" />
          </Field>
          <Field label="OneSignal REST API Key" hint="Secreta — usada apenas no servidor para enviar notificacoes.">
            <SecretInput value={settings.onesignal_api_key || ""} onChange={set("onesignal_api_key")} placeholder="os2_..." />
          </Field>
        </div>
        <div className="flex items-center justify-between pt-1">
          <StatusDot ok={pushConfigured && pushEnabled} label={!pushConfigured ? "Nao configurado" : !pushEnabled ? "Desativado" : "Ativo"} />
          <Button variant="outline" size="sm" onClick={testPush} disabled={testingPush || !pushConfigured} className="gap-2 dark:border-gray-700 dark:text-gray-300">
            {testingPush ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Enviar teste
          </Button>
        </div>
      </SectionCard>

      <div className="flex justify-end pb-8">
        <Button onClick={save} disabled={saving} size="lg" className="gap-2 min-w-36">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Salvando..." : "Salvar configuracoes"}
        </Button>
      </div>
    </div>
  );
}
