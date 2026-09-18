export type EnumEntry = { id: string; name: string };

export type EditorAPI = {
  getStruct(): unknown;
  getData(): unknown;
  getEnums(): Record<string, EnumEntry[]>;
  setData(next: unknown): void;
  save(): void;
  askAI(mode: string, prompt: string): void;
  undo?(): void;
  redo?(): void;
  canUndo?(): boolean;
  canRedo?(): boolean;
  assetURL?(rel: string): string;
};

export type FieldDef = {
  key: string;
  label?: string;
  type?: string;
  widget?: string;
  enum?: string;
  options?: string | string[];
  required?: boolean | string;
  group?: string;
  path?: string;
  icon?: string;
  hint?: string;
  min?: number;
  max?: number;
  step?: number;
};

export type Row = Record<string, unknown>;
export type ParamField = { key: string; label: string; type?: string; min?: number; max?: number; step?: number };
export type CheckError = { path: string; message: string };
export type CheckResult = { ok: boolean; errors: CheckError[] };

declare global {
  interface Window {
    BitTableEditor?: {
      mount(el: HTMLElement, api: EditorAPI): void;
      reveal?(target: { rowIndex: number; field?: string; query?: string }): void;
      clearReveal?(): void;
    };
    BitTableChecker?: { check(data: unknown, struct: unknown, enums?: unknown): CheckResult };
    BitTableExporter?: {
      export(data: unknown, struct?: unknown): {
        client?: { name: string; content: string }[];
        server?: { name: string; content: string }[];
        files?: { name: string; content: string }[];
      };
    };
  }
}

export {};
