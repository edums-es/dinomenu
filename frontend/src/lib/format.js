export function brl(value) {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const ORDER_STATUS_LABELS = {
  pending: "Novo",
  accepted: "Aceito",
  preparing: "Em preparo",
  ready: "Pronto",
  out_for_delivery: "Saiu para entrega",
  completed: "Finalizado",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_COLORS = {
  pending: "#F59E0B",
  accepted: "#3B82F6",
  preparing: "#8B5CF6",
  ready: "#10B981",
  out_for_delivery: "#06B6D4",
  completed: "#22C55E",
  cancelled: "#EF4444",
};

export const WEEKDAYS = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];
