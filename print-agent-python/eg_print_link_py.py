import json
import os
import socket
import subprocess
import tempfile
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urlunparse
from urllib.request import Request, urlopen


APP_NAME = "EG Delivery Print Link PY"
APP_VERSION = "1.0.0"
DEFAULT_API = "https://api.easygrowth.com.br/api"
POLL_SECONDS = 5


def app_dir():
    base = os.environ.get("APPDATA") or str(Path.home())
    path = Path(base) / APP_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


CONFIG_PATH = app_dir() / "config.json"
LOG_PATH = app_dir() / "print-link.log"


def normalize_api(value):
    raw = (value or "").strip().rstrip("/")
    if not raw:
        return DEFAULT_API
    if not raw.lower().startswith(("http://", "https://")):
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    if parsed.netloc == "app.easygrowth.com.br":
        return DEFAULT_API
    path = parsed.path.rstrip("/")
    api_index = path.lower().find("/api")
    if api_index >= 0:
        path = path[:api_index + 4]
    elif not path.endswith("/api"):
        path = f"{path}/api" if path else "/api"
    return urlunparse(parsed._replace(path=path, params="", query="", fragment="")).rstrip("/")


def read_json(path, fallback):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def write_json(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def log_line(message):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {message}"
    try:
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass
    return line


def powershell(args, timeout=30):
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    proc = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", *args],
        capture_output=True,
        text=True,
        timeout=timeout,
        creationflags=flags,
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or proc.stdout or "Falha no PowerShell").strip())
    return proc.stdout


def list_printers():
    out = powershell(["-Command", "Get-Printer | Select-Object -ExpandProperty Name"], timeout=15)
    return [line.strip() for line in out.splitlines() if line.strip()]


def print_text(text, printer_name):
    fd, file_name = tempfile.mkstemp(prefix="eg-delivery-order-", suffix=".txt")
    os.close(fd)
    path = Path(file_name)
    try:
        path.write_text(text, encoding="utf-8")
        script = (
            "& { param($File, $Printer) "
            "if ($Printer -and $Printer.Trim().Length -gt 0) { "
            "Get-Content -LiteralPath $File -Encoding UTF8 | Out-Printer -Name $Printer "
            "} else { "
            "Get-Content -LiteralPath $File -Encoding UTF8 | Out-Printer "
            "} }"
        )
        powershell(["-Command", script, str(path), printer_name or ""], timeout=60)
    finally:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


class ApiClient:
    def __init__(self, api_base):
        self.api_base = normalize_api(api_base)

    def request(self, method, path, payload=None, auth_token=None, timeout=25):
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"
        req = Request(f"{self.api_base}{path}", data=data, headers=headers, method=method)
        try:
            with urlopen(req, timeout=timeout) as res:
                body = res.read().decode("utf-8")
                return json.loads(body) if body else {}
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            try:
                parsed = json.loads(body)
                body = parsed.get("detail") or parsed.get("message") or body
            except json.JSONDecodeError:
                pass
            raise RuntimeError(f"{exc.code}: {body or exc.reason}") from exc
        except URLError as exc:
            raise RuntimeError(f"Falha de rede: {exc.reason}") from exc

    def login_and_validate(self, email, password, token):
        login = self.request("POST", "/auth/login", {"email": email, "password": password})
        auth_token = login.get("token")
        user = login.get("user") or {}
        if not auth_token or not user.get("restaurant_id"):
            raise RuntimeError("Conta sem loja vinculada")
        validated = self.request("POST", "/admin/printing/agent/validate", {"token": token}, auth_token=auth_token)
        return login, validated

    def claim(self, token, agent_id):
        return self.request("POST", "/print-agent/jobs/claim", {
            "token": token,
            "agent_id": agent_id,
            "limit": 3,
        }).get("jobs") or []

    def complete(self, job_id, token, agent_id, success, error=None):
        return self.request("POST", f"/print-agent/jobs/{job_id}/complete", {
            "token": token,
            "agent_id": agent_id,
            "success": bool(success),
            "error": error,
        })


class AgentState:
    def __init__(self):
        self.lock = threading.RLock()
        self.config = read_json(CONFIG_PATH, {})
        self.agent_id = self.config.get("agent_id") or f"{socket.gethostname()}-eg-print-link-py"
        self.status = "Precisa vincular" if not self.config.get("token") else "Aguardando pedidos"
        self.hint = "Informe e-mail, senha e token." if not self.config.get("token") else "Fila ativa."
        self.connected = False
        self.last_error = ""
        self.last_order = "-"
        self.printed_count = 0
        self.logs = []
        self.stop_event = threading.Event()
        self.worker = None

    def add_log(self, message):
        line = log_line(message)
        with self.lock:
            self.logs.append(line)
            self.logs = self.logs[-80:]

    def snapshot(self):
        with self.lock:
            return {
                "app": APP_NAME,
                "version": APP_VERSION,
                "api": self.config.get("api") or DEFAULT_API,
                "email": self.config.get("email") or "",
                "token": self.config.get("token") or "",
                "restaurant_name": self.config.get("restaurant_name") or "",
                "printer_name": self.config.get("printer_name") or "",
                "agent_id": self.agent_id,
                "status": self.status,
                "hint": self.hint,
                "connected": self.connected,
                "last_error": self.last_error,
                "last_order": self.last_order,
                "printed_count": self.printed_count,
                "logs": list(self.logs),
            }

    def set_status(self, status, hint="", connected=None, error=""):
        with self.lock:
            self.status = status
            self.hint = hint
            if connected is not None:
                self.connected = connected
            self.last_error = error

    def save_config(self, patch):
        with self.lock:
            self.config.update(patch)
            self.config["api"] = normalize_api(self.config.get("api"))
            self.config["agent_id"] = self.agent_id
            write_json(CONFIG_PATH, self.config)

    def connect(self, api, email, password, token):
        api = normalize_api(api)
        email = (email or "").strip().lower()
        token = (token or "").strip()
        if not email or not password or not token:
            raise RuntimeError("Informe e-mail, senha e token")
        client = ApiClient(api)
        _login, restaurant = client.login_and_validate(email, password, token)
        self.save_config({
            "api": client.api_base,
            "email": email,
            "token": token,
            "restaurant_id": restaurant.get("restaurant_id"),
            "restaurant_name": restaurant.get("restaurant_name") or "",
        })
        self.add_log(f"Loja conectada: {restaurant.get('restaurant_name') or restaurant.get('restaurant_id')}")
        self.start()

    def set_printer(self, printer_name):
        self.save_config({"printer_name": printer_name or ""})
        self.add_log(f"Impressora definida: {printer_name or 'Padrao do Windows'}")

    def start(self):
        self.stop()
        self.stop_event = threading.Event()
        self.worker = threading.Thread(target=self.loop, daemon=True)
        self.worker.start()

    def stop(self):
        self.stop_event.set()

    def loop(self):
        token = self.config.get("token") or ""
        if not token:
            self.set_status("Precisa vincular", "Informe e-mail, senha e token.", connected=False)
            return
        client = ApiClient(self.config.get("api") or DEFAULT_API)
        self.set_status("Aguardando pedidos", "Fila ativa. Verificando pedidos.", connected=True)
        while not self.stop_event.is_set():
            try:
                jobs = client.claim(token, self.agent_id)
                for job in jobs:
                    self.process_job(client, token, job)
                self.set_status("Aguardando pedidos", "Fila ativa. Verificando pedidos.", connected=True)
            except Exception as exc:
                self.set_status("Atencao necessaria", str(exc), connected=False, error=str(exc))
                self.add_log(f"Erro na busca: {exc}")
            self.stop_event.wait(POLL_SECONDS)

    def process_job(self, client, token, job):
        payload = job.get("payload") or {}
        job_id = job.get("id")
        order_number = job.get("order_number") or job_id
        text = payload.get("text") or "\n".join(payload.get("lines") or [])
        copies = max(1, min(int(payload.get("copies") or 1), 5))
        printer = self.config.get("printer_name") or payload.get("printer_name") or ""
        self.set_status(f"Imprimindo #{order_number}", "Enviando para impressora.", connected=True)
        try:
            if not text.strip():
                raise RuntimeError("Pedido sem texto para imprimir")
            for _ in range(copies):
                print_text(text, printer)
            client.complete(job_id, token, self.agent_id, True)
            with self.lock:
                self.last_order = str(order_number)
                self.printed_count += 1
            self.add_log(f"Pedido #{order_number} impresso")
        except Exception as exc:
            client.complete(job_id, token, self.agent_id, False, str(exc))
            self.add_log(f"Falha ao imprimir #{order_number}: {exc}")

    def test_print(self):
        text = "\n".join([
            APP_NAME,
            "Teste de impressao",
            "------------------------------",
            time.strftime("%d/%m/%Y %H:%M:%S"),
            f"Impressora: {self.config.get('printer_name') or 'Padrao do Windows'}",
            "",
        ])
        print_text(text, self.config.get("printer_name") or "")
        self.add_log("Teste enviado para impressora")


STATE = AgentState()


HTML = r"""<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EG Delivery Print Link PY</title>
  <style>
    :root { color-scheme: dark; --bg:#07100d; --panel:#101816; --panel2:#17241f; --line:#284139; --text:#f7fbf9; --muted:#9eb0aa; --green:#21d28a; --red:#ff6262; --amber:#f5c542; }
    * { box-sizing:border-box; }
    body { margin:0; background:linear-gradient(145deg,#050706,#071912 55%,#050706); color:var(--text); font-family:Segoe UI,Arial,sans-serif; }
    main { max-width:980px; margin:0 auto; padding:22px; display:grid; gap:16px; }
    section, header { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px; box-shadow:0 24px 70px rgba(0,0,0,.28); }
    header { border-color:rgba(33,210,138,.45); display:flex; justify-content:space-between; gap:18px; align-items:center; }
    h1,h2,p { margin:0; } h1 { font-size:28px; } h2 { font-size:19px; margin-bottom:4px; }
    .muted, label, #hint { color:var(--muted); } .tag { border:1px solid rgba(33,210,138,.45); background:rgba(33,210,138,.11); color:#d6f9e9; border-radius:999px; padding:7px 12px; font-weight:900; white-space:nowrap; }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    label { display:grid; gap:7px; font-size:12px; font-weight:900; text-transform:uppercase; }
    input, select { width:100%; height:44px; background:#07100d; color:var(--text); border:1px solid #31443d; border-radius:10px; padding:0 12px; outline:none; }
    input:focus, select:focus { border-color:var(--green); box-shadow:0 0 0 3px rgba(33,210,138,.12); }
    button { min-height:44px; border:0; border-radius:10px; font-weight:900; cursor:pointer; }
    .primary { background:linear-gradient(135deg,var(--green),#0fbf7a); color:#03100b; } .secondary { background:#26362f; color:#fff; border:1px solid #3a5048; }
    .row { display:flex; gap:10px; } .row > * { flex:1; }
    .status { display:grid; grid-template-columns:1fr auto; gap:10px; align-items:start; }
    .dot { width:16px; height:16px; border-radius:50%; background:var(--amber); box-shadow:0 0 0 7px rgba(245,197,66,.12); margin-top:6px; }
    .dot.ok { background:var(--green); box-shadow:0 0 0 7px rgba(33,210,138,.12); } .dot.err { background:var(--red); box-shadow:0 0 0 7px rgba(255,98,98,.12); }
    .metrics { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px; }
    .metric { background:var(--panel2); border-radius:10px; padding:13px; } .metric span { color:var(--muted); font-size:11px; font-weight:900; text-transform:uppercase; } .metric strong { display:block; font-size:24px; margin-top:6px; }
    pre { height:160px; overflow:auto; background:#050807; color:#d6f9e9; border-radius:10px; padding:12px; white-space:pre-wrap; }
    @media(max-width:760px){ .grid,.row,header { grid-template-columns:1fr; display:grid; } }
  </style>
</head>
<body>
<main>
  <header>
    <div><p class="muted">Novo app Python, sem Electron</p><h1>EG Delivery Print Link PY</h1><p class="muted">Abra, conecte com e-mail/senha/token e deixe rodando.</p></div>
    <div class="tag" id="version">v...</div>
  </header>
  <section>
    <h2>Conectar loja</h2><p class="muted">Dados da conta EG Delivery e token da aba Impressao.</p><br/>
    <div class="grid">
      <label>URL da API<input id="api" /></label>
      <label>E-mail<input id="email" /></label>
      <label>Senha<input id="password" type="password" /></label>
      <label>Token da loja<input id="token" /></label>
    </div><br/>
    <button class="primary" onclick="connect()">Entrar e sincronizar</button>
    <p class="muted" id="feedback"></p>
  </section>
  <section>
    <div class="status"><div><h2 id="status">Carregando</h2><p id="hint">Aguarde...</p></div><span id="dot" class="dot"></span></div>
    <div class="metrics"><div class="metric"><span>Ultimo pedido</span><strong id="last">-</strong></div><div class="metric"><span>Impressos</span><strong id="printed">0</strong></div></div>
  </section>
  <section>
    <h2>Impressora</h2><p class="muted">Escolha a impressora instalada no Windows.</p><br/>
    <div class="row"><select id="printer"></select><button class="secondary" onclick="loadPrinters()">Atualizar</button></div><br/>
    <div class="row"><button class="primary" onclick="testPrint()">Testar impressao</button><button class="secondary" onclick="restart()">Reiniciar busca</button></div>
  </section>
  <section><h2>Logs</h2><pre id="logs"></pre></section>
</main>
<script>
async function post(path, body={}) {
  const res = await fetch(path, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro");
  return data;
}
async function refresh() {
  const s = await (await fetch("/api/state")).json();
  version.textContent = "v" + s.version;
  api.value ||= s.api; email.value ||= s.email; token.value ||= s.token;
  status.textContent = s.status; hint.textContent = s.hint || "";
  last.textContent = s.last_order || "-"; printed.textContent = s.printed_count || 0;
  dot.className = "dot" + (s.connected ? " ok" : s.last_error ? " err" : "");
  logs.textContent = (s.logs || []).join("\n");
  if (s.printer_name && [...printer.options].some(o => o.value === s.printer_name)) printer.value = s.printer_name;
}
async function loadPrinters() {
  const data = await (await fetch("/api/printers")).json();
  printer.innerHTML = '<option value="">Padrao do Windows</option>' + data.printers.map(p => `<option>${p}</option>`).join("");
  await refresh();
}
async function connect() {
  feedback.textContent = "Validando...";
  try { await post("/api/connect", { api:api.value, email:email.value, password:password.value, token:token.value }); password.value=""; feedback.textContent="Conectado."; await refresh(); }
  catch(e){ feedback.textContent = e.message; }
}
async function testPrint() { await post("/api/printer", { printer_name:printer.value }); await post("/api/test"); await refresh(); }
async function restart() { await post("/api/printer", { printer_name:printer.value }); await post("/api/restart"); await refresh(); }
printer.addEventListener("change", () => post("/api/printer", { printer_name:printer.value }).then(refresh));
loadPrinters(); setInterval(refresh, 2000);
</script>
</body>
</html>"""


def json_response(handler, status, payload):
    data = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            data = HTML.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if self.path == "/api/state":
            json_response(self, 200, STATE.snapshot())
            return
        if self.path == "/api/printers":
            try:
                json_response(self, 200, {"printers": list_printers()})
            except Exception as exc:
                json_response(self, 500, {"error": str(exc)})
            return
        json_response(self, 404, {"error": "Not found"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            if self.path == "/api/connect":
                STATE.connect(payload.get("api"), payload.get("email"), payload.get("password"), payload.get("token"))
                json_response(self, 200, STATE.snapshot())
                return
            if self.path == "/api/printer":
                STATE.set_printer(payload.get("printer_name") or "")
                json_response(self, 200, STATE.snapshot())
                return
            if self.path == "/api/test":
                STATE.test_print()
                json_response(self, 200, STATE.snapshot())
                return
            if self.path == "/api/restart":
                STATE.start()
                json_response(self, 200, STATE.snapshot())
                return
            json_response(self, 404, {"error": "Not found"})
        except Exception as exc:
            STATE.add_log(f"Erro: {exc}")
            json_response(self, 500, {"error": str(exc)})


def main():
    if STATE.config.get("token"):
        STATE.start()
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    url = f"http://127.0.0.1:{server.server_port}/"
    STATE.add_log(f"Interface aberta em {url}")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    finally:
        STATE.stop()


if __name__ == "__main__":
    main()
