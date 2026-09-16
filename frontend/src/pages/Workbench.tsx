import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight, Plus, X } from "lucide-react";
import { DocsMarkdown } from "../components/DocsMarkdown";
import { TableHistoryPanel } from "../components/TableHistory";
import { Btn, Dialog, Field, Input } from "../components/ui";
import { tablesApi, type TableFiles, type TableInfo } from "../lib/api";
import { LEFT_DEFAULT, LEFT_MAX, LEFT_MIN, RIGHT_DEFAULT, RIGHT_MAX, RIGHT_MIN } from "../lib/panels";
import { usePanel } from "../lib/usePanel";
import {
  docsSection,
  parseTableDoc,
  runTableChecker,
  stringifyTableDoc,
  type DocsKind,
  type TableCheckError,
} from "../lib/tableHost";

type RightTab = DocsKind | "history";

type TabCheck = {
  ok: boolean;
  errors: TableCheckError[];
  error: string;
  editorKey: number;
};

function readTableParam() {
  return new URLSearchParams(location.search).get("table") || "";
}

function writeTableParam(id: string) {
  const next = new URL(location.href);
  if (id) next.searchParams.set("table", id);
  else next.searchParams.delete("table");
  history.replaceState(null, "", next);
}

export default function Workbench({ rootPath }: { rootPath: string }) {
  const left = usePanel("left", LEFT_DEFAULT, LEFT_MIN, LEFT_MAX, 1);
  const right = usePanel("right", RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX, -1);
  const [list, setList] = useState<TableInfo[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeId, setActiveId] = useState("");
  const [filesById, setFilesById] = useState<Record<string, TableFiles>>({});
  const [checks, setChecks] = useState<Record<string, TabCheck>>({});
  const [rightTab, setRightTab] = useState<RightTab>("struct");
  const [historyReload, setHistoryReload] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const filesRef = useRef(filesById);
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeId);
  filesRef.current = filesById;
  tabsRef.current = tabs;
  activeRef.current = activeId;

  const files = activeId ? filesById[activeId] || null : null;
  const check = activeId ? checks[activeId] : undefined;
  const docBody = rightTab === "history" || !files ? "" : docsSection(files.docs || "", rightTab);

  const runCheck = useCallback(async (id: string, next: TableFiles, data?: unknown) => {
    const parsed = data ?? parseTableDoc(next.data);
    let struct: unknown = {};
    if (next.struct) {
      const raw = next.struct.trim();
      if (raw.charAt(0) !== "{" && raw.charAt(0) !== "[") {
        struct = { raw: next.struct };
      } else {
        struct = parseTableDoc(next.struct);
      }
    }
    const result = await runTableChecker(next.checker, parsed, struct);
    setChecks((prev) => ({
      ...prev,
      [id]: {
        ok: result.ok,
        errors: result.ok ? [] : result.errors,
        error: "",
        editorKey: prev[id]?.editorKey || 1,
      },
    }));
  }, []);

  const loadList = useCallback(async () => {
    const next = await tablesApi.list();
    setList(next.tables || []);
    return next.tables || [];
  }, []);

  const openTable = useCallback(
    async (id: string, remount: boolean) => {
      if (!id) {
        setActiveId("");
        writeTableParam("");
        return;
      }
      writeTableParam(id);
      setTabs((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setActiveId(id);
      const next = await tablesApi.files(id);
      setFilesById((prev) => ({ ...prev, [id]: next }));
      setChecks((prev) => ({
        ...prev,
        [id]: {
          ok: prev[id]?.ok || false,
          errors: prev[id]?.errors || [],
          error: "",
          editorKey: remount ? (prev[id]?.editorKey || 0) + 1 : prev[id]?.editorKey || 1,
        },
      }));
      if (!remount) {
        iframeRefs.current[id]?.contentWindow?.postMessage({ type: "replaceData", data: parseTableDoc(next.data) }, "*");
      }
      await runCheck(id, next);
    },
    [runCheck],
  );

  const closeTab = useCallback(
    (id: string) => {
      const nextTabs = tabsRef.current.filter((item) => item !== id);
      setTabs(nextTabs);
      setFilesById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setChecks((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      delete iframeRefs.current[id];
      if (activeRef.current === id) {
        const idx = tabsRef.current.indexOf(id);
        const fallback = nextTabs[idx] || nextTabs[idx - 1] || nextTabs[0] || "";
        setActiveId(fallback);
        writeTableParam(fallback);
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    loadList()
      .then(async (tables) => {
        if (cancelled) return;
        const current = readTableParam();
        if (current && tables.some((item) => item.id === current)) {
          await openTable(current, true);
          return;
        }
        if (tables.length === 1) {
          await openTable(tables[0].id, true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const id = readTableParam();
          if (id) {
            setChecks((prev) => ({
              ...prev,
              [id]: { ok: false, errors: [], error: err instanceof Error ? err.message : "加载失败", editorKey: 1 },
            }));
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadList, openTable]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const id = Object.keys(iframeRefs.current).find((key) => iframeRefs.current[key]?.contentWindow === ev.source);
      if (!id || !ev.data || typeof ev.data !== "object") return;
      const frame = iframeRefs.current[id];
      const msg = ev.data as { type?: string; data?: unknown };
      const cur = filesRef.current[id];
      if (msg.type === "ready" && cur && frame) {
        let struct: unknown = cur.struct;
        try {
          struct = parseTableDoc(cur.struct);
        } catch {
          struct = cur.struct;
        }
        frame.contentWindow?.postMessage(
          { type: "init", tableId: cur.id, struct, data: parseTableDoc(cur.data), theme: "dark" },
          "*",
        );
      } else if (msg.type === "save") {
        if (!cur) return;
        void tablesApi
          .putData(cur.id, stringifyTableDoc(msg.data))
          .then(() => tablesApi.files(cur.id))
          .then((next) => {
            setFilesById((prev) => ({ ...prev, [id]: next }));
            return runCheck(id, next, msg.data);
          })
          .catch((err: unknown) => {
            setChecks((prev) => ({
              ...prev,
              [id]: {
                ...prev[id],
                ok: false,
                errors: prev[id]?.errors || [],
                error: err instanceof Error ? err.message : "保存失败",
                editorKey: prev[id]?.editorKey || 1,
              },
            }));
          });
      } else if (msg.type === "askAI") {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, "*");
        } else {
          setChecks((prev) => ({
            ...prev,
            [id]: {
              ...prev[id],
              ok: false,
              errors: prev[id]?.errors || [],
              error: "请用 Cursor / Codex 直接改表目录中的文件",
              editorKey: prev[id]?.editorKey || 1,
            },
          }));
        }
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [runCheck]);

  useEffect(() => {
    if (!window.EventSource) return;
    const es = new EventSource("/api/events");
    es.addEventListener("file_changed", () => {
      void (async () => {
        const tables = await loadList();
        setHistoryReload((n) => n + 1);
        const ids = tables.map((item) => item.id);
        for (const id of [...tabsRef.current]) {
          if (!ids.includes(id)) {
            closeTab(id);
            continue;
          }
          const prev = filesRef.current[id];
          const next = await tablesApi.files(id);
          setFilesById((cur) => ({ ...cur, [id]: next }));
          if (prev && (next.editor !== prev.editor || next.struct !== prev.struct)) {
            setChecks((cur) => ({
              ...cur,
              [id]: { ...cur[id], ok: cur[id]?.ok || false, errors: cur[id]?.errors || [], error: "", editorKey: (cur[id]?.editorKey || 0) + 1 },
            }));
          } else {
            iframeRefs.current[id]?.contentWindow?.postMessage({ type: "replaceData", data: parseTableDoc(next.data) }, "*");
            await runCheck(id, next);
          }
        }
      })().catch(() => undefined);
    });
    return () => es.close();
  }, [closeTab, loadList, runCheck]);

  async function handleCreate() {
    const id = newId.trim();
    if (!id) return;
    try {
      await tablesApi.create(id);
      setNewOpen(false);
      setNewId("");
      await loadList();
      await openTable(id, true);
    } catch (err: unknown) {
      setChecks((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          errors: [],
          error: err instanceof Error ? err.message : "创建失败",
          editorKey: prev[id]?.editorKey || 1,
        },
      }));
    }
  }

  const statusText = !activeId
    ? "未打开配置表"
    : check?.error
      ? check.error
      : check?.errors.length
        ? check.errors.map((item) => `${item.path ? `${item.path}：` : ""}${item.message}`).join(" · ")
        : check?.ok
          ? "检查通过"
          : "就绪";
  const statusKind = check?.error || (check?.errors.length ?? 0) > 0 ? "err" : check?.ok ? "ok" : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="relative flex shrink-0 flex-col bg-sidebar" style={{ width: left.displayWidth }}>
          {left.collapsed ? (
            <button
              type="button"
              data-testid="tables-left-expand"
              title={rootPath || "展开文件栏"}
              onClick={left.expand}
              className="flex h-8 w-full items-center justify-center text-muted hover:bg-hover hover:text-ink"
            >
              <PanelLeft size={15} />
            </button>
          ) : (
            <>
              <div className="flex items-start justify-between gap-1 border-b border-line px-3 py-2">
                <div className="min-w-0">
                  <div className="text-[11px] text-muted">文件</div>
                  <div className="truncate font-mono text-[11px] text-muted" data-testid="tables-root-current" title={rootPath}>
                    {rootPath}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="tables-left-collapse"
                  title="折叠文件栏"
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink"
                  onClick={left.toggle}
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
              <div className="p-3">
                <button
                  type="button"
                  data-testid="tables-new"
                  onClick={() => setNewOpen(true)}
                  className="flex h-8 w-full items-center justify-center gap-1 rounded bg-accent text-accent-fg hover:bg-accent-hover"
                >
                  <Plus size={14} /> 新建表
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 pb-2" data-testid="tables-list">
                {list.length === 0 ? (
                  <div className="px-2 py-6 text-center text-muted">暂无配置表</div>
                ) : (
                  list.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-testid={`tables-item-${item.id}`}
                      className={`mb-1 block w-full rounded-md px-2 py-1.5 text-left ${
                        activeId === item.id ? "bg-active" : tabs.includes(item.id) ? "bg-hover" : "hover:bg-hover"
                      }`}
                      onClick={() =>
                        void openTable(item.id, !filesById[item.id]).catch((err: unknown) => {
                          setChecks((prev) => ({
                            ...prev,
                            [item.id]: {
                              ok: false,
                              errors: [],
                              error: err instanceof Error ? err.message : "加载失败",
                              editorKey: prev[item.id]?.editorKey || 1,
                            },
                          }));
                        })
                      }
                    >
                      <div className="truncate text-[13px]">{item.id}</div>
                      {item.complete ? null : <div className="text-[11px] text-muted">五件套不完整</div>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
          {left.collapsed ? null : (
            <div
              data-testid="tables-left-resize"
              className={`panel-resize absolute inset-y-0 right-0 z-20 w-1.5 ${left.dragging ? "dragging" : ""}`}
              onPointerDown={left.onResizeStart}
              onDoubleClick={left.toggle}
            />
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col bg-bg">
          <div className="flex h-8 shrink-0 items-stretch overflow-x-auto bg-elevated" data-testid="tables-tabs">
            {tabs.length === 0 ? (
              <div className="flex items-center px-3 text-muted">未打开页签</div>
            ) : (
              tabs.map((id) => {
                const active = id === activeId;
                return (
                  <div
                    key={id}
                    className={`group flex max-w-[180px] shrink-0 items-center border-r border-line ${
                      active ? "bg-bg text-ink" : "text-muted hover:bg-hover"
                    }`}
                  >
                    <button
                      type="button"
                      data-testid={`tables-tab-${id}`}
                      className="min-w-0 flex-1 truncate px-3 text-left"
                      onClick={() => {
                        setActiveId(id);
                        writeTableParam(id);
                      }}
                    >
                      {id}
                    </button>
                    <button
                      type="button"
                      data-testid={`tables-tab-close-${id}`}
                      aria-label={`关闭 ${id}`}
                      className="mr-1 flex h-5 w-5 items-center justify-center rounded text-muted hover:bg-active hover:text-ink"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        closeTab(id);
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
          <div className="relative min-h-0 flex-1">
            {tabs.length === 0 ? (
              <div className="flex h-full items-center justify-center text-muted" data-testid="tables-editor-empty">
                从左侧打开一张配置表
              </div>
            ) : (
              tabs.map((id) => (
                <iframe
                  key={`${id}-${checks[id]?.editorKey || 1}`}
                  ref={(node) => {
                    iframeRefs.current[id] = node;
                  }}
                  data-testid={id === activeId ? "table-editor-frame" : undefined}
                  title={`${id} 编辑器`}
                  className={`absolute inset-0 h-full w-full border-0 bg-bg ${id === activeId ? "" : "invisible"}`}
                  sandbox="allow-scripts"
                  src={tablesApi.editorURL(id, checks[id]?.editorKey || 1)}
                />
              ))
            )}
          </div>
        </section>

        <aside className="relative flex shrink-0 flex-col bg-sidebar" style={{ width: right.displayWidth }}>
          {right.collapsed ? null : (
            <div
              data-testid="tables-right-resize"
              className={`panel-resize absolute inset-y-0 left-0 z-20 w-1.5 ${right.dragging ? "dragging" : ""}`}
              onPointerDown={right.onResizeStart}
              onDoubleClick={right.toggle}
            />
          )}
          {right.collapsed ? (
            <button
              type="button"
              data-testid="tables-right-expand"
              title="展开编辑栏"
              onClick={right.expand}
              className="flex h-8 w-full items-center justify-center text-muted hover:bg-hover hover:text-ink"
            >
              <PanelRight size={15} />
            </button>
          ) : (
            <>
              <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-line px-2 py-1">
                {(
                  [
                    ["struct", "结构"],
                    ["check", "检查规则"],
                    ["export", "导出规则"],
                    ["history", "历史记录"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    data-testid={`tables-docs-${id}`}
                    className={`h-7 rounded px-2 ${rightTab === id ? "bg-active text-ink" : "text-muted hover:bg-hover"}`}
                    onClick={() => setRightTab(id)}
                  >
                    {label}
                  </button>
                ))}
                <div className="min-w-0 flex-1" />
                <button
                  type="button"
                  data-testid="tables-right-collapse"
                  title="折叠编辑栏"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:bg-hover hover:text-ink"
                  onClick={right.toggle}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
              <div
                className={`min-h-0 flex-1 px-3 py-3 ${rightTab === "history" ? "overflow-hidden" : "overflow-auto"}`}
                data-testid="tables-docs"
              >
                {!activeId ? (
                  <div className="text-muted">打开配置表后显示文档</div>
                ) : rightTab === "history" ? (
                  <TableHistoryPanel tableId={activeId} reloadKey={historyReload} />
                ) : docBody ? (
                  <DocsMarkdown text={docBody} />
                ) : (
                  <div className="text-muted">暂无{rightTab === "struct" ? "结构" : rightTab === "check" ? "检查规则" : "导出规则"}说明</div>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <footer
        className="flex h-6 shrink-0 items-center gap-3 overflow-hidden border-t border-line bg-titlebar px-3 text-[12px]"
        data-testid="tables-statusbar"
      >
        <span className="shrink-0 text-muted">{activeId || "—"}</span>
        <span
          className={`min-w-0 truncate ${statusKind === "ok" ? "text-success" : statusKind === "err" ? "text-danger" : "text-muted"}`}
          data-testid={statusKind === "ok" ? "tables-check-ok" : statusKind === "err" ? "tables-check-errors" : "tables-status"}
          title={statusText}
        >
          {statusText}
        </span>
      </footer>

      <Dialog
        open={newOpen}
        title="新建表"
        onClose={() => setNewOpen(false)}
        footer={
          <>
            <Btn onClick={() => setNewOpen(false)}>取消</Btn>
            <Btn variant="primary" data-testid="tables-new-submit" disabled={!newId.trim()} onClick={() => void handleCreate()}>
              创建
            </Btn>
          </>
        }
      >
        <Field label="表 id" hint="小写字母开头，仅字母数字下划线">
          <Input
            data-testid="tables-new-id"
            placeholder="item"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
        </Field>
      </Dialog>
    </div>
  );
}
