import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, FolderTree, GripVertical, Loader2 } from "lucide-react";

const EMPTY = { name: "", icon: "", sort_order: 0, is_active: true };

export default function Categories() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const latestItemsRef = useRef([]);

  const load = () => api.get("/admin/categories").then((r) => setItems(Array.isArray(r.data) ? r.data : []));
  useEffect(() => { load(); }, []);
  useEffect(() => { latestItemsRef.current = items; }, [items]);

  const openNew = () => {
    setForm({ ...EMPTY, sort_order: items.length + 1 });
    setEditId(null);
    setOpen(true);
  };
  const openEdit = (c) => {
    setForm(c);
    setEditId(c.id);
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Informe o nome");
    const payload = {
      name: form.name,
      icon: form.icon,
      sort_order: Number(form.sort_order) || items.length + 1,
      is_active: form.is_active,
    };
    if (editId) await api.put(`/admin/categories/${editId}`, payload);
    else await api.post("/admin/categories", payload);
    toast.success("Categoria salva");
    setOpen(false);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir categoria e seus produtos?")) return;
    await api.delete(`/admin/categories/${id}`);
    toast.success("Categoria excluida");
    load();
  };

  const persistOrder = async (nextItems) => {
    setSavingOrder(true);
    try {
      await api.put("/admin/categories/reorder", { category_ids: nextItems.map((item) => item.id) });
      toast.success("Ordem das categorias salva");
    } catch {
      toast.error("Nao foi possivel salvar a ordem");
      load();
    } finally {
      setSavingOrder(false);
      setDragId(null);
    }
  };

  const onDragOverCategory = (event, targetId) => {
    event.preventDefault();
    if (!dragId || dragId === targetId) return;
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === dragId);
      const toIndex = current.findIndex((item) => item.id === targetId);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      const ordered = next.map((item, index) => ({ ...item, sort_order: index + 1 }));
      latestItemsRef.current = ordered;
      return ordered;
    });
  };

  const onDropCategory = (event) => {
    event.preventDefault();
    persistOrder(latestItemsRef.current);
  };

  return (
    <div className="space-y-5" data-testid="admin-categories">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl dark:text-white">Categorias</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Arraste pela alca para mudar a ordem no cardapio.
          </p>
        </div>
        <Button
          type="button"
          onClick={openNew}
          data-testid="new-category-btn"
          className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl"
        >
          <Plus className="w-4 h-4 mr-1" /> Nova categoria
        </Button>
      </div>

      {savingOrder && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Salvando nova ordem...
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center text-gray-400">
          <FolderTree className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>Nenhuma categoria cadastrada. Crie a primeira para organizar seu cardapio.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
          {items.map((c) => (
            <div
              key={c.id}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragOver={(event) => onDragOverCategory(event, c.id)}
              onDrop={onDropCategory}
              onDragEnd={() => setDragId(null)}
              className={`flex items-center justify-between gap-3 p-4 transition-colors ${dragId === c.id ? "bg-emerald-50 dark:bg-emerald-950/20" : "hover:bg-gray-50 dark:hover:bg-gray-800/60"}`}
              data-testid={`category-row-${c.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  className="h-10 w-10 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 grid place-items-center cursor-grab active:cursor-grabbing bg-white dark:bg-gray-950"
                  aria-label="Arrastar categoria"
                >
                  <GripVertical className="w-5 h-5" />
                </button>
                <div className="min-w-0">
                  <p className="font-medium dark:text-white truncate">{c.name}</p>
                  <p className="text-xs text-gray-400">Posicao {c.sort_order} · {c.is_active ? "Ativa" : "Inativa"}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => openEdit(c)}
                  data-testid={`edit-category-${c.id}`}
                  className="text-gray-700 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(c.id)}
                  data-testid={`delete-category-${c.id}`}
                  className="text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editId ? "Editar" : "Nova"} categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="category-name"
                className="mt-1"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativa</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} data-testid="save-category" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
