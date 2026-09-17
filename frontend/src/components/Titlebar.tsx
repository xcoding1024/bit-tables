import { useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { shell } from "../lib/shell";
import { Btn, Dialog } from "./ui";

const APP_VERSION = "0.1.0";

type MenuId = "project" | "edit" | "view" | "export" | "help" | null;

type ShortcutRow = { action: string; keys: string };

function shortcutRows(isMac: boolean): ShortcutRow[] {
  const mod = isMac ? "⌘" : "Ctrl";
  const shift = isMac ? "⇧" : "Shift";
  return [
    { action: "保存", keys: `${mod}+S` },
    { action: "撤销", keys: `${mod}+Z` },
    { action: "重做", keys: `${mod}+Y` },
    { action: "重做", keys: `${mod}+${shift}+Z` },
    { action: "关闭菜单 / 对话框", keys: "Esc" },
  ];
}

export default function Titlebar({
  onOpen,
  onCreateSample,
  onEnums,
  onDeps,
  onTemplates,
  onUndo,
  onRedo,
  onSave,
  onExportCurrent,
  onExportAll,
}: {
  onOpen?: () => void;
  onCreateSample?: () => void;
  onEnums?: () => void;
  onDeps?: () => void;
  onTemplates?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onExportCurrent?: () => void;
  onExportAll?: () => void;
}) {
  const sh = shell();
  const ctl = sh?.window;
  const isMac = sh?.platform === "darwin";
  const showWinCtl = Boolean(ctl) && !isMac;
  const [maximized, setMaximized] = useState(false);
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const menusRef = useRef<HTMLDivElement>(null);
  const mod = isMac ? "⌘" : "Ctrl";

  useEffect(() => {
    ctl?.isMaximized()
      .then(setMaximized)
      .catch(() => undefined);
  }, [ctl]);

  useEffect(() => {
    if (!openMenu) return;
    function onDoc(event: MouseEvent) {
      if (menusRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  function toggleMax() {
    ctl?.toggleMaximize();
    setMaximized((cur) => !cur);
  }

  function run(action?: () => void) {
    setOpenMenu(null);
    action?.();
  }

  return (
    <>
      <div
        className="titlebar-drag relative z-40 flex shrink-0 items-stretch bg-titlebar text-[13px] text-ink"
        style={{ height: "var(--titlebar-height)", paddingLeft: isMac ? 78 : 0 }}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
          toggleMax();
        }}
      >
        <div ref={menusRef} className="flex min-w-0 items-stretch pl-1" data-no-drag>
          <Menu
            id="project"
            label="项目"
            open={openMenu === "project"}
            active={openMenu}
            onOpen={setOpenMenu}
          >
            <MenuItem label="打开…" disabled={!onOpen} onClick={() => run(onOpen)} />
            <MenuItem label="新建示例" disabled={!onCreateSample} onClick={() => run(onCreateSample)} />
          </Menu>
          <Menu id="edit" label="编辑" open={openMenu === "edit"} active={openMenu} onOpen={setOpenMenu}>
            <MenuItem
              label="保存"
              shortcut={`${mod}+S`}
              disabled={!onSave}
              testId="titlebar-save"
              onClick={() => run(onSave)}
            />
            <MenuItem
              label="撤销"
              shortcut={`${mod}+Z`}
              disabled={!onUndo}
              testId="titlebar-undo"
              onClick={() => run(onUndo)}
            />
            <MenuItem
              label="重做"
              shortcut={`${mod}+Y`}
              disabled={!onRedo}
              testId="titlebar-redo"
              onClick={() => run(onRedo)}
            />
          </Menu>
          <Menu
            id="view"
            label="查看"
            open={openMenu === "view"}
            active={openMenu}
            onOpen={setOpenMenu}
          >
            <MenuItem
              label="枚举"
              disabled={!onEnums}
              testId="titlebar-enums"
              onClick={() => run(onEnums)}
            />
            <MenuItem
              label="依赖关系"
              disabled={!onDeps}
              testId="titlebar-deps"
              onClick={() => run(onDeps)}
            />
            <MenuItem
              label="编辑模板"
              disabled={!onTemplates}
              testId="titlebar-templates"
              onClick={() => run(onTemplates)}
            />
            <MenuItem
              label="快捷键"
              testId="titlebar-shortcuts"
              onClick={() => {
                setOpenMenu(null);
                setShortcutsOpen(true);
              }}
            />
          </Menu>
          <Menu
            id="export"
            label="导出"
            open={openMenu === "export"}
            active={openMenu}
            onOpen={setOpenMenu}
          >
            <MenuItem
              label="导出当前表"
              disabled={!onExportCurrent}
              testId="titlebar-export-current"
              onClick={() => run(onExportCurrent)}
            />
            <MenuItem
              label="导出所有"
              disabled={!onExportAll}
              testId="titlebar-export-all"
              onClick={() => run(onExportAll)}
            />
          </Menu>
          <Menu
            id="help"
            label="帮助"
            open={openMenu === "help"}
            active={openMenu}
            onOpen={setOpenMenu}
          >
            <MenuItem
              label="关于 bit-tables"
              testId="titlebar-about"
              onClick={() => {
                setOpenMenu(null);
                setAboutOpen(true);
              }}
            />
          </Menu>
        </div>
        <div className="min-w-0 flex-1" />
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
      <Dialog
        open={aboutOpen}
        title="关于 bit-tables"
        onClose={() => setAboutOpen(false)}
        width="max-w-[420px]"
        footer={<Btn onClick={() => setAboutOpen(false)}>关闭</Btn>}
      >
        <div className="space-y-2 text-[13px] text-secondary">
          <div className="text-[15px] font-medium text-ink">bit-tables</div>
          <div>版本 {APP_VERSION}</div>
          <div>本机配表工作台：用目录五件套管理结构、数据、检查与导出。</div>
        </div>
      </Dialog>
      <Dialog
        open={shortcutsOpen}
        title="快捷键"
        onClose={() => setShortcutsOpen(false)}
        width="max-w-[440px]"
        footer={<Btn onClick={() => setShortcutsOpen(false)}>关闭</Btn>}
      >
        <div data-testid="shortcuts-dialog">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-muted">
                <th className="border-b border-line px-2 py-2 font-medium">操作</th>
                <th className="border-b border-line px-2 py-2 font-medium">快捷键</th>
              </tr>
            </thead>
            <tbody>
              {shortcutRows(Boolean(isMac)).map((row) => (
                <tr key={`${row.action}-${row.keys}`} className="text-ink">
                  <td className="border-b border-line px-2 py-2">{row.action}</td>
                  <td className="border-b border-line px-2 py-2 font-mono text-secondary">{row.keys}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[12px] text-muted">撤销 / 重做作用于当前打开的配置表编辑器。</div>
        </div>
      </Dialog>
    </>
  );
}

function Menu({
  id,
  label,
  open,
  active,
  onOpen,
  children,
}: {
  id: Exclude<MenuId, null>;
  label: string;
  open: boolean;
  active: MenuId;
  onOpen: (id: MenuId) => void;
  children: ReactNode;
}) {
  return (
    <div className="relative flex items-stretch">
      <button
        type="button"
        className={`flex h-full items-center rounded px-2.5 ${
          open ? "bg-active text-ink" : "text-secondary hover:bg-hover hover:text-ink"
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onOpen(open ? null : id)}
        onMouseEnter={() => {
          if (active) onOpen(id);
        }}
      >
        {label}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-0 min-w-[188px] rounded border border-line bg-elevated py-1 shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  disabled,
  testId,
  shortcut,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      disabled={disabled}
      className="flex h-7 w-full items-center justify-between gap-6 px-3 text-left text-ink disabled:cursor-default disabled:text-muted hover:enabled:bg-hover"
      onClick={onClick}
    >
      <span>{label}</span>
      {shortcut ? <span className="font-mono text-[11px] text-muted">{shortcut}</span> : null}
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
