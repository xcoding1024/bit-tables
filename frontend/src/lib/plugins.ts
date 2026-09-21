import { dump, load } from "js-yaml";
import { mergeSheetData, sheetData } from "./tableHost";

export type PluginMatch = {
  table?: string;
  sheet?: string;
  field?: string;
  type?: string;
  widget?: string;
};

export type PluginParam = {
  key: string;
  label?: string;
  type?: string;
};

export type PluginDef = {
  id: string;
  name: string;
  kind?: "generic" | "exclusive";
  match?: PluginMatch;
  params?: PluginParam[];
};

export type PluginBinding = {
  sheet: string;
  row: string;
  field: string;
  plugin: string;
  args?: Record<string, unknown>;
};

export type PluginCellSel = {
  id: string;
  field: string;
  type?: string;
  widget?: string;
};

export type PluginSelection = {
  tableId: string;
  sheet: string;
  cells: PluginCellSel[];
};

export type TablePack = { data: unknown; struct: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseBindings(text: string): PluginBinding[] {
  const raw = String(text || "").trim();
  if (!raw) return [];
  try {
    const doc = raw.startsWith("{") || raw.startsWith("[") ? JSON.parse(raw) : load(raw);
    const rec = asRecord(doc);
    const list = rec && Array.isArray(rec.bindings) ? rec.bindings : [];
    const out: PluginBinding[] = [];
    for (const item of list) {
      const row = asRecord(item);
      if (!row) continue;
      const sheet = String(row.sheet || "").trim();
      const rid = String(row.row || "").trim();
      const field = String(row.field || "").trim();
      const plugin = String(row.plugin || "").trim();
      if (!sheet || !rid || !field || !plugin) continue;
      const args = asRecord(row.args) || {};
      out.push({ sheet, row: rid, field, plugin, args });
    }
    return out;
  } catch {
    return [];
  }
}

export function stringifyBindings(bindings: PluginBinding[]): string {
  if (!bindings.length) return "";
  return dump({ bindings }, { lineWidth: 120, noRefs: true });
}

export function bindingKey(b: Pick<PluginBinding, "sheet" | "row" | "field">): string {
  return `${b.sheet}\t${b.row}\t${b.field}`;
}

export function normalizePlugin(raw: PluginDef, fallback?: { kind?: PluginDef["kind"]; table?: string }): PluginDef {
  const id = String(raw?.id || "").trim();
  const name = String(raw?.name || id).trim();
  const kind = raw?.kind === "exclusive" || raw?.kind === "generic" ? raw.kind : fallback?.kind || "generic";
  const match: PluginMatch = { ...(raw?.match || {}) };
  if (kind === "exclusive" && fallback?.table && !match.table) match.table = fallback.table;
  const params = Array.isArray(raw?.params) ? raw.params.filter((p) => p && p.key) : [];
  return { id, name, kind, match, params };
}

export function pluginMatches(
  plugin: PluginDef,
  sel: { table: string; sheet: string; field: string; type?: string; widget?: string },
): boolean {
  const m = plugin.match || {};
  if (m.table && m.table !== sel.table) return false;
  if (m.sheet && m.sheet !== sel.sheet) return false;
  if (m.field && m.field !== sel.field) return false;
  if (m.type && m.type !== (sel.type || "")) return false;
  if (m.widget && m.widget !== (sel.widget || "")) return false;
  return Boolean(plugin.id);
}

export type CellRef = { table: string; sheet: string; field?: string; row?: string };

export function parseCellRef(ref: string): CellRef | null {
  const raw = String(ref || "").trim();
  const m = raw.match(/^([a-z][a-z0-9_]{0,31})\.([a-z][a-z0-9_]{0,31})(?:!(.+))?$/i);
  if (!m) return null;
  const table = m[1];
  const sheet = m[2];
  const rest = String(m[3] || "").trim();
  if (!rest) return { table, sheet };
  const first = rest.split(":")[0].trim();
  const cell = first.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\[([^\]]+)\]$/);
  if (cell) return { table, sheet, field: cell[1], row: cell[2] };
  const onlyRow = first.match(/^\[([^\]]+)\]$/);
  if (onlyRow) return { table, sheet, row: onlyRow[1] };
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(first)) return { table, sheet, field: first };
  return { table, sheet };
}

export function cellRefText(table: string, sheet: string, field: string, row: string): string {
  return `${table}.${sheet}!${field}[${row}]`;
}

export function selectionToRef(sel: PluginSelection | null): string {
  if (!sel?.tableId || !sel.sheet || !sel.cells.length) return "";
  const a = sel.cells[0];
  const b = sel.cells[sel.cells.length - 1];
  if (!a?.field || !a.id) return "";
  if (sel.cells.length === 1 || (a.field === b.field && a.id === b.id)) {
    return cellRefText(sel.tableId, sel.sheet, a.field, a.id);
  }
  return `${sel.tableId}.${sel.sheet}!${a.field}[${a.id}]:${b.field}[${b.id}]`;
}

export function rowsOfSheet(data: unknown, sheetId: string): Record<string, unknown>[] {
  const part = sheetData(data, sheetId);
  return Array.isArray(part.rows) ? (part.rows as Record<string, unknown>[]) : [];
}

export function getCellValue(data: unknown, sheet: string, rowId: string, field: string): unknown {
  const row = rowsOfSheet(data, sheet).find((item) => String(item.id ?? "").trim() === rowId);
  if (!row || !field) return undefined;
  return row[field];
}

export function setCellValue(
  full: unknown,
  struct: unknown,
  sheetId: string,
  rowId: string,
  field: string,
  value: unknown,
): unknown {
  const part = sheetData(full, sheetId);
  const rows = rowsOfSheet(full, sheetId).map((row) => {
    if (String(row.id ?? "").trim() !== rowId) return row;
    return { ...row, [field]: value };
  });
  return mergeSheetData(full, struct, sheetId, { ...part, rows });
}

function collectArgRefs(args: Record<string, unknown> | undefined): string[] {
  const out: string[] = [];
  for (const value of Object.values(args || {})) {
    if (typeof value !== "string") continue;
    if (parseCellRef(value)) out.push(value);
  }
  return out;
}

function bindingNode(tableId: string, b: PluginBinding): string {
  return cellRefText(tableId, b.sheet, b.field, b.row);
}

export function sortBindings(tableId: string, bindings: PluginBinding[]): { order: PluginBinding[]; cycle: boolean } {
  const nodes = bindings.map((b) => bindingNode(tableId, b));
  const index = new Map(nodes.map((key, i) => [key, i]));
  const indeg = nodes.map(() => 0);
  const edges: number[][] = nodes.map(() => []);
  bindings.forEach((b, i) => {
    for (const ref of collectArgRefs(b.args)) {
      const parsed = parseCellRef(ref);
      if (!parsed?.field || !parsed.row) continue;
      const dep = cellRefText(parsed.table, parsed.sheet, parsed.field, parsed.row);
      const j = index.get(dep);
      if (j == null || j === i) continue;
      edges[j].push(i);
      indeg[i] += 1;
    }
  });
  const queue = indeg.map((n, i) => (n === 0 ? i : -1)).filter((i) => i >= 0);
  const order: PluginBinding[] = [];
  while (queue.length) {
    const i = queue.shift() as number;
    order.push(bindings[i]);
    for (const next of edges[i]) {
      indeg[next] -= 1;
      if (indeg[next] === 0) queue.push(next);
    }
  }
  return { order, cycle: order.length !== bindings.length };
}

type PluginJob =
  | { type: "meta" }
  | {
      type: "compute";
      pluginId: string;
      args: Record<string, unknown>;
      values: Record<string, unknown>;
      row: Record<string, unknown>;
      field: string;
      data: unknown;
      struct: unknown;
    };

function runPluginFrame(scripts: string[], job: PluginJob): Promise<unknown> {
  const injected = scripts
    .filter(Boolean)
    .map((src) => `<script>${src.replace(/<\/script/gi, "<\\/script")}</script>`)
    .join("");
  const html = `<!doctype html><meta charset="utf-8">${injected}<script>
    window.addEventListener("message", function (ev) {
      try {
        var plugins = [].concat(
          (window.BitTablePlugins && window.BitTablePlugins.plugins) || [],
          (window.BitTableTablePlugins && window.BitTableTablePlugins.plugins) || []
        );
        var job = ev.data || {};
        if (job.type === "meta") {
          parent.postMessage({ type: "result", result: plugins.map(function (p) {
            if (!p) return null;
            return { id: p.id, name: p.name, kind: p.kind, match: p.match || {}, params: p.params || [] };
          }).filter(Boolean) }, "*");
          return;
        }
        if (job.type === "compute") {
          var plugin = plugins.find(function (p) { return p && p.id === job.pluginId; });
          if (!plugin || typeof plugin.compute !== "function") throw new Error("未找到插件 " + job.pluginId);
          var values = job.values || {};
          var ctx = {
            args: job.args || {},
            row: job.row,
            field: job.field,
            data: job.data,
            struct: job.struct,
            get: function (ref) {
              var key = String(ref || "");
              if (Object.prototype.hasOwnProperty.call(values, key)) return values[key];
              throw new Error("无法读取引用 " + key);
            }
          };
          parent.postMessage({ type: "result", result: { value: plugin.compute(ctx) } }, "*");
        }
      } catch (err) {
        parent.postMessage({ type: "result", error: String(err && err.message ? err.message : err) }, "*");
      }
    });
    parent.postMessage({ type: "ready" }, "*");
  </script>`;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.display = "none";
    iframe.src = url;
    let settled = false;
    const finish = (ok: boolean, value: unknown) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMsg);
      iframe.remove();
      URL.revokeObjectURL(url);
      if (ok) resolve(value);
      else reject(new Error(String(value || "插件运行失败")));
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow || !ev.data || typeof ev.data !== "object") return;
      if (ev.data.type === "ready") {
        iframe.contentWindow?.postMessage(job, "*");
      } else if (ev.data.type === "result") {
        if (ev.data.error) finish(false, ev.data.error);
        else finish(true, ev.data.result);
      }
    };
    window.addEventListener("message", onMsg);
    document.body.appendChild(iframe);
    window.setTimeout(() => finish(false, "插件运行超时"), 20000);
  });
}

export async function listPluginMeta(genericJs: string, exclusiveJs: string, exclusiveTable?: string): Promise<PluginDef[]> {
  const raw = (await runPluginFrame([genericJs, exclusiveJs], { type: "meta" })) as PluginDef[];
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => {
      const kind = item?.kind === "exclusive" ? "exclusive" : item?.kind === "generic" ? "generic" : exclusiveTable && item?.match?.table === exclusiveTable ? "exclusive" : undefined;
      const fallbackKind = item?.match?.table && exclusiveTable && item.match.table === exclusiveTable ? "exclusive" : kind;
      return normalizePlugin(item, { kind: fallbackKind, table: exclusiveTable });
    })
    .filter((item) => item.id);
}

export async function listExclusiveMeta(exclusiveJs: string, tableId: string): Promise<PluginDef[]> {
  if (!exclusiveJs.trim() || exclusiveJs.includes("plugins: []")) return [];
  const all = await listPluginMeta("", exclusiveJs, tableId);
  return all.map((item) => normalizePlugin(item, { kind: "exclusive", table: tableId }));
}

export async function computePluginValue(
  scripts: string[],
  pluginId: string,
  args: Record<string, unknown>,
  values: Record<string, unknown>,
  row: Record<string, unknown>,
  field: string,
  data: unknown,
  struct: unknown,
): Promise<unknown> {
  const result = (await runPluginFrame(scripts, {
    type: "compute",
    pluginId,
    args,
    values,
    row,
    field,
    data,
    struct,
  })) as { value?: unknown };
  return result?.value;
}

export async function resolveRefValue(
  ref: string,
  current: { tableId: string; data: unknown },
  loadTable: (id: string) => Promise<TablePack | null>,
): Promise<unknown> {
  const parsed = parseCellRef(ref);
  if (!parsed?.field || !parsed.row) throw new Error(`引用无效：${ref}`);
  let pack: TablePack | null = { data: current.data, struct: {} };
  if (parsed.table !== current.tableId) {
    pack = await loadTable(parsed.table);
  }
  if (!pack) throw new Error(`找不到表 ${parsed.table}`);
  return getCellValue(pack.data, parsed.sheet, parsed.row, parsed.field);
}

export async function recomputeBindings(opts: {
  tableId: string;
  data: unknown;
  struct: unknown;
  bindings: PluginBinding[];
  scripts: string[];
  loadTable: (id: string) => Promise<TablePack | null>;
}): Promise<{ data: unknown; error?: string }> {
  const { tableId, struct, bindings, scripts, loadTable } = opts;
  if (!bindings.length) return { data: opts.data };
  const { order, cycle } = sortBindings(tableId, bindings);
  if (cycle) return { data: opts.data, error: "插件绑定存在循环引用" };
  let data = opts.data;
  for (const binding of order) {
    const values: Record<string, unknown> = {};
    try {
      for (const ref of collectArgRefs(binding.args)) {
        values[ref] = await resolveRefValue(ref, { tableId, data }, loadTable);
      }
      const row = rowsOfSheet(data, binding.sheet).find((item) => String(item.id ?? "").trim() === binding.row) || {};
      const value = await computePluginValue(scripts, binding.plugin, binding.args || {}, values, row, binding.field, data, struct);
      data = setCellValue(data, struct, binding.sheet, binding.row, binding.field, value);
    } catch (err) {
      return { data: opts.data, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { data };
}
