import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { dump, load } from "js-yaml";

if (process.argv.includes("--help")) {
  console.log("先构建 frontend，再运行 npm run test:e2e。验收在临时示例项目中运行，不修改仓库数据。");
  process.exit(0);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bit-tables-fill-"));
let server, browser, page;
const errors = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(check) {
  const deadline = Date.now() + 45000;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error("浏览器验收等待超时");
    await delay(100);
  }
}
try {
  fs.cpSync(path.join(repo, "demo"), path.join(temp, "demo"), { recursive: true });
  const exe = path.join(temp, process.platform === "win32" ? "bit-tables.exe" : "bit-tables");
  const built = spawnSync("go", ["build", "-o", exe, "./cmd/bit-tables"], { cwd: repo, stdio: "inherit", windowsHide: true });
  assert.equal(built.status, 0);
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(exe, ["serve", "--addr", `127.0.0.1:${port}`, path.join(temp, "demo/tables")], {
    cwd: repo, env: { ...process.env, BIT_TABLES_SPA: path.join(repo, "frontend/dist") }, stdio: "inherit", windowsHide: true,
  });
  await poll(async () => { try { return (await fetch(`${base}/api/tables`)).ok; } catch { return false; } });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base); await page.getByTestId("tables-item-fill_demo").click();
  const frame = page.frameLocator("[data-testid=table-editor-frame]");
  const cell = (field, row) => frame.locator(`[data-role="cell"][data-key="${field}"][data-index="${row}"]`);
  const handle = frame.getByTestId("fill-fill-handle");
  const draft = () => frame.locator("#root").evaluate(() => window.BitTableEditor.api.getData().rows);
  const files = async () => (await (await page.request.get(`${base}/api/tables/fill_demo/files`)).json()).data;
  const busy = async () => { await poll(async () => await frame.locator("#root").getAttribute("data-state-busy") === "0"); };
  await cell("name", 0).click(); await handle.dblclick(); await busy();
  assert.equal((await draft())[299].name, "名称000");
  assert.equal(load((await files()).data).sheets.main.rows[299].name, "名称299");
  await frame.getByTestId("fill-undo").click(); await busy(); assert.equal((await draft())[299].name, "名称299");
  await frame.getByTestId("fill-redo").click(); await busy(); assert.equal((await draft())[299].name, "名称000");
  await frame.getByTestId("fill-save").click();
  await poll(async () => load((await files()).data).sheets.main.rows[299].name === "名称000");
  await page.getByTestId("tables-status-toggle").click();
  await poll(async () => (await page.getByTestId("tables-status-log").innerText()).includes("检查通过"));
  await page.getByTestId("tables-status-clear").click();
  assert.equal((await page.getByTestId("tables-status-log").innerText()).trim(), "就绪");
  assert.equal(await page.getByTestId("tables-status-clear").isDisabled(), true);
  const saved = await files();
  const source = "xlsx://fill_demo/fill-source.xlsx/" + encodeURIComponent("来源 长表") + "!B1";
  const response = await page.request.put(`${base}/api/tables/fill_demo/state`, { data: { data: saved.data,
    plugins: dump({ bindings: [{ sheet: "main", row: "row_000", field: "output", plugin: "reference", args: { source } }] }) } });
  assert.equal(response.ok(), true);
  await page.reload(); await cell("output", 0).click(); await handle.dblclick(); await busy();
  let computed = await files();
  assert.equal(load(computed.data).sheets.main.rows[299].output, 2598);
  assert.equal(load(computed.plugins).bindings.length, 300);
  assert.equal(load(computed.plugins).bindings[299].args.source.endsWith("!B300"), true);
  await frame.getByTestId("fill-undo").click(); await busy();
  computed = await files(); assert.equal(load(computed.plugins).bindings.length, 1); assert.equal(load(computed.data).sheets.main.rows[299].output, -299);
  await frame.getByTestId("fill-redo").click(); await busy(); await page.reload();
  await cell("output", 0).waitFor(); assert.equal(await cell("output", 0).getAttribute("data-plugin"), "1");
  await frame.getByTestId("fill-page-next").click(); await cell("input", 108).click(); await handle.dblclick(); await busy();
  assert.equal((await draft())[299].input, 1108); assert.equal((await draft())[107].input, 1107);
  assert.equal(await frame.getByTestId("fill-page-info").innerText(), "101–200 / 300 行");
  const reset = load((await files()).data);
  reset.sheets.main.rows.forEach((row, index) => { row.output = -index; });
  const bindings = Array.from({ length: 300 }, (_, index) => {
    const row = `row_${String(index).padStart(3, "0")}`;
    return { sheet: "main", row, field: "output", plugin: "reference", args: { source: `fill_demo.main!input[${row}]` } };
  });
  assert.equal((await page.request.put(`${base}/api/tables/fill_demo/state`, { data: { data: dump(reset), plugins: dump({ bindings }) } })).ok(), true);
  await page.reload(); await cell("output", 0).click(); await handle.dblclick(); await busy();
  assert.equal(load((await files()).data).sheets.main.rows[299].output, 1299);
  await frame.getByTestId("fill-undo").click(); await busy(); assert.equal(load((await files()).data).sheets.main.rows[299].output, -299);
  await frame.getByTestId("fill-redo").click(); await busy(); assert.equal(load((await files()).data).sheets.main.rows[299].output, 1299);
  assert.deepEqual(errors, []);
  console.log("bit-tables 填充浏览器验收通过：跨页、草稿、整体保存、Excel 相对引用、撤销重做与刷新。");
} catch (error) {
  if (page) {
    console.error({ url: page.url(), errors, frames: page.frames().map((frame) => frame.url()), page: (await page.locator("body").innerText()).slice(-2500) });
    const output = path.join(repo, "scripts/.record-tools");
    fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, "fill-failure.png") });
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { server.kill(); await once(server, "exit"); }
  if (path.dirname(temp) !== fs.realpathSync(os.tmpdir())) throw new Error("临时目录边界无效");
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
