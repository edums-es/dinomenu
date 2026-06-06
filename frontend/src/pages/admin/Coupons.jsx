import { useEffect, useState } from "react";
import api from "@/lib/api";
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
import { Plus, Trash2, Ticket } from "lucide-react";

const EMPTY = { code: "", discount_type: "percent", discount_value: 10, min_order: 0, usage_limit: "", is_active: true, free_delivery: false };

export default function Coupons() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);

  const load = () => api.get("/admin/coupons").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(EMPTY); setEditId(null); setOpen(true); };
  const openEdit = (c) => { setForm({ ...c, usage_limit: c.usage_limit || "" }); setEditId(c.id); setOpen(true); };

  const save = async () => {
    if (!form.code.trim()) return toast.error("Informe o código");
    const payload = {
      code: form.code, discount_type: form.discount_type,
      discount_value: Number(form.discount_value) || 0, min_order: Number(form.min_order) || 0,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      is_active: form.is_active, free_delivery: form.free_delivery,
    };
    if (editId) await api.put(`/admin/coupons/${editId}`, payload);
    else await api.post("/admin/coupons", payload);
    toast.success("Cupom salvo"); setOpen(false); load();
  };

  const remove = async (id) => {
    if (!window.confirm("Excluir cupom?")) return;
    await api.delete(`/admin/coupons/${id}`); toast.success("Cupom excluído"); load();
  };

  return (
    <div className="space-y-5" data-testid="admin-coupons">
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-2xl">Cupons</h1>
        <Button onClick={openNew} data-testid="new-coupon-btn" className="bg-[#111827] rounded-xl"><Plus className="w-4 h-4 mr-1" /> Novo</Button>
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border p-12 text-center text-gray-400">
          <Ticket className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Nenhum cupom criado.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-4" data-testid={`coupon-row-${c.id}`}>
              <div className="flex justify-between items-start">
                <span className="font-display font-bold tracking-wide brand-text text-[#EF4444]">{c.code}</span>
                <Button size="icon" variant="ghost" onClick={() => remove(c.id)} className="text-red-500 h-7 w-7"><Trash2 className="w-4 h-4" /></Button>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {c.free_delivery ? "Frete grátis" : c.discount_type === "percent" ? `${c.discount_value}% off` : `${brl(c.discount_value)} off`}
              </p>
              <p className="text-xs text-gray-400">Mín. {brl(c.min_order)} · Usado {c.used_count || 0}x · {c.is_active ? "Ativo" : "Inativo"}</p>
              <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => openEdit(c)}>Editar</Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">{editId ? "Editar" : "Novo"} cupom</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Código</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} data-testid="coupon-code" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="percent">Percentual</SelectItem><SelectItem value="fixed">Valor fixo</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Valor</Label><Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Pedido mínimo</Label><Input type="number" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} className="mt-1" /></div>
              <div><Label>Limite de uso</Label><Input type="number" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} placeholder="∞" className="mt-1" /></div>
            </div>
            <div className="flex items-center justify-between"><Label>Frete grátis</Label><Switch checked={form.free_delivery} onCheckedChange={(v) => setForm({ ...form, free_delivery: v })} /></div>
            <div className="flex items-center justify-between"><Label>Ativo</Label><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /></div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-coupon" className="bg-[#111827] rounded-xl">Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
