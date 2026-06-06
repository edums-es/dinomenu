import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import ImageUpload from "@/components/admin/ImageUpload";
import {
  Plus,
  Pencil,
  Trash2,
  Package,
  X,
  Search,
  Layers,
} from "lucide-react";

const EMPTY_COMBO = {
  name: "",
  description: "",
  price: "",
  image_url: null,
  is_active: true,
  items: [],
};

export default function Combos() {
  const [combos, setCombos] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_COMBO);
  const [saving, setSaving] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productSearchResults, setProductSearchResults] = useState([]);

  const load = async () => {
    try {
      const [combosRes, productsRes] = await Promise.all([
        api.get("/admin/combos"),
        api.get("/admin/products"),
      ]);
      setCombos(combosRes.data);
      setProducts(productsRes.data);
    } catch {
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!productSearch.trim()) {
      setProductSearchResults([]);
      return;
    }
    const q = productSearch.toLowerCase();
    setProductSearchResults(
      products
        .filter(
          (p) =>
            p.name.toLowerCase().includes(q) &&
            !form.items.find((i) => i.product_id === p.id)
        )
        .slice(0, 8)
    );
  }, [productSearch, products, form.items]);

  const openNew = () => {
    setForm({ ...EMPTY_COMBO, items: [] });
    setEditId(null);
    setProductSearch("");
    setProductSearchResults([]);
    setOpen(true);
  };

  const openEdit = (combo) => {
    setForm({
      name: combo.name,
      description: combo.description || "",
      price: String(combo.price),
      image_url: combo.image_url || null,
      is_active: combo.is_active,
      items: combo.items ? combo.items.map((i) => ({ ...i })) : [],
    });
    setEditId(combo.id);
    setProductSearch("");
    setProductSearchResults([]);
    setOpen(true);
  };

  const addItem = (product) => {
    setForm((f) => ({
      ...f,
      items: [
        ...f.items,
        { product_id: product.id, product_name: product.name, quantity: 1 },
      ],
    }));
    setProductSearch("");
    setProductSearchResults([]);
  };

  const updateItemQty = (productId, qty) => {
    setForm((f) => ({
      ...f,
      items: f.items.map((i) =>
        i.product_id === productId
          ? { ...i, quantity: Math.max(1, Number(qty)) }
          : i
      ),
    }));
  };

  const removeItem = (productId) => {
    setForm((f) => ({
      ...f,
      items: f.items.filter((i) => i.product_id !== productId),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome do combo");
    if (!form.price || isNaN(Number(form.price)))
      return toast.error("Informe um preço válido");
    if (form.items.length === 0)
      return toast.error("Adicione pelo menos um item ao combo");

    setSaving(true);
    try {
      const payload = {
        ...form,
        price: Number(form.price),
        items: form.items.map((i) => ({
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
        })),
      };
      if (editId) {
        await api.put(`/admin/combos/${editId}`, payload);
        toast.success("Combo atualizado");
      } else {
        await api.post("/admin/combos", payload);
        toast.success("Combo criado");
      }
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar combo");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir este combo?")) return;
    try {
      await api.delete(`/admin/combos/${id}`);
      toast.success("Combo excluído");
      load();
    } catch {
      toast.error("Erro ao excluir combo");
    }
  };

  const toggleActive = async (combo) => {
    try {
      await api.put(`/admin/combos/${combo.id}`, {
        ...combo,
        is_active: !combo.is_active,
      });
      setCombos((prev) =>
        prev.map((c) =>
          c.id === combo.id ? { ...c, is_active: !c.is_active } : c
        )
      );
      toast.success(
        !combo.is_active ? "Combo ativado" : "Combo desativado"
      );
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Layers className="animate-pulse w-8 h-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-2xl text-gray-900 dark:text-white">
          Combos
        </h1>
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Combo
        </Button>
      </div>

      {combos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Layers className="w-12 h-12 text-gray-300 dark:text-gray-700 mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            Nenhum combo cadastrado
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-600 mt-1">
            Clique em "Novo Combo" para começar
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {combos.map((combo) => (
            <div
              key={combo.id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden flex flex-col"
            >
              {combo.image_url && (
                <img
                  src={combo.image_url}
                  alt={combo.name}
                  className="w-full h-40 object-cover"
                />
              )}
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white leading-tight">
                    {combo.name}
                  </h3>
                  <Badge
                    className={
                      combo.is_active
                        ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 border-green-300 dark:border-green-700 shrink-0"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 shrink-0"
                    }
                  >
                    {combo.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>

                {combo.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                    {combo.description}
                  </p>
                )}

                <p className="text-lg font-bold mb-3" style={{color:"#D4AF37"}}>
                  {brl(combo.price)}
                </p>

                {combo.items && combo.items.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                      Itens do combo
                    </p>
                    <ul className="space-y-1">
                      {combo.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1.5"
                        >
                          <Package className="w-3.5 h-3.5 text-gray-400" />
                          <span>{item.product_name}</span>
                          <span className="text-gray-400 ml-auto">
                            x{item.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleActive(combo)}
                    className="flex-1 dark:border-gray-600 dark:text-gray-200"
                  >
                    {combo.is_active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(combo)}
                    className="dark:border-gray-600 dark:text-gray-200"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remove(combo.id)}
                    className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300 dark:border-red-900 dark:text-red-400 dark:hover:border-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl dark:bg-gray-900 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="dark:text-white">
              {editId ? "Editar Combo" : "Novo Combo"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">Nome do Combo *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Combo Família Marisco"
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">Descrição</Label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Descreva o combo..."
                rows={2}
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">Preço *</Label>
              <Input
                type="number"
                step="0.01"
                min={0}
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
                placeholder="0.00"
                className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="dark:text-gray-200">Imagem</Label>
              <ImageUpload
                value={form.image_url}
                onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
              />
            </div>

            <div className="space-y-3">
              <Label className="dark:text-gray-200">Itens do Combo *</Label>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar produto para adicionar..."
                  className="pl-9 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                />
                {productSearchResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg overflow-hidden">
                    {productSearchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addItem(p)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm text-left"
                      >
                        <span className="text-gray-900 dark:text-white">
                          {p.name}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {brl(p.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.items.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-600 text-center py-4 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                  Nenhum item adicionado
                </p>
              ) : (
                <div className="space-y-2">
                  {form.items.map((item) => (
                    <div
                      key={item.product_id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
                    >
                      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                        {item.product_name}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            updateItemQty(item.product_id, item.quantity - 1)
                          }
                          className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm font-semibold text-gray-900 dark:text-white">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateItemQty(item.product_id, item.quantity + 1)
                          }
                          className="w-6 h-6 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(item.product_id)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Label className="dark:text-gray-200">Status</Label>
              <Select
                value={form.is_active ? "active" : "inactive"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, is_active: v === "active" }))
                }
              >
                <SelectTrigger className="w-40 dark:bg-gray-800 dark:border-gray-600 dark:text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark:bg-gray-800 dark:border-gray-700">
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="dark:border-gray-600 dark:text-gray-200"
            >
              Cancelar
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Salvando..." : editId ? "Salvar Alterações" : "Criar Combo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
