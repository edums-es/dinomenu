import { useEffect, useState } from "react";
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
import { Plus, Trash2, Image as ImageIcon } from "lucide-react";

const EMPTY = { image_url: null, title: "", subtitle: "", is_active: true, sort_order: 0 };

export default function Banners() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/banners").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

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

  return (
    <div className="space-y-5" data-testid="admin-banners">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Banners</h1>
        <Button onClick={openNew} data-testid="new-banner-btn" className="bg-[#111827] rounded-xl"><Plus className="w-4 h-4 mr-1" /> Novo</Button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhum banner cadastrado.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((b) => (
            <div key={b.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden" data-testid={`banner-row-${b.id}`}>
              {b.image_url && <img src={b.image_url} alt={b.title} className="w-full h-32 object-cover" />}
              <div className="p-4 flex justify-between items-center">
                <div><p className="font-medium">{b.title}</p><p className="text-xs text-gray-400">{b.subtitle} · {b.is_active ? "Ativo" : "Inativo"}</p></div>
                <div className="flex gap-1">
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
