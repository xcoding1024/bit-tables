const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { tableWindowURL } = require("./table-windows.cjs");

test("配表窗口地址限定本站、绝对目录与合法表路径", () => {
  const target = { rootPath: path.resolve("带 空格/tables"), tableId: "combat/skill" };
  const url = new URL(tableWindowURL("http://127.0.0.1:5173/", target));
  assert.equal(url.origin, "http://127.0.0.1:5173");
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("table"), "combat/skill");
  assert.equal(url.searchParams.get("rootPath"), target.rootPath);
  for (const bad of [
    null, { ...target, rootPath: "relative" },
    { ...target, tableId: "../secret" }, { ...target, tableId: "https://example.com" },
  ]) assert.throws(() => tableWindowURL(url.origin, bad));
});

function desktopHarness() {
  const handlers = new Map();
  const listeners = new Map();
  const all = [];
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = {};
      this.webContents.send = (channel, value) => { this.messages.push({ channel, value }); };
      this.webContents.isLoading = () => false;
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.reload = () => { this.reloaded = true; };
      this.webContents.toggleDevTools = () => {};
      this.messages = [];
      all.push(this);
    }
    static fromWebContents(contents) { return all.find((item) => item.webContents === contents); }
    loadURL(url) { this.url = url; }
    isDestroyed() { return Boolean(this.closed); }
    isMaximized() { return Boolean(this.maximized); }
    isMinimized() { return Boolean(this.minimized); }
    isFullScreen() { return Boolean(this.fullscreen); }
    setFullScreen(value) { this.fullscreen = value; }
    maximize() { this.maximized = true; }
    unmaximize() { this.maximized = false; }
    minimize() { this.minimized = true; }
    restore() { this.minimized = false; }
    setAlwaysOnTop() {}
    show() {}
    focus() { this.focused = true; }
    close() {
      let prevented = false;
      this.emit("close", { preventDefault() { prevented = true; } });
      if (prevented) return;
      if (this.cancelClose) { this.emit("close-cancelled"); return; }
      this.closed = true;
      this.emit("closed");
    }
  }
  const app = new EventEmitter();
  Object.assign(app, {
    commandLine: { appendSwitch() {} }, isPackaged: false, getPath: () => path.resolve("var"), setPath() {}, getVersion: () => "0.3.0",
    requestSingleInstanceLock: () => true, setAsDefaultProtocolClient() {},
    whenReady: () => ({ then() {} }), quit: () => { app.quitted = true; },
  });
  const electron = {
    app, BrowserWindow: Window, Menu: { setApplicationMenu() {} }, clipboard: {},
    dialog: { showOpenDialog: async (owner) => { electron.dialog.owner = owner; return { canceled: true }; } },
    ipcMain: {
      handle: (key, fn) => handlers.set(key, fn),
      removeHandler: (key) => handlers.delete(key),
      on: (key, fn) => listeners.set(key, fn),
    },
  };
  const context = vm.createContext({
    require: (name) => name === "electron" ? electron : require(name),
    __dirname, console, URL, setTimeout, clearTimeout, setInterval,
    process: { platform: "linux", argv: [], env: { DEV_SERVER_URL: "http://127.0.0.1:5173" } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8"), context);
  vm.runInContext("createWindow();", context);
  const event = (owner) => ({ sender: owner.webContents, senderFrame: owner.webContents.mainFrame });
  return { app, all, handlers, listeners, event, electron };
}

test("窗口控制和目录选择按发送者执行", async () => {
  const h = desktopHarness();
  const main = h.all[0];
  const target = { rootPath: path.resolve("var/tables"), tableId: "sheet_demo" };
  h.handlers.get("tables:openWindow")(h.event(main), target);
  const child = h.all[1];
  h.listeners.get("window:maximize")(h.event(child));
  h.listeners.get("window:fullscreen")(h.event(child));
  assert.equal(child.maximized, true);
  assert.equal(child.fullscreen, true);
  assert.equal(main.maximized, undefined);
  await h.handlers.get("dialog:openDirectory")(h.event(child));
  assert.equal(h.electron.dialog.owner, child);
  assert.throws(() => h.handlers.get("tables:openWindow")({ sender: child.webContents, senderFrame: {} }, target));
  assert.equal(h.handlers.get("root:remember")(h.event(child), target.rootPath), target.rootPath);
  h.listeners.get("window:close")(h.event(child));
  assert.equal(main.closed, undefined);
});

test("关闭主窗口联动关闭子窗口，取消未保存提示则保留主窗口", async () => {
  const h = desktopHarness();
  const main = h.all[0];
  h.handlers.get("tables:openWindow")(h.event(main), { rootPath: path.resolve("tables"), tableId: "item" });
  const child = h.all[1];
  h.handlers.get("tables:openWindow")(h.event(child), { rootPath: path.resolve("tables"), tableId: "item" });
  const secondChild = h.all[2];
  child.cancelClose = true;
  main.close();
  await new Promise(setImmediate);
  assert.equal(main.closed, undefined);
  assert.equal(child.closed, undefined);
  assert.equal(secondChild.closed, undefined);
  child.cancelClose = false;
  main.close();
  await new Promise(setImmediate);
  assert.equal(child.closed, true);
  assert.equal(secondChild.closed, true);
  assert.equal(main.closed, true);
});

test("退出应用先处理子窗口草稿，取消后仍可继续使用", async () => {
  const h = desktopHarness();
  const main = h.all[0];
  h.handlers.get("tables:openWindow")(h.event(main), { rootPath: path.resolve("tables"), tableId: "item" });
  const child = h.all[1];
  child.cancelClose = true;
  let prevented = false;
  h.app.emit("before-quit", { preventDefault() { prevented = true; } });
  await new Promise(setImmediate);
  assert.equal(prevented, true);
  assert.equal(main.closed, undefined);
  assert.equal(child.closed, undefined);
  h.handlers.get("tables:openWindow")(h.event(main), { rootPath: path.resolve("tables"), tableId: "item" });
  assert.equal(h.all.length, 3);
});

test("全屏快捷键和刷新只作用于当前窗口", () => {
  const h = desktopHarness();
  const main = h.all[0];
  h.handlers.get("tables:openWindow")(h.event(main), { rootPath: path.resolve("tables"), tableId: "item" });
  const child = h.all[1];
  const key = (key) => child.webContents.emit("before-input-event", { preventDefault() {} }, { type: "keyDown", key });
  key("F11");
  assert.equal(child.fullscreen, true);
  key("Escape");
  assert.equal(child.fullscreen, false);
  key("F5");
  assert.equal(child.reloaded, true);
  assert.equal(main.reloaded, undefined);
});
