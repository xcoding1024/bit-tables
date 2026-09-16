import { useMemo, useState } from "react";
import { Btn, Dialog, Input } from "./ui";
import type { EnumCatalogItem } from "../lib/tableHost";

export function EnumsDialog({
  open,
  catalog,
  onClose,
}: {
  open: boolean;
  catalog: EnumCatalogItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeKey, setActiveKey] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((item) => {
      if (item.key.toLowerCase().includes(q)) return true;
      if (item.tableId.toLowerCase().includes(q)) return true;
      if (item.sheetId.toLowerCase().includes(q)) return true;
      if (item.sheetName.toLowerCase().includes(q)) return true;
      return item.entries.some(
        (entry) => entry.id.toLowerCase().includes(q) || entry.name.toLowerCase().includes(q),
      );
    });
  }, [catalog, query]);

  const selected =
    filtered.find((item) => item.key === activeKey) ||
    catalog.find((item) => item.key === activeKey) ||
    filtered[0] ||
    null;

  return (
    <Dialog open={open} title="项目枚举" onClose={onClose} width="max-w-[720px]" footer={<Btn onClick={onClose}>关闭</Btn>}>
      <div className="mb-3">
        <Input
          data-testid="enums-search"
          placeholder="搜索表 / sheet / id / 名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      {catalog.length === 0 ? (
        <div className="py-8 text-center text-muted" data-testid="enums-empty">
          暂无枚举 sheet（在 struct 的 sheets 上设 kind: enum）
        </div>
      ) : (
        <div className="flex min-h-[320px] gap-3" data-testid="enums-browser">
          <div className="w-[220px] shrink-0 overflow-auto rounded border border-line">
            {filtered.length === 0 ? (
              <div className="p-3 text-muted">无匹配</div>
            ) : (
              filtered.map((item) => {
                const active = (selected?.key || "") === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-testid={`enums-item-${item.key}`}
                    className={`block w-full border-b border-line px-2 py-2 text-left last:border-b-0 ${
                      active ? "bg-active text-ink" : "hover:bg-hover"
                    }`}
                    onClick={() => setActiveKey(item.key)}
                  >
                    <div className="truncate text-[13px]">{item.sheetName}</div>
                    <div className="truncate font-mono text-[11px] text-muted">{item.key}</div>
                  </button>
                );
              })
            )}
          </div>
          <div className="min-w-0 flex-1 overflow-auto rounded border border-line">
            {!selected ? (
              <div className="p-3 text-muted">选择左侧枚举</div>
            ) : (
              <>
                <div className="border-b border-line px-3 py-2">
                  <div className="font-medium">{selected.sheetName}</div>
                  <div className="font-mono text-[11px] text-muted">{selected.key}</div>
                </div>
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="text-muted">
                      <th className="border-b border-line px-3 py-2 font-medium">id</th>
                      <th className="border-b border-line px-3 py-2 font-medium">名称</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.entries.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-6 text-center text-muted">
                          暂无条目
                        </td>
                      </tr>
                    ) : (
                      selected.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="border-b border-line px-3 py-1.5 font-mono text-[12px]">{entry.id}</td>
                          <td className="border-b border-line px-3 py-1.5">{entry.name}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
