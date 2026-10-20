const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bitTablesShell", {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:maximize"),
    toggleFullscreen: () => ipcRenderer.send("window:fullscreen"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  },
  openTableWindow: (target) => ipcRenderer.invoke("tables:openWindow", target),
  pickDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  rememberRoot: (dir) => ipcRenderer.invoke("root:remember", dir),
  listRecentRoots: () => ipcRenderer.invoke("root:listRecent"),
});
