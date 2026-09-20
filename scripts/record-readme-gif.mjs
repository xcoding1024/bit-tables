#!/usr/bin/env node
/**
 * 录制 README 工作台演示 GIF。
 * 复用已启动的 Vite(5173) + API(18780)；没有则自己拉起（不开 Electron）。
 *
 *   node scripts/record-readme-gif.mjs
 */
import { spawn, spawnSync } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, "scripts", ".record-tools");
const ASSETS = path.join(ROOT, "docs", "assets");
const TMP = path.join(ASSETS, ".record-tmp");
const GIF = path.join(ASSETS, "workbench.gif");
const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://127.0.0.1:5173";
const API_ADDR = process.env.BIT_TABLES_ADDR || "127.0.0.1:18780";
const TABLES_ROOT = process.env.BIT_TABLES_ROOT || path.join(ROOT, "demo", "tables");
const VIEW = { width: 1280, height: 720 };

const children = [];
let startedServers = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function httpReady(url) {
  return waitHttp(url, 1).then(
    () => true,
    () => false,
  );
}

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    cwd: opts.cwd || ROOT,
    env: { ...process.env, ...opts.env },
    stdio: opts.stdio || "inherit",
    shell: Boolean(opts.shell),
    windowsHide: false,
  });
  children.push(child);
  return child;
}

function stopStarted() {
  if (!startedServers) return;
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
}

function npmInstall(dir, pkgs) {
  const result = spawnSync("npm", ["install", "--no-fund", "--no-audit", ...pkgs], {
    cwd: dir,
    stdio: "inherit",
    shell: true,
    windowsHide: true,
  });
  if (result.status) throw new Error("npm install failed: " + pkgs.join(" "));
}

async function ensureTools() {
  fs.mkdirSync(TOOLS, { recursive: true });
  const pkg = path.join(TOOLS, "package.json");
  if (!fs.existsSync(pkg)) {
    fs.writeFileSync(pkg, JSON.stringify({ name: "bit-tables-record-tools", private: true, type: "module" }));
  }
  const need = [];
  if (!fs.existsSync(path.join(TOOLS, "node_modules", "playwright"))) need.push("playwright");
  if (!fs.existsSync(path.join(TOOLS, "node_modules", "ffmpeg-static"))) need.push("ffmpeg-static");
  if (need.length) {
    console.log("==> install", need.join(", "));
    npmInstall(TOOLS, need);
  }
  const browsers = path.join(TOOLS, "browsers");
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsers;
  const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsers };
  const marker = path.join(browsers, "chromium-1243");
  const alt = fs.existsSync(browsers)
    ? fs.readdirSync(browsers).some((name) => name.startsWith("chromium"))
    : false;
  if (!fs.existsSync(marker) && !alt) {
    const pwCli = path.join(TOOLS, "node_modules", "playwright", "cli.js");
    console.log("==> playwright install chromium");
    const installed = spawnSync(process.execPath, [pwCli, "install", "chromium"], {
      cwd: TOOLS,
      stdio: "inherit",
      env,
      windowsHide: true,
    });
    if (installed.status) throw new Error("playwright install chromium failed");
  }
  return { env, require: createRequire(path.join(TOOLS, "package.json")) };
}

function ffmpegBin(req) {
  const fromPath = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", windowsHide: true });
  if (fromPath.status === 0) return "ffmpeg";
  const staticPath = req("ffmpeg-static");
  if (!staticPath || !fs.existsSync(staticPath)) throw new Error("ffmpeg not found");
  return staticPath;
}

function viteEntry() {
  return path.join(ROOT, "frontend", "node_modules", "vite", "bin", "vite.js");
}

async function ensureServers() {
  const apiOk = await httpReady(`http://${API_ADDR}/api/root`);
  const viteOk = await httpReady(DEV_SERVER_URL);
  if (apiOk && viteOk) {
    console.log("==> reuse", DEV_SERVER_URL, "and", API_ADDR);
    return;
  }
  if (apiOk !== viteOk) {
    throw new Error("API / Vite 只起来了一半，请先停掉或两边都开好再录");
  }
  startedServers = true;
  if (!fs.existsSync(path.join(ROOT, "frontend", "node_modules"))) {
    npmInstall(path.join(ROOT, "frontend"), []);
  }
  console.log("==> api");
  run("go", ["run", "./cmd/bit-tables", "serve", TABLES_ROOT, "--addr", API_ADDR], { name: "api" });
  await waitHttp(`http://${API_ADDR}/api/root`, 150);
  console.log("==> vite");
  run(process.execPath, [viteEntry()], { cwd: path.join(ROOT, "frontend"), name: "vite" });
  await waitHttp(DEV_SERVER_URL, 80);
}

async function placeCursor(page, x, y) {
  await page.evaluate(
    ({ x, y }) => {
      let el = document.getElementById("readme-demo-cursor");
      if (!el) {
        el = document.createElement("div");
        el.id = "readme-demo-cursor";
        el.style.cssText =
          "position:fixed;z-index:2147483647;width:16px;height:16px;margin-left:-2px;margin-top:-2px;border:2px solid #fff;background:#3794ff;border-radius:50%;pointer-events:none;box-shadow:0 0 0 3px rgba(55,148,255,.35);transition:left .08s linear,top .08s linear";
        document.body.appendChild(el);
      }
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    },
    { x, y },
  );
}

async function clickAt(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  await sleep(200);
  const box = await locator.boundingBox();
  if (!box) throw new Error("locator has no box");
  const x = box.x + Math.min(box.width / 2, 40);
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 6 });
  await placeCursor(page, x, y);
  await sleep(80);
  await page.mouse.click(x, y);
}

async function dumpPage(page, label) {
  const shot = path.join(TMP, `${label}.png`);
  fs.mkdirSync(TMP, { recursive: true });
  await page.screenshot({ path: shot, fullPage: false });
  const frames = page.frames().map((frame) => frame.url());
  const tests = await page.evaluate(() => {
    const ids = ["titlebar-root-path", "tables-list", "tables-item-sheet_demo", "table-editor-frame", "tables-guide"];
    const found = {};
    for (const id of ids) found[id] = Boolean(document.querySelector(`[data-testid="${id}"]`));
    const iframe = document.querySelector('[data-testid="table-editor-frame"]');
    return {
      found,
      text: (document.body.innerText || "").slice(0, 400),
      iframeSrc: iframe?.getAttribute("src") || "",
      hasContentWindow: Boolean(iframe && iframe.contentWindow),
    };
  });
  const editor = page.frames().find((item) => /\/editor(\?|$)/.test(item.url()));
  let iframeState = null;
  if (editor) {
    iframeState = await editor
      .evaluate(() => ({
        hasEditor: typeof window.BitTableEditor,
        hasMount: Boolean(window.BitTableEditor && typeof window.BitTableEditor.mount === "function"),
        rootHTML: (document.getElementById("root")?.innerHTML || "").slice(0, 240),
        title: document.title,
      }))
      .catch((err) => ({ evalError: err.message }));
  }
  console.log("==> dump", label, JSON.stringify({ frames, ...tests, iframeState }, null, 2));
  console.log("==> shot", shot);
}

async function editorFrame(page, tableId) {
  const needle = `/tables/${tableId}/editor`;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const frame = page.frames().find((item) => item.url().includes(needle));
    if (frame) {
      try {
        const ok = await frame.evaluate(() => Boolean(document.body));
        if (ok) return frame;
      } catch {
        /* sandbox / not ready */
      }
    }
    await sleep(200);
  }
  throw new Error(`editor frame ${tableId} not ready: ` + page.frames().map((item) => item.url()).join(" | "));
}

async function ensureMounted(page, frame, tableId, rootTestId) {
  if (await frame.evaluate((id) => Boolean(document.querySelector(`[data-testid="${id}"]`)), rootTestId).catch(() => false)) {
    return;
  }
  console.log("==> retry ready/init", tableId);
  await frame.evaluate(() => parent.postMessage({ type: "ready" }, "*"));
  await clickAt(page, page.locator(`[data-testid="tables-item-${tableId}"]`));
  await sleep(800);
  await waitInFrame(frame, `[data-testid="${rootTestId}"]`);
}

async function waitInFrame(frame, selector, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await frame.evaluate((sel) => Boolean(document.querySelector(sel)), selector).catch(() => false);
    if (found) return;
    await sleep(150);
  }
  throw new Error("missing in editor: " + selector);
}

async function clickInFrame(page, frame, selector) {
  await frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error("missing " + sel);
    el.scrollIntoView({ block: "nearest", inline: "center" });
  }, selector);
  await sleep(120);
  const box = await frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + Math.min(Math.max(r.width / 2, 8), 48), y: r.y + r.height / 2 };
  }, selector);
  if (!box) throw new Error("no box in editor: " + selector);
  const iframe = page.locator('[data-testid="table-editor-frame"]');
  const outer = await iframe.boundingBox();
  if (!outer) throw new Error("editor iframe has no box");
  const x = outer.x + box.x;
  const y = outer.y + box.y;
  await page.mouse.move(x, y, { steps: 6 });
  await placeCursor(page, x, y);
  await sleep(80);
  return { x, y };
}

async function openParamsDialog(page, frame) {
  const pos = await clickInFrame(page, frame, '[data-testid="demo-params-0"]');
  await page.mouse.dblclick(pos.x, pos.y);
  const opened = await frame.evaluate(() => {
    const el = document.querySelector('[data-testid="demo-params-0"]');
    const td = el?.closest("td") || el;
    if (td) td.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, view: window }));
    return Boolean(document.querySelector('[data-role="params-dialog"]'));
  });
  if (!opened) {
    await frame.evaluate(() => {
      const editor = window.BitTableEditor;
      if (!editor) return;
      const row = (editor.data && editor.data.rows && editor.data.rows[0]) || {};
      editor.paramsEditRi = 0;
      editor.paramsDraft = editor.normalizeParams(row.params, row);
      editor.render();
    });
  }
}

async function playDemo(page) {
  page.on("pageerror", (err) => console.log("pageerror", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("console", msg.text());
  });
  await page.goto(`${DEV_SERVER_URL}/?table=sheet_demo`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator('[data-testid="titlebar-root-path"]').waitFor({ timeout: 15000 });
    await page.locator('[data-testid="tables-item-sheet_demo"]').waitFor({ timeout: 15000 });
    if (!(await page.locator('[data-testid="table-editor-frame"]').count())) {
      await clickAt(page, page.locator('[data-testid="tables-item-sheet_demo"]'));
    }
    await page.locator('[data-testid="table-editor-frame"]').waitFor({ timeout: 15000 });
    const sheetFrame = await editorFrame(page, "sheet_demo");
    await ensureMounted(page, sheetFrame, "sheet_demo", "table-editor");
    await waitInFrame(sheetFrame, '[data-testid="demo-params-0"]');
    await sleep(800);

    await openParamsDialog(page, sheetFrame);
    await waitInFrame(sheetFrame, '[data-role="params-dialog"]');
    await sleep(1400);
    await clickInFrame(page, sheetFrame, '[data-role="params-cancel"]');
    await sheetFrame.evaluate(() => {
      document.querySelector('[data-role="params-cancel"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
      );
    });
    const goneAt = Date.now() + 4000;
    while (Date.now() < goneAt) {
      const open = await sheetFrame.evaluate(() => Boolean(document.querySelector('[data-role="params-dialog"]'))).catch(() => false);
      if (!open) break;
      await sleep(150);
    }
    await sleep(200);

    await clickAt(page, page.locator('[data-testid="tables-sheet-packs"]'));
    await sleep(1200);

    await clickAt(page, page.locator('[data-testid="tables-item-chart_demo"]'));
    await page.locator('[data-testid="tables-tab-chart_demo"]').waitFor({ timeout: 10000 });
    const chartFrame = await editorFrame(page, "chart_demo");
    await ensureMounted(page, chartFrame, "chart_demo", "chart-demo-editor");
    await waitInFrame(chartFrame, '[data-testid="chart-demo-canvas"]');
    await sleep(900);
    await clickAt(page, page.locator('[data-testid="tables-sheet-bar"]'));
    await sleep(800);
    await clickAt(page, page.locator('[data-testid="tables-sheet-pie"]'));
    await sleep(1100);
  } catch (err) {
    await dumpPage(page, "fail").catch(() => undefined);
    throw err;
  }
}

function convertGif(ffmpeg, webm) {
  const args = [
    "-y",
    "-ss",
    "0.8",
    "-i",
    webm,
    "-vf",
    "setpts=0.55*PTS,fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5",
    "-loop",
    "0",
    GIF,
  ];
  console.log("==> ffmpeg", path.basename(webm), "->", path.relative(ROOT, GIF));
  const result = spawnSync(ffmpeg, args, { stdio: "inherit", windowsHide: true });
  if (result.status) throw new Error("ffmpeg gif convert failed");
}

async function record(tools) {
  process.env.PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL = "0";
  const { chromium } = await import(pathToFileURL(path.join(TOOLS, "node_modules", "playwright", "index.mjs")).href);
  fs.mkdirSync(TMP, { recursive: true });
  for (const name of fs.readdirSync(TMP)) {
    fs.rmSync(path.join(TMP, name), { force: true, recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    env: { ...tools.env, PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL: "0" },
    args: ["--lang=zh-CN", "--disable-font-subpixel-positioning"],
  });
  const context = await browser.newContext({
    viewport: VIEW,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    locale: "zh-CN",
    recordVideo: { dir: TMP, size: VIEW },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await playDemo(page);
  } catch (err) {
    throw err;
  } finally {
    await context.close();
    await browser.close();
  }

  const videos = fs.readdirSync(TMP).filter((name) => name.endsWith(".webm"));
  if (!videos.length) throw new Error("no webm recorded");
  const webm = path.join(TMP, videos[0]);
  convertGif(ffmpegBin(tools.require), webm);
  fs.rmSync(TMP, { recursive: true, force: true });
  const size = fs.statSync(GIF).size;
  console.log("==> gif", path.relative(ROOT, GIF), `${(size / 1024 / 1024).toFixed(2)} MB`);
  if (size > 3 * 1024 * 1024) {
    console.warn("gif larger than 3MB; re-run after tightening fps/width if needed");
  }
}

async function main() {
  process.chdir(ROOT);
  fs.mkdirSync(ASSETS, { recursive: true });
  const tools = await ensureTools();
  await ensureServers();
  try {
    await record(tools);
  } finally {
    stopStarted();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  stopStarted();
  process.exit(1);
});
