import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

const GREEN = "#22e39b";
const GREEN_DARK = "#04a86c";
const BG = "#020403";
const TEXT = "#f7fbf8";
const MUTED = "rgba(255,255,255,.58)";

const INPUT_BASE = {
  width: "100%",
  boxSizing: "border-box",
  height: 54,
  borderRadius: 10,
  background: "rgba(255,255,255,.075)",
  border: "1px solid rgba(255,255,255,.11)",
  color: TEXT,
  fontSize: 15,
  padding: "0 16px",
  fontFamily: "Manrope, sans-serif",
  outline: "none",
  transition: "border-color .2s, box-shadow .2s, background .2s",
};

const FEATURE_BADGES = ["Cardapio online", "Pedidos", "PDV", "WhatsApp", "Relatorios", "Clientes"];

const HIGHLIGHTS = [
  { icon: Store, label: "Cardapio pronto" },
  { icon: MessageCircle, label: "Pedidos no WhatsApp" },
  { icon: BarChart3, label: "Gestao em tempo real" },
];

export default function LoginPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("login");
  const [showPass, setShowPass] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rName, setRName] = useState("");
  const [rEmail, setREmail] = useState("");
  const [rPass, setRPass] = useState("");
  const [rStore, setRStore] = useState("");

  useEffect(() => {
    if (user?.role) navigate(user.role === "super_admin" ? "/super" : "/supermaster", { replace: true });
  }, [user, navigate]);

  const focusInput = (e) => {
    e.target.style.borderColor = GREEN;
    e.target.style.boxShadow = `0 0 0 3px rgba(34,227,155,.13)`;
    e.target.style.background = "rgba(255,255,255,.095)";
  };

  const blurInput = (e) => {
    e.target.style.borderColor = "rgba(255,255,255,.11)";
    e.target.style.boxShadow = "none";
    e.target.style.background = "rgba(255,255,255,.075)";
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success("Bem-vindo de volta!");
      navigate(u.role === "super_admin" ? "/super" : "/supermaster", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register({ name: rName, email: rEmail, password: rPass, restaurant_name: rStore });
      toast.success("Restaurante criado!");
      navigate("/supermaster", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Falha no cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-brand-panel">
        <div className="login-panel-glow" />
        <Link to="/" className="login-logo" aria-label="EG Delivery">
          <img src="/logoeg.png" alt="" />
          <span>
            <strong>EG Delivery</strong>
            <small>by Easy Growth</small>
          </span>
        </Link>

        <div className="login-brand-copy">
          <span className="login-kicker">
            <i />
            Sistema completo de delivery
          </span>
          <h1>Controle seu delivery com uma operacao mais moderna.</h1>
          <p>
            Cardapio online, pedidos, PDV e relatorios em uma plataforma pronta para vender todos os
            dias.
          </p>

          <div className="login-badges">
            {FEATURE_BADGES.map((feature) => (
              <span key={feature}>{feature}</span>
            ))}
          </div>
        </div>

        <div className="login-highlights">
          {HIGHLIGHTS.map((item) => (
            <div key={item.label}>
              <item.icon size={19} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <div className="login-card-top">
            <div>
              <span className="login-card-icon">
                {tab === "login" ? <ShieldCheck size={22} /> : <Sparkles size={22} />}
              </span>
              <h2>{tab === "login" ? "Acesse seu painel" : "Crie sua loja"}</h2>
              <p>
                {tab === "login"
                  ? "Entre para acompanhar pedidos, vendas e configuracoes."
                  : "Comece com uma estrutura profissional para vender online."}
              </p>
            </div>
          </div>

          <div className="login-tabs" role="tablist" aria-label="Autenticacao">
            {[
              ["login", "Entrar"],
              ["register", "Criar conta"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                data-testid={`tab-${key}`}
                className={tab === key ? "is-active" : ""}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="login-form">
              <Field label="E-mail">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-testid="login-email"
                  placeholder="voce@restaurante.com"
                  style={INPUT_BASE}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </Field>

              <Field label="Senha">
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  showPass={showPass}
                  setShowPass={setShowPass}
                  testId="login-password"
                  placeholder="Digite sua senha"
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </Field>

              <SubmitButton loading={loading} testId="login-submit" label="Entrar" />
            </form>
          ) : (
            <form onSubmit={handleRegister} className="login-form">
              <Field label="Nome da loja">
                <input
                  type="text"
                  required
                  value={rStore}
                  onChange={(e) => setRStore(e.target.value)}
                  data-testid="register-store"
                  placeholder="Ex: Burger Prime"
                  style={INPUT_BASE}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </Field>
              <Field label="Seu nome">
                <input
                  type="text"
                  required
                  value={rName}
                  onChange={(e) => setRName(e.target.value)}
                  data-testid="register-name"
                  placeholder="Joao Silva"
                  style={INPUT_BASE}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </Field>
              <Field label="E-mail">
                <input
                  type="email"
                  required
                  value={rEmail}
                  onChange={(e) => setREmail(e.target.value)}
                  data-testid="register-email"
                  placeholder="voce@email.com"
                  style={INPUT_BASE}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </Field>
              <Field label="Senha">
                <PasswordInput
                  value={rPass}
                  onChange={setRPass}
                  showPass={showPass}
                  setShowPass={setShowPass}
                  testId="register-password"
                  placeholder="Minimo 6 caracteres"
                  minLength={6}
                  onFocus={focusInput}
                  onBlur={blurInput}
                />
              </Field>

              <SubmitButton loading={loading} testId="register-submit" label="Criar loja" />
            </form>
          )}

          <div className="login-card-footer">
            <CheckCircle2 size={16} />
            <span>Ambiente protegido para sua equipe operar com seguranca.</span>
          </div>
        </div>
      </section>

      <style>{`
        @keyframes loginSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .login-page {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(420px, 46%) 1fr;
          background:
            radial-gradient(circle at 78% 28%, rgba(34,227,155,.14), transparent 32%),
            radial-gradient(circle at 24% 88%, rgba(34,227,155,.12), transparent 30%),
            ${BG};
          color: ${TEXT};
          font-family: Manrope, Inter, system-ui, sans-serif;
          overflow: hidden;
        }

        .login-brand-panel {
          position: relative;
          min-height: 100vh;
          padding: 42px 56px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-right: 1px solid rgba(255,255,255,.08);
          background:
            linear-gradient(160deg, rgba(255,255,255,.045), rgba(255,255,255,.015)),
            url("/eg-hero-bg.png") center / cover no-repeat;
        }

        .login-brand-panel::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(2,4,3,.94), rgba(2,4,3,.74));
          pointer-events: none;
        }

        .login-panel-glow {
          position: absolute;
          right: -180px;
          bottom: -150px;
          width: 520px;
          height: 520px;
          border: 1px solid rgba(34,227,155,.28);
          border-radius: 45% 55% 48% 52%;
          box-shadow: inset 0 0 90px rgba(34,227,155,.1);
        }

        .login-logo,
        .login-brand-copy,
        .login-highlights {
          position: relative;
          z-index: 1;
        }

        .login-logo {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          width: fit-content;
          color: #fff;
          text-decoration: none;
        }

        .login-logo img {
          width: 74px;
          height: 52px;
          object-fit: contain;
        }

        .login-logo strong {
          display: block;
          font: 800 24px/.95 Outfit, Manrope, sans-serif;
          letter-spacing: 0;
        }

        .login-logo small {
          display: block;
          margin-top: 6px;
          color: rgba(255,255,255,.62);
          font-size: 14px;
        }

        .login-brand-copy {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          max-width: 660px;
        }

        .login-kicker {
          display: inline-flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 30px;
          color: ${GREEN};
          font-size: 13px;
          font-weight: 800;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .login-kicker i {
          width: 38px;
          height: 2px;
          border-radius: 999px;
          background: ${GREEN};
        }

        .login-brand-copy h1 {
          margin: 0;
          font: 800 clamp(38px, 4vw, 62px)/1.06 Outfit, Manrope, sans-serif;
          letter-spacing: 0;
          max-width: 680px;
        }

        .login-brand-copy p {
          margin: 22px 0 0;
          max-width: 590px;
          color: rgba(255,255,255,.68);
          font-size: 18px;
          line-height: 1.65;
        }

        .login-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 32px;
        }

        .login-badges span {
          padding: 8px 13px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,.12);
          background: rgba(255,255,255,.045);
          color: rgba(255,255,255,.72);
          font-size: 12px;
          font-weight: 700;
        }

        .login-highlights {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .login-highlights div {
          min-height: 74px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          gap: 11px;
          border: 1px solid rgba(255,255,255,.11);
          border-radius: 8px;
          background: rgba(0,0,0,.18);
          color: rgba(255,255,255,.85);
          font-size: 13px;
          font-weight: 800;
        }

        .login-highlights svg {
          color: ${GREEN};
          flex: 0 0 auto;
        }

        .login-form-panel {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 44px 28px;
        }

        .login-card {
          width: min(440px, 100%);
          padding: 28px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.035));
          box-shadow: 0 34px 90px rgba(0,0,0,.45);
          backdrop-filter: blur(18px);
        }

        .login-card-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: ${GREEN};
          background: rgba(34,227,155,.12);
          border: 1px solid rgba(34,227,155,.32);
          margin-bottom: 18px;
        }

        .login-card h2 {
          margin: 0 0 8px;
          font: 800 30px/1.1 Outfit, Manrope, sans-serif;
        }

        .login-card p {
          margin: 0;
          color: ${MUTED};
          font-size: 14px;
          line-height: 1.55;
        }

        .login-tabs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          margin: 26px 0;
          padding: 4px;
          border: 1px solid rgba(255,255,255,.11);
          border-radius: 12px;
          background: rgba(0,0,0,.26);
        }

        .login-tabs button {
          height: 43px;
          border: 0;
          border-radius: 9px;
          background: transparent;
          color: rgba(255,255,255,.5);
          font: 800 14px Manrope, sans-serif;
          cursor: pointer;
          transition: background .2s, color .2s, box-shadow .2s;
        }

        .login-tabs button.is-active {
          color: #00150c;
          background: linear-gradient(135deg, ${GREEN}, #28d990 58%, ${GREEN_DARK});
          box-shadow: 0 12px 26px rgba(34,227,155,.18);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .login-field label {
          display: block;
          margin-bottom: 8px;
          color: rgba(255,255,255,.48);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .12em;
          text-transform: uppercase;
        }

        .login-submit {
          height: 54px;
          margin-top: 4px;
          border: 0;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          background: linear-gradient(135deg, ${GREEN}, #28d990 56%, ${GREEN_DARK});
          color: #00150c;
          font: 800 15px Manrope, sans-serif;
          cursor: pointer;
          box-shadow: 0 18px 38px rgba(34,227,155,.19);
          transition: transform .2s, opacity .2s;
        }

        .login-submit:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .login-submit:disabled {
          cursor: not-allowed;
          opacity: .7;
        }

        .login-card-footer {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 22px;
          padding-top: 18px;
          border-top: 1px solid rgba(255,255,255,.09);
          color: rgba(255,255,255,.56);
          font-size: 12px;
          line-height: 1.4;
        }

        .login-card-footer svg {
          color: ${GREEN};
          flex: 0 0 auto;
        }

        @media (max-width: 980px) {
          .login-page {
            grid-template-columns: 1fr;
            min-height: 100vh;
            overflow: auto;
          }

          .login-brand-panel {
            min-height: auto;
            padding: 28px 22px 22px;
            border-right: 0;
            border-bottom: 1px solid rgba(255,255,255,.08);
          }

          .login-brand-copy {
            padding: 46px 0 28px;
          }

          .login-highlights {
            grid-template-columns: 1fr;
          }

          .login-form-panel {
            min-height: auto;
            padding: 28px 20px 42px;
          }
        }

        @media (max-width: 560px) {
          .login-logo img {
            width: 58px;
            height: 42px;
          }

          .login-logo strong {
            font-size: 20px;
          }

          .login-brand-copy h1 {
            font-size: 34px;
          }

          .login-brand-copy p {
            font-size: 15px;
          }

          .login-card {
            padding: 22px;
          }
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }) {
  return (
    <div className="login-field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function PasswordInput({ value, onChange, showPass, setShowPass, testId, placeholder, minLength, onFocus, onBlur }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={showPass ? "text" : "password"}
        required
        minLength={minLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        placeholder={placeholder}
        style={{ ...INPUT_BASE, paddingRight: 48 }}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <button
        type="button"
        onClick={() => setShowPass((s) => !s)}
        aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
        style={{
          position: "absolute",
          right: 15,
          top: "50%",
          transform: "translateY(-50%)",
          width: 28,
          height: 28,
          display: "grid",
          placeItems: "center",
          background: "transparent",
          border: 0,
          color: "rgba(255,255,255,.42)",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

function SubmitButton({ loading, testId, label }) {
  return (
    <button type="submit" disabled={loading} data-testid={testId} className="login-submit">
      {loading ? (
        <Loader2 size={17} style={{ animation: "loginSpin 1s linear infinite" }} />
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight size={18} />
        </>
      )}
    </button>
  );
}
