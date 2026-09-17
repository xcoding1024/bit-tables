#!/usr/bin/env node
/**
 * 跨平台导表：跑配表根下各表 *_export.ts / *_export.js，
 * 产物写入配表根上一级 export/client 与 export/server。
 *
 * 用法:
 *   node export.mjs                 # 导出全部表
 *   node export.mjs sheet_demo      # 当前表 + 引用它的下游表
 *   node export.mjs --all
 *   node export.mjs --root ../tables
 */
import { createContext, runInContext } from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEMO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_TABLES_ROOT = path.join(DEMO_ROOT, "tables");
const TABLE_ID_RE = /^[a-z][a-z0-9_]{0,31}$/;
const SHEET_ID_RE = /^[a-z][a-z0-9_]{0,31}$/;

function usage() {
  console.log(`用法: node export.mjs [表id...] [--all] [--root <配表根>]

默认配表根: ${DEFAULT_TABLES_ROOT}
产物目录:   <配表根上一级>/export/client 与 export/server

无参数或 --all：导出全部有 export 脚本的表。
指定表 id：导出这些表及其传递下游（引用它们的表）。`);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function parseArgs(argv) {
  const out = { all: false, root: DEFAULT_TABLES_ROOT, ids: [], help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") out.help = true;
    else if (arg === "--all") out.all = true;
    else if (arg === "--root") {
      const next = argv[++i];
      if (!next) throw new Error("--root 需要路径");
      out.root = path.resolve(process.cwd(), next);
    } else if (arg.startsWith("-")) {
      throw new Error(`未知参数: ${arg}`);
    } else {
      out.ids.push(arg);
    }
  }
  return out;
}

function findTableDirs(rootAbs) {
  /** @type {{ id: string; dir: string; rel: string }[]} */
  const out = [];
  function walk(abs, rel) {
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith(".")) continue;
      const childAbs = path.join(abs, ent.name);
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (isTableDir(childAbs)) {
        out.push({ id: ent.name, dir: childAbs, rel: childRel });
      } else {
        walk(childAbs, childRel);
      }
    }
  }
  walk(rootAbs, "");
  out.sort((a, b) => a.rel.localeCompare(b.rel));
  return out;
}

function isTableDir(dir) {
  const base = path.basename(dir);
  if (!TABLE_ID_RE.test(base)) return false;
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return false;
  }
  return entries.some((name) => name.endsWith("_struct.yaml") && name.length > "_struct.yaml".length);
}

function scriptPath(dir, tableId, kind) {
  const ts = path.join(dir, `${tableId}_${kind}.ts`);
  if (fs.existsSync(ts) && fs.statSync(ts).isFile()) return ts;
  const js = path.join(dir, `${tableId}_${kind}.js`);
  if (fs.existsSync(js) && fs.statSync(js).isFile()) return js;
  return "";
}

function readYAML(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.trim()) return {};
  return yaml.load(text) ?? {};
}

function collectEnumRefs(struct) {
  const refs = new Set();
  const rec = asRecord(struct);
  const sheets = rec && Array.isArray(rec.sheets) ? rec.sheets : [];
  const fieldLists = [];
  if (sheets.length) {
    for (const item of sheets) {
      const sheet = asRecord(item);
      if (sheet && Array.isArray(sheet.fields)) fieldLists.push(sheet.fields);
    }
  } else if (Array.isArray(rec?.fields)) {
    fieldLists.push(rec.fields);
  }
  for (const fields of fieldLists) {
    for (const field of fields) {
      const f = asRecord(field);
      const ref = String(f?.enum ?? "").trim();
      if (ref) refs.add(ref);
    }
  }
  return [...refs];
}

function parseEnumRef(ref, currentTableId) {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 0) {
    if (!SHEET_ID_RE.test(raw) || !SHEET_ID_RE.test(currentTableId)) return null;
    return { tableId: currentTableId, sheetId: raw };
  }
  const tableId = raw.slice(0, dot).trim();
  const sheetId = raw.slice(dot + 1).trim();
  if (!SHEET_ID_RE.test(tableId) || !SHEET_ID_RE.test(sheetId)) return null;
  return { tableId, sheetId };
}

function buildDependents(tables) {
  /** @type {Map<string, string[]>} */
  const dependents = new Map();
  for (const t of tables) dependents.set(t.id, []);
  for (const t of tables) {
    for (const ref of collectEnumRefs(t.struct)) {
      const parsed = parseEnumRef(ref, t.id);
      if (!parsed || parsed.tableId === t.id || !dependents.has(parsed.tableId)) continue;
      const list = dependents.get(parsed.tableId);
      if (list && !list.includes(t.id)) list.push(t.id);
    }
  }
  return dependents;
}

function exportSet(dependents, tableId) {
  const out = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
    for (const dep of dependents.get(id) || []) visit(dep);
  };
  visit(tableId);
  return out.sort();
}

function resolveBitTablesImport(projectRoot, spec) {
  const m = /^bit-tables\.([a-z][a-z0-9_]*)$/.exec(spec);
  if (!m) throw new Error(`无效的 bit-tables 模块: ${spec}`);
  const allowed = {
    editor: "editor.ts",
    checker: "checker.ts",
    export: "export.ts",
    dom: "dom.ts",
    types: "types.ts",
  };
  const file = allowed[m[1]];
  if (!file) throw new Error(`未知的 bit-tables 模块: ${spec}`);
  return path.join(projectRoot, "core", file);
}

async function bundleExport(entry, projectRoot) {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    absWorkingDir: projectRoot,
    logLevel: "silent",
    plugins: [
      {
        name: "bit-tables-sandbox",
        setup(build) {
          build.onResolve({ filter: /^(bit-tables\.|\.)/ }, (args) => {
            if (args.path.startsWith("bit-tables.")) {
              return { path: resolveBitTablesImport(projectRoot, args.path) };
            }
            const abs = path.resolve(args.resolveDir, args.path);
            const candidates = [abs, `${abs}.ts`, `${abs}.js`, path.join(abs, "index.ts"), path.join(abs, "index.js")];
            for (const c of candidates) {
              if (fs.existsSync(c) && fs.statSync(c).isFile()) {
                const rel = path.relative(projectRoot, c);
                if (rel.startsWith("..") || path.isAbsolute(rel)) {
                  throw new Error(`import 超出项目根: ${c}`);
                }
                return { path: c };
              }
            }
            throw new Error(`找不到模块 ${args.path}`);
          });
        },
      },
    ],
  });
  if (result.errors?.length) {
    throw new Error(result.errors.map((e) => e.text).join("\n"));
  }
  if (!result.outputFiles?.length) throw new Error("打包未产生输出");
  return result.outputFiles[0].text;
}

function parseExportSides(raw) {
  const rec = asRecord(raw);
  const asList = (v) => {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (const item of v) {
      const file = asRecord(item);
      const name = String(file?.name ?? "").trim();
      if (!name) continue;
      out.push({ name, content: String(file?.content ?? "") });
    }
    return out;
  };
  const client = asList(rec?.client);
  const server = asList(rec?.server);
  if (client.length || server.length) return { client, server };
  const files = asList(rec?.files);
  if (files.length) return { client: files, server: files };
  return { client: [], server: [] };
}

function runExporter(js, data, struct) {
  const sandbox = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
  };
  const ctx = createContext(sandbox);
  runInContext(js, ctx, { timeout: 8000 });
  const exporter = sandbox.window.BitTableExporter;
  if (!exporter || typeof exporter.export !== "function") {
    throw new Error("未定义 BitTableExporter.export");
  }
  return parseExportSides(exporter.export(data, struct));
}

function sanitizeExportName(name) {
  let raw = String(name || "").trim().replace(/\\/g, "/");
  if (!raw) throw new Error("文件名为空");
  if (path.isAbsolute(raw) || raw.includes(":")) throw new Error(`导出文件名无效: ${name}`);
  const parts = raw.split("/").filter((p) => p && p !== ".");
  if (parts.some((p) => p === "..") || !parts.length) throw new Error(`导出文件名无效: ${name}`);
  return parts.join("/");
}

function writeSide(dir, files) {
  const written = [];
  for (const file of files) {
    const rel = sanitizeExportName(file.name);
    const dest = path.join(dir, ...rel.split("/"));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.content, "utf8");
    written.push(rel);
  }
  return written;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const tablesRoot = path.resolve(args.root);
  if (!fs.existsSync(tablesRoot) || !fs.statSync(tablesRoot).isDirectory()) {
    throw new Error(`配表根不存在: ${tablesRoot}`);
  }
  const projectRoot = path.dirname(tablesRoot);
  const clientDir = path.join(projectRoot, "export", "client");
  const serverDir = path.join(projectRoot, "export", "server");

  const discovered = findTableDirs(tablesRoot);
  const packed = discovered.map((item) => {
    const structPath = path.join(item.dir, `${item.id}_struct.yaml`);
    const dataPath = path.join(item.dir, `${item.id}_data.yaml`);
    return {
      ...item,
      struct: readYAML(structPath),
      data: readYAML(dataPath),
      exportEntry: scriptPath(item.dir, item.id, "export"),
    };
  });
  const byId = new Map(packed.map((t) => [t.id, t]));

  let targetIds;
  if (args.all || args.ids.length === 0) {
    targetIds = packed.map((t) => t.id);
  } else {
    const dependents = buildDependents(packed);
    const set = new Set();
    for (const id of args.ids) {
      if (!byId.has(id)) throw new Error(`未知表: ${id}`);
      for (const x of exportSet(dependents, id)) set.add(x);
    }
    targetIds = [...set].sort();
  }

  console.log(`配表根: ${tablesRoot}`);
  console.log(`客户端: ${clientDir}`);
  console.log(`服务端: ${serverDir}`);
  console.log(`导出表: ${targetIds.join(", ") || "(无)"}`);
  console.log("");

  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;
  for (const id of targetIds) {
    const table = byId.get(id);
    if (!table) continue;
    if (!table.exportEntry) {
      console.log(`跳过 ${id}: 无导出脚本`);
      skipCount++;
      continue;
    }
    try {
      const js = await bundleExport(table.exportEntry, projectRoot);
      const sides = runExporter(js, table.data, table.struct);
      if (!sides.client.length && !sides.server.length) {
        console.log(`跳过 ${id}: 未产生文件`);
        skipCount++;
        continue;
      }
      const clientWritten = writeSide(clientDir, sides.client);
      const serverWritten = writeSide(serverDir, sides.server);
      for (const name of clientWritten) console.log(`  client/${name}  (${id})`);
      for (const name of serverWritten) console.log(`  server/${name}  (${id})`);
      okCount++;
    } catch (err) {
      errCount++;
      console.error(`失败 ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("");
  console.log(`完成: 成功 ${okCount} · 跳过 ${skipCount} · 失败 ${errCount}`);
  if (errCount) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
