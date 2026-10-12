import { listSheets, mergeSheetData, sheetData } from "./tableHost";
import { bindingKey, cellRefText, isColRow, parseCellRef, recomputeBindings, referenceRange, rowsOfSheet, stringifyBindings,
  type PluginBinding, type TablePack } from "./plugins";
import { excelRefText, findExcelSheet, parseExcelRef } from "./excel";

export type FillCellsRequest = { sheet: string; sourceRows: string[]; targetRows: string[]; fields: string[]; idReadonly?: boolean };
export type FillResult = { data: unknown; bindings: PluginBinding[]; persist: boolean };
const clone = <T,>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const rowId = (row: Record<string, unknown>, index: number) => String(row.id ?? "").trim() || `#${index}`;

export async function fillCells(opts: {
  tableId: string; pack: TablePack; bindings: PluginBinding[]; request: FillCellsRequest;
  scripts: string[]; loadTable: (id: string) => Promise<TablePack | null>;
}): Promise<FillResult> {
  const { tableId, pack, bindings, request, scripts } = opts;
  if (!request || !Array.isArray(request.sourceRows) || !Array.isArray(request.targetRows) || !Array.isArray(request.fields)) throw new Error("填充范围无效");
  const sheet = listSheets(pack.struct).find((item) => item.id === request.sheet);
  if (!sheet || !request.sourceRows.length || !request.fields.length) throw new Error("填充来源无效");
  const rows = rowsOfSheet(pack.data, request.sheet), ids = rows.map(rowId);
  const position = new Map(ids.map((id, index) => [id, index]));
  const fields = sheet.fields as { key: string; type?: string; widget?: string }[];
  if ([...request.sourceRows, ...request.targetRows].some((id) => !position.has(id))
    || request.fields.some((key) => !fields.some((field) => field.key === key))
    || new Set(request.sourceRows).size !== request.sourceRows.length || new Set(request.targetRows).size !== request.targetRows.length
    || new Set(request.fields).size !== request.fields.length || request.targetRows.some((id) => request.sourceRows.includes(id))) throw new Error("填充范围已变化，请重新选择");
  if (!request.targetRows.length) return { data: pack.data, bindings, persist: false };
  const loaded = new Map<string, Promise<TablePack | null>>();
  const load = (id: string) => {
    if (!loaded.has(id)) loaded.set(id, opts.loadTable(id));
    return loaded.get(id)!;
  };
  const sourcePack = async (id: string, excel = false) => {
    const value = id === tableId && !excel ? pack : await load(id);
    if (!value) throw new Error(`找不到来源表 ${id}`);
    return value;
  };
  const sourceBinding = (id: string, field: string) => bindings.find((item) => item.sheet === request.sheet && item.field === field && item.row === id)
    || bindings.find((item) => item.sheet === request.sheet && item.field === field && isColRow(item.row));
  const moveRef = async (text: string, binding: PluginBinding, seed: string, delta: number) => {
    const ref = parseCellRef(text);
    if (!ref?.field) return text;
    const src = await sourcePack(ref.table, Boolean(ref.excelFile));
    const range = referenceRange(text, src);
    const target = binding.targetRange ? referenceRange(binding.targetRange, pack) : undefined;
    const seedIndex = position.get(seed)!;
    const ri = !ref.row || ref.row === "*" ? seedIndex : target ? target.rows.indexOf(seed) : 0;
    const ci = target ? target.fields.indexOf(binding.field) : 0;
    const field = range.fields[range.fields.length === 1 ? 0 : ci];
    const effectiveRow = range.rows[range.rows.length === 1 ? 0 : ri];
    if (!field || (!isColRow(ref.row) && !effectiveRow)) throw new Error("原插件来源与目标范围尺寸不匹配");
    const excel = parseExcelRef(text);
    if (isColRow(ref.row)) {
      if (excel) return excelRefText(excel.table, excel.excelFile, findExcelSheet(src.excel, excel).name, `${field}:${field}`);
      return `${ref.table}.${ref.sheet}!${field}`;
    }
    if (excel) {
      const row = Number(effectiveRow) + delta;
      const name = findExcelSheet(src.excel, excel).name;
      const moved = excelRefText(excel.table, excel.excelFile, name, `${field}${row}`);
      if (row < 1) throw new Error("Excel 来源移动后超出工作表范围");
      referenceRange(moved, src);
      return moved;
    }
    const sourceIds = rowsOfSheet(src.data, ref.sheet).map(rowId);
    const shifted = sourceIds.indexOf(effectiveRow) + delta;
    if (shifted < 0 || shifted >= sourceIds.length) throw new Error("插件来源移动后超出数据范围");
    return cellRefText(ref.table, ref.sheet, field, sourceIds[shifted]);
  };
  const nextRows = clone(rows), changed = new Set<string>(), replacements: PluginBinding[] = [];
  for (let r = 0; r < request.targetRows.length; r++) {
    const id = request.targetRows[r], index = position.get(id)!;
    const seed = request.sourceRows[r % request.sourceRows.length], seedIndex = position.get(seed)!;
    for (const key of request.fields) {
      const field = fields.find((item) => item.key === key)!;
      if (field.widget === "icon" || field.type === "icon" || (key === "id" && request.idReadonly !== false && rows[index].id)) continue;
      changed.add(bindingKey({ sheet: request.sheet, row: id, field: key }));
      const binding = sourceBinding(seed, key);
      if (binding) {
        const args = clone(binding.args || {});
        for (const [name, value] of Object.entries(args)) {
          if (typeof value === "string" && parseCellRef(value)?.field) args[name] = await moveRef(value, binding, seed, index - seedIndex);
        }
        replacements.push({ sheet: request.sheet, row: id, field: key, plugin: binding.plugin, args });
      } else {
        if (Object.prototype.hasOwnProperty.call(rows[seedIndex], key)) nextRows[index][key] = clone(rows[seedIndex][key]);
        else delete nextRows[index][key];
      }
    }
  }
  if (!changed.size) return { data: pack.data, bindings, persist: false };
  const retained: PluginBinding[] = [];
  for (const binding of bindings) {
    const split = binding.sheet === request.sheet && isColRow(binding.row) && request.targetRows.some((id) => changed.has(bindingKey({ sheet: request.sheet, row: id, field: binding.field })));
    if (split) {
      for (const id of ids) {
        if (!changed.has(bindingKey({ ...binding, row: id })) && !bindings.some((other) => other.sheet === binding.sheet && other.field === binding.field && other.row === id)) retained.push({ ...binding, row: id });
      }
    } else if (!changed.has(bindingKey(binding))) retained.push(binding);
  }
  const nextBindings = [...retained, ...replacements];
  const data = mergeSheetData(pack.data, pack.struct, request.sheet, { ...sheetData(pack.data, request.sheet), rows: nextRows });
  const computed = await recomputeBindings({ tableId, data, struct: pack.struct, bindings: nextBindings, scripts, loadTable: load, targets: changed });
  if (computed.error) throw new Error(computed.error);
  return { data: computed.data, bindings: nextBindings, persist: replacements.length > 0 || stringifyBindings(bindings) !== stringifyBindings(nextBindings) };
}
