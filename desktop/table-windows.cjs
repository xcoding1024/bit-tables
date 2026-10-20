const path = require("path");

function tableWindowURL(baseURL, target) {
  if (!target || typeof target.rootPath !== "string" || !path.isAbsolute(target.rootPath) || /[\0\r\n]/.test(target.rootPath)) {
    throw new Error("配表目录无效");
  }
  if (typeof target.tableId !== "string" || !target.tableId.split("/").every((part) => /^[a-z][a-z0-9_]{0,31}$/.test(part))) {
    throw new Error("配置表无效");
  }
  const url = new URL("/", baseURL);
  url.search = new URLSearchParams({ tableWindow: "1", rootPath: target.rootPath, table: target.tableId }).toString();
  return url.toString();
}

function senderWindow(BrowserWindow, managed, event) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner.isDestroyed() || !managed.has(owner) || event.senderFrame !== owner.webContents.mainFrame) {
    throw new Error("窗口操作来源无效");
  }
  return owner;
}

module.exports = { tableWindowURL, senderWindow };
