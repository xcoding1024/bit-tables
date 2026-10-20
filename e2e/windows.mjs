import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, _electron as electron } from "@playwright/test";
import { dump, load } from "js-yaml";

if (process.argv.includes("--help")) {
  console.log("先构建 frontend，再运行 npm run test:windows。使用两份临时示例目录验收浏览器弹窗、桌面子窗口、目录隔离与关闭保护。");
  process.exit(0);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bit-tables-windows-"));
const rootA = path.join(temp, "a", "tables");
const rootB = path.join(temp, "b", "tables");
const errors = [];
let server, browser, app;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(check) {
  const deadline = Date.now() + 30000;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error("子窗口验收等待超时");
    await delay(100);
  }
}
const frame = (page) => page.frameLocator("[data-testid=table-editor-frame]");
const cell = (page, key, index = 0) => frame(page).locator(`[data-role="cell"][data-key="${key}"][data-index="${index}"]`);
const diskData = (root) => load(fs.readFileSync(path.join(root, "fill_demo/fill_demo_data.yaml"), "utf8"));
async function ready(page) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForLoadState("domcontentloaded");
  await cell(page, "name").waitFor();
}
async function openChild(page, owner) {
  await page.getByTestId("tables-tab-fill_demo").click({ button: "right" });
  const pending = owner.waitForEvent("window");
  await page.getByTestId("table-tab-open-window").click();
  const child = await pending;
  await ready(child);
  return child;
}
async function switchRoot(page, root) {
  await page.getByRole("button", { name: "项目", exact: true }).click();
  await page.getByRole("menuitem", { name: "打开…", exact: true }).click();
  await page.getByTestId("tables-open-path").fill(path.dirname(root));
  await page.getByTestId("tables-open-confirm").click();
  await poll(async () => new URL(page.url()).searchParams.get("rootPath") === root);
  await ready(page);
}
async function fillColumn(page, key) {
  await cell(page, key).click();
  await frame(page).getByTestId("fill-fill-handle").dblclick();
  await poll(async () => await frame(page).locator("#root").getAttribute("data-state-busy") === "0");
}

try {
  for (const name of ["a", "b"]) fs.cpSync(path.join(repo, "demo"), path.join(temp, name), { recursive: true });
  const dataB = diskData(rootB);
  dataB.sheets.main.rows[0].name = "子目录";
  fs.writeFileSync(path.join(rootB, "fill_demo/fill_demo_data.yaml"), dump(dataB));
  fs.writeFileSync(path.join(rootB, "fill_demo/window.svg"), "<svg>child</svg>");
  const exe = path.join(temp, process.platform === "win32" ? "bit-tables.exe" : "bit-tables");
  assert.equal(spawnSync("go", ["build", "-o", exe, "./cmd/bit-tables"], { cwd: repo, stdio: "inherit", windowsHide: true }).status, 0);
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(exe, ["serve", "--addr", `127.0.0.1:${port}`, rootA], {
    cwd: repo, env: { ...process.env, BIT_TABLES_SPA: path.join(repo, "frontend/dist") }, stdio: "inherit", windowsHide: true,
  });
  await poll(async () => { try { return (await fetch(`${base}/api/root`)).ok; } catch { return false; } });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route("https://fonts.googleapis.com/**", (route) => route.abort());
  const main = await context.newPage();
  await main.goto(`${base}/?table=fill_demo`); await ready(main);
  // 浏览器页通过同一上下文观察弹出的窗口。
  await main.getByTestId("tables-tab-fill_demo").click({ button: "right" });
  const popup = context.waitForEvent("page");
  await main.getByTestId("table-tab-open-window").click();
  const child = await popup; await ready(child);
  await switchRoot(child, rootB);
  assert.equal(await cell(child, "name").innerText(), "子目录");
  assert.equal(await cell(main, "name").innerText(), "名称000");
  assert.equal((await (await fetch(`${base}/api/root`)).json()).data.path, rootA);
  const assetURL = await frame(child).locator("#root").evaluate(() => window.BitTableEditor.api.assetURL("./window.svg"));
  assert.equal(await (await fetch(base + assetURL)).text(), "<svg>child</svg>");
  await fillColumn(child, "name");
  await child.getByRole("button", { name: "查看", exact: true }).click();
  await child.getByTestId("titlebar-open-table-window").click();
  await child.getByRole("alert").filter({ hasText: "请先保存" }).waitFor();
  assert.equal(context.pages().length, 2);
  await frame(child).getByTestId("fill-save").click();
  await poll(() => diskData(rootB).sheets.main.rows[299].name === "子目录");
  assert.equal(diskData(rootA).sheets.main.rows[299].name, "名称299");
  await child.reload(); await ready(child);
  assert.equal(new URL(child.url()).searchParams.get("rootPath"), rootB);
  await browser.close(); browser = null;

  const wrapper = path.join(temp, "electron.cjs");
  fs.writeFileSync(wrapper, `const { app } = require("electron");\napp.setPath("userData", ${JSON.stringify(path.join(temp, "profile"))});\nrequire(${JSON.stringify(path.join(repo, "desktop/main.cjs"))});\n`);
  app = await electron.launch({ args: [wrapper], cwd: repo, env: {
    ...process.env, BIT_TABLES_ADDR: `127.0.0.1:${port}`, BIT_TABLES_EXTERNAL_API: "1", BIT_TABLES_DEV: "", DEV_SERVER_URL: "",
  } });
  app.context().on("page", (page) => page.on("dialog", () => {}));
  await app.context().route("https://fonts.googleapis.com/**", (route) => route.abort());
  const desktop = await app.firstWindow();
  desktop.on("dialog", () => {});
  await desktop.getByTestId("tables-item-fill_demo").click(); await ready(desktop);
  let detached = await openChild(desktop, app);
  await switchRoot(detached, rootB);
  const native = await app.browserWindow(detached);
  const nativeMain = await app.browserWindow(desktop);
  await detached.getByRole("button", { name: "最大化", exact: true }).click();
  await poll(() => native.evaluate((window) => window.isMaximized()));
  assert.equal(await nativeMain.evaluate((window) => window.isMaximized()), false);
  await native.evaluate((window) => window.webContents.sendInputEvent({ type: "keyDown", keyCode: "F11" }));
  await poll(() => native.evaluate((window) => window.isFullScreen()));
  await native.evaluate((window) => window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" }));
  await poll(async () => !await native.evaluate((window) => window.isFullScreen()));
  await detached.getByRole("button", { name: "关闭", exact: true }).click();
  await poll(() => app.windows().length === 1);
  detached = await openChild(desktop, app);
  await fillColumn(detached, "name");
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
  await desktop.getByRole("button", { name: "关闭", exact: true }).click();
  await poll(() => detached.getByTestId("tables-tab-fill_demo").isVisible());
  await delay(300);
  assert.equal(app.windows().length, 2);
  const profile = JSON.parse(fs.readFileSync(path.join(temp, "profile/last-root.json"), "utf8"));
  assert.equal(profile.path, rootA);
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  const exited = app.waitForEvent("close");
  await desktop.getByRole("button", { name: "关闭", exact: true }).click();
  await exited; app = null;
  assert.deepEqual(errors, []);
  console.log("子窗口验收通过：右键弹窗、目录隔离、保存与资源、刷新、草稿保护、最大化、全屏、关闭联动。");
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
    await app.close();
  }
  if (browser) await browser.close();
  if (server && server.exitCode === null) { server.kill(); await once(server, "exit"); }
  if (path.dirname(temp) !== fs.realpathSync(os.tmpdir())) throw new Error("临时目录边界无效");
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
