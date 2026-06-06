import { useState, useMemo, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Minus, Plus, Trash2, MessageCircle, ShoppingBag, ArrowLeft, Ticket, Check, Copy, QrCode } from "lucide-react";
import { maskPhone } from "@/lib/masks";
import { useCart } from "@/context/CartContext";
import api, { formatApiError } from "@/lib/api";
import { brl } from "@/lib/format";

const onlyDigits = (value) => (value || "").replace(/\D/g, "");
function hexFg(hex) {
  if (!hex) return "#fff";
  const c = hex.replace("#", "");
  const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#111" : "#fff";
}
function hexRgba(hex, alpha = 0.16) {
  const c = (hex || "#22E39B").replace("#", "");
  const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const maskCep = (value) => {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
};
const normalizeText = (value) =>
  (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const zoneMatchesNeighborhood = (zoneName, neighborhoodName) => {
  const zone = normalizeText(zoneName);
  const neighborhood = normalizeText(neighborhoodName);
  return !!zone && !!neighborhood && (
    zone === neighborhood ||
    (zone.length >= 4 && neighborhood.includes(zone)) ||
    (neighborhood.length >= 4 && zone.includes(neighborhood))
  );
};
const splitTerms = (value) =>
  Array.isArray(value) ? value : String(value || "").split(",");
const zoneMatchesCep = (zone, cepDigits) =>
  splitTerms(zone.cep_prefixes).map(onlyDigits).filter(Boolean).some((prefix) => cepDigits.startsWith(prefix));
const zoneMatchesAddress = (zone, addressData = {}, cepDigits = "") => {
  const values = [addressData.bairro, addressData.localidade, addressData.logradouro];
  const regionTerms = [zone.neighborhood, ...splitTerms(zone.aliases)];
  const cityTerms = splitTerms(zone.city_names);
  return (
    regionTerms.some((term) => values.some((value) => zoneMatchesNeighborhood(term, value))) ||
    cityTerms.some((term) => zoneMatchesNeighborhood(term, addressData.localidade)) ||
    zoneMatchesCep(zone, cepDigits)
  );
};

export default function CartSheet({ open, onOpenChange, restaurant, slug }) {
  const { items, updateQuantity, removeItem, subtotal, clearCart } = useCart();
  const [step, setStep] = useState("cart"); // cart | checkout | pix
  const [submitting, setSubmitting] = useState(false);
  const [pixCharge, setPixCharge] = useState(null);
  const [copied, setCopied] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState(null);
  const [lastOrderId, setLastOrderId] = useState(null);
  const [pixPaid, setPixPaid] = useState(false);
  const pollRef = useRef(null);

  // coupon
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState(null);

  // checkout fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState(restaurant?.accepts_delivery ? "delivery" : "pickup");
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [complement, setComplement] = useState("");
  const [reference, setReference] = useState("");
  const [payment, setPayment] = useState(restaurant?.payment_methods?.[0] || "Dinheiro");
  const [changeFor, setChangeFor] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [cepCheck, setCepCheck] = useState(null);

  const zones = useMemo(() => restaurant?.delivery_zones || [], [restaurant?.delivery_zones]);
  const activeZones = useMemo(() => zones.filter((z) => z.active), [zones]);
  const selectedZone = useMemo(() => {
    if (!neighborhood) return null;
    return activeZones.find((z) => zoneMatchesAddress(z, { bairro: neighborhood })) || null;
  }, [activeZones, neighborhood]);
  const cepZone = useMemo(() => {
    if (!cepCheck?.neighborhood && !cepCheck?.digits) return null;
    return activeZones.find((z) => zoneMatchesAddress(z, cepCheck, cepCheck.digits)) || null;
  }, [activeZones, cepCheck]);

  const deliveryFee = useMemo(() => {
    if (type === "pickup") return 0;
    if (coupon?.free_delivery) return 0;
    if (restaurant?.delivery_fee_mode === "neighborhood") {
      const zone = cepZone || selectedZone;
      return zone ? Number(zone.fee) || 0 : 0;
    }
    return restaurant?.flat_delivery_fee || 0;
  }, [type, coupon, restaurant, cepZone, selectedZone]);

  const discount = coupon?.discount || 0;
  const total = Math.max(0, subtotal + deliveryFee - discount);
  const primary = restaurant?.primary_color || "#22E39B";
  const themeVars = {
    "--brand-primary": primary,
    "--brand-primary-foreground": restaurant?.button_text_color || hexFg(primary),
    "--brand-secondary": hexRgba(primary, 0.16),
    "--menu-text": restaurant?.menu_text_color || "#FFFFFF",
    "--menu-muted": restaurant?.menu_muted_text_color || "#A7A7A7",
    "--menu-detail": restaurant?.secondary_color || primary,
  };

  // Polling: verifica a cada 4s se Pix foi pago (usa endpoint ativo que consulta OpenPix)
  useEffect(() => {
    if (step !== "pix" || !lastOrderId || pixPaid) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/public/orders/${lastOrderId}/check-pix`);
        if (data.payment_status === "paid") {
          setPixPaid(true);
          clearInterval(pollRef.current);
          toast.success("Pagamento Pix confirmado! 🎉");
        }
      } catch { /* silencioso */ }
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [step, lastOrderId, pixPaid]);

  useEffect(() => {
    const digits = onlyDigits(cep);
    if (type !== "delivery") {
      setCepCheck(null);
      return;
    }
    if (digits.length !== 8) {
      setCepCheck(null);
      return;
    }

    let cancelled = false;
    fetch(`https://viacep.com.br/ws/${digits}/json/`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.erro) {
          setCepCheck({ digits, neighborhood: "", allowed: false });
          toast.error("CEP nao encontrado");
          return;
        }
        const addressData = {
          digits,
          bairro: data.bairro || "",
          neighborhood: data.bairro || "",
          localidade: data.localidade || "",
          logradouro: data.logradouro || "",
        };
        const zone = activeZones.find((z) => zoneMatchesAddress(z, addressData, digits));
        setCepCheck({ ...addressData, allowed: activeZones.length === 0 || !!zone });
        if (data.logradouro) setStreet(data.logradouro);
        if (data.bairro) setNeighborhood(data.bairro);
      })
      .catch(() => {
        if (!cancelled) {
          setCepCheck({ digits, neighborhood: "", allowed: false });
          toast.error("Nao foi possivel consultar o CEP");
        }
      });

    return () => { cancelled = true; };
  }, [cep, type, activeZones]);

  const applyCoupon = async () => {
    if (!couponInput.trim()) return;
    try {
      const { data } = await api.post(`/public/restaurants/${slug}/validate-coupon`, {
        code: couponInput, subtotal,
      });
      setCoupon(data);
      toast.success("Cupom aplicado!");
    } catch (err) {
      setCoupon(null);
      toast.error(formatApiError(err.response?.data?.detail) || "Cupom inválido");
    }
  };

  const buildOrderPayload = () => ({
    type,
    customer: { name, phone },
    address: type === "delivery"
      ? { cep, street, number, neighborhood, complement, reference }
      : null,
    items: items.map((i) => ({
      product_id: i.product.id,
      product_name: i.product.name,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      options: i.selectedOptions,
      notes: i.notes || "",
      total_price: i.unitPrice * i.quantity,
    })),
    subtotal,
    delivery_fee: deliveryFee,
    discount,
    total,
    coupon_code: coupon?.code || null,
    payment_method: payment,
    change_for: payment === "Dinheiro" && changeFor ? parseFloat(changeFor) : null,
    customer_notes: orderNotes,
  });

  const validate = () => {
    if (!name.trim() || !phone.trim()) { toast.error("Informe nome e telefone"); return false; }
    if (type === "delivery" && (!street.trim() || !number.trim() || !neighborhood.trim())) {
      toast.error("Preencha o endereço de entrega"); return false;
    }
    if (type === "delivery" && activeZones.length > 0) {
      const digits = onlyDigits(cep);
      if (digits.length !== 8 || cepCheck?.digits !== digits) {
        toast.error("Informe um CEP valido para consultar a entrega");
        return false;
      }
      if (!cepCheck.allowed) {
        toast.error("Ainda nao atendemos esse CEP");
        return false;
      }
    }
    if (type === "delivery" && restaurant?.delivery_fee_mode === "neighborhood" && activeZones.length > 0 && !cepZone) {
      toast.error("Ainda nao atendemos esse CEP");
      return false;
    }
    if (subtotal < (restaurant?.minimum_order || 0)) {
      toast.error(`Pedido mínimo de ${brl(restaurant.minimum_order)}`); return false;
    }
    return true;
  };

  const buildWhatsappMessage = (orderNumber, pixViaOpenpix = false) => {
    const lines = [];
    lines.push(`*Novo pedido pelo cardapio digital*`);
    if (orderNumber) lines.push(`Pedido #${orderNumber}`);
    lines.push("");
    lines.push(`*Cliente:* ${name}`);
    lines.push(`*Telefone:* ${phone}`);
    lines.push(`*Tipo:* ${type === "delivery" ? "Entrega" : "Retirada"}`);
    if (type === "delivery") {
      lines.push(`*Endereço:* ${street}, ${number} - ${neighborhood}`);
      if (complement) lines.push(`*Complemento:* ${complement}`);
      if (reference) lines.push(`*Referência:* ${reference}`);
    }
    lines.push("");
    lines.push("*Pedido:*");
    items.forEach((i) => {
      lines.push(`${i.quantity}x ${i.product.name} — ${brl(i.unitPrice * i.quantity)}`);
      i.selectedOptions.forEach((o) =>
        lines.push(`   + ${o.name}${o.price ? ` (${brl(o.price)})` : ""}`));
      if (i.notes) lines.push(`   _Obs: ${i.notes}_`);
    });
    lines.push("");
    lines.push(`*Subtotal:* ${brl(subtotal)}`);
    if (type === "delivery") lines.push(`*Entrega:* ${brl(deliveryFee)}`);
    if (discount > 0) lines.push(`*Desconto:* -${brl(discount)}`);
    lines.push(`*Total:* ${brl(total)}`);
    lines.push("");
    const pm = payment.toLowerCase();
    let paymentLabel = payment;
    if (pm === "pix" || pm === "pix automatico" || pm === "pix automático") {
      paymentLabel = pixViaOpenpix ? "Pix pago automatico Openpix" : "Pix aguardando comprovante";
    }
    lines.push(`*Pagamento:* ${paymentLabel}`);
    if (payment === "Dinheiro" && changeFor) lines.push(`*Troco para:* ${brl(parseFloat(changeFor))}`);
    if (orderNotes) lines.push(`*Observação:* ${orderNotes}`);
    return encodeURIComponent(lines.join("\n"));
  };

  const submit = async (viaWhatsapp) => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/public/restaurants/${slug}/orders`, buildOrderPayload());

      const isPix = payment.toLowerCase().includes("pix") && restaurant?.openpix_app_id;

      // QR Code gerado com sucesso
      if (data.pix_charge?.br_code || data.pix_charge?.qr_code_image) {
        setPixCharge(data.pix_charge);
        setLastOrderNumber(data.order_number);
        setLastOrderId(data.id);
        setPixPaid(false);
        setStep("pix");
        toast.success(`Pedido #${data.order_number} criado! Escaneie o QR Code.`);
        return;
      }

      // OpenPix configurado mas falhou em gerar QR
      if (isPix && !data.pix_charge) {
        toast.error("Erro ao gerar QR Code Pix. Verifique o App ID do OpenPix nas configurações.");
        return; // NÃO fecha a tela, pedido foi criado mas sem QR
      }

      if (viaWhatsapp && restaurant?.whatsapp) {
        const msg = buildWhatsappMessage(data.order_number, false);
        window.open(`https://wa.me/${restaurant.whatsapp}?text=${msg}`, "_blank");
      }
      toast.success(`Pedido #${data.order_number} enviado com sucesso!`);
      clearCart();
      setStep("cart");
      onOpenChange(false);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Erro ao finalizar pedido");
    } finally {
      setSubmitting(false);
    }
  };

  const copyPixCode = () => {
    if (!pixCharge?.br_code) return;
    navigator.clipboard.writeText(pixCharge.br_code).then(() => {
      setCopied(true);
      toast.success("Código Pix copiado!");
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const closePix = () => {
    clearInterval(pollRef.current);
    setPixCharge(null);
    setPixPaid(false);
    setLastOrderId(null);
    setLastOrderNumber(null);
    clearCart();
    setStep("cart");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen && step === "pix") {
        closePix();
        return;
      }
      onOpenChange(nextOpen);
    }}>
      <SheetContent
        side="bottom"
        className="max-w-md mx-auto rounded-t-2xl max-h-[92vh] overflow-y-auto p-0 dark"
        style={{
          ...themeVars,
          background:"#111111",
          color:"var(--menu-text, #f0f0f0)",
          borderColor:"rgba(255,255,255,0.1)",
        }}
      >
        <SheetHeader className="p-4 border-b sticky top-0 z-10" style={{background:"#111111",borderColor:"rgba(255,255,255,0.1)"}}>
          <SheetTitle className="font-display flex items-center gap-2">
            {step === "checkout" && (
              <button onClick={() => setStep("cart")} data-testid="checkout-back">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            {step === "cart" ? "Seu pedido" : step === "pix" ? "Pagar com Pix" : "Finalizar pedido"}
          </SheetTitle>
        </SheetHeader>

        {step === "pix" && pixCharge ? (
          /* ── Tela de pagamento Pix automático ── */
          <div className="p-6 space-y-5 text-center">
            {pixPaid ? (
              <div className="rounded-2xl p-5 space-y-2" style={{background:"rgba(74,222,128,0.1)",border:"1px solid rgba(74,222,128,0.3)"}}>
                <p className="text-3xl">✅</p>
                <p className="text-green-400 font-bold text-lg">Pagamento confirmado!</p>
                <p className="text-xs text-green-300">Pedido #{lastOrderNumber} pago com sucesso.</p>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 mb-2">
                <QrCode className="w-5 h-5 text-green-400"/>
                <p className="text-sm text-green-400 font-semibold">QR Code Pix gerado!</p>
              </div>
            )}
            {!pixPaid && <p className="text-xs text-gray-400">Escaneie o QR Code abaixo com seu app bancário ou copie o código Pix</p>}

            {/* QR Code image — usa base64 da API ou gera do brCode */}
            {!pixPaid && pixCharge.br_code && (() => {
              const src = pixCharge.qr_code_image
                ? (pixCharge.qr_code_image.startsWith("data:") || pixCharge.qr_code_image.startsWith("http")
                    ? pixCharge.qr_code_image
                    : `data:image/png;base64,${pixCharge.qr_code_image}`)
                : `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixCharge.br_code)}`;
              return (
                <div className="flex justify-center">
                  <div className="bg-white rounded-2xl p-3 inline-block">
                    <img src={src} alt="QR Code Pix" className="w-52 h-52 block" />
                  </div>
                </div>
              );
            })()}

            {/* Pix copia e cola — só antes de pagar */}
            {!pixPaid && pixCharge.br_code && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Pix Copia e Cola</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={pixCharge.br_code}
                    className="flex-1 text-xs bg-[#1A1A1A] border border-white/10 rounded-lg px-3 py-2 text-gray-300 truncate outline-none"
                  />
                  <button
                    onClick={copyPixCode}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
                    style={{background: copied ? "rgba(74,222,128,0.2)" : "var(--brand-secondary)", color: copied ? "#4ade80" : "var(--brand-primary)", border: `1px solid ${copied ? "rgba(74,222,128,0.3)" : "var(--brand-primary)"}`}}
                  >
                    <Copy className="w-3.5 h-3.5"/>
                    {copied ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </div>
            )}

            {!pixPaid && (
              <div className="rounded-xl p-3 text-xs text-gray-400 space-y-1" style={{background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)"}}>
                <p>⏱ O pagamento é confirmado automaticamente em até 1 minuto</p>
                <p>📱 Abra seu banco → Pix → Ler QR Code ou Copia e Cola</p>
              </div>
            )}

            <div className="space-y-2">
              {/* Avisar WhatsApp só aparece APÓS o pagamento ser confirmado */}
              {pixPaid && restaurant?.whatsapp && (
                <button
                  onClick={() => {
                    const msg = buildWhatsappMessage(lastOrderNumber, true);
                    window.open(`https://wa.me/${restaurant.whatsapp.replace(/\D/g,"")}?text=${msg}`, "_blank");
                  }}
                  className="w-full rounded-xl h-11 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  style={{backgroundColor:"#25D366", color:"#fff"}}
                >
                  <MessageCircle className="w-4 h-4" /> Avisar pelo WhatsApp
                </button>
              )}
              <button
                onClick={closePix}
                className="w-full rounded-xl h-11 text-sm font-semibold text-gray-300 border border-white/10 hover:border-white/20 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-gray-400">
            <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Seu carrinho está vazio.</p>
          </div>
        ) : step === "cart" ? (
          <div className="p-4 space-y-4">
            {items.map((i) => (
              <div key={i.lineId} className="flex gap-3" data-testid="cart-item">
                <div className="flex-1">
                  <p className="font-medium text-sm">{i.product.name}</p>
                  {i.selectedOptions.map((o, idx) => (
                    <p key={idx} className="text-xs" style={{color:"#888"}}>+ {o.name}</p>
                  ))}
                  {i.notes && <p className="text-xs text-gray-400 italic">Obs: {i.notes}</p>}
                  <p className="text-sm font-semibold brand-text mt-1">{brl(i.unitPrice * i.quantity)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => removeItem(i.lineId)} data-testid="cart-remove" className="text-gray-300 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-2 rounded-full px-1.5 py-0.5" style={{border:"1px solid rgba(255,255,255,0.15)"}}>
                    <button onClick={() => updateQuantity(i.lineId, -1)} className="w-6 h-6 grid place-items-center"><Minus className="w-3 h-3" /></button>
                    <span className="text-sm w-4 text-center">{i.quantity}</span>
                    <button onClick={() => updateQuantity(i.lineId, 1)} className="w-6 h-6 grid place-items-center"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            ))}

            {/* coupon */}
            <div className="flex gap-2 pt-2">
              <div className="relative flex-1">
                <Ticket className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Cupom" data-testid="coupon-input" className="pl-9" />
              </div>
              <Button variant="outline" onClick={applyCoupon} data-testid="coupon-apply">Aplicar</Button>
            </div>
            {coupon && (
              <p className="text-xs text-green-600 flex items-center gap-1"><Check className="w-3 h-3" /> Cupom {coupon.code} aplicado</p>
            )}

            <div className="pt-3 space-y-1.5 text-sm" style={{borderTop:"1px solid rgba(255,255,255,0.1)"}}>
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
              {discount > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{brl(discount)}</span></div>}
              <div className="flex justify-between font-display font-bold text-base"><span>Total</span><span>{brl(subtotal - discount)}</span></div>
            </div>

            <Button onClick={() => setStep("checkout")} data-testid="goto-checkout"
              className="w-full brand-bg hover:opacity-90 h-12 rounded-xl">Continuar</Button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {restaurant?.accepts_delivery && (
                <button onClick={() => setType("delivery")} data-testid="type-delivery"
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${type === "delivery" ? "brand-bg border-transparent" : "border-white/20 text-gray-300 hover:border-white/40"}`}>Entrega</button>
              )}
              {restaurant?.accepts_pickup && (
                <button onClick={() => setType("pickup")} data-testid="type-pickup"
                  className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${type === "pickup" ? "brand-bg border-transparent" : "border-white/20 text-gray-300 hover:border-white/40"}`}>Retirada</button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="checkout-name" className="mt-1" /></div>
              <div><Label>Telefone</Label><Input value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(XX) XXXXX-XXXX" maxLength={15} data-testid="checkout-phone" className="mt-1" /></div>
            </div>

            {type === "delivery" && (
              <div className="space-y-3">
                <div>
                  <Label>CEP</Label>
                  <Input
                    value={cep}
                    onChange={(e) => setCep(maskCep(e.target.value))}
                    placeholder="00000-000"
                    maxLength={9}
                    data-testid="checkout-cep"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><Label>Rua</Label><Input value={street} onChange={(e) => setStreet(e.target.value)} data-testid="checkout-street" className="mt-1" /></div>
                  <div><Label>Número</Label><Input value={number} onChange={(e) => setNumber(e.target.value)} data-testid="checkout-number" className="mt-1" /></div>
                </div>
                <div>
                  <Label>Bairro</Label>
                  {activeZones.length > 0 ? (
                    <Select value={neighborhood} onValueChange={setNeighborhood}>
                      <SelectTrigger data-testid="checkout-neighborhood" className="mt-1"><SelectValue placeholder="Selecione o bairro" /></SelectTrigger>
                      <SelectContent>
                        {activeZones.map((z) => (
                          <SelectItem key={z.id} value={z.neighborhood}>{z.neighborhood} · {brl(z.fee)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} data-testid="checkout-neighborhood" className="mt-1" />
                  )}
                  {activeZones.length > 0 && cepCheck?.digits === onlyDigits(cep) && cepCheck.allowed === false && (
                    <p className="text-xs text-red-400 mt-1">Ainda nao atendemos esse CEP.</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Complemento</Label><Input value={complement} onChange={(e) => setComplement(e.target.value)} className="mt-1" /></div>
                  <div><Label>Referência</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} className="mt-1" /></div>
                </div>
              </div>
            )}

            <div>
              <Label>Forma de pagamento</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger data-testid="checkout-payment" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(restaurant?.payment_methods || ["Dinheiro"]).map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {payment === "Dinheiro" && (
              <div><Label>Troco para</Label><Input type="number" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} placeholder="Ex: 100" data-testid="checkout-change" className="mt-1" /></div>
            )}
            {payment.toLowerCase().includes("pix") && !restaurant?.openpix_app_id && restaurant?.pix_key && (
              <div className="text-xs rounded-xl p-3" style={{background:"#1A1A1A",border:"1px solid rgba(255,255,255,0.1)",color:"#ccc"}}>
                <p className="font-semibold">Chave Pix: {restaurant.pix_key}</p>
                <p className="text-gray-500">{restaurant.pix_name}</p>
              </div>
            )}
            {payment.toLowerCase().includes("pix") && restaurant?.openpix_app_id && (
              <div className="text-xs rounded-xl p-3 flex items-center gap-2" style={{background:"rgba(74,222,128,0.07)",border:"1px solid rgba(74,222,128,0.2)",color:"#4ade80"}}>
                <QrCode className="w-4 h-4 shrink-0"/>
                <p>QR Code Pix será gerado automaticamente ao confirmar</p>
              </div>
            )}

            <div><Label>Observação do pedido</Label><Textarea value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} rows={2} className="mt-1 resize-none" data-testid="checkout-notes" /></div>

            <div className="pt-3 space-y-1.5 text-sm" style={{borderTop:"1px solid rgba(255,255,255,0.1)"}}>
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
              {type === "delivery" && <div className="flex justify-between text-gray-500"><span>Entrega</span><span>{brl(deliveryFee)}</span></div>}
              {discount > 0 && <div className="flex justify-between text-green-600"><span>Desconto</span><span>-{brl(discount)}</span></div>}
              <div className="flex justify-between font-display font-bold text-lg"><span>Total</span><span>{brl(total)}</span></div>
            </div>

            <div className="space-y-2 pb-2">
              {payment.toLowerCase().includes("pix") && restaurant?.openpix_app_id ? (
                <Button onClick={() => submit(false)} disabled={submitting} data-testid="submit-pix"
                  className="w-full h-12 rounded-xl text-white flex items-center justify-center gap-2"
                  style={{ background: "linear-gradient(135deg, #32BCAD, #1a9d8f)" }}>
                  <QrCode className="w-5 h-5" />
                  {submitting ? "Gerando QR Code..." : "Pagar com Pix"}
                </Button>
              ) : (
                <Button onClick={() => submit(true)} disabled={submitting} data-testid="submit-whatsapp"
                  className="w-full h-12 rounded-xl text-white" style={{ backgroundColor: "#25D366" }}>
                  <MessageCircle className="w-5 h-5 mr-1" />
                  {submitting ? "Enviando..." : "Enviar pelo WhatsApp"}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
