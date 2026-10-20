import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function TableTabMenu({ children, className, onOpenWindow }: {
  children: ReactNode;
  className?: string;
  onOpenWindow?: () => void;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!position) return;
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null);
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setPosition(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    const blur = () => setPosition(null);
    window.addEventListener("blur", blur);
    menu.current?.querySelector("button")?.focus();
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("blur", blur);
    };
  }, [position]);
  return <div className={className} onContextMenu={(event) => {
    if (!onOpenWindow) return;
    event.preventDefault();
    setPosition({ x: Math.min(event.clientX, window.innerWidth - 180), y: Math.min(event.clientY, window.innerHeight - 44) });
  }}>
    {children}
    {position && createPortal(<div ref={menu} role="menu" className="fixed z-[100] w-44 rounded border border-line bg-elevated p-1 shadow-lg" style={{ left: position.x, top: position.y }}>
      <button role="menuitem" data-testid="table-tab-open-window" className="w-full px-3 py-2 text-left text-ink hover:bg-hover" onClick={() => { setPosition(null); onOpenWindow?.(); }}>在新窗口打开</button>
    </div>, document.body)}
  </div>;
}
