import { useEffect, useMemo, useRef, useState } from "react";
import { columnIndex, columnName, excelRange, excelRefText, parseExcelRef, type ExcelSheet } from "../lib/excel";

type Area = { r0: number; r1: number; c0: number; c1: number; column?: boolean };
const WIDTH = 120, HEIGHT = 28, GUTTER = 48;
function normalized(a: Area): Area { return { ...a, r0: Math.min(a.r0, a.r1), r1: Math.max(a.r0, a.r1), c0: Math.min(a.c0, a.c1), c1: Math.max(a.c0, a.c1) }; }
function refArea(ref: string, sheet: ExcelSheet): Area | null {
  const parsed = parseExcelRef(ref);
  if (!parsed) return null;
  try {
    const range = excelRange(parsed, sheet);
    return { r0: Number(range.rows[0]), r1: Number(range.rows.at(-1)), c0: columnIndex(range.fields[0]), c1: columnIndex(range.fields.at(-1)!) };
  } catch { return null; }
}

export function ExcelGrid({ table, file, sheet, picking, marks, selectedRef, onPick, onCancel, onError }: {
  table: string; file: string; sheet: ExcelSheet; picking: boolean; marks: { ref: string; label: string }[];
  selectedRef?: { ref: string; revision: number }; onPick: (ref: string) => void; onCancel: () => void; onError: (message: string) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const anchor = useRef<Area | null>(null);
  const [selection, setSelection] = useState<Area | null>(null);
  const [viewport, setViewport] = useState({ left: 0, top: 0, width: 800, height: 600 });
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const update = () => setViewport({ left: node.scrollLeft, top: node.scrollTop, width: node.clientWidth, height: node.clientHeight });
    const observer = new ResizeObserver(update); observer.observe(node); update();
    const stop = () => { dragging.current = false; };
    window.addEventListener("mouseup", stop);
    return () => { observer.disconnect(); window.removeEventListener("mouseup", stop); };
  }, []);
  useEffect(() => {
    if (!selectedRef) return;
    const area = refArea(selectedRef.ref, sheet);
    if (!area) return;
    setSelection(area); anchor.current = area;
    root.current?.scrollTo({ left: Math.max(0, (area.c0 - 1) * WIDTH), top: Math.max(0, (area.r0 - 1) * HEIGHT) });
  }, [selectedRef, sheet]);
  const merges = useMemo(() => sheet.merges.map((ref) => refArea(excelRefText(table, file, sheet.name, ref), sheet)).filter((area): area is Area => Boolean(area)), [sheet, table, file]);
  const notify = (area: Area) => {
    const next = normalized(area); setSelection(next);
    if (!picking) return;
    const range = next.column ? `${columnName(next.c0)}:${columnName(next.c1)}`
      : next.r0 === next.r1 && next.c0 === next.c1 ? `${columnName(next.c0)}${next.r0}`
      : `${columnName(next.c0)}${next.r0}:${columnName(next.c1)}${next.r1}`;
    onPick(excelRefText(table, file, sheet.name, range));
  };
  const pick = (event: React.MouseEvent, r: number, c: number, column = false) => {
    if (event.button !== 0) return;
    event.preventDefault(); root.current?.focus(); dragging.current = true;
    if (!event.shiftKey || !anchor.current || Boolean(anchor.current.column) !== column) anchor.current = { r0: r, r1: column ? sheet.rows : r, c0: c, c1: c, column };
    notify({ ...anchor.current!, r1: column ? sheet.rows : r, c1: c });
  };
  const move = (r: number, c: number, column = false) => {
    if (!dragging.current || !anchor.current || Boolean(anchor.current.column) !== column) return;
    notify({ ...anchor.current, r1: column ? sheet.rows : r, c1: c });
  };
  const copy = () => {
    if (!selection) return;
    const lines: string[] = [];
    for (let r = selection.r0; r <= selection.r1; r++) {
      const cells: string[] = [];
      for (let c = selection.c0; c <= selection.c1; c++) {
        const text = sheet.cells[`${columnName(c)}${r}`]?.text || "";
        cells.push(/[\t\r\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
      }
      lines.push(cells.join("\t"));
    }
    void navigator.clipboard.writeText(lines.join("\n")).catch(() => onError("复制 Excel 选区失败"));
  };
  const r0 = Math.max(1, Math.floor(viewport.top / HEIGHT)), r1 = Math.min(sheet.rows, Math.ceil((viewport.top + viewport.height) / HEIGHT));
  const c0 = Math.max(1, Math.floor(viewport.left / WIDTH)), c1 = Math.min(sheet.columns, Math.ceil((viewport.left + viewport.width) / WIDTH));
  const rows = Array.from({ length: Math.max(0, r1 - r0 + 1) }, (_, i) => r0 + i);
  const columns = Array.from({ length: Math.max(0, c1 - c0 + 1) }, (_, i) => c0 + i);
  const rect = (area: Area) => ({ left: GUTTER + (area.c0 - 1) * WIDTH, top: area.r0 * HEIGHT, width: (area.c1 - area.c0 + 1) * WIDTH, height: (area.r1 - area.r0 + 1) * HEIGHT });
  const cell = (r: number, c: number, area?: Area) => {
    const coord = `${columnName(c)}${r}`, value = sheet.cells[coord];
    return <div key={coord} data-testid={`excel-cell-${coord}`} data-excel-cell={coord}
      title={value?.error || value?.text} role="gridcell" aria-readonly="true"
      className={`absolute overflow-hidden whitespace-pre-wrap border-b border-r border-line bg-bg px-2 text-sm ${value?.error ? "text-danger" : "text-ink"}`}
      style={rect(area || { r0: r, r1: r, c0: c, c1: c })} onMouseDown={(event) => pick(event, r, c)} onMouseEnter={() => move(r, c)}>{value?.text || ""}</div>;
  };
  const grouped = new Map<string, { area: Area; labels: Set<string> }>();
  for (const mark of marks) {
    const area = refArea(mark.ref, sheet);
    if (!area) continue;
    const key = JSON.stringify(area), group = grouped.get(key) || { area, labels: new Set<string>() };
    group.labels.add(mark.label); grouped.set(key, group);
  }
  return <div className="flex h-full min-h-0 flex-col bg-bg" data-testid="excel-view">
    <div className="shrink-0 border-b border-line px-3 py-1 text-xs text-muted">{file} · {sheet.name} · 只读</div>
    {sheet.error ? <div className="p-3 text-danger" role="alert">{sheet.error}</div> : null}
    <div ref={root} tabIndex={0} role="grid" aria-label={`${file} ${sheet.name}`} aria-readonly="true"
      className="min-h-0 flex-1 overflow-auto outline-none" data-testid="excel-grid"
      onScroll={(event) => {
        const { scrollLeft: left, scrollTop: top } = event.currentTarget;
        setViewport((v) => ({ ...v, left, top }));
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && picking) { event.preventDefault(); onCancel(); }
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); copy(); }
      }}>
      <div className="relative select-none" style={{ width: GUTTER + sheet.columns * WIDTH, height: (sheet.rows + 1) * HEIGHT }}>
        {rows.flatMap((r) => columns.map((c) => merges.some((a) => r >= a.r0 && r <= a.r1 && c >= a.c0 && c <= a.c1) ? null : cell(r, c)))}
        {merges.filter((a) => a.r0 <= r1 && a.r1 >= r0 && a.c0 <= c1 && a.c1 >= c0).map((a) => cell(a.r0, a.c0, a))}
        {selection ? <div className="pointer-events-none absolute z-10 border-2 border-accent bg-accent/10" style={rect(selection)} data-testid="excel-selection" /> : null}
        {[...grouped.values()].map(({ area, labels }) => <div key={JSON.stringify(area)} data-testid="plugin-source-mark"
          className="pointer-events-none absolute z-20 border-2 border-dashed border-yellow-400" style={rect(area)}>
          <span className="absolute right-0 top-0 max-w-full truncate bg-yellow-950 px-1 text-xs text-yellow-200">{[...labels].join("、")}</span>
        </div>)}
        {rows.map((r) => <div key={`row${r}`} className="absolute z-30 border-b border-r border-line bg-elevated text-center text-xs text-muted"
          style={{ left: viewport.left, top: r * HEIGHT, width: GUTTER, height: HEIGHT }}>{r}</div>)}
        {columns.map((c) => <div key={`col${c}`} data-testid={`excel-column-${columnName(c)}`} role="columnheader"
          className="absolute z-30 cursor-pointer border-b border-r border-line bg-elevated text-center text-xs text-muted"
          style={{ left: GUTTER + (c - 1) * WIDTH, top: viewport.top, width: WIDTH, height: HEIGHT }}
          onMouseDown={(event) => pick(event, 1, c, true)} onMouseEnter={() => move(1, c, true)}>{columnName(c)}</div>)}
        <div className="absolute z-40 border-b border-r border-line bg-elevated" style={{ left: viewport.left, top: viewport.top, width: GUTTER, height: HEIGHT }} />
      </div>
    </div>
  </div>;
}
