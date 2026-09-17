import { useState } from "react";
import { FolderOpen, FolderPlus, Table2 } from "lucide-react";
import { Btn, Dialog, Field, Input } from "../components/ui";
import { shell } from "../lib/shell";

export default function Guide({
  error,
  onOpen,
  onCreate,
}: {
  error: string;
  onOpen: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="m-auto max-w-[420px] px-6 text-center" data-testid="tables-guide">
      <Table2 className="mx-auto mb-3 text-muted" size={28} />
      <div className="mb-1 font-medium">打开配表目录</div>
      <div className="mb-4 text-muted">每张表是一个子目录，里面是五件套 + docs。</div>
      {error ? <div className="mb-3 text-danger">{error}</div> : null}
      <div className="flex justify-center gap-2">
        <Btn variant="primary" data-testid="tables-open" onClick={onOpen}>
          <span className="inline-flex items-center gap-1">
            <FolderOpen size={14} /> 打开已有配表目录
          </span>
        </Btn>
        <Btn data-testid="tables-create" onClick={onCreate}>
          <span className="inline-flex items-center gap-1">
            <FolderPlus size={14} /> 创建示例项目
          </span>
        </Btn>
      </div>
    </div>
  );
}

export function OpenDialog({
  open,
  path,
  busy,
  error,
  onPath,
  onClose,
  onConfirm,
}: {
  open: boolean;
  path: string;
  busy: boolean;
  error: string;
  onPath: (path: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const sh = shell();
  return (
    <Dialog
      open={open}
      title="打开配表目录"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn variant="primary" disabled={!path.trim() || busy} onClick={onConfirm} data-testid="tables-open-confirm">
            打开
          </Btn>
        </>
      }
    >
      <Field label="目录" hint="选择已有的配表根目录">
        <div className="flex gap-2">
          <Input value={path} onChange={(e) => onPath(e.target.value)} data-testid="tables-open-path" />
          {sh ? (
            <Btn
              onClick={() => {
                void sh.pickDirectory().then((picked) => {
                  if (picked) onPath(picked);
                });
              }}
            >
              浏览
            </Btn>
          ) : null}
        </div>
      </Field>
      {error ? <div className="text-danger">{error}</div> : null}
    </Dialog>
  );
}

export function CreateSampleDialog({
  open,
  parent,
  name,
  busy,
  error,
  onParent,
  onName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  parent: string;
  name: string;
  busy: boolean;
  error: string;
  onParent: (path: string) => void;
  onName: (name: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const sh = shell();
  return (
    <Dialog
      open={open}
      title="创建示例项目"
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>取消</Btn>
          <Btn
            variant="primary"
            disabled={!parent.trim() || !name.trim() || busy}
            onClick={onConfirm}
            data-testid="tables-create-confirm"
          >
            创建
          </Btn>
        </>
      }
    >
      <Field label="父目录">
        <div className="flex gap-2">
          <Input value={parent} onChange={(e) => onParent(e.target.value)} data-testid="tables-create-parent" />
          {sh ? (
            <Btn
              onClick={() => {
                void sh.pickDirectory().then((picked) => {
                  if (picked) onParent(picked);
                });
              }}
            >
              浏览
            </Btn>
          ) : null}
        </div>
      </Field>
      <Field label="项目名" hint="将在父目录下新建此文件夹，结构与仓库 demo 相同（含 tables / src / res 与导表脚本）">
        <Input value={name} onChange={(e) => onName(e.target.value)} data-testid="tables-create-name" />
      </Field>
      {error ? <div className="text-danger">{error}</div> : null}
    </Dialog>
  );
}

export function useGuideDialogs() {
  const [kind, setKind] = useState<"open" | "create" | "">("");
  const [openPath, setOpenPath] = useState("");
  const [createParent, setCreateParent] = useState("");
  const [createName, setCreateName] = useState("demo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startOpen() {
    setError("");
    setOpenPath("");
    setKind("open");
  }

  function startCreate() {
    setError("");
    setCreateParent("");
    setCreateName("demo");
    setKind("create");
  }

  return {
    kind,
    openPath,
    createParent,
    createName,
    busy,
    error,
    setKind,
    setOpenPath,
    setCreateParent,
    setCreateName,
    setBusy,
    setError,
    startOpen,
    startCreate,
  };
}
