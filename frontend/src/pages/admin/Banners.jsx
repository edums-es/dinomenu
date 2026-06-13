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
import ImageUpload from "@/components/admin/ImageUpload";
import { Plus, Trash2, Image as ImageIcon, GripVertical, Loader2, ChevronUp, ChevronDown } from "lucide-react";

const EMPTY = { image_url: null, title: "", subtitle: "", is_active: true, sort_order: 0 };

export default function Banners() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const latestItemsRef = useRef([]);

  const load = () => api.get("/admin/banners").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => { latestItemsRef.current = items; }, [items]);

  const openNew = () => { setForm(EMPTY); setEditId(null); setOpen(true); };
  const openEdit = (b) => { setForm(b); setEditId(b.id); setOpen(true); };

  const save = async () => {
    const payload = { ...form, sort_order: Number(form.sort_order) || 0 };
    if (editId) await api.put(`/admin/banners/${editId}`, payload);
    else await api.post("/admin/banners", payload);
    toast.success("Banner salvo"); setOpen(false); load();
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir banner?")) return;
    await api.delete(`/admin/banners/${id}`); toast.success("Banner excluído"); load();
  };

  const persistOrder = async () => {
    setSavingOrder(true);
    try {
      await api.put("/admin/banners/reorder", { banner_ids: latestItemsRef.current.map((item) => item.id) });
      toast.success("Ordem dos banners salva");
      load();
    } catch {
      toast.error("Nao foi possivel salvar a ordem");
      load();
    } finally {
      setSavingOrder(false);
      setDragId(null);
    }
  };

  const onDragOverBanner = (event, targetId) => {
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

  const moveBanner = async (bannerId, delta) => {
    const next = [...items];
    const fromIndex = next.findIndex((item) => item.id === bannerId);
    const toIndex = fromIndex + delta;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= next.length) return;
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    const ordered = next.map((item, index) => ({ ...item, sort_order: index + 1 }));
    latestItemsRef.current = ordered;
    setItems(ordered);
    await persistOrder();
  };

  return (
    <div className="space-y-5" data-testid="admin-banners">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Banners</h1>
          <p className="text-sm text-gray-500 mt-1">Arraste os cards para definir a ordem no cardapio.</p>
        </div>
        <Button onClick={openNew} data-testid="new-banner-btn" className="w-full sm:w-auto min-h-11 bg-[#111827] rounded-xl"><Plus className="w-4 h-4 mr-1" /> Novo</Button>
      </div>

      {savingOrder && (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <Loader2 className="w-4 h-4 animate-spin" /> Salvando nova ordem...
        </div>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhum banner cadastrado.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((b) => (
            <div key={b.id}
              draggable
              onDragStart={() => setDragId(b.id)}
              onDragOver={(event) => onDragOverBanner(event, b.id)}
              onDrop={(event) => { event.preventDefault(); persistOrder(); }}
              onDragEnd={() => setDragId(null)}
              className={`bg-white rounded-2xl border border-gray-100 overflow-hidden transition-colors ${dragId === b.id ? "ring-2 ring-emerald-500" : ""}`}
              data-testid={`banner-row-${b.id}`}>
              {b.image_url && <img src={b.image_url} alt={b.title} className="w-full h-32 object-cover" />}
              <div className="p-3 sm:p-4 flex flex-wrap justify-between items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <button type="button" aria-label="Arrastar banner" className="h-9 w-8 shrink-0 grid place-items-center text-gray-400 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-5 h-5" />
                  </button>
                  <div className="min-w-0"><p className="font-medium truncate">{b.title}</p><p className="text-xs text-gray-400 truncate">{b.subtitle} · Posicao {b.sort_order} · {b.is_active ? "Ativo" : "Inativo"}</p></div>
                </div>
                <div className="flex gap-1 ml-auto">
                  <div className="flex md:hidden">
                    <Button size="icon" variant="ghost" onClick={() => moveBanner(b.id, -1)} disabled={items[0]?.id === b.id} aria-label="Subir banner"><ChevronUp className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => moveBanner(b.id, 1)} disabled={items[items.length - 1]?.id === b.id} aria-label="Descer banner"><ChevronDown className="w-4 h-4" /></Button>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Editar</Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(b.id)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editId ? "Editar" : "Novo"} banner</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} label="Imagem" />
            <div><Label>Título</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="banner-title" className="mt-1" /></div>
            <div><Label>Subtítulo</Label><Input value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="mt-1" /></div>
            <div className="flex items-center justify-between"><Label>Ativo</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-banner" className="bg-[#111827] rounded-xl">Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
