import type { FieldDef } from "./types";
import { escapeAttr, escapeHtml } from "./dom";

export type ColumnLayout = { hidden: string[]; widths: Record<string, number> };
export const columnWidth = (value: number) => Math.max(64, Math.min(1200, Math.round(value)));

export function readColumnLayout(value: unknown, fields: FieldDef[]): ColumnLayout {
  const raw = value as Partial<ColumnLayout> | null;
  const keys = new Set(fields.map(f => f.key));
  const hidden = Array.isArray(raw?.hidden) ? [...new Set(raw.hidden.filter(key => keys.has(key)))] : [];
  // 至少保留一列，旧设置不能把新结构的全部字段隐藏。
  if (fields.length && fields.every(f => hidden.includes(f.key))) hidden.splice(hidden.indexOf(fields[0].key), 1);
  const widths: Record<string, number> = Object.create(null);
  for (const [key, width] of Object.entries(raw?.widths || {})) {
    if (keys.has(key) && typeof width === "number" && Number.isFinite(width)) widths[key] = columnWidth(width);
  }
  return { hidden, widths };
}

export function columnSettingsHTML(fields: FieldDef[], layout: ColumnLayout): string {
  return `<div data-role="column-settings" style="flex-shrink:0;border:1px solid #3a3a3a;border-radius:6px;padding:12px;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px"><strong>列设置</strong><span style="color:#a3a3a3">拖动表头右边缘调整列宽，双击恢复默认宽度</span><button type="button" data-role="columns-reset">恢复默认</button></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;max-height:180px;overflow:auto">${fields.map(field => {
      const visible = !layout.hidden.includes(field.key);
      const label = field.label || field.key;
      return `<div style="display:flex;align-items:center;gap:6px;border:1px solid #333;padding:4px 8px;border-radius:4px">
        <label><input type="checkbox" data-role="column-visible" data-key="${escapeAttr(field.key)}" ${visible ? "checked" : ""} ${visible && fields.length - layout.hidden.length <= 1 ? "disabled" : ""} /> ${escapeHtml(label)}</label>
      </div>`;
    }).join("")}</div></div>`;
}
