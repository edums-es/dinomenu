import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { brl } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Search, Edit2, Trash2, ShoppingCart, X, ChevronDown } from "lucide-react";
import { maskPhone, maskCNPJ } from "@/lib/masks";

const BRAND = "#D4AF37";
const ring = "focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]";

const EMPTY_SUPPLIER = {
  name: "", contact_name: "", phone: "", email: "", cnpj: "", address: "", notes: ""
};

function SupplierModal({ supplier, onClose, onSaved }) {
  const isEdit = !!supplier?.id;
  const [form, setForm] = useState(supplier ? { ...supplier } : { ...EMPTY_SUPPLIER });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Nome obrigatório"); return; }
    setLoading(true);
    try {
      if (isEdit) {
        await api.put(`/admin/suppliers/${supplier.id}`, form);
        toast.success("Fornecedor atualizado!");
      } else {
        await api.post("/admin/suppliers", form);
        toast.success("Fornecedor criado!");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao salvar fornecedor");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "name",         label: "Nome",     required: true, placeholder: "Nome do fornecedor" },
    { key: "contact_name", label: "Contato",               placeholder: "Nome do responsável" },
    { key: "phone",        label: "Telefone",  mask: maskPhone,  maxLength: 15, placeholder: "(00) 00000-0000" },
    { key: "email",        label: "E-mail",                  placeholder: "fornecedor@email.com" },
    { key: "cnpj",         label: "CNPJ",      mask: maskCNPJ,   maxLength: 18, placeholder: "00.000.000/0001-00" },
    { key: "address",      label: "Endereço",               placeholder: "Rua, número, bairro" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEdit ? "Editar Fornecedor" : "Novo Fornecedor"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {f.label} {f.required && <span className="text-red-500">*</span>}
              </label>
              <input
                type="text"
                value={form[f.key] || ""}
                onChange={(e) => set(f.key, f.mask ? f.mask(e.target.value) : e.target.value)}
                maxLength={f.maxLength}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                placeholder={f.placeholder}
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] resize-none"
              placeholder="Observações sobre o fornecedor..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 bg-[#D4AF37] hover:bg-[#B8860B] rounded-lg text-[#0B0B0F] font-semibold disabled:opacity-50">
              {loading ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PurchaseModal({ supplier, onClose, onSaved }) {
  const [products, setProducts] = useState([]);
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    api.get("/admin/products").then((r) => setProducts(r.data || [])).catch(() => {});
  }, []);

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = (product) => {
    setItems((prev) => {
      const exists = prev.find((i) => i.product_id === product.id);
      if (exists) return prev.map((i) => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: product.id, product_name: product.name, quantity: 1, unit_cost: 0 }];
    });
    setProductSearch("");
    setShowDropdown(false);
  };

  const removeItem = (idx) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, key, val) => setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [key]: val } : item));

  const total = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.unit_cost) || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.length === 0) { toast.error("Adicione pelo menos um item"); return; }
    setLoading(true);
    try {
      await api.post(`/admin/suppliers/${supplier.id}/purchase`, {
        items: items.map((i) => ({ product_id: i.product_id, quantity: parseFloat(i.quantity), unit_cost: parseFloat(i.unit_cost) })),
        notes
      });
      toast.success("Compra registrada! Estoque atualizado.");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao registrar compra");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Registrar Compra</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{supplier.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Busca de produto */}
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adicionar produto</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
                placeholder="Buscar produto..."
              />
            </div>
            {showDropdown && productSearch && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filtered.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400">Nenhum produto encontrado</p>
                ) : filtered.slice(0, 20).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={() => addItem(p)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 text-sm text-gray-900 dark:text-white"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Itens */}
          {items.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 dark:text-gray-400 px-1">
                <span className="col-span-5">Produto</span>
                <span className="col-span-3 text-center">Quantidade</span>
                <span className="col-span-3 text-center">Custo unit.</span>
                <span className="col-span-1"></span>
              </div>
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
                  <span className="col-span-5 text-sm text-gray-900 dark:text-white truncate">{item.product_name}</span>
                  <input
                    type="number"
                    min="1"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", e.target.value)}
                    className="col-span-3 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_cost}
                    onChange={(e) => updateItem(idx, "unit_cost", e.target.value)}
                    className="col-span-3 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-center text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    placeholder="0,00"
                  />
                  <button type="button" onClick={() => removeItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center">
                    <X size={16} />
                  </button>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                  Total: <span className="text-[#D4AF37]">{brl(total)}</span>
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37] resize-none text-sm"
              placeholder="Observações sobre a compra..."
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
            <button type="submit" disabled={loading || items.length === 0} className="flex-1 px-4 py-2 bg-[#D4AF37] hover:bg-[#B8860B] rounded-lg text-[#0B0B0F] font-semibold disabled:opacity-50">
              {loading ? "Registrando..." : `Registrar — ${brl(total)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [purchaseModal, setPurchaseModal] = useState(null);

  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await api.get("/admin/suppliers");
      setSuppliers(res.data || []);
    } catch { toast.error("Erro ao carregar fornecedores"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  const handleDelete = async (s) => {
    if (!window.confirm(`Excluir fornecedor "${s.name}"?`)) return;
    try {
      await api.delete(`/admin/suppliers/${s.id}`);
      toast.success("Fornecedor excluído");
      fetchSuppliers();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Erro ao excluir");
    }
  };

  const filtered = suppliers.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.contact_name || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar fornecedor..."
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
          />
        </div>
        <button
          onClick={() => setModal({ ...EMPTY_SUPPLIER })}
          className="flex items-center gap-2 px-4 py-2 bg-[#D4AF37] hover:bg-[#B8860B] text-[#0B0B0F] rounded-lg font-semibold text-sm transition-colors"
        >
          <Plus size={16} /> Novo Fornecedor
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37] border-t-transparent"></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          {search ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400">Nome</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">Contato</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400 hidden sm:table-cell">Telefone</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">CNPJ</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500 dark:text-gray-400 hidden lg:table-cell">E-mail</th>
                <th className="py-3 px-4"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{s.name}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400 hidden md:table-cell">{s.contact_name || "—"}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{s.phone || "—"}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400 hidden lg:table-cell">{s.cnpj || "—"}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-400 hidden lg:table-cell">{s.email || "—"}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setPurchaseModal(s)}
                        className="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                        title="Registrar Compra"
                      >
                        <ShoppingCart size={16} />
                      </button>
                      <button
                        onClick={() => setModal(s)}
                        className="p-1.5 text-gray-400 hover:text-[#D4AF37] hover:bg-yellow-50 dark:hover:bg-yellow-900/10 rounded-lg"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && <SupplierModal supplier={modal} onClose={() => setModal(null)} onSaved={fetchSuppliers} />}
      {purchaseModal && <PurchaseModal supplier={purchaseModal} onClose={() => setPurchaseModal(null)} onSaved={fetchSuppliers} />}
    </div>
  );
}

function PurchasesTab() {
  const [purchases, setPurchases] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSupplier, setFilterSupplier] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [supRes] = await Promise.all([api.get("/admin/suppliers")]);
        const sups = supRes.data || [];
        setSuppliers(sups);
        const allPurchases = [];
        await Promise.all(
          sups.map(async (s) => {
            try {
              const r = await api.get(`/admin/suppliers/${s.id}/purchases`);
              (r.data || []).forEach((p) => allPurchases.push({ ...p, supplier_name: s.name, supplier_id: s.id }));
            } catch {}
          })
        );
        allPurchases.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        setPurchases(allPurchases);
      } catch { toast.error("Erro ao carregar compras"); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const filtered = filterSupplier
    ? purchases.filter((p) => String(p.supplier_id) === String(filterSupplier))
    : purchases;

  const formatDate = (d) => d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 focus:border-[#D4AF37]"
        >
          <option value="">Todos os fornecedores</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37] border-t-transparent"></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">Nenhuma compra encontrada</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p, i) => (
            <div key={p.id || i} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
              <button
                className="w-full flex items-center justify-between p-4 text-left"
                onClick={() => setExpanded(expanded === (p.id || i) ? null : (p.id || i))}
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-white">{p.supplier_name}</span>
                  <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">{formatDate(p.created_at)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-green-600">{brl(p.total_cost || p.total || 0)}</span>
                  <ChevronDown size={16} className={`text-gray-400 transition-transform ${expanded === (p.id || i) ? "rotate-180" : ""}`} />
                </div>
              </button>
              {expanded === (p.id || i) && (
                <div className="border-t border-gray-100 dark:border-gray-700 p-4">
                  {p.notes && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 italic">{p.notes}</p>}
                  {(p.items || []).length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="text-left py-2 font-medium text-gray-500 dark:text-gray-400">Produto</th>
                          <th className="text-right py-2 font-medium text-gray-500 dark:text-gray-400">Qtd</th>
                          <th className="text-right py-2 font-medium text-gray-500 dark:text-gray-400">Custo unit.</th>
                          <th className="text-right py-2 font-medium text-gray-500 dark:text-gray-400">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.items.map((item, j) => (
                          <tr key={j} className="border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                            <td className="py-2 text-gray-700 dark:text-gray-300">{item.product_name || item.name}</td>
                            <td className="py-2 text-right text-gray-700 dark:text-gray-300">{item.quantity}</td>
                            <td className="py-2 text-right text-gray-700 dark:text-gray-300">{brl(item.unit_cost)}</td>
                            <td className="py-2 text-right font-medium text-gray-900 dark:text-white">{brl((item.quantity || 0) * (item.unit_cost || 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-400">Sem detalhes de itens</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Suppliers() {
  const [tab, setTab] = useState("fornecedores");

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestão de Fornecedores</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Gerencie fornecedores e registre compras</p>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-0">
          {[
            { key: "fornecedores", label: "Fornecedores" },
            { key: "compras", label: "Compras" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? "border-[#D4AF37] text-[#D4AF37]"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "fornecedores" ? <SuppliersTab /> : <PurchasesTab />}
    </div>
  );
}
