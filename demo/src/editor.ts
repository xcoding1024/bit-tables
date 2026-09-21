import type { EditorAPI, EnumEntry, FieldDef, ParamField, Row } from "./types";
import { asRecord, escapeAttr, escapeHtml, joinMulti, num, splitMulti, truthy } from "./dom";
import { BitSearchSelect } from "./search_select";
export { BitSearchSelect } from "./search_select";

type RowIndex = number | "batch";
type CellPos = { ri: number; ci: number };
type CellRange = { r0: number; r1: number; c0: number; c1: number };
type SelMode = "cell" | "row" | "col";
type CellSel = { anchor: CellPos; focus: CellPos; mode: SelMode };

export class BitTableEditorBase {
  testPrefix = "demo";
  rootTestId = "table-editor";
  toolbarHint = "单击或拖拽框选单元格，单击表头选列、单击行首选行，Ctrl+C / Ctrl+V 复制粘贴 · Ctrl+Shift+C 复制引用 · 双击编辑 · 勾选后可批量修改或删除";
  enableCardView = false;
  enableColFilters = false;
  enableTableScroll = false;
  tableMinHeight = 240;
  pageSize = 100;
  pageSizeOptions = [20, 50, 100, 200];
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
  protected pageIndex = 0;
  protected revealTarget: { ri: number; key: string; query: string } | null = null;
  protected editingCell: { ri: number; key: string } | null = null;
  protected selection: CellSel | null = null;
  private selecting = false;
  private editBlurTimer = 0;
  private resetTableScroll = false;
  private filterCloseBound = false;
  private multiCloseBound = false;
  private multiScrollBound = false;
  private resizeBound = false;
  private escapeBound = false;
  private selectBound = false;
  private clipboardBound = false;
  private copyRefKeyBound = false;
  private copyRefFlashTimer = 0;
  private liveSearchSelects: BitSearchSelect[] = [];
  protected pluginBound = new Set<string>();

  mount(el: HTMLElement, api: EditorAPI): void {
    this.el = el;
    this.api = api;
    this.struct = asRecord(api.getStruct()) || {};
    this.data = this.normalizeData(api.getData());
    this.enumsBag = (api.getEnums && api.getEnums()) || {};
    this.pluginBound = new Set(
      (api.getPluginCells?.() || []).map((item) => `${String(item.row || "").trim()}\t${String(item.field || "").trim()}`),
    );
    this.fields = this.parseFields(this.struct);
    this.title = String(this.struct.name || this.title || "配置表");
    this.view = String(this.struct.view || "").trim() === "card" ? "card" : "table";
    if (!this.batchKey) {
      const first = this.batchableFields()[0];
      this.batchKey = first ? first.key : "";
    }
    this.revealTarget = null;
    this.render();
  }

  reveal(target: { rowIndex: number; field?: string; query?: string }): void {
    const ri = Number(target?.rowIndex);
    const key = String(target?.field || "").trim();
    const query = String(target?.query || "").trim();
    if (!Number.isFinite(ri) || ri < 0 || ri >= this.data.rows.length) return;
    if (this.hasActiveFilters() && !this.filteredRowIndexes().includes(ri)) {
      this.colFilters = {};
      this.openFilterKey = null;
      this.removeFilterMenu();
    }
    const all = this.allVisibleRowIndexes();
    const pos = all.indexOf(ri);
    if (pos >= 0) {
      this.pageIndex = Math.floor(pos / this.resolvedPageSize());
      this.clampPage(all.length);
    }
    this.revealTarget = { ri, key, query };
    this.render();
    requestAnimationFrame(() => this.scrollRevealIntoView());
  }

  clearReveal(): void {
    if (!this.revealTarget) return;
    this.revealTarget = null;
    this.render();
  }

  protected onEscape(ev: KeyboardEvent): void {
    if (ev.key !== "Escape" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (this.paramsEditRi != null) {
      ev.preventDefault();
      this.paramsEditRi = null;
      this.paramsDraft = null;
      this.render();
      return;
    }
    if (this.openFilterKey) {
      ev.preventDefault();
      this.openFilterKey = null;
      this.removeFilterMenu();
      this.render();
      return;
    }
    if (this.closeSearchSelects() && !this.editingCell && !this.openMultiKey) {
      ev.preventDefault();
      return;
    }
    if (this.editingCell || this.openMultiKey) {
      ev.preventDefault();
      this.endEditCell();
      return;
    }
    if (this.revealTarget) {
      ev.preventDefault();
      this.clearReveal();
      return;
    }
    if (!this.selection) return;
    ev.preventDefault();
    this.clearCellSelection();
  }

  protected isRevealCell(ri: number, key: string): boolean {
    if (!this.revealTarget || this.revealTarget.ri !== ri) return false;
    if (this.revealTarget.key && this.revealTarget.key !== key) return false;
    return true;
  }

  protected revealAttr(ri: number, key: string): string {
    return this.isRevealCell(ri, key) ? ' data-reveal="1"' : "";
  }

  protected revealCellStyle(ri: number, key: string): string {
    if (!this.isRevealCell(ri, key)) return "";
    return "outline:2px solid #3794ff;outline-offset:-2px;box-shadow:inset 0 0 0 999px rgba(55,148,255,.22);";
  }

  protected revealRowStyle(ri: number): string {
    if (!this.revealTarget || this.revealTarget.ri !== ri || this.revealTarget.key) return "";
    return "outline:2px solid #3794ff;outline-offset:-2px;";
  }

  protected highlightQuery(text: string, ri: number, key: string): string {
    const q = this.revealTarget?.query || "";
    if (!q || !this.isRevealCell(ri, key)) return escapeHtml(text);
    const lower = text.toLowerCase();
    const needle = q.toLowerCase();
    const i = lower.indexOf(needle);
    if (i < 0) return escapeHtml(text);
    return (
      escapeHtml(text.slice(0, i)) +
      `<mark data-reveal-mark="1">${escapeHtml(text.slice(i, i + q.length))}</mark>` +
      escapeHtml(text.slice(i + q.length))
    );
  }

  protected scrollRevealIntoView(): void {
    if (!this.el || !this.revealTarget) return;
    const { ri, key } = this.revealTarget;
    const cell = key
      ? (this.el.querySelector(`[data-role="cell"][data-index="${ri}"][data-key="${key}"]`) as HTMLElement | null) ||
        (this.el.querySelector(`[data-role="cell-edit"][data-index="${ri}"][data-key="${key}"]`) as HTMLElement | null) ||
        (this.el.querySelector(`[data-testid="${this.testPrefix}-${key}-${ri}"]`) as HTMLElement | null)
      : null;
    const el =
      cell || (this.el.querySelector(`[data-testid="${this.tid(`row-${ri}`)}"]`) as HTMLElement | null);
    if (!el) return;
    const wrap = this.el.querySelector(`[data-testid="${this.tid("table")}"]`) as HTMLElement | null;
    const host = (wrap?.parentElement as HTMLElement | null) || this.el;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    for (const scroller of [wrap, host, this.el]) {
      if (!scroller) continue;
      const er = el.getBoundingClientRect();
      const wr = scroller.getBoundingClientRect();
      if (er.top < wr.top) scroller.scrollTop += er.top - wr.top - 24;
      if (er.bottom > wr.bottom) scroller.scrollTop += er.bottom - wr.bottom + 24;
      if (er.left < wr.left) scroller.scrollLeft += er.left - wr.left - 24;
      if (er.right > wr.right) scroller.scrollLeft += er.right - wr.right + 24;
    }
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
    this.syncHistoryButtons();
    this.afterDataChange();
  }

  protected selectedIndexes(): number[] {
    return Object.keys(this.picked)
      .map(Number)
      .filter((i) => this.picked[i] && this.data.rows[i])
      .sort((a, b) => a - b);
  }

  protected clearCellSelection(): void {
    if (!this.selection && !this.selecting) return;
    this.selection = null;
    this.setSelecting(false);
    this.paintSelection();
    this.reportSelection();
  }

  protected selectionRange(): CellRange | null {
    if (!this.selection) return null;
    const { anchor, focus } = this.selection;
    return {
      r0: Math.min(anchor.ri, focus.ri),
      r1: Math.max(anchor.ri, focus.ri),
      c0: Math.min(anchor.ci, focus.ci),
      c1: Math.max(anchor.ci, focus.ci),
    };
  }

  protected isCellSelected(ri: number, ci: number): boolean {
    const range = this.selectionRange();
    if (!range) return false;
    return ri >= range.r0 && ri <= range.r1 && ci >= range.c0 && ci <= range.c1;
  }

  protected isActiveCell(ri: number, ci: number): boolean {
    return this.selection?.focus.ri === ri && this.selection?.focus.ci === ci;
  }

  protected cellSelAttrs(ri: number, ci: number): string {
    const sel = this.isCellSelected(ri, ci) ? ' data-sel="1"' : "";
    const active = this.isActiveCell(ri, ci) ? ' data-active="1"' : "";
    return ` data-col="${ci}"${sel}${active}`;
  }

  protected setSelecting(on: boolean): void {
    this.selecting = on;
    const wrap = this.el?.querySelector(`[data-testid="${this.tid("table")}"]`) as HTMLElement | null;
    if (!wrap) return;
    if (on) wrap.setAttribute("data-selecting", "1");
    else wrap.removeAttribute("data-selecting");
  }

  protected syncCopyRefButton(): void {
    const btn = this.el?.querySelector(`[data-testid="${this.tid("copy-ref")}"]`) as HTMLButtonElement | null;
    if (!btn) return;
    const canRef = this.view === "table" && Boolean(this.selection);
    btn.disabled = !canRef;
    btn.style.opacity = canRef ? "" : ".45";
    btn.style.cursor = canRef ? "pointer" : "default";
  }

  protected selectionCoversAllRows(): boolean {
    const range = this.selectionRange();
    const last = this.data.rows.length - 1;
    return Boolean(range && last >= 0 && range.r0 === 0 && range.r1 === last);
  }

  protected selectionCoversAllCols(): boolean {
    const range = this.selectionRange();
    const last = this.fields.length - 1;
    return Boolean(range && last >= 0 && range.c0 === 0 && range.c1 === last);
  }

  protected isColHeadSelected(ci: number): boolean {
    const range = this.selectionRange();
    if (!range || ci < range.c0 || ci > range.c1) return false;
    return this.selection?.mode === "col" || this.selectionCoversAllRows();
  }

  protected isRowHeadSelected(ri: number): boolean {
    const range = this.selectionRange();
    if (!range || ri < range.r0 || ri > range.r1) return false;
    return this.selection?.mode === "row" || this.selectionCoversAllCols();
  }

  protected paintSelection(): void {
    if (!this.el) return;
    this.syncCopyRefButton();
    this.el.querySelectorAll("td[data-role=cell], td[data-role=cell-edit]").forEach((node) => {
      const td = node as HTMLElement;
      const ri = Number(td.getAttribute("data-index"));
      const ci = Number(td.getAttribute("data-col"));
      if (this.isCellSelected(ri, ci)) td.setAttribute("data-sel", "1");
      else td.removeAttribute("data-sel");
      if (this.isActiveCell(ri, ci)) td.setAttribute("data-active", "1");
      else td.removeAttribute("data-active");
    });
    this.el.querySelectorAll("th[data-role=col-head]").forEach((node) => {
      const th = node as HTMLElement;
      const ci = Number(th.getAttribute("data-col"));
      if (this.isColHeadSelected(ci)) th.setAttribute("data-sel", "1");
      else th.removeAttribute("data-sel");
    });
    this.el.querySelectorAll("td[data-role=row-head]").forEach((node) => {
      const td = node as HTMLElement;
      const ri = Number(td.getAttribute("data-index"));
      if (this.isRowHeadSelected(ri)) td.setAttribute("data-sel", "1");
      else td.removeAttribute("data-sel");
    });
  }

  protected focusSelectionHost(): void {
    if (this.editingCell || this.view !== "table" || !this.selection) return;
    const wrap = this.el.querySelector(`[data-testid="${this.tid("table")}"]`) as HTMLElement | null;
    wrap?.focus({ preventScroll: true });
  }

  protected isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    return Boolean(el.closest?.("input, textarea, select, [contenteditable='true']"));
  }

  protected shouldIgnoreSelectStart(target: HTMLElement | null): boolean {
    if (!target) return true;
    if (this.isTypingTarget(target)) return true;
    return Boolean(
      target.closest(
        "button, [data-role=pick], [data-role=col-filter-btn], [data-role=col-filter-menu], [data-role=multi-menu], [data-role=ss-menu], [data-role=search-select], [data-role=params-dialog]",
      ),
    );
  }

  protected tableCellFromEl(el: HTMLElement | null): CellPos | null {
    if (!el || !this.el?.contains(el)) return null;
    const td = el.closest("td[data-role=cell], td[data-role=cell-edit]") as HTMLElement | null;
    if (!td || !this.el.contains(td)) return null;
    const ri = Number(td.getAttribute("data-index"));
    const ci = Number(td.getAttribute("data-col"));
    if (!Number.isFinite(ri) || !Number.isFinite(ci) || ci < 0 || ci >= this.fields.length) return null;
    return { ri, ci };
  }

  protected tableCellFromPoint(x: number, y: number): CellPos | null {
    return this.tableCellFromEl(document.elementFromPoint(x, y) as HTMLElement | null);
  }

  protected colHeadFromEl(el: HTMLElement | null): number | null {
    if (!el || !this.el?.contains(el)) return null;
    if (el.closest("[data-role=col-filter-btn]")) return null;
    const th = el.closest("th[data-role=col-head]") as HTMLElement | null;
    if (!th || !this.el.contains(th)) return null;
    const ci = Number(th.getAttribute("data-col"));
    if (!Number.isFinite(ci) || ci < 0 || ci >= this.fields.length) return null;
    return ci;
  }

  protected rowHeadFromEl(el: HTMLElement | null): number | null {
    if (!el || !this.el?.contains(el)) return null;
    if (el.closest("[data-role=pick]")) return null;
    const td = el.closest("td[data-role=row-head]") as HTMLElement | null;
    if (!td || !this.el.contains(td)) return null;
    const ri = Number(td.getAttribute("data-index"));
    if (!Number.isFinite(ri) || ri < 0 || ri >= this.data.rows.length) return null;
    return ri;
  }

  protected colIndexFromEl(el: HTMLElement | null): number | null {
    const head = this.colHeadFromEl(el);
    if (head != null) return head;
    const cell = this.tableCellFromEl(el);
    return cell ? cell.ci : null;
  }

  protected rowIndexFromEl(el: HTMLElement | null): number | null {
    const head = this.rowHeadFromEl(el);
    if (head != null) return head;
    const cell = this.tableCellFromEl(el);
    if (cell) return cell.ri;
    if (!el || !this.el?.contains(el)) return null;
    const rowHead = el.closest("td[data-role=row-head]") as HTMLElement | null;
    if (!rowHead) return null;
    const ri = Number(rowHead.getAttribute("data-index"));
    if (!Number.isFinite(ri) || ri < 0 || ri >= this.data.rows.length) return null;
    return ri;
  }

  protected normalizeSelection(anchor: CellPos, focus: CellPos, mode: SelMode): CellSel {
    const lastRi = Math.max(0, this.data.rows.length - 1);
    const lastCi = Math.max(0, this.fields.length - 1);
    if (mode === "col") {
      return { mode, anchor: { ri: 0, ci: anchor.ci }, focus: { ri: lastRi, ci: focus.ci } };
    }
    if (mode === "row") {
      return { mode, anchor: { ri: anchor.ri, ci: 0 }, focus: { ri: focus.ri, ci: lastCi } };
    }
    return { mode: "cell", anchor, focus };
  }

  protected setCellSelection(anchor: CellPos, focus: CellPos, mode: SelMode = "cell"): void {
    this.selection = this.normalizeSelection(anchor, focus, mode);
    this.paintSelection();
    this.reportSelection();
  }

  protected reportSelection(): void {
    const tableId = this.currentTableId();
    const sheet = this.currentSheetId();
    const cells: { id: string; field: string; type?: string; widget?: string }[] = [];
    const range = this.selectionRange();
    if (range && this.view === "table") {
      const push = (ri: number, ci: number) => {
        const row = this.data.rows[ri] || {};
        const field = this.fields[ci];
        if (!field?.key) return;
        cells.push({
          id: this.rowRefId(row, ri),
          field: field.key,
          type: field.type || "",
          widget: field.widget || "",
        });
      };
      push(range.r0, range.c0);
      if (range.r0 !== range.r1 || range.c0 !== range.c1) push(range.r1, range.c1);
    }
    parent.postMessage({ type: "selection", tableId, sheet, cells }, "*");
  }

  protected remapSelectionAfterDelete(removed: number): void {
    if (!this.selection) return;
    const mode = this.selection.mode;
    const map = (p: CellPos): CellPos | null => {
      if (p.ri === removed) return null;
      return { ri: p.ri > removed ? p.ri - 1 : p.ri, ci: p.ci };
    };
    const anchor = map(this.selection.anchor);
    const focus = map(this.selection.focus);
    this.selection = anchor && focus ? this.normalizeSelection(anchor, focus, mode) : null;
  }

  protected cellCopyText(field: FieldDef, row: Row): string {
    if (!field?.key) return "";
    if (field.widget === "icon" || field.type === "icon") return "";
    if (field.widget === "params" || field.type === "object") return "";
    if (field.widget === "checkbox" || field.type === "bool") return truthy(row[field.key]) ? "true" : "false";
    const val = row[field.key];
    return val == null ? "" : String(val);
  }

  protected selectionTsv(): string {
    const range = this.selectionRange();
    if (!range) return "";
    const lines: string[] = [];
    for (let ri = range.r0; ri <= range.r1; ri++) {
      const row = this.data.rows[ri] || {};
      const cols: string[] = [];
      for (let ci = range.c0; ci <= range.c1; ci++) {
        const field = this.fields[ci];
        cols.push(field ? this.cellCopyText(field, row) : "");
      }
      lines.push(cols.join("\t"));
    }
    return lines.join("\n");
  }

  protected currentTableId(): string {
    const fromApi = this.api.getTableId?.();
    if (fromApi) return String(fromApi).trim();
    const fromStruct = String(this.struct.id || "").trim();
    return fromStruct || "table";
  }

  protected currentSheetId(): string {
    const fromApi = String(this.api.getSheetId?.() || "").trim();
    if (fromApi) return fromApi;
    const fromStruct = String(this.struct.default_sheet || "").trim();
    return fromStruct || "main";
  }

  protected rowRefId(row: Row, ri: number): string {
    const id = String(row?.id ?? "").trim();
    return id || `#${ri}`;
  }

  protected cellCheckPath(sheet: string, ri: number, field: string): string {
    return `sheets.${sheet}.rows.${ri}.${field}`;
  }

  protected selectionRefText(): string {
    const range = this.selectionRange();
    if (!range) return "";
    const table = this.currentTableId();
    const sheet = this.currentSheetId();
    const prefix = `${table}.${sheet}`;
    const key0 = this.fields[range.c0]?.key || `c${range.c0}`;
    const key1 = this.fields[range.c1]?.key || `c${range.c1}`;
    const id0 = this.rowRefId(this.data.rows[range.r0] || {}, range.r0);
    const id1 = this.rowRefId(this.data.rows[range.r1] || {}, range.r1);
    const path0 = this.cellCheckPath(sheet, range.r0, key0);
    const path1 = this.cellCheckPath(sheet, range.r1, key1);
    const wholeRows = this.selectionCoversAllRows();
    const wholeCols = this.selectionCoversAllCols();
    let ref = prefix;
    let pathPart = `sheets.${sheet}`;
    if (wholeRows && wholeCols) {
      ref = prefix;
      pathPart = `sheets.${sheet}`;
    } else if (wholeRows) {
      ref = range.c0 === range.c1 ? `${prefix}!${key0}` : `${prefix}!${key0}:${key1}`;
      pathPart = range.c0 === range.c1
        ? `sheets.${sheet}.rows.*.${key0}`
        : `sheets.${sheet}.rows.*.${key0}:sheets.${sheet}.rows.*.${key1}`;
    } else if (wholeCols) {
      ref = range.r0 === range.r1 ? `${prefix}![${id0}]` : `${prefix}![${id0}:${id1}]`;
      pathPart = range.r0 === range.r1
        ? `sheets.${sheet}.rows.${range.r0}`
        : `sheets.${sheet}.rows.${range.r0}:sheets.${sheet}.rows.${range.r1}`;
    } else if (range.r0 === range.r1 && range.c0 === range.c1) {
      ref = `${prefix}!${key0}[${id0}]`;
      pathPart = path0;
    } else {
      ref = `${prefix}!${key0}[${id0}]:${key1}[${id1}]`;
      pathPart = `${path0}:${path1}`;
    }
    return `ref: ${ref}\npath: ${pathPart}`;
  }

  protected copyPlainText(text: string): void {
    if (!text) return;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    if (!ok) parent.postMessage({ type: "copyText", text }, "*");
  }

  protected flashCopyRefLabel(): void {
    const btn = this.el.querySelector(`[data-testid="${this.tid("copy-ref")}"]`) as HTMLButtonElement | null;
    if (!btn) return;
    window.clearTimeout(this.copyRefFlashTimer);
    btn.textContent = "已复制";
    this.copyRefFlashTimer = window.setTimeout(() => {
      if (btn.isConnected) btn.textContent = "复制引用";
    }, 1200);
  }

  protected copySelectionRef(): void {
    if (this.view !== "table" || !this.selection) return;
    const text = this.selectionRefText();
    if (!text) return;
    this.copyPlainText(text);
    this.flashCopyRefLabel();
  }

  protected onCopyRefKey(ev: KeyboardEvent): void {
    if (!ev.shiftKey || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    if (String(ev.key || "").toLowerCase() !== "c") return;
    if (this.isTypingTarget(ev.target)) return;
    if (this.view !== "table" || !this.selection) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.copySelectionRef();
  }

  protected parseTsv(text: string): string[][] {
    const normalized = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (!normalized) return [];
    const lines = normalized.split("\n");
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.map((line) => line.split("\t"));
  }

  protected coercePaste(field: FieldDef, raw: string): unknown {
    const text = String(raw ?? "");
    if (field.widget === "checkbox" || field.type === "bool") {
      const t = text.trim().toLowerCase();
      const on = t === "true" || t === "1" || t === "开启" || t === "yes" || t === "on";
      return this.coerce(field, on ? "true" : "false");
    }
    if (field.enum || field.type === "enum") {
      const opts = this.enumOptions(field);
      if (field.widget === "multiselect" || field.widget === "tags") {
        const ids = splitMulti(text).map((part) => {
          const byId = opts.find((opt) => opt.id === part);
          if (byId) return part;
          const byName = opts.find((opt) => opt.name === part);
          return byName ? byName.id : part;
        });
        return joinMulti(ids);
      }
      const trimmed = text.trim();
      const byId = opts.find((opt) => opt.id === trimmed);
      if (byId) return byId.id;
      const byName = opts.find((opt) => opt.name === trimmed);
      if (byName) return byName.id;
      return trimmed;
    }
    return this.coerce(field, text);
  }

  protected tsvCell(grid: string[][], r: number, c: number): string {
    const row = grid[r];
    if (!row || c < 0 || c >= row.length) return "";
    return row[c] ?? "";
  }

  protected applyPasteTsv(text: string): void {
    const grid = this.parseTsv(text);
    const range = this.selectionRange();
    if (!grid.length || !range) return;
    const srcRows = grid.length;
    let srcCols = 0;
    grid.forEach((row) => {
      if (row.length > srcCols) srcCols = row.length;
    });
    if (!srcRows || !srcCols) return;
    const destRows = range.r1 - range.r0 + 1;
    const destCols = range.c1 - range.c0 + 1;
    const tile = destRows > 1 || destCols > 1;
    const writeRows = tile ? destRows : srcRows;
    const writeCols = tile ? destCols : srcCols;
    let maxRi = range.r0;
    let maxCi = range.c0;
    let changed = false;
    for (let r = 0; r < writeRows; r++) {
      const ri = range.r0 + r;
      if (ri < 0 || ri >= this.data.rows.length) break;
      if (!this.data.rows[ri]) this.data.rows[ri] = {};
      const row = this.data.rows[ri];
      for (let c = 0; c < writeCols; c++) {
        const ci = range.c0 + c;
        if (ci < 0 || ci >= this.fields.length) break;
        const field = this.fields[ci];
        if (!field || !this.cellEditable(field, row)) continue;
        if (field.widget === "params" || field.type === "object") continue;
        const raw = this.tsvCell(grid, r % srcRows, c % srcCols);
        row[field.key] = this.coercePaste(field, raw);
        changed = true;
        if (ri > maxRi) maxRi = ri;
        if (ci > maxCi) maxCi = ci;
      }
    }
    if (!changed) return;
    this.selection = {
      mode: this.selection?.mode || "cell",
      anchor: { ri: range.r0, ci: range.c0 },
      focus: { ri: maxRi, ci: maxCi },
    };
    this.api.setData(this.data);
    this.syncHistoryButtons();
    this.afterDataChange();
    this.render();
  }

  protected onCopy(ev: ClipboardEvent): void {
    if (this.isTypingTarget(ev.target) || this.view !== "table" || !this.selection) return;
    const tsv = this.selectionTsv();
    ev.preventDefault();
    ev.clipboardData?.setData("text/plain", tsv);
  }

  protected onPaste(ev: ClipboardEvent): void {
    if (this.isTypingTarget(ev.target) || this.view !== "table" || !this.selection) return;
    const text = ev.clipboardData?.getData("text/plain") ?? "";
    if (!text) return;
    ev.preventDefault();
    this.applyPasteTsv(text);
  }

  protected onSelectMouseDown(ev: MouseEvent): void {
    if (this.view !== "table" || ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (this.shouldIgnoreSelectStart(target)) return;
    const col = this.colHeadFromEl(target);
    if (col != null) {
      if (!this.data.rows.length || !this.fields.length) return;
      ev.preventDefault();
      const keep = ev.shiftKey && this.selection?.mode === "col";
      const anchor = keep && this.selection ? this.selection.anchor : { ri: 0, ci: col };
      this.setCellSelection(anchor, { ri: 0, ci: col }, "col");
      this.setSelecting(true);
      this.focusSelectionHost();
      return;
    }
    const row = this.rowHeadFromEl(target);
    if (row != null) {
      if (!this.data.rows.length || !this.fields.length) return;
      ev.preventDefault();
      const keep = ev.shiftKey && this.selection?.mode === "row";
      const anchor = keep && this.selection ? this.selection.anchor : { ri: row, ci: 0 };
      this.setCellSelection(anchor, { ri: row, ci: 0 }, "row");
      this.setSelecting(true);
      this.focusSelectionHost();
      return;
    }
    const pos = this.tableCellFromEl(target);
    if (!pos) return;
    ev.preventDefault();
    const keep = ev.shiftKey && this.selection?.mode === "cell";
    const anchor = keep && this.selection ? this.selection.anchor : pos;
    this.setCellSelection(anchor, pos, "cell");
    this.setSelecting(true);
    this.focusSelectionHost();
  }

  protected onSelectMouseMove(ev: MouseEvent): void {
    if (!this.selecting || this.view !== "table" || !this.selection) return;
    const mode = this.selection.mode || "cell";
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    if (mode === "col") {
      const ci = this.colIndexFromEl(el);
      if (ci == null || ci === this.selection.focus.ci) return;
      this.setCellSelection(this.selection.anchor, { ri: this.selection.focus.ri, ci }, "col");
      return;
    }
    if (mode === "row") {
      const ri = this.rowIndexFromEl(el);
      if (ri == null || ri === this.selection.focus.ri) return;
      this.setCellSelection(this.selection.anchor, { ri, ci: this.selection.focus.ci }, "row");
      return;
    }
    const pos = this.tableCellFromEl(el) || this.tableCellFromPoint(ev.clientX, ev.clientY);
    if (!pos) return;
    if (pos.ri === this.selection.focus.ri && pos.ci === this.selection.focus.ci) return;
    this.setCellSelection(this.selection.anchor, pos, "cell");
  }

  protected onSelectMouseUp(): void {
    if (!this.selecting) return;
    this.setSelecting(false);
    this.focusSelectionHost();
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
      const opts = this.enumOptions(field);
      const current = String(val ?? "");
      const hit = opts.find((opt) => opt.id === current);
      const label = hit?.name || current || "请选择…";
      return BitSearchSelect.wrapHtml({
        id: `${key}-${ri}`,
        label,
        empty: !current,
        testId: `${this.testPrefix}-${key}-${ri}`,
        inputStyle: input,
      });
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

  protected allVisibleRowIndexes(): number[] {
    return this.enableColFilters ? this.filteredRowIndexes() : this.data.rows.map((_, i) => i);
  }

  protected resolvedPageSize(): number {
    return Math.max(1, Math.floor(this.pageSize) || 100);
  }

  protected resolvedPageSizeOptions(): number[] {
    const sizes = new Set<number>();
    this.pageSizeOptions.forEach((n) => {
      const size = Math.max(1, Math.floor(Number(n)) || 0);
      if (size) sizes.add(size);
    });
    sizes.add(this.resolvedPageSize());
    return [...sizes].sort((a, b) => a - b);
  }

  protected pageCount(total = this.allVisibleRowIndexes().length): number {
    return Math.max(1, Math.ceil(total / this.resolvedPageSize()));
  }

  protected clampPage(total = this.allVisibleRowIndexes().length): void {
    const last = this.pageCount(total) - 1;
    if (this.pageIndex > last) this.pageIndex = last;
    if (this.pageIndex < 0) this.pageIndex = 0;
  }

  protected pagedRowIndexes(): number[] {
    const all = this.allVisibleRowIndexes();
    this.clampPage(all.length);
    const size = this.resolvedPageSize();
    if (all.length <= size) return all;
    const start = this.pageIndex * size;
    return all.slice(start, start + size);
  }

  protected shouldShowPager(total = this.allVisibleRowIndexes().length): boolean {
    const options = this.resolvedPageSizeOptions();
    const minSize = options.length ? options[0] : this.resolvedPageSize();
    return total > minSize;
  }

  protected gotoPage(page: number): void {
    this.pageIndex = page;
    this.clampPage();
    this.editingCell = null;
    this.openFilterKey = null;
    this.openMultiKey = null;
    this.selection = null;
    this.setSelecting(false);
    this.removeFilterMenu();
    this.removeMultiMenu();
    this.resetTableScroll = true;
    this.render();
  }

  protected isEditingCell(ri: RowIndex, key: string): boolean {
    return typeof ri === "number" && this.editingCell?.ri === ri && this.editingCell.key === key;
  }

  protected isPluginBound(row: Row, field: string): boolean {
    const id = String(row?.id ?? "").trim();
    if (id && this.pluginBound.has(`${id}\t${field}`)) return true;
    const ri = this.data.rows.indexOf(row);
    return ri >= 0 && this.pluginBound.has(`#${ri}\t${field}`);
  }

  protected cellEditable(field: FieldDef | undefined, row: Row): boolean {
    if (!field?.key) return false;
    if (this.isPluginBound(row, field.key)) return false;
    if (field.widget === "icon" || field.type === "icon") return false;
    if (this.idReadonly && field.key === "id" && row.id) return false;
    return true;
  }

  protected cellDisplayText(field: FieldDef, row: Row): string {
    if (field.widget === "params" || field.type === "object") {
      const summary = this.paramsSummary(row[field.key], row);
      return summary === "未设置" ? "" : summary;
    }
    if (field.widget === "multiselect" || field.widget === "tags") {
      const ids = splitMulti(row[field.key]);
      return ids.length ? this.multiSummary(field, row[field.key]) : "";
    }
    if (field.widget === "checkbox" || field.type === "bool") return truthy(row[field.key]) ? "开启" : "关闭";
    const val = row[field.key] == null ? "" : row[field.key];
    if (field.enum || field.type === "enum") {
      let name = "";
      this.enumOptions(field).forEach((opt) => {
        if (String(opt.id) === String(val)) name = opt.name;
      });
      return name || String(val);
    }
    return val === "" ? "" : String(val);
  }

  protected beginEditCell(ri: number, key: string): void {
    window.clearTimeout(this.editBlurTimer);
    const field = this.fields.find((f) => f.key === key);
    const row = this.data.rows[ri] || {};
    if (!this.cellEditable(field, row) || !field) return;
    if (field.widget === "params" || field.type === "object") {
      this.editingCell = null;
      this.paramsEditRi = ri;
      this.paramsDraft = this.normalizeParams(row.params, row);
      this.render();
      return;
    }
    if (field.widget === "multiselect" || field.widget === "tags") {
      this.editingCell = { ri, key };
      this.openMultiKey = `${key}-${ri}`;
      this.render();
      return;
    }
    this.editingCell = { ri, key };
    this.render();
    this.focusEditingControl();
  }

  protected endEditCell(): void {
    window.clearTimeout(this.editBlurTimer);
    if (!this.editingCell && this.openMultiKey == null) return;
    this.editingCell = null;
    this.openMultiKey = null;
    this.removeMultiMenu();
    this.destroySearchSelects();
    this.render();
  }

  protected scheduleEndEdit(): void {
    window.clearTimeout(this.editBlurTimer);
    this.editBlurTimer = window.setTimeout(() => {
      if (this.openMultiKey || this.paramsEditRi != null) return;
      this.endEditCell();
    }, 150);
  }

  protected focusEditingControl(): void {
    if (!this.editingCell) return;
    const { ri, key } = this.editingCell;
    const ss = this.liveSearchSelects.find((item) => item.hostId === `${key}-${ri}`);
    if (ss) {
      ss.open();
      return;
    }
    const el = this.el.querySelector(`[data-testid="${this.testPrefix}-${key}-${ri}"]`) as HTMLElement | null;
    if (!el) return;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.focus();
      if (el instanceof HTMLInputElement && el.type !== "checkbox" && el.type !== "range" && el.type !== "date") {
        el.select();
      }
      if (el instanceof HTMLTextAreaElement) el.select();
    }
  }

  protected bindEditExit(node: HTMLElement, ri: number, key: string): void {
    node.addEventListener("keydown", (raw) => {
      const ev = raw as KeyboardEvent;
      if (ev.key === "Escape") {
        ev.preventDefault();
        this.endEditCell();
      } else if (ev.key === "Enter" && node.tagName !== "TEXTAREA") {
        ev.preventDefault();
        this.endEditCell();
      }
    });
    node.addEventListener("blur", () => this.scheduleEndEdit());
  }

  protected setPageSize(size: number): void {
    const next = Math.max(1, Math.floor(size) || 100);
    const first = this.pageIndex * this.resolvedPageSize();
    this.pageSize = next;
    this.pageIndex = Math.floor(first / next);
    this.gotoPage(this.pageIndex);
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

  protected syncHistoryButtons(): void {
    this.applyHistoryButton(this.tid("undo"), Boolean(this.api.canUndo?.()));
    this.applyHistoryButton(this.tid("redo"), Boolean(this.api.canRedo?.()));
  }

  protected applyHistoryButton(testId: string, enabled: boolean): void {
    const btn = this.el?.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? "" : ".45";
    btn.style.cursor = enabled ? "pointer" : "default";
  }

  protected renderToolbar(): string {
    const n = this.selectedIndexes().length;
    const disabled = n === 0 ? "opacity:.45;cursor:default" : "";
    const flexHost = this.enableTableScroll || this.view === "card";
    const layout = flexHost
      ? "padding:16px 20px;box-sizing:border-box;height:100%;overflow:auto;display:flex;flex-direction:column"
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
    const canRef = this.view === "table" && Boolean(this.selection);
    const refOff = canRef ? "" : "opacity:.45;cursor:default";
    html += `<button type="button" data-testid="${this.tid("copy-ref")}" ${canRef ? "" : "disabled "}style="${this.btn("ghost", refOff)}" title="Ctrl+Shift+C">复制引用</button>`;
    const canUndo = Boolean(this.api.canUndo?.());
    const canRedo = Boolean(this.api.canRedo?.());
    const undoOff = canUndo ? "" : "opacity:.45;cursor:default";
    const redoOff = canRedo ? "" : "opacity:.45;cursor:default";
    html += `<button type="button" data-testid="${this.tid("undo")}" ${canUndo ? "" : "disabled "}style="${this.btn("ghost", undoOff)}" title="Ctrl+Z">撤销</button>`;
    html += `<button type="button" data-testid="${this.tid("redo")}" ${canRedo ? "" : "disabled "}style="${this.btn("ghost", redoOff)}" title="Ctrl+Y">重做</button>`;
    html += `<button type="button" data-testid="${this.tid("save")}" style="${this.btn("primary")}" title="Ctrl+S">保存</button></div></div>`;
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
    const idxs = this.pagedRowIndexes();
    const allOn = idxs.length > 0 && idxs.every((i) => this.picked[i]);
    const wrapTest = this.tid("table");
    const sticky = this.enableTableScroll
      ? "position:sticky;top:0;z-index:2;"
      : "";
    let html = this.enableTableScroll
      ? `<div style="flex:1;min-width:0;min-height:${this.tableMinHeight}px;overflow:hidden"><div data-testid="${wrapTest}" tabindex="-1" style="width:100%;height:100%;overflow:auto;border:1px solid #3a3a3a;border-radius:8px;outline:none">`
      : `<div data-testid="${wrapTest}" tabindex="-1" style="border:1px solid #3a3a3a;border-radius:8px;overflow:auto;outline:none">`;
    html += `<table style="width:max-content;min-width:100%;border-collapse:collapse">`;
    html += "<thead><tr>";
    html += `<th style="${sticky}background:#1a1a1a;padding:8px;border-bottom:1px solid #3a3a3a;width:36px"><input type="checkbox" data-testid="${this.tid("pick-all")}"${allOn ? " checked" : ""} /></th>`;
    this.fields.forEach((field, ci) => {
      const colOn = this.isColHeadSelected(ci);
      html += `<th data-role="col-head" data-col="${ci}" title="单击选中列" style="${sticky}background:${colOn ? "#243044" : "#1a1a1a"};text-align:left;color:#a3a3a3;font-weight:500;padding:8px;border-bottom:1px solid #3a3a3a;white-space:nowrap;cursor:pointer${colOn ? ";box-shadow:inset 0 -2px 0 #3794ff" : ""}"><span style="display:inline-flex;align-items:center;gap:2px">${escapeHtml(field.label || field.key)}${this.headerFilterBtn(field)}</span></th>`;
    });
    html += "</tr></thead><tbody>";
    if (!idxs.length) {
      html += `<tr><td colspan="${this.fields.length + 1}" style="padding:24px;text-align:center;color:#a3a3a3">${this.data.rows.length ? "无匹配行，试试清除筛选" : "暂无行，点击「新增一行」"}</td></tr>`;
    }
    idxs.forEach((ri, vis) => {
      const row = this.data.rows[ri] || {};
      html += `<tr data-testid="${this.tid(`row-${ri}`)}" style="background:${this.picked[ri] ? "#1c2430" : vis % 2 && this.enableTableScroll ? "#111" : "transparent"};${this.revealRowStyle(ri)}">`;
      const rowOn = this.isRowHeadSelected(ri);
      html += `<td data-role="row-head" data-index="${ri}" title="单击选中行" style="padding:6px 8px;border-bottom:1px solid #2a2a2a;text-align:center;cursor:pointer${rowOn ? ";background:rgba(55,148,255,.18)" : ""}"><input type="checkbox" data-role="pick" data-index="${ri}" data-testid="${this.tid(`pick-${ri}`)}"${this.picked[ri] ? " checked" : ""} /></td>`;
      this.fields.forEach((field, ci) => {
        html += this.renderTableCell(field, row, ri, ci);
      });
      html += "</tr>";
    });
    html += "</tbody></table></div>";
    if (this.enableTableScroll) html += "</div>";
    return html;
  }

  protected renderTableCell(field: FieldDef, row: Row, ri: number, ci: number): string {
    const td = `padding:6px 8px;border-bottom:1px solid #2a2a2a;vertical-align:middle;${this.revealCellStyle(ri, field.key)}`;
    const reveal = this.revealAttr(ri, field.key);
    const sel = this.cellSelAttrs(ri, ci);
    if (field.widget === "icon" || field.type === "icon") {
      return `<td data-role="cell" data-index="${ri}" data-key="${escapeAttr(field.key)}"${reveal}${sel} style="${td}">${this.fieldControl(field, row, ri, true)}</td>`;
    }
    if (this.isEditingCell(ri, field.key)) {
      return `<td data-role="cell-edit" data-index="${ri}" data-key="${escapeAttr(field.key)}"${reveal}${sel} style="${td}">${this.fieldControl(field, row, ri, true)}</td>`;
    }
    const canEdit = this.cellEditable(field, row);
    const pluginOn = this.isPluginBound(row, field.key);
    const text = this.cellDisplayText(field, row);
    return `<td data-role="cell" data-index="${ri}" data-key="${escapeAttr(field.key)}"${pluginOn ? " data-plugin=1" : ""}${reveal}${sel} title="${pluginOn ? "插件计算" : canEdit ? "双击编辑" : ""}" style="${td}${pluginOn ? ";box-shadow:inset 2px 0 0 #3ecf8e" : ""}"><div data-role="cell-view" ${this.testAttr(field.key, ri)} style="min-height:28px;line-height:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${text ? "color:#f5f5f5" : "color:#737373"}">${this.highlightQuery(text || "—", ri, field.key)}</div></td>`;
  }

  protected renderCards(): string {
    const idxs = this.pagedRowIndexes();
    if (!idxs.length) {
      return '<div style="color:#a3a3a3;padding:24px 0;text-align:center">暂无行，点击「新增一行」</div>';
    }
    let html = "";
    idxs.forEach((ri) => {
      const row = this.data.rows[ri] || {};
      html += `<section data-testid="${this.tid(`row-${ri}`)}" style="margin-bottom:12px;border:1px solid #3a3a3a;border-radius:8px;background:#141414;${this.revealRowStyle(ri)}">`;
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
          html += `<label data-role="cell" data-index="${ri}" data-key="${escapeAttr(field.key)}"${this.revealAttr(ri, field.key)} style="display:block${wide ? ";grid-column:1/-1" : ""};${this.revealCellStyle(ri, field.key)}"><div style="margin-bottom:4px;color:#a3a3a3">${escapeHtml(field.label || field.key)}${field.required === true || field.required === "true" ? " *" : ""}</div>`;
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

  protected renderPager(): string {
    const total = this.allVisibleRowIndexes().length;
    if (!this.shouldShowPager(total)) return "";
    this.clampPage(total);
    const size = this.resolvedPageSize();
    const pages = this.pageCount(total);
    const start = total ? this.pageIndex * size + 1 : 0;
    const end = Math.min(total, start + size - 1);
    const prevOff = this.pageIndex <= 0;
    const nextOff = this.pageIndex >= pages - 1;
    const selectStyle =
      "height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px";
    let html = `<div data-testid="${this.tid("pager")}" style="display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-shrink:0;margin-top:8px;flex-wrap:wrap">`;
    html += `<label style="display:flex;align-items:center;gap:6px;color:#a3a3a3"><span>每页</span><select data-testid="${this.tid("page-size")}" style="${selectStyle}">`;
    this.resolvedPageSizeOptions().forEach((n) => {
      html += `<option value="${n}"${n === size ? " selected" : ""}>${n}</option>`;
    });
    html += "</select><span>行</span></label>";
    if (total) html += `<span data-testid="${this.tid("page-info")}" style="color:#a3a3a3">${start}–${end} / ${total} 行</span>`;
    if (pages > 1) {
      html += `<button type="button" data-testid="${this.tid("page-prev")}" ${prevOff ? "disabled " : ""}style="${this.btn("ghost", prevOff ? "opacity:.45;cursor:default" : "")}">上一页</button>`;
      html += `<span style="color:#d4d4d4;min-width:72px;text-align:center">第 ${this.pageIndex + 1} / ${pages} 页</span>`;
      html += `<button type="button" data-testid="${this.tid("page-next")}" ${nextOff ? "disabled " : ""}style="${this.btn("ghost", nextOff ? "opacity:.45;cursor:default" : "")}">下一页</button>`;
    }
    return html + "</div>";
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
      const opts = this.enumOptions(field);
      const hit = opts.find((opt) => opt.id === cur);
      inputHtml = BitSearchSelect.wrapHtml({
        id: `filter-${field.key}`,
        label: hit?.name || (cur ? cur : "全部"),
        empty: !cur,
        inputStyle,
      });
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
    let filterValue = cur;
    const applyAndClose = (next: string) => {
      this.colFilters[field.key] = next ?? "";
      this.openFilterKey = null;
      this.editingCell = null;
      this.pageIndex = 0;
      this.removeFilterMenu();
      this.resetTableScroll = true;
      this.render();
    };
    menu.querySelector('[data-role="col-filter-clear"]')?.addEventListener("click", () => applyAndClose(""));
    menu.querySelector('[data-role="col-filter-ok"]')?.addEventListener("click", () => applyAndClose(input ? input.value : filterValue));
    const ssWrap = menu.querySelector<HTMLElement>('[data-role="search-select"]');
    if (ssWrap) {
      const ss = new BitSearchSelect(ssWrap, {
        items: this.enumOptions(field),
        value: cur,
        emptyLabel: "全部",
        root: this.el,
        onChange: (id) => applyAndClose(id),
      }).bind();
      this.liveSearchSelects.push(ss);
    } else if (input) {
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

  protected destroySearchSelects(): void {
    this.liveSearchSelects.forEach((item) => item.destroy());
    this.liveSearchSelects = [];
  }

  protected closeSearchSelects(): boolean {
    let any = false;
    this.liveSearchSelects.forEach((item) => {
      if (item.isOpen) {
        item.close();
        any = true;
      }
    });
    return any;
  }

  protected bindSearchSelect(wrap: HTMLElement, field: FieldDef, ri: RowIndex): void {
    const inTableEdit = typeof ri === "number" && this.view === "table" && this.isEditingCell(ri, field.key);
    const current = String(this.currentMultiValue(ri, field.key) ?? "");
    const ss = new BitSearchSelect(wrap, {
      items: this.enumOptions(field),
      value: current,
      root: this.el,
      onChange: (id) => {
        if (field.type === "int") this.setRow(ri, field.key, String(parseInt(id, 10) || 0));
        else if (field.type === "float") this.setRow(ri, field.key, String(Number(id) || 0));
        else this.setRow(ri, field.key, id);
        if (typeof ri === "number" && field.key === "kind" && this.paramsSchema(this.data.rows[ri] || {}).length) {
          const row = this.data.rows[ri] || {};
          row.params = this.normalizeParams(row.params, { ...row, kind: id });
          this.api.setData(this.data);
        }
        if (inTableEdit) this.endEditCell();
        else if (typeof ri === "number" && field.key === "kind") this.render();
      },
    }).bind();
    this.liveSearchSelects.push(ss);
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
    const ssWrap = root.querySelector<HTMLElement>(
      `[data-role="search-select"][data-ss-id="${field.key}-${ri}"]`,
    );
    if (ssWrap) {
      this.bindSearchSelect(ssWrap, field, ri);
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
    const inTableEdit = typeof ri === "number" && this.view === "table" && this.isEditingCell(ri, field.key);
    const finishInstant = () => {
      if (inTableEdit) this.endEditCell();
    };
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
        if (!inTableEdit) this.render();
      }
    };
    if (widget === "checkbox") {
      nodes[0].addEventListener("change", (ev) => {
        apply((ev.target as HTMLInputElement).checked);
        finishInstant();
      });
      if (inTableEdit) this.bindEditExit(nodes[0], ri as number, field.key);
      return;
    }
    if (widget === "radio") {
      nodes.forEach((item) => {
        item.addEventListener("change", (ev) => {
          const target = ev.target as HTMLInputElement;
          if (target.checked) {
            apply(target.value);
            finishInstant();
          }
        });
        if (inTableEdit) this.bindEditExit(item, ri as number, field.key);
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
      if (inTableEdit) this.bindEditExit(nodes[0], ri as number, field.key);
      return;
    }
    const evName = widget === "select" || widget === "date" || widget === "number" ? "change" : "input";
    nodes[0].addEventListener(evName, (ev) => {
      apply((ev.target as HTMLInputElement).value);
      if (widget === "select" || widget === "date") finishInstant();
    });
    if (widget === "number") {
      nodes[0].addEventListener("input", (ev) => apply((ev.target as HTMLInputElement).value));
    }
    if (inTableEdit) this.bindEditExit(nodes[0], ri as number, field.key);
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
    const maxH = Math.max(holder.clientHeight, this.tableMinHeight);
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
    this.remapSelectionAfterDelete(removed);
  }

  protected render(): void {
    this.destroySearchSelects();
    const prevTable = this.el.querySelector(`[data-testid="${this.tid("table")}"]`) as HTMLElement | null;
    const savedScrollLeft = this.resetTableScroll ? 0 : prevTable ? prevTable.scrollLeft : 0;
    const savedScrollTop = this.resetTableScroll ? 0 : prevTable ? prevTable.scrollTop : 0;
    this.resetTableScroll = false;
    let html =
      "<style>td[data-role=cell],td[data-role=cell-edit],td[data-role=row-head],th[data-role=col-head]{user-select:none;-webkit-user-select:none}td[data-sel='1'],th[data-sel='1']{background:rgba(55,148,255,.18)}th[data-role=col-head][data-sel='1']{box-shadow:inset 0 -2px 0 #3794ff}td[data-active='1']:not([data-reveal='1']){outline:2px solid #3794ff;outline-offset:-2px}[data-selecting='1']{user-select:none;-webkit-user-select:none}</style>";
    html += this.renderToolbar();
    html += this.renderExtra();
    html += this.view === "card" ? this.renderCards() : this.renderTable();
    html += this.renderPager();
    html += "</div>";
    this.el.innerHTML = html;

    const visible = this.pagedRowIndexes();
    visible.forEach((ri) => {
      this.fields.forEach((field) => {
        if (this.view === "table" && !this.isEditingCell(ri, field.key)) return;
        this.bindControl(this.el, field, ri);
      });
    });
    this.el.querySelectorAll("[data-role=cell]").forEach((td) => {
      td.addEventListener("dblclick", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.beginEditCell(Number(td.getAttribute("data-index")), td.getAttribute("data-key") || "");
      });
    });
    if (this.editingCell && !this.openMultiKey) this.focusEditingControl();
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
      this.editingCell = null;
      this.pageIndex = 0;
      this.removeFilterMenu();
      this.resetTableScroll = true;
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
    if (!this.escapeBound) {
      this.escapeBound = true;
      document.addEventListener("keydown", (raw) => this.onEscape(raw as KeyboardEvent));
    }
    if (!this.selectBound) {
      this.selectBound = true;
      document.addEventListener("mousedown", (ev) => this.onSelectMouseDown(ev));
      document.addEventListener("mousemove", (ev) => this.onSelectMouseMove(ev));
      document.addEventListener("mouseup", () => this.onSelectMouseUp());
    }
    if (!this.clipboardBound) {
      this.clipboardBound = true;
      document.addEventListener("copy", (ev) => this.onCopy(ev));
      document.addEventListener("paste", (ev) => this.onPaste(ev));
    }
    if (!this.copyRefKeyBound) {
      this.copyRefKeyBound = true;
      document.addEventListener("keydown", (raw) => this.onCopyRefKey(raw as KeyboardEvent));
    }
    if (this.selecting) this.setSelecting(true);
    this.focusSelectionHost();
    if (!this.multiCloseBound) {
      this.multiCloseBound = true;
      document.addEventListener("click", (ev) => {
        if (!this.openMultiKey) return;
        const target = ev.target as HTMLElement | null;
        if (target?.closest?.('[data-role="multi-wrap"]') || target?.closest?.('[data-role="multi-menu"]')) return;
        this.endEditCell();
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
            this.endEditCell();
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
      this.selection = null;
      this.setSelecting(false);
      this.render();
    });
    this.el.querySelector(`[data-testid="${this.tid("copy-ref")}"]`)?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.copySelectionRef();
    });
    this.el.querySelector(`[data-testid="${this.tid("add")}"]`)?.addEventListener("click", () => {
      this.data.rows.push(this.emptyRow());
      this.api.setData(this.data);
      const all = this.allVisibleRowIndexes();
      const pos = all.indexOf(this.data.rows.length - 1);
      this.pageIndex = pos >= 0 ? Math.floor(pos / this.resolvedPageSize()) : this.pageCount(all.length) - 1;
      this.resetTableScroll = true;
      this.render();
    });
    this.el.querySelector(`[data-testid="${this.tid("undo")}"]`)?.addEventListener("click", () => this.api.undo?.());
    this.el.querySelector(`[data-testid="${this.tid("redo")}"]`)?.addEventListener("click", () => this.api.redo?.());
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
        const idxs = this.pagedRowIndexes();
        if (pickAll.checked) idxs.forEach((i) => (this.picked[i] = true));
        else idxs.forEach((i) => delete this.picked[i]);
        this.render();
      });
    }
    this.el.querySelector(`[data-testid="${this.tid("batch-edit")}"]`)?.addEventListener("click", () => {
      if (!this.selectedIndexes().length) return;
      this.batchOpen = true;
      this.selection = null;
      this.setSelecting(false);
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
      this.selection = null;
      this.setSelecting(false);
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
    const pageSizeSel = this.el.querySelector(`[data-testid="${this.tid("page-size")}"]`) as HTMLSelectElement | null;
    if (pageSizeSel) {
      pageSizeSel.addEventListener("change", () => this.setPageSize(Number(pageSizeSel.value)));
    }
    this.el.querySelector(`[data-testid="${this.tid("page-prev")}"]`)?.addEventListener("click", () => {
      if (this.pageIndex <= 0) return;
      this.gotoPage(this.pageIndex - 1);
    });
    this.el.querySelector(`[data-testid="${this.tid("page-next")}"]`)?.addEventListener("click", () => {
      if (this.pageIndex >= this.pageCount() - 1) return;
      this.gotoPage(this.pageIndex + 1);
    });
    this.bindExtra();
  }
}
