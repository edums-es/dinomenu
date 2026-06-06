import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import {
  Store, ShoppingBag, Users, DollarSign, Loader2, TrendingUp,
  CheckCircle2, XCircle, Activity, RefreshCw,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6"];

function Kpi({ icon: Icon, label, value, sub, color = "#6366f1" }) {
  return (
    <div className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
      <div className="flex items-start justify-between">
        <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: color + "20" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
      <p className="font-display font-extrabold text-2xl mt-3 dark:text-white">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#1E2430] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {p.name === "Receita" ? brl(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function SuperDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [chart, setChart] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [mRes, cRes, aRes] = await Promise.all([
        api.get("/super/metrics"),
        api.get("/super/metrics/chart"),
        api.get("/super/activity"),
      ]);
      setMetrics(mRes.data);
      setChart(cRes.data);
      setActivity(aRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="grid place-items-center py-24">
      <Loader2 className="w-7 h-7 animate-spin text-indigo-400" />
    </div>
  );

  const STATUS_COLOR = {
    pending: "#f59e0b", accepted: "#3b82f6", preparing: "#8b5cf6",
    ready: "#10b981", out_for_delivery: "#06b6d4", completed: "#6b7280", cancelled: "#ef4444",
  };
  const STATUS_LABEL = {
    pending: "Novo", accepted: "Aceito", preparing: "Preparando",
    ready: "Pronto", out_for_delivery: "Em entrega", completed: "Entregue", cancelled: "Cancelado",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl dark:text-white">Visão geral da plataforma</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Últimos 30 dias · Todos os restaurantes</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-500 transition-colors">
          <RefreshCw className="w-4 h-4" /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Store} label="Restaurantes ativos" value={metrics.active} sub={`${metrics.total_restaurants} no total`} color="#6366f1" />
        <Kpi icon={ShoppingBag} label="Pedidos totais" value={metrics.total_orders.toLocaleString("pt-BR")} color="#f59e0b" />
        <Kpi icon={DollarSign} label="GMV total" value={brl(metrics.gmv)} color="#10b981" />
        <Kpi icon={Users} label="Usuários" value={metrics.total_users} color="#3b82f6" />
      </div>

      {/* Status badges */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">{metrics.active} ativos</span>
        </div>
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
          <XCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm font-medium text-red-700 dark:text-red-400">{metrics.suspended} suspensos</span>
        </div>
        {(metrics.plans || []).map((p) => (
          <div key={p.plan} className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-3 py-2">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-400">{p.count}× {p.plan}</span>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
          <p className="font-semibold text-sm dark:text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" /> Receita — 30 dias
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => `R$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="revenue" name="Receita" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
          <p className="font-semibold text-sm dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-500" /> Pedidos — 30 dias
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="orders" name="Pedidos" fill="#f59e0b" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white dark:bg-[#161B22] border border-gray-100 dark:border-gray-800 rounded-2xl p-5">
        <p className="font-semibold text-sm dark:text-white mb-4">Atividade recente — todos os restaurantes</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {activity.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Nenhuma atividade recente</p>}
          {activity.map((o) => (
            <div key={o.id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800 last:border-0">
              <div>
                <p className="text-sm font-medium dark:text-white">#{o.order_number} — {o.restaurant_name}</p>
                <p className="text-xs text-gray-400">{o.customer?.name} · {new Date(o.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold dark:text-white">{brl(o.total)}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: STATUS_COLOR[o.status] || "#6b7280" }}>
                  {STATUS_LABEL[o.status] || o.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
