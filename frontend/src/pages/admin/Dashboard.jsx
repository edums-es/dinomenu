import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { brl, ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from "@/lib/format";
import { Switch } from "@/components/ui/switch";
import {
  ShoppingBag, DollarSign, TrendingUp, Clock, Loader2,
  RefreshCw, ClipboardList, ShoppingCart, XCircle,
  ArrowRight, Users, Package,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar,
} from "recharts";

function Kpi({ icon: Icon, label, value, sub, accent, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 p-5 transition-all ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : ""}`}
    >
      <div className="flex items-start justify-between">
        <span className="grid place-items-center w-10 h-10 rounded-xl" style={{ backgroundColor: `${accent}22`, color: accent }}>
          <Icon className="w-5 h-5" />
        </span>
      </div>
      <p className="font-display font-extrabold text-2xl mt-3 dark:text-white">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
      {sub && <p className="text-xs text-gray-300 dark:text-gray-600 mt-0.5">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#1a1a1a] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {p.name === "Receita" ? brl(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [chart, setChart] = useState([]);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const [dash, chartRes] = await Promise.all([
        api.get("/admin/dashboard"),
        api.get("/admin/reports/daily").catch(() => ({ data: [] })),
      ]);
      setData(dash.data);
      setChart(Array.isArray(chartRes.data) ? chartRes.data.slice(-7) : []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const toggleOpen = async () => {
    await api.post("/admin/restaurant/toggle-open");
    load();
  };

  if (!data) return (
    <div className="grid place-items-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
    </div>
  );

  const cancelRate = data.orders_today > 0
    ? Math.round((data.cancelled_today || 0) / data.orders_today * 100)
    : 0;

  return (
    <div className="space-y-5" data-testid="admin-dashboard">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl dark:text-white">Dashboard</h1>
          <p className="text-sm text-gray-400">Visão geral do seu restaurante hoje</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 border ${data.is_open ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${data.is_open ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
            <span className={`text-sm font-semibold ${data.is_open ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              {data.is_open ? "Loja aberta" : "Loja fechada"}
            </span>
            <Switch checked={data.is_open_manual} onCheckedChange={toggleOpen} data-testid="toggle-open" />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "Ver Pedidos", icon: ClipboardList, path: "/supermaster/pedidos", color: "#6366f1" },
          { label: "Abrir PDV", icon: ShoppingCart, path: "/supermaster/pdv", color: "#10b981" },
          { label: "Produtos", icon: Package, path: "/supermaster/produtos", color: "#f59e0b" },
          { label: "Clientes", icon: Users, path: "/supermaster/clientes", color: "#3b82f6" },
        ].map((a) => (
          <button key={a.path} onClick={() => navigate(a.path)}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111111] hover:border-gray-300 dark:hover:border-gray-600 transition-colors dark:text-gray-300">
            <a.icon className="w-4 h-4" style={{ color: a.color }} />
            {a.label}
            <ArrowRight className="w-3 h-3 text-gray-300" />
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={ShoppingBag} label="Pedidos hoje" value={data.orders_today}
          sub={`${data.in_progress || 0} em andamento`} accent="#3B82F6"
          onClick={() => navigate("/supermaster/pedidos")} />
        <Kpi icon={DollarSign} label="Faturamento hoje" value={brl(data.revenue_today)}
          sub={data.revenue_week ? `Semana: ${brl(data.revenue_week)}` : null} accent="#22C55E" />
        <Kpi icon={TrendingUp} label="Ticket médio" value={brl(data.avg_ticket)} accent="#8B5CF6" />
        <Kpi icon={XCircle} label="Cancelamentos" value={data.cancelled_today || 0}
          sub={`${cancelRate}% dos pedidos`} accent="#EF4444" />
      </div>

      {/* Pending alert */}
      {(data.in_progress || 0) > 0 && (
        <div onClick={() => navigate("/supermaster/pedidos")}
          className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              {data.in_progress} pedido(s) em andamento aguardando ação
            </span>
          </div>
          <ArrowRight className="w-4 h-4 text-amber-600" />
        </div>
      )}

      {/* Charts */}
      {chart.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <p className="font-semibold text-sm dark:text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" /> Receita — últimos 7 dias
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chart}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => v?.slice(5) || v} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => `R$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="revenue" name="Receita" stroke="#22C55E" strokeWidth={2} fill="url(#revGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
            <p className="font-semibold text-sm dark:text-white mb-4 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-indigo-500" /> Pedidos — últimos 7 dias
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickFormatter={v => v?.slice(5) || v} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="orders" name="Pedidos" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bottom panels */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h2 className="font-display font-semibold mb-4 dark:text-white flex items-center justify-between">
            Produtos mais vendidos
            <span className="text-xs font-normal text-gray-400">hoje</span>
          </h2>
          {data.top_products?.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhuma venda ainda</p>
          ) : (
            <div className="space-y-2">
              {(data.top_products || []).map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-6 h-6 grid place-items-center rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-600 dark:text-gray-400 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium dark:text-white truncate">{p.name}</span>
                      <span className="text-sm font-bold text-indigo-500 ml-2">{p.qty}x</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mt-1">
                      <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: `${Math.min(100, (p.qty / ((data.top_products?.[0]?.qty || 1))) * 100)}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#111111] rounded-2xl border border-gray-100 dark:border-gray-800 p-5">
          <h2 className="font-display font-semibold mb-4 dark:text-white flex items-center justify-between">
            Pedidos recentes
            <button onClick={() => navigate("/supermaster/pedidos")} className="text-xs text-indigo-500 hover:underline">Ver todos</button>
          </h2>
          {data.recent_orders?.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">Nenhum pedido ainda</p>
          ) : (
            <div className="space-y-2">
              {(data.recent_orders || []).slice(0, 6).map((o, i) => {
                const sc = ORDER_STATUS_COLORS?.[o.status] || "#6b7280";
                const sl = ORDER_STATUS_LABELS?.[o.status] || o.status;
                return (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 dark:border-gray-800 last:border-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 dark:text-gray-600 shrink-0">#{o.order_number}</span>
                      <span className="text-sm font-medium dark:text-white truncate">{o.customer?.name || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold dark:text-white">{brl(o.total)}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: sc }}>{sl}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
