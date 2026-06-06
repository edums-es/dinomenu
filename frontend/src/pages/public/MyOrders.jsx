import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { brl } from "@/lib/format";
import { cacheRestaurant, getCachedRestaurant } from "@/lib/publicRestaurantCache";
import {
  Phone, Search, Clock, CheckCircle2, ChefHat, Package,
  Bike, Star, XCircle, Loader2, ChevronRight, Store,
  ShoppingBag, RefreshCw, ArrowLeft,
} from "lucide-react";

const STATUS_LABEL = {
  pending:          { label: "Aguardando",  color: "bg-amber-500/20 text-amber-300 border border-amber-500/30",   icon: Clock },
  accepted:         { label: "Aceito",      color: "bg-blue-500/20 text-blue-300 border border-blue-500/30",     icon: CheckCircle2 },
  preparing:        { label: "Em preparo",  color: "bg-orange-500/20 text-orange-300 border border-orange-500/30", icon: ChefHat },
  ready:            { label: "Pronto",      color: "bg-purple-500/20 text-purple-300 border border-purple-500/30", icon: Package },
  out_for_delivery: { label: "A caminho",   color: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30", icon: Bike },
  completed:        { label: "Entregue",    color: "bg-green-500/20 text-green-300 border border-green-500/30",   icon: Star },
  cancelled:        { label: "Cancelado",   color: "bg-red-500/20 text-red-400 border border-red-500/30",         icon: XCircle },
};

function maskPhone(value) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2)  return d;
  if (d.length <= 7)  return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return value;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function OrderCard({ order, primary }) {
  const info = STATUS_LABEL[order.status] || STATUS_LABEL.pending;
  const Icon = info.icon;
  const isActive = !["completed","cancelled"].includes(order.status);

  return (
    <Link
      to={`/pedido/${order.id}`}
      className="block rounded-2xl overflow-hidden transition-all hover:scale-[1.01]"
      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)" }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-white text-base truncate">
              Pedido #{order.order_number}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{order.restaurant_name}</p>
          </div>
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${info.color}`}>
            <Icon className="w-3 h-3" />
            {info.label}
          </span>
        </div>

        {/* Items preview */}
        {order.items && order.items.length > 0 && (
          <p className="text-sm text-gray-300 truncate mb-2.5">
            {order.items.slice(0, 2).map(it => `${it.quantity}x ${it.product_name}`).join(", ")}
            {order.items.length > 2 && ` +${order.items.length - 2}`}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">{formatDate(order.created_at)}</p>
            <p className="font-bold text-white text-sm mt-0.5">{brl(order.total)}</p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <span className="text-xs font-semibold px-3 py-1.5 rounded-full text-white"
                style={{ background: primary }}>
                Acompanhar
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </div>
        </div>
      </div>

      {/* Active progress bar */}
      {isActive && (
        <div className="h-1" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="h-full transition-all duration-700"
            style={{
              background: primary,
              width: {
                pending: "10%", accepted: "25%", preparing: "50%",
                ready: "75%", out_for_delivery: "90%",
              }[order.status] || "0%",
            }}
          />
        </div>
      )}
    </Link>
  );
}

export default function MyOrders() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const [inputPhone, setInputPhone] = useState(maskPhone(searchParams.get("phone") || ""));
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [restaurant, setRestaurant] = useState(() => getCachedRestaurant(slug));
  const inputRef = useRef(null);

  const primary = restaurant?.primary_color || "#6B7280";

  // Carrega apenas a identidade visual; o cardapio completo seria muito mais pesado.
  useEffect(() => {
    if (!slug) return;
    axios.get(`${API}/public/restaurants/${slug}/identity`)
      .then(({ data }) => {
        setRestaurant(data);
        cacheRestaurant(slug, data);
      })
      .catch(() => {});
  }, [slug]);

  const search = async (rawPhone) => {
    const clean = rawPhone.replace(/\D/g, "");
    if (clean.length < 8) {
      setError("Digite um número de telefone válido.");
      return;
    }
    setError("");
    setLoading(true);
    setSearched(false);
    try {
      const params = { phone: clean };
      if (slug) params.slug = slug;
      const { data } = await axios.get(`${API}/public/track`, { params });
      setOrders(data);
      setSearched(true);
    } catch {
      setError("Erro ao buscar pedidos. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-search se phone vier na URL
  useEffect(() => {
    const urlPhone = searchParams.get("phone");
    if (urlPhone && urlPhone.replace(/\D/g, "").length >= 8) {
      search(urlPhone);
    }
  }, []);  // eslint-disable-line

  const handleSubmit = (e) => {
    e.preventDefault();
    search(inputPhone);
  };

  const active = orders.filter(o => !["completed","cancelled"].includes(o.status));
  const past   = orders.filter(o =>  ["completed","cancelled"].includes(o.status));

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0A" }}>
      {/* Header */}
      <div className="px-4 pt-10 pb-6 text-center" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="max-w-md mx-auto">
          {restaurant?.logo_url
            ? <img src={restaurant.logo_url} alt={restaurant.name}
                loading="eager" decoding="async" fetchPriority="high"
                className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 shadow-lg" />
            : (
              <div className="w-16 h-16 rounded-2xl mx-auto mb-3 grid place-items-center"
                style={{ background: `${primary}25`, border: `1px solid ${primary}40` }}>
                <ShoppingBag className="w-8 h-8" style={{ color: primary }} />
              </div>
            )
          }
          <h1 className="font-display font-bold text-2xl text-white">
            {restaurant?.name ? `Pedidos · ${restaurant.name}` : "Meus Pedidos"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Digite seu telefone para ver seus pedidos
          </p>
          {slug && (
            <Link to={`/loja/${slug}`}
              className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao cardápio
            </Link>
          )}
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-5">
        {/* Search form */}
        <form onSubmit={handleSubmit} className="rounded-2xl p-4 space-y-3"
          style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.1)" }}>
          <label className="block text-sm font-semibold text-gray-200">
            Número de telefone
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                ref={inputRef}
                type="tel"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                value={inputPhone}
                onChange={(e) => setInputPhone(maskPhone(e.target.value))}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm text-white placeholder-gray-600 outline-none"
                style={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)" }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-semibold text-sm transition-opacity disabled:opacity-60"
              style={{ background: primary }}
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Search className="w-4 h-4" />}
              Buscar
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
          </div>
        )}

        {/* Results */}
        {!loading && searched && (
          <>
            {orders.length === 0 ? (
              <div className="text-center py-12">
                <Store className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="font-semibold text-gray-300">Nenhum pedido encontrado</p>
                <p className="text-sm text-gray-500 mt-1">
                  Verifique o número digitado ou faça seu primeiro pedido!
                </p>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-300">
                    {orders.length} pedido{orders.length !== 1 ? "s" : ""} encontrado{orders.length !== 1 ? "s" : ""}
                  </p>
                  <button
                    onClick={() => search(inputPhone)}
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" /> Atualizar
                  </button>
                </div>

                {/* Active orders */}
                {active.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: primary }}>
                      Em andamento ({active.length})
                    </p>
                    {active.map(o => (
                      <OrderCard key={o.id} order={o} primary={primary} />
                    ))}
                  </div>
                )}

                {/* Past orders */}
                {past.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Histórico ({past.length})
                    </p>
                    {past.map(o => (
                      <OrderCard key={o.id} order={o} primary={primary} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {!searched && !loading && (
          <div className="text-center py-10">
            <p className="text-sm text-gray-500">
              Digite seu telefone acima para consultar seus pedidos
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
