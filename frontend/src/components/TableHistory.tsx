import { useEffect, useMemo, useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { tablesApi, type HistoryKind, type TableHistory } from "../lib/api";

const FILTERS: { id: HistoryKind; label: string }[] = [
  { id: "struct", label: "结构" },
  { id: "check", label: "检查规则" },
  { id: "export", label: "导出规则" },
  { id: "data", label: "数值修改" },
];

const KIND_LABEL: Record<HistoryKind, string> = {
  struct: "结构",
  check: "检查规则",
  export: "导出规则",
  data: "数值修改",
};

const ALL_KINDS: HistoryKind[] = FILTERS.map((item) => item.id);

export function TableHistoryPanel({ tableId, reloadKey }: { tableId: string; reloadKey: number }) {
  const [history, setHistory] = useState<TableHistory | null>(null);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<HistoryKind[]>(ALL_KINDS);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError("");
    tablesApi
      .history(tableId)
      .then((next) => {
        if (!cancelled) setHistory(next);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHistory(null);
          setError(err instanceof Error ? err.message : "加载历史失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tableId, reloadKey]);

  useEffect(() => {
    if (!open) return;
    function onDoc(ev: MouseEvent) {
      if (popRef.current && !popRef.current.contains(ev.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(ev: KeyboardEvent) {
      if (ev.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const entries = useMemo(() => {
    const list = history?.entries || [];
    if (filters.length === 0 || filters.length === ALL_KINDS.length) return list;
    const want = new Set(filters);
    return list.filter((item) => item.kinds.some((kind) => want.has(kind)));
  }, [history, filters]);

  const filtered = filters.length !== ALL_KINDS.length;

  function toggle(kind: HistoryKind) {
    setFilters((prev) => {
      if (prev.includes(kind)) {
        const next = prev.filter((item) => item !== kind);
        return next.length ? next : prev;
      }
      return [...prev, kind];
    });
  }

  return (
    <div className="relative h-full min-h-0">
      <div className="h-full overflow-auto pr-1 pb-12">
        {error ? (
          <div className="text-danger">{error}</div>
        ) : !history ? (
          <div className="text-muted">加载历史…</div>
        ) : !history.vcs ? (
          <div className="text-muted">当前目录未纳入 git 或 svn</div>
        ) : entries.length === 0 ? (
          <div className="text-muted">{history.entries.length === 0 ? "暂无提交记录" : "当前筛选无记录"}</div>
        ) : (
          <div data-testid="tables-history-list">
            {entries.map((item) => (
              <div key={item.id} className="mb-4" data-testid="tables-history-item">
                <div className="mb-1 text-[11px] text-muted">
                  {item.author} · {item.when}
                </div>
                <div className="whitespace-pre-wrap">{item.message || "（无说明）"}</div>
                <div className="mt-1 text-[11px] text-muted">
                  {item.kinds.map((kind) => KIND_LABEL[kind] || kind).join(" · ")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div ref={popRef} className="absolute bottom-1 right-0 z-20 flex flex-col items-end">
        {open ? (
          <div
            className="mb-1 min-w-[132px] rounded border border-line bg-elevated p-1 shadow-lg"
            data-testid="tables-history-filters"
          >
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`tables-history-filter-${item.id}`}
                className={`flex h-7 w-full items-center rounded px-2 text-left ${
                  filters.includes(item.id) ? "bg-active text-ink" : "text-muted hover:bg-hover"
                }`}
                onClick={() => toggle(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          data-testid="tables-history-filter"
          title="筛选"
          aria-label="筛选"
          className={`ml-auto flex h-7 w-7 items-center justify-center rounded border border-line ${
            open || filtered ? "bg-active text-ink" : "bg-sidebar text-muted hover:bg-hover hover:text-ink"
          }`}
          onClick={() => setOpen((v) => !v)}
        >
          <ListFilter size={14} />
        </button>
      </div>
    </div>
  );
}
