import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  BadgePlus, Boxes, Check, Layers, Pencil, Plus, Search, Trash2, X,
} from "lucide-react";

const uid = () => Math.random().toString(36).slice(2);

const EMPTY = {
  name: "",
  type: "multiple",
  required: false,
  min: 0,
  max: 5,
  options: [],
  product_ids: [],
  is_active: true,
  sort_order: 0,
};

export default function AddonGroups() {
  const [groups, setGroups] = useState([]);
  const [products, setProducts] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [productSearch, setProductSearch] = useState("");

  const load = async () => {
    try {
      const [groupsRes, productsRes] = await Promise.all([
        api.get("/admin/addon-groups"),
        api.get("/admin/products"),
      ]);
      setGroups(Array.isArray(groupsRes.data) ? groupsRes.data : []);
      setProducts(Array.isArray(productsRes.data) ? productsRes.data : []);
    } catch {
      toast.error("Erro ao carregar adicionais");
    }
  };

  useEffect(() => { load(); }, []);

  const selectedProducts = useMemo(
    () => products.filter((product) => (form.product_ids || []).includes(product.id)),
    [products, form.product_ids],
  );

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    if (!term) return products;
    return products.filter((product) => (
      String(product.name || "").toLowerCase().includes(term)
      || String(product.description || "").toLowerCase().includes(term)
    ));
  }, [products, productSearch]);

  const openNew = () => {
    setForm({ ...EMPTY, options: [{ id: uid(), name: "", price: 0 }] });
    setEditId(null);
    setProductSearch("");
    setOpen(true);
  };

  const openEdit = (group) => {
    setForm({
      ...EMPTY,
      ...group,
      options: group.options?.length ? group.options : [{ id: uid(), name: "", price: 0 }],
      product_ids: group.product_ids || [],
    });
    setEditId(group.id);
    setProductSearch("");
    setOpen(true);
  };

  const updateOption = (optionId, patch) => {
    setForm((current) => ({
      ...current,
      options: current.options.map((option) => option.id === optionId ? { ...option, ...patch } : option),
    }));
  };

  const removeOption = (optionId) => {
    setForm((current) => ({
      ...current,
      options: current.options.filter((option) => option.id !== optionId),
    }));
  };

  const toggleProduct = (productId) => {
    setForm((current) => {
      const selected = new Set(current.product_ids || []);
      if (selected.has(productId)) selected.delete(productId);
      else selected.add(productId);
      return { ...current, product_ids: [...selected] };
    });
  };

  const selectAllProducts = () => {
    setForm((current) => ({ ...current, product_ids: products.map((product) => product.id) }));
  };

  const clearProducts = () => {
    setForm((current) => ({ ...current, product_ids: [] }));
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do grupo");
    const cleanOptions = (form.options || [])
      .map((option) => ({
        id: option.id || uid(),
        name: String(option.name || "").trim(),
        price: Number(option.price) || 0,
      }))
      .filter((option) => option.name);
    if (!cleanOptions.length) return toast.error("Cadastre pelo menos uma opcao");
    if (!form.product_ids?.length) return toast.error("Selecione pelo menos um produto");

    setSaving(true);
    try {
      const max = form.type === "single" ? 1 : Math.max(Number(form.max) || 1, 1);
      const payload = {
        name: form.name.trim(),
        type: form.type,
        required: Boolean(form.required),
        min: form.required ? Math.max(Number(form.min) || 1, 1) : Math.max(Number(form.min) || 0, 0),
        max,
        options: cleanOptions,
        product_ids: form.product_ids || [],
        is_active: Boolean(form.is_active),
        sort_order: Number(form.sort_order) || 0,
      };
      if (editId) await api.put(`/admin/addon-groups/${editId}`, payload);
      else await api.post("/admin/addon-groups", payload);
      toast.success("Grupo de adicionais salvo");
      setOpen(false);
      load();
    } catch (error) {
      toast.error(formatApiError(error?.response?.data?.detail) || "Erro ao salvar adicionais");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (group) => {
    if (!window.confirm(`Excluir o grupo "${group.name}"?`)) return;
    try {
      await api.delete(`/admin/addon-groups/${group.id}`);
      toast.success("Grupo excluido");
      load();
    } catch {
      toast.error("Erro ao excluir grupo");
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-addon-groups">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl dark:text-white">Adicionais inteligentes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Crie um grupo uma vez e aplique em varios produtos do cardapio.
          </p>
        </div>
        <Button onClick={openNew} className="min-h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white">
          <Plus className="w-4 h-4 mr-1.5" /> Novo grupo
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
          <BadgePlus className="w-5 h-5 text-indigo-500" />
          <p className="mt-2 text-2xl font-bold dark:text-white">{groups.length}</p>
          <p className="text-xs text-gray-500">Grupos cadastrados</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
          <Boxes className="w-5 h-5 text-emerald-500" />
          <p className="mt-2 text-2xl font-bold dark:text-white">
            {groups.reduce((sum, group) => sum + (group.product_ids?.length || 0), 0)}
          </p>
          <p className="text-xs text-gray-500">Vinculos com produtos</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
          <Layers className="w-5 h-5 text-orange-500" />
          <p className="mt-2 text-2xl font-bold dark:text-white">
            {groups.reduce((sum, group) => sum + (group.options?.length || 0), 0)}
          </p>
          <p className="text-xs text-gray-500">Opcoes disponiveis</p>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center text-gray-400 dark:bg-gray-900 dark:border-gray-700">
          <BadgePlus className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum grupo criado. Cadastre adicionais reutilizaveis para acelerar seu cardapio.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {groups.map((group) => (
            <div key={group.id} className="rounded-2xl border border-gray-100 bg-white p-4 dark:bg-gray-900 dark:border-gray-700">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold dark:text-white">{group.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${group.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {group.is_active ? "Ativo" : "Inativo"}
                    </span>
                    {group.required && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">Obrigatorio</span>}
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {group.type === "single" ? "Escolha unica" : `Multipla escolha ate ${group.max || 1}`} - {group.options?.length || 0} opcoes - {group.product_ids?.length || 0} produtos
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(group.options || []).slice(0, 5).map((option) => (
                      <span key={option.id || option.name} className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {option.name}{option.price > 0 ? ` + ${brl(option.price)}` : ""}
                      </span>
                    ))}
                    {(group.options || []).length > 5 && (
                      <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-gray-800">
                        +{group.options.length - 5}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(group)} className="text-gray-700 dark:text-gray-100">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(group)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? "Editar" : "Novo"} grupo de adicionais</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
              <div>
                <Label>Nome do grupo</Label>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex: Adicionais do lanche" className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <label className="mt-2 flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm dark:border-gray-700">
                  <Switch checked={form.is_active} onCheckedChange={(value) => setForm({ ...form, is_active: value })} />
                  {form.is_active ? "Ativo" : "Inativo"}
                </label>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value, max: value === "single" ? 1 : form.max })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Escolha unica</SelectItem>
                    <SelectItem value="multiple">Multipla escolha</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Switch checked={form.required} onCheckedChange={(value) => setForm({ ...form, required: value, min: value ? Math.max(Number(form.min) || 1, 1) : 0 })} />
                Obrigatorio
              </label>
              <div>
                <Label>Minimo</Label>
                <Input type="number" min="0" value={form.min} onChange={(event) => setForm({ ...form, min: Number(event.target.value) })} className="mt-1" />
              </div>
              <div>
                <Label>Maximo</Label>
                <Input type="number" min="1" disabled={form.type === "single"} value={form.type === "single" ? 1 : form.max} onChange={(event) => setForm({ ...form, max: Number(event.target.value) })} className="mt-1" />
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 p-3 dark:border-gray-700">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <Label>Opcoes</Label>
                  <p className="text-xs text-gray-400">Cadastre cada adicional e seu preco.</p>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={() => setForm({ ...form, options: [...form.options, { id: uid(), name: "", price: 0 }] })}>
                  <Plus className="mr-1 h-3 w-3" /> Opcao
                </Button>
              </div>
              <div className="space-y-2">
                {(form.options || []).map((option) => (
                  <div key={option.id} className="grid grid-cols-[1fr_110px_auto] gap-2">
                    <Input value={option.name} onChange={(event) => updateOption(option.id, { name: event.target.value })} placeholder="Ex: Bacon extra" />
                    <Input type="number" step="0.01" value={option.price} onChange={(event) => updateOption(option.id, { price: Number(event.target.value) })} placeholder="R$" />
                    <Button size="icon" variant="ghost" onClick={() => removeOption(option.id)} className="text-red-500">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 p-3 dark:border-gray-700">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Produtos que terao este adicional</Label>
                  <p className="text-xs text-gray-400">{selectedProducts.length} de {products.length} produtos selecionados.</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={selectAllProducts}>Todos</Button>
                  <Button type="button" size="sm" variant="outline" onClick={clearProducts}>Limpar</Button>
                </div>
              </div>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar produto..." className="pl-9" />
              </div>
              <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {filteredProducts.map((product) => {
                  const active = (form.product_ids || []).includes(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => toggleProduct(product.id)}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${active ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-200" : "border-gray-100 dark:border-gray-700"}`}
                    >
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${active ? "border-indigo-500 bg-indigo-600 text-white" : "border-gray-300 dark:border-gray-600"}`}>
                        {active && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{product.name}</span>
                        <span className="block text-xs text-gray-400">{brl(product.promotional_price || product.price)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving} className="rounded-xl">
              {saving ? "Salvando..." : "Salvar adicionais"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
