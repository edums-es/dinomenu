import { useEffect, useMemo, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import ImageUpload from "@/components/admin/ImageUpload";
import { Plus, Pencil, Trash2, UtensilsCrossed, X, Download, Upload, Search, SlidersHorizontal } from "lucide-react";

const EMPTY = {
  name: "", description: "", image_url: null, price: 0, promotional_price: null,
  category_id: "", is_available: true, is_featured: false, is_best_seller: false,
  sort_order: 0, option_groups: [],
};

const uid = () => Math.random().toString(36).slice(2);

export default function Products() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");

  const load = () => {
    api.get("/admin/products").then((r) => setItems(Array.isArray(r.data) ? r.data : [])).catch(() => setItems([]));
    api.get("/admin/categories").then((r) => setCats(Array.isArray(r.data) ? r.data : [])).catch(() => setCats([]));
  };
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((p) => {
      const matchesSearch = !term
        || String(p.name || "").toLowerCase().includes(term)
        || String(p.description || "").toLowerCase().includes(term);
      const matchesCategory = categoryFilter === "all"
        || (categoryFilter === "uncategorized" ? !p.category_id : p.category_id === categoryFilter);
      const matchesAvailability = availabilityFilter === "all"
        || (availabilityFilter === "available" ? p.is_available : !p.is_available);
      return matchesSearch && matchesCategory && matchesAvailability;
    });
  }, [items, search, categoryFilter, availabilityFilter]);

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setAvailabilityFilter("all");
  };

  const catName = (id) => cats.find((c) => c.id === id)?.name || "—";

  const openNew = () => { setForm({ ...EMPTY, category_id: cats[0]?.id || "" }); setEditId(null); setOpen(true); };
  const openEdit = (p) => { setForm({ ...EMPTY, ...p }); setEditId(p.id); setOpen(true); };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do produto");
    if (!form.price && form.price !== 0) return toast.error("Informe o preço");
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || "",
        image_url: form.image_url || null,
        price: Number(form.price) || 0,
        promotional_price: form.promotional_price ? Number(form.promotional_price) : null,
        wholesale_price: form.wholesale_price ? Number(form.wholesale_price) : null,
        category_id: form.category_id || null,
        is_available: Boolean(form.is_available),
        is_featured: Boolean(form.is_featured),
        is_best_seller: Boolean(form.is_best_seller),
        sort_order: Number(form.sort_order) || 0,
        option_groups: form.option_groups || [],
        track_stock: Boolean(form.track_stock),
        stock_quantity: Number(form.stock_quantity) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 5,
      };
      if (editId) await api.put(`/admin/products/${editId}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Produto salvo");
      setOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir produto?")) return;
    await api.delete(`/admin/products/${id}`); toast.success("Produto excluído"); load();
  };

  const toggleAvailable = async (p) => {
    await api.put(`/admin/products/${p.id}`, { ...p, is_available: !p.is_available });
    load();
  };

  // option group helpers
  const addGroup = () => setForm((f) => ({ ...f, option_groups: [...f.option_groups, { id: uid(), name: "", type: "single", required: false, min: 0, max: 1, options: [] }] }));
  const updGroup = (gid, patch) => setForm((f) => ({ ...f, option_groups: f.option_groups.map((g) => g.id === gid ? { ...g, ...patch } : g) }));
  const delGroup = (gid) => setForm((f) => ({ ...f, option_groups: f.option_groups.filter((g) => g.id !== gid) }));
  const addOption = (gid) => updGroupOptions(gid, (opts) => [...opts, { id: uid(), name: "", price: 0 }]);
  const updOption = (gid, oid, patch) => updGroupOptions(gid, (opts) => opts.map((o) => o.id === oid ? { ...o, ...patch } : o));
  const delOption = (gid, oid) => updGroupOptions(gid, (opts) => opts.filter((o) => o.id !== oid));
  const updGroupOptions = (gid, fn) => setForm((f) => ({ ...f, option_groups: f.option_groups.map((g) => g.id === gid ? { ...g, options: fn(g.options) } : g) }));


  const exportExcel = async () => {
    try {
      const res = await api.get("/admin/products/export", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = "produtos.xlsx"; a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Exportado com sucesso!");
    } catch { toast.error("Erro ao exportar"); }
  };

  const importExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await api.post("/admin/products/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Importados: ${r.data.imported}, Atualizados: ${r.data.updated}`);
      load();
    } catch { toast.error("Erro ao importar"); }
    e.target.value = "";
  };

  return (
    <div className="space-y-5" data-testid="admin-products">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display font-bold text-2xl dark:text-white">Produtos</h1>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" /> Importar Excel
            <input type="file" accept=".xlsx" className="hidden" onChange={importExcel} />
          </label>
          <Button variant="outline" onClick={exportExcel} className="border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100">
            <Download className="w-4 h-4 mr-1.5" /> Exportar Excel
          </Button>
          <Button onClick={openNew} data-testid="new-product-btn" className="bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white"><Plus className="w-4 h-4 mr-1" /> Novo produto</Button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          <SlidersHorizontal className="w-4 h-4 text-emerald-500" /> Filtros
          <span className="text-xs font-normal text-gray-400">
            {filteredItems.length} de {items.length} produtos
          </span>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou descricao"
              className="pl-9 dark:bg-gray-950 dark:border-gray-700 dark:text-white"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="dark:bg-gray-950 dark:border-gray-700 dark:text-white">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              <SelectItem value="uncategorized">Sem categoria</SelectItem>
              {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
            <SelectTrigger className="dark:bg-gray-950 dark:border-gray-700 dark:text-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="available">Disponiveis</SelectItem>
              <SelectItem value="unavailable">Indisponiveis</SelectItem>
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            className="border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            Limpar
          </Button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border dark:border-gray-700 p-12 text-center text-gray-400">
          <UtensilsCrossed className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Você ainda não cadastrou nenhum produto. Comece adicionando o primeiro item do seu cardápio.</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhum produto encontrado com esses filtros.</p>
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            className="mt-4 border-gray-200 text-gray-800 dark:border-gray-700 dark:text-gray-100"
          >
            Limpar filtros
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredItems.map((p) => (
            <div key={p.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-3 flex gap-3 items-center" data-testid={`product-row-${p.id}`}>
              <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{catName(p.category_id)} · {brl(p.promotional_price || p.price)}</p>
                <div className="flex gap-1 mt-1">
                  {p.is_best_seller && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 rounded">Mais vendido</span>}
                  {p.is_featured && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 rounded">Destaque</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={p.is_available} onCheckedChange={() => toggleAvailable(p)} data-testid={`toggle-available-${p.id}`} />
                <Button size="icon" variant="ghost" onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`} className="text-gray-700 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(p.id)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editId ? "Editar" : "Novo"} produto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} label="Foto do produto" />
            <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="product-name" className="mt-1" /></div>
            <div><Label>Descrição</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 resize-none" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Preço</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="product-price" className="mt-1" /></div>
              <div><Label>Preço promocional</Label><Input type="number" step="0.01" value={form.promotional_price || ""} onChange={(e) => setForm({ ...form, promotional_price: e.target.value })} className="mt-1" /></div>
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger data-testid="product-category" className="mt-1"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_available} onCheckedChange={(v) => setForm({ ...form, is_available: v })} /> Disponível</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_featured} onCheckedChange={(v) => setForm({ ...form, is_featured: v })} /> Destaque</label>
              <label className="flex items-center gap-2 text-sm"><Switch checked={form.is_best_seller} onCheckedChange={(v) => setForm({ ...form, is_best_seller: v })} /> Mais vendido</label>
            </div>

            {/* Option groups */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-2">
                <Label>Grupos de adicionais</Label>
                <Button size="sm" variant="outline" onClick={addGroup} data-testid="add-group-btn"><Plus className="w-3 h-3 mr-1" /> Grupo</Button>
              </div>
              <div className="space-y-3">
                {form.option_groups.map((g) => (
                  <div key={g.id} className="border rounded-xl p-3 bg-gray-50 space-y-2">
                    <div className="flex gap-2">
                      <Input value={g.name} onChange={(e) => updGroup(g.id, { name: e.target.value })} placeholder="Nome do grupo (ex: Ponto da carne)" className="bg-white" />
                      <Button size="icon" variant="ghost" onClick={() => delGroup(g.id)} className="text-red-500 shrink-0"><X className="w-4 h-4" /></Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <Select value={g.type} onValueChange={(v) => updGroup(g.id, { type: v, max: v === "single" ? 1 : g.max })}>
                        <SelectTrigger className="h-8 w-32 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="single">Escolha única</SelectItem><SelectItem value="multiple">Múltipla</SelectItem></SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5"><Switch checked={g.required} onCheckedChange={(v) => updGroup(g.id, { required: v, min: v ? 1 : 0 })} /> Obrigatório</label>
                      {g.type === "multiple" && (
                        <span className="flex items-center gap-1">Máx <Input type="number" value={g.max} onChange={(e) => updGroup(g.id, { max: Number(e.target.value) })} className="h-8 w-14 bg-white" /></span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {g.options.map((o) => (
                        <div key={o.id} className="flex gap-2">
                          <Input value={o.name} onChange={(e) => updOption(g.id, o.id, { name: e.target.value })} placeholder="Opção" className="bg-white h-8" />
                          <Input type="number" step="0.01" value={o.price} onChange={(e) => updOption(g.id, o.id, { price: Number(e.target.value) })} placeholder="R$" className="bg-white h-8 w-24" />
                          <Button size="icon" variant="ghost" onClick={() => delOption(g.id, o.id)} className="text-red-400 h-8 w-8 shrink-0"><X className="w-3 h-3" /></Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" onClick={() => addOption(g.id)} className="text-xs h-7"><Plus className="w-3 h-3 mr-1" /> Adicionar opção</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} disabled={saving} data-testid="save-product" className="rounded-xl">{saving ? "Salvando..." : "Salvar produto"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
