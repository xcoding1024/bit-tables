import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Btn, Dialog } from "./ui";
import {
  buildDepGraph,
  layoutDepGraph,
  type DepGraph,
  type TableSnap,
} from "../lib/deps";

export function DepsDialog({
  open,
  tables,
  currentId,
  onClose,
}: {
  open: boolean;
  tables: TableSnap[];
  currentId?: string;
  onClose: () => void;
}) {
  const graph = useMemo(() => buildDepGraph(tables), [tables]);
  const layout = useMemo(() => layoutDepGraph(graph), [graph]);
  const [activeId, setActiveId] = useState("");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const listRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const wasOpen = useRef(false);

  const selected =
    graph.nodes.find((item) => item.id === activeId) ||
    graph.nodes.find((item) => item.id === currentId) ||
    graph.nodes[0] ||
    null;
  const selectedId = selected?.id || "";
  const hasEdges = graph.edges.length > 0;

  useEffect(() => {
    if (open && !wasOpen.current) {
      setActiveId(currentId && graph.nodes.some((item) => item.id === currentId) ? currentId : "");
      setPan({ x: 0, y: 0 });
    }
    wasOpen.current = open;
  }, [open, currentId, graph]);

  useEffect(() => {
    if (!open || !selectedId || !listRef.current) return;
    const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(selectedId) : selectedId;
    listRef.current.querySelector(`[data-testid="deps-item-${escaped}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, selectedId]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y, moved: false };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved) window.getSelection()?.removeAllRanges();
    setPan({ x: drag.px + dx, y: drag.py + dy });
  }

  function onPointerUp() {
    suppressClick.current = Boolean(dragRef.current?.moved);
    dragRef.current = null;
  }

  function selectNode(id: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setActiveId(id);
  }

  return (
    <Dialog
      open={open}
      title="依赖关系"
      onClose={onClose}
      width="max-w-[1100px]"
      bodyClassName="flex h-[70vh] flex-col overflow-hidden"
      footer={<Btn onClick={onClose}>关闭</Btn>}
    >
      <div className="mb-3 shrink-0 text-[12px] text-muted">箭头 A → B 表示 A 引用 B（跨表 enum、checker 里的表#分页，或结构上的 refs）。被多张表引用的节点会标出入度。图超出视口时可拖拽查看。</div>
      {graph.nodes.length === 0 ? (
        <div className="py-8 text-center text-muted" data-testid="deps-empty">
          暂无配置表
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3" data-testid="deps-browser">
          <div ref={listRef} className="w-[240px] shrink-0 overflow-y-auto rounded border border-line">
            {graph.nodes.map((item) => {
              const active = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`deps-item-${item.id}`}
                  className={`block w-full border-b border-line px-2 py-2 text-left last:border-b-0 ${
                    active ? "bg-active text-ink" : "hover:bg-hover"
                  }`}
                  onClick={() => setActiveId(item.id)}
                >
                  <div className="truncate text-[13px]">{item.name}</div>
                  <div className="truncate font-mono text-[11px] text-muted">{item.id}</div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    引用 {item.refs.length} · 被引用 {item.dependents.length}
                    {item.dependents.length > 1 ? " · 共享" : ""}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded border border-line">
            {!hasEdges ? (
              <div className="px-3 py-8 text-center text-muted" data-testid="deps-graph-empty">
                暂无跨表引用
              </div>
            ) : (
              <div
                className="relative min-h-0 flex-1 cursor-grab select-none overflow-hidden active:cursor-grabbing"
                data-testid="deps-graph-viewport"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
              >
                <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
                  <DepGraphSvg
                    graph={graph}
                    layout={layout}
                    selectedId={selectedId}
                    currentId={currentId || ""}
                    onSelect={selectNode}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex w-[240px] shrink-0 flex-col overflow-hidden rounded border border-line" data-testid="deps-side">
            {selected ? (
              <div className="shrink-0 border-b border-line px-2 py-2">
                <div className="truncate text-[13px] font-medium">{selected.name}</div>
                <div className="truncate font-mono text-[11px] text-muted">{selected.id}</div>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DepIdList title="引用" testId="deps-refs" ids={selected?.refs || []} graph={graph} onSelect={setActiveId} />
              <DepIdList title="被引用" testId="deps-dependents" ids={selected?.dependents || []} graph={graph} onSelect={setActiveId} />
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function DepIdList({
  title,
  testId,
  ids,
  graph,
  onSelect,
}: {
  title: string;
  testId: string;
  ids: string[];
  graph: DepGraph;
  onSelect: (id: string) => void;
}) {
  const nameOf = new Map(graph.nodes.map((node) => [node.id, node.name]));
  return (
    <div data-testid={testId}>
      <div className="sticky top-0 border-b border-line bg-elevated px-2 py-1 text-[12px] text-muted">
        {title} {ids.length}
      </div>
      {ids.length === 0 ? (
        <div className="px-2 py-2 text-[12px] text-muted">无</div>
      ) : (
        ids.map((id) => (
          <button
            key={id}
            type="button"
            className="block w-full border-b border-line px-2 py-1.5 text-left last:border-b-0 hover:bg-hover"
            onClick={() => onSelect(id)}
          >
            <div className="truncate text-[13px]">{nameOf.get(id) || id}</div>
            <div className="truncate font-mono text-[11px] text-muted">{id}</div>
          </button>
        ))
      )}
    </div>
  );
}

function DepGraphSvg({
  graph,
  layout,
  selectedId,
  currentId,
  onSelect,
}: {
  graph: DepGraph;
  layout: ReturnType<typeof layoutDepGraph>;
  selectedId: string;
  currentId: string;
  onSelect: (id: string) => void;
}) {
  const related = new Set<string>();
  if (selectedId) {
    related.add(selectedId);
    const node = graph.nodes.find((item) => item.id === selectedId);
    for (const id of node?.refs || []) related.add(id);
    for (const id of node?.dependents || []) related.add(id);
  }
  return (
    <div className="p-2" data-testid="deps-graph">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        role="img"
        aria-label="表依赖关系图"
        className="select-none"
        style={{ userSelect: "none", WebkitUserSelect: "none" }}
      >
        <style>{`text { user-select: none; -webkit-user-select: none; }`}</style>
        <defs>
          <marker id="deps-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--border-strong)" />
          </marker>
          <marker id="deps-arrow-active" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
          </marker>
        </defs>
        {layout.edges.map((edge) => {
          const active = Boolean(selectedId) && (edge.from === selectedId || edge.to === selectedId);
          return (
            <path
              key={`${edge.from}-${edge.to}`}
              d={edge.path}
              fill="none"
              stroke={active ? "var(--accent)" : "var(--border-strong)"}
              strokeWidth={active ? 2 : 1.25}
              markerEnd={active ? "url(#deps-arrow-active)" : "url(#deps-arrow)"}
              opacity={selectedId && !active ? 0.35 : 1}
            />
          );
        })}
        {layout.nodes.map((node) => {
          const selected = node.id === selectedId;
          const current = node.id === currentId;
          const dimmed = Boolean(selectedId) && !related.has(node.id);
          const shared = node.dependents.length > 1;
          return (
            <g
              key={node.id}
              opacity={dimmed ? 0.4 : 1}
              style={{ cursor: "pointer" }}
              onClick={() => onSelect(node.id)}
            >
              <rect
                x={node.x}
                y={node.y}
                width={node.w}
                height={node.h}
                rx={6}
                fill={selected ? "var(--bg-active)" : "var(--bg-elevated)"}
                stroke={current ? "var(--accent)" : selected ? "var(--border-strong)" : "var(--border)"}
                strokeWidth={current || selected ? 2 : 1}
              />
              <text
                x={node.x + 10}
                y={node.y + 20}
                fill="var(--text)"
                fontSize="12"
                fontFamily="var(--font-sans)"
              >
                {truncate(node.name, 16)}
              </text>
              <text
                x={node.x + 10}
                y={node.y + 36}
                fill="var(--text-muted)"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {node.id}
                {shared ? `  ·${node.dependents.length}` : ""}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
