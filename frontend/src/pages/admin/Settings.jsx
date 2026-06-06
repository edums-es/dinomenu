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
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import ImageUpload from "@/components/admin/ImageUpload";
import { Loader2, Plus, X, Save, Copy, Check, Printer, RefreshCw, KeyRound, Activity, Download, MonitorDown } from "lucide-react";
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
const uid = () => Math.random().toString(36).slice(2);
const splitList = (value) => String(value || "").split(",").map((v) => v.trim()).filter(Boolean);
const joinList = (value) => Array.isArray(value) ? value.join(", ") : (value || "");

/* shared panel class */
const PANEL = "bg-white dark:bg-[#111111] rounded-2xl border border-gray-200 dark:border-gray-700 p-5";

const PRINT_TRIGGER_LABELS = {
  pending: "Quando o pedido entrar",
  accepted: "Quando o pedido for aceito",
  preparing: "Quando entrar em preparo",
  ready: "Quando ficar pronto",
};

export default function Settings() {
  const [r, setR] = useState(null);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(null);
  const [printJobs, setPrintJobs] = useState([]);
  const [savingPrinting, setSavingPrinting] = useState(false);
  const [downloadingPrintAgent, setDownloadingPrintAgent] = useState(false);

  useEffect(() => { api.get("/admin/restaurant").then((res) => setR(res.data)); }, []);
  useEffect(() => {
    api.get("/admin/printing/settings").then((res) => setPrinting(res.data)).catch(() => {});
    api.get("/admin/printing/jobs").then((res) => setPrintJobs(res.data)).catch(() => {});
  }, []);

  const set = (patch) => setR((p) => ({ ...p, ...patch }));
  const setPrint = (patch) => setPrinting((p) => ({ ...p, ...patch }));

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
        delivery_fee_mode: r.delivery_fee_mode, flat_delivery_fee: Number(r.flat_delivery_fee) || 0,
        delivery_zones: (r.delivery_zones || []).map((z) => ({
          ...z,
          aliases: splitList(z.aliases),
          cep_prefixes: splitList(z.cep_prefixes),
          city_names: splitList(z.city_names),
        })),
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

  const addZone = () =>
    set({ delivery_zones: [...(r.delivery_zones || []), { id: uid(), neighborhood: "", fee: 0, active: true, aliases: "", city_names: "", cep_prefixes: "" }] });
  const updZone = (id, patch) =>
    set({ delivery_zones: r.delivery_zones.map((z) => z.id === id ? { ...z, ...patch } : z) });
  const delZone = (id) =>
    set({ delivery_zones: r.delivery_zones.filter((z) => z.id !== id) });

  const savePrinting = async () => {
    setSavingPrinting(true);
    try {
      const payload = {
        printing_enabled: !!printing.printing_enabled,
        printing_trigger_status: printing.printing_trigger_status || "accepted",
        printer_name: printing.printer_name || "",
        printer_copies: Number(printing.printer_copies) || 1,
        printer_include_customer_phone: !!printing.printer_include_customer_phone,
        printer_include_address: !!printing.printer_include_address,
        printer_include_payment: !!printing.printer_include_payment,
      };
      const { data } = await api.put("/admin/printing/settings", payload);
      setPrinting(data);
      toast.success("Configurações de impressão salvas");
    } catch {
      toast.error("Erro ao salvar impressão");
    } finally {
      setSavingPrinting(false);
    }
  };

  const refreshPrintJobs = async () => {
    const { data } = await api.get("/admin/printing/jobs");
    setPrintJobs(data);
  };

  const regeneratePrintToken = async () => {
    if (!window.confirm("Gerar um novo token desconecta agentes de impressão antigos. Continuar?")) return;
    const { data } = await api.post("/admin/printing/token");
    setPrint({ printer_agent_token: data.printer_agent_token });
    toast.success("Token regenerado");
  };

  const copyText = async (text, label = "Copiado") => {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  };

  const downloadPrintAgent = async () => {
    if (downloadingPrintAgent) return;
    setDownloadingPrintAgent(true);
    const loadingToast = toast.loading("Preparando download do instalador...");
    try {
      const { data } = await api.get("/admin/printing/agent/download", {
        responseType: "blob",
        timeout: 180000,
      });
      if (data?.type?.includes("application/json")) {
        const payload = JSON.parse(await data.text());
        throw new Error(payload?.detail || "Nao foi possivel baixar o instalador.");
      }
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "eg-delivery-impressora-windows.zip";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success("Instalador Windows baixado", { id: loadingToast });
    } catch (err) {
      let message = err?.message || "Erro ao baixar instalador Windows";
      const responseData = err?.response?.data;
      if (responseData instanceof Blob) {
        try {
          const text = await responseData.text();
          const parsed = JSON.parse(text);
          message = parsed?.detail || message;
        } catch {}
      } else if (err?.response?.data?.detail) {
        message = err.response.data.detail;
      }
      toast.error(message, { id: loadingToast });
    } finally {
      setDownloadingPrintAgent(false);
    }
  };

  if (!r || !printing) return (
    <div className="grid place-items-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
    </div>
  );

  return (
    <div className="space-y-5" data-testid="admin-settings">
      {/* Sticky header — dark mode corrected */}
      <div className="flex items-center justify-between sticky top-0 bg-gray-50 dark:bg-[#0A0A0A] py-2 z-10 border-b border-transparent dark:border-gray-800">
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
          <TabsTrigger value="impressao" data-testid="tab-impressao">Impressão</TabsTrigger>
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
            <p className="text-xs text-gray-400 mt-1">/loja/{r.slug}</p>
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
            <Label className="dark:text-gray-200">Modelo de taxa de entrega</Label>
            <Select value={r.delivery_fee_mode || "fixed"} onValueChange={(v) => set({ delivery_fee_mode: v })}>
              <SelectTrigger className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" data-testid="delivery-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                <SelectItem value="fixed">Taxa fixa</SelectItem>
                <SelectItem value="neighborhood">Por bairro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {r.delivery_fee_mode === "fixed" ? (
            <div>
              <Label className="dark:text-gray-200">Taxa fixa (R$)</Label>
              <Input type="number" value={r.flat_delivery_fee || 0}
                onChange={(e) => set({ flat_delivery_fee: e.target.value })}
                className="mt-1 w-40 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="dark:text-gray-200">Regioes atendidas</Label>
                <Button size="sm" variant="outline" onClick={addZone} data-testid="add-zone"
                  className="dark:border-gray-600 dark:text-gray-200">
                  <Plus className="w-3 h-3 mr-1" /> Regiao
                </Button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Cadastre uma regiao comercial e informe como ela aparece no ViaCEP: bairros/termos, municipio e/ou prefixos de CEP.
              </p>
              <div className="space-y-2">
                {(r.delivery_zones || []).map((z) => (
                  <div key={z.id} className="grid grid-cols-12 gap-2 items-center" data-testid={`zone-${z.id}`}>
                    <Input value={z.neighborhood} onChange={(e) => updZone(z.id, { neighborhood: e.target.value })}
                      placeholder="Regiao: Nova Almeida"
                      className="col-span-3 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                    <Input value={joinList(z.aliases)} onChange={(e) => updZone(z.id, { aliases: e.target.value })}
                      placeholder="Bairros/termos: Serramar, Parque Jacaraipe"
                      className="col-span-3 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                    <Input value={joinList(z.city_names)} onChange={(e) => updZone(z.id, { city_names: e.target.value })}
                      placeholder="Municipio: Serra"
                      className="col-span-2 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                    <Input value={joinList(z.cep_prefixes)} onChange={(e) => updZone(z.id, { cep_prefixes: e.target.value })}
                      placeholder="CEPs: 29182"
                      className="col-span-2 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                    <Input type="number" value={z.fee} onChange={(e) => updZone(z.id, { fee: Number(e.target.value) })}
                      placeholder="R$" className="col-span-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
                    <div className="col-span-1 flex items-center justify-end gap-2">
                      <Switch checked={z.active} onCheckedChange={(v) => updZone(z.id, { active: v })} />
                      <Button size="icon" variant="ghost" onClick={() => delZone(z.id)}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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

        {/* Impressão */}
        <TabsContent value="impressao" className="space-y-4">
          <div className={`${PANEL} space-y-5`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 grid place-items-center">
                    <Printer className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="font-display font-bold text-lg dark:text-white">Impressão automática de pedidos</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Cria uma fila segura quando o pedido chega no status escolhido. O agente local imprime sem cliques.
                    </p>
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                <Switch checked={!!printing.printing_enabled} onCheckedChange={(v) => setPrint({ printing_enabled: v })} />
                <span>
                  <span className="block text-sm font-semibold dark:text-white">Ativar automação</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Usa impressora configurada no agente</span>
                </span>
              </label>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label className="dark:text-gray-200">Quando imprimir</Label>
                <Select value={printing.printing_trigger_status || "accepted"} onValueChange={(v) => setPrint({ printing_trigger_status: v })}>
                  <SelectTrigger className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                    {Object.entries(PRINT_TRIGGER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="dark:text-gray-200">Nome da impressora</Label>
                <Input
                  value={printing.printer_name || ""}
                  onChange={(e) => setPrint({ printer_name: e.target.value })}
                  placeholder="Ex: EPSON TM-T20"
                  className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                <p className="text-xs text-gray-400 mt-1">Deixe vazio para usar a impressora padrão do Windows.</p>
              </div>
              <div>
                <Label className="dark:text-gray-200">Cópias</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={printing.printer_copies || 1}
                  onChange={(e) => setPrint({ printer_copies: e.target.value })}
                  className="mt-1 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-3">
              {[
                ["printer_include_customer_phone", "Telefone do cliente"],
                ["printer_include_address", "Endereço de entrega"],
                ["printer_include_payment", "Forma de pagamento"],
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
                  <span className="text-sm font-medium dark:text-gray-200">{label}</span>
                  <Switch checked={!!printing[key]} onCheckedChange={(v) => setPrint({ [key]: v })} />
                </label>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-emerald-500" />
                <h3 className="font-semibold dark:text-white">Vinculo do programa local</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label className="dark:text-gray-200">Endpoint</Label>
                  <WebhookUrlCopy url={`${API}/print-agent/jobs/claim`} />
                </div>
                <div>
                  <Label className="dark:text-gray-200">Token do programa</Label>
                  <div className="flex gap-2 items-center">
                    <code className="flex-1 text-xs bg-black/10 dark:bg-black/30 rounded px-2 py-1.5 truncate select-all dark:text-green-400 text-green-700">
                      {printing.printer_agent_token}
                    </code>
                    <button onClick={() => copyText(printing.printer_agent_token, "Token copiado")} className="shrink-0 flex items-center gap-1 text-xs px-2 py-1.5 rounded border dark:border-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <Copy className="w-3.5 h-3.5" /> Copiar
                    </button>
                    <button onClick={regeneratePrintToken} className="shrink-0 flex items-center gap-1 text-xs px-2 py-1.5 rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" /> Novo
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Esse vinculo ja vai dentro do instalador baixado por esta loja. Use estes dados apenas para suporte tecnico.
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/20 p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3 max-w-2xl">
                  <span className="w-10 h-10 rounded-xl bg-white dark:bg-black/20 text-emerald-600 dark:text-emerald-400 grid place-items-center shrink-0">
                    <MonitorDown className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">Instalador Windows da impressora</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      Baixe no computador da loja, instale o app e deixe o icone do EG Delivery ativo perto do relogio do Windows.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={downloadPrintAgent}
                  disabled={downloadingPrintAgent}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl disabled:opacity-70"
                >
                  {downloadingPrintAgent
                    ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Baixando...</>
                    : <><Download className="w-4 h-4 mr-1" /> Baixar instalador Windows</>}
                </Button>
              </div>

              <div className="grid md:grid-cols-4 gap-3 mt-4">
                {[
                  ["1", "Baixe e extraia o pacote no computador da loja."],
                  ["2", "De dois cliques em Instalar EG Delivery Impressora."],
                  ["3", "Finalize a instalacao e mantenha o app aberto na bandeja."],
                  ["4", "Use Testar impressao para conferir a impressora."],
                ].map(([step, text]) => (
                  <div key={step} className="rounded-xl bg-white/75 dark:bg-black/20 border border-white dark:border-emerald-900/60 p-3">
                    <span className="inline-grid place-items-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold mb-2">{step}</span>
                    <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300">{text}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                Normalmente nao precisa configurar nada. O programa fica na bandeja do Windows, mostra status da conexao e permite testar a impressora.
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={savePrinting} disabled={savingPrinting} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                {savingPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" /> Salvar impressão</>}
              </Button>
            </div>
          </div>

          <div className={`${PANEL} space-y-3`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-400" />
                <h3 className="font-semibold dark:text-white">Fila recente</h3>
              </div>
              <Button size="sm" variant="outline" onClick={refreshPrintJobs} className="dark:border-gray-600 dark:text-gray-200">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
              </Button>
            </div>
            {printJobs.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nenhum job de impressão ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-400 border-b dark:border-gray-700">
                      <th className="py-2">Pedido</th>
                      <th>Status</th>
                      <th>Motivo</th>
                      <th>Tentativas</th>
                      <th>Atualizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printJobs.slice(0, 12).map((job) => (
                      <tr key={job.id} className="border-b border-gray-50 dark:border-gray-800 last:border-0">
                        <td className="py-2 font-semibold dark:text-white">#{job.order_number}</td>
                        <td>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
                            job.status === "printed" ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" :
                            job.status === "failed" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
                            "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                          }`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="text-gray-500 dark:text-gray-400">{job.reason === "manual" ? "Manual" : "Automático"}</td>
                        <td className="text-gray-500 dark:text-gray-400">{job.attempts || 0}</td>
                        <td className="text-gray-500 dark:text-gray-400">{job.updated_at ? new Date(job.updated_at).toLocaleString("pt-BR") : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
