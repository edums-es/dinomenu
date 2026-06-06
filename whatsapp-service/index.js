/**
 * WhatsApp Session Service
 * Gerencia uma sessão WhatsApp por restaurante via whatsapp-web.js.
 * Cada restaurante escaneia seu próprio QR code — sessão fica salva em disco.
 *
 * Endpoints:
 *   GET  /session/:rid/qr          → { status, qr (data URL) }
 *   GET  /session/:rid/status      → { status }
 *   POST /session/:rid/send        → { phone, message } → { ok }
 *   DELETE /session/:rid           → desconecta e limpa sessão
 *   GET  /health                   → { ok }
 */

const express = require("express");
const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");

const app = express();
app.use(express.json());

// { restaurantId: { client, status, qr, initTime } }
const sessions = {};

// ── Status possíveis ────────────────────────────────────────────────────────
// initializing | qr | connecting | connected | disconnected | error

function log(rid, msg) {
  console.log(`[WA][${rid}] ${msg}`);
}

// ── Cria / retorna sessão ───────────────────────────────────────────────────
async function startSession(rid) {
  if (sessions[rid]) return sessions[rid];

  const session = { client: null, status: "initializing", qr: null, initTime: Date.now() };
  sessions[rid] = session;

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: rid,
      dataPath: process.env.SESSION_DIR || "/app/sessions",
    }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    },
  });

  client.on("qr", async (rawQr) => {
    try {
      session.qr = await QRCode.toDataURL(rawQr);
      session.status = "qr";
      log(rid, "QR gerado, aguardando escaneamento...");
    } catch (e) {
      log(rid, `Erro ao gerar QR: ${e.message}`);
    }
  });

  client.on("authenticated", () => {
    session.status = "connecting";
    session.qr = null;
    log(rid, "Autenticado, inicializando...");
  });

  client.on("ready", () => {
    session.status = "connected";
    session.qr = null;
    log(rid, "Conectado e pronto!");
  });

  client.on("disconnected", (reason) => {
    session.status = "disconnected";
    session.qr = null;
    log(rid, `Desconectado: ${reason}`);
    // Remove da memória para forçar reinicialização na próxima chamada
    setTimeout(() => { delete sessions[rid]; }, 3000);
  });

  client.on("auth_failure", (msg) => {
    session.status = "error";
    session.qr = null;
    log(rid, `Falha de autenticação: ${msg}`);
    delete sessions[rid];
  });

  try {
    session.client = client;
    await client.initialize();
  } catch (e) {
    session.status = "error";
    log(rid, `Erro ao inicializar: ${e.message}`);
    delete sessions[rid];
  }

  return session;
}

// ── GET /session/:rid/qr ────────────────────────────────────────────────────
app.get("/session/:rid/qr", async (req, res) => {
  const { rid } = req.params;
  // Se já existe sessão conectada, retorna imediatamente
  if (sessions[rid]?.status === "connected") {
    return res.json({ status: "connected", qr: null });
  }
  // Inicia sessão em background (não bloqueia o request)
  if (!sessions[rid]) {
    startSession(rid).catch((e) => log(rid, `startSession error: ${e.message}`));
  }
  const session = sessions[rid];
  res.json({
    status: session?.status || "initializing",
    qr: session?.qr || null,
  });
});

// ── GET /session/:rid/status ────────────────────────────────────────────────
app.get("/session/:rid/status", (req, res) => {
  const session = sessions[req.params.rid];
  res.json({ status: session?.status || "disconnected" });
});

// ── POST /session/:rid/send ─────────────────────────────────────────────────
app.post("/session/:rid/send", async (req, res) => {
  const { rid } = req.params;
  const { phone, message } = req.body;
  const session = sessions[rid];

  if (!session || session.status !== "connected") {
    return res.status(400).json({ ok: false, error: "WhatsApp não conectado" });
  }
  if (!phone || !message) {
    return res.status(400).json({ ok: false, error: "phone e message são obrigatórios" });
  }

  try {
    let raw = phone.replace(/\D/g, "");
    if (!raw.startsWith("55")) raw = "55" + raw;
    const chatId = `${raw}@c.us`;
    await session.client.sendMessage(chatId, message);
    log(rid, `Mensagem enviada para ${raw}`);
    res.json({ ok: true });
  } catch (e) {
    log(rid, `Erro ao enviar: ${e.message}`);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── DELETE /session/:rid ────────────────────────────────────────────────────
app.delete("/session/:rid", async (req, res) => {
  const { rid } = req.params;
  const session = sessions[rid];
  if (!session) return res.json({ ok: true });
  try {
    await session.client?.destroy();
  } catch {}
  delete sessions[rid];
  log(rid, "Sessão removida manualmente");
  res.json({ ok: true });
});

// ── GET /health ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    sessions: Object.fromEntries(
      Object.entries(sessions).map(([k, v]) => [k, v.status])
    ),
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[WA] Serviço rodando na porta ${PORT}`);
  console.log(`[WA] Sessions dir: ${process.env.SESSION_DIR || "/app/sessions"}`);
});
