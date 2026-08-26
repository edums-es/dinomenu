import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Headphones,
  LayoutDashboard,
  Menu,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  X,
} from "lucide-react";

const GREEN = "#22e39b";
const GREEN_DARK = "#04a86c";
const BG = "#020403";
const PANEL = "rgba(255,255,255,.055)";

const NAV = [
  { label: "Inicio", id: "inicio" },
  { label: "Recursos", id: "recursos" },
  { label: "Telas", id: "telas" },
  { label: "FAQ", id: "faq" },
  { label: "Contato", id: "contato" },
];

const FEATURES = [
  {
    icon: Store,
    title: "Cardapio online completo",
    text: "Venda por link proprio, com categorias, adicionais, fotos, horarios e taxa de entrega.",
  },
  {
    icon: LayoutDashboard,
    title: "Painel de gestao",
    text: "Acompanhe pedidos, faturamento, produtos, clientes, estoque e relatorios em tempo real.",
  },
  {
    icon: MessageCircle,
    title: "Pedidos no WhatsApp",
    text: "Centralize o atendimento, envie atualizacoes e reduza etapas ate o pedido chegar na cozinha.",
  },
  {
    icon: Truck,
    title: "Entrega organizada",
    text: "Controle status, retirada, entrega, mesas, PDV e historico sem depender de planilhas.",
  },
];

const PROOFS = [
  { icon: CheckCircle2, title: "Tudo pronto para usar" },
  { icon: MessageCircle, title: "Pedidos no WhatsApp" },
  { icon: BarChart3, title: "Painel de gestao" },
  { icon: Sparkles, title: "Visual profissional" },
];

const TRUST = [
  {
    icon: ShieldCheck,
    title: "Sistema seguro e confiavel",
    text: "Dados protegidos com tecnologia de ponta",
  },
  {
    icon: Cloud,
    title: "Acesso de onde estiver",
    text: "Gerencie pedidos e vendas em qualquer lugar",
  },
  {
    icon: Headphones,
    title: "Suporte especializado",
    text: "Time pronto para te ajudar sempre",
  },
];

const SCREENS = [
  { title: "Dashboard", image: "/eg-screen-dashboard.png" },
  { title: "PDV / Caixa", image: "/eg-screen-pdv.png" },
  { title: "Pedidos", image: "/eg-screen-pedidos.png" },
  { title: "Relatorios", image: "/eg-screen-relatorios.png" },
  { title: "Fidelidade", image: "/eg-screen-fidelidade.png" },
];

const STEPS = [
  "Configuracao da loja, cardapio e identidade visual",
  "Treinamento rapido para equipe e operacao do painel",
  "Publicacao do link de vendas pronto para receber pedidos",
];

const FAQ = [
  {
    q: "A EG Delivery serve para qualquer tipo de restaurante?",
    a: "Sim. O sistema funciona para delivery, retirada, mesa, PDV e operacoes que vendem por cardapio online.",
  },
  {
    q: "Preciso instalar aplicativo?",
    a: "Nao. O painel roda no navegador e o cardapio abre por link, facilitando o uso no computador, tablet ou celular.",
  },
  {
    q: "Vocês ajudam a configurar?",
    a: "Sim. A Easy Growth entrega a estrutura configurada para a loja com cardapio, ajustes iniciais e orientacao de uso.",
  },
];

function go(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  return (
    <main className="eg-landing" id="inicio">
      <header className="eg-header">
        <button className="eg-brand" onClick={() => go("inicio")} aria-label="EG Delivery">
          <img src="/logoeg.png" alt="" />
          <span>
            <strong>DELIVERY</strong>
            <small>by Easy Growth</small>
          </span>
        </button>

        <nav className="eg-nav" aria-label="Navegacao principal">
          {NAV.map((item) => (
            <button key={item.id} onClick={() => go(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="eg-actions">
          <Link className="eg-btn eg-btn-primary eg-btn-strong" to="/themazuki/master?tab=register">
            Quero Meu Sistema
            <ArrowRight size={19} />
          </Link>
        </div>

        <button className="eg-menu-btn" onClick={() => setMobileOpen((v) => !v)} aria-label="Abrir menu">
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {mobileOpen && (
          <div className="eg-mobile-panel">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  go(item.id);
                  setMobileOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
            <Link
              className="eg-btn eg-btn-primary"
              to="/themazuki/master?tab=register"
              onClick={() => setMobileOpen(false)}
            >
              Quero Meu Sistema
            </Link>
          </div>
        )}
      </header>

      <section className="eg-hero">
        <div className="eg-hero-rings" />
        <div className="eg-hero-glow" />

        <div className="eg-hero-content">
          <div className="eg-kicker">
            Sistema completo de delivery
          </div>

          <h1>
            Seu sistema de delivery
            <strong> pronto para vender</strong>
          </h1>

          <p>
            A Easy Growth configura, organiza e entrega tudo para voce comecar a vender com uma
            estrutura profissional, moderna e pronta para uso.
          </p>

          <div className="eg-hero-buttons">
            <Link className="eg-btn eg-btn-primary eg-btn-big eg-btn-strong" to="/themazuki/master?tab=register">
              Quero Meu Sistema <ArrowRight size={21} />
            </Link>
            <span className="eg-price-pill">Oferta de lancamento: R$ 49,90/mes</span>
          </div>

          <div className="eg-proof-row">
            {PROOFS.map((item) => (
              <div key={item.title}>
                <item.icon size={28} />
                <span>{item.title}</span>
              </div>
            ))}
          </div>
        </div>

        <HeroMockup />

        <div className="eg-trust-bar">
          {TRUST.map((item) => (
            <div key={item.title}>
              <item.icon size={34} />
              <span>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="eg-section" id="recursos">
        <div className="eg-section-head">
          <span>Recursos</span>
          <h2>Uma operacao mais bonita, rapida e facil de controlar</h2>
        </div>

        <div className="eg-feature-grid">
          {FEATURES.map((feature) => (
            <article key={feature.title}>
              <feature.icon size={28} />
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="eg-demo" id="telas">
        <div>
          <span className="eg-mini-label">Telas reais</span>
          <h2>O sistema que o restaurante usa todos os dias</h2>
          <p>
            Painel, pedidos, PDV, relatorios e fidelidade em uma estrutura simples para operar,
            acompanhar vendas e atender melhor.
          </p>
          <ul>
            {STEPS.map((step) => (
              <li key={step}>
                <Check size={18} />
                {step}
              </li>
            ))}
          </ul>
        </div>

        <div className="eg-screen-gallery">
          {SCREENS.map((screen, index) => (
            <figure key={screen.title} className={index === 0 ? "is-large" : ""}>
              <img src={screen.image} alt={`Tela do EG Delivery - ${screen.title}`} loading="lazy" />
              <figcaption>{screen.title}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="eg-faq" id="faq">
        <div className="eg-section-head">
          <span>FAQ</span>
          <h2>Perguntas frequentes</h2>
        </div>
        <div className="eg-faq-list">
          {FAQ.map((item, index) => (
            <article key={item.q} className={openFaq === index ? "is-open" : ""}>
              <button onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
                {item.q}
                <ChevronDown size={20} />
              </button>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="eg-contact" id="contato">
        <div>
          <span className="eg-mini-label">Contato</span>
          <h2>Pronto para vender com uma estrutura profissional?</h2>
          <p>
            Crie seu cadastro e veja como a EG Delivery pode colocar sua operacao online com mais
            velocidade, controle e presenca digital.
          </p>
        </div>
        <div className="eg-contact-actions">
          <Link className="eg-btn eg-btn-primary eg-btn-big eg-btn-strong" to="/themazuki/master?tab=register">
            Quero Meu Sistema <ArrowRight size={21} />
          </Link>
          <a className="eg-btn eg-btn-outline eg-btn-big" href="https://www.instagram.com/easygrowtth/" target="_blank" rel="noreferrer">
            Falar com a Easy Growth
          </a>
        </div>
      </section>

      <footer className="eg-footer">
        <button className="eg-brand" onClick={() => go("inicio")} aria-label="EG Delivery">
          <img src="/logoeg.png" alt="" />
          <span>
            <strong>DELIVERY</strong>
            <small>by Easy Growth</small>
          </span>
        </button>
        <span>© {new Date().getFullYear()} Easy Growth. Todos os direitos reservados.</span>
      </footer>

      <style>{`
        .eg-landing {
          min-height: 100vh;
          background:
            radial-gradient(circle at 76% 28%, rgba(34,227,155,.22), transparent 32%),
            radial-gradient(circle at 50% 88%, rgba(34,227,155,.13), transparent 34%),
            ${BG};
          color: #f7fbf8;
          font-family: Manrope, Inter, system-ui, sans-serif;
          overflow-x: hidden;
        }

        .eg-header {
          position: fixed;
          z-index: 50;
          top: 0;
          left: 0;
          right: 0;
          height: 108px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 68px;
          background: linear-gradient(180deg, rgba(0,0,0,.86), rgba(0,0,0,.2));
          backdrop-filter: blur(16px);
        }

        .eg-brand {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          border: 0;
          padding: 0;
          background: transparent;
          color: #fff;
          cursor: pointer;
          text-align: left;
        }

        .eg-brand img {
          width: 82px;
          height: 58px;
          object-fit: contain;
        }

        .eg-brand strong {
          display: block;
          font-family: Outfit, Manrope, sans-serif;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: .01em;
          line-height: .9;
        }

        .eg-brand small {
          display: block;
          margin-top: 7px;
          color: rgba(255,255,255,.72);
          font-size: 16px;
          line-height: 1;
        }

        .eg-nav {
          display: flex;
          align-items: center;
          gap: 46px;
        }

        .eg-nav button,
        .eg-mobile-panel button {
          border: 0;
          background: transparent;
          color: rgba(255,255,255,.82);
          font: 600 18px Manrope, sans-serif;
          cursor: pointer;
        }

        .eg-nav button:hover,
        .eg-mobile-panel button:hover {
          color: ${GREEN};
        }

        .eg-actions {
          display: flex;
          gap: 22px;
          align-items: center;
        }

        .eg-btn {
          min-height: 54px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          border-radius: 10px;
          padding: 0 30px;
          font: 800 16px Manrope, sans-serif;
          text-decoration: none;
          cursor: pointer;
          transition: transform .2s ease, border-color .2s ease, background .2s ease, box-shadow .2s ease;
          white-space: nowrap;
        }

        .eg-btn:hover {
          transform: translateY(-2px);
        }

        .eg-btn-primary {
          border: 1px solid rgba(255,255,255,.08);
          background: linear-gradient(135deg, ${GREEN}, #20d789 54%, ${GREEN_DARK});
          color: #00150c;
          box-shadow: 0 18px 44px rgba(34,227,155,.2);
        }

        .eg-btn-strong {
          min-width: 214px;
          box-shadow: 0 18px 52px rgba(34,227,155,.35), inset 0 1px 0 rgba(255,255,255,.42);
        }

        .eg-btn-outline {
          border: 1.5px solid rgba(34,227,155,.75);
          background: rgba(0,0,0,.24);
          color: #fff;
        }

        .eg-btn-outline:hover {
          background: rgba(34,227,155,.08);
          border-color: ${GREEN};
        }

        .eg-btn-big {
          min-height: 66px;
          padding: 0 36px;
          font-size: 18px;
        }

        .eg-menu-btn,
        .eg-mobile-panel {
          display: none;
        }

        .eg-hero {
          position: relative;
          min-height: 945px;
          padding: 132px 68px 52px;
          display: grid;
          grid-template-columns: minmax(500px, 670px) minmax(680px, 1fr);
          column-gap: 24px;
          align-items: center;
          background-image: url("/eg-hero-bg.png");
          background-size: cover;
          background-position: center top;
          background-repeat: no-repeat;
        }

        .eg-hero::before {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(90deg, rgba(2,4,3,.96) 0%, rgba(2,4,3,.82) 38%, rgba(2,4,3,.24) 70%, rgba(2,4,3,.62) 100%),
            linear-gradient(180deg, transparent 74%, ${BG} 100%);
          pointer-events: none;
        }

        .eg-hero-rings,
        .eg-hero-glow {
          position: absolute;
          pointer-events: none;
        }

        .eg-hero-rings {
          right: -110px;
          top: 154px;
          width: 640px;
          height: 640px;
          border: 1px solid rgba(34,227,155,.42);
          border-radius: 47% 53% 52% 48%;
          transform: rotate(-12deg);
          box-shadow: inset 0 0 80px rgba(34,227,155,.12);
        }

        .eg-hero-glow {
          right: 120px;
          bottom: 160px;
          width: 620px;
          height: 86px;
          background: radial-gradient(ellipse, rgba(34,227,155,.42), transparent 68%);
          filter: blur(10px);
        }

        .eg-hero-content,
        .eg-mockup,
        .eg-trust-bar,
        .eg-section,
        .eg-demo,
        .eg-faq,
        .eg-contact,
        .eg-footer {
          position: relative;
          z-index: 2;
        }

        .eg-kicker,
        .eg-mini-label {
          display: inline-flex;
          align-items: center;
          gap: 18px;
          color: ${GREEN};
          font-size: 16px;
          font-weight: 800;
          letter-spacing: .13em;
          text-transform: uppercase;
        }

        .eg-hero h1 {
          max-width: 720px;
          margin: 34px 0 22px;
          font-family: Outfit, Manrope, sans-serif;
          font-size: clamp(54px, 4vw, 64px);
          line-height: 1.08;
          letter-spacing: 0;
          font-weight: 800;
        }

        .eg-hero h1 strong {
          display: block;
          color: ${GREEN};
          font-weight: 800;
        }

        .eg-hero p {
          max-width: 620px;
          margin: 0;
          color: rgba(255,255,255,.72);
          font-size: 21px;
          line-height: 1.55;
        }

        .eg-hero-buttons {
          margin-top: 30px;
          display: flex;
          gap: 24px;
          align-items: center;
          flex-wrap: wrap;
        }

        .eg-price-pill {
          display: inline-flex;
          min-height: 46px;
          align-items: center;
          border-radius: 999px;
          padding: 0 20px;
          border: 1px solid rgba(34,227,155,.34);
          background: rgba(34,227,155,.08);
          color: rgba(255,255,255,.9);
          font-size: 15px;
          font-weight: 800;
        }

        .eg-proof-row {
          margin-top: 50px;
          display: grid;
          grid-template-columns: repeat(4, auto);
          gap: 0;
          align-items: center;
        }

        .eg-proof-row div {
          min-height: 52px;
          display: flex;
          align-items: center;
          gap: 14px;
          padding-right: 24px;
          margin-right: 24px;
          border-right: 1px solid rgba(255,255,255,.2);
          color: #fff;
        }

        .eg-proof-row div:last-child {
          border-right: 0;
          margin-right: 0;
          padding-right: 0;
        }

        .eg-proof-row svg {
          color: ${GREEN};
          flex: 0 0 auto;
        }

        .eg-proof-row span {
          max-width: 94px;
          font-size: 15px;
          line-height: 1.25;
          color: rgba(255,255,255,.9);
        }

        .eg-mockup {
          min-height: 570px;
          align-self: center;
          transform: translateY(-28px);
        }

        .eg-laptop-img,
        .eg-phone-img {
          position: absolute;
          display: block;
          object-fit: contain;
          user-select: none;
          pointer-events: none;
        }

        .eg-laptop-img {
          right: 78px;
          top: -75px;
          width: min(1100px, 64vw);
          filter: drop-shadow(0 34px 58px rgba(0,0,0,.62));
        }

        .eg-phone-img {
          right: -122px;
          top: 132px;
          width: min(770px, 40vw);
          filter: drop-shadow(0 28px 56px rgba(0,0,0,.7));
        }

        .eg-trust-bar {
          grid-column: 1 / -1;
          width: calc(100% - 28px);
          max-width: 1620px;
          justify-self: center;
          margin-top: 42px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          border: 1px solid rgba(255,255,255,.17);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025));
          backdrop-filter: blur(16px);
        }

        .eg-trust-bar div {
          display: flex;
          align-items: center;
          gap: 24px;
          min-height: 100px;
          padding: 0 46px;
          border-right: 1px solid rgba(255,255,255,.12);
        }

        .eg-trust-bar div:last-child {
          border-right: 0;
        }

        .eg-trust-bar svg {
          color: ${GREEN};
          flex: 0 0 auto;
        }

        .eg-trust-bar strong {
          display: block;
          font-size: 17px;
          margin-bottom: 5px;
        }

        .eg-trust-bar small {
          display: block;
          color: rgba(255,255,255,.58);
          font-size: 14px;
        }

        .eg-section,
        .eg-faq {
          padding: 96px 68px;
          background: #060807;
        }

        .eg-section-head {
          max-width: 780px;
          margin: 0 auto 38px;
          text-align: center;
        }

        .eg-section-head span,
        .eg-mini-label {
          color: ${GREEN};
        }

        .eg-section-head h2,
        .eg-demo h2,
        .eg-contact h2 {
          margin: 12px 0 0;
          font: 800 clamp(34px, 4vw, 56px)/1.08 Outfit, sans-serif;
          letter-spacing: 0;
        }

        .eg-feature-grid {
          max-width: 1260px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 18px;
        }

        .eg-feature-grid article {
          min-height: 250px;
          padding: 28px;
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: ${PANEL};
        }

        .eg-feature-grid svg {
          color: ${GREEN};
          margin-bottom: 28px;
        }

        .eg-feature-grid h3 {
          margin: 0 0 12px;
          font: 800 22px/1.15 Outfit, sans-serif;
        }

        .eg-feature-grid p,
        .eg-demo p,
        .eg-contact p {
          color: rgba(255,255,255,.64);
          line-height: 1.65;
          font-size: 16px;
        }

        .eg-demo,
        .eg-contact {
          padding: 104px 68px;
          display: grid;
          grid-template-columns: minmax(360px, 520px) minmax(0, 1fr);
          gap: 64px;
          align-items: center;
          background:
            radial-gradient(circle at 86% 40%, rgba(34,227,155,.14), transparent 32%),
            ${BG};
        }

        .eg-demo > div:first-child,
        .eg-contact > div:first-child {
          max-width: 760px;
        }

        .eg-demo ul {
          margin: 30px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 14px;
        }

        .eg-demo li {
          display: flex;
          gap: 12px;
          align-items: center;
          color: rgba(255,255,255,.84);
          font-weight: 700;
        }

        .eg-demo li svg {
          color: ${GREEN};
          flex: 0 0 auto;
        }

        .eg-screen-gallery {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
          align-items: stretch;
        }

        .eg-screen-gallery figure {
          position: relative;
          min-height: 190px;
          margin: 0;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 8px;
          background: rgba(255,255,255,.05);
          box-shadow: 0 26px 70px rgba(0,0,0,.34);
        }

        .eg-screen-gallery figure.is-large {
          grid-column: 1 / -1;
          min-height: 290px;
        }

        .eg-screen-gallery img {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
          object-position: top left;
        }

        .eg-screen-gallery figcaption {
          position: absolute;
          left: 14px;
          bottom: 14px;
          border-radius: 999px;
          padding: 8px 13px;
          background: rgba(0,0,0,.68);
          border: 1px solid rgba(255,255,255,.16);
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          backdrop-filter: blur(10px);
        }

        .eg-faq-list {
          max-width: 920px;
          margin: 0 auto;
          display: grid;
          gap: 12px;
        }

        .eg-faq article {
          border: 1px solid rgba(255,255,255,.1);
          border-radius: 8px;
          background: ${PANEL};
          overflow: hidden;
        }

        .eg-faq button {
          width: 100%;
          min-height: 76px;
          padding: 0 26px;
          border: 0;
          background: transparent;
          color: #fff;
          font: 800 18px Manrope, sans-serif;
          display: flex;
          align-items: center;
          justify-content: space-between;
          text-align: left;
          cursor: pointer;
        }

        .eg-faq svg {
          color: ${GREEN};
          transition: transform .2s ease;
        }

        .eg-faq article.is-open svg {
          transform: rotate(180deg);
        }

        .eg-faq article p {
          display: none;
          margin: 0;
          padding: 0 26px 24px;
          color: rgba(255,255,255,.63);
          line-height: 1.65;
        }

        .eg-faq article.is-open p {
          display: block;
        }

        .eg-contact {
          grid-template-columns: minmax(0, 1fr) auto;
          border-top: 1px solid rgba(255,255,255,.08);
        }

        .eg-contact-actions {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: stretch;
        }

        .eg-footer {
          min-height: 120px;
          padding: 28px 68px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          border-top: 1px solid rgba(255,255,255,.08);
          color: rgba(255,255,255,.52);
          background: #020403;
        }

        @media (max-width: 1240px) {
          .eg-header {
            padding: 0 28px;
          }

          .eg-nav {
            gap: 24px;
          }

          .eg-hero {
            grid-template-columns: 1fr;
            padding: 136px 28px 42px;
          }

          .eg-mockup {
            min-height: 610px;
            width: 100%;
            transform: translateY(-16px);
          }

          .eg-laptop-img {
            width: min(1040px, 118vw);
            right: auto;
            left: 50%;
            top: -74px;
            transform: translateX(-55%);
          }

          .eg-phone-img {
            width: min(610px, 64vw);
            top: 92px;
            right: calc(50% - 450px);
          }

          .eg-trust-bar {
            margin-top: 8px;
          }

          .eg-feature-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 920px) {
          .eg-header {
            height: 84px;
          }

          .eg-brand img {
            width: 58px;
            height: 44px;
          }

          .eg-brand strong {
            font-size: 19px;
          }

          .eg-brand small {
            font-size: 12px;
          }

          .eg-nav,
          .eg-actions {
            display: none;
          }

          .eg-menu-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 46px;
            height: 46px;
            border: 1px solid rgba(34,227,155,.45);
            border-radius: 10px;
            background: rgba(0,0,0,.24);
            color: ${GREEN};
          }

          .eg-mobile-panel {
            position: absolute;
            top: 84px;
            left: 16px;
            right: 16px;
            display: grid;
            gap: 16px;
            padding: 18px;
            border: 1px solid rgba(34,227,155,.28);
            border-radius: 8px;
            background: rgba(3,6,5,.96);
            box-shadow: 0 24px 54px rgba(0,0,0,.48);
          }

          .eg-mobile-panel button {
            text-align: left;
          }

          .eg-mobile-panel .eg-btn {
            color: #00150c;
            text-align: center;
          }

          .eg-hero {
            min-height: auto;
            padding-top: 118px;
          }

          .eg-kicker,
          .eg-mini-label {
            font-size: 12px;
            gap: 12px;
          }

          .eg-hero h1 {
            font-size: 46px;
            margin-top: 22px;
          }

          .eg-hero p {
            font-size: 18px;
          }

          .eg-hero-buttons {
            flex-direction: column;
            align-items: stretch;
          }

          .eg-btn,
          .eg-btn-big {
            width: 100%;
            min-height: 58px;
            padding: 0 20px;
            font-size: 16px;
          }

          .eg-proof-row {
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }

          .eg-proof-row div {
            border-right: 0;
            margin-right: 0;
            padding-right: 0;
          }

          .eg-proof-row span {
            max-width: none;
          }

          .eg-mockup {
            min-height: 510px;
            margin-top: 20px;
          }

          .eg-laptop-img {
            width: 850px;
            left: -112px;
            right: auto;
            top: -34px;
            transform: none;
            transform-origin: top left;
          }

          .eg-phone-img {
            top: 124px;
            right: -96px;
            width: 470px;
            transform-origin: top right;
          }

          .eg-trust-bar {
            width: 100%;
            grid-template-columns: 1fr;
          }

          .eg-trust-bar div {
            min-height: 92px;
            padding: 0 24px;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,.12);
          }

          .eg-trust-bar div:last-child {
            border-bottom: 0;
          }

          .eg-section,
          .eg-faq,
          .eg-demo,
          .eg-contact {
            padding: 76px 22px;
          }

          .eg-feature-grid,
          .eg-demo,
          .eg-contact {
            grid-template-columns: 1fr;
          }

          .eg-contact-actions {
            width: 100%;
          }

          .eg-footer {
            padding: 26px 22px;
            flex-direction: column;
            align-items: flex-start;
          }
        }

        @media (max-width: 560px) {
          .eg-hero {
            padding-left: 20px;
            padding-right: 20px;
          }

          .eg-hero h1 {
            font-size: 40px;
          }

          .eg-proof-row {
            grid-template-columns: 1fr;
            margin-top: 34px;
          }

          .eg-mockup {
            min-height: 420px;
            overflow: hidden;
          }

          .eg-laptop-img {
            left: -128px;
            top: -6px;
            width: 660px;
          }

          .eg-phone-img {
            top: 126px;
            right: -116px;
            width: 355px;
          }

          .eg-feature-grid article {
            min-height: auto;
          }

          .eg-price-pill {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </main>
  );
}

function HeroMockup() {
  return (
    <div className="eg-mockup" aria-hidden="true">
      <img className="eg-laptop-img" src="/eg-hero-laptop.png" alt="" />
      <img className="eg-phone-img" src="/eg-hero-phone.png" alt="" />
    </div>
  );
}
