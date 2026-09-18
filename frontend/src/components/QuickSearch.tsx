import { useEffect, useState, type ReactNode } from "react";
import { Input } from "./ui";

export function QuickSearch<T>({
  open,
  title,
  placeholder,
  query,
  onQuery,
  items,
  emptyText,
  extra,
  renderItem,
  onPick,
  onClose,
  testId,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  query: string;
  onQuery: (query: string) => void;
  items: T[];
  emptyText: string;
  extra?: ReactNode;
  renderItem: (item: T, active: boolean) => ReactNode;
  onPick: (item: T) => void;
  onClose: () => void;
  testId: string;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) setActive(0);
  }, [items, open, query]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => Math.min(Math.max(items.length - 1, 0), i + 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const hit = items[active];
        if (hit) onPick(hit);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, items, onClose, onPick, open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" data-testid={testId}>
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="关闭" onClick={onClose} />
      <div className="relative mx-auto mt-[12vh] w-full max-w-[520px] overflow-hidden rounded border border-line bg-elevated shadow-lg">
        <div className="border-b border-line px-3 py-2">
          <div className="mb-2 text-[12px] text-muted">{title}</div>
          <Input
            autoFocus
            data-testid={`${testId}-input`}
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          {extra ? <div className="mt-2">{extra}</div> : null}
        </div>
        <div className="max-h-[50vh] overflow-auto p-1">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-muted">{emptyText}</div>
          ) : (
            items.map((item, index) => (
              <button
                key={index}
                type="button"
                className={`block w-full rounded-md px-2 py-1.5 text-left ${
                  index === active ? "bg-active" : "hover:bg-hover"
                }`}
                onMouseEnter={() => setActive(index)}
                onClick={() => onPick(item)}
              >
                {renderItem(item, index === active)}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
