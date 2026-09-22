const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ADDR = process.env.BIT_TABLES_ADDR || "127.0.0.1:18780";
const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "";
const IS_DEV = Boolean(process.env.BIT_TABLES_DEV || DEV_SERVER_URL);
/** dev.js 已拉起 API 时置 1，窗口进程不再重复 go run，避免启动空窗期代理报错 */
const EXTERNAL_API = process.env.BIT_TABLES_EXTERNAL_API === "1";
const REPO_ROOT = path.join(__dirname, "..");

// 开发窗口在本机 9223 提供调试端口，验收脚本用来截图。
if (IS_DEV) {
  app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
  app.commandLine.appendSwitch("remote-debugging-port", "9223");
}

/** @type {import('child_process').ChildProcess | null} */
let goProc = null;
let shuttingDown = false;
/** @type {import('electron').BrowserWindow | null} */
let win = null;

function binName() {
  return process.platform === "win32" ? "bit-tables.exe" : "bit-tables";
}

function packagedBin() {
  return path.join(process.resourcesPath, binName());
}

function spaDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "renderer");
  }
  const built = path.join(REPO_ROOT, "frontend", "dist");
  if (fs.existsSync(path.join(built, "index.html"))) {
    return built;
  }
  return path.join(REPO_ROOT, "web", "dist");
}

const RECENT_LIMIT = 10;

function lastRootFile() {
  return path.join(app.getPath("userData"), "last-root.json");
}

function existingDir(dir) {
  try {
    return Boolean(dir && typeof dir === "string" && fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  } catch {
    return false;
  }
}

/** @returns {{ path: string, recent: string[] }} */
function readRootState() {
  try {
    const raw = JSON.parse(fs.readFileSync(lastRootFile(), "utf8"));
    const recent = [];
    const seen = new Set();
    const push = (p) => {
      if (!existingDir(p)) return;
      const abs = path.resolve(p);
      if (seen.has(abs)) return;
      seen.add(abs);
      recent.push(abs);
    };
    if (typeof raw?.path === "string") push(raw.path);
    if (Array.isArray(raw?.recent)) {
      for (const item of raw.recent) push(item);
    }
    return { path: recent[0] || "", recent: recent.slice(0, RECENT_LIMIT) };
  } catch {
    return { path: "", recent: [] };
  }
}

function readLastRoot() {
  return readRootState().path;
}

function readRecentRoots() {
  return readRootState().recent;
}

function writeLastRoot(dir) {
  if (!existingDir(dir)) return;
  const abs = path.resolve(dir);
  if (abs === path.resolve(emptyRoot())) return;
  const prev = readRootState().recent.filter((item) => path.resolve(item) !== abs);
  const recent = [abs, ...prev].slice(0, RECENT_LIMIT);
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(lastRootFile(), JSON.stringify({ path: abs, recent }));
}

function emptyRoot() {
  const dir = path.join(app.getPath("userData"), "empty-root");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function defaultRoot() {
  const last = readLastRoot();
  if (last) return last;
  if (IS_DEV) {
    return process.env.BIT_TABLES_ROOT || path.join(REPO_ROOT, "demo", "tables");
  }
  return "";
}

function waitHealth(tries = 80) {
  const url = `http://${ADDR}/api/root`;
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
          return;
        }
        if (n <= 0) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(() => tick(n - 1), 150);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (n <= 0) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(() => tick(n - 1), 150);
      });
    };
    tick(tries);
  });
}

function stopGo() {
  return new Promise((resolve) => {
    if (!goProc || goProc.killed) {
      goProc = null;
      resolve();
      return;
    }
    const child = goProc;
    const pid = child.pid;
    goProc = null;
    child.once("exit", () => resolve());
    if (process.platform === "win32" && pid) {
      spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill();
    }
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 1500);
  });
}

/**
 * @param {string} root
 * @param {{ sample?: boolean, guide?: boolean }} [opts]
 */
function startGo(root, opts = {}) {
  const args = [];
  let cmd;
  let cwd = REPO_ROOT;
  if (app.isPackaged) {
    cmd = packagedBin();
    cwd = app.getPath("userData");
    args.push("serve", root, "--addr", ADDR);
  } else {
    cmd = "go";
    args.push("run", "./cmd/bit-tables", "serve", root, "--addr", ADDR);
  }
  if (opts.sample) args.push("--sample");
  if (opts.guide) args.push("--guide");
  goProc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, BIT_TABLES_SPA: spaDir() },
    stdio: "pipe",
    windowsHide: true,
  });
  goProc.stdout.on("data", (d) => process.stdout.write(d));
  goProc.stderr.on("data", (d) => process.stderr.write(d));
  goProc.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      console.error("bit-tables exited", code);
    }
  });
}

async function serveRoot(root, opts = {}) {
  await stopGo();
  startGo(root, opts);
  await waitHealth();
}

function uiURL() {
  return DEV_SERVER_URL || `http://${ADDR}/`;
}

function createWindow() {
  const isMac = process.platform === "darwin";
  const iconWin = path.join(__dirname, "icon.ico");
  const iconPng = path.join(__dirname, "icon.png");
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    title: "bit-tables",
    icon: fs.existsSync(process.platform === "win32" ? iconWin : iconPng)
      ? process.platform === "win32"
        ? iconWin
        : iconPng
      : undefined,
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(uiURL());
}

async function switchApiRoot(dir) {
  const res = await fetch(`http://${ADDR}/api/root`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: dir }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`切换配表根失败: ${res.status} ${text}`);
  }
}

async function boot() {
  if (EXTERNAL_API) {
    await waitHealth();
    const last = readLastRoot();
    if (last) {
      try {
        await switchApiRoot(last);
      } catch (err) {
        console.error(err);
      }
    }
  } else {
    const root = defaultRoot();
    if (root) {
      await serveRoot(root);
    } else {
      await serveRoot(emptyRoot(), { guide: true });
    }
  }
  createWindow();
}

function rememberRoot(dir) {
  if (!dir || typeof dir !== "string") {
    throw new Error("路径无效");
  }
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error("不是目录");
  }
  writeLastRoot(dir);
  return dir;
}

ipcMain.handle("window:isMaximized", () => Boolean(win && win.isMaximized()));

ipcMain.handle("dialog:openDirectory", async () => {
  if (!win) return "";
  const res = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (res.canceled || !res.filePaths[0]) return "";
  return res.filePaths[0];
});

ipcMain.handle("root:remember", async (_ev, dir) => rememberRoot(dir));

ipcMain.handle("root:listRecent", async () => readRecentRoots());

ipcMain.on("window:minimize", () => {
  win?.minimize();
});

ipcMain.on("window:maximize", () => {
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
    return;
  }
  win.maximize();
});

ipcMain.on("window:close", () => {
  win?.close();
});

app.whenReady().then(() => {
  boot().catch((err) => {
    console.error(err);
    dialog.showErrorBox("bit-tables", err.message || String(err));
    app.quit();
  });
});

app.on("before-quit", () => {
  shuttingDown = true;
  if (goProc) {
    goProc.kill();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
