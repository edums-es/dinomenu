import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Package, ArrowUpDown } from "lucide-react";

export default function Stock() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [thresholdEditing, setThresholdEditing] = useState({});

  const load = async () => {
    try {
      const r = await api.get("/admin/stock");
      setItems(r.data);
    } catch {
      toast.error("Erro ao carregar estoque");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const lowStock = items.filter(
    (p) => p.track_stock && p.stock_quantity <= p.low_stock_threshold
  );

  const openAdjust = (item) => {
    setAdjustTarget(item);
    setDelta("");
    setReason("");
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    if (!delta || isNaN(Number(delta))) {
      toast.error("Informe uma quantidade válida");
      return;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo do ajuste");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/admin/stock/${adjustTarget.id}/adjust`, {
        delta: Number(delta),
        reason: reason.trim(),
      });
      toast.success("Estoque ajustado com sucesso");
      setAdjustOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao ajustar estoque");
    } finally {
      setSaving(false);
    }
  };

  const toggleTrack = async (item) => {
    try {
      await api.put(`/admin/stock/${item.id}`, {
        track_stock: !item.track_stock,
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, track_stock: !p.track_stock } : p
        )
      );
      toast.success(
        !item.track_stock ? "Monitoramento ativado" : "Monitoramento desativado"
      );
    } catch {
      toast.error("Erro ao atualizar monitoramento");
    }
  };

  const updateThreshold = async (item, value) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    try {
      await api.put(`/admin/stock/${item.id}`, { low_stock_threshold: num });
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, low_stock_threshold: num } : p
        )
      );
      setThresholdEditing((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      toast.success("Limiar atualizado");
    } catch {
      toast.error("Erro ao atualizar limiar");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Package className="animate-pulse w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Gerenciamento de Estoque
        </h1>
        <Badge variant="outline" className="text-sm">
          {items.length} produtos
        </Badge>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <span className="font-semibold text-red-700 dark:text-red-400">
              {lowStock.length} produto(s) com estoque baixo
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((p) => (
              <Badge
                key={p.id}
                className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-300 dark:border-red-700"
              >
                {p.name}: {p.stock_quantity} restantes
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Produto
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Categoria
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Preço
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Estoque Atual
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Limiar de Alerta
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Monitorado
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isLow =
                  item.track_stock &&
                  item.stock_quantity <= item.low_stock_threshold;
                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors ${
                      isLow
                        ? "bg-red-50/50 dark:bg-red-950/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {isLow && (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-white">
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {item.category_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                      {brl(item.price)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          isLow
                            ? "text-red-600 dark:text-red-400"
                            : "text-gray-900 dark:text-white"
                        }`}
                      >
                        {item.track_stock ? item.stock_quantity : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.track_stock ? (
                        thresholdEditing[item.id] !== undefined ? (
                          <Input
                            type="number"
                            min={0}
                            defaultValue={item.low_stock_threshold}
                            className="w-20 mx-auto text-center h-8 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                            autoFocus
                            onBlur={(e) =>
                              updateThreshold(item, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter")
                                updateThreshold(item, e.target.value);
                              if (e.key === "Escape")
                                setThresholdEditing((prev) => {
                                  const next = { ...prev };
                                  delete next[item.id];
                                  return next;
                                });
                            }}
                          />
                        ) : (
                          <button
                            onClick={() =>
                              setThresholdEditing((prev) => ({
                                ...prev,
                                [item.id]: item.low_stock_threshold,
                              }))
                            }
                            className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 underline decoration-dashed underline-offset-2"
                          >
                            {item.low_stock_threshold}
                          </button>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch
                        checked={!!item.track_stock}
                        onCheckedChange={() => toggleTrack(item)}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAdjust(item)}
                        className="gap-1 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        Ajustar
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-gray-400 dark:text-gray-600"
                  >
                    Nenhum produto encontrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              Ajustar Estoque — {adjustTarget?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="text-center flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Estoque atual
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {adjustTarget?.stock_quantity ?? "—"}
                </p>
              </div>
              {delta && !isNaN(Number(delta)) && (
                <div className="text-center flex-1 border-l border-gray-200 dark:border-gray-700 pl-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Novo estoque
                  </p>
                  <p
                    className={`text-2xl font-bold ${
                      Number(delta) >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {(adjustTarget?.stock_quantity || 0) + Number(delta)}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">
                Delta (use negativo para retirar)
              </Label>
              <Input
                type="number"
                placeholder="Ex: +10 ou -3"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">Motivo</Label>
              <Input
                placeholder="Ex: Inventário, perda, reposição..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustOpen(false)}
              disabled={saving}
              className="dark:border-gray-600 dark:text-gray-200"
            >
              Cancelar
            </Button>
            <Button onClick={submitAdjust} disabled={saving}>
              {saving ? "Salvando..." : "Confirmar Ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
