import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

const SEVERITY = {
  critical: {
    label: "Critico",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    iconClass: "bg-red-500/10 text-red-500",
  },
  warning: {
    label: "Atencao",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    iconClass: "bg-amber-500/10 text-amber-500",
  },
  info: {
    label: "Info",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    iconClass: "bg-blue-500/10 text-blue-500",
  },
};

const CATEGORY = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  printing: { label: "Impressao", icon: Bell },
  stock: { label: "Estoque", icon: AlertTriangle },
  billing: { label: "Financeiro", icon: ShieldCheck },
  system: { label: "Sistema", icon: Bell },
};

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export default function Alerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState({});
  const [includeResolved, setIncludeResolved] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/alerts", {
        params: { include_resolved: includeResolved, mark_read: true },
        skipCache: true,
      });
      setAlerts(data?.alerts || []);
      setSummary(data?.summary || {});
    } catch {
      toast.error("Erro ao carregar avisos");
    } finally {
      setLoading(false);
    }
  }, [includeResolved]);

  useEffect(() => {
    load();
  }, [load]);

  const resolveAlert = async (alert) => {
    try {
      await api.put(`/admin/alerts/${alert.id}/resolve`);
      toast.success("Aviso resolvido");
      await load();
    } catch {
      toast.error("Erro ao resolver aviso");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold dark:text-white">
            <Bell className="h-6 w-6 text-emerald-500" />
            Avisos operacionais
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Acompanhe problemas que podem afetar pedidos, mensagens e operacao da loja.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setIncludeResolved((v) => !v)}>
            {includeResolved ? "Ocultar resolvidos" : "Mostrar resolvidos"}
          </Button>
          <Button onClick={load} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Ativos" value={summary.active || 0} tone="emerald" />
        <SummaryCard label="Criticos" value={summary.critical || 0} tone="red" />
        <SummaryCard label="Pendentes de leitura" value={summary.unread || 0} tone="amber" />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#111111]">
        {loading ? (
          <div className="grid place-items-center py-16 text-gray-400">
            <RefreshCw className="mb-2 h-5 w-5 animate-spin" />
            Carregando avisos...
          </div>
        ) : alerts.length === 0 ? (
          <div className="grid place-items-center gap-3 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-500">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <div>
              <p className="font-semibold dark:text-white">Nenhum aviso ativo</p>
              <p className="mt-1 text-sm text-gray-500">Quando algo precisar de atencao, aparece aqui.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {alerts.map((alert) => {
              const sev = SEVERITY[alert.severity] || SEVERITY.warning;
              const cat = CATEGORY[alert.category] || CATEGORY.system;
              const Icon = cat.icon;
              const isResolved = alert.status === "resolved";
              return (
                <div key={alert.id} className={`p-4 ${isResolved ? "opacity-65" : ""}`}>
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${sev.iconClass}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-semibold dark:text-white">{alert.title}</h2>
                          <Badge className={sev.className}>{sev.label}</Badge>
                          <Badge variant="outline">{cat.label}</Badge>
                          {isResolved && <Badge variant="outline">Resolvido</Badge>}
                        </div>
                        <p className="mt-1 max-w-3xl text-sm text-gray-500 dark:text-gray-400">{alert.message}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-400">
                          <span>Primeiro aviso: {formatDate(alert.first_seen_at || alert.created_at)}</span>
                          <span>Ultima ocorrencia: {formatDate(alert.last_seen_at)}</span>
                          {(alert.count || 0) > 1 && <span>{alert.count} ocorrencias</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                      {alert.action_url && !isResolved && (
                        <Button
                          size="sm"
                          onClick={() => navigate(alert.action_url)}
                          className="gap-2"
                        >
                          {alert.action_label || "Verificar"}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!isResolved && (
                        <Button size="sm" variant="outline" onClick={() => resolveAlert(alert)}>
                          Resolver
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, tone }) {
  const colors = {
    emerald: "text-emerald-500 bg-emerald-500/10",
    red: "text-red-500 bg-red-500/10",
    amber: "text-amber-500 bg-amber-500/10",
  };
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-[#111111]">
      <span className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${colors[tone] || colors.emerald}`}>
        <Bell className="h-4 w-4" />
      </span>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold dark:text-white">{value}</p>
    </div>
  );
}
