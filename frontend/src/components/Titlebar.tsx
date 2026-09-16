import { useEffect, useState, type ReactNode } from "react";
import { Copy, FolderOpen, FolderPlus, Minus, Square, X } from "lucide-react";
import { shell } from "../lib/shell";

export default function Titlebar({
  rootPath,
  onOpen,
  onCreateSample,
}: {
  rootPath: string;
  onOpen?: () => void;
  onCreateSample?: () => void;
}) {
  const sh = shell();
  const ctl = sh?.window;
  const isMac = sh?.platform === "darwin";
  const showWinCtl = Boolean(ctl) && !isMac;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    ctl?.isMaximized()
      .then(setMaximized)
      .catch(() => undefined);
  }, [ctl]);

  function toggleMax() {
    ctl?.toggleMaximize();
    setMaximized((cur) => !cur);
  }

  return (
    <div
      className="titlebar-drag relative z-40 flex shrink-0 items-stretch bg-titlebar text-[13px] text-ink"
      style={{ height: "var(--titlebar-height)", paddingLeft: isMac ? 78 : 0 }}
      onDoubleClick={(event) => {
        if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
        toggleMax();
      }}
    >
      <div className="flex min-w-0 items-center gap-1 pl-2">
        <span className="shrink-0 font-medium">bit-tables</span>
        {rootPath ? (
          <span className="min-w-0 truncate font-mono text-[11px] text-muted" title={rootPath}>
            {rootPath}
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1" />
      {sh ? (
        <div className="flex items-center gap-1 pr-1" data-no-drag>
          {onOpen ? (
            <BarBtn label="打开已有目录" onClick={onOpen}>
              <FolderOpen size={13} />
              <span>打开…</span>
            </BarBtn>
          ) : null}
          {onCreateSample ? (
            <BarBtn label="创建示例项目" onClick={onCreateSample}>
              <FolderPlus size={13} />
              <span>新建示例</span>
            </BarBtn>
          ) : null}
        </div>
      ) : null}
      {showWinCtl ? (
        <div className="flex" data-no-drag>
          <WinBtn label="最小化" onClick={() => ctl?.minimize()}>
            <Minus size={12} />
          </WinBtn>
          <WinBtn label={maximized ? "还原" : "最大化"} onClick={toggleMax}>
            {maximized ? <Copy size={11} /> : <Square size={11} />}
          </WinBtn>
          <WinBtn label="关闭" danger onClick={() => ctl?.close()}>
            <X size={13} />
          </WinBtn>
        </div>
      ) : null}
    </div>
  );
}

function BarBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      className="flex h-7 items-center gap-1 rounded px-2 text-secondary hover:bg-hover hover:text-ink"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function WinBtn({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-full w-11 items-center justify-center text-secondary ${
        danger ? "hover:bg-[#e81123] hover:text-white" : "hover:bg-hover hover:text-ink"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
