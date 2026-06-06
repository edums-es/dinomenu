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
    this.api = process.env.EG_PRINT_API || config.api || "http://localhost:8000/api";
    this.token = process.env.EG_PRINT_TOKEN || config.token || "";
    this.agentId = process.env.EG_PRINT_AGENT_ID || config.agent_id || `${os.hostname()}-eg-print-agent`;
    this.pollMs = Number(process.env.EG_PRINT_POLL_MS || config.poll_ms || 5000);
    this.printerName = process.env.EG_PRINTER_NAME || config.printer_name || "";
    this.setState({
      api: this.api,
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
    await writeJson(this.configPath, next);
    this.config = next;
    await this.load();
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
  printText,
  writeJson,
};
