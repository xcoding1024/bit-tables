import { shell } from "./shell";

const params = new URLSearchParams(location.search);
export const tableWindow = params.get("tableWindow") === "1"
  ? { rootPath: params.get("rootPath") || "" }
  : null;

export function withWindowRoot(path: string) {
  if (!tableWindow) return path;
  const url = new URL(path, location.origin);
  url.searchParams.set("rootPath", tableWindow.rootPath);
  return url.pathname + url.search;
}

export async function openTableWindow(rootPath: string, tableId: string) {
  const sh = shell();
  if (sh?.openTableWindow) {
    await sh.openTableWindow({ rootPath, tableId });
    return;
  }
  const url = new URL("/", location.origin);
  url.search = new URLSearchParams({ tableWindow: "1", rootPath, table: tableId }).toString();
  const child = window.open(url, "_blank", "popup,width=1100,height=760");
  if (!child) throw new Error("窗口被浏览器拦截，请允许弹出窗口");
}
