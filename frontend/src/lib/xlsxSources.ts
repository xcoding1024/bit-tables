import { parseExcelRef, type ExcelWorkbook } from "./excel";
import type { PluginBinding } from "./plugins";

export function xlsxReferences(bindings: PluginBinding[]) {
  return bindings.flatMap((binding) => Object.values(binding.args || {}).flatMap((value) => {
    const ref = typeof value === "string" ? parseExcelRef(value) : null;
    return ref ? [ref] : [];
  }));
}

export function xlsxBindingKey(bindings: PluginBinding[]) {
  return JSON.stringify([...new Set(xlsxReferences(bindings).map((ref) => JSON.stringify([ref.table, ref.excelFile])))].sort());
}

// 本表监测全部工作簿，跨表只监测绑定引用的文件。
export async function xlsxSourceHashes(
  tableId: string,
  bindings: PluginBinding[],
  load: (id: string) => Promise<ExcelWorkbook[]>,
): Promise<string> {
  const refs = xlsxReferences(bindings);
  const tables = [...new Set([tableId, ...refs.map((ref) => ref.table)])].sort();
  const entries = await Promise.all(tables.map(async (id) => {
    const books = await load(id);
    const files = id === tableId
      ? books.map((book) => book.file)
      : [...new Set(refs.filter((ref) => ref.table === id).map((ref) => ref.excelFile))];
    return files.sort().map((file) => {
      const book = books.find((item) => item.file === file);
      return [id, file, book?.md5 || book?.error || "missing"];
    });
  }));
  return JSON.stringify(entries.flat());
}
