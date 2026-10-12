export type ExcelCell = { text: string; value: string | number | boolean | null; error?: string };
export type ExcelSheet = { name: string; rows: number; columns: number; cells: Record<string, ExcelCell>; merges: string[]; error?: string };
export type ExcelWorkbook = { file: string; sheets: ExcelSheet[]; error?: string };
export type ExcelRef = { table: string; sheet: string; excelFile: string; field: string; row?: string; endField?: string; endRow?: string };

function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function excelSheetId(file: string, sheet: string) { return `xlsx:${encode(file)}/${encode(sheet)}`; }
export function isExcelSheet(id?: string) { return Boolean(id?.startsWith("xlsx:")); }
export function excelRefText(table: string, file: string, sheet: string, range: string) {
  return `xlsx://${encode(table)}/${encode(file)}/${encode(sheet)}!${range}`;
}
export function columnName(index: number): string {
  let result = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result;
  return result;
}
export function columnIndex(name: string) { return [...name.toUpperCase()].reduce((n, char) => n * 26 + char.charCodeAt(0) - 64, 0); }

export function parseExcelRef(text: string): ExcelRef | null {
  const match = text.match(/^xlsx:\/\/([^/]+)\/([^/]+)\/([^!]+)!([A-Z]+)([1-9]\d*)?(?::([A-Z]+)([1-9]\d*)?)?$/i);
  if (!match) return null;
  try {
    const [, table, file, name, field, row, lastField, lastRow] = match;
    if (Boolean(row) !== Boolean(lastRow) && lastField) return null;
    if (!row && !lastField) return null;
    if (columnIndex(field) > 16384 || (lastField && columnIndex(lastField) > 16384)
      || Number(row || 1) > 1048576 || Number(lastRow || 1) > 1048576) return null;
    const decodedTable = decodeURIComponent(table), decodedFile = decodeURIComponent(file), decodedName = decodeURIComponent(name);
    if (!/^[a-z][a-z0-9_]{0,31}(?:\/[a-z][a-z0-9_]{0,31})*$/.test(decodedTable)
      || /[/\\]/.test(decodedFile) || !/\.xlsx$/i.test(decodedFile) || !decodedName) return null;
    return { table: decodedTable, sheet: excelSheetId(decodedFile, decodedName), excelFile: decodedFile,
      field: field.toUpperCase(), row, endField: lastField?.toUpperCase(), endRow: lastRow };
  } catch { return null; }
}

export function findExcelSheet(books: ExcelWorkbook[] | undefined, ref: Pick<ExcelRef, "sheet" | "excelFile">): ExcelSheet {
  const book = books?.find((item) => item.file === ref.excelFile);
  if (!book) throw new Error(`找不到 Excel 文件：${ref.excelFile}`);
  if (book.error) throw new Error(book.error);
  const sheet = book.sheets.find((item) => excelSheetId(book.file, item.name) === ref.sheet);
  if (!sheet) throw new Error(`找不到 Excel 工作表：${ref.sheet}`);
  if (sheet.error) throw new Error(sheet.error);
  return sheet;
}

export function excelRange(ref: ExcelRef, sheet: ExcelSheet): { fields: string[]; rows: string[] } {
  const c0 = Math.min(columnIndex(ref.field), columnIndex(ref.endField || ref.field));
  const c1 = Math.max(columnIndex(ref.field), columnIndex(ref.endField || ref.field));
  const r0 = Math.min(Number(ref.row || 1), Number(ref.endRow || ref.row || sheet.rows));
  const r1 = Math.max(Number(ref.row || 1), Number(ref.endRow || ref.row || sheet.rows));
  if (c1 > sheet.columns || r1 > sheet.rows) throw new Error("Excel 引用超出工作表内容范围");
  return { fields: Array.from({ length: c1 - c0 + 1 }, (_, i) => columnName(c0 + i)),
    rows: Array.from({ length: r1 - r0 + 1 }, (_, i) => String(r0 + i)) };
}

export function excelValue(sheet: ExcelSheet, field: string, row: string): ExcelCell["value"] {
  const cell = sheet.cells[`${field}${row}`];
  if (cell?.error) throw new Error(`${sheet.name}!${field}${row}：${cell.error}`);
  return cell?.value ?? null;
}
