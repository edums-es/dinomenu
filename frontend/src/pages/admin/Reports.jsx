import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { TrendingUp, ShoppingBag, AlertCircle } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

const PALETTE = ["#D4AF37", "#B8860B", "#10b981", "#6b7280", "#E5E5E5", "#8b7536"];

const PERIODS = [
  { value: "today", label: "Hoje" },
  { value: "7d",    label: "7 dias" },
  { value: "30d",   label: "30 dias" },
  { value: "90d",   label: "90 dias" },
];

function StatCard({ icon: Icon, label, value, sub, color = "gold" }) {
  const colorMap = {
    gold:  "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400",
    green: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
    amber: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
    red:   "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
  };
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
        </div>
        <div className={`p-2.5 rounded-lg ${colorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

const chartTooltipStyle = {
  backgroundColor: "var(--tooltip-bg, #1f2937)",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#f9fafb",
};

const ordersOf = (data) => data?.orders || [];
const activeOrdersOf = (data) => ordersOf(data).filter((o) => o.status !== "cancelled");
const orderTotal = (order) => Number(order?.total || 0);
const itemTotal = (item) => {
  if (item?.total_price != null) return Number(item.total_price) || 0;
  if (item?.price != null) return (Number(item.price) || 0) * (Number(item.quantity) || 1);
  return (Number(item?.unit_price) || 0) * (Number(item?.quantity) || 1);
};
const customerPhone = (order) => (order.customer?.phone || order.customer_phone || "").replace(/\D/g, "");

function OverviewTab({ data, period, setPeriod }) {
  if (!data) return null;

  const orders = ordersOf(data);
  const activeOrders = activeOrdersOf(data);
  const totalOrders = orders.length;
  const validOrders = activeOrders.length;
  const totalRevenue = activeOrders.reduce((s, o) => s + orderTotal(o), 0);
  const avgTicket = validOrders > 0 ? totalRevenue / validOrders : 0;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const cancelRate = totalOrders > 0 ? ((cancelled / totalOrders) * 100).toFixed(1) : 0;

  // Agrupar por dia
  const dayMap = {};
  orders.forEach((o) => {
    const d = (o.created_at || "").slice(0, 10);
    if (!d) return;
    if (!dayMap[d]) dayMap[d] = { date: d, revenue: 0, orders: 0 };
    if (o.status !== "cancelled") {
      dayMap[d].revenue += orderTotal(o);
      dayMap[d].orders += 1;
    }
  });
  const dailyData = Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({
    ...r,
    label: new Date(r.date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  }));

  return (
    <div className="space-y-6">
      <div className="flex gap-2 flex-wrap">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            style={period === p.value ? {background:"#D4AF37",color:"#0B0B0F"} : {}}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.value
                ? "border border-transparent"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-[#D4AF37]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard icon={ShoppingBag} label="Pedidos validos" value={validOrders} sub={`${totalOrders} no total`} color="gold" />
        <StatCard icon={TrendingUp} label="Receita total" value={brl(totalRevenue)} color="green" />
        <StatCard icon={TrendingUp} label="Ticket médio" value={brl(avgTicket)} color="amber" />
        <StatCard icon={AlertCircle} label="Taxa de cancelamento" value={`${cancelRate}%`} sub={`${cancelled} pedidos`} color="red" />
      </div>

      {dailyData.length > 0 && (
        <>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Receita por dia</h3>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => `R$${v}`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [brl(v), "Receita"]} />
                <Line type="monotone" dataKey="revenue" stroke={PALETTE[0]} strokeWidth={2} dot={{ fill: PALETTE[0], r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Pedidos por dia</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" />
                <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="orders" fill={PALETTE[2]} radius={[4, 4, 0, 0]} name="Pedidos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function ProductsTab({ data }) {
  if (!data) return null;

  const productMap = {};
  (data.orders || []).forEach((o) => {
    if (o.status === "cancelled") return;
    (o.items || []).forEach((item) => {
      const name = item.product_name || item.name || "Desconhecido";
      if (!productMap[name]) productMap[name] = { name, quantity: 0, revenue: 0 };
      productMap[name].quantity += item.quantity || 1;
      productMap[name].revenue += itemTotal(item);
    });
  });

  const sorted = Object.values(productMap).sort((a, b) => b.quantity - a.quantity).slice(0, 10);
  const sortedRevenue = Object.values(productMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Top 10 mais vendidos (quantidade)</h3>
        {sorted.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Sem dados disponíveis</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sorted} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} horizontal={false} />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} stroke="#6b7280" width={120} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [v, "Unidades"]} />
              <Bar dataKey="quantity" fill={PALETTE[0]} radius={[0, 4, 4, 0]} name="Quantidade" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Top 10 por receita</h3>
        {sortedRevenue.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Sem dados disponíveis</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedRevenue} layout="vertical" margin={{ left: 10, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} horizontal={false} />
              <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => `R$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} stroke="#6b7280" width={120} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [brl(v), "Receita"]} />
              <Bar dataKey="revenue" fill={PALETTE[2]} radius={[0, 4, 4, 0]} name="Receita" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function CustomersTab({ data }) {
  if (!data) return null;

  const customerMap = {};
  (data.orders || []).forEach((o) => {
    if (o.status === "cancelled") return;
    const cid = customerPhone(o);
    const name = o.customer_name || o.customer?.name || "Anônimo";
    if (!cid) return;
    if (!customerMap[cid]) customerMap[cid] = { id: cid, name, orders: 0, revenue: 0, firstOrder: o.created_at };
    customerMap[cid].orders += 1;
    customerMap[cid].revenue += orderTotal(o);
    if (o.created_at < customerMap[cid].firstOrder) customerMap[cid].firstOrder = o.created_at;
  });

  const allCustomers = Object.values(customerMap);
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  const newCustomers = allCustomers.filter((c) => new Date(c.firstOrder) >= cutoff).length;
  const recurring = allCustomers.filter((c) => c.orders > 1).length;

  const pieData = [
    { name: "Novos (30d)", value: newCustomers },
    { name: "Recorrentes", value: recurring },
    { name: "Únicos", value: Math.max(0, allCustomers.length - newCustomers - recurring) },
  ].filter((d) => d.value > 0);

  const topCustomers = [...allCustomers].sort((a, b) => b.orders - a.orders).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Novos vs Recorrentes</h3>
          {pieData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Sem dados disponíveis</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {pieData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Resumo de clientes</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total de clientes únicos</span>
              <span className="font-semibold text-gray-900 dark:text-white">{allCustomers.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-600 dark:text-gray-400">Novos (últimos 30 dias)</span>
              <span className="font-semibold text-green-600">{newCustomers}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">Recorrentes (mais de 1 pedido)</span>
              <span className="font-semibold" style={{color:"#D4AF37"}}>{recurring}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">Top 10 clientes por pedidos</h3>
        </div>
        {topCustomers.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Sem dados disponíveis</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">#</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Cliente</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Pedidos</th>
                <th className="text-right py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Gasto total</th>
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c, i) => (
                <tr key={c.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                  <td className="py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">{i + 1}</td>
                  <td className="py-3 px-4 text-gray-900 dark:text-white">{c.name}</td>
                  <td className="py-3 px-4 text-right text-gray-700 dark:text-gray-300">{c.orders}</td>
                  <td className="py-3 px-4 text-right font-semibold text-green-600">{brl(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FinancialTab({ data }) {
  if (!data) return null;

  const orders = ordersOf(data);
  const activeOrders = activeOrdersOf(data);
  const grossRevenue = activeOrders.reduce((sum, o) => sum + orderTotal(o), 0);
  const deliveryFees = activeOrders.reduce((sum, o) => sum + Number(o.delivery_fee || 0), 0);
  const discounts = activeOrders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
  const cancelledRevenue = orders.filter((o) => o.status === "cancelled").reduce((sum, o) => sum + orderTotal(o), 0);

  // Por forma de pagamento
  const paymentMap = {};
  (data.orders || []).forEach((o) => {
    if (o.status === "cancelled") return;
    const method = o.payment_method || "Outros";
    if (!paymentMap[method]) paymentMap[method] = { name: method, value: 0 };
    paymentMap[method].value += orderTotal(o);
  });
  const paymentData = Object.values(paymentMap);

  // Delivery vs retirada
  const deliveryMap = { delivery: 0, pickup: 0 };
  (data.orders || []).forEach((o) => {
    if (o.status === "cancelled") return;
    if (o.order_type === "pickup" || o.type === "pickup") deliveryMap.pickup += orderTotal(o);
    else deliveryMap.delivery += orderTotal(o);
  });
  const deliveryData = [
    { name: "Delivery", value: deliveryMap.delivery },
    { name: "Retirada", value: deliveryMap.pickup },
  ];

  // Mês atual vs mês anterior
  const now = new Date();
  const curMonth = now.toISOString().slice(0, 7);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);
  let curRevenue = 0, prevRevenue = 0;
  (data.orders || []).forEach((o) => {
    if (o.status === "cancelled") return;
    const month = (o.created_at || "").slice(0, 7);
    if (month === curMonth) curRevenue += orderTotal(o);
    else if (month === prevMonth) prevRevenue += orderTotal(o);
  });
  const compareData = [
    { name: "Mês anterior", value: prevRevenue },
    { name: "Mês atual", value: curRevenue },
  ];

  const PAYMENT_LABELS = {
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    cash: "Dinheiro",
    pix: "PIX",
    online: "Online",
  };

  const formatPayment = (key) => PAYMENT_LABELS[key] || key;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={TrendingUp} label="Receita confirmada" value={brl(grossRevenue)} color="green" />
        <StatCard icon={ShoppingBag} label="Taxas de entrega" value={brl(deliveryFees)} color="gold" />
        <StatCard icon={TrendingUp} label="Descontos dados" value={brl(discounts)} color="amber" />
        <StatCard icon={AlertCircle} label="Valor cancelado" value={brl(cancelledRevenue)} color="red" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Receita por forma de pagamento</h3>
          {paymentData.length === 0 ? (
            <p className="text-gray-400 text-center py-8">Sem dados</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={paymentData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name">
                  {paymentData.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v, n) => [brl(v), formatPayment(n)]} />
                <Legend formatter={formatPayment} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Delivery vs Retirada</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deliveryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" />
              <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => `R$${v}`} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [brl(v), "Receita"]} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {deliveryData.map((_, i) => <Cell key={i} fill={PALETTE[i]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Comparativo mensal</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={compareData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} stroke="#6b7280" tickFormatter={(v) => `R$${v}`} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [brl(v), "Receita"]} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {compareData.map((_, i) => <Cell key={i} fill={PALETTE[i * 2]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Mês anterior</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{brl(prevRevenue)}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">Mês atual</p>
            <p className="text-xl font-bold" style={{color:"#D4AF37"}}>{brl(curRevenue)}</p>
            {prevRevenue > 0 && (
              <p className={`text-xs mt-0.5 ${curRevenue >= prevRevenue ? "text-green-500" : "text-red-500"}`}>
                {curRevenue >= prevRevenue ? "+" : ""}{(((curRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1)}% vs anterior
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Visão Geral" },
  { key: "products", label: "Produtos" },
  { key: "customers", label: "Clientes" },
  { key: "financial", label: "Financeiro" },
];

export default function Reports() {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("7d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/reports?period=${period}`);
      setData(res.data);
    } catch {
      toast.error("Erro ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Relatórios</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Análise de desempenho do estabelecimento</p>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? "border-[#D4AF37] text-[#D4AF37]"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{borderColor:"#D4AF37"}}></div>
        </div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab data={data} period={period} setPeriod={(p) => { setPeriod(p); }} />}
          {tab === "products" && <ProductsTab data={data} />}
          {tab === "customers" && <CustomersTab data={data} />}
          {tab === "financial" && <FinancialTab data={data} />}
        </>
      )}
    </div>
  );
}
