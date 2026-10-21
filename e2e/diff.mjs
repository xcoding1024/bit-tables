import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { dump, load } from "js-yaml";

if (process.argv.includes("--help")) {
  console.log("先构建 frontend，再运行 npm run test:diff。使用临时 Git 配表验收历史比对、草稿只读、差异筛选与快照接口，并检查共享差异算法。");
  process.exit(0);
}
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "bit-tables-diff-"));
const root = path.join(temp, "project", "tables");
const require = createRequire(import.meta.url);
let server, browser;
function command(program, args, cwd = repo) {
  const result = spawnSync(program, args, { cwd, encoding: "utf8", windowsHide: true,
    env: { ...process.env, GIT_AUTHOR_NAME: "验收", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "验收", GIT_COMMITTER_EMAIL: "test@example.invalid" } });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout.trim();
}
try {
  const frontendRequire = createRequire(path.join(repo, "frontend/package.json"));
  const bundled = frontendRequire("esbuild").buildSync({ entryPoints: [path.join(repo, "frontend/src/lib/diff.ts")], bundle: true, platform: "node", format: "cjs", write: false });
  const algorithmFile = path.join(temp, "diff.cjs");
  fs.writeFileSync(algorithmFile, bundled.outputFiles[0].text);
  const { compareTables, equalValue, filterDiffRows } = require(algorithmFile);
  const pack = (rows) => ({ struct: JSON.stringify({ fields: [{ key: "id" }, { key: "value" }] }), data: JSON.stringify({ rows }) });
  const [sheet] = compareTables(pack([{ id: "a", value: 2 }, { id: "b", value: null }]), pack([{ id: "b", value: null }, { id: "a", value: "2" }]));
  assert.equal(sheet.positional, false);
  assert.equal(filterDiffRows(sheet.rows, "changed").length, 1);
  assert.equal(equalValue({ x: 1, y: [1, 2] }, { y: [1, 2], x: 1 }), true);
  assert.equal(equalValue({}, { value: null }), false);
  assert.equal(compareTables(pack([{ value: 1 }]), pack([{ value: 2 }]))[0].positional, true);

  fs.cpSync(path.join(repo, "demo"), path.join(temp, "project"), { recursive: true });
  const dataFile = path.join(root, "sheet_demo/sheet_demo_data.yaml");
  const data = load(fs.readFileSync(dataFile, "utf8"));
  command("git", ["init"], path.dirname(root));
  command("git", ["add", "tables", "src"], path.dirname(root));
  command("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "-m", "初始配置"], path.dirname(root));
  data.sheets.items.rows[0].name = "历史铁剑";
  fs.writeFileSync(dataFile, dump(data));
  command("git", ["add", "tables", "src"], path.dirname(root));
  command("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "-m", "调整配置"], path.dirname(root));
  data.sheets.items.rows[0].name = "本地铁剑";
  fs.writeFileSync(dataFile, dump(data));

  const exe = path.join(temp, process.platform === "win32" ? "bit-tables.exe" : "bit-tables");
  command("go", ["build", "-o", exe, "./cmd/bit-tables"]);
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(exe, ["serve", "--addr", `127.0.0.1:${port}`, root], { cwd: repo, env: { ...process.env, BIT_TABLES_SPA: path.join(repo, "frontend/dist") }, stdio: "inherit", windowsHide: true });
  await expect.poll(async () => { try { return (await fetch(`${base}/api/root`)).ok; } catch { return false; } }).toBe(true);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.route("https://fonts.googleapis.com/**", (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/?table=sheet_demo`);
  const editor = page.frameLocator("[data-testid=table-editor-frame]");
  const cell = editor.locator('[data-role="cell"][data-key="name"][data-index="0"]');
  await expect(cell).toHaveText("本地铁剑");
  const normalImage = editor.locator('img[src*="/asset?"]').first();
  await expect.poll(() => normalImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  await cell.dblclick();
  await editor.getByTestId("demo-name-0").fill("草稿铁剑");
  await editor.getByTestId("demo-name-0").press("Enter");
  await expect(cell).toHaveText("草稿铁剑");
  await page.getByRole("button", { name: "历史记录", exact: true }).click();
  await page.getByTestId("tables-history-compare-base").click();
  await expect(page.frameLocator('[data-testid="table-diff-editor-left"]').locator('[data-role="cell"][data-key="name"]').first()).toHaveText("历史铁剑");
  await page.getByTestId("table-diff-view-raw").click();
  await expect(page.getByTestId("table-diff-cell-left-iron_sword-name")).toHaveText("历史铁剑");
  await expect(page.getByTestId("table-diff-cell-right-iron_sword-name")).toHaveText("草稿铁剑");
  await expect(page.getByTestId("table-diff-local-label")).toContainText("含未保存草稿");
  await page.getByTestId("table-diff-filter-changed").click();
  await page.getByRole("button", { name: "下一个差异", exact: true }).click();
  await expect(page.getByTestId("table-diff-details")).toContainText("草稿铁剑");
  const response = await fetch(`${base}/api/tables/sheet_demo/history`);
  const history = (await response.json()).data;
  await page.getByTestId("table-diff-revision").selectOption(history.entries[1].id);
  await expect(page.getByTestId("table-diff-cell-left-iron_sword-name")).toHaveText("铁剑");
  await page.keyboard.press("Control+s");
  assert.equal(load(fs.readFileSync(dataFile, "utf8")).sheets.items.rows[0].name, "本地铁剑");
  await page.getByTestId("table-diff-close").click();
  await expect(cell).toHaveText("草稿铁剑");
  await cell.click(); await page.keyboard.press("Control+z");
  await expect(cell).toHaveText("本地铁剑");
  assert.deepEqual(errors, []);
  console.log("版本比对验收通过：共享算法、历史与基线入口、草稿只读、类型差异、筛选跳转、关闭恢复及撤销栈。");
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null) { server.kill(); await once(server, "exit"); }
  if (fs.realpathSync(path.dirname(temp)) !== fs.realpathSync(os.tmpdir()) || !path.basename(temp).startsWith("bit-tables-diff-")) throw new Error("临时目录边界无效");
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}
