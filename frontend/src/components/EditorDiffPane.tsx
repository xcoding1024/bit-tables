import { useEffect, useMemo, useRef, useState } from "react";
import { tablesApi, type TableSnapshot } from "../lib/api";
import { buildEnumsCatalog, buildEnumsPayload, listSheets, parseTableDoc, sliceForSheet } from "../lib/tableHost";
import type { DiffRow, DiffSheet } from "../lib/diff";

type Selection = { row: string; field: string };
type View = { row: number; field: string; sequence: number } | null;

export function EditorDiffPane({ side, tableId, source, revision, sheet, rows, selection, sequence, refresh, onSelect, onClose, peer }: {
  side: "left" | "right"; tableId: string; source: Pick<TableSnapshot, "struct" | "data">; revision: string; sheet: DiffSheet;
  rows: DiffRow[]; selection: Selection | null; sequence: number; refresh: number;
  onSelect: (selection: Selection) => void; onClose: () => void; peer: { current: Partial<Record<"left" | "right", HTMLIFrameElement | null>> };
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [html, setHTML] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(0);
  const [enumSources, setEnumSources] = useState<{ id: string; struct: unknown; data: unknown }[]>([]);
  const [enumError, setEnumError] = useState("");
  const reader = useMemo(() => tablesApi.rendererReader(tableId), [tableId]);
  const assetBase = useMemo(() => `${tablesApi.comparisonAssetBase(tableId)}&revision=${encodeURIComponent(revision)}`, [tableId, revision]);
  const visible = useMemo(() => rows.filter((row) => row[side]).sort((a, b) => (a[side === "left" ? "leftIndex" : "rightIndex"] || 0) - (b[side === "left" ? "leftIndex" : "rightIndex"] || 0)), [rows, side]);
  const pack = useMemo(() => {
    if (!(side === "left" ? sheet.left : sheet.right)) return null;
    const struct = parseTableDoc(source.struct || "{}"), data = parseTableDoc(source.data || "{}");
    const sliced = sliceForSheet(struct, data, sheet.id);
    return { struct: sliced.struct, data: { ...sliced.data as Record<string, unknown>, rows: visible.map((row) => row[side]) },
      enums: buildEnumsPayload(struct, tableId, buildEnumsCatalog([{ id: tableId, struct, data }, ...enumSources])) };
  }, [source, sheet, side, visible, tableId, enumSources]);
  useEffect(() => {
    const controller = new AbortController();
    setEnumSources([]); setEnumError("");
    const struct = parseTableDoc(source.struct || "{}");
    const refs = [...new Set(listSheets(struct).flatMap((sheet) => sheet.fields.map((field) => String((field as { enum?: string } | null)?.enum || "")))
      .filter((ref) => ref.includes(".")).map((ref) => ref.slice(0, ref.indexOf("."))).filter((id) => id !== tableId))];
    void Promise.all(refs.map(async (id) => {
      const source = revision === "local" ? await tablesApi.files(id) : await tablesApi.snapshotReader(id)(revision, controller.signal);
      return { id, struct: parseTableDoc(source.struct || "{}"), data: parseTableDoc(source.data || "{}") };
    })).then((sources) => { if (!controller.signal.aborted) setEnumSources(sources); })
      .catch(() => { if (!controller.signal.aborted) setEnumError("部分枚举无法读取对应版本，显示原始 ID。"); });
    return () => controller.abort();
  }, [source.struct, revision, tableId, refresh]);
  const config = useMemo(() => ({ assetBase,
    rows: visible.map((row) => ({ key: row.key, changes: row.changes, status: row.status, originalIndex: side === "left" ? row.leftIndex : row.rightIndex })),
    columns: ((pack?.struct as { fields?: { key: string }[] } | undefined)?.fields || []).map((field) => ({ key: field.key, changed: Boolean(sheet.columns.find((column) => column.key === field.key)?.changed) })),
  }), [assetBase, visible, side, pack, sheet]);
  const view: View = selection ? { row: visible.findIndex((row) => row.key === selection.row), field: selection.field, sequence } : null;
  const handlers = useRef({ onSelect, onClose });
  handlers.current = { onSelect, onClose };
  useEffect(() => {
    const controller = new AbortController();
    setHTML(""); setError(""); setReady(0);
    if (!pack) return;
    void reader(revision, controller.signal).then(({ html }) => {
      if (!controller.signal.aborted) {
        const origin = window.location.origin;
        const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src ${origin} data: blob:; form-action 'none'; base-uri 'none'`;
        setHTML(html.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}">`));
      }
    }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "加载 editor 失败"); });
    return () => controller.abort();
  // 数据与筛选通过消息更新，不重新编译 editor。
  }, [reader, revision, refresh, Boolean(pack)]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || !event.data) return;
      const message = event.data as { type?: string; row?: string; field?: string; message?: string; x?: number; y?: number };
      if (message.type === "ready") setReady((n) => n + 1);
      if (message.type === "comparisonError") setError(message.message || "editor 渲染失败");
      if (message.type === "comparisonCell" && message.row && message.field) handlers.current.onSelect({ row: message.row, field: message.field });
      if (message.type === "comparisonClose") handlers.current.onClose();
      if (message.type === "comparisonScroll") peer.current[side === "left" ? "right" : "left"]?.contentWindow?.postMessage(message, "*");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [side, peer]);
  useEffect(() => {
    peer.current[side] = frame.current;
    return () => { peer.current[side] = null; };
  }, [html, error, side, peer]);
  useEffect(() => {
    if (ready && pack) frame.current?.contentWindow?.postMessage({ type: "init", tableId, sheetId: sheet.id, ...pack, comparison: config }, "*");
  }, [ready, pack, config, tableId, sheet.id]);
  useEffect(() => {
    if (ready && view && view.row >= 0) frame.current?.contentWindow?.postMessage({ type: "reveal", rowIndex: view.row, field: view.field }, "*");
  }, [ready, pack, view?.row, view?.field, view?.sequence]);
  if (!pack) return <div className="m-auto p-4 text-sm text-muted">该版本没有此分页</div>;
  if (error) return <div role="alert" className="overflow-auto p-4 text-sm text-danger">{error}<div className="mt-2 text-xs text-muted">可切换「原始表格」核对数据。</div></div>;
  if (!html) return <div className="m-auto p-4 text-sm text-muted">正在编译{side === "left" ? "历史" : "本地"} editor…</div>;
  return <>
    {enumError ? <div className="border-b border-line px-3 py-1 text-xs text-muted">{enumError}</div> : null}
    {selection && view && view.row < 0 ? <div className="border-b border-line px-3 py-1 text-xs text-muted">此版本没有所选行</div> : null}
    <iframe ref={frame} sandbox="allow-scripts" title={`${side === "left" ? "历史" : "本地"} editor（只读）`} data-testid={`table-diff-editor-${side}`}
      className="min-h-0 w-full flex-1 border-0" srcDoc={html} />
  </>;
}
