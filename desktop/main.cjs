const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ADDR = process.env.BIT_TABLES_ADDR || "127.0.0.1:18780";
const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "";
const IS_DEV = Boolean(process.env.BIT_TABLES_DEV || DEV_SERVER_URL);
const REPO_ROOT = path.join(__dirname, "..");

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

function lastRootFile() {
  return path.join(app.getPath("userData"), "last-root.json");
}

function readLastRoot() {
  try {
    const raw = JSON.parse(fs.readFileSync(lastRootFile(), "utf8"));
    if (raw && typeof raw.path === "string" && fs.existsSync(raw.path)) {
      return raw.path;
    }
  } catch {
    /* ignore */
  }
  return "";
}

function writeLastRoot(dir) {
  if (IS_DEV) return;
  fs.mkdirSync(app.getPath("userData"), { recursive: true });
  fs.writeFileSync(lastRootFile(), JSON.stringify({ path: dir }));
}

function emptyRoot() {
  const dir = path.join(app.getPath("userData"), "empty-root");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function defaultRoot() {
  if (IS_DEV) {
    return process.env.BIT_TABLES_ROOT || path.join(REPO_ROOT, "demo", "tables");
  }
  return readLastRoot();
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

async function boot() {
  const root = defaultRoot();
  if (root) {
    await serveRoot(root);
  } else {
    await serveRoot(emptyRoot(), { guide: true });
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

ipcMain.handle("root:createSample", async (_ev, parent, name) => {
  if (!parent || !name || typeof parent !== "string" || typeof name !== "string") {
    throw new Error("路径无效");
  }
  if (/[\\/]/.test(name) || name === "." || name === "..") {
    throw new Error("项目名无效");
  }
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) {
    throw new Error("父目录不存在");
  }
  const dest = path.join(parent, name);
  if (fs.existsSync(dest)) {
    throw new Error("目录已存在");
  }
  fs.mkdirSync(dest, { recursive: true });
  return rememberRoot(dest);
});

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
