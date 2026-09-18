import type { ContentHit } from "../lib/search";

export function SearchHits({
  hits,
  emptyText,
  onOpen,
}: {
  hits: ContentHit[];
  emptyText: string;
  onOpen: (hit: ContentHit) => void;
}) {
  if (hits.length === 0) {
    return <div className="px-2 py-6 text-center text-muted">{emptyText}</div>;
  }
  return (
    <div data-testid="tables-search-hits">
      {hits.map((hit, index) => (
        <button
          key={`${hit.tableId}-${hit.sheetId}-${hit.rowIndex}-${hit.field}-${index}`}
          type="button"
          data-testid={`tables-search-hit-${hit.tableId}-${hit.sheetId}-${hit.rowIndex}`}
          className="mb-0.5 block w-full rounded-md px-2 py-1.5 text-left hover:bg-hover"
          onClick={() => onOpen(hit)}
        >
          <div className="truncate text-[13px]">
            {hit.tableName}
            <span className="text-muted"> · {hit.sheetName}</span>
          </div>
          <div className="truncate text-[11px] text-muted">
            {hit.label}
            {hit.value ? ` · ${hit.value}` : ""}
          </div>
        </button>
      ))}
    </div>
  );
}
