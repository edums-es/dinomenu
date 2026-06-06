import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot } from "lucide-react";
import { brl } from "@/lib/format";

const DAY_LABELS = {
  mon: "Segunda", tue: "Terça", wed: "Quarta",
  thu: "Quinta", fri: "Sexta", sat: "Sábado", sun: "Domingo",
};

function getAnswer(text, restaurant) {
  const q = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  // Localização / endereço
  if (/\b(enderec|localizac|onde|fica|local|bairro|rua|av|avenida|cidade|cep)\b/.test(q)) {
    const parts = [restaurant.address, restaurant.neighborhood, restaurant.city, restaurant.state].filter(Boolean);
    return parts.length
      ? `📍 Nosso endereço: ${parts.join(", ")}`
      : "Ainda não temos o endereço cadastrado. Entre em contato para mais informações!";
  }

  // Horários
  if (/\b(horario|hora|abre|fecha|funciona|funcionamento|atende|expediente)\b/.test(q)) {
    const hours = restaurant.opening_hours;
    if (!hours) return "Nossos horários ainda não foram cadastrados. Ligue para confirmar!";
    const lines = Object.entries(DAY_LABELS)
      .map(([k, label]) => hours[k]?.open ? `${label}: ${hours[k].start}–${hours[k].end}` : null)
      .filter(Boolean);
    return lines.length
      ? `🕐 Horários de funcionamento:\n${lines.join("\n")}`
      : "Nenhum horário cadastrado ainda.";
  }

  // Telefone / WhatsApp / contato
  if (/\b(telefone|fone|whatsapp|zap|contato|ligar|numero|cel|celular|chamar)\b/.test(q)) {
    return restaurant.phone
      ? `📞 Fale conosco: ${restaurant.phone}`
      : "Número de contato não cadastrado. Visite nossa loja!";
  }

  // Entrega / delivery / frete / taxa
  if (/\b(entrega|delivery|frete|taxa|entreg|motoboy|despacho)\b/.test(q)) {
    const parts = [];
    if (restaurant.delivery_fee != null) parts.push(`Taxa de entrega: ${restaurant.delivery_fee === 0 ? "grátis!" : brl(restaurant.delivery_fee)}`);
    if (restaurant.average_delivery_time) parts.push(`Tempo estimado: ${restaurant.average_delivery_time}`);
    return parts.length
      ? `🛵 Delivery:\n${parts.join("\n")}`
      : "Entre em contato para informações sobre entrega!";
  }

  // Pedido mínimo
  if (/\b(minimo|pedido minimo|valor minimo|pedido)\b/.test(q)) {
    return restaurant.minimum_order
      ? `🛒 Pedido mínimo: ${brl(restaurant.minimum_order)}`
      : "Não temos valor mínimo de pedido!";
  }

  // Pagamento
  if (/\b(pagamento|pagar|pix|cartao|cartão|dinheiro|credito|debito|forma)\b/.test(q)) {
    const methods = restaurant.payment_methods;
    return Array.isArray(methods) && methods.length
      ? `💳 Formas de pagamento:\n${methods.join(", ")}`
      : "Aceitamos Pix, cartão de crédito, débito e dinheiro!";
  }

  // Está aberto agora
  if (/\b(aberto|abrindo|abriu|aberta|funcionando|agora|hoje)\b/.test(q)) {
    return restaurant.is_open
      ? "✅ Sim, estamos abertos agora! Faça seu pedido."
      : "❌ No momento estamos fechados. Veja nossos horários perguntando sobre \"horários\".";
  }

  // Cardápio / produtos / preço
  if (/\b(cardapio|menu|produto|prato|item|lanche|comida|bebida|preco|preco|valor)\b/.test(q)) {
    return "🍽️ Role a página para ver todo o nosso cardápio com produtos e preços. Você também pode buscar um item específico na barra de pesquisa!";
  }

  // Avaliações
  if (/\b(avaliacao|estrela|nota|avaliou|opiniao|qualidade)\b/.test(q)) {
    return "⭐ Veja as avaliações dos clientes na aba \"Avaliações\" do cardápio. Adoraríamos sua opinião também!";
  }

  // Saudações
  if (/\b(oi|ola|bom dia|boa tarde|boa noite|oi tudo|tudo bem|salve|hey)\b/.test(q)) {
    return `Olá! 👋 Sou o assistente do ${restaurant.name}. Posso te ajudar com:\n• Endereço\n• Horários\n• Entrega\n• Cardápio\n• Pagamento\n\nO que você precisa?`;
  }

  // Obrigado
  if (/\b(obrigad|valeu|vlw|brigad|agradeço)\b/.test(q)) {
    return "😊 Fico feliz em ajudar! Qualquer dúvida é só perguntar.";
  }

  return `Não encontrei uma resposta para isso 🤔\n\nPosso te ajudar com:\n• Endereço\n• Horários\n• Entrega\n• Pedido mínimo\n• Formas de pagamento\n• Cardápio`;
}

const QUICK_REPLIES = [
  { label: "📍 Endereço", text: "Qual o endereço?" },
  { label: "🕐 Horários", text: "Qual o horário de funcionamento?" },
  { label: "🛵 Entrega", text: "Qual a taxa de entrega?" },
  { label: "💳 Pagamento", text: "Quais as formas de pagamento?" },
];

export default function ChatBot({ restaurant }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: "bot", text: `Olá! 👋 Sou o assistente do ${restaurant.name}. Como posso te ajudar?` },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const send = (text) => {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput("");
    setMessages((m) => [...m, { from: "user", text: msg }]);
    setTyping(true);
    setTimeout(() => {
      const answer = getAnswer(msg, restaurant);
      setMessages((m) => [...m, { from: "bot", text: answer }]);
      setTyping(false);
    }, 600);
  };

  const primary = restaurant.primary_color || "#EF4444";

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: primary }}
        className="fixed bottom-24 right-4 w-14 h-14 rounded-full shadow-xl grid place-items-center z-50 transition-transform active:scale-95"
        aria-label="Abrir chat"
      >
        {open ? <X className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-44 right-4 w-80 max-h-[440px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col z-50 overflow-hidden">
          {/* Header */}
          <div style={{ background: primary }} className="flex items-center gap-2 px-4 py-3">
            <div className="w-8 h-8 rounded-full bg-white/20 grid place-items-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-none">{restaurant.name}</p>
              <p className="text-white/70 text-xs">Assistente virtual</p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-64">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  style={m.from === "user" ? { background: primary, color: "#fff" } : {}}
                  className={`rounded-2xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-line ${
                    m.from === "user"
                      ? "rounded-br-sm"
                      : "bg-gray-100 text-gray-800 rounded-bl-sm"
                  }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-gray-400 flex gap-1 items-center">
                  <span className="animate-bounce delay-0">•</span>
                  <span className="animate-bounce delay-150">•</span>
                  <span className="animate-bounce delay-300">•</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick replies */}
          <div className="px-3 pb-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {QUICK_REPLIES.map((q) => (
              <button key={q.text} onClick={() => send(q.text)}
                style={{ borderColor: primary, color: primary }}
                className="shrink-0 text-xs border rounded-full px-2.5 py-1 whitespace-nowrap font-medium">
                {q.label}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex items-center gap-2 px-3 pb-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Digite sua dúvida..."
              className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none"
            />
            <button onClick={() => send()}
              style={{ background: primary }}
              className="w-9 h-9 rounded-full grid place-items-center shrink-0">
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
