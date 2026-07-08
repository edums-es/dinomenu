const els = {
  apiInput: document.getElementById("apiInput"),
  emailInput: document.getElementById("emailInput"),
  passwordInput: document.getElementById("passwordInput"),
  tokenInput: document.getElementById("tokenInput"),
  linkStore: document.getElementById("linkStore"),
  linkFeedback: document.getElementById("linkFeedback"),
  connectionPill: document.getElementById("connectionPill"),
  versionBadge: document.getElementById("versionBadge"),
  statusDot: document.getElementById("statusDot"),
  statusLabel: document.getElementById("statusLabel"),
  statusHint: document.getElementById("statusHint"),
  lastOrder: document.getElementById("lastOrder"),
  printedCount: document.getElementById("printedCount"),
  printerSelect: document.getElementById("printerSelect"),
  refreshPrinters: document.getElementById("refreshPrinters"),
  testPrint: document.getElementById("testPrint"),
  restart: document.getElementById("restart"),
  errorBox: document.getElementById("errorBox"),
  errorText: document.getElementById("errorText"),
  openLogs: document.getElementById("openLogs"),
  hideWindow: document.getElementById("hideWindow"),
};

let currentPrinter = "";

function setBusy(button, busy) {
  button.disabled = busy;
  button.style.opacity = busy ? "0.64" : "1";
}

function setConnectionPill(state, connected, hasError) {
  els.connectionPill.className = "pill";
  if (connected) {
    els.connectionPill.textContent = "Conectado";
    return;
  }
  if (hasError) {
    els.connectionPill.textContent = "Erro";
    els.connectionPill.classList.add("error");
    return;
  }
  els.connectionPill.textContent = state.token ? "Aguardando" : "Precisa vincular";
  els.connectionPill.classList.add("offline");
}

function renderState(state = {}) {
  const hasError = Boolean(state.lastError);
  const connected = Boolean(state.connected) && !hasError;

  currentPrinter = state.printerName === "Impressora padrao do Windows" ? "" : state.printerName || "";
  els.versionBadge.textContent = state.appVersion ? `v${state.appVersion}` : "v2";
  setConnectionPill(state, connected, hasError);

  els.statusDot.className = `dot ${connected ? "ok" : hasError ? "error" : ""}`;
  els.statusLabel.textContent = state.status || "Aguardando";
  els.statusHint.textContent = connected
    ? `Sincronizado${state.restaurantName ? ` com ${state.restaurantName}` : ""}.`
    : state.token
      ? "Token salvo. Conferindo conexao e fila de pedidos."
      : "Informe e-mail, senha e token para ativar este computador.";

  els.lastOrder.textContent = state.lastOrder ? `#${state.lastOrder}` : "-";
  els.printedCount.textContent = String(state.printedCount || 0);

  if (!els.apiInput.value) els.apiInput.value = state.api || "https://api.easygrowth.com.br/api";
  if (!els.emailInput.value && state.email) els.emailInput.value = state.email;
  if (!els.tokenInput.value && state.token) els.tokenInput.value = state.token;

  els.errorBox.classList.toggle("hidden", !hasError);
  els.errorText.textContent = state.lastError || "";

  if ([...els.printerSelect.options].some((option) => option.value === currentPrinter)) {
    els.printerSelect.value = currentPrinter;
  }
}

async function loadPrinters() {
  const selected = currentPrinter || els.printerSelect.value;
  const printers = await window.egPrint.listPrinters();
  els.printerSelect.innerHTML = '<option value="">Padrao do Windows</option>';
  printers.forEach((printer) => {
    const option = document.createElement("option");
    option.value = printer;
    option.textContent = printer;
    els.printerSelect.appendChild(option);
  });
  if ([...els.printerSelect.options].some((option) => option.value === selected)) {
    els.printerSelect.value = selected;
  }
}

els.linkStore.addEventListener("click", async () => {
  setBusy(els.linkStore, true);
  els.linkFeedback.textContent = "Validando conta e token...";
  try {
    const state = await window.egPrint.linkStore({
      api: els.apiInput.value,
      email: els.emailInput.value,
      password: els.passwordInput.value,
      token: els.tokenInput.value,
    });
    els.passwordInput.value = "";
    renderState(state);
    els.linkFeedback.textContent = "Loja conectada. A impressao automatica ja pode buscar pedidos.";
  } catch (error) {
    els.linkFeedback.textContent = error?.message || "Nao foi possivel conectar.";
  } finally {
    setBusy(els.linkStore, false);
  }
});

els.refreshPrinters.addEventListener("click", async () => {
  setBusy(els.refreshPrinters, true);
  try {
    await loadPrinters();
  } finally {
    setBusy(els.refreshPrinters, false);
  }
});

els.printerSelect.addEventListener("change", async () => {
  renderState(await window.egPrint.setPrinter(els.printerSelect.value));
});

els.testPrint.addEventListener("click", async () => {
  setBusy(els.testPrint, true);
  try {
    renderState(await window.egPrint.testPrint());
  } finally {
    setBusy(els.testPrint, false);
  }
});

els.restart.addEventListener("click", async () => {
  setBusy(els.restart, true);
  try {
    renderState(await window.egPrint.restart());
  } finally {
    setBusy(els.restart, false);
  }
});

els.openLogs.addEventListener("click", () => window.egPrint.openLogs());
els.hideWindow.addEventListener("click", () => window.egPrint.hideWindow());

window.egPrint.onState(renderState);

Promise.all([
  window.egPrint.getState().then(renderState),
  loadPrinters().catch(() => null),
]);
