import { dump, load } from "js-yaml";

export type TableCheckError = { path: string; message: string };

export type TableCheckResult = {
  ok: boolean;
  errors: TableCheckError[];
};

export function unquoteYAML(value: string): string {
  const t = value.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

export type DocsKind = "struct" | "check" | "export";

function docsHeading(kind: DocsKind): string {
  if (kind === "check") return "## 检查规则";
  if (kind === "export") return "## 导出规则";
  return "## 结构";
}

export function docsSection(text: string, kind: DocsKind): string {
  const src = (text || "").replace(/\r\n/g, "\n");
  const heading = docsHeading(kind);
  const start = src.indexOf(heading);
  if (start < 0) return "";
  let body = src.slice(start + heading.length);
  const cut = body.indexOf("\n## ");
  if (cut >= 0) body = body.slice(0, cut);
  return body.trim();
}

export type SheetInfo = {
  id: string;
  name: string;
  fields: unknown[];
  view?: "table" | "card";
};

const SHEET_ID = /^[a-z][a-z0-9_]{0,31}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function parseTableDoc(text: string): unknown {
  const raw = (text || "").trim();
  if (!raw) return { rows: [] };
  if (raw.startsWith("{") || raw.startsWith("[")) {
    return JSON.parse(raw);
  }
  try {
    const parsed = load(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    /* fall through to legacy rows parser */
  }
  const rows: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;
  for (const line of raw.split(/\r?\n/)) {
    if (/^\s*-\s+/.test(line)) {
      if (current) rows.push(current);
      current = {};
      const kv = line.match(/^\s*-\s+(\w+)\s*:\s*(.*)$/);
      if (kv) current[kv[1]] = unquoteYAML(kv[2]);
      continue;
    }
    const kv = line.match(/^\s+(\w+)\s*:\s*(.*)$/);
    if (kv && current) {
      current[kv[1]] = unquoteYAML(kv[2]);
    }
  }
  if (current) rows.push(current);
  return { rows };
}

export function stringifyTableDoc(data: unknown): string {
  if (typeof data === "string") return data;
  return dump(data ?? { rows: [] }, { lineWidth: 120, noRefs: true });
}

export function listSheets(struct: unknown): SheetInfo[] {
  const rec = asRecord(struct);
  const raw = rec && Array.isArray(rec.sheets) ? rec.sheets : [];
  const out: SheetInfo[] = [];
  for (const item of raw) {
    const sheet = asRecord(item);
    const id = String(sheet?.id || "").trim();
    if (!SHEET_ID.test(id)) continue;
    const viewRaw = String(sheet?.view || "").trim();
    const view = viewRaw === "card" || viewRaw === "table" ? viewRaw : undefined;
    out.push({
      id,
      name: String(sheet?.name || id),
      fields: Array.isArray(sheet?.fields) ? sheet.fields : [],
      view,
    });
  }
  if (out.length) return out;
  return [
    {
      id: "main",
      name: String(rec?.name || "main"),
      fields: Array.isArray(rec?.fields) ? rec.fields : [],
    },
  ];
}

export function defaultSheetId(struct: unknown): string {
  const sheets = listSheets(struct);
  const rec = asRecord(struct);
  const preferred = String(rec?.default_sheet || "").trim();
  if (preferred && sheets.some((item) => item.id === preferred)) return preferred;
  return sheets[0]?.id || "main";
}

export function hasExplicitSheets(struct: unknown): boolean {
  const rec = asRecord(struct);
  return Boolean(rec && Array.isArray(rec.sheets) && rec.sheets.length);
}

export function sheetData(data: unknown, sheetId: string): Record<string, unknown> {
  const rec = asRecord(data) || {};
  const sheets = asRecord(rec.sheets);
  const named = sheets ? asRecord(sheets[sheetId]) : null;
  if (named) {
    return { ...named, rows: Array.isArray(named.rows) ? named.rows : [] };
  }
  if (Array.isArray(rec.rows)) {
    return { rows: rec.rows };
  }
  return { rows: [] };
}

export function sliceForSheet(struct: unknown, data: unknown, sheetId: string): { struct: unknown; data: unknown } {
  const sheets = listSheets(struct);
  const sheet = sheets.find((item) => item.id === sheetId) || sheets[0];
  const rec = asRecord(struct) || {};
  const view = sheet?.view || "table";
  const slicedStruct = {
    ...rec,
    name: sheet?.name || rec.name,
    fields: sheet?.fields || [],
    view,
  };
  const part = sheetData(data, sheet?.id || sheetId);
  const dataRec = asRecord(data) || {};
  return {
    struct: slicedStruct,
    data: { ...dataRec, ...part, rows: part.rows || [] },
  };
}

export function mergeSheetData(full: unknown, struct: unknown, sheetId: string, partial: unknown): unknown {
  const nextPartial = asRecord(partial) || { rows: [] };
  const rows = Array.isArray(nextPartial.rows) ? nextPartial.rows : [];
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(nextPartial)) {
    if (key !== "rows" && key !== "sheets") extras[key] = value;
  }
  if (!hasExplicitSheets(struct)) {
    const rec = asRecord(full) || {};
    return { ...rec, ...extras, rows };
  }
  const rec = asRecord(full) || {};
  const sheets = { ...(asRecord(rec.sheets) || {}) };
  const fallbackId = defaultSheetId(struct);
  if (!asRecord(sheets[fallbackId]) && Array.isArray(rec.rows)) {
    sheets[fallbackId] = { rows: rec.rows };
  }
  const prev = asRecord(sheets[sheetId]) || {};
  sheets[sheetId] = { ...prev, ...extras, rows };
  const { rows: _omit, ...rest } = rec;
  return { ...rest, sheets };
}

export type EnumRef = { tableId: string; sheetId: string };

export type EnumEntry = { id: string; name: string };

export type EnumCatalogItem = {
  key: string;
  tableId: string;
  sheetId: string;
  sheetName: string;
  entries: EnumEntry[];
};

export type EnumsPayload = Record<string, EnumEntry[]>;

export function enumEntryLabel(row: unknown): string {
  const rec = asRecord(row) || {};
  const id = String(rec.id ?? "").trim();
  const name = String(rec.name ?? "").trim();
  if (name) return name;
  const label = String(rec.label ?? "").trim();
  if (label) return label;
  return id;
}

export function parseEnumRef(ref: string, currentTableId: string): EnumRef | null {
  const raw = String(ref || "").trim();
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot < 0) {
    if (!SHEET_ID.test(raw) || !SHEET_ID.test(currentTableId)) return null;
    return { tableId: currentTableId, sheetId: raw };
  }
  const tableId = raw.slice(0, dot).trim();
  const sheetId = raw.slice(dot + 1).trim();
  if (!SHEET_ID.test(tableId) || !SHEET_ID.test(sheetId)) return null;
  return { tableId, sheetId };
}

export function listEnumSheets(struct: unknown): SheetInfo[] {
  const rec = asRecord(struct);
  const raw = rec && Array.isArray(rec.sheets) ? rec.sheets : [];
  const out: SheetInfo[] = [];
  for (const item of raw) {
    const sheet = asRecord(item);
    if (!sheet || String(sheet.kind || "").trim() !== "enum") continue;
    const id = String(sheet.id || "").trim();
    if (!SHEET_ID.test(id)) continue;
    out.push({
      id,
      name: String(sheet.name || id),
      fields: Array.isArray(sheet.fields) ? sheet.fields : [],
    });
  }
  return out;
}

export function enumRowsFromData(data: unknown, sheetId: string): EnumEntry[] {
  const part = sheetData(data, sheetId);
  const rows = Array.isArray(part.rows) ? part.rows : [];
  const out: EnumEntry[] = [];
  for (const row of rows) {
    const rec = asRecord(row);
    const id = String(rec?.id ?? "").trim();
    if (!id) continue;
    out.push({ id, name: enumEntryLabel(row) });
  }
  return out;
}

export function collectEnumRefs(struct: unknown): string[] {
  const refs = new Set<string>();
  const rec = asRecord(struct);
  const sheets = rec && Array.isArray(rec.sheets) ? rec.sheets : [];
  const fieldLists: unknown[][] = [];
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

export function buildEnumsCatalog(
  tables: { id: string; struct: unknown; data: unknown }[],
): EnumCatalogItem[] {
  const out: EnumCatalogItem[] = [];
  for (const table of tables) {
    const tableId = String(table.id || "").trim();
    if (!SHEET_ID.test(tableId)) continue;
    for (const sheet of listEnumSheets(table.struct)) {
      out.push({
        key: `${tableId}.${sheet.id}`,
        tableId,
        sheetId: sheet.id,
        sheetName: sheet.name,
        entries: enumRowsFromData(table.data, sheet.id),
      });
    }
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

export function findCatalogEntries(
  catalog: EnumCatalogItem[],
  ref: string,
  currentTableId: string,
): EnumEntry[] {
  const parsed = parseEnumRef(ref, currentTableId);
  if (!parsed) return [];
  const key = `${parsed.tableId}.${parsed.sheetId}`;
  const hit = catalog.find((item) => item.key === key);
  return hit ? hit.entries : [];
}

export function buildEnumsPayload(
  struct: unknown,
  currentTableId: string,
  catalog: EnumCatalogItem[],
): EnumsPayload {
  const payload: EnumsPayload = {};
  for (const ref of collectEnumRefs(struct)) {
    const entries = findCatalogEntries(catalog, ref, currentTableId);
    payload[ref] = entries;
    const parsed = parseEnumRef(ref, currentTableId);
    if (parsed) {
      const longKey = `${parsed.tableId}.${parsed.sheetId}`;
      payload[longKey] = entries;
      if (parsed.tableId === currentTableId) {
        payload[parsed.sheetId] = entries;
      }
    }
  }
  return payload;
}

export type TableExportFile = { name: string; content: string };

export type TableExportResult = {
  ok: boolean;
  client: TableExportFile[];
  server: TableExportFile[];
  error?: string;
};

function asExportFileList(raw: unknown): TableExportFile[] {
  if (!Array.isArray(raw)) return [];
  const out: TableExportFile[] = [];
  for (const item of raw) {
    const file = asRecord(item);
    const name = String(file?.name ?? "").trim();
    if (!name) continue;
    out.push({ name, content: String(file?.content ?? "") });
  }
  return out;
}

export function parseExportSides(raw: unknown): { client: TableExportFile[]; server: TableExportFile[] } {
  const rec = asRecord(raw);
  const client = asExportFileList(rec?.client);
  const server = asExportFileList(rec?.server);
  if (client.length || server.length) return { client, server };
  const files = asExportFileList(rec?.files);
  if (files.length) return { client: files, server: files };
  return { client: [], server: [] };
}

export function runTableExporter(
  exportJs: string,
  data: unknown,
  struct: unknown,
): Promise<TableExportResult> {
  if (!exportJs.trim()) {
    return Promise.resolve({ ok: false, client: [], server: [], error: "无导出脚本" });
  }
  return new Promise((resolve) => {
    const html = `<!doctype html><meta charset="utf-8"><script>${exportJs.replace(/<\/script/gi, "<\\/script")}</script><script>
      window.addEventListener("message", function (ev) {
        try {
          var exporter = window.BitTableExporter;
          var result = exporter && typeof exporter.export === "function"
            ? exporter.export(ev.data.data, ev.data.struct)
            : null;
          parent.postMessage({ type: "result", result: result }, "*");
        } catch (err) {
          parent.postMessage({ type: "result", error: String(err) }, "*");
        }
      });
      parent.postMessage({ type: "ready" }, "*");
    </script>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.display = "none";
    iframe.src = url;
    let settled = false;
    const finish = (result: TableExportResult) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMsg);
      iframe.remove();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow || !ev.data || typeof ev.data !== "object") return;
      if (ev.data.type === "ready") {
        iframe.contentWindow?.postMessage({ data, struct }, "*");
      } else if (ev.data.type === "result") {
        if (ev.data.error) {
          finish({ ok: false, client: [], server: [], error: String(ev.data.error) });
          return;
        }
        if (!ev.data.result) {
          finish({ ok: false, client: [], server: [], error: "未定义 BitTableExporter.export" });
          return;
        }
        const sides = parseExportSides(ev.data.result);
        finish({ ok: true, client: sides.client, server: sides.server });
      }
    };
    window.addEventListener("message", onMsg);
    document.body.appendChild(iframe);
    window.setTimeout(() => finish({ ok: false, client: [], server: [], error: "导出超时" }), 8000);
  });
}

export function runTableChecker(
  checkerJs: string,
  data: unknown,
  struct: unknown,
  enums?: EnumsPayload,
): Promise<TableCheckResult> {
  if (!checkerJs.trim()) {
    return Promise.resolve({ ok: true, errors: [] });
  }
  return new Promise((resolve) => {
    const html = `<!doctype html><meta charset="utf-8"><script>${checkerJs.replace(/<\/script/gi, "<\\/script")}</script><script>
      window.addEventListener("message", function (ev) {
        try {
          var checker = window.BitTableChecker;
          var result = checker && typeof checker.check === "function"
            ? checker.check(ev.data.data, ev.data.struct, ev.data.enums)
            : { ok: true, errors: [] };
          parent.postMessage({ type: "result", result: result }, "*");
        } catch (err) {
          parent.postMessage({ type: "result", result: { ok: false, errors: [{ path: "", message: String(err) }] } }, "*");
        }
      });
      parent.postMessage({ type: "ready" }, "*");
    </script>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.display = "none";
    iframe.src = url;
    const finish = (result: TableCheckResult) => {
      window.removeEventListener("message", onMsg);
      iframe.remove();
      URL.revokeObjectURL(url);
      resolve({
        ok: Boolean(result?.ok),
        errors: Array.isArray(result?.errors) ? result.errors : [],
      });
    };
    const onMsg = (ev: MessageEvent) => {
      if (ev.source !== iframe.contentWindow || !ev.data || typeof ev.data !== "object") return;
      if (ev.data.type === "ready") {
        iframe.contentWindow?.postMessage({ data, struct, enums: enums || {} }, "*");
      } else if (ev.data.type === "result") {
        finish(ev.data.result as TableCheckResult);
      }
    };
    window.addEventListener("message", onMsg);
    document.body.appendChild(iframe);
    window.setTimeout(() => finish({ ok: false, errors: [{ path: "", message: "检查器超时" }] }), 4000);
  });
}
