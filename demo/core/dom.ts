import type { Row } from "./types";

export function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(s: unknown): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

export function truthy(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

export function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

export function asRecord(value: unknown): Row | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : null;
}

export function splitMulti(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((s) => s.trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinMulti(ids: string[]): string {
  return ids.join(", ");
}
