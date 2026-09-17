import { useCallback, useEffect, useRef, useState } from "react";
import { EnumsDialog } from "./components/EnumsDialog";
import { TemplatesDialog } from "./components/TemplatesDialog";
import Titlebar from "./components/Titlebar";
import { tablesApi } from "./lib/api";
import { buildEnumsCatalog, parseTableDoc, type EnumCatalogItem } from "./lib/tableHost";
import { shell } from "./lib/shell";
import Guide, { CreateSampleDialog, OpenDialog, useGuideDialogs } from "./pages/Guide";
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
  const [enumsOpen, setEnumsOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const dialogs = useGuideDialogs();
  const sh = shell();
  const editorCommandsRef = useRef<EditorCommands | null>(null);
  const workbenchReady = !bootError && !guide && Boolean(rootPath);

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
      setEnumsCatalog(buildEnumsCatalog(packed));
    } catch {
      setEnumsCatalog([]);
    }
  }, []);

  useEffect(() => {
    tablesApi
      .root()
      .then(async (next) => {
        setRootPath(next.path || "");
        setGuide(Boolean(next.guide));
        if (!next.guide && next.path) {
          await reloadEnumsCatalog();
        } else {
          setEnumsCatalog([]);
        }
      })
      .catch((err: unknown) => {
        setBootError(err instanceof Error ? err.message : "无法连接本机服务");
      });
  }, [reloadEnumsCatalog]);

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
      setEnumsCatalog([]);
    }
    try {
      await sh?.rememberRoot?.(next.path);
    } catch {
      /* 记住上次目录失败不影响当前打开 */
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
    const parent = dialogs.createParent.trim();
    const name = dialogs.createName.trim();
    if (!parent || !name || !sh) return;
    dialogs.setBusy(true);
    dialogs.setError("");
    try {
      const dest = await sh.createSample(parent, name);
      await applyRoot(dest, { sample: true });
    } catch (err: unknown) {
      dialogs.setError(err instanceof Error ? err.message : "创建失败");
      dialogs.setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg text-ink">
      <Titlebar
        onOpen={sh ? dialogs.startOpen : undefined}
        onCreateSample={sh ? dialogs.startCreate : undefined}
        onEnums={!guide && rootPath ? () => setEnumsOpen(true) : undefined}
        onTemplates={() => setTemplatesOpen(true)}
        onUndo={workbenchReady ? () => editorCommandsRef.current?.undo() : undefined}
        onRedo={workbenchReady ? () => editorCommandsRef.current?.redo() : undefined}
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
          editorCommandsRef={editorCommandsRef}
        />
      ) : null}
      <EnumsDialog open={enumsOpen} catalog={enumsCatalog} onClose={() => setEnumsOpen(false)} />
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
        parent={dialogs.createParent}
        name={dialogs.createName}
        busy={dialogs.busy}
        error={dialogs.error}
        onParent={dialogs.setCreateParent}
        onName={dialogs.setCreateName}
        onClose={() => dialogs.setKind("")}
        onConfirm={() => void confirmCreate()}
      />
    </div>
  );
}
