const path = require("node:path");
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, Notification } = require("electron");
const { PrintService } = require("./printService");

let tray = null;
let mainWindow = null;
let service = null;
let quitting = false;

function trayIcon(color = "#19d98b") {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#050807"/>
      <path d="M14 35V18h29v8H23v5h18v8H23v6h22v8H14z" fill="#fff"/>
      <path d="M36 32c0-10 7-18 18-18v9c-6 0-9 4-9 9s3 9 9 9v9c-11 0-18-8-18-18z" fill="${color}"/>
    </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 460,
    height: 610,
    minWidth: 420,
    minHeight: 560,
    show: false,
    title: "EG Delivery Impressora",
    backgroundColor: "#050807",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  return mainWindow;
}

function sendState() {
  if (mainWindow && service) {
    mainWindow.webContents.send("print-state", service.snapshot());
  }
}

function updateTray() {
  if (!tray || !service) return;
  const state = service.snapshot();
  const connected = state.connected && !state.lastError;
  tray.setToolTip(`EG Delivery Impressora\n${state.status}`);
  tray.setImage(trayIcon(connected ? "#19d98b" : "#f5c542"));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Abrir status", click: () => createWindow() },
    { label: state.status, enabled: false },
    { type: "separator" },
    { label: "Testar impressao", click: () => service.testPrint().catch((error) => service.handleError(error)) },
    { label: "Reiniciar conexao", click: () => service.restart().catch((error) => service.handleError(error)) },
    { type: "separator" },
    { label: "Logs e suporte", click: () => shell.openPath(app.getPath("userData")) },
    {
      label: "Sair",
      click: () => {
        quitting = true;
        service.stop();
        app.quit();
      },
    },
  ]));
}

function notify(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId("br.com.easygrowth.egdelivery.print");
  app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });

  service = new PrintService({ userDataDir: app.getPath("userData") });
  tray = new Tray(trayIcon());
  tray.on("click", () => createWindow());

  service.on("state", () => {
    sendState();
    updateTray();
  });
  service.on("printed", (job) => {
    notify("Pedido impresso", `Pedido #${job.order_number || job.id} enviado para a impressora.`);
  });
  service.on("error-log", (message) => {
    notify("EG Delivery Impressora", message);
  });

  updateTray();
  await service.start();
  if (!app.getLoginItemSettings().wasOpenedAtLogin) {
    createWindow();
  }
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
});

app.on("before-quit", () => {
  quitting = true;
});

ipcMain.handle("get-state", () => service?.snapshot());
ipcMain.handle("test-print", async () => {
  await service.testPrint();
  return service.snapshot();
});
ipcMain.handle("restart-service", async () => {
  await service.restart();
  return service.snapshot();
});
ipcMain.handle("list-printers", () => service.getPrinters());
ipcMain.handle("set-printer", async (_event, printerName) => {
  await service.saveConfig({ printer_name: printerName || "" });
  await service.restart();
  return service.snapshot();
});
ipcMain.handle("open-logs", () => shell.openPath(app.getPath("userData")));
ipcMain.handle("hide-window", () => mainWindow?.hide());
