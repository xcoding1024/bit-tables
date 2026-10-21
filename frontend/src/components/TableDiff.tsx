import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowUp, RefreshCw, X } from "lucide-react";
import { Btn } from "./ui";
import { EditorDiffPane } from "./EditorDiffPane";
import type { TableHistory, TableSnapshot } from "../lib/api";
import { compareTables, filterDiffRows, owns, valueText, type DiffRow, type DiffSheet, type LocalTableSnapshot } from "../lib/diff";

const ROW = 30, COL = 168, GUTTER = 54, HEADER = 48;
type Selection = { row: string; field: string };
type Scroll = { top: number; left: number };
const tone = { same: "", added: "bg-green-950/40 text-green-300", removed: "bg-red-950/40 text-red-300", modified: "bg-amber-950/40 text-amber-200" };

function DiffGrid({ side, sheet, rows, selection, onSelect, scroll, onScroll }: {
  side: "left" | "right"; sheet: DiffSheet; rows: DiffRow[]; selection: Selection | null; onSelect: (selection: Selection) => void;
  scroll: Scroll; onScroll: (scroll: Scroll) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 700, height: 500 });
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const update = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(update); observer.observe(node); update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    if (Math.abs(node.scrollTop - scroll.top) > 1) node.scrollTop = scroll.top;
    if (Math.abs(node.scrollLeft - scroll.left) > 1) node.scrollLeft = scroll.left;
  }, [scroll]);
  const r0 = Math.max(0, Math.floor(scroll.top / ROW) - 2), r1 = Math.min(rows.length, Math.ceil((scroll.top + size.height) / ROW) + 2);
  const c0 = Math.max(0, Math.floor(scroll.left / COL) - 1), c1 = Math.min(sheet.columns.length, Math.ceil((scroll.left + size.width) / COL) + 1);
  const columns = sheet.columns.slice(c0, c1);
  return <div ref={root} data-testid={`table-diff-grid-${side}`} role="grid" aria-label={side === "left" ? "历史版本" : "本地版本"} aria-readonly="true"
    className="relative min-h-0 min-w-0 flex-1 overflow-auto outline-none" tabIndex={0}
    onScroll={(event) => {
      const next = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft };
      if (Math.abs(next.top - scroll.top) > 1 || Math.abs(next.left - scroll.left) > 1) onScroll(next);
    }}>
    <div className="relative" style={{ width: Math.max(size.width, GUTTER + sheet.columns.length * COL), height: Math.max(size.height, HEADER + rows.length * ROW) }}>
      {rows.slice(r0, r1).map((row, offset) => {
        const index = r0 + offset, data = row[side], original = side === "left" ? row.leftIndex : row.rightIndex;
        return <div key={row.key}>
          <div className={`absolute z-10 flex items-center justify-center border-b border-r border-line bg-elevated text-xs text-muted ${row.status !== "same" ? tone[row.status] : ""}`}
            style={{ left: scroll.left, top: HEADER + index * ROW, width: GUTTER, height: ROW }} title={`行 ID：${row.key}`}>
            {original === undefined ? "—" : original + 1}
          </div>
          {columns.map((column, offset) => {
            const changed = row.changes.includes(column.key), selected = selection?.row === row.key && selection.field === column.key;
            const present = owns(data, column.key);
            return <button key={column.key} type="button" role="gridcell" aria-readonly="true" aria-selected={selected}
              data-testid={`table-diff-cell-${side}-${row.key}-${column.key}`} data-diff-status={changed ? row.status : "same"}
              className={`absolute overflow-hidden whitespace-nowrap border-b border-r border-line px-2 text-left text-xs ${changed ? tone[row.status] : "text-ink"} ${selected ? "z-10 ring-2 ring-inset ring-accent" : ""}`}
              style={{ top: HEADER + index * ROW, left: GUTTER + (c0 + offset) * COL, width: COL, height: ROW }}
              title={present ? valueText(data?.[column.key]) : "（缺失）"} onClick={() => onSelect({ row: row.key, field: column.key })}>
              {present ? valueText(data?.[column.key]) : <span className="text-muted">—</span>}
            </button>;
          })}
        </div>;
      })}
      {columns.map((column, offset) => <div key={column.key} role="columnheader" data-testid={`table-diff-column-${side}-${column.key}`}
        className={`absolute z-20 overflow-hidden border-b border-r border-line bg-elevated px-2 py-1 text-xs ${column.changed ? "text-amber-200" : "text-ink"}`}
        style={{ left: GUTTER + (c0 + offset) * COL, top: scroll.top, width: COL, height: HEADER }} title={column.key}>
        {column[side] ? <><div className="truncate">{side === "left" ? column.leftLabel : column.rightLabel}</div><div className="truncate text-[10px] text-muted">{column.key}</div></> : <span className="text-muted">—</span>}
      </div>)}
      <div className="absolute z-30 flex items-center justify-center border-b border-r border-line bg-elevated text-xs text-muted"
        style={{ left: scroll.left, top: scroll.top, width: GUTTER, height: HEADER }}>行号</div>
    </div>
    {!rows.length ? <div className="pointer-events-none absolute left-4 top-16 text-xs text-muted">没有匹配的行</div> : null}
  </div>;
}

export function TableDiff({ tableId, history, initialRevision, initialLocal, captureLocal, readSnapshot, onClose }: {
  tableId: string; history: TableHistory; initialRevision: string; initialLocal: LocalTableSnapshot;
  captureLocal: () => LocalTableSnapshot; readSnapshot: (revision: string, signal?: AbortSignal) => Promise<TableSnapshot>; onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(initialRevision);
  const [snapshot, setSnapshot] = useState<TableSnapshot | null>(null);
  const [local, setLocal] = useState(initialLocal);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [filter, setFilter] = useState<"all" | "changed" | "same">("all");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [scroll, setScroll] = useState<Scroll>({ top: 0, left: 0 });
  const [display, setDisplay] = useState<"editor" | "raw">("editor");
  const [sequence, setSequence] = useState(0);
  const peers = useRef<Partial<Record<"left" | "right", HTMLIFrameElement | null>>>({});
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    void readSnapshot(revision, controller.signal).then((value) => {
      if (!controller.signal.aborted) setSnapshot(value);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "读取版本失败");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision, refresh, readSnapshot]);
  const compared = useMemo(() => {
    try { return { sheets: snapshot ? compareTables(snapshot, local) : [], error: "" }; }
    catch (error) { return { sheets: [], error: error instanceof Error ? error.message : "解析配表失败" }; }
  }, [snapshot, local]);
  const sheet = compared.sheets.find((item) => item.id === sheetId) || compared.sheets[0];
  const rows = useMemo(() => filterDiffRows(sheet?.rows || [], filter), [sheet, filter]);
  const changes = useMemo(() => rows.flatMap((row, index) => row.changes.map((field) => ({ row: row.key, field, index }))), [rows]);
  const current = changes.findIndex((cell) => cell.row === selection?.row && cell.field === selection.field);
  const selectedRow = sheet?.rows.find((row) => row.key === selection?.row);
  const choose = (selection: Selection, rowIndex?: number) => {
    setSelection(selection);
    setSequence((value) => value + 1);
    if (rowIndex !== undefined && sheet) {
      const column = sheet.columns.findIndex((column) => column.key === selection.field);
      setScroll({ top: rowIndex * ROW, left: Math.max(0, column * COL) });
    }
  };
  const jump = (direction: number) => {
    if (!changes.length) return;
    const cell = changes[(current < 0 ? direction > 0 ? 0 : changes.length - 1 : (current + direction + changes.length) % changes.length)];
    choose(cell, cell.index);
  };
  const refreshSnapshot = () => {
    try { setLocal(captureLocal()); setRefresh((value) => value + 1); setSelection(null); }
    catch (error) { setError(error instanceof Error ? error.message : "读取本地草稿失败"); }
  };
  const resetView = () => { setScroll({ top: 0, left: 0 }); setSelection(null); };
  const missing = snapshot?.struct === null && snapshot.data === null;
  return createPortal(<div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="配置表版本比对" data-testid="table-diff"
    className="fixed inset-0 z-[100] flex min-h-0 flex-col bg-bg text-ink outline-none"
    onKeyDown={(event) => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if ((event.ctrlKey || event.metaKey) && ["s", "z", "y"].includes(event.key.toLowerCase())) event.preventDefault();
      if (event.key === "Tab") {
        const nodes = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),[tabindex="0"]')];
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-elevated px-4">
      <strong className="min-w-0 truncate text-sm">版本比对 · {tableId}</strong>
      <span className="text-xs text-muted">只读</span>
      <Btn data-testid="table-diff-view-editor" variant={display === "editor" ? "primary" : "ghost"} onClick={() => setDisplay("editor")}>Editor 视图</Btn>
      <Btn data-testid="table-diff-view-raw" variant={display === "raw" ? "primary" : "ghost"} onClick={() => setDisplay("raw")}>原始表格</Btn>
      <Btn className="ml-auto" aria-label="关闭版本比对" data-testid="table-diff-close" onClick={onClose}><X size={15} /></Btn>
    </header>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
      {([ ["all", "全部"], ["changed", "差异"], ["same", "相同"] ] as const).map(([value, label]) =>
        <Btn key={value} variant={filter === value ? "primary" : "ghost"} data-testid={`table-diff-filter-${value}`} onClick={() => { setFilter(value); resetView(); }}>{label}</Btn>)}
      <span className="mr-auto text-xs text-muted" data-testid="table-diff-summary">{sheet ? `${sheet.rows.filter((row) => row.status === "added").length} 新增行 · ${sheet.rows.filter((row) => row.status === "removed").length} 删除行 · ${sheet.rows.filter((row) => row.status === "modified").length} 修改行 · ${sheet.columns.filter((column) => column.changed).length} 字段变化` : ""}</span>
      <span className="text-xs text-muted" data-testid="table-diff-position">{changes.length ? `${current + 1} / ${changes.length}` : "无单元格差异"}</span>
      <Btn aria-label="上一个差异" disabled={!changes.length || loading} onClick={() => jump(-1)}><ArrowUp size={14} /></Btn>
      <Btn aria-label="下一个差异" disabled={!changes.length || loading} onClick={() => jump(1)}><ArrowDown size={14} /></Btn>
      <Btn aria-label="刷新比对" disabled={loading} onClick={refreshSnapshot}><RefreshCw size={14} /></Btn>
    </div>
    <div className="grid shrink-0 grid-cols-2 border-b border-line bg-sidebar text-xs">
      <label className="flex min-w-0 items-center gap-2 border-r border-line px-4 py-2">历史
        <select aria-label="历史版本" data-testid="table-diff-revision" className="min-w-0 flex-1 rounded border border-line bg-elevated px-2 py-1" value={revision}
          onChange={(event) => { setRevision(event.target.value); resetView(); }}>
          <option value="base">{history.vcs === "svn" ? "BASE（工作副本基线）" : "HEAD（当前提交）"}</option>
          {history.entries.map((entry) => <option key={entry.id} value={entry.id}>{entry.id.slice(0, 12)} · {entry.message || entry.when}</option>)}
        </select>
        <span className="max-w-[160px] truncate text-muted" title={snapshot?.revision}>{snapshot?.revision === "BASE" ? [...new Set(Object.values(snapshot.fileRevisions || {}))].map((rev) => `r${rev}`).join(" / ") : snapshot?.revision.slice(0, 12)}</span>
      </label>
      <div className="flex items-center px-4 py-2" data-testid="table-diff-local-label">本地版本{local.dirty ? "（含未保存草稿）" : "（已保存内容）"}</div>
    </div>
    {loading ? <div className="flex min-h-0 flex-1 items-center justify-center text-muted">正在读取版本…</div>
      : error || compared.error ? <div role="alert" className="flex-1 overflow-auto p-4 text-danger">{error || compared.error}</div>
      : <>
        {missing ? <div className="border-b border-line px-4 py-1 text-xs text-muted">该版本尚无此表</div> : null}
        {sheet?.positional ? <div className="border-b border-line px-4 py-1 text-xs text-muted" data-testid="table-diff-positional">该分页缺少完整且唯一的 ID，按行位置对齐。</div> : null}
        {sheet && (!sheet.left || !sheet.right) ? <div className="border-b border-line px-4 py-1 text-xs text-muted">{sheet.left ? "本地已删除该分页" : "本地新增分页"}</div> : null}
        <div className="flex min-h-0 flex-1">
          {sheet ? (["left", "right"] as const).map((side) => <div key={side} className="flex min-w-0 flex-1 flex-col border-r border-line">
            {display === "editor" && snapshot ? <EditorDiffPane key={`${sheet.id}:${side}`} side={side} tableId={tableId} source={side === "left" ? snapshot : local}
              revision={side === "left" ? snapshot.revision === "BASE" ? "base" : snapshot.revision : "local"} sheet={sheet} rows={rows}
              selection={selection} sequence={sequence} refresh={refresh} onSelect={choose} onClose={onClose} peer={peers} />
              : <DiffGrid key={`${sheet.id}:${side}`} side={side} sheet={sheet} rows={rows} selection={selection} onSelect={choose} scroll={scroll} onScroll={setScroll} />}
          </div>) : <div className="m-auto text-muted">暂无可比对分页</div>}
        </div>
        <div className="grid h-24 shrink-0 grid-cols-2 border-t border-line text-xs" data-testid="table-diff-details">
          {(["left", "right"] as const).map((side) => <div key={side} className="min-w-0 overflow-auto whitespace-pre-wrap break-all border-r border-line p-2">
            <div className="mb-1 text-muted">{selection ? `${selection.row} · ${selection.field}` : "选择单元格查看完整值"}</div>
            {selection && selectedRow ? <span>{owns(selectedRow[side], selection.field) ? `${typeof selectedRow[side]?.[selection.field]}：${JSON.stringify(selectedRow[side]?.[selection.field], null, 2)}` : "（缺失）"}</span> : null}
          </div>)}
        </div>
        <nav className="flex h-9 shrink-0 overflow-auto border-t border-line bg-elevated" aria-label="比对分页">
          {compared.sheets.map((item) => <button key={item.id} type="button" data-testid={`table-diff-sheet-${item.id}`} aria-pressed={sheet?.id === item.id}
            className={`shrink-0 border-r border-line px-4 text-xs ${sheet?.id === item.id ? "bg-active text-ink" : "text-muted"}`}
            onClick={() => { setSheetId(item.id); resetView(); }}>{item.name} · {item.changes}</button>)}
        </nav>
      </>}
  </div>, document.body);
}
