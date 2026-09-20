import { escapeAttr, escapeHtml } from "./dom";

export type SearchSelectItem = { id: string; name: string };

export type SearchSelectOptions = {
  items: SearchSelectItem[];
  value: string;
  testId?: string;
  emptyLabel?: string;
  inputStyle?: string;
  root?: HTMLElement;
  onChange: (id: string) => void;
  onClose?: () => void;
};

export class BitSearchSelect {
  static wrapHtml(opts: {
    id: string;
    label: string;
    empty?: boolean;
    testId?: string;
    inputStyle: string;
  }): string {
    const test = opts.testId ? ` data-testid="${escapeAttr(opts.testId)}"` : "";
    const color = opts.empty ? "color:#737373" : "color:#f5f5f5";
    return `<div data-role="search-select" data-ss-id="${escapeAttr(opts.id)}" style="position:relative;min-width:88px;width:100%"><button type="button" data-role="ss-toggle"${test} style="${opts.inputStyle};display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer"><span data-role="ss-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;${color}">${escapeHtml(opts.label)}</span><span style="color:#a3a3a3;flex-shrink:0">▾</span></button></div>`;
  }

  private menu: HTMLElement | null = null;
  private query = "";
  private active = 0;
  private onDocDown: ((ev: MouseEvent) => void) | null = null;
  private onWinScroll: ((ev: Event) => void) | null = null;
  private destroyed = false;

  constructor(
    private host: HTMLElement,
    private opts: SearchSelectOptions,
  ) {}

  get isOpen(): boolean {
    return Boolean(this.menu);
  }

  get hostId(): string {
    return this.host.getAttribute("data-ss-id") || "";
  }

  bind(): this {
    this.host.querySelector('[data-role="ss-toggle"]')?.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.isOpen) this.close();
      else this.open();
    });
    return this;
  }

  open(): void {
    if (this.destroyed || this.isOpen) return;
    this.query = "";
    this.active = this.visibleItems().findIndex((item) => item.id === String(this.opts.value ?? ""));
    if (this.active < 0) this.active = 0;
    this.placeMenu();
    const filter = this.menu?.querySelector<HTMLInputElement>('[data-role="ss-filter"]');
    filter?.focus();
    filter?.select();
  }

  close(): void {
    if (!this.menu) {
      this.unbindDoc();
      return;
    }
    this.menu.remove();
    this.menu = null;
    this.unbindDoc();
    this.opts.onClose?.();
  }

  destroy(): void {
    this.destroyed = true;
    this.close();
  }

  private items(): SearchSelectItem[] {
    const extra: SearchSelectItem[] = [];
    if (this.opts.emptyLabel != null) extra.push({ id: "", name: this.opts.emptyLabel });
    return extra.concat(this.opts.items);
  }

  private visibleItems(): SearchSelectItem[] {
    const q = this.query.trim().toLowerCase();
    const all = this.items();
    if (!q) return all;
    return all.filter((item) => item.id.toLowerCase().includes(q) || item.name.toLowerCase().includes(q));
  }

  private currentLabel(): string {
    const value = String(this.opts.value ?? "");
    if (!value && this.opts.emptyLabel != null) return this.opts.emptyLabel;
    const hit = this.opts.items.find((item) => item.id === value);
    return hit?.name || value || "请选择…";
  }

  private syncLabel(): void {
    const label = this.host.querySelector<HTMLElement>('[data-role="ss-label"]');
    if (!label) return;
    const text = this.currentLabel();
    const empty = !String(this.opts.value ?? "") && this.opts.emptyLabel != null;
    label.textContent = text;
    label.style.color = empty || (!this.opts.value && !this.opts.emptyLabel) ? "#737373" : "#f5f5f5";
  }

  private placeMenu(): void {
    this.menu?.remove();
    const toggle = this.host.querySelector('[data-role="ss-toggle"]') as HTMLElement | null;
    if (!toggle) return;
    const rect = toggle.getBoundingClientRect();
    const menu = document.createElement("div");
    menu.setAttribute("data-role", "ss-menu");
    const maxH = 240;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
    const height = Math.min(maxH, Math.max(140, openUp ? spaceAbove : spaceBelow));
    menu.style.cssText = `position:fixed;z-index:10050;min-width:${Math.max(rect.width, 160)}px;max-height:${height}px;display:flex;flex-direction:column;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:4px;box-shadow:0 10px 28px rgba(0,0,0,.5);left:${Math.min(rect.left, window.innerWidth - 180)}px;${openUp ? `bottom:${window.innerHeight - rect.top + 2}px;top:auto;` : `top:${rect.bottom + 2}px;`}`;
    menu.innerHTML =
      `<input data-role="ss-filter" type="text" placeholder="搜索" style="flex-shrink:0;width:100%;height:28px;box-sizing:border-box;background:#141414;border:0;border-bottom:1px solid #3a3a3a;color:#f5f5f5;padding:0 8px;outline:none" />` +
      `<div data-role="ss-list" style="flex:1;min-height:0;overflow:auto;padding:4px"></div>`;
    const root = this.opts.root || this.host;
    root.appendChild(menu);
    this.menu = menu;
    this.renderList();
    menu.addEventListener("mousedown", (ev) => ev.stopPropagation());
    menu.addEventListener("click", (ev) => ev.stopPropagation());
    menu.addEventListener(
      "wheel",
      (ev) => {
        ev.stopPropagation();
      },
      { passive: true },
    );
    const filter = menu.querySelector<HTMLInputElement>('[data-role="ss-filter"]');
    filter?.addEventListener("input", () => {
      this.query = filter.value;
      this.active = 0;
      this.renderList();
    });
    filter?.addEventListener("keydown", (ev) => this.onMenuKey(ev));
    this.onDocDown = (ev) => {
      const target = ev.target as Node | null;
      if (target && (menu.contains(target) || this.host.contains(target))) return;
      this.close();
    };
    document.addEventListener("mousedown", this.onDocDown);
    this.onWinScroll = (ev) => {
      const target = ev.target as Node | null;
      if (target && this.menu?.contains(target)) return;
      this.close();
    };
    window.addEventListener("scroll", this.onWinScroll, true);
  }

  private renderList(): void {
    const list = this.menu?.querySelector('[data-role="ss-list"]');
    if (!list) return;
    const items = this.visibleItems();
    if (!items.length) {
      list.innerHTML = '<div style="padding:8px;color:#737373;font-size:12px">无匹配项</div>';
      return;
    }
    if (this.active >= items.length) this.active = items.length - 1;
    const value = String(this.opts.value ?? "");
    list.innerHTML = items
      .map((item, i) => {
        const on = item.id === value;
        const hi = i === this.active;
        const bg = hi ? "#243044" : "transparent";
        const mark = on ? " ·" : "";
        return `<button type="button" data-role="ss-opt" data-id="${escapeAttr(item.id)}" data-index="${i}" style="display:block;width:100%;text-align:left;padding:5px 8px;border:0;border-radius:4px;background:${bg};color:${item.id ? "#f5f5f5" : "#737373"};cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(item.name)}${mark}</button>`;
      })
      .join("");
    list.querySelectorAll<HTMLButtonElement>('[data-role="ss-opt"]').forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        this.active = Number(btn.getAttribute("data-index")) || 0;
        this.paintActive();
      });
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.pick(btn.getAttribute("data-id") || "");
      });
    });
    this.paintActive();
  }

  private paintActive(): void {
    const list = this.menu?.querySelector('[data-role="ss-list"]');
    if (!list) return;
    list.querySelectorAll<HTMLElement>('[data-role="ss-opt"]').forEach((btn) => {
      const i = Number(btn.getAttribute("data-index"));
      btn.style.background = i === this.active ? "#243044" : "transparent";
    });
    list.querySelector<HTMLElement>(`[data-role="ss-opt"][data-index="${this.active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }

  private onMenuKey(ev: KeyboardEvent): void {
    const items = this.visibleItems();
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      this.active = items.length ? (this.active + 1) % items.length : 0;
      this.renderList();
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      this.active = items.length ? (this.active - 1 + items.length) % items.length : 0;
      this.renderList();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      const item = items[this.active];
      if (item) this.pick(item.id);
    }
  }

  private pick(id: string): void {
    this.opts.value = id;
    this.syncLabel();
    this.opts.onChange(id);
    this.close();
  }

  private unbindDoc(): void {
    if (this.onDocDown) {
      document.removeEventListener("mousedown", this.onDocDown);
      this.onDocDown = null;
    }
    if (this.onWinScroll) {
      window.removeEventListener("scroll", this.onWinScroll, true);
      this.onWinScroll = null;
    }
  }
}
