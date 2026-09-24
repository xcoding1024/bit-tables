import { useCallback, useEffect, useRef, useState } from "react";
import { DepsDialog } from "./components/DepsDialog";
import { EnumsDialog } from "./components/EnumsDialog";
import { ExportDialog } from "./components/ExportDialog";
import { TemplatesDialog } from "./components/TemplatesDialog";
import Titlebar from "./components/Titlebar";
import { tablesApi } from "./lib/api";
import { emptyExportReport, type ExportProgress, type ExportReport, type TableSnap } from "./lib/deps";
import { buildEnumsCatalog, parseTableDoc, type EnumCatalogItem } from "./lib/tableHost";
import { shell } from "./lib/shell";
import Guide, { CreateSampleDialog, OpenDialog } from "./pages/Guide";
import { useGuideDialogs } from "./pages/useGuideDialogs";
import Workbench, { type EditorCommands } from "./pages/Workbench";

function parseDoc(text: string): unknown {
  try {
    return parseTableDoc(text || "");
  } catch {
    return {};
  }
}

export default function App() {
  const [rootPath, setRootPath] = useState("");
  const [guide, setGuide] = useState(false);
  const [bootError, setBootError] = useState("");
  const [enumsCatalog, setEnumsCatalog] = useState<EnumCatalogItem[]>([]);
  const [tablePacks, setTablePacks] = useState<TableSnap[]>([]);
  const [enumsOpen, setEnumsOpen] = useState(false);
  const [depsOpen, setDepsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportReport, setExportReport] = useState<ExportReport | null>(null);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [activeTableId, setActiveTableId] = useState("");
  const [recentRoots, setRecentRoots] = useState<string[]>([]);
  const dialogs = useGuideDialogs();
  const sh = shell();
  const editorCommandsRef = useRef<EditorCommands | null>(null);
  const workbenchReady = !bootError && !guide && Boolean(rootPath);

  const handleActiveIdChange = useCallback((id: string) => {
    setActiveTableId(id);
  }, []);

  const refreshRecentRoots = useCallback(async () => {
    if (!sh?.listRecentRoots) {
      setRecentRoots([]);
      return;
    }
    try {
      setRecentRoots(await sh.listRecentRoots());
    } catch {
      setRecentRoots([]);
    }
  }, [sh]);

  const reloadEnumsCatalog = useCallback(async () => {
    try {
      const listed = await tablesApi.list();
      const tables = listed.tables || [];
      const packed = await Promise.all(
        tables.map(async (item) => {
          const files = await tablesApi.files(item.id);
          return {
            id: item.id,
            struct: parseDoc(files.struct),
            data: parseDoc(files.data),
          };
        }),
      );
      setTablePacks(packed);
      setEnumsCatalog(buildEnumsCatalog(packed));
    } catch {
      setTablePacks([]);
      setEnumsCatalog([]);
    }
  }, []);

  useEffect(() => {
    void refreshRecentRoots();
  }, [refreshRecentRoots]);

  useEffect(() => {
    tablesApi
      .root()
      .then(async (next) => {
        setRootPath(next.path || "");
        setGuide(Boolean(next.guide));
        if (!next.guide && next.path) {
          await reloadEnumsCatalog();
          try {
            await sh?.rememberRoot?.(next.path);
            await refreshRecentRoots();
          } catch {
            /* ignore */
          }
        } else {
          setTablePacks([]);
          setEnumsCatalog([]);
        }
      })
      .catch((err: unknown) => {
        setBootError(err instanceof Error ? err.message : "无法连接本机服务");
      });
  }, [reloadEnumsCatalog, refreshRecentRoots, sh]);

  useEffect(() => {
    if (guide || !rootPath || !window.EventSource) return;
    const es = new EventSource("/api/events");
    es.addEventListener("file_changed", () => {
      void reloadEnumsCatalog();
    });
    return () => es.close();
  }, [guide, rootPath, reloadEnumsCatalog]);

  async function applyRoot(dir: string, opts?: { sample?: boolean }) {
    const next = await tablesApi.setRoot(dir, opts);
    setRootPath(next.path);
    setGuide(Boolean(next.guide));
    setBootError("");
    dialogs.setKind("");
    dialogs.setBusy(false);
    dialogs.setError("");
    if (!next.guide) {
      await reloadEnumsCatalog();
    } else {
      setTablePacks([]);
      setEnumsCatalog([]);
    }
    try {
      await sh?.rememberRoot?.(next.path);
      await refreshRecentRoots();
    } catch {
      /* 记住上次目录失败不影响当前打开 */
    }
  }

  async function openRecent(dir: string) {
    try {
      await applyRoot(dir);
    } catch (err: unknown) {
      setBootError(err instanceof Error ? err.message : "打开失败");
    }
  }

  async function confirmOpen() {
    const dir = dialogs.openPath.trim();
    if (!dir) return;
    dialogs.setBusy(true);
    dialogs.setError("");
    try {
      await applyRoot(dir);
    } catch (err: unknown) {
      dialogs.setError(err instanceof Error ? err.message : "打开失败");
      dialogs.setBusy(false);
    }
  }

  async function confirmCreate() {
    const dir = dialogs.createPath.trim().replace(/[/\\]+$/, "");
    if (!dir) return;
    dialogs.setBusy(true);
    dialogs.setError("");
    try {
      const tablesRoot = /(?:^|[/\\])tables$/i.test(dir)
        ? dir
        : `${dir}${dir.includes("\\") ? "\\" : "/"}tables`;
      await applyRoot(tablesRoot, { sample: true });
    } catch (err: unknown) {
      dialogs.setError(err instanceof Error ? err.message : "创建失败");
      dialogs.setBusy(false);
    }
  }

  async function handleExport(kind: "current" | "all") {
    const cmds = editorCommandsRef.current;
    if (!cmds) return;
    setExportBusy(true);
    setExportOpen(true);
    setExportReport(null);
    setExportProgress({ done: 0, total: 0, running: [], writing: false });
    try {
      const report = kind === "current" ? await cmds.exportCurrent() : await cmds.exportAll();
      setExportReport(report);
    } catch (err: unknown) {
      setExportReport(
        emptyExportReport({
          errors: [{ tableId: "", message: err instanceof Error ? err.message : "导出失败" }],
        }),
      );
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <Titlebar
        rootPath={workbenchReady ? rootPath : ""}
        onOpen={sh ? dialogs.startOpen : undefined}
        onCreateSample={sh ? dialogs.startCreate : undefined}
        recentRoots={recentRoots}
        onOpenRecent={sh ? openRecent : undefined}
        onEnums={workbenchReady ? () => setEnumsOpen(true) : undefined}
        onDeps={workbenchReady ? () => setDepsOpen(true) : undefined}
        onTemplates={() => setTemplatesOpen(true)}
        onUndo={workbenchReady ? () => editorCommandsRef.current?.undo() : undefined}
        onRedo={workbenchReady ? () => editorCommandsRef.current?.redo() : undefined}
        onSave={workbenchReady ? () => editorCommandsRef.current?.save() : undefined}
        onCheckCurrent={workbenchReady && activeTableId ? () => void editorCommandsRef.current?.checkCurrent() : undefined}
        onCheckAll={workbenchReady ? () => void editorCommandsRef.current?.checkAll() : undefined}
        onExportCurrent={workbenchReady && activeTableId ? () => void handleExport("current") : undefined}
        onExportAll={workbenchReady ? () => void handleExport("all") : undefined}
      />
      {bootError ? <div className="m-auto text-danger">{bootError}</div> : null}
      {!bootError && guide ? (
        <Guide error={dialogs.error} onOpen={dialogs.startOpen} onCreate={dialogs.startCreate} />
      ) : null}
      {!bootError && !guide ? (
        <Workbench
          key={rootPath}
          rootPath={rootPath}
          enumsCatalog={enumsCatalog}
          tablePacks={tablePacks}
          editorCommandsRef={editorCommandsRef}
          onActiveIdChange={handleActiveIdChange}
          onExportProgress={setExportProgress}
        />
      ) : null}
      <EnumsDialog open={enumsOpen} catalog={enumsCatalog} onClose={() => setEnumsOpen(false)} />
      <DepsDialog
        open={depsOpen}
        tables={tablePacks}
        currentId={activeTableId}
        onClose={() => setDepsOpen(false)}
      />
      <ExportDialog
        open={exportOpen}
        busy={exportBusy}
        progress={exportProgress}
        report={exportReport}
        onClose={() => {
          setExportOpen(false);
          setExportReport(null);
          setExportProgress(null);
        }}
      />
      <TemplatesDialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} />
      <OpenDialog
        open={dialogs.kind === "open"}
        path={dialogs.openPath}
        busy={dialogs.busy}
        error={dialogs.error}
        onPath={dialogs.setOpenPath}
        onClose={() => dialogs.setKind("")}
        onConfirm={() => void confirmOpen()}
      />
      <CreateSampleDialog
        open={dialogs.kind === "create"}
        path={dialogs.createPath}
        busy={dialogs.busy}
        error={dialogs.error}
        onPath={dialogs.setCreatePath}
        onClose={() => dialogs.setKind("")}
        onConfirm={() => void confirmCreate()}
      />
    </div>
  );
}
