#!/usr/bin/env node
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(docsRoot, "..");
const sourceDemo = path.join(repoRoot, "demo");
const outputDir = path.join(docsRoot, "site", "public", "demos");
const baseURL = "http://127.0.0.1:5176";
const apiURL = "http://127.0.0.1:18780";
const onlyDemo = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7) || "";
const children = [];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bit-tables-docs-"));
const tempProject = path.join(tempRoot, "demo");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`用法: npm run capture:demos [-- --only=<名称>]

可用名称: navigation、editing、excel-plugin、quality、project-tools。

脚本只使用 bit-tables/demo：先复制到系统临时目录，再录制 GIF/PNG，
不会修改仓库内的 demo 数据，也不会读取其它项目目录。

前置条件: Go、Node.js、ffmpeg 可用，frontend 依赖已安装。`);
  process.exit(0);
}

function waitHttp(url, tries = 160) {
  return new Promise((resolve, reject) => {
    const tick = (left) => {
      const req = http.get(url, { timeout: 1500 }, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        if (left <= 0) return reject(new Error(`${url} 未就绪`));
        setTimeout(() => tick(left - 1), 250);
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => {
        if (left <= 0) reject(new Error(`${url} 未就绪`));
        else setTimeout(() => tick(left - 1), 250);
      });
    };
    tick(tries);
  });
}

function start(command, args, cwd) {
  const child = spawn(command, args, {
    cwd,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

function stopChildren() {
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(child.pid)], { stdio: "ignore", windowsHide: true });
    } else {
      child.kill("SIGTERM");
    }
  }
}

function removeTemp() {
  const base = path.resolve(os.tmpdir()) + path.sep;
  const target = path.resolve(tempRoot);
  if (!target.startsWith(base) || !path.basename(target).startsWith("bit-tables-docs-")) {
    throw new Error(`拒绝删除非预期临时目录: ${target}`);
  }
  fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

function prepareFixture() {
  if (/xq-common/i.test(sourceDemo)) throw new Error("录制源不得指向 xq-common");
  fs.cpSync(sourceDemo, tempProject, {
    recursive: true,
    filter(source) {
      const rel = path.relative(sourceDemo, source);
      return !rel.split(path.sep).some((part) => part === "node_modules" || part === "build");
    },
  });
}

async function startServers() {
  const viteEntry = path.join(repoRoot, "frontend", "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(viteEntry)) throw new Error("缺少 frontend/node_modules，请先安装前端依赖");
  start("go", ["run", "./cmd/bit-tables", "serve", path.join(tempProject, "tables"), "--addr", "127.0.0.1:18780"], repoRoot);
  await waitHttp(`${apiURL}/api/root`);
  start(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", "5176", "--strictPort"], path.join(repoRoot, "frontend"));
  await waitHttp(baseURL);
}

async function addCursor(page) {
  await page.addStyleTag({ content: `#docs-cursor{position:fixed;z-index:2147483647;width:24px;height:24px;border:3px solid #62d4b7;border-radius:50%;pointer-events:none;box-shadow:0 0 0 4px rgba(0,0,0,.72);transform:translate(-50%,-50%);transition:left .16s ease,top .16s ease}` });
  await page.evaluate(() => {
    document.querySelector("#docs-cursor")?.remove();
    const cursor = document.createElement("div");
    cursor.id = "docs-cursor";
    cursor.style.left = "92%";
    cursor.style.top = "90%";
    document.body.appendChild(cursor);
  });
}

async function cursorTo(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("录制目标不可见");
  await page.evaluate(({ x, y }) => {
    const cursor = document.querySelector("#docs-cursor");
    if (cursor instanceof HTMLElement) {
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
    }
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await page.waitForTimeout(220);
}

async function annotate(page, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("无法标记不可见目标");
  await page.evaluate((target) => {
    const mark = document.createElement("div");
    mark.dataset.docsAnnotation = "true";
    Object.assign(mark.style, {
      position: "fixed", zIndex: "2147483646", pointerEvents: "none", boxSizing: "border-box",
      left: `${target.x - 5}px`, top: `${target.y - 5}px`, width: `${target.width + 10}px`, height: `${target.height + 10}px`,
      border: "4px solid #ff3b30", borderRadius: "8px", boxShadow: "0 0 0 2px rgba(255,255,255,.85)",
    });
    document.body.appendChild(mark);
  }, box);
}

async function clearAnnotations(page) {
  await page.evaluate(() => document.querySelectorAll("[data-docs-annotation]").forEach((node) => node.remove()));
}

async function clipAround(page, locators, { padding = 20, minWidth = 0, minHeight = 0 } = {}) {
  const boxes = await Promise.all(locators.map((locator) => locator.boundingBox()));
  if (boxes.some((box) => !box)) throw new Error("无法计算截图范围");
  const viewport = page.viewportSize();
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  const width = Math.min(viewport.width, Math.max(right - left + padding * 2, minWidth));
  const height = Math.min(viewport.height, Math.max(bottom - top + padding * 2, minHeight));
  const x = Math.max(0, Math.min(left - padding - Math.max(0, width - (right - left + padding * 2)) / 2, viewport.width - width));
  const y = Math.max(0, Math.min(top - padding - Math.max(0, height - (bottom - top + padding * 2)) / 2, viewport.height - height));
  return { x: Math.floor(x), y: Math.floor(y), width: Math.floor(width), height: Math.floor(height) };
}

async function savePng(page, name, clip) {
  await page.evaluate(() => document.querySelector("#docs-cursor")?.remove());
  const output = path.join(outputDir, `${name}.png`);
  await page.screenshot({ path: output, clip });
  console.log(`生成 ${path.relative(docsRoot, output)}`);
}

function recorder(page, name, clip) {
  const frames = path.join(tempRoot, `frames-${name}`);
  fs.mkdirSync(frames, { recursive: true });
  let index = 0;
  return {
    async shot(repeat = 3) {
      for (let i = 0; i < repeat; i += 1) {
        index += 1;
        await page.screenshot({ path: path.join(frames, `frame-${String(index).padStart(3, "0")}.png`), clip });
      }
    },
    render() {
      const output = path.join(outputDir, `${name}.gif`);
      const result = spawnSync("ffmpeg", [
        "-y", "-framerate", "5", "-i", path.join(frames, "frame-%03d.png"),
        "-vf", "fps=5,scale=960:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
        "-loop", "0", output,
      ], { stdio: "ignore", windowsHide: true });
      if (result.status) throw new Error("ffmpeg 生成 GIF 失败");
      console.log(`生成 ${path.relative(docsRoot, output)}`);
    },
  };
}

async function prepare(page, tableId) {
  await page.goto(`${baseURL}/?table=${tableId}`, { waitUntil: "domcontentloaded" });
  const item = page.getByTestId(`tables-item-${tableId}`);
  await item.waitFor({ timeout: 30_000 });
  await item.click();
  await page.getByTestId("table-editor-frame").waitFor({ timeout: 30_000 });
  await page.evaluate(() => {
    const pathLabel = document.querySelector('[data-testid="titlebar-root-path"]');
    if (pathLabel) pathLabel.textContent = "D:\\game\\demo\\tables";
  });
  await addCursor(page);
}

async function hideSidePanels(page, { left = false, right = false } = {}) {
  await page.evaluate(({ left, right }) => {
    if (left) document.querySelector('[data-testid="tables-left-resize"]')?.closest("aside")?.setAttribute("style", "display:none");
    if (right) document.querySelector('[data-testid="tables-right-resize"]')?.closest("aside")?.setAttribute("style", "display:none");
  }, { left, right });
  await page.waitForTimeout(120);
}

async function navigationDemo(page) {
  await prepare(page, "sheet_demo");
  await hideSidePanels(page, { right: true });
  const search = page.getByTestId("tables-file-search");
  await search.fill("sheet");
  await annotate(page, search);
  await savePng(page, "navigation", { x: 0, y: 32, width: 1000, height: 650 });
  await clearAnnotations(page);
}

async function editingDemo(page) {
  await prepare(page, "fill_demo");
  await hideSidePanels(page, { left: true, right: true });
  const frame = page.frameLocator('[data-testid="table-editor-frame"]');
  await frame.getByTestId("table-editor").waitFor();
  const first = frame.locator('[data-role="cell"][data-key="name"][data-index="0"]');
  await first.waitFor();
  const clip = { x: 0, y: 32, width: 1280, height: 700 };
  const rec = recorder(page, "editing-fill", clip);
  await rec.shot(3);
  await first.click();
  const handle = frame.locator('[data-role="fill-handle"]');
  await handle.waitFor();
  await cursorTo(page, handle);
  await rec.shot(3);
  await handle.dblclick();
  await page.waitForTimeout(900);
  await rec.shot(5);
  const undo = frame.getByTestId("fill-undo");
  await cursorTo(page, undo);
  await undo.click();
  await page.waitForTimeout(500);
  await rec.shot(4);
  rec.render();

  await first.click();
  const second = frame.locator('[data-role="cell"][data-key="name"][data-index="1"]');
  await second.click({ modifiers: ["Shift"] });
  await handle.waitFor();
  await annotate(page, handle);
  await savePng(page, "editing-toolbar", { x: 0, y: 32, width: 1280, height: 340 });
  await clearAnnotations(page);
}

async function excelPluginDemo(page) {
  await prepare(page, "sheet_demo");
  await hideSidePanels(page, { left: true, right: true });
  const excelTab = page.locator('[data-testid^="tables-sheet-xlsx:"]').first();
  await excelTab.waitFor();
  await excelTab.click();
  const excel = page.getByTestId("excel-view");
  await excel.waitFor();
  const cell = page.getByTestId("excel-cell-B2");
  await annotate(page, cell);
  await savePng(page, "excel-source", { x: 0, y: 32, width: 1000, height: 320 });
  await clearAnnotations(page);

  await page.reload();
  await page.getByTestId("tables-item-sheet_demo").click();
  await page.getByTestId("table-editor-frame").waitFor();
  await page.getByTestId("tables-sheet-items").click();
  const frame = page.frameLocator('[data-testid="table-editor-frame"]');
  const target = frame.locator('[data-role="cell"][data-key="power"][data-index="0"]');
  await target.waitFor();
  await target.click();
  await page.getByRole("button", { name: "插件", exact: true }).click();
  const panel = page.getByTestId("plugin-panel");
  await panel.waitFor();
  const card = page.locator('[data-testid^="plugin-card-"]').first();
  await card.click();
  await annotate(page, card);
  await savePng(page, "plugin-binding", await clipAround(page, [panel], { padding: 16, minWidth: 380, minHeight: 420 }));
  await clearAnnotations(page);
}

async function qualityDemo(page) {
  await prepare(page, "sheet_demo");
  await page.getByRole("button", { name: "检查", exact: true }).click();
  const checkAll = page.getByTestId("titlebar-check-all");
  await annotate(page, checkAll);
  await savePng(page, "check-menu", { x: 0, y: 0, width: 520, height: 250 });
  await clearAnnotations(page);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByTestId("titlebar-export-all").click();
  const dialog = page.getByTestId("export-dialog");
  await dialog.waitFor();
  await page.getByText("导出完成", { exact: true }).waitFor({ timeout: 30_000 });
  await page.getByTestId("export-path-client").evaluate((node) => { node.textContent = "客户端 D:\\game\\demo\\build\\client"; });
  await page.getByTestId("export-path-server").evaluate((node) => { node.textContent = "服务端 D:\\game\\demo\\build\\server"; });
  const modal = dialog.locator("xpath=../..");
  await savePng(page, "export-result", await clipAround(page, [modal], { padding: 8 }));
}

async function openViewTool(page, itemTestId) {
  await page.getByRole("button", { name: "查看", exact: true }).click();
  await page.getByTestId(itemTestId).click();
}

async function projectToolsDemo(page) {
  await prepare(page, "sheet_demo");
  await openViewTool(page, "titlebar-enums");
  const enums = page.getByTestId("enums-browser");
  await enums.waitFor();
  await annotate(page, page.getByTestId("enums-search"));
  await savePng(page, "enums", await clipAround(page, [enums.locator("xpath=../..")], { padding: 8, minWidth: 780, minHeight: 480 }));
  await clearAnnotations(page);
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();

  await openViewTool(page, "titlebar-deps");
  const deps = page.getByTestId("deps-browser");
  await deps.waitFor();
  await annotate(page, page.getByTestId("deps-search"));
  await savePng(page, "dependencies", await clipAround(page, [deps.locator("xpath=../..")], { padding: 8, minWidth: 940, minHeight: 560 }));
  await clearAnnotations(page);
  await page.getByRole("button", { name: "关闭", exact: true }).last().click();

  await openViewTool(page, "titlebar-templates");
  const templates = page.getByTestId("templates-browser");
  await templates.waitFor();
  const item = page.locator('[data-testid^="templates-item-"]').first();
  await annotate(page, item);
  await savePng(page, "templates", await clipAround(page, [templates.locator("xpath=../..")], { padding: 8, minWidth: 820, minHeight: 520 }));
  await clearAnnotations(page);
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  prepareFixture();
  fs.copyFileSync(path.join(repoRoot, "docs", "assets", "workbench.gif"), path.join(outputDir, "workbench.gif"));
  fs.copyFileSync(path.join(repoRoot, "docs", "assets", "workbench.gif"), path.join(outputDir, "sheets-and-charts.gif"));
  await startServers();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1, colorScheme: "dark", locale: "zh-CN" });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  const demos = new Map([
    ["navigation", navigationDemo],
    ["editing", editingDemo],
    ["excel-plugin", excelPluginDemo],
    ["quality", qualityDemo],
    ["project-tools", projectToolsDemo],
  ]);
  try {
    if (onlyDemo) {
      const demo = demos.get(onlyDemo);
      if (!demo) throw new Error(`未知演示名称: ${onlyDemo}`);
      await demo(page);
    } else {
      for (const demo of demos.values()) await demo(page);
    }
  } finally {
    await browser.close();
    stopChildren();
    removeTemp();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  stopChildren();
  try { removeTemp(); } catch { /* preserve original error */ }
  process.exit(1);
});
