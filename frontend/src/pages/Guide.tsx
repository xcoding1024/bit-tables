import { FolderOpen, FolderPlus, Table2 } from "lucide-react";
import { Btn, Dialog, Field, Input } from "../components/ui";
import { shell } from "../lib/shell";

export { useGuideDialogs } from "./useGuideDialogs";

function PathPicker({
  value,
  testId,
  onChange,
}: {
  value: string;
  testId: string;
  onChange: (path: string) => void;
}) {
  const sh = shell();
  return (
    <div className="flex items-center gap-2">
      <Input
        className="min-w-0 flex-1 !w-auto"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
      {sh ? (
        <Btn
          type="button"
          className="shrink-0 whitespace-nowrap px-3"
          onClick={() => {
            void sh.pickDirectory().then((picked) => {
              if (picked) onChange(picked);
            });
          }}
        >
          浏览
        </Btn>
      ) : null}
    </div>
  );
}

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
        <PathPicker value={path} testId="tables-open-path" onChange={onPath} />
      </Field>
      {error ? <div className="text-danger">{error}</div> : null}
    </Dialog>
  );
}

export function CreateSampleDialog({
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
            disabled={!path.trim() || busy}
            onClick={onConfirm}
            data-testid="tables-create-confirm"
          >
            创建
          </Btn>
        </>
      }
    >
      <Field label="目录" hint="选择要写入示例的目录">
        <PathPicker value={path} testId="tables-create-path" onChange={onPath} />
      </Field>
      {error ? <div className="text-danger">{error}</div> : null}
    </Dialog>
  );
}
