const PREFIX = "bit-tables.panel.";

export const LEFT_MIN = 180;
export const LEFT_MAX = 420;
export const LEFT_DEFAULT = 244;
export const LEFT_COLLAPSE_AT = 140;
export const RIGHT_MIN = 220;
export const RIGHT_MAX = 480;
export const RIGHT_DEFAULT = 360;
export const RIGHT_COLLAPSE_AT = 160;
export const RAIL = 36;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function readPanelWidth(key: string, fallback: number, min: number, max: number) {
  try {
    const raw = localStorage.getItem(PREFIX + key + ".width");
    if (raw) return clamp(Number(raw), min, max);
  } catch {
    /* ignore */
  }
  return fallback;
}

export function readPanelCollapsed(key: string) {
  try {
    return localStorage.getItem(PREFIX + key + ".collapsed") === "1";
  } catch {
    return false;
  }
}

export function writePanelWidth(key: string, width: number) {
  try {
    localStorage.setItem(PREFIX + key + ".width", String(width));
  } catch {
    /* ignore */
  }
}

export function writePanelCollapsed(key: string, collapsed: boolean) {
  try {
    localStorage.setItem(PREFIX + key + ".collapsed", collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export { clamp as clampPanel };
