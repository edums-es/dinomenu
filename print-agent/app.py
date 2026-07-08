import os
import queue
import sys
import threading
import time
import tkinter as tk
import winreg
from tkinter import messagebox, ttk

from api_client import ApiClient, ApiError
from receipt import build_receipt
from storage import get_access_token, load_config, save_config, set_access_token
from windows_printer import default_printer, list_printers, print_raw


APP_NAME = "EG Delivery Impressora"
VERSION = "1.0.0"
BG = "#07110d"
PANEL = "#101b17"
INPUT = "#17241f"
LINE = "#294038"
TEXT = "#f7faf8"
MUTED = "#9bb8ab"
GREEN = "#18d18d"
RED = "#ff6969"
YELLOW = "#f6bd3b"


def executable_path():
    return sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__)


def set_startup(enabled):
    key_path = r"Software\Microsoft\Windows\CurrentVersion\Run"
    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            command = f'"{executable_path()}" --minimized'
            winreg.SetValueEx(key, "EGDeliveryPrintAgent", 0, winreg.REG_SZ, command)
        else:
            try:
                winreg.DeleteValue(key, "EGDeliveryPrintAgent")
            except FileNotFoundError:
                pass


class PrintAgentApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_NAME)
        self.geometry("760x640")
        self.minsize(680, 580)
        self.configure(bg=BG)
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self.config_data = load_config()
        self.access_token = get_access_token(self.config_data)
        self.events = queue.Queue()
        self.stop_event = threading.Event()
        self.worker = None
        self.connected = False
        self.printed_count = 0
        self.last_order = "-"
        self.style_ui()
        self.after(100, self.process_events)
        if self.access_token:
            self.show_dashboard()
            self.start_worker()
        else:
            self.show_login()
        if "--minimized" in sys.argv:
            self.after(300, self.iconify)

    def style_ui(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("TCombobox", fieldbackground=INPUT, background=INPUT, foreground=TEXT, arrowcolor=TEXT)
        style.map("TCombobox", fieldbackground=[("readonly", INPUT)], foreground=[("readonly", TEXT)])

    def clear(self):
        for child in self.winfo_children():
            child.destroy()

    def card(self, parent):
        return tk.Frame(parent, bg=PANEL, highlightbackground=LINE, highlightthickness=1)

    def label(self, parent, text, size=11, color=TEXT, bold=False):
        return tk.Label(
            parent,
            text=text,
            bg=parent.cget("bg"),
            fg=color,
            font=("Segoe UI", size, "bold" if bold else "normal"),
        )

    def entry(self, parent, show=None):
        widget = tk.Entry(
            parent,
            bg=INPUT,
            fg=TEXT,
            insertbackground=TEXT,
            relief="flat",
            highlightbackground=LINE,
            highlightcolor=GREEN,
            highlightthickness=1,
            font=("Segoe UI", 11),
            show=show,
        )
        return widget

    def button(self, parent, text, command, primary=True):
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=GREEN if primary else INPUT,
            fg="#03140d" if primary else TEXT,
            activebackground="#12b97c" if primary else LINE,
            activeforeground="#03140d" if primary else TEXT,
            relief="flat",
            cursor="hand2",
            font=("Segoe UI", 10, "bold"),
            padx=18,
            pady=10,
        )

    def header(self, parent):
        bar = tk.Frame(parent, bg=BG)
        bar.pack(fill="x", pady=(0, 20))
        mark = tk.Label(bar, text="EG", bg=GREEN, fg="#03140d", font=("Segoe UI", 13, "bold"), width=4, height=2)
        mark.pack(side="left")
        title = tk.Frame(bar, bg=BG)
        title.pack(side="left", padx=12)
        self.label(title, "EG Delivery", 17, TEXT, True).pack(anchor="w")
        self.label(title, "Impressao automatica", 10, MUTED).pack(anchor="w")
        self.label(bar, f"v{VERSION}", 9, MUTED).pack(side="right", anchor="n")

    def show_login(self):
        self.clear()
        root = tk.Frame(self, bg=BG, padx=42, pady=32)
        root.pack(fill="both", expand=True)
        self.header(root)
        box = self.card(root)
        box.pack(fill="x")
        inner = tk.Frame(box, bg=PANEL, padx=28, pady=24)
        inner.pack(fill="both")
        self.label(inner, "Vincular este computador", 18, TEXT, True).pack(anchor="w")
        self.label(
            inner,
            "Entre com a conta da loja e informe o token exibido no painel.",
            10,
            MUTED,
        ).pack(anchor="w", pady=(4, 20))

        self.login_email = self.form_field(inner, "E-mail")
        self.login_password = self.form_field(inner, "Senha", show="*")
        self.login_token = self.form_field(inner, "Token de pareamento")
        self.login_token.bind("<KeyRelease>", self.normalize_token)

        self.login_error = self.label(inner, "", 10, RED)
        self.login_error.pack(anchor="w", pady=(8, 0))
        self.login_button = self.button(inner, "Entrar e vincular", self.do_pair)
        self.login_button.pack(fill="x", pady=(14, 0))

        note = self.card(root)
        note.pack(fill="x", pady=(18, 0))
        self.label(
            note,
            "O token fica em Painel > Configuracoes > Impressao. Ele serve apenas para autorizar este computador.",
            9,
            MUTED,
        ).pack(anchor="w", padx=18, pady=14)

    def form_field(self, parent, title, show=None):
        self.label(parent, title, 9, MUTED, True).pack(anchor="w", pady=(8, 5))
        field = self.entry(parent, show)
        field.pack(fill="x", ipady=10)
        return field

    def normalize_token(self, _event=None):
        raw = "".join(ch for ch in self.login_token.get().upper() if ch.isalnum())[:12]
        chunks = [raw[index:index + 4] for index in range(0, len(raw), 4)]
        formatted = "-".join(chunks)
        if formatted != self.login_token.get():
            self.login_token.delete(0, "end")
            self.login_token.insert(0, formatted)

    def do_pair(self):
        email = self.login_email.get().strip()
        password = self.login_password.get()
        pairing_token = self.login_token.get().strip()
        if not email or not password or not pairing_token:
            self.login_error.config(text="Preencha e-mail, senha e token.")
            return
        self.login_button.config(state="disabled", text="Vinculando...")
        self.login_error.config(text="")

        def task():
            try:
                client = ApiClient(self.config_data["api_base"], VERSION)
                response = client.pair({
                    "email": email,
                    "password": password,
                    "pairing_token": pairing_token,
                    "device_id": self.config_data["device_id"],
                    "device_name": self.config_data["device_name"],
                    "app_version": VERSION,
                })
                self.events.put(("paired", response))
            except Exception as exc:
                self.events.put(("pair_error", str(exc)))

        threading.Thread(target=task, daemon=True).start()

    def show_dashboard(self):
        self.clear()
        root = tk.Frame(self, bg=BG, padx=32, pady=26)
        root.pack(fill="both", expand=True)
        self.header(root)

        status_card = self.card(root)
        status_card.pack(fill="x")
        status_inner = tk.Frame(status_card, bg=PANEL, padx=22, pady=18)
        status_inner.pack(fill="x")
        status_top = tk.Frame(status_inner, bg=PANEL)
        status_top.pack(fill="x")
        self.status_dot = tk.Label(status_top, text="●", bg=PANEL, fg=YELLOW, font=("Segoe UI", 18))
        self.status_dot.pack(side="left")
        text_box = tk.Frame(status_top, bg=PANEL)
        text_box.pack(side="left", padx=8)
        self.status_title = self.label(text_box, "Conectando...", 14, TEXT, True)
        self.status_title.pack(anchor="w")
        self.status_detail = self.label(text_box, self.config_data.get("restaurant_name", ""), 9, MUTED)
        self.status_detail.pack(anchor="w")
        self.disconnect_button = self.button(status_top, "Desvincular", self.disconnect, primary=False)
        self.disconnect_button.pack(side="right")

        metrics = tk.Frame(status_inner, bg=PANEL)
        metrics.pack(fill="x", pady=(18, 0))
        self.last_order_label = self.metric(metrics, "ULTIMO PEDIDO", self.last_order)
        self.printed_label = self.metric(metrics, "IMPRESSOS NESTA SESSAO", str(self.printed_count))

        printer_card = self.card(root)
        printer_card.pack(fill="x", pady=(18, 0))
        printer_inner = tk.Frame(printer_card, bg=PANEL, padx=22, pady=18)
        printer_inner.pack(fill="x")
        self.label(printer_inner, "Impressora", 13, TEXT, True).pack(anchor="w")
        self.label(printer_inner, "Selecione a impressora termica instalada no Windows.", 9, MUTED).pack(anchor="w", pady=(2, 12))
        row = tk.Frame(printer_inner, bg=PANEL)
        row.pack(fill="x")
        self.printer_var = tk.StringVar(value=self.config_data.get("printer_name", ""))
        self.printer_combo = ttk.Combobox(row, textvariable=self.printer_var, state="readonly", font=("Segoe UI", 10))
        self.printer_combo.pack(side="left", fill="x", expand=True, ipady=7)
        self.button(row, "Atualizar", self.refresh_printers, primary=False).pack(side="left", padx=(10, 0))

        options = tk.Frame(printer_inner, bg=PANEL)
        options.pack(fill="x", pady=(14, 0))
        self.paper_var = tk.StringVar(value=self.config_data.get("paper_width", "80mm"))
        self.label(options, "Papel", 9, MUTED, True).pack(side="left")
        paper = ttk.Combobox(options, textvariable=self.paper_var, values=["80mm", "58mm"], state="readonly", width=8)
        paper.pack(side="left", padx=(8, 22))
        self.cut_var = tk.BooleanVar(value=bool(self.config_data.get("cut_paper", True)))
        tk.Checkbutton(
            options,
            text="Cortar papel automaticamente",
            variable=self.cut_var,
            bg=PANEL,
            fg=TEXT,
            activebackground=PANEL,
            activeforeground=TEXT,
            selectcolor=INPUT,
            font=("Segoe UI", 9),
        ).pack(side="left")

        actions = tk.Frame(root, bg=BG)
        actions.pack(fill="x", pady=(18, 0))
        self.button(actions, "Salvar impressora", self.save_printer).pack(side="left", fill="x", expand=True)
        self.button(actions, "Testar impressao", self.test_print, primary=False).pack(side="left", fill="x", expand=True, padx=(12, 0))
        self.log_label = self.label(root, "Aguardando configuracao da impressora.", 9, MUTED)
        self.log_label.pack(anchor="w", pady=(16, 0))
        self.refresh_printers()

    def metric(self, parent, title, value):
        box = tk.Frame(parent, bg=INPUT, padx=15, pady=12)
        box.pack(side="left", fill="x", expand=True, padx=(0, 6))
        self.label(box, title, 8, MUTED, True).pack(anchor="w")
        label = self.label(box, value, 15, TEXT, True)
        label.pack(anchor="w", pady=(4, 0))
        return label

    def refresh_printers(self):
        try:
            printers = list_printers()
            self.printer_combo["values"] = printers
            current = self.printer_var.get()
            if current not in printers:
                preferred = default_printer()
                self.printer_var.set(preferred if preferred in printers else (printers[0] if printers else ""))
            self.set_log(f"{len(printers)} impressora(s) encontrada(s).", MUTED)
        except Exception as exc:
            self.set_log(f"Falha ao consultar impressoras: {exc}", RED)

    def save_printer(self):
        printer = self.printer_var.get().strip()
        if not printer:
            messagebox.showwarning(APP_NAME, "Selecione uma impressora.")
            return
        self.config_data["printer_name"] = printer
        self.config_data["paper_width"] = self.paper_var.get()
        self.config_data["cut_paper"] = self.cut_var.get()
        save_config(self.config_data)
        try:
            set_startup(True)
        except Exception:
            pass
        self.set_log("Impressora salva. A impressao automatica esta pronta.", GREEN)

    def test_print(self):
        printer = self.printer_var.get().strip()
        if not printer:
            messagebox.showwarning(APP_NAME, "Selecione uma impressora.")
            return
        payload = {
            "restaurant": {"name": self.config_data.get("restaurant_name") or "EG Delivery"},
            "order": {
                "order_number": "TESTE",
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "type": "pickup",
                "customer": {"name": "Teste de impressao", "phone": ""},
                "items": [{"quantity": 1, "product_name": "Conexao funcionando", "total_price": 0}],
                "subtotal": 0,
                "total": 0,
                "payment_method": "Teste",
            },
        }
        try:
            width = 32 if self.paper_var.get() == "58mm" else 48
            data = build_receipt(payload, width, self.cut_var.get())
            print_raw(printer, data, "EG Delivery - Teste")
            self.set_log("Teste enviado para a impressora.", GREEN)
        except Exception as exc:
            self.set_log(f"Falha no teste: {exc}", RED)
            messagebox.showerror(APP_NAME, str(exc))

    def start_worker(self):
        if self.worker and self.worker.is_alive():
            return
        self.stop_event.clear()
        self.worker = threading.Thread(target=self.worker_loop, daemon=True)
        self.worker.start()

    def worker_loop(self):
        client = ApiClient(self.config_data["api_base"], VERSION)
        last_heartbeat = 0
        while not self.stop_event.is_set() and self.access_token:
            try:
                if time.time() - last_heartbeat > 30:
                    client.heartbeat(self.access_token, self.config_data.get("printer_name", ""))
                    last_heartbeat = time.time()
                self.events.put(("online", None))
                response = client.claim(self.access_token)
                job = response.get("job")
                if not job:
                    self.stop_event.wait(2)
                    continue
                self.process_job(client, job)
            except ApiError as exc:
                if exc.status == 401:
                    self.events.put(("session_invalid", str(exc)))
                    return
                self.events.put(("offline", str(exc)))
                self.stop_event.wait(5)
            except Exception as exc:
                self.events.put(("offline", str(exc)))
                self.stop_event.wait(5)

    def process_job(self, client, job):
        job_id = job["id"]
        printed = self.config_data.get("printed_job_ids", [])
        if job_id in printed:
            client.complete(self.access_token, job_id)
            return
        printer = self.config_data.get("printer_name", "")
        if not printer:
            client.fail(self.access_token, job_id, "Nenhuma impressora selecionada no aplicativo")
            self.events.put(("print_error", "Selecione e salve a impressora."))
            return
        try:
            width = 32 if self.config_data.get("paper_width") == "58mm" else 48
            data = build_receipt(job["payload"], width, self.config_data.get("cut_paper", True))
            order_number = job.get("order_number", "-")
            print_raw(printer, data, f"EG Delivery - Pedido {order_number}")
            printed.append(job_id)
            self.config_data["printed_job_ids"] = printed[-500:]
            save_config(self.config_data)
            client.complete(self.access_token, job_id)
            self.events.put(("printed", order_number))
        except Exception as exc:
            try:
                client.fail(self.access_token, job_id, str(exc))
            except Exception:
                pass
            self.events.put(("print_error", str(exc)))

    def process_events(self):
        try:
            while True:
                event, data = self.events.get_nowait()
                if event == "paired":
                    self.access_token = data["access_token"]
                    set_access_token(self.config_data, self.access_token)
                    self.config_data["agent_id"] = data["agent_id"]
                    self.config_data["restaurant_name"] = data["restaurant"]["name"]
                    save_config(self.config_data)
                    try:
                        set_startup(True)
                    except Exception:
                        pass
                    self.show_dashboard()
                    self.start_worker()
                elif event == "pair_error":
                    self.login_button.config(state="normal", text="Entrar e vincular")
                    self.login_error.config(text=data)
                elif event == "online":
                    self.connected = True
                    self.status_dot.config(fg=GREEN)
                    self.status_title.config(text="Conectado e aguardando pedidos")
                    self.status_detail.config(text=self.config_data.get("restaurant_name", ""))
                elif event == "offline":
                    self.connected = False
                    self.status_dot.config(fg=YELLOW)
                    self.status_title.config(text="Reconectando automaticamente")
                    self.set_log(data, YELLOW)
                elif event == "printed":
                    self.printed_count += 1
                    self.last_order = f"#{data}"
                    self.last_order_label.config(text=self.last_order)
                    self.printed_label.config(text=str(self.printed_count))
                    self.set_log(f"Pedido #{data} enviado para a impressora.", GREEN)
                elif event == "print_error":
                    self.status_dot.config(fg=RED)
                    self.status_title.config(text="Atencao na impressora")
                    self.set_log(data, RED)
                elif event == "session_invalid":
                    messagebox.showerror(APP_NAME, f"{data}\nVincule o computador novamente.")
                    self.disconnect(confirm=False)
        except queue.Empty:
            pass
        self.after(150, self.process_events)

    def set_log(self, text, color=MUTED):
        if hasattr(self, "log_label") and self.log_label.winfo_exists():
            self.log_label.config(text=text, fg=color)

    def disconnect(self, confirm=True):
        if confirm and not messagebox.askyesno(APP_NAME, "Desvincular este computador da loja?"):
            return
        self.stop_event.set()
        self.access_token = ""
        self.config_data.pop("access_token_protected", None)
        self.config_data["agent_id"] = ""
        self.config_data["restaurant_name"] = ""
        save_config(self.config_data)
        show = getattr(self, "show_login", None)
        if show:
            show()

    def on_close(self):
        if self.access_token:
            self.iconify()
            return
        self.stop_event.set()
        self.destroy()


if __name__ == "__main__":
    app = PrintAgentApp()
    app.mainloop()

