#!/usr/bin/env node
"use strict";

const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://127.0.0.1:5173";
const API_ADDR = process.env.BIT_TABLES_ADDR || "127.0.0.1:18780";
const TABLES_ROOT = process.env.BIT_TABLES_ROOT || path.join(ROOT, "demo", "tables");

/** @type {import('child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function portFromURL(url, fallback) {
  try {
    return Number(new URL(url).port) || fallback;
  } catch {
    return fallback;
  }
}

function portFromAddr(addr, fallback) {
  const m = String(addr || "").match(/:(\d+)\s*$/);
  return m ? Number(m[1]) : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pidsOnPort(port) {
  const pids = new Set();
  if (process.platform === "win32") {
    const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
    for (const line of String(out.stdout || "").split(/\r?\n/)) {
      if (!/\bLISTENING\b/i.test(line)) continue;
      const parts = line.trim().split(/\s+/);
      const local = parts[1] || "";
      if (!local.endsWith(":" + port)) continue;
      const pid = Number(parts[parts.length - 1]);
      if (pid > 0 && pid !== process.pid) pids.add(pid);
    }
    return [...pids];
  }
  const out = spawnSync("lsof", ["-ti", `TCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
  for (const part of String(out.stdout || "").split(/\s+/)) {
    const pid = Number(part);
    if (pid > 0 && pid !== process.pid) pids.add(pid);
  }
  return [...pids];
}

function killPids(pids) {
  for (const pid of pids) {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore", windowsHide: true });
    } else {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

async function freePorts(ports) {
  for (const port of ports) {
    for (let i = 0; i < 12; i++) {
      const pids = pidsOnPort(port);
      if (!pids.length) break;
      if (i === 0) console.log(`==> kill :${port}  ${pids.join(", ")}`);
      killPids(pids);
      await sleep(150);
    }
  }
}

function waitHttp(url, tries = 80) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        if (n <= 0) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(() => tick(n - 1), 200);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (n <= 0) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(() => tick(n - 1), 200);
      });
    };
    tick(tries);
  });
}

function spaDir() {
  const built = path.join(ROOT, "frontend", "dist");
  if (fs.existsSync(path.join(built, "index.html"))) return built;
  return path.join(ROOT, "web", "dist");
}

function viteEntry() {
  return path.join(ROOT, "frontend", "node_modules", "vite", "bin", "vite.js");
}

function electronBin() {
  return require(path.join(ROOT, "node_modules", "electron"));
}

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string>, name?: string }} [opts]
 */
function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...opts.env },
    stdio: "inherit",
    shell: false,
    windowsHide: false,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown && code && code !== 0) {
      console.error(`${opts.name || cmd} exited ${code}`);
    }
  });
  return child;
}

function stopAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.pid || child.killed) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
    } else {
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
  }
  freePorts([portFromURL(DEV_SERVER_URL, 5173), portFromAddr(API_ADDR, 18780)]).catch(() => undefined);
}

function npmInstallIfNeeded(dir) {
  if (!fs.existsSync(path.join(dir, "node_modules"))) {
    // Windows + Node 20+：直接 spawn npm.cmd 会 EINVAL，需走 shell
    const result = spawn("npm install", {
      cwd: dir,
      stdio: "inherit",
      shell: true,
      windowsHide: true,
    });
    return new Promise((resolve, reject) => {
      result.on("exit", (code) => {
        if (code) reject(new Error("npm install failed"));
        else resolve();
      });
    });
  }
  return Promise.resolve();
}

async function main() {
  process.chdir(ROOT);
  await freePorts([portFromURL(DEV_SERVER_URL, 5173), portFromAddr(API_ADDR, 18780)]);
  await npmInstallIfNeeded(ROOT);
  await npmInstallIfNeeded(path.join(ROOT, "frontend"));

  // API 先就绪，再开 Vite / Electron，避免代理 ECONNREFUSED 刷屏
  console.log("==> api");
  run("go", ["run", "./cmd/bit-tables", "serve", TABLES_ROOT, "--addr", API_ADDR], {
    env: { BIT_TABLES_SPA: spaDir() },
    name: "api",
  });
  await waitHttp(`http://${API_ADDR}/api/root`, 150);

  console.log("==> vite");
  run(process.execPath, [viteEntry()], {
    cwd: path.join(ROOT, "frontend"),
    name: "vite",
  });
  await waitHttp(DEV_SERVER_URL);

  console.log("==> desktop");
  const electron = run(electronBin(), [".", "--disable-crash-reporter"], {
    env: {
      DEV_SERVER_URL,
      BIT_TABLES_DEV: "1",
      BIT_TABLES_EXTERNAL_API: "1",
      BIT_TABLES_ROOT: TABLES_ROOT,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
    },
    name: "electron",
  });

  console.log("");
  console.log("dev:");
  console.log(`  desktop  ${DEV_SERVER_URL}`);
  console.log(`  api      http://${API_ADDR}`);
  console.log("  root     demo/tables/");
  console.log("");

  const shutdown = () => {
    stopAll();
    process.exit(0);
  };
  electron.on("exit", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err.message || err);
  stopAll();
  process.exit(1);
});
