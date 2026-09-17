import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { ChevronLeft, ChevronRight, PanelLeft, PanelRight, Plus, X } from "lucide-react";
import { DocsMarkdown } from "../components/DocsMarkdown";
import { TableHistoryPanel } from "../components/TableHistory";
import { Btn, Dialog, Field, Input } from "../components/ui";
import { TableTree, resolveTree } from "../components/TableTree";
import { tablesApi, type TableFiles, type TreeNode } from "../lib/api";
import { buildDepGraph, emptyExportReport, exportSet, type ExportReport, type TableSnap } from "../lib/deps";
import { LEFT_DEFAULT, LEFT_MAX, LEFT_MIN, RIGHT_DEFAULT, RIGHT_MAX, RIGHT_MIN } from "../lib/panels";
import { usePanel } from "../lib/usePanel";
import {
  buildEnumsPayload,
  defaultSheetId,
  docsSection,
  listSheets,
  mergeSheetData,
  parseTableDoc,
  runTableChecker,
  runTableExporter,
  sliceForSheet,
  stringifyTableDoc,
  type DocsKind,
  type EnumCatalogItem,
  type SheetInfo,
  type TableCheckError,
} from "../lib/tableHost";

function parseDoc(text: string): unknown {
  try {
    return parseTableDoc(text || "");
  } catch {
    return {};
  }
}

function resolveSheetId(struct: unknown, preferred?: string): string {
  const sheets = listSheets(struct);
  if (preferred && sheets.some((item) => item.id === preferred)) return preferred;
  return defaultSheetId(struct);
}

type RightTab = DocsKind | "history";

export type EditorCommands = {
  undo: () => void;
  redo: () => void;
  save: () => void;
  exportCurrent: () => Promise<ExportReport>;
  exportAll: () => Promise<ExportReport>;
};

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

export default function Workbench({
  rootPath,
  enumsCatalog = [],
  tablePacks = [],
  editorCommandsRef,
  onActiveIdChange,
}: {
  rootPath: string;
  enumsCatalog?: EnumCatalogItem[];
  tablePacks?: TableSnap[];
  editorCommandsRef?: MutableRefObject<EditorCommands | null>;
  onActiveIdChange?: (id: string) => void;
}) {
  const left = usePanel("left", LEFT_DEFAULT, LEFT_MIN, LEFT_MAX, 1);
  const right = usePanel("right", RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX, -1);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeId, setActiveId] = useState("");
  const [filesById, setFilesById] = useState<Record<string, TableFiles>>({});
  const [draftById, setDraftById] = useState<Record<string, unknown>>({});
  const [sheetById, setSheetById] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, TabCheck>>({});
  const [rightTab, setRightTab] = useState<RightTab>("struct");
  const [historyReload, setHistoryReload] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const frameReadyRef = useRef<Record<string, boolean>>({});
  const filesRef = useRef(filesById);
  const draftRef = useRef(draftById);
  const sheetRef = useRef(sheetById);
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeId);
  const enumsRef = useRef(enumsCatalog);
  const packsRef = useRef(tablePacks);
  const savedAtRef = useRef<Record<string, number>>({});
  filesRef.current = filesById;
  draftRef.current = draftById;
  sheetRef.current = sheetById;
  tabsRef.current = tabs;
  activeRef.current = activeId;
  enumsRef.current = enumsCatalog;
  packsRef.current = tablePacks;

  const files = activeId ? filesById[activeId] || null : null;
  const check = activeId ? checks[activeId] : undefined;
  const docBody = rightTab === "history" || !files ? "" : docsSection(files.docs || "", rightTab);
  const activeStruct = files ? parseDoc(files.struct) : {};
  const activeSheets: SheetInfo[] = files ? listSheets(activeStruct) : [];
  const activeSheetId = files ? resolveSheetId(activeStruct, sheetById[activeId]) : "";

  const fullDataOf = useCallback((id: string, fallbackText?: string) => {
    if (Object.prototype.hasOwnProperty.call(draftRef.current, id)) {
      return draftRef.current[id];
    }
    return parseDoc(fallbackText ?? filesRef.current[id]?.data ?? "");
  }, []);

  const structOf = useCallback((id: string, fallbackText?: string) => {
    return parseDoc(fallbackText ?? filesRef.current[id]?.struct ?? "");
  }, []);

  const sheetOf = useCallback((id: string, struct?: unknown) => {
    return resolveSheetId(struct ?? structOf(id), sheetRef.current[id]);
  }, [structOf]);

  const rememberDraft = useCallback((id: string, data: unknown) => {
    draftRef.current = { ...draftRef.current, [id]: data };
    setDraftById((prev) => ({ ...prev, [id]: data }));
  }, []);

  const rememberFiles = useCallback((id: string, next: TableFiles) => {
    filesRef.current = { ...filesRef.current, [id]: next };
    setFilesById((prev) => ({ ...prev, [id]: next }));
  }, []);

  const postSlice = useCallback(
    (id: string, type: "init" | "setSheet" | "replaceData") => {
      const frame = iframeRefs.current[id];
      const cur = filesRef.current[id];
      if (!frame?.contentWindow || !cur) return;
      const struct = structOf(id);
      const sheetId = sheetOf(id, struct);
      const sliced = sliceForSheet(struct, fullDataOf(id), sheetId);
      const enums = buildEnumsPayload(struct, cur.id, enumsRef.current);
      if (type === "replaceData") {
        frame.contentWindow.postMessage(
          { type: "replaceData", sheetId, struct: sliced.struct, data: sliced.data, enums },
          "*",
        );
        return;
      }
      frame.contentWindow.postMessage(
        { type, tableId: cur.id, sheetId, struct: sliced.struct, data: sliced.data, enums, theme: "dark" },
        "*",
      );
    },
    [fullDataOf, sheetOf, structOf],
  );

  /** iframe ready 与 files 加载谁先谁后都可能；两边到齐才 init，避免窗口模式下只有 rows、没有 fields。 */
  const tryInitFrame = useCallback(
    (id: string) => {
      if (!id || !frameReadyRef.current[id] || !filesRef.current[id] || !iframeRefs.current[id]?.contentWindow) {
        return;
      }
      postSlice(id, "init");
    },
    [postSlice],
  );

  const runExport = useCallback(async (tableIds: string[]): Promise<ExportReport> => {
    const ids = [...new Set(tableIds.map((id) => String(id || "").trim()).filter(Boolean))].sort();
    const report = emptyExportReport({ tableIds: ids });
    try {
      const info = await tablesApi.exportInfo();
      report.clientPath = info.client || "";
      report.serverPath = info.server || "";
    } catch (err: unknown) {
      report.errors.push({ tableId: "", message: err instanceof Error ? err.message : "无法读取导出目录" });
    }
    const pendingClient: { tableId: string; name: string; content: string }[] = [];
    const pendingServer: { tableId: string; name: string; content: string }[] = [];
    for (const id of ids) {
      let files = filesRef.current[id];
      if (!files) {
        try {
          files = await tablesApi.files(id);
        } catch (err: unknown) {
          report.errors.push({ tableId: id, message: err instanceof Error ? err.message : "读取表失败" });
          continue;
        }
      }
      if (!files.hasExport || !String(files.export || "").trim()) {
        report.skipped.push({ tableId: id, reason: "无导出脚本" });
        continue;
      }
      const result = await runTableExporter(files.export, fullDataOf(id, files.data), parseDoc(files.struct));
      if (!result.ok) {
        report.errors.push({ tableId: id, message: result.error || "导出失败" });
        continue;
      }
      if (!result.client.length && !result.server.length) {
        report.skipped.push({ tableId: id, reason: "未产生文件" });
        continue;
      }
      for (const file of result.client) {
        pendingClient.push({ tableId: id, name: file.name, content: file.content });
      }
      for (const file of result.server) {
        pendingServer.push({ tableId: id, name: file.name, content: file.content });
      }
    }
    if (pendingClient.length || pendingServer.length) {
      try {
        const wrote = await tablesApi.writeExport({
          client: pendingClient.map((item) => ({ name: item.name, content: item.content })),
          server: pendingServer.map((item) => ({ name: item.name, content: item.content })),
        });
        report.clientPath = wrote.client || report.clientPath;
        report.serverPath = wrote.server || report.serverPath;
        report.written = [
          ...pendingClient.map((item) => ({ tableId: item.tableId, name: item.name, side: "client" as const })),
          ...pendingServer.map((item) => ({ tableId: item.tableId, name: item.name, side: "server" as const })),
        ];
      } catch (err: unknown) {
        report.errors.push({ tableId: "", message: err instanceof Error ? err.message : "写入导出目录失败" });
      }
    }
    return report;
  }, [fullDataOf]);

  const postEditorCmd = useCallback((type: "undo" | "redo" | "save") => {
    const id = activeRef.current;
    if (!id) return;
    iframeRefs.current[id]?.contentWindow?.postMessage({ type }, "*");
  }, []);

  useEffect(() => {
    if (!editorCommandsRef) return;
    editorCommandsRef.current = {
      undo: () => postEditorCmd("undo"),
      redo: () => postEditorCmd("redo"),
      save: () => postEditorCmd("save"),
      exportCurrent: () => {
        const id = activeRef.current;
        if (!id) {
          return Promise.resolve(emptyExportReport({ errors: [{ tableId: "", message: "未打开配置表" }] }));
        }
        return runExport(exportSet(buildDepGraph(packsRef.current), id));
      },
      exportAll: async () => {
        const listed = await tablesApi.list();
        return runExport((listed.tables || []).map((item) => item.id));
      },
    };
    return () => {
      editorCommandsRef.current = null;
    };
  }, [editorCommandsRef, postEditorCmd, runExport]);

  useEffect(() => {
    onActiveIdChange?.(activeId);
  }, [activeId, onActiveIdChange]);

  useEffect(() => {
    return () => onActiveIdChange?.("");
  }, [onActiveIdChange]);

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const key = String(ev.key || "").toLowerCase();
      const mod = ev.ctrlKey || ev.metaKey;
      if (!mod || ev.altKey) return;
      if (key === "s") {
        ev.preventDefault();
        postEditorCmd("save");
        return;
      }
      const target = ev.target as HTMLElement | null;
      const tag = String(target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return;
      if (key === "z" && ev.shiftKey) {
        ev.preventDefault();
        postEditorCmd("redo");
      } else if (key === "z") {
        ev.preventDefault();
        postEditorCmd("undo");
      } else if (key === "y") {
        ev.preventDefault();
        postEditorCmd("redo");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [postEditorCmd]);

  useEffect(() => {
    for (const id of tabsRef.current) {
      postSlice(id, "setSheet");
    }
  }, [enumsCatalog, postSlice]);

  const applyPartial = useCallback(
    (id: string, partial: unknown) => {
      const struct = structOf(id);
      const merged = mergeSheetData(fullDataOf(id), struct, sheetOf(id, struct), partial);
      rememberDraft(id, merged);
      return merged;
    },
    [fullDataOf, rememberDraft, sheetOf, structOf],
  );

  const runCheck = useCallback(async (id: string, next: TableFiles, data?: unknown) => {
    const parsed = data ?? parseDoc(next.data);
    const struct = next.struct ? parseDoc(next.struct) : {};
    const enums = buildEnumsPayload(struct, next.id, enumsRef.current);
    const result = await runTableChecker(next.checker, parsed, struct, enums);
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
    const tables = next.tables || [];
    setTree(resolveTree(next.tree, tables));
    return tables;
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
      const struct = parseDoc(next.struct);
      const data = parseDoc(next.data);
      rememberDraft(id, data);
      setSheetById((prev) => {
        const sheetId = resolveSheetId(struct, prev[id]);
        sheetRef.current = { ...sheetRef.current, [id]: sheetId };
        return { ...prev, [id]: sheetId };
      });
      rememberFiles(id, next);
      setChecks((prev) => ({
        ...prev,
        [id]: {
          ok: prev[id]?.ok || false,
          errors: prev[id]?.errors || [],
          error: "",
          editorKey: remount ? (prev[id]?.editorKey || 0) + 1 : prev[id]?.editorKey || 1,
        },
      }));
      if (remount) {
        // 新 iframe 会再发 ready；若 ready 已到则立刻补 init
        tryInitFrame(id);
      } else {
        postSlice(id, "replaceData");
      }
      await runCheck(id, next, data);
    },
    [postSlice, rememberDraft, rememberFiles, runCheck, tryInitFrame],
  );

  const closeTab = useCallback(
    (id: string) => {
      const nextTabs = tabsRef.current.filter((item) => item !== id);
      setTabs(nextTabs);
      setFilesById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        filesRef.current = copy;
        return copy;
      });
      setChecks((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setDraftById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        draftRef.current = copy;
        return copy;
      });
      setSheetById((prev) => {
        const copy = { ...prev };
        delete copy[id];
        sheetRef.current = copy;
        return copy;
      });
      delete iframeRefs.current[id];
      delete frameReadyRef.current[id];
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
      if (msg.type === "ready" && frame) {
        frameReadyRef.current[id] = true;
        tryInitFrame(id);
      } else if (msg.type === "dirty") {
        applyPartial(id, msg.data);
      } else if (msg.type === "save") {
        if (!cur) return;
        const merged = applyPartial(id, msg.data);
        savedAtRef.current[id] = Date.now();
        void tablesApi
          .putData(cur.id, stringifyTableDoc(merged))
          .then(() => tablesApi.files(cur.id))
          .then((next) => {
            savedAtRef.current[id] = Date.now();
            rememberFiles(id, next);
            rememberDraft(id, parseDoc(next.data));
            return runCheck(id, next, parseDoc(next.data));
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
  }, [applyPartial, postSlice, rememberDraft, rememberFiles, runCheck, tryInitFrame]);

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
          rememberFiles(id, next);
          rememberDraft(id, parseDoc(next.data));
          setSheetById((cur) => {
            const sheetId = resolveSheetId(parseDoc(next.struct), cur[id]);
            sheetRef.current = { ...sheetRef.current, [id]: sheetId };
            return { ...cur, [id]: sheetId };
          });
          if (prev && (next.editor !== prev.editor || next.struct !== prev.struct)) {
            setChecks((cur) => ({
              ...cur,
              [id]: { ...cur[id], ok: cur[id]?.ok || false, errors: cur[id]?.errors || [], error: "", editorKey: (cur[id]?.editorKey || 0) + 1 },
            }));
          } else if (Date.now() - (savedAtRef.current[id] || 0) < 2500) {
            await runCheck(id, next, parseDoc(next.data));
          } else {
            postSlice(id, "replaceData");
            await runCheck(id, next, parseDoc(next.data));
          }
        }
      })().catch(() => undefined);
    });
    return () => es.close();
  }, [closeTab, loadList, postSlice, rememberDraft, rememberFiles, runCheck]);

  async function handleCreate() {
    const id = newId.trim();
    if (!id) return;
    try {
      const created = await tablesApi.create(id);
      setNewOpen(false);
      setNewId("");
      await loadList();
      await openTable(created.id, true);
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
                <TableTree
                  tree={tree}
                  activeId={activeId}
                  openIds={tabs}
                  onOpen={(id) =>
                    void openTable(id, !filesById[id]).catch((err: unknown) => {
                      setChecks((prev) => ({
                        ...prev,
                        [id]: {
                          ok: false,
                          errors: [],
                          error: err instanceof Error ? err.message : "加载失败",
                          editorKey: prev[id]?.editorKey || 1,
                        },
                      }));
                    })
                  }
                />
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
          <div className="flex h-8 shrink-0 items-stretch overflow-x-auto overflow-y-hidden bg-elevated" data-testid="tables-tabs">
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
                    if (iframeRefs.current[id] !== node) {
                      frameReadyRef.current[id] = false;
                    }
                    iframeRefs.current[id] = node;
                  }}
                  data-testid={id === activeId ? "table-editor-frame" : undefined}
                  title={`${id} 编辑器`}
                  className={`absolute inset-0 h-full w-full border-0 bg-bg ${id === activeId ? "" : "invisible"}`}
                  sandbox="allow-scripts"
                  src={tablesApi.editorURL(id, checks[id]?.editorKey || 1)}
                  onLoad={() => {
                    frameReadyRef.current[id] = true;
                    tryInitFrame(id);
                  }}
                />
              ))
            )}
          </div>
          {activeId && activeSheets.length ? (
            <div className="flex h-8 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-t border-line bg-elevated" data-testid="tables-sheets">
              {activeSheets.map((sheet) => {
                const active = sheet.id === activeSheetId;
                return (
                  <button
                    key={sheet.id}
                    type="button"
                    data-testid={`tables-sheet-${sheet.id}`}
                    className={`max-w-[180px] shrink-0 truncate px-3 ${
                      active ? "border-b-2 border-accent bg-bg text-ink" : "text-muted hover:bg-hover"
                    }`}
                    onClick={() => {
                      if (sheet.id === sheetRef.current[activeId]) return;
                      sheetRef.current = { ...sheetRef.current, [activeId]: sheet.id };
                      setSheetById((prev) => ({ ...prev, [activeId]: sheet.id }));
                      postSlice(activeId, "setSheet");
                    }}
                  >
                    {sheet.name}
                  </button>
                );
              })}
            </div>
          ) : null}
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
        <Field label="表 id" hint="小写字母开头，仅字母数字下划线；可用 folder/id 建到子目录">
          <Input
            data-testid="tables-new-id"
            placeholder="item 或 combat/skill"
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
