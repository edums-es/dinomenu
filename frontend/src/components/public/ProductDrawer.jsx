import { useState, useMemo, useEffect } from "react";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Minus, Plus, Check } from "lucide-react";
import { brl } from "@/lib/format";

export default function ProductDrawer({ product, open, onOpenChange, onAdd, themeVars = {} }) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selected, setSelected] = useState({}); // groupId -> [optionId]

  useEffect(() => {
    if (open) {
      setQuantity(1);
      setNotes("");
      setSelected({});
    }
  }, [open, product]);

  const groups = useMemo(() => product?.option_groups || [], [product]);
  const basePrice = product
    ? product.promotional_price != null && product.promotional_price > 0
      ? product.promotional_price
      : product.price
    : 0;

  const toggleOption = (group, optionId) => {
    setSelected((prev) => {
      const cur = prev[group.id] || [];
      if (group.type === "single") {
        return { ...prev, [group.id]: [optionId] };
      }
      if (cur.includes(optionId)) {
        return { ...prev, [group.id]: cur.filter((o) => o !== optionId) };
      }
      if (group.max && cur.length >= group.max) return prev;
      return { ...prev, [group.id]: [...cur, optionId] };
    });
  };

  const { selectedOptions, optionsPrice, missingGroup } = useMemo(() => {
    let price = 0;
    const opts = [];
    let missing = null;
    groups.forEach((g) => {
      const chosen = selected[g.id] || [];
      if (g.required && chosen.length < Math.max(1, g.min || 1)) missing = g.name;
      chosen.forEach((oid) => {
        const opt = g.options.find((o) => o.id === oid);
        if (opt) {
          price += opt.price || 0;
          opts.push({ group: g.name, name: opt.name, price: opt.price || 0 });
        }
      });
    });
    return { selectedOptions: opts, optionsPrice: price, missingGroup: missing };
  }, [selected, groups]);

  const unitPrice = basePrice + optionsPrice;

  const handleAdd = () => {
    onAdd({
      product,
      quantity,
      notes,
      selectedOptions,
      unitPrice,
    });
    onOpenChange(false);
  };

  if (!product) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-w-md mx-auto max-h-[92vh] flex flex-col dark"
        style={{
          ...themeVars,
          background:"#111111",
          color:"var(--menu-text, #f0f0f0)",
          borderColor:"rgba(255,255,255,0.1)",
        }}
      >
        <div className="overflow-y-auto flex-1 min-h-0">
          {product.image_url && (
            <img src={product.image_url} alt={product.name}
              className="w-full h-52 object-cover" />
          )}
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-display text-xl">{product.name}</DrawerTitle>
            <p className="text-sm" style={{color:"var(--menu-muted, #888)"}}>{product.description}</p>
            <p className="font-display font-bold text-lg brand-text mt-1">{brl(basePrice)}</p>
          </DrawerHeader>

          <div className="px-4 pb-2 space-y-5">
            {groups.map((g) => {
              const chosen = selected[g.id] || [];
              return (
                <div key={g.id} data-testid={`option-group-${g.id}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-display font-semibold text-sm">{g.name}</h4>
                    <span className="text-xs" style={{color:"var(--menu-muted, #aaa)"}}>
                      {g.required ? "Obrigatório · " : ""}
                      {g.type === "single" ? "Escolha 1" : `Até ${g.max}`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {g.options.map((o) => {
                      const active = chosen.includes(o.id);
                      return (
                        <button key={o.id} type="button"
                          onClick={() => toggleOption(g, o.id)}
                          data-testid={`option-${o.id}`}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors ${
                            active ? "brand-border brand-soft" : "border-white/10 bg-[#1A1A1A]"
                          }`}>
                          <span className="flex items-center gap-2">
                            <span className={`grid place-items-center w-5 h-5 rounded-${g.type === "single" ? "full" : "md"} border ${active ? "brand-bg border-transparent" : "border-white/20"}`}>
                              {active && <Check className="w-3 h-3" />}
                            </span>
                            {o.name}
                          </span>
                          {o.price > 0 && <span style={{color:"var(--menu-muted, #888)"}}>+ {brl(o.price)}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div>
              <h4 className="font-display font-semibold text-sm mb-2">Observação</h4>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: sem cebola, ponto da carne..." data-testid="product-notes"
                className="resize-none" rows={2} />
            </div>
          </div>
        </div>

        <DrawerFooter className="flex-row items-center gap-3 border-t" style={{borderColor:"rgba(255,255,255,0.1)"}}>
          <div className="flex items-center gap-3 border border-white/15 rounded-full px-2 py-1">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              data-testid="qty-decrease" className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 transition-colors">
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-5 text-center font-semibold" data-testid="qty-value">{quantity}</span>
            <button onClick={() => setQuantity((q) => q + 1)}
              data-testid="qty-increase" className="w-8 h-8 grid place-items-center rounded-full hover:bg-white/10 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <Button onClick={handleAdd} disabled={!!missingGroup} data-testid="add-to-cart-btn"
            className="flex-1 brand-bg hover:opacity-90 h-12 rounded-xl disabled:opacity-50">
            {missingGroup ? `Selecione: ${missingGroup}` : `Adicionar · ${brl(unitPrice * quantity)}`}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
