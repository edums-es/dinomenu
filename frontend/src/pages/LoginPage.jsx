import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Flame,
  LayoutDashboard,
  Loader2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatApiError } from "@/lib/api";

const RED = "#e30613";
const RED_DARK = "#97000a";
const TEXT = "#ffffff";

const INPUT_BASE = {
  width: "100%",
  boxSizing: "border-box",
  height: 56,
  borderRadius: 8,
  background: "#111111",
  border: "1px solid rgba(255,255,255,.16)",
  color: TEXT,
  fontSize: 15,
  padding: "0 16px",
  fontFamily: "Manrope, sans-serif",
  outline: "none",
  transition: "border-color .2s, box-shadow .2s, background .2s",
};

const FEATURES = [
  { icon: ShoppingBag, label: "Pedidos organizados" },
  { icon: LayoutDashboard, label: "Gestao em tempo real" },
  { icon: Zap, label: "Operacao mais rapida" },
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

  const focusInput = (event) => {
    event.target.style.borderColor = RED;
    event.target.style.boxShadow = "0 0 0 3px rgba(227,6,19,.18)";
    event.target.style.background = "#171717";
  };

  const blurInput = (event) => {
    event.target.style.borderColor = "rgba(255,255,255,.16)";
    event.target.style.boxShadow = "none";
    event.target.style.background = "#111111";
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const loggedUser = await login(email, password);
      toast.success("Bem-vindo ao Dino Menu!");
      navigate(loggedUser.role === "super_admin" ? "/super" : "/supermaster", { replace: true });
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail) || "Falha no login");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      await register({ name: rName, email: rEmail, password: rPass, restaurant_name: rStore });
      toast.success("Restaurante criado!");
      navigate("/supermaster", { replace: true });
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail) || "Falha no cadastro");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-stripes" aria-hidden="true" />

        <div className="login-brand" aria-label="Dino Menu">
          <span className="login-mark">D</span>
          <span>
            <strong>Dino Menu</strong>
            <small>Cardapio digital</small>
          </span>
        </div>

        <div className="login-copy">
          <span className="login-kicker"><Flame size={16} /> Sua operacao em campo</span>
          <h1>Venda com raca.<br /><em>Gerencie com controle.</em></h1>
          <p>
            Cardapio, pedidos, caixa e clientes em uma plataforma feita para o ritmo do seu restaurante.
          </p>
        </div>

        <div className="login-features">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label}><Icon size={18} /><span>{label}</span></div>
          ))}
        </div>
      </section>

      <section className="login-access">
        <div className="login-access-head">
          <span className="login-access-line" />
          <span>Acesso seguro</span>
        </div>

        <div className="login-card">
          <span className="login-card-icon">{tab === "login" ? <ShieldCheck size={23} /> : <Store size={23} />}</span>
          <h2>{tab === "login" ? "Entre no painel" : "Monte sua loja"}</h2>
          <p>{tab === "login" ? "Acesse sua central de operacoes." : "Crie sua estrutura para vender online."}</p>

          <div className="login-tabs" role="tablist" aria-label="Autenticacao">
            <button type="button" onClick={() => setTab("login")} className={tab === "login" ? "is-active" : ""}>
              Entrar
            </button>
            <button type="button" onClick={() => setTab("register")} className={tab === "register" ? "is-active" : ""}>
              Criar conta
            </button>
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="login-form">
              <Field label="E-mail">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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
              <SubmitButton loading={loading} testId="login-submit" label="Entrar no painel" />
            </form>
          ) : (
            <form onSubmit={handleRegister} className="login-form">
              <Field label="Nome da loja">
                <input
                  type="text"
                  required
                  value={rStore}
                  onChange={(event) => setRStore(event.target.value)}
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
                  onChange={(event) => setRName(event.target.value)}
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
                  onChange={(event) => setREmail(event.target.value)}
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
              <SubmitButton loading={loading} testId="register-submit" label="Criar minha loja" />
            </form>
          )}

          <div className="login-card-footer">
            <CheckCircle2 size={16} />
            Ambiente protegido para sua equipe.
          </div>
        </div>
      </section>

      <style>{`
        @keyframes loginSpin { to { transform: rotate(360deg); } }
        @keyframes pulseStripe { 50% { opacity: .42; } }

        .login-page {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(440px, 52%) 1fr;
          background: #050505;
          color: #fff;
          font-family: Manrope, Inter, system-ui, sans-serif;
          overflow: hidden;
        }

        .login-showcase {
          position: relative;
          min-height: 100vh;
          padding: 42px 58px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background:
            radial-gradient(circle at 75% 80%, rgba(227,6,19,.35), transparent 34%),
            linear-gradient(145deg, #171717 0 42%, #090909 42% 100%);
          border-right: 1px solid rgba(255,255,255,.1);
        }

        .login-showcase::after {
          content: "DINOMENU";
          position: absolute;
          right: -44px;
          bottom: 52px;
          color: transparent;
          -webkit-text-stroke: 1px rgba(255,255,255,.07);
          font: 900 104px/1 Outfit, sans-serif;
          letter-spacing: -.08em;
          transform: rotate(-90deg);
          transform-origin: bottom right;
        }

        .login-stripes {
          position: absolute;
          width: 720px;
          height: 170px;
          right: -260px;
          top: 17%;
          transform: rotate(-28deg);
          background: repeating-linear-gradient(0deg, ${RED} 0 34px, #080808 34px 68px);
          opacity: .82;
          animation: pulseStripe 5s ease-in-out infinite;
        }

        .login-brand, .login-copy, .login-features { position: relative; z-index: 1; }

        .login-brand {
          display: inline-flex;
          align-items: center;
          gap: 13px;
          width: fit-content;
        }

        .login-mark {
          width: 54px;
          height: 54px;
          display: grid;
          place-items: center;
          border-radius: 4px;
          color: #fff;
          background: ${RED};
          box-shadow: 8px 8px 0 #fff;
          font: 900 31px/1 Outfit, sans-serif;
          transform: skew(-7deg);
        }

        .login-brand strong {
          display: block;
          font: 900 25px/.95 Outfit, sans-serif;
          letter-spacing: -.02em;
          text-transform: uppercase;
        }

        .login-brand small {
          display: block;
          margin-top: 6px;
          color: rgba(255,255,255,.55);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
        }

        .login-copy {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          max-width: 710px;
        }

        .login-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          margin-bottom: 26px;
          padding: 8px 11px;
          color: #fff;
          background: ${RED};
          font-size: 11px;
          font-weight: 900;
          letter-spacing: .16em;
          text-transform: uppercase;
          transform: skew(-5deg);
        }

        .login-copy h1 {
          margin: 0;
          font: 900 clamp(44px, 5vw, 76px)/.98 Outfit, sans-serif;
          letter-spacing: -.055em;
          text-transform: uppercase;
        }

        .login-copy h1 em {
          color: ${RED};
          font-style: normal;
        }

        .login-copy p {
          max-width: 590px;
          margin: 25px 0 0;
          color: rgba(255,255,255,.65);
          font-size: 17px;
          line-height: 1.65;
        }

        .login-features {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: rgba(255,255,255,.14);
          border: 1px solid rgba(255,255,255,.14);
        }

        .login-features div {
          min-height: 72px;
          padding: 0 15px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #0c0c0c;
          color: rgba(255,255,255,.84);
          font-size: 12px;
          font-weight: 800;
        }

        .login-features svg { color: ${RED}; flex: 0 0 auto; }

        .login-access {
          min-height: 100vh;
          padding: 34px 28px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background:
            linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px),
            #050505;
          background-size: 36px 36px;
        }

        .login-access-head {
          width: min(440px, 100%);
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: rgba(255,255,255,.43);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .18em;
          text-transform: uppercase;
        }

        .login-access-line { width: 30px; height: 2px; background: ${RED}; }

        .login-card {
          width: min(440px, 100%);
          box-sizing: border-box;
          padding: 30px;
          border: 1px solid rgba(255,255,255,.14);
          border-top: 4px solid ${RED};
          border-radius: 4px;
          background: rgba(12,12,12,.96);
          box-shadow: 0 35px 90px rgba(0,0,0,.6);
        }

        .login-card-icon {
          width: 48px;
          height: 48px;
          margin-bottom: 18px;
          display: grid;
          place-items: center;
          color: #fff;
          background: ${RED};
          border-radius: 4px;
        }

        .login-card h2 {
          margin: 0 0 7px;
          font: 900 31px/1 Outfit, sans-serif;
          letter-spacing: -.035em;
          text-transform: uppercase;
        }

        .login-card p {
          margin: 0;
          color: rgba(255,255,255,.5);
          font-size: 13px;
        }

        .login-tabs {
          margin: 25px 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          border-bottom: 1px solid rgba(255,255,255,.13);
        }

        .login-tabs button {
          height: 45px;
          border: 0;
          border-bottom: 3px solid transparent;
          color: rgba(255,255,255,.42);
          background: transparent;
          font: 800 13px Manrope, sans-serif;
          cursor: pointer;
        }

        .login-tabs button.is-active { border-bottom-color: ${RED}; color: #fff; }
        .login-form { display: flex; flex-direction: column; gap: 16px; }

        .login-field label {
          display: block;
          margin-bottom: 8px;
          color: rgba(255,255,255,.5);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .15em;
          text-transform: uppercase;
        }

        .login-submit {
          height: 56px;
          margin-top: 4px;
          border: 0;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #fff;
          background: linear-gradient(135deg, ${RED}, ${RED_DARK});
          box-shadow: 0 16px 35px rgba(227,6,19,.23);
          font: 900 13px Manrope, sans-serif;
          letter-spacing: .06em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform .2s, filter .2s;
        }

        .login-submit:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.12); }
        .login-submit:disabled { cursor: not-allowed; opacity: .65; }

        .login-card-footer {
          margin-top: 22px;
          padding-top: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
          border-top: 1px solid rgba(255,255,255,.1);
          color: rgba(255,255,255,.43);
          font-size: 11px;
        }

        .login-card-footer svg { color: ${RED}; }

        @media (max-width: 980px) {
          .login-page { grid-template-columns: 1fr; overflow: auto; }
          .login-showcase { min-height: auto; padding: 28px 22px 24px; }
          .login-copy { padding: 70px 0 54px; }
          .login-access { min-height: auto; padding: 40px 20px 52px; }
        }

        @media (max-width: 600px) {
          .login-copy h1 { font-size: 40px; }
          .login-copy p { font-size: 14px; }
          .login-features { grid-template-columns: 1fr; }
          .login-features div { min-height: 56px; }
          .login-card { padding: 23px; }
          .login-showcase::after { display: none; }
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }) {
  return <div className="login-field"><label>{label}</label>{children}</div>;
}

function PasswordInput({ value, onChange, showPass, setShowPass, testId, placeholder, minLength, onFocus, onBlur }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type={showPass ? "text" : "password"}
        required
        minLength={minLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
        placeholder={placeholder}
        style={{ ...INPUT_BASE, paddingRight: 48 }}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <button
        type="button"
        onClick={() => setShowPass((visible) => !visible)}
        aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
        style={{
          position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
          width: 30, height: 30, display: "grid", placeItems: "center", padding: 0,
          border: 0, color: "rgba(255,255,255,.42)", background: "transparent", cursor: "pointer",
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
      {loading ? <Loader2 size={17} style={{ animation: "loginSpin 1s linear infinite" }} /> : <><span>{label}</span><ArrowRight size={18} /></>}
    </button>
  );
}
