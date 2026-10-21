import { JSON_SCHEMA, load } from "js-yaml";

export type LocalTableSnapshot = { struct: string; data: string; dirty: boolean };
export type DiffStatus = "same" | "added" | "removed" | "modified";
export type DiffColumn = { key: string; leftLabel: string; rightLabel: string; left: boolean; right: boolean; changed: boolean };
export type DiffRow = { key: string; left?: Record<string, unknown>; right?: Record<string, unknown>; leftIndex?: number; rightIndex?: number; status: DiffStatus; changes: string[] };
export type DiffSheet = { id: string; name: string; left: boolean; right: boolean; columns: DiffColumn[]; rows: DiffRow[]; positional: boolean; changes: number };
type Sheet = { name: string; fields: Map<string, Record<string, unknown>>; rows: Record<string, unknown>[] };

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const owns = (value: Record<string, unknown> | undefined, key: string) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));

export function valueText(value: unknown): string {
  if (value === undefined) return "（缺失）";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function equalValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => equalValue(value, right[index]));
  if (typeof left === "object") {
    const a = record(left), b = record(right), keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => owns(b, key) && equalValue(a[key], b[key]));
  }
  return false;
}

function document(text: string | null, label: string): Record<string, unknown> {
  if (text === null || !text.trim()) return {};
  try {
    const value: unknown = load(text, { schema: JSON_SCHEMA });
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("文档需要是对象");
    const ancestors = new Set<object>();
    const validate = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      if (ancestors.has(node)) throw new Error("不支持循环引用");
      ancestors.add(node);
      Object.values(node).forEach(validate);
      ancestors.delete(node);
    };
    validate(value);
    return value as Record<string, unknown>;
  } catch (error) {
    throw new Error(`${label}解析失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function sheets(structText: string | null, dataText: string | null, side: string): Map<string, Sheet> {
  if (structText === null && dataText === null) return new Map();
  const struct = document(structText, `${side}结构`), data = document(dataText, `${side}数据`);
  if (owns(data, "rows") && !Array.isArray(data.rows)) throw new Error(`${side}数据的 rows 需要是数组`);
  if (owns(data, "sheets") && (!data.sheets || typeof data.sheets !== "object" || Array.isArray(data.sheets))) throw new Error(`${side}数据的 sheets 需要是对象`);
  if (dataText && Object.keys(data).length && !owns(data, "rows") && !owns(data, "sheets")) throw new Error(`${side}数据没有可识别的 rows 或 sheets`);
  const definitions = Array.isArray(struct.sheets) ? struct.sheets.map(record) : [];
  const dataSheets = record(data.sheets);
  const ids = [...new Set([...definitions.map((sheet) => String(sheet.id || "")).filter(Boolean), ...Object.keys(dataSheets)])];
  if (!ids.length) ids.push("main");
  const preferred = String(struct.default_sheet || ids[0]);
  return new Map(ids.map((id) => {
    const definition = definitions.find((sheet) => String(sheet.id) === id) || (id === "main" ? struct : {});
    const fields = Array.isArray(definition.fields) ? definition.fields.map(record) : [];
    const pack = record(dataSheets[id]);
    if (owns(pack, "rows") && !Array.isArray(pack.rows)) throw new Error(`${side}分页 ${id} 的 rows 需要是数组`);
    const rawRows = Array.isArray(pack.rows) ? pack.rows : id === preferred && Array.isArray(data.rows) ? data.rows : [];
    if (rawRows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new Error(`${side}分页 ${id} 的行需要是对象`);
    return [id, { name: String(definition.name || id), fields: new Map(fields.filter((field) => field.key).map((field) => [String(field.key), field])), rows: rawRows as Record<string, unknown>[] }];
  }));
}

const rowID = (row: Record<string, unknown>) => row.id === null || row.id === undefined ? "" : String(row.id).trim();
const validIDs = (rows: Record<string, unknown>[]) => rows.every((row) => rowID(row) && ["string", "number"].includes(typeof row.id)) && new Set(rows.map(rowID)).size === rows.length;

export function compareTables(left: { struct: string | null; data: string | null }, right: { struct: string | null; data: string | null }): DiffSheet[] {
  const a = sheets(left.struct, left.data, "历史"), b = sheets(right.struct, right.data, "本地");
  const ids = [...new Set([...b.keys(), ...a.keys()])];
  return ids.map((id) => {
    const old = a.get(id), next = b.get(id), oldRows = old?.rows || [], nextRows = next?.rows || [];
    const keys = [...new Set([...(next?.fields.keys() || []), ...(old?.fields.keys() || []), ...nextRows.flatMap(Object.keys), ...oldRows.flatMap(Object.keys)])];
    const columns = keys.map((key) => {
      const l = old?.fields.get(key), r = next?.fields.get(key);
      const left = Boolean(l || oldRows.some((row) => owns(row, key))), right = Boolean(r || nextRows.some((row) => owns(row, key)));
      return { key, leftLabel: String(l?.label || key), rightLabel: String(r?.label || key), left, right, changed: left !== right || !equalValue(l, r) };
    });
    const positional = !validIDs(oldRows) || !validIDs(nextRows);
    const oldIndex = new Map(oldRows.map((row, index) => [positional ? `#${index}` : rowID(row), index]));
    const nextIndex = new Map(nextRows.map((row, index) => [positional ? `#${index}` : rowID(row), index]));
    // 以本地顺序为主；删除行放在历史中下一条仍存在的行之前。
    const before = new Map<string, string[]>();
    const deletedAtEnd: string[] = [];
    let anchor: string | undefined;
    for (let i = oldRows.length - 1; i >= 0; i--) {
      const key = positional ? `#${i}` : rowID(oldRows[i]);
      if (nextIndex.has(key)) anchor = key;
      else if (anchor) before.set(anchor, [key, ...(before.get(anchor) || [])]);
      else deletedAtEnd.unshift(key);
    }
    const order = [...nextIndex.keys()].flatMap((key) => [...(before.get(key) || []), key]).concat(deletedAtEnd);
    const rows: DiffRow[] = order.map((key) => {
      const li = oldIndex.get(key), ri = nextIndex.get(key), left = li === undefined ? undefined : oldRows[li], right = ri === undefined ? undefined : nextRows[ri];
      const changes = columns.filter(({ key }) => owns(left, key) !== owns(right, key) || !equalValue(left?.[key], right?.[key])).map((column) => column.key);
      return { key, left, right, leftIndex: li, rightIndex: ri, changes, status: !left ? "added" : !right ? "removed" : changes.length ? "modified" : "same" };
    });
    return { id, name: next?.name || old?.name || id, left: Boolean(old), right: Boolean(next), columns, rows, positional,
      changes: rows.filter((row) => row.status !== "same").length + columns.filter((column) => column.changed).length + Number(Boolean(old) !== Boolean(next)) };
  });
}

export function filterDiffRows(rows: DiffRow[], filter: "all" | "changed" | "same") {
  return rows.filter((row) => filter === "all" || (filter === "same" ? row.status === "same" : row.status !== "same"));
}
