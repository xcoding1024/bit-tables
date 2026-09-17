import type { EditorAPI, EnumEntry, FieldDef, ParamField, Row } from "./types";
import { asRecord, escapeAttr, escapeHtml, joinMulti, num, splitMulti, truthy } from "./dom";

type RowIndex = number | "batch";

export class BitTableEditorBase {
  testPrefix = "demo";
  rootTestId = "table-editor";
  toolbarHint = "勾选后可批量修改或删除";
  enableCardView = false;
  enableColFilters = false;
  enableTableScroll = false;
  idReadonly = true;
  checkboxHint = "";
  groupNames: Record<string, string> = {};
  selectedCountSuffix = "";

  protected el!: HTMLElement;
  protected api!: EditorAPI;
  protected struct: Row = {};
  protected data: { rows: Row[] } = { rows: [] };
  protected enumsBag: Record<string, EnumEntry[]> = {};
  protected fields: FieldDef[] = [];
  protected title = "";
  protected view: "table" | "card" = "table";
  protected picked: Record<number, boolean> = {};
  protected colFilters: Record<string, string> = {};
  protected openFilterKey: string | null = null;
  protected batchOpen = false;
  protected batchKey = "";
  protected batchDraft: Row = {};
  protected openMultiKey: string | null = null;
  protected paramsEditRi: number | null = null;
  protected paramsDraft: Row | null = null;
  private filterCloseBound = false;
  private multiCloseBound = false;
  private multiScrollBound = false;
  private resizeBound = false;

  mount(el: HTMLElement, api: EditorAPI): void {
    this.el = el;
    this.api = api;
    this.struct = asRecord(api.getStruct()) || {};
    this.data = this.normalizeData(api.getData());
    this.enumsBag = (api.getEnums && api.getEnums()) || {};
    this.fields = this.parseFields(this.struct);
    this.title = String(this.struct.name || this.title || "配置表");
    this.view = String(this.struct.view || "").trim() === "card" ? "card" : "table";
    if (!this.batchKey) {
      const first = this.batchableFields()[0];
      this.batchKey = first ? first.key : "";
    }
    this.render();
  }

  protected normalizeData(raw: unknown): { rows: Row[] } {
    const next = asRecord(raw) || { rows: [] };
    const rows = Array.isArray(next.rows) ? (next.rows as Row[]) : [];
    return { ...next, rows };
  }

  protected parseFields(struct: Row): FieldDef[] {
    if (Array.isArray(struct.fields) && struct.fields.length) return struct.fields as FieldDef[];
    if (Array.isArray(struct.rows) && struct.rows.length && asRecord(struct.rows[0])?.key) {
      return struct.rows as FieldDef[];
    }
    return [];
  }

  protected titleForToolbar(): string {
    return this.title;
  }

  protected hintForToolbar(): string {
    return this.toolbarHint;
  }

  protected enumOptions(field: FieldDef): EnumEntry[] {
    const ref = field?.enum ? String(field.enum).trim() : "";
    if (ref && this.enumsBag[ref]?.length) {
      return this.enumsBag[ref].map((item) => ({ id: String(item.id), name: String(item.name || item.id) }));
    }
    const raw = field?.options;
    const list = Array.isArray(raw)
      ? raw.map(String)
      : String(raw || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    return list.map((id) => ({ id, name: id }));
  }

  protected multiSummary(field: FieldDef, val: unknown): string {
    const ids = splitMulti(val);
    if (!ids.length) return "请选择…";
    const byId: Record<string, string> = {};
    this.enumOptions(field).forEach((opt) => {
      byId[opt.id] = opt.name;
    });
    return ids.map((id) => byId[id] || id).join(", ");
  }

  protected groups(): string[] {
    const seen: string[] = [];
    this.fields.forEach((f) => {
      const g = f.group || "basic";
      if (!seen.includes(g)) seen.push(g);
    });
    return seen;
  }

  protected setRow(i: RowIndex, key: string, value: unknown): void {
    if (i === "batch") {
      this.batchDraft[key] = value;
      return;
    }
    if (!this.data.rows[i]) this.data.rows[i] = {};
    this.data.rows[i][key] = value;
    this.api.setData(this.data);
    this.afterDataChange();
  }

  protected selectedIndexes(): number[] {
    return Object.keys(this.picked)
      .map(Number)
      .filter((i) => this.picked[i] && this.data.rows[i])
      .sort((a, b) => a - b);
  }

  protected paramsSchema(_row: Row): ParamField[] {
    return [];
  }

  protected paramsTitle(_row: Row): string {
    return "编辑自定义参数";
  }

  protected formatParamValue(field: ParamField, value: unknown): string {
    const n = Number(value);
    if (Number.isNaN(n) || !n) return "";
    return `${field.label} ${n}`;
  }

  protected defaultParams(row: Row): Row {
    const out: Row = {};
    this.paramsSchema(row).forEach((f) => {
      out[f.key] = 0;
    });
    return out;
  }

  protected normalizeParams(val: unknown, row: Row): Row {
    const out = this.defaultParams(row);
    const rec = asRecord(val);
    if (!rec) return out;
    this.paramsSchema(row).forEach((f) => {
      if (rec[f.key] == null || rec[f.key] === "") return;
      const n = Number(rec[f.key]);
      out[f.key] = Number.isNaN(n) ? 0 : n;
    });
    return out;
  }

  protected paramsSummary(val: unknown, row: Row): string {
    const fields = this.paramsSchema(row);
    if (!fields.length) return "未设置";
    const p = this.normalizeParams(val, row);
    const parts: string[] = [];
    fields.forEach((f) => {
      const text = this.formatParamValue(f, p[f.key]);
      if (text) parts.push(text);
    });
    return parts.length ? parts.join(" · ") : "未设置";
  }

  protected iconRelPath(field: FieldDef, row: Row): string {
    const tpl = field?.path || field?.icon || "";
    return String(tpl).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
      const v = row?.[key];
      return v == null ? "" : String(v);
    });
  }

  protected iconSrc(field: FieldDef, row: Row): string {
    const rel = this.iconRelPath(field, row);
    if (!rel || /\{|\}/.test(rel) || rel.includes("//")) return "";
    if (this.api.assetURL) return this.api.assetURL(rel);
    return rel;
  }

  protected refreshRowIcons(ri: number): void {
    const row = this.data.rows[ri] || {};
    this.fields.forEach((field) => {
      if (!field || (field.widget !== "icon" && field.type !== "icon")) return;
      const img = this.el.querySelector(`[data-testid="${this.testPrefix}-${field.key}-${ri}"]`);
      if (!img || img.tagName !== "IMG") return;
      const src = this.iconSrc(field, row);
      const image = img as HTMLImageElement;
      image.src = src || "";
      image.alt = src ? this.iconRelPath(field, row) : "无图标";
      image.style.opacity = src ? "1" : "0.35";
      image.title = this.iconRelPath(field, row) || "";
    });
  }

  protected fieldByKey(key: string): FieldDef | undefined {
    return this.fields.find((f) => f.key === key) || this.batchableFields()[0];
  }

  protected testAttr(key: string, ri: RowIndex): string {
    return `data-testid="${escapeAttr(`${this.testPrefix}-${key}-${ri}`)}"`;
  }

  protected inputStyle(compact: boolean): string {
    return `width:100%;min-width:${compact ? "88px" : "100%"};height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px`;
  }

  protected fieldControl(field: FieldDef, row: Row, ri: RowIndex, compact: boolean): string {
    const key = field.key;
    const val = row[key] == null ? "" : row[key];
    let widget = field.widget || (field.type === "bool" ? "checkbox" : "text");
    if (compact && widget === "radio") widget = "select";
    if (compact && widget === "textarea") widget = "text";
    const test = this.testAttr(key, ri);
    const input = this.inputStyle(compact);
    if (widget === "checkbox") {
      return `<label style="display:flex;align-items:center;justify-content:${compact ? "center" : "flex-start"};gap:8px;height:28px"><input type="checkbox" ${test}${truthy(val) ? " checked" : ""} />${compact || !this.checkboxHint ? "" : `<span style="color:#d4d4d4">${escapeHtml(this.checkboxHint)}</span>`}</label>`;
    }
    if (widget === "icon" || field.type === "icon") {
      const src = this.iconSrc(field, row);
      const rel = this.iconRelPath(field, row);
      const size = compact ? 36 : 48;
      return `<div style="display:flex;align-items:center;gap:8px"><img ${test} src="${escapeAttr(src)}" alt="${escapeAttr(rel || "icon")}" title="${escapeAttr(rel)}" width="${size}" height="${size}" style="width:${size}px;height:${size}px;object-fit:contain;background:#141414;border:1px solid #3a3a3a;border-radius:6px;image-rendering:auto;opacity:${src ? "1" : "0.35"}" />${compact ? "" : `<span style="color:#737373;font-size:11px;word-break:break-all">${escapeHtml(rel || "缺少 path")}</span>`}</div>`;
    }
    if (widget === "params" || field.type === "object") {
      const summary = this.paramsSummary(val, row);
      return `<button type="button" data-role="params-open" ${test} style="${input};min-width:${compact ? "140px" : "100%"};display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;${summary === "未设置" ? "color:#737373" : "color:#f5f5f5"}">${escapeHtml(summary)}</span><span style="color:#a3a3a3;flex-shrink:0">编辑</span></button>`;
    }
    if (widget === "select") {
      let html = `<select ${test} style="${input}">`;
      this.enumOptions(field).forEach((opt) => {
        html += `<option value="${escapeAttr(opt.id)}"${String(val) === opt.id ? " selected" : ""}>${escapeHtml(opt.name)}</option>`;
      });
      return html + "</select>";
    }
    if (widget === "radio") {
      let radios = '<div style="display:flex;flex-wrap:wrap;gap:8px 12px;padding-top:4px">';
      this.enumOptions(field).forEach((opt) => {
        radios += `<label style="display:flex;align-items:center;gap:4px"><input type="radio" name="${escapeAttr(`${this.testPrefix}-${key}-${ri}`)}" value="${escapeAttr(opt.id)}" ${test}${String(val) === opt.id ? " checked" : ""} />${escapeHtml(opt.name)}</label>`;
      });
      return radios + "</div>";
    }
    if (widget === "textarea") {
      return `<textarea ${test} rows="3" style="width:100%;min-height:64px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:6px 8px;resize:vertical">${escapeHtml(val)}</textarea>`;
    }
    if (widget === "range") {
      const min = num(field.min, 0);
      const max = num(field.max, 100);
      const cur = num(val, min);
      return `<div style="display:flex;align-items:center;gap:6px;min-width:${compact ? "120px" : "160px"}"><input type="range" ${test} min=${min} max=${max} value="${escapeAttr(cur)}" style="flex:1" /><span data-role="range-label" style="width:28px;color:#a3a3a3;font-family:ui-monospace,monospace">${escapeHtml(cur)}</span></div>`;
    }
    if (widget === "date") {
      return `<input type="date" ${test} value="${escapeAttr(val)}" style="${input}" />`;
    }
    if (widget === "multiselect" || widget === "tags") {
      const mid = `${key}-${ri}`;
      const summary = this.multiSummary(field, val);
      return `<div data-role="multi-wrap" data-multi-id="${escapeAttr(mid)}" style="position:relative;min-width:${compact ? "140px" : "100%"}"><button type="button" data-role="multi-toggle" ${test} style="${input};display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer"><span data-role="multi-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;${splitMulti(val).length ? "color:#f5f5f5" : "color:#737373"}">${escapeHtml(summary)}</span><span style="color:#a3a3a3;flex-shrink:0">▾</span></button></div>`;
    }
    if (widget === "number" || field.type === "int" || field.type === "float") {
      let extra = "";
      if (field.min != null) extra += ` min=${num(field.min, 0)}`;
      if (field.max != null) extra += ` max=${num(field.max, 0)}`;
      if (field.step != null) extra += ` step=${field.step}`;
      else if (field.type === "float") extra += " step=0.1";
      return `<input type="number" ${test}${extra} value="${escapeAttr(val)}" style="${input}" />`;
    }
    const readonly = this.idReadonly && key === "id" && row.id ? " readonly" : "";
    const mono = key === "id" ? ";font-family:ui-monospace,monospace" : "";
    return `<input type="text" ${test}${readonly} value="${escapeAttr(val)}" style="${input}${mono}" />`;
  }

  protected coerce(field: FieldDef, value: unknown): unknown {
    if (!field) return value;
    if (field.type === "int") return String(parseInt(String(value), 10) || 0);
    if (field.type === "float") return String(Number(value) || 0);
    if (field.type === "bool") return truthy(value) ? "true" : "false";
    return value;
  }

  protected batchableFields(): FieldDef[] {
    return this.fields.filter(
      (f) => f.key && f.key !== "id" && f.widget !== "icon" && f.type !== "icon" && f.widget !== "params" && f.type !== "object",
    );
  }

  protected rowFilterText(field: FieldDef, row: Row): string {
    if (!field?.key) return "";
    if (field.widget === "params" || field.type === "object") return this.paramsSummary(row[field.key], row);
    if (field.widget === "icon" || field.type === "icon") return this.iconRelPath(field, row);
    if (field.widget === "multiselect" || field.widget === "tags") return this.multiSummary(field, row[field.key]);
    if (field.type === "bool") return truthy(row[field.key]) ? "true" : "false";
    const val = row[field.key] == null ? "" : row[field.key];
    if (field.enum || field.type === "enum") {
      let name = "";
      this.enumOptions(field).forEach((opt) => {
        if (String(opt.id) === String(val)) name = opt.name;
      });
      return String(val) + (name ? ` ${name}` : "");
    }
    return String(val);
  }

  protected rowMatchesFilters(row: Row): boolean {
    for (const field of this.fields) {
      if (!field?.key) continue;
      if (field.widget === "icon" || field.type === "icon") continue;
      const q = String(this.colFilters[field.key] ?? "").trim();
      if (!q) continue;
      if (field.type === "bool") {
        if ((truthy(row[field.key]) ? "true" : "false") !== q) return false;
        continue;
      }
      if ((field.enum || field.type === "enum") && field.widget !== "multiselect" && field.widget !== "tags") {
        if (String(row[field.key] ?? "") !== q) return false;
        continue;
      }
      if (!this.rowFilterText(field, row).toLowerCase().includes(q.toLowerCase())) return false;
    }
    return true;
  }

  protected filteredRowIndexes(): number[] {
    const out: number[] = [];
    this.data.rows.forEach((row, i) => {
      if (this.rowMatchesFilters(row || {})) out.push(i);
    });
    return out;
  }

  protected hasActiveFilters(): boolean {
    return this.fields.some((field) => field?.key && String(this.colFilters[field.key] || "").trim());
  }

  protected filterableField(field: FieldDef): boolean {
    return Boolean(field?.key && field.widget !== "icon" && field.type !== "icon");
  }

  protected emptyRow(): Row {
    const row: Row = {};
    this.fields.forEach((f) => {
      if (!f?.key) return;
      if (f.key === "id") row.id = `new_${this.data.rows.length + 1}`;
      else if (f.widget === "icon" || f.type === "icon") return;
      else if (f.widget === "params" || f.type === "object") row[f.key] = this.defaultParams(row);
      else if (f.type === "bool") row[f.key] = "true";
      else if (f.type === "int" || f.type === "float") row[f.key] = "0";
      else if (f.widget === "multiselect") row[f.key] = "";
      else {
        const opts = this.enumOptions(f);
        row[f.key] = opts.length ? opts[0].id : "";
      }
    });
    if (!row.id && this.fields.some((f) => f.key === "id")) row.id = `new_${this.data.rows.length + 1}`;
    return row;
  }

  protected renderExtra(): string {
    return "";
  }

  protected afterDataChange(): void {}

  protected bindExtra(): void {}

  protected btn(kind: string, extra = ""): string {
    if (kind === "primary") {
      return `height:28px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px;cursor:pointer;${extra}`;
    }
    if (kind === "danger") {
      return `height:28px;padding:0 10px;background:transparent;color:#eb5757;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer;${extra}`;
    }
    return `height:28px;padding:0 10px;background:#2a2a2a;color:#f5f5f5;border:0;border-radius:4px;cursor:pointer;${extra}`;
  }

  protected tabStyle(active: boolean): string {
    return `height:28px;padding:0 10px;border:0;border-radius:4px;cursor:pointer;${active ? "background:#2a2a2a;color:#f5f5f5" : "background:transparent;color:#a3a3a3"}`;
  }

  protected tid(name: string): string {
    return `${this.testPrefix}-${name}`;
  }

  protected renderToolbar(): string {
    const n = this.selectedIndexes().length;
    const disabled = n === 0 ? "opacity:.45;cursor:default" : "";
    const flexHost = this.enableTableScroll || this.view === "card";
    const layout = flexHost
      ? "padding:16px 20px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;min-height:0"
      : "padding:12px;box-sizing:border-box;height:100%;overflow:auto;display:flex;flex-direction:column;gap:12px";
    let html = `<div data-testid="${escapeAttr(this.rootTestId)}" style="${layout}">`;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px;flex-wrap:wrap;flex-shrink:0">';
    html += `<div><div style="font-weight:500">${escapeHtml(this.titleForToolbar())}</div>`;
    html += `<div style="color:#a3a3a3;margin-top:2px">${escapeHtml(this.hintForToolbar())}</div></div>`;
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
    if (this.enableCardView) {
      html += `<div style="display:flex;padding:2px;border:1px solid #3a3a3a;border-radius:6px"><button type="button" data-testid="${this.tid("view-table")}" style="${this.tabStyle(this.view === "table")}">表格</button><button type="button" data-testid="${this.tid("view-card")}" style="${this.tabStyle(this.view === "card")}">卡片</button></div>`;
    }
    if (this.enableColFilters && this.view === "table" && this.hasActiveFilters()) {
      html += `<button type="button" data-testid="${this.tid("filter-clear")}" style="${this.btn("ghost")}">清除筛选</button>`;
    }
    const countText = `已选 ${n}${this.selectedCountSuffix}`;
    html += `<span data-testid="${this.tid("selected-count")}" style="color:#a3a3a3;min-width:56px">${countText}</span>`;
    html += `<button type="button" data-testid="${this.tid("batch-edit")}" ${n ? "" : "disabled "}style="${this.btn("ghost", disabled)}">批量修改</button>`;
    html += `<button type="button" data-testid="${this.tid("batch-delete")}" ${n ? "" : "disabled "}style="${this.btn("danger", disabled)}">批量删除</button>`;
    html += `<button type="button" data-testid="${this.tid("add")}" style="${this.btn("ghost")}">新增一行</button>`;
    html += `<button type="button" data-testid="${this.tid("save")}" style="${this.btn("primary")}">保存</button></div></div>`;
    if (this.batchOpen) html += this.renderBatchPanel();
    return html;
  }

  protected renderBatchPanel(): string {
    const list = this.batchableFields();
    if (!list.length) return "";
    const field = this.fieldByKey(this.batchKey) || list[0];
    this.batchKey = field.key;
    if (this.batchDraft[field.key] == null) {
      const opts = this.enumOptions(field);
      if (field.type === "bool") this.batchDraft[field.key] = "true";
      else if (opts.length) this.batchDraft[field.key] = opts[0].id;
      else if (field.type === "int" || field.type === "float") this.batchDraft[field.key] = "0";
      else this.batchDraft[field.key] = "";
    }
    let html = `<div data-testid="${this.tid("batch-panel")}" style="margin-bottom:12px;padding:12px;border:1px solid #3a3a3a;border-radius:8px;background:#141414">`;
    html += `<div style="margin-bottom:8px;color:#d4d4d4">把下列值写到已选 ${this.selectedIndexes().length} 行</div>`;
    html += '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">';
    html += '<label style="min-width:140px"><div style="margin-bottom:4px;color:#a3a3a3">字段</div>';
    html += `<select data-testid="${this.tid("batch-field")}" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px">`;
    list.forEach((f) => {
      html += `<option value="${escapeAttr(f.key)}"${f.key === this.batchKey ? " selected" : ""}>${escapeHtml(f.label || f.key)}</option>`;
    });
    html += "</select></label>";
    html += '<label style="min-width:200px;flex:1"><div style="margin-bottom:4px;color:#a3a3a3">新值</div>';
    html += this.fieldControl(field, this.batchDraft, "batch", true);
    html += "</label>";
    html += `<button type="button" data-testid="${this.tid("batch-apply")}" style="${this.btn("primary")}">应用到选中行</button>`;
    html += `<button type="button" data-testid="${this.tid("batch-cancel")}" style="${this.btn("ghost")}">取消</button></div></div>`;
    return html;
  }

  protected headerFilterBtn(field: FieldDef): string {
    if (!this.enableColFilters || !this.filterableField(field)) return "";
    const active = String(this.colFilters[field.key] || "").trim();
    const on = Boolean(active) || this.openFilterKey === field.key;
    return `<button type="button" data-role="col-filter-btn" data-key="${escapeAttr(field.key)}" title="筛选" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:4px;padding:0;border:0;border-radius:3px;cursor:pointer;background:${on ? "#243044" : "transparent"}">${this.filterIconSvg(on)}</button>`;
  }

  protected filterIconSvg(active: boolean): string {
    const color = active ? "#3794ff" : "#a3a3a3";
    return `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style="display:block"><path fill="${color}" d="M1.2 2.2h9.6L7.1 6.5v3.2L4.9 11V6.5L1.2 2.2z"/></svg>`;
  }

  protected renderTable(): string {
    const idxs = this.enableColFilters ? this.filteredRowIndexes() : this.data.rows.map((_, i) => i);
    const allOn = idxs.length > 0 && idxs.every((i) => this.picked[i]);
    const wrapTest = this.tid("table");
    const sticky = this.enableTableScroll
      ? "position:sticky;top:0;z-index:2;"
      : "";
    let html = this.enableTableScroll
      ? `<div style="flex:1;min-height:0;overflow:hidden"><div data-testid="${wrapTest}" style="width:100%;overflow-x:auto;overflow-y:hidden;border:1px solid #3a3a3a;border-radius:8px">`
      : `<div data-testid="${wrapTest}" style="border:1px solid #3a3a3a;border-radius:8px;overflow:hidden">`;
    html += `<table style="${this.enableTableScroll ? "width:max-content;min-width:100%;" : "width:100%;"}border-collapse:collapse">`;
    html += "<thead><tr>";
    html += `<th style="${sticky}background:#1a1a1a;padding:8px;border-bottom:1px solid #3a3a3a;width:36px"><input type="checkbox" data-testid="${this.tid("pick-all")}"${allOn ? " checked" : ""} /></th>`;
    this.fields.forEach((field) => {
      html += `<th style="${sticky}background:#1a1a1a;text-align:left;color:#a3a3a3;font-weight:500;padding:8px;border-bottom:1px solid #3a3a3a;white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:2px">${escapeHtml(field.label || field.key)}${this.headerFilterBtn(field)}</span></th>`;
    });
    html += `<th style="${sticky}background:#1a1a1a;padding:8px;border-bottom:1px solid #3a3a3a;color:#a3a3a3">操作</th></tr></thead><tbody>`;
    if (!idxs.length) {
      html += `<tr><td colspan="${this.fields.length + 2}" style="padding:24px;text-align:center;color:#a3a3a3">${this.data.rows.length ? "无匹配行，试试清除筛选" : "暂无行，点击「新增一行」"}</td></tr>`;
    }
    idxs.forEach((ri, vis) => {
      const row = this.data.rows[ri] || {};
      html += `<tr data-testid="${this.tid(`row-${ri}`)}" style="background:${this.picked[ri] ? "#1c2430" : vis % 2 && this.enableTableScroll ? "#111" : "transparent"}">`;
      html += `<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a;text-align:center"><input type="checkbox" data-role="pick" data-index="${ri}" data-testid="${this.tid(`pick-${ri}`)}"${this.picked[ri] ? " checked" : ""} /></td>`;
      this.fields.forEach((field) => {
        html += `<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a;vertical-align:middle">${this.fieldControl(field, row, ri, true)}</td>`;
      });
      html += `<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a"><button type="button" data-role="remove" data-index="${ri}" style="${this.btn("danger")}">删除</button></td></tr>`;
    });
    html += "</tbody></table></div>";
    if (this.enableTableScroll) html += "</div>";
    return html;
  }

  protected renderCards(rows: Row[]): string {
    if (!rows.length) {
      return '<div style="color:#a3a3a3;padding:24px 0;text-align:center">暂无行，点击「新增一行」</div>';
    }
    let html = "";
    rows.forEach((row, ri) => {
      row = row || {};
      html += `<section data-testid="${this.tid(`row-${ri}`)}" style="margin-bottom:12px;border:1px solid #3a3a3a;border-radius:8px;background:#141414">`;
      html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #3a3a3a">';
      html += `<label style="display:flex;align-items:center;gap:8px;font-family:ui-monospace,monospace;color:#d4d4d4"><input type="checkbox" data-role="pick" data-index="${ri}" data-testid="${this.tid(`pick-${ri}`)}"${this.picked[ri] ? " checked" : ""} />${escapeHtml(String(row.id || "未命名"))}${row.name ? ` · ${escapeHtml(String(row.name))}` : ""}</label>`;
      html += `<button type="button" data-role="remove" data-index="${ri}" style="height:28px;padding:0 8px;background:transparent;color:#eb5757;border:1px solid #3a3a3a;border-radius:4px">删除</button></div>`;
      this.groups().forEach((gid) => {
        const gFields = this.fields.filter((f) => (f.group || "basic") === gid);
        if (!gFields.length) return;
        html += '<div style="padding:12px;border-top:1px solid #2a2a2a">';
        html += `<div style="color:#a3a3a3;margin-bottom:8px">${escapeHtml(this.groupNames[gid] || gid)}</div>`;
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px 16px">';
        gFields.forEach((field) => {
          const wide =
            field.widget === "textarea" ||
            field.widget === "radio" ||
            field.widget === "multiselect" ||
            field.widget === "tags" ||
            field.widget === "params" ||
            field.type === "object";
          html += `<label style="display:block${wide ? ";grid-column:1/-1" : ""}"><div style="margin-bottom:4px;color:#a3a3a3">${escapeHtml(field.label || field.key)}${field.required === true || field.required === "true" ? " *" : ""}</div>`;
          html += this.fieldControl(field, row, ri, false);
          if (field.hint) html += `<div style="margin-top:4px;color:#737373;font-size:11px">${escapeHtml(field.hint)}</div>`;
          html += "</label>";
        });
        html += "</div></div>";
      });
      html += "</section>";
    });
    return `<div data-testid="${this.tid("cards")}" style="flex:1;min-height:0;overflow:auto">${html}</div>`;
  }

  protected removeFilterMenu(): void {
    this.el.querySelector('[data-role="col-filter-menu"]')?.remove();
  }

  protected placeFilterMenu(field: FieldDef): void {
    this.removeFilterMenu();
    if (!field || !this.filterableField(field)) {
      this.openFilterKey = null;
      return;
    }
    const btn = this.el.querySelector(`[data-role="col-filter-btn"][data-key="${field.key}"]`);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const cur = this.colFilters[field.key] == null ? "" : String(this.colFilters[field.key]);
    const menu = document.createElement("div");
    menu.setAttribute("data-role", "col-filter-menu");
    menu.setAttribute("data-key", field.key);
    const inputStyle =
      "width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px;box-sizing:border-box";
    let inputHtml = "";
    if (field.type === "bool") {
      inputHtml = `<select data-role="col-filter-input" style="${inputStyle}"><option value="">全部</option><option value="true"${cur === "true" ? " selected" : ""}>开启</option><option value="false"${cur === "false" ? " selected" : ""}>关闭</option></select>`;
    } else if ((field.enum || field.type === "enum") && field.widget !== "multiselect" && field.widget !== "tags") {
      inputHtml = `<select data-role="col-filter-input" style="${inputStyle}"><option value="">全部</option>`;
      this.enumOptions(field).forEach((opt) => {
        inputHtml += `<option value="${escapeAttr(opt.id)}"${cur === String(opt.id) ? " selected" : ""}>${escapeHtml(opt.name)}</option>`;
      });
      inputHtml += "</select>";
    } else {
      inputHtml = `<input data-role="col-filter-input" type="text" value="${escapeAttr(cur)}" placeholder="包含文字…" style="${inputStyle}" />`;
    }
    menu.innerHTML = `<div style="margin-bottom:8px;color:#d4d4d4;font-size:12px">筛选 · ${escapeHtml(field.label || field.key)}</div>${inputHtml}<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button type="button" data-role="col-filter-clear" style="height:26px;padding:0 10px;background:transparent;color:#f5f5f5;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer">清除</button><button type="button" data-role="col-filter-ok" style="height:26px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px;cursor:pointer">确定</button></div>`;
    const width = 220;
    let left = Math.min(rect.left, window.innerWidth - width - 8);
    if (left < 8) left = 8;
    let top = rect.bottom + 4;
    if (top + 160 > window.innerHeight) top = Math.max(8, rect.top - 164);
    menu.style.cssText = `position:fixed;z-index:10000;width:${width}px;left:${left}px;top:${top}px;background:#141414;border:1px solid #3a3a3a;border-radius:8px;padding:10px;box-shadow:0 12px 32px rgba(0,0,0,.55)`;
    this.el.appendChild(menu);
    menu.addEventListener("click", (ev) => ev.stopPropagation());
    const input = menu.querySelector('[data-role="col-filter-input"]') as HTMLInputElement | HTMLSelectElement | null;
    const applyAndClose = (next: string) => {
      this.colFilters[field.key] = next ?? "";
      this.openFilterKey = null;
      this.removeFilterMenu();
      this.render();
    };
    menu.querySelector('[data-role="col-filter-clear"]')?.addEventListener("click", () => applyAndClose(""));
    menu.querySelector('[data-role="col-filter-ok"]')?.addEventListener("click", () => applyAndClose(input ? input.value : ""));
    if (input) {
      if (input.tagName === "SELECT") {
        input.addEventListener("change", () => applyAndClose(input.value));
      } else {
        input.focus();
        input.addEventListener("keydown", (raw) => {
          const ev = raw as KeyboardEvent;
          if (ev.key === "Enter") {
            ev.preventDefault();
            applyAndClose(input.value);
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            this.openFilterKey = null;
            this.removeFilterMenu();
            this.render();
          }
        });
      }
    }
  }

  protected removeMultiMenu(): void {
    this.el.querySelector('[data-role="multi-menu"]')?.remove();
  }

  protected currentMultiValue(ri: RowIndex, key: string): unknown {
    if (ri === "batch") return this.batchDraft[key] ?? "";
    return (this.data.rows[ri] || {})[key] ?? "";
  }

  protected placeMultiMenu(field: FieldDef, ri: RowIndex): void {
    this.removeMultiMenu();
    const mid = `${field.key}-${ri}`;
    const wrap = this.el.querySelector(`[data-role="multi-wrap"][data-multi-id="${mid}"]`);
    if (!wrap) return;
    const toggle = wrap.querySelector('[data-role="multi-toggle"]');
    const label = wrap.querySelector('[data-role="multi-label"]') as HTMLElement | null;
    if (!toggle) return;
    const rect = toggle.getBoundingClientRect();
    const selected: Record<string, boolean> = {};
    splitMulti(this.currentMultiValue(ri, field.key)).forEach((id) => {
      selected[id] = true;
    });
    const menu = document.createElement("div");
    menu.setAttribute("data-role", "multi-menu");
    menu.setAttribute("data-multi-id", mid);
    const opts = this.enumOptions(field);
    let inner = "";
    opts.forEach((opt) => {
      inner += `<label style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;white-space:nowrap"><input type="checkbox" data-role="multi" value="${escapeAttr(opt.id)}"${selected[opt.id] ? " checked" : ""} />${escapeHtml(opt.name)}</label>`;
    });
    if (!opts.length) inner = '<div style="padding:8px;color:#737373;font-size:12px">暂无枚举项</div>';
    menu.innerHTML = inner;
    const maxH = 220;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
    const height = Math.min(maxH, Math.max(120, openUp ? spaceAbove : spaceBelow));
    menu.style.cssText = `position:fixed;z-index:9999;min-width:${Math.max(rect.width, 160)}px;max-height:${height}px;overflow:auto;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:4px;padding:6px;box-shadow:0 10px 28px rgba(0,0,0,.5);left:${rect.left}px;${openUp ? `bottom:${window.innerHeight - rect.top + 2}px;top:auto;` : `top:${rect.bottom + 2}px;`}`;
    this.el.appendChild(menu);
    menu.addEventListener("click", (ev) => ev.stopPropagation());
    menu.addEventListener(
      "wheel",
      (ev) => {
        ev.stopPropagation();
        if (!ev.deltaY) return;
        menu.scrollTop += ev.deltaY;
        ev.preventDefault();
      },
      { passive: false },
    );
    const boxes = menu.querySelectorAll<HTMLInputElement>('[data-role="multi"]');
    const syncMulti = () => {
      const ids: string[] = [];
      boxes.forEach((box) => {
        if (box.checked) ids.push(box.value);
      });
      const next = joinMulti(ids);
      this.setRow(ri, field.key, next);
      if (label) {
        label.textContent = this.multiSummary(field, next);
        label.style.color = ids.length ? "#f5f5f5" : "#737373";
      }
    };
    boxes.forEach((box) => box.addEventListener("change", syncMulti));
  }

  protected removeParamsDialog(): void {
    this.el.querySelector('[data-role="params-dialog"]')?.remove();
  }

  protected placeParamsDialog(): void {
    this.removeParamsDialog();
    if (this.paramsEditRi == null || !this.data.rows[this.paramsEditRi]) {
      this.paramsEditRi = null;
      this.paramsDraft = null;
      return;
    }
    const row = this.data.rows[this.paramsEditRi] || {};
    const fields = this.paramsSchema(row);
    if (!this.paramsDraft) this.paramsDraft = this.normalizeParams(row.params, row);
    const overlay = document.createElement("div");
    overlay.setAttribute("data-role", "params-dialog");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
    let panel = `<div data-role="params-panel" style="width:min(420px,100%);background:#141414;border:1px solid #3a3a3a;border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.55);padding:16px">`;
    panel += `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px"><div><div style="font-size:14px;color:#f5f5f5">${escapeHtml(this.paramsTitle(row))}</div><div style="margin-top:2px;color:#737373;font-size:12px">${escapeHtml(String(row.name || row.id || `行 ${this.paramsEditRi + 1}`))} · ${escapeHtml(String(row.kind || "unknown"))}</div></div><button type="button" data-role="params-close" style="height:28px;padding:0 10px;background:#2a2a2a;color:#f5f5f5;border:0;border-radius:4px;cursor:pointer">关闭</button></div>`;
    panel += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px">';
    fields.forEach((f) => {
      const v = this.paramsDraft?.[f.key];
      panel += `<label style="display:block"><div style="margin-bottom:4px;color:#a3a3a3">${escapeHtml(f.label)}</div><input data-role="params-field" data-key="${escapeAttr(f.key)}" type="number" value="${escapeAttr(v)}"${f.min != null ? ` min=${f.min}` : ""}${f.max != null ? ` max=${f.max}` : ""}${f.step != null ? ` step=${f.step}` : f.type === "float" ? " step=0.01" : ""} style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px" /></label>`;
    });
    panel += "</div>";
    panel += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px"><button type="button" data-role="params-cancel" style="height:28px;padding:0 12px;background:transparent;color:#f5f5f5;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer">取消</button><button type="button" data-role="params-save" style="height:28px;padding:0 12px;background:#3794ff;color:#fff;border:0;border-radius:4px;cursor:pointer">确定</button></div></div>';
    overlay.innerHTML = panel;
    this.el.appendChild(overlay);
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) {
        this.paramsEditRi = null;
        this.paramsDraft = null;
        this.render();
      }
    });
    overlay.querySelector('[data-role="params-panel"]')?.addEventListener("click", (ev) => ev.stopPropagation());
    overlay.querySelectorAll<HTMLInputElement>('[data-role="params-field"]').forEach((input) => {
      input.addEventListener("change", () => {
        const key = input.getAttribute("data-key") || "";
        const meta = fields.find((f) => f.key === key);
        let n = meta?.type === "int" ? parseInt(input.value, 10) : Number(input.value);
        if (Number.isNaN(n)) n = 0;
        if (meta?.min != null && n < meta.min) n = meta.min;
        if (meta?.max != null && n > meta.max) n = meta.max;
        if (this.paramsDraft) this.paramsDraft[key] = n;
        input.value = String(n);
      });
    });
    const closeDialog = () => {
      this.paramsEditRi = null;
      this.paramsDraft = null;
      this.render();
    };
    overlay.querySelector('[data-role="params-close"]')?.addEventListener("click", closeDialog);
    overlay.querySelector('[data-role="params-cancel"]')?.addEventListener("click", closeDialog);
    overlay.querySelector('[data-role="params-save"]')?.addEventListener("click", () => {
      overlay.querySelectorAll<HTMLInputElement>('[data-role="params-field"]').forEach((input) => {
        input.dispatchEvent(new Event("change"));
      });
      this.setRow(this.paramsEditRi as number, "params", this.normalizeParams(this.paramsDraft, row));
      this.paramsEditRi = null;
      this.paramsDraft = null;
      this.render();
    });
  }

  protected bindControl(root: HTMLElement, field: FieldDef, ri: RowIndex): void {
    let widget = field.widget || "text";
    if (widget === "icon" || field.type === "icon") return;
    if (widget === "params" || field.type === "object") {
      const btnOpen = root.querySelector(`[data-testid="${this.testPrefix}-${field.key}-${ri}"]`);
      if (!btnOpen || typeof ri !== "number") return;
      btnOpen.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const row = this.data.rows[ri] || {};
        this.paramsEditRi = ri;
        this.paramsDraft = this.normalizeParams(row.params, row);
        this.render();
      });
      return;
    }
    if (widget === "multiselect" || widget === "tags") {
      const mid = `${field.key}-${ri}`;
      const wrap = root.querySelector(`[data-role="multi-wrap"][data-multi-id="${mid}"]`);
      if (!wrap) return;
      wrap.querySelector('[data-role="multi-toggle"]')?.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.openMultiKey = this.openMultiKey === mid ? null : mid;
        this.render();
      });
      if (this.openMultiKey === mid) this.placeMultiMenu(field, ri);
      return;
    }
    const nodes = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      `[data-testid="${this.testPrefix}-${field.key}-${ri}"]`,
    );
    if (!nodes.length) return;
    const node = nodes[0];
    if (node.tagName === "SELECT") widget = "select";
    if (node.tagName === "TEXTAREA") widget = "textarea";
    if ("type" in node && node.type === "checkbox") widget = "checkbox";
    if ("type" in node && node.type === "range") widget = "range";
    const apply = (value: unknown) => {
      if (field.type === "int") this.setRow(ri, field.key, String(parseInt(String(value), 10) || 0));
      else if (field.type === "float") this.setRow(ri, field.key, String(Number(value) || 0));
      else if (field.type === "bool") this.setRow(ri, field.key, value ? "true" : "false");
      else this.setRow(ri, field.key, value);
      if (typeof ri === "number" && field.key === "id") this.refreshRowIcons(ri);
      if (typeof ri === "number" && field.key === "kind" && this.paramsSchema(this.data.rows[ri] || {}).length) {
        const row = this.data.rows[ri] || {};
        row.params = this.normalizeParams(row.params, { ...row, kind: value });
        this.api.setData(this.data);
        this.render();
      }
    };
    if (widget === "checkbox") {
      nodes[0].addEventListener("change", (ev) => apply((ev.target as HTMLInputElement).checked));
      return;
    }
    if (widget === "radio") {
      nodes.forEach((item) => {
        item.addEventListener("change", (ev) => {
          const target = ev.target as HTMLInputElement;
          if (target.checked) apply(target.value);
        });
      });
      return;
    }
    if (widget === "range") {
      const rangeLabel = nodes[0].parentElement?.querySelector("[data-role=range-label]");
      nodes[0].addEventListener("input", (ev) => {
        const value = (ev.target as HTMLInputElement).value;
        if (rangeLabel) rangeLabel.textContent = value;
        apply(value);
      });
      return;
    }
    const evName = widget === "select" || widget === "date" || widget === "number" ? "change" : "input";
    nodes[0].addEventListener(evName, (ev) => apply((ev.target as HTMLInputElement).value));
    if (widget === "number") {
      nodes[0].addEventListener("input", (ev) => apply((ev.target as HTMLInputElement).value));
    }
  }

  protected syncTableScroll(): void {
    const wrap = this.el.querySelector(`[data-testid="${this.tid("table")}"]`) as HTMLElement | null;
    if (!wrap) return;
    const holder = wrap.parentElement;
    const table = wrap.querySelector("table");
    if (!holder || !table) return;
    wrap.style.height = "auto";
    wrap.style.maxHeight = "";
    wrap.style.overflowX = "auto";
    wrap.style.overflowY = "hidden";
    const maxH = holder.clientHeight;
    if (maxH <= 0) return;
    const tableH = table.offsetHeight;
    let hBar = wrap.scrollWidth > wrap.clientWidth ? wrap.offsetHeight - wrap.clientHeight : 0;
    if (hBar < 0) hBar = 0;
    if (!hBar && wrap.scrollWidth > wrap.clientWidth) hBar = 10;
    const need = tableH + hBar;
    if (need > maxH) {
      wrap.style.height = `${maxH}px`;
      wrap.style.overflowY = "auto";
    } else {
      wrap.style.height = `${need}px`;
      wrap.style.overflowY = "hidden";
    }
  }

  protected remapPickedAfterDelete(removed: number): void {
    const next: Record<number, boolean> = {};
    Object.keys(this.picked).forEach((key) => {
      const i = Number(key);
      if (i === removed) return;
      next[i > removed ? i - 1 : i] = true;
    });
    this.picked = next;
  }

  protected render(): void {
    const prevTable = this.el.querySelector(`[data-testid="${this.tid("table")}"]`) as HTMLElement | null;
    const savedScrollLeft = prevTable ? prevTable.scrollLeft : 0;
    const savedScrollTop = prevTable ? prevTable.scrollTop : 0;
    let html = this.renderToolbar();
    html += this.renderExtra();
    html += this.view === "card" ? this.renderCards(this.data.rows) : this.renderTable();
    html += "</div>";
    this.el.innerHTML = html;

    const visible =
      this.view === "table" && this.enableColFilters
        ? this.filteredRowIndexes()
        : this.data.rows.map((_, i) => i);
    visible.forEach((ri) => {
      this.fields.forEach((field) => this.bindControl(this.el, field, ri));
    });
    if (this.paramsEditRi != null) this.placeParamsDialog();

    this.el.querySelectorAll('[data-role="col-filter-btn"]').forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = btn.getAttribute("data-key");
        this.openFilterKey = this.openFilterKey === key ? null : key;
        this.render();
      });
    });
    if (this.openFilterKey) {
      const filterField = this.fieldByKey(this.openFilterKey);
      if (filterField) this.placeFilterMenu(filterField);
      else this.openFilterKey = null;
    }
    this.el.querySelector(`[data-testid="${this.tid("filter-clear")}"]`)?.addEventListener("click", () => {
      this.colFilters = {};
      this.openFilterKey = null;
      this.removeFilterMenu();
      this.render();
    });
    if (!this.filterCloseBound) {
      this.filterCloseBound = true;
      document.addEventListener("click", (ev) => {
        if (!this.openFilterKey) return;
        const target = ev.target as HTMLElement | null;
        if (target?.closest?.('[data-role="col-filter-menu"]') || target?.closest?.('[data-role="col-filter-btn"]')) {
          return;
        }
        this.openFilterKey = null;
        this.removeFilterMenu();
        this.render();
      });
    }
    if (this.enableTableScroll) {
      this.syncTableScroll();
      const nextTable = this.el.querySelector(`[data-testid="${this.tid("table")}"]`) as HTMLElement | null;
      if (nextTable) {
        nextTable.scrollLeft = savedScrollLeft;
        nextTable.scrollTop = savedScrollTop;
      }
      if (!this.resizeBound) {
        this.resizeBound = true;
        window.addEventListener("resize", () => this.syncTableScroll());
      }
    }
    if (!this.multiCloseBound) {
      this.multiCloseBound = true;
      document.addEventListener("click", (ev) => {
        if (!this.openMultiKey) return;
        const target = ev.target as HTMLElement | null;
        if (target?.closest?.('[data-role="multi-wrap"]') || target?.closest?.('[data-role="multi-menu"]')) return;
        this.openMultiKey = null;
        this.removeMultiMenu();
        this.render();
      });
    }
    if (!this.multiScrollBound) {
      this.multiScrollBound = true;
      this.el.addEventListener(
        "scroll",
        (ev) => {
          if (!this.openMultiKey) return;
          const menu = this.el.querySelector('[data-role="multi-menu"]');
          const target = ev.target as Node;
          if (menu && (target === menu || menu.contains(target))) return;
          const table = this.el.querySelector(`[data-testid="${this.tid("table")}"]`);
          if (table && (target === table || table.contains(target))) {
            this.openMultiKey = null;
            this.removeMultiMenu();
            this.render();
          }
        },
        true,
      );
    }

    this.el.querySelectorAll("[data-role=remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const removed = Number(btn.getAttribute("data-index"));
        this.data.rows.splice(removed, 1);
        this.remapPickedAfterDelete(removed);
        this.api.setData(this.data);
        this.render();
      });
    });
    this.el.querySelector(`[data-testid="${this.tid("view-table")}"]`)?.addEventListener("click", () => {
      this.view = "table";
      this.render();
    });
    this.el.querySelector(`[data-testid="${this.tid("view-card")}"]`)?.addEventListener("click", () => {
      this.view = "card";
      this.render();
    });
    this.el.querySelector(`[data-testid="${this.tid("add")}"]`)?.addEventListener("click", () => {
      this.data.rows.push(this.emptyRow());
      this.api.setData(this.data);
      this.render();
    });
    this.el.querySelector(`[data-testid="${this.tid("save")}"]`)?.addEventListener("click", () => this.api.save());
    this.el.querySelectorAll("[data-role=pick]").forEach((box) => {
      box.addEventListener("change", () => {
        const i = Number(box.getAttribute("data-index"));
        if ((box as HTMLInputElement).checked) this.picked[i] = true;
        else delete this.picked[i];
        this.render();
      });
    });
    const pickAll = this.el.querySelector(`[data-testid="${this.tid("pick-all")}"]`) as HTMLInputElement | null;
    if (pickAll) {
      pickAll.addEventListener("change", () => {
        const idxs = this.enableColFilters ? this.filteredRowIndexes() : this.data.rows.map((_, i) => i);
        if (pickAll.checked) idxs.forEach((i) => (this.picked[i] = true));
        else idxs.forEach((i) => delete this.picked[i]);
        this.render();
      });
    }
    this.el.querySelector(`[data-testid="${this.tid("batch-edit")}"]`)?.addEventListener("click", () => {
      if (!this.selectedIndexes().length) return;
      this.batchOpen = true;
      this.render();
    });
    this.el.querySelector(`[data-testid="${this.tid("batch-delete")}"]`)?.addEventListener("click", () => {
      const idxs = this.selectedIndexes();
      if (!idxs.length) return;
      if (!window.confirm(`删除已选 ${idxs.length} 行？`)) return;
      idxs
        .slice()
        .reverse()
        .forEach((i) => this.data.rows.splice(i, 1));
      this.picked = {};
      this.batchOpen = false;
      this.api.setData(this.data);
      this.render();
    });
    this.el.querySelector(`[data-testid="${this.tid("batch-cancel")}"]`)?.addEventListener("click", () => {
      this.batchOpen = false;
      this.render();
    });
    const batchField = this.el.querySelector(`[data-testid="${this.tid("batch-field")}"]`) as HTMLSelectElement | null;
    if (batchField) {
      batchField.addEventListener("change", () => {
        this.batchKey = batchField.value;
        this.render();
      });
    }
    if (this.batchOpen) {
      const bf = this.fieldByKey(this.batchKey);
      if (bf) this.bindControl(this.el, bf, "batch");
    }
    this.el.querySelector(`[data-testid="${this.tid("batch-apply")}"]`)?.addEventListener("click", () => {
      const field = this.fieldByKey(this.batchKey);
      if (!field) return;
      const value = this.coerce(field, this.batchDraft[field.key]);
      this.selectedIndexes().forEach((i) => {
        if (!this.data.rows[i]) this.data.rows[i] = {};
        this.data.rows[i][field.key] = value;
      });
      this.api.setData(this.data);
      this.batchOpen = false;
      this.render();
    });
    this.bindExtra();
  }
}
