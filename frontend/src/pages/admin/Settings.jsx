import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { brl, WEEKDAYS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ImageUpload from "@/components/admin/ImageUpload";
import PrintingSettings from "@/components/admin/PrintingSettings";
import { Loader2, Save, Copy, Check } from "lucide-react";
import { API } from "@/lib/api";

const PAYMENT_OPTIONS = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Vale refeição"];

function WebhookUrlCopy({ url }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };
  return (
    <div className="flex gap-2 items-center">
      <code className="flex-1 text-xs bg-black/10 dark:bg-black/30 rounded px-2 py-1.5 truncate select-all dark:text-green-400 text-green-700">
        {url}
      </code>
      <button onClick={copy} className="shrink-0 flex items-center gap-1 text-xs px-2 py-1.5 rounded border dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
/* shared panel class */
const PANEL = "bg-white dark:bg-[#111111] rounded-2xl border border-gray-200 dark:border-gray-700 p-5";

export default function Settings() {
  const [r, setR] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get("/admin/restaurant").then((res) => setR(res.data)); }, []);

  const set = (patch) => setR((p) => ({ ...p, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: r.name, description: r.description, tagline: r.tagline,
        logo_url: r.logo_url, cover_url: r.cover_url, whatsapp: r.whatsapp,
        phone: r.phone, address: r.address, city: r.city, state: r.state,
        primary_color: r.primary_color, secondary_color: r.secondary_color,
        button_text_color: r.button_text_color,
        menu_text_color: r.menu_text_color,
        menu_muted_text_color: r.menu_muted_text_color,
        minimum_order: Number(r.minimum_order) || 0, average_delivery_time: r.average_delivery_time,
        accepts_delivery: r.accepts_delivery, accepts_pickup: r.accepts_pickup,
        flat_delivery_fee: Number(r.flat_delivery_fee) || 0,
        quantity_discount_min_items: Number(r.quantity_discount_min_items) || 0,
        quantity_discount_percent: Number(r.quantity_discount_percent) || 0,
        payment_methods: r.payment_methods,
        pix_key: r.pix_key, pix_name: r.pix_name, openpix_app_id: r.openpix_app_id, opening_hours: r.opening_hours,
      };
      await api.put("/admin/restaurant", payload);
      toast.success("Configurações salvas");
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const togglePayment = (m) => {
    const cur = r.payment_methods || [];
    set({ payment_methods: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] });
  };

  const setHour = (day, patch) =>
    set({ opening_hours: { ...r.opening_hours, [day]: { ...r.opening_hours[day], ...patch } } });

  if (!r) return (
    <div className="grid place-items-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
    </div>
  );

  return (
    <div className="space-y-5" data-testid="admin-settings">
      {/* Sticky header — dark mode corrected */}
      <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 bg-gray-50 dark:bg-[#0A0A0A] py-2 z-10 border-b border-transparent dark:border-gray-800">
        <h1 className="font-display font-bold text-2xl text-gray-900 dark:text-white">Configurações</h1>
        <Button
          onClick={save} disabled={saving} data-testid="save-settings"
          className="bg-gray-900 dark:bg-white dark:text-gray-900 hover:opacity-90 rounded-xl"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Salvar</>}
        </Button>
      </div>

      <Tabs defaultValue="loja">
        <TabsList className="flex-wrap h-auto dark:bg-gray-800">
          <TabsTrigger value="loja" data-testid="tab-loja">Loja</TabsTrigger>
          <TabsTrigger value="aparencia" data-testid="tab-aparencia">Aparência</TabsTrigger>
          <TabsTrigger value="horarios" data-testid="tab-horarios">Horários</TabsTrigger>
          <TabsTrigger value="entrega" data-testid="tab-entrega">Entrega</TabsTrigger>
          <TabsTrigger value="pagamento" data-testid="tab-pagamento">Pagamento</TabsTrigger>
          <TabsTrigger value="impressao" data-testid="tab-impressao">Impressao</TabsTrigger>
        </TabsList>

        {/* ── Loja ── */}
        <TabsContent value="loja" className={`${PANEL} space-y-4`}>
          <div>
            <Label className="dark:text-gray-200">Nome da loja</Label>
            <Input value={r.name || ""} onChange={(e) => set({ name: e.target.value })}
              data-testid="settings-name"
              className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <Label className="dark:text-gray-200">Frase curta (tagline)</Label>
            <Input value={r.tagline || ""} onChange={(e) => set({ tagline: e.target.value })}
              className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
          </div>
          <div>
            <Label className="dark:text-gray-200">Descrição</Label>
            <Textarea value={r.description || ""} onChange={(e) => set({ description: e.target.value })}
              rows={2} className="mt-1 resize-none dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="dark:text-gray-200">WhatsApp (com DDI)</Label>
              <Input value={r.whatsapp || ""} onChange={(e) => set({ whatsapp: e.target.value })}
                placeholder="5511999999999" data-testid="settings-whatsapp"
                className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <Label className="dark:text-gray-200">Telefone</Label>
              <Input value={r.phone || ""} onChange={(e) => set({ phone: e.target.value })}
                className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
          <div>
            <Label className="dark:text-gray-200">Endereço</Label>
            <Input value={r.address || ""} onChange={(e) => set({ address: e.target.value })}
              className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="dark:text-gray-200">Cidade</Label>
              <Input value={r.city || ""} onChange={(e) => set({ city: e.target.value })}
                className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <Label className="dark:text-gray-200">Estado</Label>
              <Input value={r.state || ""} onChange={(e) => set({ state: e.target.value })}
                className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
          <div>
            <Label className="dark:text-gray-200">Slug público</Label>
            <Input value={r.slug || ""} disabled
              className="mt-1 bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700 dark:text-gray-400" />
            <p className="text-xs text-gray-400 mt-1">/cardapio/{r.slug}</p>
          </div>
        </TabsContent>

        {/* ── Aparência ── */}
        <TabsContent value="aparencia" className={`${PANEL} space-y-4`}>
          <div className="grid md:grid-cols-2 gap-4">
            <ImageUpload value={r.logo_url} onChange={(url) => set({ logo_url: url })} label="Logo" aspect="aspect-square" />
            <ImageUpload value={r.cover_url} onChange={(url) => set({ cover_url: url })} label="Imagem de capa" />
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            {[
              ["primary_color", "Botoes e destaques", "#22E39B"],
              ["secondary_color", "Detalhes e estrelas", "#F97316"],
              ["button_text_color", "Texto dos botoes", "#04110C"],
              ["menu_text_color", "Texto principal", "#FFFFFF"],
              ["menu_muted_text_color", "Texto secundario", "#A7A7A7"],
            ].map(([key, label, fallback]) => (
              <div key={key}>
                <Label className="dark:text-gray-200">{label}</Label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="color"
                    value={r[key] || fallback}
                    onChange={(e) => set({ [key]: e.target.value })}
                    data-testid={key === "primary_color" ? "color-primary" : undefined}
                    className="h-10 w-14 rounded-lg border dark:border-gray-600 cursor-pointer"
                  />
                  <Input
                    value={r[key] || ""}
                    placeholder={fallback}
                    onChange={(e) => set({ [key]: e.target.value })}
                    className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4">
            <p className="text-sm font-semibold dark:text-white mb-3">Previa do cardapio</p>
            <div className="rounded-2xl bg-[#0A0A0A] border border-white/10 p-4 max-w-sm">
              <p className="text-xs mb-1" style={{ color: r.menu_muted_text_color || "#A7A7A7" }}>Categoria</p>
              <p className="font-bold" style={{ color: r.menu_text_color || "#FFFFFF" }}>{r.name || "Nome da loja"}</p>
              <p className="text-sm mt-1" style={{ color: r.menu_muted_text_color || "#A7A7A7" }}>{r.tagline || "Descricao curta do cardapio"}</p>
              <button type="button" className="mt-4 px-4 py-2 rounded-xl text-sm font-bold" style={{ background: r.primary_color || "#22E39B", color: r.button_text_color || "#04110C" }}>
                Exemplo de botao
              </button>
            </div>
          </div>
        </TabsContent>

        {/* ── Horários ── */}
        <TabsContent value="horarios" className={`${PANEL} space-y-3`}>
          {WEEKDAYS.map((d) => {
            const h = r.opening_hours?.[d.key] || { open: false, start: "18:00", end: "23:00" };
            return (
              <div key={d.key} className="flex items-center gap-3 py-1 border-b border-gray-50 dark:border-gray-700/50 last:border-0" data-testid={`hours-${d.key}`}>
                <span className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300">{d.label}</span>
                <Switch checked={h.open} onCheckedChange={(v) => setHour(d.key, { open: v })} />
                {h.open ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input type="time" value={h.start} onChange={(e) => setHour(d.key, { start: e.target.value })}
                      className="w-28 h-9 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                    <span className="text-gray-400 text-sm">até</span>
                    <Input type="time" value={h.end} onChange={(e) => setHour(d.key, { end: e.target.value })}
                      className="w-28 h-9 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                    {h.end <= h.start && (
                      <span className="text-xs text-amber-500 font-medium">vira o dia</span>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">Fechado</span>
                )}
              </div>
            );
          })}
        </TabsContent>

        {/* ── Entrega ── */}
        <TabsContent value="entrega" className={`${PANEL} space-y-4`}>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Switch checked={r.accepts_delivery} onCheckedChange={(v) => set({ accepts_delivery: v })} data-testid="toggle-delivery" />
              Aceita entrega
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <Switch checked={r.accepts_pickup} onCheckedChange={(v) => set({ accepts_pickup: v })} />
              Aceita retirada
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="dark:text-gray-200">Pedido mínimo</Label>
              <Input type="number" value={r.minimum_order || 0} onChange={(e) => set({ minimum_order: e.target.value })}
                data-testid="settings-minimum"
                className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <Label className="dark:text-gray-200">Tempo médio</Label>
              <Input value={r.average_delivery_time || ""} onChange={(e) => set({ average_delivery_time: e.target.value })}
                placeholder="30-45 min"
                className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
          </div>
          <div>
            <Label className="dark:text-gray-200">Taxa fixa de entrega (R$)</Label>
            <Input type="number" value={r.flat_delivery_fee || 0}
              onChange={(e) => set({ flat_delivery_fee: e.target.value })}
              data-testid="flat-delivery-fee"
              className="mt-1 w-40 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Esta taxa sera aplicada a todas as entregas, sem filtro por cidade, bairro ou regiao.
            </p>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
            <p className="font-semibold text-sm dark:text-white">Desconto por quantidade</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-3">
              Incentive o cliente a adicionar mais itens ao pedido.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="dark:text-gray-200">A partir de quantos itens</Label>
                <Input type="number" min="0" value={r.quantity_discount_min_items || 0}
                  onChange={(e) => set({ quantity_discount_min_items: e.target.value })}
                  className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Desconto (%)</Label>
                <Input type="number" min="0" max="100" step="0.1" value={r.quantity_discount_percent || 0}
                  onChange={(e) => set({ quantity_discount_percent: e.target.value })}
                  className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── Pagamento ── */}
        <TabsContent value="pagamento" className={`${PANEL} space-y-4`}>
          <div>
            <Label className="dark:text-gray-200">Formas de pagamento aceitas</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {PAYMENT_OPTIONS.map((m) => {
                const active = (r.payment_methods || []).includes(m);
                return (
                  <button key={m} onClick={() => togglePayment(m)} data-testid={`payment-${m}`}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      active
                        ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent"
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500"
                    }`}>
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          {(r.payment_methods || []).includes("Pix") && (
            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 dark:border-gray-700 pt-4">
              <div>
                <Label className="dark:text-gray-200">Chave Pix</Label>
                <Input value={r.pix_key || ""} onChange={(e) => set({ pix_key: e.target.value })}
                  placeholder="email, CPF, CNPJ ou telefone"
                  className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div>
                <Label className="dark:text-gray-200">Nome do recebedor</Label>
                <Input value={r.pix_name || ""} onChange={(e) => set({ pix_name: e.target.value })}
                  className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
              </div>
              <div className="col-span-2 space-y-3">
                <div>
                  <Label className="dark:text-gray-200">OpenPix / Woovi — App ID</Label>
                  <Input value={r.openpix_app_id || ""} onChange={(e) => set({ openpix_app_id: e.target.value })}
                    placeholder="Cole o App ID (Authorization) do OpenPix aqui"
                    className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                  <p className="text-xs text-gray-400 mt-1">
                    Gera QR Code Pix automático no checkout. Obtenha em{" "}
                    <a href="https://app.openpix.com.br/home/applications" target="_blank" rel="noreferrer" className="underline">
                      app.openpix.com.br → API/Plugins → Criar Aplicação
                    </a>
                    {" "}— copie o campo <strong>AppID</strong>.
                  </p>
                </div>
                {r.openpix_app_id && (
                  <div className="rounded-xl p-3 space-y-2 dark:bg-gray-800 bg-gray-50 border dark:border-gray-700">
                    <p className="text-xs font-semibold dark:text-gray-300">Webhook para confirmação automática de pagamento</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Configure este URL no painel OpenPix em <strong>API/Plugins → Webhooks → Adicionar</strong>:
                    </p>
                    <WebhookUrlCopy url={`${API}/public/openpix/webhook`} />
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="impressao">
          <PrintingSettings />
        </TabsContent>

      </Tabs>
    </div>
  );
}
