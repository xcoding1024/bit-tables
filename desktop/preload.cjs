const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bitTablesShell", {
  platform: process.platform,
  window: {
    minimize: () => ipcRenderer.send("window:minimize"),
    toggleMaximize: () => ipcRenderer.send("window:maximize"),
    close: () => ipcRenderer.send("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  },
  pickDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),
  rememberRoot: (dir) => ipcRenderer.invoke("root:remember", dir),
  createSample: (parent, name) => ipcRenderer.invoke("root:createSample", parent, name),
});
