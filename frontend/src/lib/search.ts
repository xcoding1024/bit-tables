import type { TreeNode } from "./api";
import { tableDisplayName, type TableSnap } from "./deps";
import { listSheets, sheetData } from "./tableHost";

export type SearchScope = "file" | "sheet" | "all";

export type FileHit = {
  id: string;
  name: string;
  path: string;
};

export function listFileHits(tree: TreeNode[]): FileHit[] {
  const out: FileHit[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "table" && node.table) {
        const id = node.table.id;
        out.push({
          id,
          name: node.table.name?.trim() || id,
          path: node.table.path || node.path,
        });
      }
      if (node.children?.length) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

export function filterFileHits(files: FileHit[], query: string): FileHit[] {
  const q = norm(query);
  if (!q) return files;
  return files.filter((item) => [item.id, item.name, item.path].some((part) => norm(part).includes(q)));
}

export type ContentHit = {
  tableId: string;
  tableName: string;
  sheetId: string;
  sheetName: string;
  rowIndex: number;
  field: string;
  label: string;
  value: string;
};

const HIT_LIMIT = 80;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

export function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(cellText).filter(Boolean).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function fieldLabel(fields: unknown[], key: string): string {
  for (const item of fields) {
    const rec = asRecord(item);
    if (rec && String(rec.key || "") === key) {
      return String(rec.label || rec.key || key);
    }
  }
  return key;
}

function tableMatchesFile(node: TreeNode, q: string): boolean {
  const item = node.table;
  const parts = [
    node.name,
    node.path,
    item?.id,
    item?.name,
    item?.path,
  ];
  return parts.some((part) => part && norm(String(part)).includes(q));
}

export function filterTreeByFile(tree: TreeNode[], query: string): TreeNode[] {
  const q = norm(query);
  if (!q) return tree;

  const walk = (nodes: TreeNode[]): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const node of nodes) {
      if (node.kind === "dir") {
        const selfHit = norm(node.name).includes(q) || norm(node.path).includes(q);
        const children = walk(node.children || []);
        if (selfHit) {
          out.push(node);
        } else if (children.length) {
          out.push({ ...node, children });
        }
        continue;
      }
      if (tableMatchesFile(node, q)) out.push(node);
    }
    return out;
  };

  return walk(tree);
}

function searchSheetRows(
  table: TableSnap,
  sheetId: string,
  sheetName: string,
  fields: unknown[],
  q: string,
  hits: ContentHit[],
): void {
  const rows = sheetData(table.data, sheetId).rows;
  if (!Array.isArray(rows)) return;
  for (let i = 0; i < rows.length; i++) {
    const rec = asRecord(rows[i]) || {};
    const keys = Object.keys(rec);
    if (keys.length === 0) {
      const text = cellText(rows[i]);
      if (norm(text).includes(q)) {
        hits.push({
          tableId: table.id,
          tableName: tableDisplayName(table.struct, table.id),
          sheetId,
          sheetName,
          rowIndex: i,
          field: "",
          label: `行 ${i + 1}`,
          value: text,
        });
      }
      if (hits.length >= HIT_LIMIT) return;
      continue;
    }
    for (const key of keys) {
      const value = cellText(rec[key]);
      const label = fieldLabel(fields, key);
      if (norm(key).includes(q) || norm(label).includes(q) || norm(value).includes(q)) {
        hits.push({
          tableId: table.id,
          tableName: tableDisplayName(table.struct, table.id),
          sheetId,
          sheetName,
          rowIndex: i,
          field: key,
          label,
          value,
        });
        if (hits.length >= HIT_LIMIT) return;
      }
    }
    if (hits.length >= HIT_LIMIT) return;
  }
}

export function searchTableContent(
  tables: TableSnap[],
  query: string,
  opts?: { tableId?: string; sheetId?: string },
): ContentHit[] {
  const q = norm(query);
  if (!q) return [];
  const hits: ContentHit[] = [];
  for (const table of tables) {
    const id = String(table.id || "").trim();
    if (!id) continue;
    if (opts?.tableId && id !== opts.tableId) continue;
    const sheets = listSheets(table.struct);
    for (const sheet of sheets) {
      if (opts?.sheetId && sheet.id !== opts.sheetId) continue;
      searchSheetRows(table, sheet.id, sheet.name, sheet.fields, q, hits);
      if (hits.length >= HIT_LIMIT) return hits;
    }
  }
  return hits;
}
