const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("egPrint", {
  getState: () => ipcRenderer.invoke("get-state"),
  testPrint: () => ipcRenderer.invoke("test-print"),
  restart: () => ipcRenderer.invoke("restart-service"),
  listPrinters: () => ipcRenderer.invoke("list-printers"),
  setPrinter: (printerName) => ipcRenderer.invoke("set-printer", printerName),
  openLogs: () => ipcRenderer.invoke("open-logs"),
  hideWindow: () => ipcRenderer.invoke("hide-window"),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("print-state", listener);
    return () => ipcRenderer.removeListener("print-state", listener);
  },
});
