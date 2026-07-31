import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import {
  Plus, X, Pencil, Trash2, Loader2, CheckCircle2, Star, ShieldCheck,
  Sparkles, Save, Gift, Lock, Unlock, PackagePlus,
} from "lucide-react";

const FEATURE_FALLBACK = [
  { key: "orders", label: "Pedidos e kanban", category: "Operacao" },
  { key: "menu", label: "Cardapio digital", category: "Cardapio" },
  { key: "pdv", label: "PDV / caixa", category: "Operacao" },
  { key: "automatic_printing", label: "Impressao automatica", category: "Operacao" },
  { key: "whatsapp", label: "WhatsApp e mensagens", category: "Atendimento" },
  { key: "pix", label: "Pix online", category: "Pagamento" },
  { key: "delivery_zones", label: "Taxa por bairro/regiao", category: "Entrega" },
  { key: "tables_qr", label: "Mesas e QR Code", category: "Salao" },
  { key: "waiters", label: "Garcons", category: "Salao" },
  { key: "delivery_people", label: "Entregadores", category: "Entrega" },
  { key: "stock", label: "Estoque", category: "Gestao" },
  { key: "suppliers", label: "Fornecedores", category: "Gestao" },
  { key: "loyalty", label: "Fidelidade", category: "Marketing" },
  { key: "wholesale", label: "Atacado", category: "Vendas" },
  { key: "coupons", label: "Cupons", category: "Marketing" },
  { key: "reports", label: "Relatorios", category: "Gestao" },
  { key: "custom_brand", label: "Marca e aparencia", category: "White-label" },
  { key: "menu_import", label: "Importar cardapio", category: "Migracao" },
];

const EMPTY_PLAN = {
  name: "",
  slug: "",
  description: "",
  price_monthly: "",
  price_yearly: "",
  price_lifetime: "",
  trial_days: 0,
  color: "#6366f1",
  is_active: true,
  is_featured: false,
  is_public: true,
  plan_type: "subscription",
  updates_policy: "included",
  billing_options: { monthly: true, yearly: true, lifetime: false },
  feature_flags: {},
  features: [],
  limits: { max_products: "", max_orders_monthly: "" },
  upgrade_note: "",
};

const EMPTY_UPDATE = {
  title: "",
  version: "",
  description: "",
  price: "",
  purchase_url: "",
  features: [],
  is_active: true,
};

function moneyNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function textSlug(value) {
  return (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mergePlan(plan) {
  return {
    ...EMPTY_PLAN,
    ...(plan || {}),
    features: [...(plan?.features || [])],
    limits: { ...EMPTY_PLAN.limits, ...(plan?.limits || {}) },
    billing_options: { ...EMPTY_PLAN.billing_options, ...(plan?.billing_options || {}) },
    feature_flags: { ...(plan?.feature_flags || {}) },
  };
}

function Switch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-indigo-600" : "bg-gray-700"}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}

function Badge({ active }) {
  return active
    ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">Ativo</span>
    : <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-400">Inativo</span>;
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">{label}</label>
      {children}
    </div>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
    />
  );
}

function SelectInput(props) {
  return (
    <select
      {...props}
      className="w-full bg-[#1E2430] border border-white/10 text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
    />
  );
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400">
        <Icon className="w-4 h-4" />
      </span>
      <div>
        <h3 className="font-bold text-gray-100">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function PlanModal({ plan, catalog, onClose, onSaved }) {
  const [form, setForm] = useState(() => mergePlan(plan));
  const [saving, setSaving] = useState(false);
  const [newFeature, setNewFeature] = useState("");
  const [error, setError] = useState("");

  const features = catalog?.features?.length ? catalog.features : FEATURE_FALLBACK;
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const setLimit = (key, value) => setForm((prev) => ({ ...prev, limits: { ...prev.limits, [key]: value } }));

  const toggleFeature = (key) => {
    setForm((prev) => ({ ...prev, feature_flags: { ...prev.feature_flags, [key]: !prev.feature_flags?.[key] } }));
  };

  const toggleBilling = (key) => {
    setForm((prev) => ({ ...prev, billing_options: { ...prev.billing_options, [key]: !prev.billing_options?.[key] } }));
  };

  const addFeature = () => {
    const value = newFeature.trim();
    if (!value) return;
    setForm((prev) => ({ ...prev, features: [...prev.features, value] }));
    setNewFeature("");
  };

  const removeFeature = (index) => {
    setForm((prev) => ({ ...prev, features: prev.features.filter((_, i) => i !== index) }));
  };

  const preparePayload = () => {
    const billing = { ...form.billing_options };
    if (form.plan_type === "legacy_lifetime") {
      billing.lifetime = true;
    }
    return {
      ...form,
      slug: form.slug || textSlug(form.name),
      price_monthly: moneyNumber(form.price_monthly) || 0,
      price_yearly: moneyNumber(form.price_yearly),
      price_lifetime: moneyNumber(form.price_lifetime),
      trial_days: Number(form.trial_days || 0),
      billing_options: billing,
      updates_policy: form.plan_type === "legacy_lifetime" ? "paid_upgrades" : form.updates_policy,
      limits: {
        max_products: form.limits?.max_products === "" ? null : Number(form.limits?.max_products || 0),
        max_orders_monthly: form.limits?.max_orders_monthly === "" ? null : Number(form.limits?.max_orders_monthly || 0),
      },
    };
  };

  const save = async (event) => {
    event.preventDefault();
    const payload = preparePayload();
    if (!payload.name || !payload.slug) {
      setError("Informe nome e slug do plano.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (plan?.id) await api.put(`/super/plans/${plan.id}`, payload);
      else await api.post("/super/plans", payload);
      toast.success("Plano salvo");
      onSaved();
    } catch (err) {
      setError(err?.response?.data?.detail || "Erro ao salvar plano.");
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = features.filter((item) => form.feature_flags?.[item.key]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-gray-100">{plan?.id ? "Editar plano" : "Novo plano"}</h2>
            <p className="text-xs text-gray-500 mt-1">Controle preco, limites, recursos e acesso a futuras atualizacoes.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={save} className="p-6 space-y-6">
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

          <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-4">
            <div className="bg-[#0F131A] border border-white/5 rounded-2xl p-4 space-y-4">
              <SectionTitle icon={ShieldCheck} title="Identidade do plano" subtitle="Nome comercial, descricao e destaque da oferta." />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Nome">
                  <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: EG PRO" />
                </Field>
                <Field label="Slug">
                  <TextInput value={form.slug} onChange={(e) => set("slug", e.target.value)} onBlur={() => set("slug", textSlug(form.slug || form.name))} placeholder="pro" />
                </Field>
              </div>
              <Field label="Descricao">
                <textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={3}
                  placeholder="Resumo do que este plano entrega."
                  className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                />
              </Field>
            </div>

            <div className="bg-[#0F131A] border border-white/5 rounded-2xl p-4 space-y-4">
              <SectionTitle icon={Lock} title="Contrato e updates" subtitle="Use vitalicio legado para clientes antigos sem updates futuros inclusos." />
              <Field label="Tipo de contrato">
                <SelectInput
                  value={form.plan_type}
                  onChange={(e) => {
                    const value = e.target.value;
                    setForm((prev) => ({
                      ...prev,
                      plan_type: value,
                      updates_policy: value === "legacy_lifetime" ? "paid_upgrades" : prev.updates_policy,
                      is_public: value === "legacy_lifetime" ? false : prev.is_public,
                      billing_options: value === "legacy_lifetime" ? { ...prev.billing_options, lifetime: true } : prev.billing_options,
                    }));
                  }}
                >
                  <option value="subscription">Mensal / anual normal</option>
                  <option value="legacy_lifetime">Vitalicio legado</option>
                </SelectInput>
              </Field>
              <Field label="Futuras atualizacoes">
                <SelectInput
                  value={form.plan_type === "legacy_lifetime" ? "paid_upgrades" : form.updates_policy}
                  disabled={form.plan_type === "legacy_lifetime"}
                  onChange={(e) => set("updates_policy", e.target.value)}
                >
                  <option value="included">Inclusas no plano</option>
                  <option value="paid_upgrades">Pagas por pacote premium</option>
                </SelectInput>
              </Field>
              <div className="flex items-center gap-5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={form.is_active} onChange={(v) => set("is_active", v)} />
                  <span className="text-sm text-gray-300">Ativo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={form.is_featured} onChange={(v) => set("is_featured", v)} />
                  <span className="text-sm text-gray-300">Destaque</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={!form.is_public} onChange={(v) => set("is_public", !v)} />
                  <span className="text-sm text-gray-300">Oculto</span>
                </label>
              </div>
            </div>
          </section>

          <section className="bg-[#0F131A] border border-white/5 rounded-2xl p-4 space-y-4">
            <SectionTitle icon={Gift} title="Cobranca e limites" subtitle="Defina quais ciclos podem ser vendidos e os limites do plano." />
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Field label="Preco mensal">
                <TextInput type="number" min="0" step="0.01" value={form.price_monthly} onChange={(e) => set("price_monthly", e.target.value)} />
              </Field>
              <Field label="Preco anual">
                <TextInput type="number" min="0" step="0.01" value={form.price_yearly || ""} onChange={(e) => set("price_yearly", e.target.value)} />
              </Field>
              <Field label="Preco vitalicio">
                <TextInput type="number" min="0" step="0.01" value={form.price_lifetime || ""} onChange={(e) => set("price_lifetime", e.target.value)} />
              </Field>
              <Field label="Max. produtos">
                <TextInput type="number" min="0" value={form.limits?.max_products || ""} onChange={(e) => setLimit("max_products", e.target.value)} />
              </Field>
              <Field label="Max. pedidos/mes">
                <TextInput type="number" min="0" value={form.limits?.max_orders_monthly || ""} onChange={(e) => setLimit("max_orders_monthly", e.target.value)} />
              </Field>
            </div>
            <div className="grid sm:grid-cols-4 gap-3">
              {[
                ["monthly", "Mensal"],
                ["yearly", "Anual"],
                ["lifetime", "Vitalicio"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleBilling(key)}
                  className={`text-left rounded-xl border px-3 py-3 transition-colors ${form.billing_options?.[key] ? "border-emerald-500 bg-emerald-500/10 text-gray-100" : "border-white/10 bg-[#161B22] text-gray-500"}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {form.billing_options?.[key] ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4" />}
                    {label}
                  </span>
                </button>
              ))}
              <Field label="Dias de trial">
                <TextInput type="number" min="0" value={form.trial_days} onChange={(e) => set("trial_days", e.target.value)} />
              </Field>
            </div>
          </section>

          <section className="bg-[#0F131A] border border-white/5 rounded-2xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <SectionTitle icon={Sparkles} title="Recursos do plano" subtitle={`${enabledCount} recurso(s) habilitado(s). Marque exatamente o que entra neste plano.`} />
              <input type="color" value={form.color} onChange={(e) => set("color", e.target.value)} className="w-12 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer" />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {features.map((item) => {
                const active = !!form.feature_flags?.[item.key];
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleFeature(item.key)}
                    className={`text-left rounded-xl border p-3 transition-colors ${active ? "border-emerald-500 bg-emerald-500/10" : "border-white/10 bg-[#161B22] hover:border-white/20"}`}
                  >
                    <span className="flex items-start gap-2">
                      <span className={`mt-0.5 grid place-items-center w-5 h-5 rounded ${active ? "bg-emerald-500 text-white" : "bg-white/5 text-gray-500"}`}>
                        {active && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-gray-100">{item.label}</span>
                        <span className="block text-[11px] text-gray-500">{item.category}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-2 block">Texto comercial exibido no card do plano</label>
              <div className="space-y-2 mb-2">
                {form.features.map((feature, index) => (
                  <div key={`${feature}-${index}`} className="flex items-center gap-2 bg-[#1E2430] border border-white/10 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm text-gray-200">{feature}</span>
                    <button type="button" onClick={() => removeFeature(index)} className="text-gray-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <TextInput value={newFeature} onChange={(e) => setNewFeature(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFeature())} placeholder="Ex: Atualizacoes inclusas" />
                <button type="button" onClick={addFeature} className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2"><Plus className="w-4 h-4" /></button>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar plano
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UpdateModal({ update, restaurants, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_UPDATE,
    ...(update || {}),
    featuresText: (update?.features || []).join("\n"),
  }));
  const [restaurantId, setRestaurantId] = useState("");
  const [granting, setGranting] = useState(false);
  const [saving, setSaving] = useState(false);

  const payload = () => ({
    title: form.title,
    version: form.version,
    description: form.description,
    price: moneyNumber(form.price) || 0,
    purchase_url: form.purchase_url || "",
    is_active: !!form.is_active,
    features: String(form.featuresText || "").split("\n").map((line) => line.trim()).filter(Boolean),
  });

  const save = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return toast.error("Informe o titulo da atualizacao");
    setSaving(true);
    try {
      if (update?.id) await api.put(`/super/feature-updates/${update.id}`, payload());
      else await api.post("/super/feature-updates", payload());
      toast.success("Atualizacao salva");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar atualizacao");
    } finally {
      setSaving(false);
    }
  };

  const grant = async () => {
    if (!update?.id || !restaurantId) return;
    setGranting(true);
    try {
      await api.post(`/super/feature-updates/${update.id}/grant`, { restaurant_id: restaurantId, status: "granted", price_paid: moneyNumber(form.price) || 0 });
      toast.success("Atualizacao liberada para o cliente");
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao liberar atualizacao");
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-[#161B22] border border-white/10 rounded-2xl w-full max-w-3xl shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-gray-100">{update?.id ? "Editar atualizacao premium" : "Nova atualizacao premium"}</h2>
            <p className="text-xs text-gray-500 mt-1">O aviso aparece para clientes vitalicios legados que ainda nao compraram esse pacote.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div className="grid sm:grid-cols-[1fr_140px_140px] gap-4">
            <Field label="Titulo">
              <TextInput value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} placeholder="Ex: Impressao automatica 2.0" />
            </Field>
            <Field label="Versao">
              <TextInput value={form.version} onChange={(e) => setForm((prev) => ({ ...prev, version: e.target.value }))} placeholder="2.1" />
            </Field>
            <Field label="Preco">
              <TextInput type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} />
            </Field>
          </div>
          <Field label="Descricao do pop-up">
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              rows={3}
              className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder="Explique o que esta atualizacao libera."
            />
          </Field>
          <Field label="O que vem nesse pacote">
            <textarea
              value={form.featuresText}
              onChange={(e) => setForm((prev) => ({ ...prev, featuresText: e.target.value }))}
              rows={5}
              className="w-full bg-[#1E2430] border border-white/10 text-gray-100 placeholder-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
              placeholder={"Uma novidade por linha\nEx: Botao de reimpressao no pedido"}
            />
          </Field>
          <div className="grid sm:grid-cols-[1fr_160px] gap-4 items-end">
            <Field label="Link de compra ou suporte">
              <TextInput value={form.purchase_url || ""} onChange={(e) => setForm((prev) => ({ ...prev, purchase_url: e.target.value }))} placeholder="https://..." />
            </Field>
            <label className="flex items-center gap-2 cursor-pointer pb-2">
              <Switch checked={form.is_active} onChange={(value) => setForm((prev) => ({ ...prev, is_active: value }))} />
              <span className="text-sm text-gray-300">Ativa</span>
            </label>
          </div>

          {update?.id && (
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-200 mb-2">Liberar manualmente para um cliente</p>
              <div className="grid sm:grid-cols-[1fr_180px] gap-3">
                <SelectInput value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)}>
                  <option value="">Selecione o restaurante</option>
                  {restaurants.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                  ))}
                </SelectInput>
                <button type="button" onClick={grant} disabled={!restaurantId || granting} className="rounded-lg bg-amber-500 hover:bg-amber-600 text-black font-semibold text-sm px-4 py-2 disabled:opacity-50">
                  {granting ? "Liberando..." : "Liberar pacote"}
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 border border-white/10 rounded-lg">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Salvar atualizacao
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FeatureUpdatesPanel({ restaurants }) {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/super/feature-updates");
      setUpdates(data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (update) => {
    if (!window.confirm(`Excluir a atualizacao "${update.title}"?`)) return;
    setDeleting(update.id);
    try {
      await api.delete(`/super/feature-updates/${update.id}`);
      toast.success("Atualizacao excluida");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Nao foi possivel excluir");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <section className="bg-[#161B22] border border-white/5 rounded-2xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <SectionTitle icon={PackagePlus} title="Atualizacoes premium" subtitle="Pacotes vendidos separadamente para clientes vitalicios legados." />
        <button onClick={() => setModal({})} className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Nova atualizacao
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-10"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>
      ) : updates.length ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {updates.map((update) => (
            <article key={update.id} className="bg-[#0F131A] border border-white/5 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-100">{update.title}</h3>
                    {update.version && <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300">v{update.version}</span>}
                    <Badge active={update.is_active} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{update.description || "Sem descricao"}</p>
                </div>
                <p className="text-sm font-bold text-emerald-300 shrink-0">{brl(update.price)}</p>
              </div>
              {!!update.features?.length && (
                <ul className="mt-3 space-y-1">
                  {update.features.slice(0, 4).map((feature, index) => (
                    <li key={index} className="text-xs text-gray-300 flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> {feature}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/5">
                <span className="text-xs text-gray-500">{update.buyer_count || 0} cliente(s) liberado(s)</span>
                <div className="flex gap-2">
                  <button onClick={() => setModal(update)} className="flex items-center gap-1.5 text-xs border border-white/10 hover:border-indigo-500/50 text-gray-300 hover:text-indigo-400 rounded-lg px-3 py-2">
                    <Pencil className="w-3.5 h-3.5" /> Editar
                  </button>
                  <button onClick={() => remove(update)} disabled={deleting === update.id} className="flex items-center justify-center text-xs border border-white/10 hover:border-red-500/50 text-gray-400 hover:text-red-400 rounded-lg px-3 py-2 disabled:opacity-50">
                    {deleting === update.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
          <p className="text-sm text-gray-400">Nenhuma atualizacao premium cadastrada.</p>
        </div>
      )}

      {modal !== null && (
        <UpdateModal
          update={modal?.id ? modal : null}
          restaurants={restaurants}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </section>
  );
}

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [catalog, setCatalog] = useState({ features: FEATURE_FALLBACK });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plansRes, catalogRes, restaurantsRes] = await Promise.all([
        api.get("/super/plans"),
        api.get("/super/plans/catalog"),
        api.get("/super/restaurants"),
      ]);
      setPlans(plansRes.data || []);
      setCatalog(catalogRes.data || { features: FEATURE_FALLBACK });
      setRestaurants(restaurantsRes.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (plan) => {
    if (!window.confirm(`Excluir o plano "${plan.name}"?`)) return;
    setDeleting(plan.id);
    try {
      await api.delete(`/super/plans/${plan.id}`);
      toast.success("Plano excluido");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Nao foi possivel excluir");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Planos</h1>
          <p className="text-sm text-gray-400 mt-0.5">Defina ofertas, limites, recursos e acesso a atualizacoes futuras.</p>
        </div>
        <button onClick={() => setModal({})} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium">
          <Plus className="w-4 h-4" /> Novo plano
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {plans.map((plan) => {
            const featureCount = Object.values(plan.feature_flags || {}).filter(Boolean).length;
            const legacy = plan.plan_type === "legacy_lifetime" || plan.updates_policy === "paid_upgrades";
            return (
              <div key={plan.id} className="bg-[#161B22] border border-white/5 rounded-2xl overflow-hidden flex flex-col">
                <div className="h-2" style={{ background: plan.color || "#6366f1" }} />
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <h3 className="font-bold text-gray-100 text-lg leading-tight">{plan.name}</h3>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        {plan.is_featured && <span className="inline-flex items-center gap-1 text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full"><Star className="w-3 h-3" /> Destaque</span>}
                        {legacy && <span className="inline-flex items-center gap-1 text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full"><Lock className="w-3 h-3" /> Vitalicio legado</span>}
                        {plan.is_public === false && <span className="inline-flex items-center gap-1 text-xs text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-full"><Lock className="w-3 h-3" /> Oculto</span>}
                      </div>
                    </div>
                    <Badge active={plan.is_active} />
                  </div>
                  {plan.description && <p className="text-xs text-gray-400 mt-1 mb-3 line-clamp-2">{plan.description}</p>}
                  <div className="my-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[#0F131A] border border-white/5 p-3">
                      <p className="text-[11px] uppercase text-gray-500 font-bold">Mensal</p>
                      <p className="text-lg font-extrabold text-gray-100">{brl(plan.price_monthly)}</p>
                    </div>
                    <div className="rounded-xl bg-[#0F131A] border border-white/5 p-3">
                      <p className="text-[11px] uppercase text-gray-500 font-bold">Anual</p>
                      <p className="text-lg font-extrabold text-gray-100">{plan.price_yearly ? brl(plan.price_yearly) : "--"}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                    <span className="rounded-lg bg-[#0F131A] border border-white/5 px-2 py-2 text-gray-400">{plan.subscriber_count || 0} clientes</span>
                    <span className="rounded-lg bg-[#0F131A] border border-white/5 px-2 py-2 text-gray-400">{featureCount} recursos</span>
                    <span className="rounded-lg bg-[#0F131A] border border-white/5 px-2 py-2 text-gray-400">{plan.trial_days || 0} dias trial</span>
                  </div>
                  <ul className="space-y-1.5 flex-1">
                    {(plan.features || []).slice(0, 5).map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-xs text-gray-300">
                        <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: plan.color || "#6366f1" }} />
                        {feature}
                      </li>
                    ))}
                    {!(plan.features || []).length && <li className="text-xs text-gray-500">Sem texto comercial cadastrado.</li>}
                  </ul>
                  <div className="flex gap-2 mt-4 pt-4 border-t border-white/5">
                    <button onClick={() => setModal(plan)} className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-white/10 hover:border-indigo-500/50 text-gray-300 hover:text-indigo-400 rounded-lg py-2 transition-colors">
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </button>
                    <button onClick={() => handleDelete(plan)} disabled={deleting === plan.id} className="flex items-center justify-center text-xs border border-white/10 hover:border-red-500/50 text-gray-400 hover:text-red-400 rounded-lg px-3 py-2 transition-colors disabled:opacity-50">
                      {deleting === plan.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {plans.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-500">Nenhum plano cadastrado.</div>
          )}
        </div>
      )}

      <FeatureUpdatesPanel restaurants={restaurants} />

      {modal !== null && (
        <PlanModal
          plan={modal?.id ? modal : null}
          catalog={catalog}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
