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
import { Star, Users, Plus, Minus, Save } from "lucide-react";

const DEFAULT_SETTINGS = {
  enabled: false,
  points_per_real: 1,
  min_points_redeem: 100,
  points_to_real: 0.01,
  expiry_days: 365,
};

export default function Loyalty() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [customers, setCustomers] = useState([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  const loadSettings = async () => {
    try {
      const r = await api.get("/admin/loyalty/settings");
      setSettings({ ...DEFAULT_SETTINGS, ...r.data });
    } catch {
      toast.error("Erro ao carregar configurações de fidelidade");
    } finally {
      setLoadingSettings(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const r = await api.get("/admin/loyalty/customers");
      setCustomers(r.data);
    } catch {
      toast.error("Erro ao carregar clientes");
    } finally {
      setLoadingCustomers(false);
    }
  };

  useEffect(() => {
    loadSettings();
    loadCustomers();
  }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      await api.put("/admin/loyalty/settings", {
        ...settings,
        points_per_real: Number(settings.points_per_real),
        min_points_redeem: Number(settings.min_points_redeem),
        points_to_real: Number(settings.points_to_real),
        expiry_days: Number(settings.expiry_days),
      });
      toast.success("Configurações salvas com sucesso");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar configurações");
    } finally {
      setSavingSettings(false);
    }
  };

  const openAdjust = (customer) => {
    setAdjustTarget(customer);
    setAdjustDelta("");
    setAdjustReason("");
    setAdjustOpen(true);
  };

  const submitAdjust = async () => {
    if (!adjustDelta || isNaN(Number(adjustDelta))) {
      toast.error("Informe uma quantidade válida de pontos");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("Informe o motivo do ajuste");
      return;
    }
    setAdjustSaving(true);
    try {
      await api.post("/admin/loyalty/adjust", {
        customer_phone: adjustTarget.phone,
        delta: Number(adjustDelta),
        reason: adjustReason.trim(),
      });
      toast.success("Pontos ajustados com sucesso");
      setAdjustOpen(false);
      loadCustomers();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao ajustar pontos");
    } finally {
      setAdjustSaving(false);
    }
  };

  const setProp = (key, value) =>
    setSettings((s) => ({ ...s, [key]: value }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Programa de Fidelidade
        </h1>
        <Badge
          className={
            settings.enabled
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-300"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          }
        >
          <Star className="w-3.5 h-3.5 mr-1" />
          {settings.enabled ? "Ativo" : "Inativo"}
        </Badge>
      </div>

      {/* Settings Card */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6">
        <h2 className="font-semibold text-lg text-gray-900 dark:text-white mb-5 flex items-center gap-2">
          <Star className="w-5 h-5 text-orange-500" />
          Configurações do Programa
        </h2>

        {loadingSettings ? (
          <div className="animate-pulse space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-gray-800 rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Programa habilitado
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Ativar ou desativar o sistema de fidelidade para todos os clientes
                </p>
              </div>
              <Switch
                checked={settings.enabled}
                onCheckedChange={(v) => setProp("enabled", v)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">
                  Pontos por R$ gasto
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={settings.points_per_real}
                  onChange={(e) => setProp("points_per_real", e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Quantidade de pontos ganhos a cada R$ 1,00
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">
                  Pontos mínimos para resgate
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={settings.min_points_redeem}
                  onChange={(e) => setProp("min_points_redeem", e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Pontos acumulados necessários para poder resgatar
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">
                  Valor de cada ponto (R$)
                </Label>
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  value={settings.points_to_real}
                  onChange={(e) => setProp("points_to_real", e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Ex: 0.01 significa que 100 pontos = R$ 1,00
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="dark:text-gray-200">
                  Expiração de pontos (dias)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.expiry_days}
                  onChange={(e) => setProp("expiry_days", e.target.value)}
                  className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  0 = sem expiração
                </p>
              </div>
            </div>

            {settings.enabled && (
              <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800">
                <p className="text-sm text-orange-700 dark:text-orange-300 font-medium mb-1">
                  Resumo do programa
                </p>
                <ul className="text-sm text-orange-600 dark:text-orange-400 space-y-1 list-disc list-inside">
                  <li>
                    {settings.points_per_real} ponto(s) a cada R$ 1,00 gasto
                  </li>
                  <li>
                    Resgate a partir de {settings.min_points_redeem} pontos
                  </li>
                  <li>
                    {settings.min_points_redeem} pontos ={" "}
                    {brl(
                      Number(settings.min_points_redeem) *
                        Number(settings.points_to_real)
                    )}{" "}
                    de desconto
                  </li>
                  {Number(settings.expiry_days) > 0 && (
                    <li>
                      Pontos expiram em {settings.expiry_days} dias sem uso
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={saveSettings} disabled={savingSettings} className="gap-2">
                <Save className="w-4 h-4" />
                {savingSettings ? "Salvando..." : "Salvar Configurações"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Customers Table */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <h2 className="font-semibold text-lg text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Clientes e Pontos
          </h2>
          <Badge variant="outline">{customers.length} clientes</Badge>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Nome
                </th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Telefone
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Pontos Atuais
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Total Ganho
                </th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Total Resgatado
                </th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingCustomers ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400">
                      <Users className="w-5 h-5 animate-pulse" />
                      Carregando...
                    </div>
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-10 text-center text-gray-400 dark:text-gray-600"
                  >
                    Nenhum cliente com pontos ainda
                  </td>
                </tr>
              ) : (
                customers.map((c) => (
                  <tr
                    key={c.phone}
                    className="border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {c.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {c.phone}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-bold text-orange-600 dark:text-orange-400">
                        {c.points_balance?.toLocaleString("pt-BR")} pts
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {c.total_earned?.toLocaleString("pt-BR")} pts
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                      {c.total_redeemed?.toLocaleString("pt-BR")} pts
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openAdjust(c)}
                        className="gap-1 dark:border-gray-600 dark:text-gray-200"
                      >
                        <Star className="w-3.5 h-3.5" />
                        Ajustar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Modal */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              Ajustar Pontos — {adjustTarget?.name || adjustTarget?.phone}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Saldo atual
              </p>
              <p className="text-3xl font-bold text-orange-500 dark:text-orange-400">
                {adjustTarget?.points_balance?.toLocaleString("pt-BR")}
                <span className="text-base font-normal ml-1">pts</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">
                Pontos (negativo para remover)
              </Label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdjustDelta((v) => String((Number(v) || 0) - 10))}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Minus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </button>
                <Input
                  type="number"
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  placeholder="Ex: +50 ou -20"
                  className="text-center dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                <button
                  onClick={() => setAdjustDelta((v) => String((Number(v) || 0) + 10))}
                  className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Plus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                </button>
              </div>
              {adjustDelta && !isNaN(Number(adjustDelta)) && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  Novo saldo:{" "}
                  <span className="font-bold text-orange-500">
                    {(
                      (adjustTarget?.points_balance || 0) + Number(adjustDelta)
                    ).toLocaleString("pt-BR")}{" "}
                    pts
                  </span>
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">Motivo</Label>
              <Input
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Ex: Bônus de aniversário, correção..."
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAdjustOpen(false)}
              disabled={adjustSaving}
              className="dark:border-gray-600 dark:text-gray-200"
            >
              Cancelar
            </Button>
            <Button onClick={submitAdjust} disabled={adjustSaving}>
              {adjustSaving ? "Salvando..." : "Confirmar Ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
