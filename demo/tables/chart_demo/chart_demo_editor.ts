import { BitTableEditorBase } from "bit-tables.editor";
import { escapeHtml, num } from "bit-tables.dom";
import type { Row } from "bit-tables.types";

const COLORS = ["#3794ff", "#3ecf8e", "#f5a524", "#eb5757", "#56b6c2", "#c678dd", "#e5c07b", "#98c379"];
const CHART_META: Record<string, { title: string; hint: string }> = {
  line: { title: "折线图", hint: "月度趋势 · 勾选后可批量修改或删除" },
  bar: { title: "柱状图", hint: "分类对比 · 勾选后可批量修改或删除" },
  pie: { title: "饼图", hint: "占比 · 勾选后可批量修改或删除" },
};

type ChartKind = "line" | "bar" | "pie";
type Point = { label: string; value: number };

class ChartDemoEditor extends BitTableEditorBase {
  testPrefix = "chart-demo";
  rootTestId = "chart-demo-editor";

  protected detectKind(): ChartKind {
    const keys: Record<string, boolean> = {};
    this.fields.forEach((f) => {
      if (f?.key) keys[f.key] = true;
    });
    if (keys.month) return "line";
    if (keys.category) return "bar";
    if (keys.label) return "pie";
    return "bar";
  }

  protected labelKey(kind: ChartKind): string {
    if (kind === "line") return "month";
    if (kind === "bar") return "category";
    return "label";
  }

  protected titleForToolbar(): string {
    return (CHART_META[this.detectKind()] || CHART_META.bar).title;
  }

  protected hintForToolbar(): string {
    return (CHART_META[this.detectKind()] || CHART_META.bar).hint;
  }

  protected emptyRow(): Row {
    const kind = this.detectKind();
    const row: Row = {};
    this.fields.forEach((f) => {
      if (!f?.key) return;
      if (f.key === "value") row.value = 0;
      else if (f.key === this.labelKey(kind)) row[f.key] = `项${this.data.rows.length + 1}`;
      else row[f.key] = "";
    });
    return row;
  }

  protected points(): Point[] {
    const kind = this.detectKind();
    const key = this.labelKey(kind);
    return this.data.rows.map((row, i) => {
      row = row || {};
      return {
        label: String(row[key] ?? "") || `#${i + 1}`,
        value: num(row.value),
      };
    });
  }

  protected renderLine(pts: Point[], w: number, h: number): string {
    const padL = 44;
    const padR = 16;
    const padT = 16;
    const padB = 36;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    let max = 0;
    pts.forEach((p) => {
      if (p.value > max) max = p.value;
    });
    if (max <= 0) max = 1;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block">`;
    svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#111" rx="8" />`;
    for (let g = 0; g <= 4; g++) {
      const gy = padT + (ih * g) / 4;
      const gv = max * (1 - g / 4);
      svg += `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="#2a2a2a" />`;
      svg += `<text x="${padL - 8}" y="${gy + 4}" text-anchor="end" fill="#737373" font-size="11">${Math.round(gv)}</text>`;
    }
    if (!pts.length) {
      svg += `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#737373" font-size="13">暂无数据</text></svg>`;
      return svg;
    }
    let path = "";
    let circles = "";
    const labelKey = this.labelKey("line");
    pts.forEach((p, i) => {
      const x = padL + (pts.length === 1 ? iw / 2 : (iw * i) / (pts.length - 1));
      const y = padT + ih * (1 - p.value / max);
      path += `${i ? " L " : "M "}${x} ${y}`;
      circles += `<circle data-role="cell" data-index="${i}" data-key="value"${this.revealAttr(i, "value")} cx="${x}" cy="${y}" r="4" fill="#3794ff" stroke="#0a0a0a" stroke-width="2" style="${this.revealCellStyle(i, "value")}" />`;
      svg += `<text data-role="cell" data-index="${i}" data-key="${labelKey}"${this.revealAttr(i, labelKey)} x="${x}" y="${h - 12}" text-anchor="middle" fill="#a3a3a3" font-size="11" style="${this.revealCellStyle(i, labelKey)}">${this.highlightQuery(p.label, i, labelKey)}</text>`;
    });
    svg += `<path d="${path}" fill="none" stroke="#3794ff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />`;
    return svg + circles + "</svg>";
  }

  protected renderBar(pts: Point[], w: number, h: number): string {
    const padL = 44;
    const padR = 16;
    const padT = 16;
    const padB = 40;
    const iw = w - padL - padR;
    const ih = h - padT - padB;
    let max = 0;
    pts.forEach((p) => {
      if (p.value > max) max = p.value;
    });
    if (max <= 0) max = 1;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block">`;
    svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#111" rx="8" />`;
    for (let g = 0; g <= 4; g++) {
      const gy = padT + (ih * g) / 4;
      const gv = max * (1 - g / 4);
      svg += `<line x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}" stroke="#2a2a2a" />`;
      svg += `<text x="${padL - 8}" y="${gy + 4}" text-anchor="end" fill="#737373" font-size="11">${Math.round(gv)}</text>`;
    }
    if (!pts.length) {
      svg += `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#737373" font-size="13">暂无数据</text></svg>`;
      return svg;
    }
    const gap = 12;
    const bw = Math.max(8, (iw - gap * (pts.length + 1)) / pts.length);
    const labelKey = this.labelKey("bar");
    pts.forEach((p, i) => {
      const x = padL + gap + i * (bw + gap);
      const bh = ih * (p.value / max);
      const y = padT + ih - bh;
      svg += `<rect data-role="cell" data-index="${i}" data-key="value"${this.revealAttr(i, "value")} x="${x}" y="${y}" width="${bw}" height="${Math.max(bh, 1)}" fill="${COLORS[i % COLORS.length]}" rx="3" style="${this.revealCellStyle(i, "value")}" />`;
      svg += `<text data-role="cell" data-index="${i}" data-key="${labelKey}"${this.revealAttr(i, labelKey)} x="${x + bw / 2}" y="${h - 14}" text-anchor="middle" fill="#a3a3a3" font-size="11" style="${this.revealCellStyle(i, labelKey)}">${this.highlightQuery(p.label, i, labelKey)}</text>`;
    });
    return svg + "</svg>";
  }

  protected renderPie(pts: Point[], w: number, h: number): string {
    const cx = Math.min(w, h) / 2 + 8;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.32;
    let total = 0;
    pts.forEach((p) => {
      total += Math.max(0, p.value);
    });
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block">`;
    svg += `<rect x="0" y="0" width="${w}" height="${h}" fill="#111" rx="8" />`;
    if (!pts.length || total <= 0) {
      svg += `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" fill="#737373" font-size="13">暂无数据</text></svg>`;
      return svg;
    }
    const polar = (angle: number) => ({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    let angle = -Math.PI / 2;
    const labelKey = this.labelKey("pie");
    pts.forEach((p, i) => {
      const share = Math.max(0, p.value) / total;
      const sweep = share * Math.PI * 2;
      const p0 = polar(angle);
      const p1 = polar(angle + sweep);
      const large = sweep > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} 1 ${p1.x} ${p1.y} Z`;
      svg += `<path data-role="cell" data-index="${i}" data-key="value"${this.revealAttr(i, "value")} d="${d}" fill="${COLORS[i % COLORS.length]}" stroke="#0a0a0a" stroke-width="1" style="${this.revealCellStyle(i, "value")}" />`;
      angle += sweep;
    });
    const legendX = cx + r + 28;
    pts.forEach((p, i) => {
      const pct = Math.round((Math.max(0, p.value) / total) * 1000) / 10;
      const y = 28 + i * 22;
      svg += `<rect x="${legendX}" y="${y - 10}" width="10" height="10" rx="2" fill="${COLORS[i % COLORS.length]}" />`;
      svg += `<text data-role="cell" data-index="${i}" data-key="${labelKey}"${this.revealAttr(i, labelKey)} x="${legendX + 16}" y="${y}" fill="#d4d4d4" font-size="12" style="${this.revealCellStyle(i, labelKey)}">${this.highlightQuery(p.label, i, labelKey)} · ${pct}%</text>`;
    });
    return svg + "</svg>";
  }

  protected renderChart(): string {
    const kind = this.detectKind();
    const pts = this.points();
    if (kind === "line") return this.renderLine(pts, 720, 280);
    if (kind === "pie") return this.renderPie(pts, 720, 280);
    return this.renderBar(pts, 720, 280);
  }

  protected renderExtra(): string {
    return `<div data-testid="chart-demo-canvas" style="border:1px solid #3a3a3a;border-radius:8px;overflow:hidden;background:#111">${this.renderChart()}</div>`;
  }

  protected afterDataChange(): void {
    const canvas = this.el?.querySelector("[data-testid=chart-demo-canvas]");
    if (canvas) canvas.innerHTML = this.renderChart();
  }
}

window.BitTableEditor = new ChartDemoEditor();
