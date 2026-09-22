#!/usr/bin/env node
/**
 * 关掉本仓库已有的开发进程和窗口，再 npm run dev，等窗口页面出来后截图。
 * 截图写到 scripts/.record-tools/accept.png。窗口保持打开。
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, "scripts", ".record-tools");
const OUT = path.join(TOOLS, "accept.png");
const DEV_LOG = path.join(TOOLS, "dev.log");
const DEBUG = "http://127.0.0.1:9223";

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

function pidsByCommand(pattern) {
  if (process.platform === "win32") {
    const script = [
      "$p = '" + pattern.replace(/'/g, "''") + "'",
      "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match $p) } | ForEach-Object { $_.ProcessId }",
    ].join("; ");
    const out = spawnSync("powershell", ["-NoProfile", "-Command", script], { encoding: "utf8" });
    return String(out.stdout || "")
      .split(/\s+/)
      .map(Number)
      .filter((pid) => pid > 0 && pid !== process.pid);
  }
  const out = spawnSync("pgrep", ["-f", pattern], { encoding: "utf8" });
  return String(out.stdout || "")
    .split(/\s+/)
    .map(Number)
    .filter((pid) => pid > 0 && pid !== process.pid);
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

function waitHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, { timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        if (Date.now() >= deadline) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(tick, 300);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (Date.now() >= deadline) {
          reject(new Error(url + " not ready"));
          return;
        }
        setTimeout(tick, 300);
      });
    };
    tick();
  });
}

function stopPrevious() {
  const groups = [
    pidsByCommand("scripts[\\\\/]dev\\.js"),
    pidsByCommand("bit-tables[\\\\/]node_modules[\\\\/]electron"),
  ];
  const pids = [...new Set(groups.flat())];
  if (pids.length) {
    console.log("==> kill dev  " + pids.join(", "));
    killPids(pids);
  }
}

function startDev() {
  fs.mkdirSync(TOOLS, { recursive: true });
  const log = fs.openSync(DEV_LOG, "w");
  const child = spawn("npm run dev", {
    cwd: ROOT,
    shell: true,
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  child.unref();
}

async function shot() {
  const pw = path.join(TOOLS, "node_modules", "playwright", "index.mjs");
  if (!fs.existsSync(pw)) {
    throw new Error("缺少截图用的 playwright，先跑一次 node scripts/record-readme-gif.mjs 装好工具");
  }
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(TOOLS, "browsers");
  const { chromium } = await import(pathToFileURL(pw).href);
  const browser = await chromium.connectOverCDP(DEBUG);
  const deadline = Date.now() + 20000;
  let page = null;
  while (Date.now() < deadline) {
    const pages = browser.contexts().flatMap((context) => context.pages());
    page = pages.find((item) => item.url().includes("127.0.0.1:5173")) || pages[0] || null;
    if (page && page.url().includes("127.0.0.1:5173")) break;
    await sleep(200);
  }
  if (!page) throw new Error("窗口里没有页面");
  await page
    .locator('[data-testid="titlebar-root-path"], [data-testid="tables-guide"]')
    .first()
    .waitFor({ timeout: 20000 });
  const frame = page.frames().find((item) => item.url().includes("/editor"));
  if (frame) {
    await frame.locator("td, [data-testid]").first().waitFor({ timeout: 8000 }).catch(() => undefined);
  }
  await page.screenshot({ path: OUT, type: "png" });
  console.log(JSON.stringify({ ok: true, file: OUT, url: page.url() }));
  // 调试连接会占着事件循环。窗口是单独拉起的，这里直接结束验收进程。
  process.exit(0);
}

async function main() {
  console.log("==> stop previous");
  stopPrevious();
  await sleep(400);
  await freePorts([5173, 18780, 9223]);
  console.log("==> npm run dev");
  startDev();
  await waitHttp("http://127.0.0.1:5173/", 90000);
  await waitHttp(DEBUG + "/json/version", 90000);
  await shot();
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
