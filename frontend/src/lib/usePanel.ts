import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampPanel,
  RAIL,
  readPanelCollapsed,
  readPanelWidth,
  writePanelCollapsed,
  writePanelWidth,
} from "./panels";

export function usePanel(key: string, fallback: number, min: number, max: number, grow: 1 | -1) {
  const [width, setWidth] = useState(() => readPanelWidth(key, fallback, min, max));
  const [collapsed, setCollapsed] = useState(() => readPanelCollapsed(key));
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    writePanelCollapsed(key, next);
  }

  function expand() {
    if (!collapsed) return;
    setCollapsed(false);
    writePanelCollapsed(key, false);
  }

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    if (collapsed) return;
    event.preventDefault();
    const startX = event.clientX;
    const startW = widthRef.current;
    setDragging(true);
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    function move(ev: PointerEvent) {
      const next = clampPanel(startW + grow * (ev.clientX - startX), min, max);
      widthRef.current = next;
      setWidth(next);
    }
    function up() {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setDragging(false);
      writePanelWidth(key, widthRef.current);
    }
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  return {
    width,
    collapsed,
    dragging,
    displayWidth: collapsed ? RAIL : width,
    toggle,
    expand,
    onResizeStart,
  };
}
