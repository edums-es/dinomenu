import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { Search, Loader2, TrendingUp, DollarSign, Calendar, BarChart2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const STATUS_CLASS = {
  paid: "bg-green-500/20 text-green-400",
  pending: "bg-yellow-500/20 text-yellow-400",
};
const STATUS_LABEL = { paid: "Pago", pending: "Pendente" };

const MONTHS_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function KpiCard({ icon: Icon, label, value, color = "#6366f1", sub }) {
  return (
    <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
      <div className="w-10 h-10 rounded-xl grid place-items-center mb-3" style={{ background: color + "20" }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <p className="text-2xl font-extrabold text-gray-100">{value}</p>
      <p className="text-sm text-gray-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1E2430] border border-white/10 rounded-xl px-3 py-2 text-xs shadow-lg">
      <p className="font-medium text-gray-300 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {brl(p.value)}</p>
      ))}
    </div>
  );
};

function groupByMonth(invoices) {
  const map = {};
  (invoices || []).forEach(inv => {
    if (!inv.paid_at) return;
    const d = new Date(inv.paid_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map[key] = (map[key] || 0) + (inv.amount || 0);
  });
  const now = new Date();
  const result = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    result.push({ month: MONTHS_PT[d.getMonth()], Receita: map[key] || 0 });
  }
  return result;
}

export default function Billing() {
  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [chartData, setChartData] = useState([]);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (search) params.restaurant_id = search;
      const [sRes, iRes] = await Promise.all([
        api.get("/super/billing/summary"),
        api.get("/super/invoices", { params }),
      ]);
      setSummary(sRes.data);
      setInvoices(iRes.data || []);
      setChartData(groupByMonth(iRes.data || []));
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const thisMonthRevenue = () => {
    const now = new Date();
    return invoices.filter(inv => {
      if (!inv.paid_at || inv.status !== "paid") return false;
      const d = new Date(inv.paid_at);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((acc, inv) => acc + (inv.amount || 0), 0);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Financeiro</h1>
        <p className="text-sm text-gray-400 mt-0.5">Receita, MRR e histórico de faturas</p>
      </div>

      {loading && !summary ? (
        <div className="grid place-items-center py-24"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <KpiCard icon={TrendingUp} label="MRR" value={brl(summary?.mrr || 0)} color="#6366f1" />
            <KpiCard icon={BarChart2} label="ARR" value={brl(summary?.arr || 0)} color="#8b5cf6" />
            <KpiCard icon={DollarSign} label="Receita este mês" value={brl(thisMonthRevenue())} color="#10b981" />
            <KpiCard icon={Calendar} label="Total histórico" value={brl(summary?.total_revenue || 0)} color="#f59e0b" />
            <KpiCard icon={TrendingUp} label="Assinantes ativos" value={summary?.active_subscribers || 0} color="#3b82f6" />
          </div>

          {/* Gráfico */}
          <div className="bg-[#161B22] border border-white/5 rounded-2xl p-5">
            <h2 className="text-base font-bold text-gray-100 mb-4">Receita Mensal — últimos 12 meses</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="month" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={v => brl(v).replace("R$ ", "R$ ")} tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="Receita" stroke="#6366f1" strokeWidth={2.5} dot={{ fill: "#6366f1", r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabela de faturas */}
          <div className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-white/5">
              <h2 className="font-bold text-gray-100">Faturas Recentes</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filtrar por restaurante ID..."
                  className="bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-xl pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500 w-64"
                />
              </div>
            </div>
            {loading ? (
              <div className="grid place-items-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      {["Restaurante", "Valor", "Método", "Data Pagamento", "Status"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {invoices.slice(0, 50).map(inv => (
                      <tr key={inv.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-gray-100">{inv.restaurant?.name || inv.restaurant_id || "—"}</td>
                        <td className="px-4 py-3 text-gray-100 font-medium">{brl(inv.amount)}</td>
                        <td className="px-4 py-3 text-gray-400 capitalize">{inv.payment_method || "—"}</td>
                        <td className="px-4 py-3 text-gray-400">{inv.paid_at ? new Date(inv.paid_at).toLocaleDateString("pt-BR") : "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASS[inv.status] || "bg-gray-500/20 text-gray-400"}`}>
                            {STATUS_LABEL[inv.status] || inv.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {invoices.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-12 text-gray-500">Nenhuma fatura encontrada.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
