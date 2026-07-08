import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Loader2,
  Monitor,
  Printer,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const INSTALLER_URL =
  "https://github.com/edums-es/dinomenu/releases/latest/download/EG-Delivery-Print-Agent.exe";

const STATUS_LABELS = {
  queued: "Aguardando",
  printing: "Enviando",
  printed: "Impresso",
  failed: "Falhou",
  cancelled: "Cancelado",
};

function TriggerOption({ active, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-20 w-full border p-4 text-left transition-colors ${
        active
          ? "border-emerald-500 bg-emerald-500/10"
          : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-[#151515] dark:hover:border-gray-600"
      }`}
    >
      <span className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border ${
            active ? "border-emerald-500 bg-emerald-500 text-black" : "border-gray-400"
          }`}
        >
          {active && <Check className="h-3.5 w-3.5" />}
        </span>
        <span>
          <strong className="block text-sm text-gray-900 dark:text-white">{title}</strong>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{description}</span>
        </span>
      </span>
    </button>
  );
}

export default function PrintingSettings() {
  const [data, setData] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [trigger, setTrigger] = useState("created");
  const [pairingToken, setPairingToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingToken, setLoadingToken] = useState(false);

  const load = async () => {
    try {
      const response = await api.get("/admin/printing", { skipCache: true });
      setData(response.data);
      setEnabled(response.data.enabled);
      setTrigger(response.data.trigger || "created");
    } catch {
      toast.error("Nao foi possivel carregar a impressao");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/admin/printing", { enabled, trigger });
      toast.success(enabled ? "Impressao automatica ativada" : "Impressao automatica desativada");
      await load();
    } catch (error) {
      toast.error(error.response?.data?.detail || "Falha ao salvar a impressao");
    } finally {
      setSaving(false);
    }
  };

  const generateToken = async () => {
    setLoadingToken(true);
    try {
      const response = await api.post("/admin/printing/pairing-token");
      setPairingToken(response.data.pairing_token);
      toast.success("Novo token gerado");
      await load();
    } catch {
      toast.error("Falha ao gerar o token");
    } finally {
      setLoadingToken(false);
    }
  };

  const copyToken = async () => {
    await navigator.clipboard.writeText(pairingToken);
    toast.success("Token copiado");
  };

  const revoke = async (agentId) => {
    try {
      await api.post(`/admin/printing/agents/${agentId}/revoke`);
      toast.success("Computador desvinculado");
      await load();
    } catch {
      toast.error("Falha ao desvincular");
    }
  };

  const retry = async (jobId) => {
    try {
      await api.post(`/admin/printing/jobs/${jobId}/retry`);
      toast.success("Impressao devolvida para a fila");
      await load();
    } catch {
      toast.error("Falha ao tentar novamente");
    }
  };

  if (!data) {
    return (
      <div className="grid min-h-72 place-items-center border border-gray-200 bg-white dark:border-gray-700 dark:bg-[#111111]">
        <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#111111]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center bg-emerald-500/10 text-emerald-500">
              <Printer className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold text-gray-900 dark:text-white">
                Impressao automatica
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                O servidor guarda cada pedido ate o computador confirmar a impressao.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-3 border border-gray-200 px-4 py-3 dark:border-gray-700">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span>
              <strong className="block text-sm text-gray-900 dark:text-white">
                {enabled ? "Ativada" : "Desativada"}
              </strong>
              <span className="block text-xs text-gray-500">Para esta loja</span>
            </span>
          </label>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Quando imprimir</p>
          <div className="grid gap-3 md:grid-cols-2">
            <TriggerOption
              active={trigger === "created"}
              title="Automatico, quando entrar"
              description="Imprime assim que o pedido confirmado chega ao painel."
              onClick={() => setTrigger("created")}
            />
            <TriggerOption
              active={trigger === "accepted"}
              title="Depois que aceitar"
              description="Imprime somente quando a equipe aceitar o pedido."
              onClick={() => setTrigger("accepted")}
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={save} disabled={saving} className="bg-emerald-500 text-black hover:bg-emerald-400">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Salvar impressao
          </Button>
        </div>
      </section>

      <section className="border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#111111]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-500" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Vincular o aplicativo</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No aplicativo, entre com sua conta EG Delivery e digite este token.
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={generateToken} disabled={loadingToken}>
            {loadingToken ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {data.has_pairing_token ? "Gerar novo token" : "Gerar token"}
          </Button>
        </div>

        {pairingToken ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border border-emerald-500/50 bg-emerald-500/10 p-4">
            <code className="text-xl font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
              {pairingToken}
            </code>
            <Button variant="outline" size="sm" onClick={copyToken}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar
            </Button>
            <p className="w-full text-xs text-gray-500 dark:text-gray-400">
              Por seguranca, este token aparece somente agora. Gere outro caso perca.
            </p>
          </div>
        ) : data.has_pairing_token ? (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            Token configurado, final {data.pairing_token_hint}. Gere um novo para vincular outro computador.
          </p>
        ) : null}
      </section>

      <section className="border border-emerald-500/40 bg-emerald-500/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-3">
            <Download className="mt-0.5 h-5 w-5 text-emerald-500" />
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Aplicativo Windows</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Baixe um unico arquivo, abra no computador da impressora e deixe ativo.
              </p>
            </div>
          </div>
          <Button asChild className="bg-emerald-500 text-black hover:bg-emerald-400">
            <a href={INSTALLER_URL}>
              <Download className="mr-2 h-4 w-4" />
              Baixar para Windows
            </a>
          </Button>
        </div>
      </section>

      <section className="border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#111111]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Computadores vinculados</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              O horario abaixo mostra a ultima comunicacao recebida.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={load} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        {data.agents.length === 0 ? (
          <div className="border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">
            Nenhum computador vinculado.
          </div>
        ) : (
          <div className="divide-y divide-gray-200 border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {data.agents.map((agent) => (
              <div key={agent.id} className="flex flex-wrap items-center gap-3 p-3">
                <Monitor className="h-5 w-5 text-gray-400" />
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-gray-900 dark:text-white">{agent.device_name}</strong>
                  <span className="block truncate text-xs text-gray-500">
                    {agent.printer_name || "Impressora ainda nao selecionada"} · v{agent.app_version || "-"}
                  </span>
                </div>
                <span className="text-xs text-gray-500">
                  {agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleString("pt-BR") : "Sem comunicacao"}
                </span>
                <Button variant="ghost" size="sm" onClick={() => revoke(agent.id)}>
                  <Unplug className="mr-2 h-4 w-4" />
                  Desvincular
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#111111]">
        <h3 className="font-semibold text-gray-900 dark:text-white">Ultimas impressoes</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-700">
              <tr>
                <th className="pb-2 font-medium">Pedido</th>
                <th className="pb-2 font-medium">Gatilho</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Tentativas</th>
                <th className="pb-2 font-medium">Erro</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.recent_jobs.map((job) => (
                <tr key={job.id}>
                  <td className="py-3 font-semibold text-gray-900 dark:text-white">#{job.order_number}</td>
                  <td className="py-3 text-gray-500">{job.event === "accepted" ? "Apos aceitar" : "Automatico"}</td>
                  <td className="py-3 text-gray-700 dark:text-gray-300">{STATUS_LABELS[job.status] || job.status}</td>
                  <td className="py-3 text-gray-500">{job.attempts || 0}</td>
                  <td className="max-w-64 truncate py-3 text-xs text-red-500">{job.last_error || "-"}</td>
                  <td className="py-3 text-right">
                    {job.status === "failed" && (
                      <Button variant="ghost" size="sm" onClick={() => retry(job.id)}>
                        Tentar novamente
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recent_jobs.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">Nenhuma impressao registrada.</p>
          )}
        </div>
      </section>
    </div>
  );
}
