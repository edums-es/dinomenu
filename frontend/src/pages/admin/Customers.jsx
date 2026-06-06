import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, Search, Phone, ShoppingBag, Star, ChevronLeft, ChevronRight } from "lucide-react";

const ORDER_STATUS_LABELS = {
  pending: "Novo",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu p/ entrega",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

const ORDER_STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  accepted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  preparing: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  out_for_delivery: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 300);
  const pageSize = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get("/admin/customers", {
        params: { search: debouncedSearch || undefined, page },
      });
      if (Array.isArray(r.data)) {
        setCustomers(r.data);
        setTotal(r.data.length);
      } else {
        setCustomers(r.data.items || r.data.customers || []);
        setTotal(r.data.total || 0);
      }
    } catch {
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const openHistory = async (customer) => {
    setSelectedCustomer(customer);
    setHistoryOpen(true);
    setOrdersLoading(true);
    try {
      const r = await api.get(`/admin/customers/${customer.phone}/orders`);
      setOrders(r.data);
    } catch {
      toast.error("Erro ao carregar histórico");
    } finally {
      setOrdersLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white flex items-center gap-2">
          <Users className="w-6 h-6 text-blue-500" />
          Clientes
        </h1>
        <Badge variant="outline">{total} clientes</Badge>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone..."
          className="pl-9 max-w-md dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500"
        />
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Nome
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Telefone
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Pedidos
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Total Gasto
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Ticket Médio
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Pontos
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Último Pedido
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <Users className="w-5 h-5 animate-pulse" />
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gray-400 dark:text-gray-600"
                  >
                    {search ? "Nenhum cliente encontrado para esta busca" : "Nenhum cliente cadastrado"}
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const avgTicket =
                    c.order_count > 0 ? c.total_spent / c.order_count : 0;
                  return (
                    <tr
                      key={c.phone}
                      onClick={() => openHistory(c)}
                      className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-white">
                          {c.name || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {c.phone}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 text-gray-700 dark:text-gray-300">
                          <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                          {c.order_count || 0}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                        {brl(c.total_spent || 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-400">
                        {brl(avgTicket)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.loyalty_points != null ? (
                          <div className="flex items-center justify-end gap-1 text-orange-600 dark:text-orange-400 font-semibold">
                            <Star className="w-3.5 h-3.5" />
                            {c.loyalty_points.toLocaleString("pt-BR")}
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                        {c.last_order_at
                          ? new Date(c.last_order_at).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Página {page} de {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="dark:border-gray-600 dark:text-gray-200"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="dark:border-gray-600 dark:text-gray-200"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* History Modal */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl dark:bg-gray-900 dark:border-gray-700 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              {selectedCustomer?.name || selectedCustomer?.phone}
            </DialogTitle>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pedidos</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedCustomer.order_count || 0}
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Gasto</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    {brl(selectedCustomer.total_spent || 0)}
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Ticket Médio</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {selectedCustomer.order_count > 0
                      ? brl(selectedCustomer.total_spent / selectedCustomer.order_count)
                      : "—"}
                  </p>
                </div>
                <div className="text-center p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Pontos</p>
                  <p className="text-xl font-bold text-orange-500 dark:text-orange-400">
                    {selectedCustomer.loyalty_points?.toLocaleString("pt-BR") || 0}
                  </p>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-gray-500" />
                  Histórico de Pedidos
                </h3>

                {ordersLoading ? (
                  <div className="flex items-center justify-center py-10 text-gray-400">
                    <ShoppingBag className="w-5 h-5 animate-pulse mr-2" />
                    Carregando pedidos...
                  </div>
                ) : orders.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-600 text-center py-8">
                    Nenhum pedido encontrado
                  </p>
                ) : (
                  <div className="space-y-2">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40"
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              #{order.order_number || order.id}
                            </p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              {order.created_at
                                ? new Date(order.created_at).toLocaleDateString("pt-BR", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge
                            className={
                              ORDER_STATUS_COLORS[order.status] ||
                              "bg-gray-100 text-gray-600"
                            }
                          >
                            {ORDER_STATUS_LABELS[order.status] || order.status}
                          </Badge>
                          <span className="font-semibold text-gray-900 dark:text-white text-sm">
                            {brl(order.total || 0)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
