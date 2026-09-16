import { useEffect, useState } from "react";
import Titlebar from "./components/Titlebar";
import { tablesApi } from "./lib/api";
import { shell } from "./lib/shell";
import Guide, { CreateSampleDialog, OpenDialog, useGuideDialogs } from "./pages/Guide";
import Workbench from "./pages/Workbench";

export default function App() {
  const [rootPath, setRootPath] = useState("");
  const [guide, setGuide] = useState(false);
  const [bootError, setBootError] = useState("");
  const dialogs = useGuideDialogs();
  const sh = shell();

  useEffect(() => {
    tablesApi
      .root()
      .then((next) => {
        setRootPath(next.path || "");
        setGuide(Boolean(next.guide));
      })
      .catch((err: unknown) => {
        setBootError(err instanceof Error ? err.message : "无法连接本机服务");
      });
  }, []);

  async function applyRoot(dir: string, opts?: { sample?: boolean }) {
    const next = await tablesApi.setRoot(dir, opts);
    setRootPath(next.path);
    setGuide(Boolean(next.guide));
    setBootError("");
    dialogs.setKind("");
    dialogs.setBusy(false);
    dialogs.setError("");
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
      <Titlebar onOpen={sh ? dialogs.startOpen : undefined} onCreateSample={sh ? dialogs.startCreate : undefined} />
      {bootError ? <div className="m-auto text-danger">{bootError}</div> : null}
      {!bootError && guide ? (
        <Guide error={dialogs.error} onOpen={dialogs.startOpen} onCreate={dialogs.startCreate} />
      ) : null}
      {!bootError && !guide ? <Workbench key={rootPath} rootPath={rootPath} /> : null}
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
