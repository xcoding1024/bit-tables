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
    out.push({
      id,
      name: String(sheet?.name || id),
      fields: Array.isArray(sheet?.fields) ? sheet.fields : [],
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
  const slicedStruct = { ...rec, fields: sheet?.fields || [] };
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

export function runTableChecker(checkerJs: string, data: unknown, struct: unknown): Promise<TableCheckResult> {
  if (!checkerJs.trim()) {
    return Promise.resolve({ ok: true, errors: [] });
  }
  return new Promise((resolve) => {
    const html = `<!doctype html><meta charset="utf-8"><script>${checkerJs.replace(/<\/script/gi, "<\\/script")}</script><script>
      window.addEventListener("message", function (ev) {
        try {
          var fn = window.BitTableChecker && window.BitTableChecker.check;
          var result = fn ? fn(ev.data.data, ev.data.struct) : { ok: true, errors: [] };
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
        iframe.contentWindow?.postMessage({ data, struct }, "*");
      } else if (ev.data.type === "result") {
        finish(ev.data.result as TableCheckResult);
      }
    };
    window.addEventListener("message", onMsg);
    document.body.appendChild(iframe);
    window.setTimeout(() => finish({ ok: false, errors: [{ path: "", message: "检查器超时" }] }), 4000);
  });
}
