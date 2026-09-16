import type { BitTablesShell } from "../vite-env";

export function shell(): BitTablesShell | undefined {
  return typeof window === "undefined" ? undefined : window.bitTablesShell;
}
