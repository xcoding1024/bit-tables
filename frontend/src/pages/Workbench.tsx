import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { PanelLeft, PanelRight, Plus, X } from "lucide-react";
import { DocsMarkdown } from "../components/DocsMarkdown";
import { QuickSearch } from "../components/QuickSearch";
import { StatusLogBar, type StatusLogEntry, type StatusLogKind } from "../components/StatusLogBar";
import { TableHistoryPanel } from "../components/TableHistory";
import { PluginPanel } from "../components/PluginPanel";
import { Btn, Dialog, Field, Input } from "../components/ui";
import { TableTree, resolveTree } from "../components/TableTree";
import { tablesApi, type TableFiles, type TreeNode } from "../lib/api";
import { buildDepGraph, emptyExportReport, exportSet, type ExportProgress, type ExportReport, type TableSnap } from "../lib/deps";
import { filterFileHits, listFileHits, searchTableContent, type ContentHit, type FileHit } from "../lib/search";
import {
  LEFT_COLLAPSE_AT,
  LEFT_DEFAULT,
  LEFT_MAX,
  LEFT_MIN,
  RIGHT_COLLAPSE_AT,
  RIGHT_DEFAULT,
  RIGHT_MAX,
  RIGHT_MIN,
} from "../lib/panels";
import { usePanel } from "../lib/usePanel";
import {
  buildEnumsPayload,
  defaultSheetId,
  docsSection,
  listSheets,
  mergeSheetData,
  parseTableDoc,
  runTableChecker,
  exportParallelism,
  mapLimit,
  runTableExporter,
  parseCheckCell,
  sliceForSheet,
  stringifyTableDoc,
  type CheckCell,
  type DocsKind,
  type EnumCatalogItem,
  type SheetInfo,
  type TableCheckError,
} from "../lib/tableHost";
import {
  listExclusiveMeta,
  listPluginMeta,
  parseBindings,
  parseCellRef,
  recomputeBindings,
  rowsOfSheet,
  selectionToRef,
  stringifyBindings,
  type PluginBinding,
  type PluginDef,
  type PluginSelection,
} from "../lib/plugins";
import type { PluginPick } from "../components/PluginPanel";

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

type RightTab = DocsKind | "history" | "plugin";
type RevealTarget = { rowIndex: number; field?: string; query?: string };

export type EditorCommands = {
  undo: () => void;
  redo: () => void;
  save: () => void;
  exportCurrent: () => Promise<ExportReport>;
  exportAll: () => Promise<ExportReport>;
  checkCurrent: () => Promise<void>;
  checkAll: () => Promise<void>;
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

const LOG_LIMIT = 200;

function formatCheckErrors(errors: TableCheckError[]) {
  return errors.map((item) => `${item.path ? `${item.path}：` : ""}${item.message}`).join(" · ");
}

export default function Workbench({
  enumsCatalog = [],
  tablePacks = [],
  editorCommandsRef,
  onActiveIdChange,
  onExportProgress,
}: {
  rootPath: string;
  enumsCatalog?: EnumCatalogItem[];
  tablePacks?: TableSnap[];
  editorCommandsRef?: MutableRefObject<EditorCommands | null>;
  onActiveIdChange?: (id: string) => void;
  onExportProgress?: (progress: ExportProgress) => void;
}) {
  const left = usePanel("left", LEFT_DEFAULT, LEFT_MIN, LEFT_MAX, 1, LEFT_COLLAPSE_AT);
  const right = usePanel("right", RIGHT_DEFAULT, RIGHT_MIN, RIGHT_MAX, -1, RIGHT_COLLAPSE_AT);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeId, setActiveId] = useState("");
  const [filesById, setFilesById] = useState<Record<string, TableFiles>>({});
  const [draftById, setDraftById] = useState<Record<string, unknown>>({});
  const [sheetById, setSheetById] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, TabCheck>>({});
  const [rightTab, setRightTab] = useState<RightTab>("struct");
  const [pluginTarget, setPluginTarget] = useState<PluginSelection | null>(null);
  const [pluginPick, setPluginPick] = useState<PluginPick | null>(null);
  const [pickedRef, setPickedRef] = useState<{ pluginId: string; key: string; ref: string } | null>(null);
  const [genericPluginJs, setGenericPluginJs] = useState("");
  const [genericPlugins, setGenericPlugins] = useState<PluginDef[]>([]);
  const [exclusivePlugins, setExclusivePlugins] = useState<PluginDef[]>([]);
  const [bindingsById, setBindingsById] = useState<Record<string, PluginBinding[]>>({});
  const [pluginBusy, setPluginBusy] = useState(false);
  const [historyReload, setHistoryReload] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  const [checkProgress, setCheckProgress] = useState<{
    open: boolean;
    running: boolean;
    done: number;
    total: number;
    current: string;
    failed: number;
  } | null>(null);
  const checkAllRunning = useRef(false);
  const [newId, setNewId] = useState("");
  const [quickOpen, setQuickOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [fileQuery, setFileQuery] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [findScope, setFindScope] = useState<"sheet" | "all">("all");
  const [logs, setLogs] = useState<StatusLogEntry[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});
  const logSeq = useRef(0);
  const frameReadyRef = useRef<Record<string, boolean>>({});
  const pendingRevealRef = useRef<({ tableId: string } & RevealTarget) | null>(null);
  const pendingSelectRef = useRef<{ tableId: string; field: string; rowId: string } | null>(null);
  const locatingRef = useRef(false);
  const filesRef = useRef(filesById);
  const draftRef = useRef(draftById);
  const sheetRef = useRef(sheetById);
  const tabsRef = useRef(tabs);
  const activeRef = useRef(activeId);
  const enumsRef = useRef(enumsCatalog);
  const packsRef = useRef(tablePacks);
  const savedAtRef = useRef<Record<string, number>>({});
  const bindingsRef = useRef(bindingsById);
  const genericPluginJsRef = useRef(genericPluginJs);
  const recomputeTimer = useRef(0);
  const pluginPickRef = useRef<PluginPick | null>(null);
  const pluginTargetRef = useRef<PluginSelection | null>(null);
  const checksRef = useRef(checks);
  const errorCursorRef = useRef<Record<string, number>>({});
  const errorSigRef = useRef<Record<string, string>>({});
  bindingsRef.current = bindingsById;
  genericPluginJsRef.current = genericPluginJs;
  pluginPickRef.current = pluginPick;
  pluginTargetRef.current = pluginTarget;
  checksRef.current = checks;
  filesRef.current = filesById;
  draftRef.current = draftById;
  sheetRef.current = sheetById;
  tabsRef.current = tabs;
  activeRef.current = activeId;
  enumsRef.current = enumsCatalog;
  packsRef.current = tablePacks;

  const files = activeId ? filesById[activeId] || null : null;
  const docBody = rightTab === "history" || rightTab === "plugin" || !files ? "" : docsSection(files.docs || "", rightTab);
  const pluginList = useMemo(() => [...exclusivePlugins, ...genericPlugins], [exclusivePlugins, genericPlugins]);
  const errorCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, check] of Object.entries(checks)) {
      if (!check || check.ok) continue;
      const count = check.errors.length || (check.error ? 1 : 0);
      if (count) out[id] = count;
    }
    return out;
  }, [checks]);
  const pluginTableId = pluginTarget?.tableId || activeId;
  const pluginBindings = pluginTableId ? bindingsById[pluginTableId] || [] : [];

  const appendLog = useCallback((text: string, kind: StatusLogKind) => {
    const entry: StatusLogEntry = { id: ++logSeq.current, at: Date.now(), kind, text };
    setLogs((prev) => {
      const next = [...prev, entry];
      return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    });
  }, []);

  const toggleLog = useCallback(() => {
    setLogOpen((open) => !open);
  }, []);
  const activeStruct = files ? parseDoc(files.struct) : {};
  const activeSheets: SheetInfo[] = files ? listSheets(activeStruct) : [];
  const activeSheetId = files ? resolveSheetId(activeStruct, sheetById[activeId]) : "";
  const pluginSheetId = pluginTarget?.sheet || activeSheetId;

  const searchPacks = useMemo(() => {
    const byId = new Map<string, TableSnap>();
    for (const pack of tablePacks) {
      const id = String(pack.id || "").trim();
      if (id) byId.set(id, pack);
    }
    for (const [id, next] of Object.entries(filesById)) {
      byId.set(id, {
        id,
        struct: parseDoc(next.struct),
        data: Object.prototype.hasOwnProperty.call(draftById, id) ? draftById[id] : parseDoc(next.data),
      });
    }
    return [...byId.values()];
  }, [draftById, filesById, tablePacks]);

  const fileHits = useMemo(
    () => filterFileHits(listFileHits(tree), fileQuery),
    [fileQuery, tree],
  );

  const contentHits = useMemo(() => {
    if (!findOpen || !findQuery.trim() || !activeId) return [];
    return searchTableContent(searchPacks, findQuery, {
      tableId: activeId,
      sheetId: findScope === "sheet" ? activeSheetId : undefined,
    });
  }, [activeId, activeSheetId, findOpen, findQuery, findScope, searchPacks]);

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
    const bindings = parseBindings(next.plugins || "");
    bindingsRef.current = { ...bindingsRef.current, [id]: bindings };
    setBindingsById((prev) => ({ ...prev, [id]: bindings }));
  }, []);

  const rememberBindings = useCallback((id: string, bindings: PluginBinding[], pluginsText?: string) => {
    bindingsRef.current = { ...bindingsRef.current, [id]: bindings };
    setBindingsById((prev) => ({ ...prev, [id]: bindings }));
    const cur = filesRef.current[id];
    if (!cur) return;
    const next = { ...cur, plugins: pluginsText ?? stringifyBindings(bindings) };
    filesRef.current = { ...filesRef.current, [id]: next };
    setFilesById((prev) => ({ ...prev, [id]: next }));
  }, []);

  const postReveal = useCallback((id: string, target: RevealTarget) => {
    iframeRefs.current[id]?.contentWindow?.postMessage(
      { type: "reveal", rowIndex: target.rowIndex, field: target.field || "", query: target.query || "" },
      "*",
    );
  }, []);

  const takePendingReveal = useCallback((id: string): RevealTarget | null => {
    const pending = pendingRevealRef.current;
    if (!pending || pending.tableId !== id) return null;
    pendingRevealRef.current = null;
    return { rowIndex: pending.rowIndex, field: pending.field, query: pending.query };
  }, []);

  const takePendingSelect = useCallback((id: string): { field: string; rowId: string } | null => {
    const pending = pendingSelectRef.current;
    if (!pending || pending.tableId !== id) return null;
    pendingSelectRef.current = null;
    return { field: pending.field, rowId: pending.rowId };
  }, []);

  const checkMarksFor = (id: string, sheetId: string) => {
    const parsed = (checksRef.current[id]?.errors || [])
      .map((item) => parseCheckCell(item))
      .filter((item): item is CheckCell => Boolean(item));
    return {
      errors: parsed
        .filter((item) => item.sheet === sheetId)
        .map((item) => ({ rowIndex: item.rowIndex, field: item.field, message: item.message })),
      total: parsed.length,
    };
  };

  const postSlice = useCallback(
    (id: string, type: "init" | "setSheet" | "replaceData", extra?: { reveal?: RevealTarget | null; selectByRef?: { field: string; rowId: string } | null }) => {
      const frame = iframeRefs.current[id];
      const cur = filesRef.current[id];
      if (!frame?.contentWindow || !cur) return;
      const struct = structOf(id);
      const sheetId = sheetOf(id, struct);
      const sliced = sliceForSheet(struct, fullDataOf(id), sheetId);
      const enums = buildEnumsPayload(struct, cur.id, enumsRef.current);
      const reveal = extra?.reveal || undefined;
      const selectByRef = extra?.selectByRef || undefined;
      const pluginCells = (bindingsRef.current[id] || parseBindings(cur.plugins || ""))
        .filter((item) => item.sheet === sheetId)
        .map((item) => ({ row: item.row, field: item.field }));
      const marks = checkMarksFor(id, sheetId);
      if (type === "replaceData") {
        frame.contentWindow.postMessage(
          { type: "replaceData", sheetId, struct: sliced.struct, data: sliced.data, enums, pluginCells, reveal, selectByRef, checkErrors: marks.errors, errorTotal: marks.total },
          "*",
        );
        return;
      }
      frame.contentWindow.postMessage(
        { type, tableId: cur.id, sheetId, struct: sliced.struct, data: sliced.data, enums, pluginCells, theme: "dark", reveal, selectByRef, checkErrors: marks.errors, errorTotal: marks.total },
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
      postSlice(id, "init", { reveal: takePendingReveal(id), selectByRef: takePendingSelect(id) });
    },
    [postSlice, takePendingReveal, takePendingSelect],
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
    let done = 0;
    const running = new Set<string>();
    const publish = (writing = false) => {
      onExportProgress?.({ done, total: ids.length, running: [...running], writing });
    };
    publish();
    const slots = await mapLimit(ids, exportParallelism(), async (id) => {
      running.add(id);
      publish();
      try {
        const cached = filesRef.current[id];
        let exportJs = String(cached?.export || "");
        let dataText = cached?.data || "";
        let structText = cached?.struct || "";
        let hasExport = Boolean(cached?.hasExport && exportJs.trim());
        if (!cached) {
          try {
            const src = await tablesApi.exportSource(id);
            exportJs = src.export || "";
            dataText = src.data || "";
            structText = src.struct || "";
            hasExport = Boolean(src.hasExport && exportJs.trim());
          } catch (err: unknown) {
            return { id, error: err instanceof Error ? err.message : "读取表失败", client: [] as { name: string; content: string }[], server: [] as { name: string; content: string }[] };
          }
        }
        if (!hasExport) {
          return { id, skipped: "无导出脚本", client: [] as { name: string; content: string }[], server: [] as { name: string; content: string }[] };
        }
        const result = await runTableExporter(exportJs, fullDataOf(id, dataText), parseDoc(structText));
        if (!result.ok) {
          return { id, error: result.error || "导出失败", client: [] as { name: string; content: string }[], server: [] as { name: string; content: string }[] };
        }
        if (!result.client.length && !result.server.length) {
          return { id, skipped: "未产生文件", client: [] as { name: string; content: string }[], server: [] as { name: string; content: string }[] };
        }
        return { id, client: result.client, server: result.server };
      } finally {
        running.delete(id);
        done += 1;
        publish();
      }
    });
    for (const slot of slots) {
      if (slot.error) {
        report.errors.push({ tableId: slot.id, message: slot.error });
        continue;
      }
      if (slot.skipped) {
        report.skipped.push({ tableId: slot.id, reason: slot.skipped });
        continue;
      }
      for (const file of slot.client) pendingClient.push({ tableId: slot.id, name: file.name, content: file.content });
      for (const file of slot.server) pendingServer.push({ tableId: slot.id, name: file.name, content: file.content });
    }
    if (pendingClient.length || pendingServer.length) {
      publish(true);
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
  }, [fullDataOf, onExportProgress]);

  const postEditorCmd = useCallback((type: "undo" | "redo" | "save" | "clearReveal") => {
    const id = activeRef.current;
    if (!id) return;
    iframeRefs.current[id]?.contentWindow?.postMessage({ type }, "*");
  }, []);

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
      if (key === "escape" && !mod && !ev.altKey) {
        postEditorCmd("clearReveal");
        return;
      }
      if (ev.ctrlKey && !ev.metaKey && !ev.altKey && (ev.key === "`" || ev.code === "Backquote")) {
        ev.preventDefault();
        toggleLog();
        return;
      }
      if (!mod || ev.altKey) return;
      if (key === "p") {
        ev.preventDefault();
        setFindOpen(false);
        setQuickOpen(true);
        setFileQuery("");
        return;
      }
      if (key === "f") {
        ev.preventDefault();
        setQuickOpen(false);
        setFindOpen(true);
        setFindQuery("");
        return;
      }
      if (key === "s") {
        ev.preventDefault();
        postEditorCmd("save");
        return;
      }
      if (key === "Escape" && pluginPickRef.current) {
        ev.preventDefault();
        setPluginPick(null);
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
  }, [postEditorCmd, toggleLog]);

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

  const runCheck = useCallback(async (id: string, next: TableFiles, data?: unknown, silent?: boolean) => {
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
    if (!silent) {
      if (result.ok) appendLog(`${id} 检查通过`, "ok");
      else appendLog(formatCheckErrors(result.errors) || `${id} 检查失败`, "err");
    }
    return result.ok;
  }, [appendLog]);

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
      checkCurrent: async () => {
        const id = activeRef.current;
        if (!id) return;
        let files = filesRef.current[id];
        if (!files) {
          files = await tablesApi.files(id);
          rememberFiles(id, files);
        }
        await runCheck(id, files, fullDataOf(id));
      },
      checkAll: async () => {
        if (checkAllRunning.current) return;
        checkAllRunning.current = true;
        try {
          const listed = await tablesApi.list();
          const ids = (listed.tables || []).map((item) => String(item.id || "").trim()).filter(Boolean);
          let failed = 0;
          setCheckProgress({ open: true, running: true, done: 0, total: ids.length, current: ids[0] || "", failed: 0 });
          await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
          for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            setCheckProgress({ open: true, running: true, done: i, total: ids.length, current: id, failed });
            try {
              let files = filesRef.current[id];
              if (!files) {
                files = await tablesApi.files(id);
                rememberFiles(id, files);
              }
              const data = Object.prototype.hasOwnProperty.call(draftRef.current, id) ? draftRef.current[id] : parseDoc(files.data);
              const ok = await runCheck(id, files, data, true);
              if (!ok) failed += 1;
            } catch (err: unknown) {
              failed += 1;
              const message = err instanceof Error ? err.message : "检查失败";
              setChecks((prev) => ({
                ...prev,
                [id]: { ok: false, errors: [], error: message, editorKey: prev[id]?.editorKey || 1 },
              }));
            }
          }
          setCheckProgress({ open: true, running: false, done: ids.length, total: ids.length, current: "", failed });
          appendLog(failed ? `检查完成：${failed} 张表未通过` : "检查完成：全部通过", failed ? "err" : "ok");
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "检查失败";
          setCheckProgress({ open: true, running: false, done: 0, total: 0, current: message, failed: 0 });
          appendLog(message, "err");
        } finally {
          checkAllRunning.current = false;
        }
      },
    };
    return () => {
      editorCommandsRef.current = null;
    };
  }, [appendLog, editorCommandsRef, fullDataOf, postEditorCmd, rememberFiles, runCheck, runExport]);

  const loadTablePack = useCallback(async (id: string) => {
    if (filesRef.current[id] || Object.prototype.hasOwnProperty.call(draftRef.current, id)) {
      return { data: fullDataOf(id), struct: structOf(id) };
    }
    try {
      const next = await tablesApi.files(id);
      rememberFiles(id, next);
      return { data: parseDoc(next.data), struct: parseDoc(next.struct) };
    } catch {
      return null;
    }
  }, [fullDataOf, rememberFiles, structOf]);

  const runRecompute = useCallback(
    async (id: string, data = fullDataOf(id), bindings = bindingsRef.current[id] || []) => {
      if (!bindings.length) return data;
      const result = await recomputeBindings({
        tableId: id,
        data,
        struct: structOf(id),
        bindings,
        scripts: [genericPluginJsRef.current, filesRef.current[id]?.plugin || ""],
        loadTable: loadTablePack,
      });
      if (result.error) {
        appendLog(`${id} 插件：${result.error}`, "err");
        return data;
      }
      rememberDraft(id, result.data);
      if (JSON.stringify(result.data) !== JSON.stringify(data)) {
        postSlice(id, "replaceData");
      }
      return result.data;
    },
    [appendLog, fullDataOf, loadTablePack, postSlice, rememberDraft, structOf],
  );

  const scheduleRecompute = useCallback(
    (id: string) => {
      window.clearTimeout(recomputeTimer.current);
      recomputeTimer.current = window.setTimeout(() => {
        void runRecompute(id);
      }, 400);
    },
    [runRecompute],
  );

  const loadList = useCallback(async () => {
    const next = await tablesApi.list();
    const tables = next.tables || [];
    setTree(resolveTree(next.tree, tables));
    return tables;
  }, []);

  const openTable = useCallback(
    async (id: string, remount: boolean, preferredSheet?: string) => {
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
        const sheetId = resolveSheetId(struct, preferredSheet || prev[id]);
        sheetRef.current = { ...sheetRef.current, [id]: sheetId };
        return { ...prev, [id]: sheetId };
      });
      rememberFiles(id, next);
      setChecks((prev) => {
        const prevKey = prev[id]?.editorKey || 0;
        const nextKey = remount ? prevKey + 1 : prevKey || 1;
        if (remount && prevKey >= 1) {
          frameReadyRef.current[id] = false;
        }
        return {
          ...prev,
          [id]: {
            ok: prev[id]?.ok || false,
            errors: prev[id]?.errors || [],
            error: "",
            editorKey: nextKey,
          },
        };
      });
      if (!remount) {
        postSlice(id, "replaceData", { reveal: takePendingReveal(id), selectByRef: takePendingSelect(id) });
      } else {
        tryInitFrame(id);
      }
      await runCheck(id, next, data);
    },
    [postSlice, rememberDraft, rememberFiles, runCheck, takePendingReveal, takePendingSelect, tryInitFrame],
  );

  const handleOpenTable = useCallback(
    (id: string, remount: boolean, sheetId?: string) => {
      void openTable(id, remount, sheetId).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "加载失败";
        appendLog(message, "err");
        setChecks((prev) => ({
          ...prev,
          [id]: {
            ok: false,
            errors: [],
            error: message,
            editorKey: prev[id]?.editorKey || 1,
          },
        }));
      });
    },
    [appendLog, openTable],
  );

  const handleOpenHit = useCallback(
    (hit: ContentHit) => {
      const target: RevealTarget = { rowIndex: hit.rowIndex, field: hit.field, query: findQuery };
      pendingRevealRef.current = { tableId: hit.tableId, ...target };
      const cur = filesRef.current[hit.tableId];
      if (!cur) {
        handleOpenTable(hit.tableId, true, hit.sheetId);
        return;
      }
      const nextSheet = resolveSheetId(parseDoc(cur.struct), hit.sheetId);
      writeTableParam(hit.tableId);
      setActiveId(hit.tableId);
      if (!tabsRef.current.includes(hit.tableId)) {
        setTabs((prev) => (prev.includes(hit.tableId) ? prev : [...prev, hit.tableId]));
      }
      const sheetChanged = sheetRef.current[hit.tableId] !== nextSheet;
      if (sheetChanged) {
        sheetRef.current = { ...sheetRef.current, [hit.tableId]: nextSheet };
        setSheetById((prev) => ({ ...prev, [hit.tableId]: nextSheet }));
      }
      const send = () => {
        if (!iframeRefs.current[hit.tableId]?.contentWindow) return false;
        pendingRevealRef.current = null;
        if (sheetChanged) postSlice(hit.tableId, "setSheet", { reveal: target });
        else postReveal(hit.tableId, target);
        return true;
      };
      if (send()) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          send();
        });
      });
    },
    [findQuery, handleOpenTable, postReveal, postSlice],
  );

  const locatePluginRef = useCallback(
    (ref: string) => {
      const parsed = parseCellRef(ref);
      if (!parsed?.field) return;
      const field = parsed.field;
      locatingRef.current = true;
      const rowId = parsed.row || "*";
      const packData = Object.prototype.hasOwnProperty.call(draftRef.current, parsed.table)
        ? draftRef.current[parsed.table]
        : parseDoc(filesRef.current[parsed.table]?.data || "");
      const rows = rowsOfSheet(packData, parsed.sheet);
      let rowIndex = 0;
      if (rowId !== "*") {
        const idx = rows.findIndex((item) => String(item.id ?? "").trim() === rowId);
        if (idx >= 0) rowIndex = idx;
      }
      const reveal: RevealTarget = { rowIndex, field };
      pendingSelectRef.current = { tableId: parsed.table, field, rowId };
      pendingRevealRef.current = { tableId: parsed.table, ...reveal };
      const finish = () => {
        window.setTimeout(() => {
          locatingRef.current = false;
        }, 400);
      };
      const cur = filesRef.current[parsed.table];
      if (!cur) {
        handleOpenTable(parsed.table, true, parsed.sheet);
        finish();
        return;
      }
      writeTableParam(parsed.table);
      setActiveId(parsed.table);
      if (!tabsRef.current.includes(parsed.table)) {
        setTabs((prev) => (prev.includes(parsed.table) ? prev : [...prev, parsed.table]));
      }
      const nextSheet = resolveSheetId(parseDoc(cur.struct), parsed.sheet);
      const sheetChanged = sheetRef.current[parsed.table] !== nextSheet;
      if (sheetChanged) {
        sheetRef.current = { ...sheetRef.current, [parsed.table]: nextSheet };
        setSheetById((prev) => ({ ...prev, [parsed.table]: nextSheet }));
      }
      const send = () => {
        if (!iframeRefs.current[parsed.table]?.contentWindow) return false;
        pendingSelectRef.current = null;
        pendingRevealRef.current = null;
        if (sheetChanged) {
          postSlice(parsed.table, "setSheet", { reveal, selectByRef: { field, rowId } });
        } else {
          iframeRefs.current[parsed.table]?.contentWindow?.postMessage(
            { type: "selectByRef", field, rowId },
            "*",
          );
        }
        finish();
        return true;
      };
      if (send()) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!send()) finish();
        });
      });
    },
    [handleOpenTable, postSlice],
  );

  const jumpNextError = useCallback(
    (id: string) => {
      const parsed = (checksRef.current[id]?.errors || [])
        .map((item) => parseCheckCell(item))
        .filter((item): item is CheckCell => Boolean(item));
      if (!parsed.length) return;
      const sig = parsed.map((item) => `${item.sheet}.${item.rowIndex}.${item.field}`).join("|");
      if (errorSigRef.current[id] !== sig) {
        errorSigRef.current[id] = sig;
        errorCursorRef.current[id] = -1;
      }
      const idx = ((errorCursorRef.current[id] ?? -1) + 1) % parsed.length;
      errorCursorRef.current[id] = idx;
      const hit = parsed[idx];
      const reveal: RevealTarget = { rowIndex: hit.rowIndex, field: hit.field };
      const cur = filesRef.current[id];
      if (!cur) return;
      const nextSheet = resolveSheetId(parseDoc(cur.struct), hit.sheet);
      const sheetChanged = sheetRef.current[id] !== nextSheet;
      if (sheetChanged) {
        sheetRef.current = { ...sheetRef.current, [id]: nextSheet };
        setSheetById((prev) => ({ ...prev, [id]: nextSheet }));
        postSlice(id, "setSheet", { reveal });
        return;
      }
      postReveal(id, reveal);
    },
    [postReveal, postSlice],
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
      setPluginTarget((prev) => (prev?.tableId === id ? null : prev));
      setPluginPick(null);
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
          const message = err instanceof Error ? err.message : "加载失败";
          appendLog(message, "err");
          const id = readTableParam();
          if (id) {
            setChecks((prev) => ({
              ...prev,
              [id]: { ok: false, errors: [], error: message, editorKey: 1 },
            }));
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [appendLog, loadList, openTable]);

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const id = Object.keys(iframeRefs.current).find((key) => iframeRefs.current[key]?.contentWindow === ev.source);
      if (!id || !ev.data || typeof ev.data !== "object") return;
      const frame = iframeRefs.current[id];
      const msg = ev.data as { type?: string; data?: unknown; key?: string; text?: string };
      const cur = filesRef.current[id];
      if (msg.type === "ready" && frame) {
        frameReadyRef.current[id] = true;
        tryInitFrame(id);
      } else if (msg.type === "dirty") {
        applyPartial(id, msg.data);
        scheduleRecompute(id);
      } else if (msg.type === "save") {
        if (!cur) return;
        const merged = applyPartial(id, msg.data);
        savedAtRef.current[id] = Date.now();
        void runRecompute(id, merged)
          .then((computed) => tablesApi.putData(cur.id, stringifyTableDoc(computed)))
          .then(() => tablesApi.files(cur.id))
          .then((next) => {
            savedAtRef.current[id] = Date.now();
            rememberFiles(id, next);
            rememberDraft(id, parseDoc(next.data));
            appendLog(`${id} 已保存`, "ok");
            return runCheck(id, next, parseDoc(next.data));
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : "保存失败";
            appendLog(message, "err");
            setChecks((prev) => ({
              ...prev,
              [id]: {
                ...prev[id],
                ok: false,
                errors: prev[id]?.errors || [],
                error: message,
                editorKey: prev[id]?.editorKey || 1,
              },
            }));
          });
      } else if (msg.type === "shortcut") {
        const key = String(msg.key || "");
        if (key === "p") {
          setFindOpen(false);
          setQuickOpen(true);
          setFileQuery("");
        } else if (key === "f") {
          setQuickOpen(false);
          setFindOpen(true);
          setFindQuery("");
        } else if (key === "`") {
          toggleLog();
        }
      } else if (msg.type === "nextError") {
        jumpNextError(id);
      } else if (msg.type === "selection") {
        const raw = ev.data as { sheet?: string; tableId?: string; mode?: PluginSelection["mode"]; cells?: PluginSelection["cells"] };
        const mode: PluginSelection["mode"] = raw.mode === "col" || raw.mode === "row" ? raw.mode : "cell";
        const cells = Array.isArray(raw.cells)
          ? raw.cells.filter((item) => item && item.field && (mode === "col" || item.id))
          : [];
        const next: PluginSelection | null = cells.length
          ? { tableId: String(raw.tableId || id), sheet: String(raw.sheet || sheetRef.current[id] || ""), mode, cells }
          : null;
        if (locatingRef.current) return;
        const pick = pluginPickRef.current;
        if (pick?.kind === "source" && next) {
          const ref = selectionToRef(next);
          if (ref) setPickedRef({ pluginId: pick.pluginId, key: pick.key, ref });
        } else if (pick?.kind === "target" && next) {
          setPluginTarget(next);
        } else if (!pick && !pluginTargetRef.current) {
          setPluginTarget(next);
        }
      } else if (msg.type === "copyText") {
        const text = String(msg.text || "");
        if (!text) return;
        void navigator.clipboard.writeText(text).catch(() => {
          appendLog("复制引用失败", "err");
        });
      } else if (msg.type === "askAI") {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(msg, "*");
        } else {
          const message = "请用 Cursor / Codex 直接改表目录中的文件";
          appendLog(message, "err");
          setChecks((prev) => ({
            ...prev,
            [id]: {
              ...prev[id],
              ok: false,
              errors: prev[id]?.errors || [],
              error: message,
              editorKey: prev[id]?.editorKey || 1,
            },
          }));
        }
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [appendLog, applyPartial, jumpNextError, postSlice, rememberDraft, rememberFiles, runCheck, runRecompute, scheduleRecompute, toggleLog, tryInitFrame]);

  useEffect(() => {
    for (const id of tabs) {
      const frame = iframeRefs.current[id];
      if (!frame?.contentWindow) continue;
      const sheetId = sheetRef.current[id] || "";
      const marks = checkMarksFor(id, sheetId);
      frame.contentWindow.postMessage({ type: "checkErrors", errors: marks.errors, total: marks.total }, "*");
    }
  }, [checks, sheetById, tabs]);

  useEffect(() => {
    let cancelled = false;
    void tablesApi
      .plugins()
      .then(async (next) => {
        const script = next.script || "";
        const metas = await listPluginMeta(script, "");
        if (cancelled) return;
        setGenericPluginJs(script);
        setGenericPlugins(metas.map((item) => ({ ...item, kind: item.kind || "generic" })));
      })
      .catch((err: unknown) => {
        if (!cancelled) appendLog(err instanceof Error ? err.message : "加载通用插件失败", "err");
      });
    return () => {
      cancelled = true;
    };
  }, [appendLog]);

  useEffect(() => {
    const id = pluginTarget?.tableId || activeId;
    if (!id) {
      setExclusivePlugins([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      let script = filesById[id]?.plugin || "";
      if (!script && !filesById[id]) {
        try {
          const next = await tablesApi.files(id);
          if (cancelled) return;
          rememberFiles(id, next);
          script = next.plugin || "";
        } catch {
          script = "";
        }
      }
      try {
        const list = await listExclusiveMeta(script, id);
        if (!cancelled) setExclusivePlugins(list);
      } catch {
        if (!cancelled) setExclusivePlugins([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeId, filesById, pluginTarget, rememberFiles]);

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
            await runCheck(id, next, parseDoc(next.data), true);
          } else {
            postSlice(id, "replaceData");
            await runCheck(id, next, parseDoc(next.data), true);
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
      const message = err instanceof Error ? err.message : "创建失败";
      appendLog(message, "err");
      setChecks((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          errors: [],
          error: message,
          editorKey: prev[id]?.editorKey || 1,
        },
      }));
    }
  }

  const persistBindings = async (id: string, bindings: PluginBinding[]) => {
    const text = stringifyBindings(bindings);
    rememberBindings(id, bindings, text);
    await tablesApi.putPlugins(id, text);
    const computed = await runRecompute(id, fullDataOf(id), bindings);
    postSlice(id, "replaceData");
    return computed;
  };

  const handleBindPlugin = (binding: PluginBinding) => {
    const id = pluginTableId;
    if (!id) return;
    const prev = bindingsRef.current[id] || [];
    const next = [
      ...prev.filter((item) => !(item.sheet === binding.sheet && item.field === binding.field)),
      binding,
    ];
    setPluginBusy(true);
    void persistBindings(id, next)
      .then(() => appendLog(`${id} 已绑定插件 ${binding.plugin}`, "ok"))
      .catch((err: unknown) => appendLog(err instanceof Error ? err.message : "绑定失败", "err"))
      .finally(() => setPluginBusy(false));
  };

  const handleUnbindPlugin = (binding: PluginBinding) => {
    const id = pluginTableId;
    if (!id) return;
    const prev = bindingsRef.current[id] || [];
    const next = prev.filter((item) => !(item.sheet === binding.sheet && item.row === binding.row && item.field === binding.field));
    setPluginBusy(true);
    void persistBindings(id, next)
      .then(() => appendLog(`${id} 已解除插件绑定`, "ok"))
      .catch((err: unknown) => appendLog(err instanceof Error ? err.message : "解除失败", "err"))
      .finally(() => setPluginBusy(false));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <aside className="relative flex shrink-0 flex-col overflow-hidden bg-sidebar" style={{ width: left.displayWidth }}>
          {left.collapsed ? (
            <button
              type="button"
              data-testid="tables-left-expand"
              title="展开文件栏"
              onClick={left.expand}
              className="flex h-8 w-full items-center justify-center text-muted hover:bg-hover hover:text-ink"
            >
              <PanelLeft size={15} />
            </button>
          ) : (
            <>
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
                  errorCounts={errorCounts}
                  onOpen={(id) => handleOpenTable(id, !filesById[id])}
                />
              </div>
            </>
          )}
          <div
            data-testid="tables-left-resize"
            className={`panel-resize absolute inset-y-0 right-0 z-20 w-1.5 ${left.dragging ? "dragging" : ""}`}
            onPointerDown={left.onResizeStart}
          />
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

        <aside className="relative flex shrink-0 flex-col overflow-hidden bg-sidebar" style={{ width: right.displayWidth }}>
          <div
            data-testid="tables-right-resize"
            className={`panel-resize absolute inset-y-0 left-0 z-20 w-1.5 ${right.dragging ? "dragging" : ""}`}
            onPointerDown={right.onResizeStart}
          />
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
                    ["plugin", "插件"],
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
              </div>
              <div
                className={`min-h-0 flex-1 px-3 py-3 ${rightTab === "history" ? "overflow-hidden" : "overflow-auto"}`}
                data-testid="tables-docs"
              >
                {!activeId ? (
                  <div className="text-muted">打开配置表后显示文档</div>
                ) : rightTab === "history" ? (
                  <TableHistoryPanel tableId={activeId} reloadKey={historyReload} />
                ) : rightTab === "plugin" ? (
                  <PluginPanel
                    tableId={pluginTableId}
                    sheetId={pluginSheetId}
                    target={pluginTarget}
                    plugins={pluginList}
                    bindings={pluginBindings}
                    busy={pluginBusy}
                    picking={pluginPick}
                    pickedRef={pickedRef}
                    onStartPick={(pick) => {
                      setPluginPick(pick);
                      setPickedRef(null);
                    }}
                    onCancelPick={() => setPluginPick(null)}
                    onLocate={locatePluginRef}
                    onBind={handleBindPlugin}
                    onUnbind={handleUnbindPlugin}
                    onRecompute={() => {
                      if (!pluginTableId) return;
                      setPluginBusy(true);
                      void runRecompute(pluginTableId)
                        .then(() => appendLog(`${pluginTableId} 已重算插件`, "ok"))
                        .catch((err: unknown) => appendLog(err instanceof Error ? err.message : "重算失败", "err"))
                        .finally(() => setPluginBusy(false));
                    }}
                  />
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

      <StatusLogBar logs={logs} expanded={logOpen} onToggle={toggleLog} />

      <QuickSearch<FileHit>
        open={quickOpen}
        title="打开文件"
        placeholder="搜索文件名"
        query={fileQuery}
        onQuery={setFileQuery}
        items={fileHits}
        emptyText={tree.length ? "无匹配文件" : "暂无配置表"}
        testId="tables-quick-open"
        onClose={() => setQuickOpen(false)}
        onPick={(item) => {
          setQuickOpen(false);
          handleOpenTable(item.id, !filesById[item.id]);
        }}
        renderItem={(item) => (
          <>
            <div className="truncate text-[13px]">{item.name}</div>
            <div className="truncate font-mono text-[11px] text-muted">{item.path || item.id}</div>
          </>
        )}
      />
      <QuickSearch<ContentHit>
        open={findOpen}
        title="在当前表中查找"
        placeholder={activeId ? "搜索当前表" : "先打开一张配置表"}
        query={findQuery}
        onQuery={setFindQuery}
        items={contentHits}
        emptyText={!activeId ? "先打开一张配置表" : findQuery.trim() ? "无匹配内容" : "输入关键字"}
        testId="tables-find"
        onClose={() => setFindOpen(false)}
        extra={
          <div className="flex gap-1">
            {(
              [
                ["all", "全部 Sheet"],
                ["sheet", "当前 Sheet"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`h-6 rounded px-2 text-[11px] ${
                  findScope === id ? "bg-active text-ink" : "text-muted hover:bg-hover hover:text-ink"
                }`}
                onClick={() => setFindScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
        }
        onPick={(hit) => {
          setFindOpen(false);
          handleOpenHit(hit);
        }}
        renderItem={(hit) => (
          <>
            <div className="truncate text-[13px]">
              {hit.sheetName}
              <span className="text-muted"> · {hit.label}</span>
            </div>
            <div className="truncate text-[11px] text-muted">{hit.value}</div>
          </>
        )}
      />
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
      <Dialog
        open={Boolean(checkProgress?.open)}
        title={checkProgress?.running ? "正在检查" : checkProgress?.failed ? "检查完成（有错误）" : "检查完成"}
        onClose={() => {
          if (checkProgress?.running) return;
          setCheckProgress(null);
        }}
        footer={
          checkProgress?.running ? undefined : (
            <Btn data-testid="tables-check-close" onClick={() => setCheckProgress(null)}>
              关闭
            </Btn>
          )
        }
      >
        {checkProgress ? (
          <div data-testid="tables-check-progress" className="space-y-2 text-[13px]">
            <div className="text-secondary">
              已检查 {checkProgress.done} / {checkProgress.total}
            </div>
            <div className="h-1.5 overflow-hidden rounded bg-hover">
              <div
                className="h-full bg-accent"
                style={{
                  width: checkProgress.total ? `${Math.round((checkProgress.done / checkProgress.total) * 100)}%` : "0%",
                }}
              />
            </div>
            {checkProgress.running && checkProgress.current ? (
              <div className="truncate font-mono text-[12px] text-muted">当前 {checkProgress.current}</div>
            ) : checkProgress.failed ? (
              <div className="text-danger">{checkProgress.failed} 张表未通过</div>
            ) : checkProgress.current ? (
              <div className="text-danger">{checkProgress.current}</div>
            ) : (
              <div className="text-secondary">全部通过</div>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
