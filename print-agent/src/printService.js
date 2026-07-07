const EventEmitter = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");

function runPowerShell(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], {
      windowsHide: true,
      timeout,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || "").trim()));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function resolveConfigPaths(userDataDir = null) {
  const candidates = [];

  if (userDataDir) {
    candidates.push(path.join(userDataDir, "config.json"));
  }

  const roamingAppData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  const appDataNames = [
    "Dino Menu Impressora",
    "DinoMenu Impressora",
    "EG Delivery",
    "EG Delivery Printer",
    "EG Delivery Impressora",
    "EG Delivery Impressora Automatica",
    "eg-delivery-print-agent",
    "egdelivery-print-agent",
  ];

  for (const baseDir of [roamingAppData, localAppData]) {
    if (!baseDir) continue;
    for (const appName of appDataNames) {
      candidates.push(path.join(baseDir, appName, "config.json"));
      candidates.push(path.join(baseDir, appName, "config.egdelivery.json"));
    }
  }

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "config.egdelivery.json"));
    candidates.push(path.join(process.resourcesPath, "config.json"));
  }

  candidates.push(path.join(path.dirname(process.execPath), "config.egdelivery.json"));
  candidates.push(path.join(path.dirname(process.execPath), "config.json"));
  candidates.push(path.join(process.cwd(), "config.egdelivery.json"));
  candidates.push(path.join(process.cwd(), "config.json"));
  candidates.push(path.join(__dirname, "..", "config.json"));

  return [...new Set(candidates)];
}

function normalizeApiBase(value) {
  let raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "https://api.easygrowth.com.br/api";
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    if (url.hostname === "app.easygrowth.com.br") {
      return "https://api.easygrowth.com.br/api";
    }
    const apiIndex = url.pathname.toLowerCase().indexOf("/api");
    if (apiIndex >= 0) {
      url.pathname = url.pathname.slice(0, apiIndex + 4);
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/+$/, "");
    }
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/api`.replace(/^\/api\/api$/i, "/api");
    url.search = "";
    url.hash = "";
    raw = url.toString().replace(/\/+$/, "");
  } catch {
    return raw;
  }
  return raw
    .replace(/\/print-agent\/jobs\/claim$/i, "")
    .replace(/\/print-agent\/jobs\/[^/]+\/complete$/i, "");
}

async function readApiError(res) {
  try {
    const body = await res.json();
    return body?.detail || body?.message || `${res.status}`;
  } catch {
    return `${res.status}`;
  }
}

async function validateStoreLink({ api, email, password, token }) {
  const apiBase = normalizeApiBase(api);
  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`Login invalido: ${await readApiError(loginRes)}`);
  }
  const login = await loginRes.json();
  const authToken = login.token;
  const user = login.user || {};
  if (!authToken || !user.restaurant_id) {
    throw new Error("Esta conta nao esta vinculada a uma loja do EG Delivery");
  }

  const validateRes = await fetch(`${apiBase}/admin/printing/agent/validate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ token }),
  });
  if (!validateRes.ok) {
    throw new Error(`Token invalido: ${await readApiError(validateRes)}`);
  }
  const validated = await validateRes.json();
  return { apiBase, user, restaurant: validated };
}

async function loadConfig(userDataDir = null) {
  const configPath = userDataDir ? path.join(userDataDir, "config.json") : null;
  for (const candidate of resolveConfigPaths(userDataDir)) {
    const config = await readJson(candidate);
    if (config) {
      if (configPath && candidate !== configPath) {
        await writeJson(configPath, config);
      }
      return { config, source: candidate, path: configPath || candidate };
    }
  }
  return { config: {}, source: null, path: configPath };
}

async function listPrinters() {
  const script = "Get-Printer | Select-Object -ExpandProperty Name";
  const out = await runPowerShell(["-Command", script]);
  return out
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

async function printText(text, printerName) {
  const file = path.join(os.tmpdir(), `eg-delivery-order-${Date.now()}.txt`);
  await fs.writeFile(file, text, "utf8");
  try {
    const script = [
      "& {",
      "param($File, $Printer)",
      "if ($Printer -and $Printer.Trim().Length -gt 0) {",
      "  Get-Content -LiteralPath $File | Out-Printer -Name $Printer",
      "} else {",
      "  Get-Content -LiteralPath $File | Out-Printer",
      "}",
      "}",
    ].join(" ");
    await runPowerShell(["-Command", script, file, printerName || ""]);
  } finally {
    await fs.rm(file, { force: true });
  }
}

class PrintService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.userDataDir = options.userDataDir || null;
    this.configPath = null;
    this.timer = null;
    this.running = false;
    this.busy = false;
    this.state = {
      api: "",
      token: "",
      email: "",
      restaurantName: "",
      agentId: "",
      printerName: "",
      connected: false,
      lastOrder: null,
      lastError: null,
      lastCheckAt: null,
      printedCount: 0,
      pendingCount: 0,
      status: "Iniciando",
    };
  }

  snapshot() {
    return { ...this.state, running: this.running };
  }

  setState(patch) {
    this.state = { ...this.state, ...patch };
    this.emit("state", this.snapshot());
  }

  async load() {
    const loaded = await loadConfig(this.userDataDir);
    const config = loaded.config || {};
    this.configPath = loaded.path;
    this.config = config;
    this.api = normalizeApiBase(process.env.EG_PRINT_API || config.api || config.endpoint || config.api_url);
    this.token = process.env.EG_PRINT_TOKEN || config.token || config.store_token || config.printer_agent_token || config.chave || config.key || "";
    this.email = config.email || config.owner_email || "";
    this.restaurantName = config.restaurant_name || "";
    this.agentId = process.env.EG_PRINT_AGENT_ID || config.agent_id || config.agentId || `${os.hostname()}-eg-print-agent`;
    this.pollMs = Number(process.env.EG_PRINT_POLL_MS || config.poll_ms || 5000);
    this.printerName = process.env.EG_PRINTER_NAME || config.printer_name || "";
    this.setState({
      api: this.api,
      token: this.token,
      email: this.email,
      restaurantName: this.restaurantName,
      agentId: this.agentId,
      printerName: this.printerName || "Impressora padrao do Windows",
      status: this.token ? "Aguardando pedidos" : "Precisa vincular a loja",
    });
  }

  async saveConfig(patch) {
    const next = {
      ...(this.config || {}),
      ...patch,
    };
    if (next.token) {
      next.store_token = next.token;
      next.printer_agent_token = next.token;
      next.chave = next.token;
    }
    if (next.api) {
      next.api = normalizeApiBase(next.api);
      next.endpoint = next.api;
      next.api_url = next.api;
    }
    await writeJson(this.configPath, next);
    this.config = next;
    await this.load();
  }

  async linkStore({ api, email, password, token }) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanToken = String(token || "").trim();
    if (!cleanEmail || !password || !cleanToken) {
      throw new Error("Informe e-mail, senha e token da loja");
    }
    const { apiBase, user, restaurant } = await validateStoreLink({
      api,
      email: cleanEmail,
      password,
      token: cleanToken,
    });
    await this.saveConfig({
      api: apiBase,
      token: cleanToken,
      email: cleanEmail,
      owner_email: cleanEmail,
      restaurant_id: restaurant.restaurant_id || user.restaurant_id,
      restaurant_name: restaurant.restaurant_name || "",
    });
    return this.snapshot();
  }

  async start() {
    await this.load();
    if (!this.token) {
      this.running = false;
      this.setState({ connected: false, status: "Token da loja nao encontrado" });
      return;
    }

    this.running = true;
    this.setState({ status: "Aguardando pedidos" });
    await this.tick().catch((error) => this.handleError(error));
    this.timer = setInterval(() => {
      this.tick().catch((error) => this.handleError(error));
    }, this.pollMs);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.setState({ status: "Pausado" });
  }

  async restart() {
    this.stop();
    await this.start();
  }

  async claimJobs() {
    const res = await fetch(`${this.api}/print-agent/jobs/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token, agent_id: this.agentId, limit: 3 }),
    });
    if (!res.ok) throw new Error(`Falha ao conectar (${res.status})`);
    return (await res.json()).jobs || [];
  }

  async completeJob(job, success, error = null) {
    const res = await fetch(`${this.api}/print-agent/jobs/${job.id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: this.token, agent_id: this.agentId, success, error }),
    });
    if (!res.ok) throw new Error(`Falha ao confirmar impressao (${res.status})`);
  }

  async processJob(job) {
    const payload = job.payload || {};
    const copies = Math.max(1, Math.min(Number(payload.copies || 1), 5));
    const printerName = this.printerName || payload.printer_name || "";
    const text = payload.text || (payload.lines || []).join("\n");

    if (!text.trim()) throw new Error("Pedido sem texto para imprimir");
    for (let i = 0; i < copies; i += 1) {
      await printText(text, printerName);
    }
  }

  async tick() {
    if (!this.running || this.busy || !this.token) return;
    this.busy = true;
    this.setState({ lastCheckAt: new Date().toISOString(), status: "Verificando pedidos" });

    try {
      const jobs = await this.claimJobs();
      this.setState({ connected: true, pendingCount: jobs.length, lastError: null });
      for (const job of jobs) {
        try {
          this.setState({ status: `Imprimindo pedido #${job.order_number || job.id}` });
          await this.processJob(job);
          await this.completeJob(job, true);
          this.setState({
            lastOrder: job.order_number || job.id,
            printedCount: this.state.printedCount + 1,
            status: "Aguardando pedidos",
          });
          this.emit("printed", job);
        } catch (error) {
          await this.completeJob(job, false, error.message);
          this.handleError(error);
        }
      }
      if (!jobs.length) this.setState({ status: "Aguardando pedidos" });
    } finally {
      this.busy = false;
    }
  }

  handleError(error) {
    const message = error?.message || String(error);
    this.setState({ connected: false, lastError: message, status: "Atencao necessaria" });
    this.emit("error-log", message);
  }

  async testPrint() {
    const text = [
      "EG Delivery",
      "Teste de impressao",
      "------------------------------",
      `Data: ${new Date().toLocaleString("pt-BR")}`,
      `Impressora: ${this.printerName || "padrao do Windows"}`,
      "",
    ].join("\n");
    await printText(text, this.printerName);
    this.setState({ status: "Teste enviado para impressora", lastError: null });
  }

  async getPrinters() {
    return listPrinters();
  }
}

module.exports = {
  PrintService,
  listPrinters,
  loadConfig,
  resolveConfigPaths,
  printText,
  writeJson,
};
