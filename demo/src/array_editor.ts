import type { ArrayItemDef, FieldDef } from "./types";

export interface ArrayChildControl {
  validate?(): boolean;
  destroy(): void;
}

export type ArrayItemContext<T> = {
  value: T;
  readOnly: boolean;
  onChange(value: T): void;
};

export type ArrayItemOptions<T = unknown> = {
  type?: "int" | "float" | "string";
  createDefault?: () => T;
  /** 工厂负责挂载子控件，返回校验与清理接口；可返回另一个数组控件。 */
  mount?: (host: HTMLElement, context: ArrayItemContext<T>) => ArrayChildControl;
};

export type ArrayEditorOptions<T = unknown> = {
  value: T[];
  item: ArrayItemOptions<T>;
  readOnly?: boolean;
  onChange?: (value: T[]) => void;
};

type Entry<T> = { value: T; node: HTMLElement; control: ArrayChildControl; active: boolean };
const controlStyle = "background:#202020;color:#f5f5f5;border:1px solid #555;border-radius:4px;padding:5px 8px";

/** 值是可序列化的配置数据；每次读写都复制，避免草稿与其它行共享对象。 */
export function cloneArrayValue<T>(value: T): T {
  return structuredClone(value);
}

export function isArrayField(field: { type?: string; widget?: string }): boolean {
  return field.type === "array" || field.widget === "array";
}

/** 数组在配置里是 YAML 序列。空值视为空数组，字符串不再当作 JSON 或符号列表。 */
export function readArrayField(_field: FieldDef, value: unknown): unknown[] {
  if (value == null || value === "") return [];
  if (!Array.isArray(value)) throw new Error("当前值不是数组，请先修正配置数据");
  return cloneArrayValue(value);
}

export function writeArrayField(_field: FieldDef, value: unknown[]): unknown {
  return cloneArrayValue(value);
}

export function arrayFieldText(field: FieldDef, value: unknown): string {
  try { return JSON.stringify(readArrayField(field, value)); }
  catch { return String(value ?? ""); }
}

export function arrayFieldValid(field: FieldDef, value: unknown): boolean {
  try { return arrayValueValid(readArrayField(field, value), field.items); }
  catch { return false; }
}

export function arrayValueValid(value: unknown, item: ArrayItemDef = {}): boolean {
  return Array.isArray(value) && value.every(v => {
    if (isArrayField(item)) return arrayValueValid(v, item.items);
    if (item.widget && !["number", "text"].includes(item.widget)) return true;
    if (item.type === "int") return typeof v === "number" && Number.isSafeInteger(v);
    if (item.type === "float") return typeof v === "number" && Number.isFinite(v);
    return typeof v === "string";
  });
}

/** 通用数组容器：保留子控件实例与输入状态，增删排序时不重建其它项。 */
export class BitArrayEditorBase<T = unknown> implements ArrayChildControl {
  protected entries: Entry<T>[] = [];
  private list: HTMLElement;
  private empty: HTMLElement;
  private destroyed = false;

  constructor(protected host: HTMLElement, protected options: ArrayEditorOptions<T>) {
    host.replaceChildren();
    host.dataset.role = "array-editor";
    this.list = document.createElement("div");
    this.list.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:0";
    this.empty = document.createElement("div");
    this.empty.textContent = "空数组";
    this.empty.style.color = "#a3a3a3";
    const add = this.button("新增项", "array-add", () => this.add());
    add.style.marginTop = "8px";
    host.append(this.list, this.empty, add);
    try {
      options.value.forEach(value => this.appendEntry(cloneArrayValue(value)));
    } catch (error) {
      this.destroy();
      throw error;
    }
    this.refresh();
  }

  getValue(): T[] {
    return cloneArrayValue(this.entries.map(entry => entry.value));
  }

  validate(): boolean {
    const results = this.entries.map(entry => entry.control.validate?.() ?? true);
    return !this.destroyed && results.every(Boolean);
  }

  protected createDefault(): T {
    return this.options.item.createDefault ? cloneArrayValue(this.options.item.createDefault())
      : (this.options.item.type === "int" || this.options.item.type === "float" ? 0 : "") as T;
  }

  protected mountItem(host: HTMLElement, context: ArrayItemContext<T>): ArrayChildControl {
    if (this.options.item.mount) return this.options.item.mount(host, context);
    const type = this.options.item.type || "string";
    const input = document.createElement("input");
    input.dataset.role = "array-value";
    input.setAttribute("aria-label", "数组项值");
    input.type = type === "string" ? "text" : "number";
    input.step = type === "int" ? "1" : "any";
    input.value = String(context.value ?? "");
    input.disabled = context.readOnly;
    input.style.cssText = `${controlStyle};width:100%;box-sizing:border-box`;
    const error = document.createElement("div");
    error.setAttribute("role", "alert");
    error.style.cssText = "color:#ff8787;font-size:12px";
    const validate = () => {
      const number = Number(input.value);
      const valid = type === "string" || (input.value.trim() !== "" && Number.isFinite(number)
        && (type !== "int" || Number.isSafeInteger(number)));
      input.setAttribute("aria-invalid", String(!valid));
      error.textContent = valid ? "" : type === "int" ? "请输入安全范围内的整数" : "请输入有效的浮点数";
      return valid;
    };
    const change = () => {
      if (validate()) context.onChange((type === "string" ? input.value : Number(input.value)) as T);
    };
    input.addEventListener("input", change);
    host.append(input, error);
    return { validate, destroy: () => input.removeEventListener("input", change) };
  }

  add(): void {
    if (this.options.readOnly || this.destroyed) return;
    this.appendEntry(this.createDefault());
    this.refresh();
    this.changed();
  }

  remove(index: number): void {
    if (this.options.readOnly || this.destroyed || !this.entries[index]) return;
    const [entry] = this.entries.splice(index, 1);
    entry.active = false;
    entry.control.destroy();
    entry.node.remove();
    this.refresh();
    this.changed();
  }

  move(index: number, offset: number): void {
    const target = index + offset;
    if (this.options.readOnly || this.destroyed || !this.entries[index] || !this.entries[target]) return;
    const [entry] = this.entries.splice(index, 1);
    this.entries.splice(target, 0, entry);
    this.refresh();
    this.changed();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.entries.forEach(entry => { entry.active = false; entry.control.destroy(); });
    this.entries = [];
    this.host.replaceChildren();
  }

  private changed(): void {
    this.options.onChange?.(this.getValue());
  }

  private button(label: string, role: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.role = role;
    button.style.cssText = controlStyle;
    button.disabled = Boolean(this.options.readOnly);
    button.addEventListener("click", action);
    return button;
  }

  private appendEntry(value: T): void {
    const node = document.createElement("div");
    node.dataset.role = "array-item";
    node.style.cssText = "display:flex;align-items:flex-start;gap:6px";
    const label = document.createElement("span");
    label.dataset.role = "array-index";
    const content = document.createElement("div");
    content.style.cssText = "flex:1;min-width:0";
    const entry: Entry<T> = { value, node, active: true, control: { destroy() {} } };
    node.append(label, content,
      this.button("上移", "array-up", () => this.move(this.entries.indexOf(entry), -1)),
      this.button("下移", "array-down", () => this.move(this.entries.indexOf(entry), 1)),
      this.button("删除", "array-remove", () => this.remove(this.entries.indexOf(entry))));
    this.entries.push(entry);
    this.list.append(node);
    entry.control = this.mountItem(content, {
      value: cloneArrayValue(value), readOnly: Boolean(this.options.readOnly),
      onChange: next => {
        if (!entry.active || this.destroyed || this.options.readOnly) return;
        entry.value = cloneArrayValue(next);
        this.changed();
      },
    });
  }

  private refresh(): void {
    this.empty.hidden = this.entries.length > 0;
    this.entries.forEach((entry, index) => {
      this.list.append(entry.node);
      entry.node.querySelector('[data-role="array-index"]')!.textContent = String(index + 1);
      entry.node.querySelector<HTMLButtonElement>('[data-role="array-up"]')!.disabled = Boolean(this.options.readOnly) || index === 0;
      entry.node.querySelector<HTMLButtonElement>('[data-role="array-down"]')!.disabled = Boolean(this.options.readOnly) || index === this.entries.length - 1;
    });
  }
}
