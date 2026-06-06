import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API } from "@/lib/api";
import { brl } from "@/lib/format";
import {
  Clock, CheckCircle2, ChefHat, Package, Bike, Star,
  Loader2, Phone, MessageCircle, XCircle,
} from "lucide-react";

const STEPS = [
  { status: "pending",          label: "Pedido recebido",     icon: Clock,        desc: "Aguardando confirmação do pedido" },
  { status: "accepted",         label: "Pedido confirmado",   icon: CheckCircle2, desc: "Pedido confirmado com sucesso" },
  { status: "preparing",        label: "Em preparo",          icon: ChefHat,      desc: "Sua comida está sendo preparada" },
  { status: "ready",            label: "Pronto",              icon: Package,      desc: "Seu pedido está pronto" },
  { status: "out_for_delivery", label: "Saiu para entrega",   icon: Bike,         desc: "Seu pedido está a caminho" },
  { status: "completed",        label: "Entregue",            icon: Star,         desc: "Pedido finalizado" },
];

const STATUS_ORDER = STEPS.map((s) => s.status);

function stepIndex(status) {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? 0 : i;
}

export default function TrackOrder() {
  const { order_id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/public/orders/${order_id}`);
      setOrder(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [order_id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return (
    <div className="min-h-screen grid place-items-center bg-[#0B0B0B]">
      <Loader2 className="w-8 h-8 animate-spin text-white/50" />
    </div>
  );

  if (error || !order) return (
    <div className="min-h-screen grid place-items-center bg-[#0B0B0B] px-6 text-center">
      <div>
        <XCircle className="w-12 h-12 text-white/30 mx-auto mb-3" />
        <p className="font-display font-bold text-lg text-white">Pedido não encontrado</p>
        <p className="text-sm text-white/55 mt-1">Verifique o link e tente novamente.</p>
      </div>
    </div>
  );

  const isCancelled = order.status === "cancelled";
  const currentStep = isCancelled ? -1 : stepIndex(order.status);
  const primary = order.restaurant?.primary_color || "#6B7280";
  const currentLabel = STEPS[currentStep]?.label || "Pedido recebido";

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white">
      <div style={{ background: primary }} className="px-4 pt-6 pb-8 text-center">
        {order.restaurant?.logo_url && (
          <img
            src={order.restaurant.logo_url}
            alt="logo"
            loading="eager"
            decoding="async"
            className="w-12 h-12 rounded-xl object-cover mx-auto mb-3 shadow-lg"
          />
        )}
        <p className="font-display font-extrabold text-lg leading-tight">{order.restaurant?.name || "Pedido"}</p>
        <p className="text-white/85 text-sm mt-1">Rastreamento do pedido</p>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-5 pb-10 space-y-4">
        <div className="rounded-2xl p-4 shadow-xl shadow-black/20 bg-[#181818] border border-white/10">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="font-display font-extrabold text-xl leading-tight text-white">
              Pedido #{order.order_number}
            </p>
            {isCancelled ? (
              <span className="text-xs font-bold bg-red-500/15 text-red-300 border border-red-400/30 px-3 py-1.5 rounded-full shrink-0">
                Cancelado
              </span>
            ) : (
              <span
                className="text-xs font-bold px-3 py-1.5 rounded-full text-white shadow-sm shrink-0"
                style={{ background: primary }}
              >
                {currentLabel}
              </span>
            )}
          </div>
          <p className="text-sm text-white/70">
            Olá, <span className="font-semibold text-white">{order.customer_name}</span>!
          </p>
        </div>

        {!isCancelled && (
          <div className="rounded-2xl p-4 shadow-xl shadow-black/20 bg-[#181818] border border-white/10">
            <div className="flex items-center justify-between gap-3 mb-5">
              <p className="font-bold text-base text-white">Status do pedido</p>
              <span className="text-xs font-semibold text-white/60">
                Etapa {currentStep + 1} de {STEPS.length}
              </span>
            </div>

            <div className="space-y-0">
              {STEPS.map((step, i) => {
                const done = i < currentStep;
                const active = i === currentStep;
                const future = i > currentStep;
                const Icon = step.icon;
                const isLast = i === STEPS.length - 1;

                return (
                  <div key={step.status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full grid place-items-center border transition-all duration-500 shrink-0 ${
                          done
                            ? "border-transparent text-white shadow-sm"
                            : active
                            ? "border-transparent text-white ring-4 ring-white/10 shadow-sm"
                            : "border-white/15 bg-[#101010] text-white/45"
                        }`}
                        style={done || active ? { background: primary } : {}}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      {!isLast && (
                        <div
                          className="w-0.5 h-9 my-1 transition-all duration-700"
                          style={{ background: done ? primary : "rgba(255,255,255,0.16)" }}
                        />
                      )}
                    </div>

                    <div className="pb-6 pt-1 min-w-0">
                      <p
                        className={`text-sm leading-tight ${
                          active
                            ? "font-extrabold text-white"
                            : done
                            ? "font-bold text-white/90"
                            : "font-semibold text-white/55"
                        }`}
                      >
                        {step.label}
                      </p>
                      <p className={`text-xs mt-1 leading-snug ${future ? "text-white/35" : "text-white/62"}`}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="bg-red-500/10 border border-red-400/25 rounded-2xl p-4 text-center">
            <XCircle className="w-10 h-10 text-red-300 mx-auto mb-2" />
            <p className="font-bold text-red-200">Pedido cancelado</p>
            <p className="text-sm text-red-200/70 mt-1">Entre em contato com o restaurante para mais informações.</p>
          </div>
        )}

        {order.items && order.items.length > 0 && (
          <div className="rounded-2xl p-4 shadow-xl shadow-black/20 bg-[#181818] border border-white/10">
            <p className="font-bold text-base text-white mb-3">Itens do pedido</p>
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between gap-3 text-sm">
                  <span className="text-white/68">{item.quantity}x {item.product_name}</span>
                  <span className="font-semibold text-white shrink-0">{brl(item.total_price)}</span>
                </div>
              ))}
              <div className="border-t border-white/10 pt-3 flex justify-between font-extrabold text-lg">
                <span>Total</span>
                <span>{brl(order.total)}</span>
              </div>
            </div>
          </div>
        )}

        {(order.restaurant?.phone || order.restaurant?.whatsapp) && (
          <div className="rounded-2xl p-4 shadow-xl shadow-black/20 bg-[#181818] border border-white/10 flex gap-3">
            {order.restaurant?.whatsapp && (
              <a
                href={`https://wa.me/55${order.restaurant.whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-green-300/70 text-green-400 text-sm font-bold hover:bg-green-400/10 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}
            {order.restaurant?.phone && (
              <a
                href={`tel:${order.restaurant.phone}`}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-white/12 text-white/70 text-sm font-bold hover:bg-white/5 transition-colors"
              >
                <Phone className="w-4 h-4" /> Ligar
              </a>
            )}
          </div>
        )}

        <p className="text-center text-xs text-white/42">
          Atualiza automaticamente a cada 30 segundos
        </p>
      </div>
    </div>
  );
}
