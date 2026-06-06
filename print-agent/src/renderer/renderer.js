const els = {
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
  button.style.opacity = busy ? "0.68" : "1";
}

function renderState(state = {}) {
  const hasError = Boolean(state.lastError);
  const connected = Boolean(state.connected) && !hasError;
  currentPrinter = state.printerName === "Impressora padrao do Windows" ? "" : state.printerName || "";

  els.statusDot.className = `status-dot ${connected ? "ok" : hasError ? "error" : ""}`;
  els.statusLabel.textContent = state.status || "Iniciando";
  els.statusHint.textContent = connected
    ? "Conectado ao EG Delivery e aguardando pedidos aceitos."
    : hasError
      ? "Confira impressora, internet ou vínculo da loja."
      : "Aguardando conexão com a loja.";
  els.lastOrder.textContent = state.lastOrder ? `#${state.lastOrder}` : "-";
  els.printedCount.textContent = String(state.printedCount || 0);

  els.errorBox.classList.toggle("hidden", !hasError);
  els.errorText.textContent = state.lastError || "";

  if ([...els.printerSelect.options].some((option) => option.value === currentPrinter)) {
    els.printerSelect.value = currentPrinter;
  }
}

async function loadPrinters() {
  const selected = currentPrinter || els.printerSelect.value;
  const printers = await window.egPrint.listPrinters();
  els.printerSelect.innerHTML = '<option value="">Impressora padrão do Windows</option>';
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

els.refreshPrinters.addEventListener("click", async () => {
  setBusy(els.refreshPrinters, true);
  try {
    await loadPrinters();
  } finally {
    setBusy(els.refreshPrinters, false);
  }
});

els.printerSelect.addEventListener("change", async () => {
  await window.egPrint.setPrinter(els.printerSelect.value);
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
