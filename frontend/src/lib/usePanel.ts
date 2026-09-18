import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampPanel,
  RAIL,
  readPanelCollapsed,
  readPanelWidth,
  writePanelCollapsed,
  writePanelWidth,
} from "./panels";

export function usePanel(
  key: string,
  fallback: number,
  min: number,
  max: number,
  grow: 1 | -1,
  collapseAt: number,
) {
  const [width, setWidth] = useState(() => readPanelWidth(key, fallback, min, max));
  const [collapsed, setCollapsed] = useState(() => readPanelCollapsed(key));
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(width);
  const collapsedRef = useRef(collapsed);
  widthRef.current = width;
  collapsedRef.current = collapsed;

  function expand() {
    if (!collapsedRef.current) return;
    collapsedRef.current = false;
    setCollapsed(false);
    writePanelCollapsed(key, false);
  }

  function onResizeStart(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startW = collapsedRef.current ? 0 : widthRef.current;
    setDragging(true);
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    function move(ev: PointerEvent) {
      const raw = startW + grow * (ev.clientX - startX);
      if (raw < collapseAt) {
        if (!collapsedRef.current) {
          collapsedRef.current = true;
          setCollapsed(true);
        }
        return;
      }
      if (collapsedRef.current) {
        collapsedRef.current = false;
        setCollapsed(false);
      }
      const next = clampPanel(raw, min, max);
      widthRef.current = next;
      setWidth(next);
    }
    function up() {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setDragging(false);
      writePanelCollapsed(key, collapsedRef.current);
      if (!collapsedRef.current) writePanelWidth(key, widthRef.current);
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
    expand,
    onResizeStart,
  };
}
