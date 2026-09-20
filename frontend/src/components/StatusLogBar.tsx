import { useEffect, useRef } from "react";

export type StatusLogKind = "" | "ok" | "err";

export type StatusLogEntry = {
  id: number;
  at: number;
  kind: StatusLogKind;
  text: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function formatLogTime(at: number) {
  const d = new Date(at);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function kindClass(kind: StatusLogKind) {
  return kind === "ok" ? "text-success" : kind === "err" ? "text-danger" : "text-muted";
}

function kindTestId(kind: StatusLogKind) {
  return kind === "ok" ? "tables-check-ok" : kind === "err" ? "tables-check-errors" : "tables-status";
}

export function StatusLogBar({
  logs,
  expanded,
  onToggle,
}: {
  logs: StatusLogEntry[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const latest = logs[logs.length - 1];
  const latestText = latest?.text || "就绪";
  const latestKind = latest?.kind || "";

  useEffect(() => {
    if (!expanded) return;
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [expanded, logs]);

  return (
    <footer
      className={`flex shrink-0 flex-col overflow-hidden border-t border-line bg-titlebar text-[12px] ${
        expanded ? "h-[180px]" : "h-6"
      }`}
      data-testid="tables-statusbar"
    >
      {expanded ? (
        <div
          ref={listRef}
          className="min-h-0 flex-1 cursor-pointer overflow-auto px-3 py-1"
          data-testid="tables-status-log"
          onClick={onToggle}
        >
          {logs.length === 0 ? (
            <div className="text-muted">就绪</div>
          ) : (
            logs.map((item) => (
              <div key={item.id} className={`flex gap-2 ${kindClass(item.kind)}`}>
                <span className="shrink-0 text-muted tabular-nums">{formatLogTime(item.at)}</span>
                <span className="min-w-0 break-all">{item.text}</span>
              </div>
            ))
          )}
        </div>
      ) : (
        <button
          type="button"
          className="flex h-6 w-full min-w-0 items-center gap-2 overflow-hidden px-3 text-left"
          onClick={onToggle}
          title={latest ? `${formatLogTime(latest.at)} ${latestText}` : latestText}
        >
          {latest ? <span className="shrink-0 text-muted tabular-nums">{formatLogTime(latest.at)}</span> : null}
          <span className={`min-w-0 truncate ${kindClass(latestKind)}`} data-testid={kindTestId(latestKind)}>
            {latestText}
          </span>
        </button>
      )}
    </footer>
  );
}
