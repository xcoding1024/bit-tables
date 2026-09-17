import type { CheckError, CheckResult, EnumEntry, FieldDef, Row } from "./types";
import { asRecord, splitMulti } from "./dom";

export class BitTableCheckerBase {
  protected errors: CheckError[] = [];
  protected data: Row = {};
  protected struct: Row = {};
  protected enums: Record<string, EnumEntry[]> = {};

  check(data: unknown, struct: unknown, enums?: unknown): CheckResult {
    this.errors = [];
    this.data = asRecord(data) || {};
    this.struct = asRecord(struct) || {};
    this.enums = (asRecord(enums) as Record<string, EnumEntry[]>) || {};
    const sheets = Array.isArray(this.struct.sheets) ? (this.struct.sheets as Row[]) : [];
    if (sheets.length) {
      const bag = asRecord(this.data.sheets) || {};
      const def = String(this.struct.default_sheet || (sheets[0] && sheets[0].id) || "");
      sheets.forEach((sheet) => {
        const sid = String(sheet?.id || "");
        if (!sid) return;
        const part = asRecord(bag[sid]);
        let rows = part && Array.isArray(part.rows) ? (part.rows as Row[]) : [];
        if (!part && Array.isArray(this.data.rows) && sid === def) rows = this.data.rows as Row[];
        this.checkSheet(sid, rows, (Array.isArray(sheet.fields) ? sheet.fields : []) as FieldDef[]);
      });
      return { ok: this.errors.length === 0, errors: this.errors };
    }
    this.checkSheet(
      "main",
      (Array.isArray(this.data.rows) ? this.data.rows : []) as Row[],
      (this.struct.fields || this.struct.rows || []) as FieldDef[],
    );
    this.errors.forEach((err) => {
      err.path = err.path.replace(/^sheets\.main\./, "");
    });
    return { ok: this.errors.length === 0, errors: this.errors };
  }

  protected requiredKeys(fields: FieldDef[]): string[] {
    return fields.filter((f) => f?.key && (f.required === true || f.required === "true")).map((f) => f.key);
  }

  protected extraRequired(_sheetId: string, _fields: FieldDef[]): string[] {
    return [];
  }

  protected enumIdSet(field: FieldDef): Record<string, boolean> {
    const ref = field?.enum ? String(field.enum).trim() : "";
    const set: Record<string, boolean> = {};
    if (ref && this.enums[ref]?.length) {
      this.enums[ref].forEach((item) => {
        if (item?.id) set[String(item.id)] = true;
      });
      return set;
    }
    const bag = asRecord(this.data.sheets) || {};
    const part = asRecord(bag[ref]);
    if (ref && part && Array.isArray(part.rows)) {
      (part.rows as Row[]).forEach((row) => {
        if (row?.id) set[String(row.id)] = true;
      });
      return set;
    }
    const raw = field?.options;
    const list = Array.isArray(raw)
      ? raw.map(String)
      : String(raw || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    list.forEach((id) => {
      set[id] = true;
    });
    return set;
  }

  protected checkSheet(sheetId: string, rows: Row[], fields: FieldDef[]): void {
    const required = [...this.requiredKeys(fields), ...this.extraRequired(sheetId, fields)];
    const ids: Record<string, boolean> = {};
    const enumFields = (fields || []).filter((f) => f && (f.enum || f.type === "enum"));
    rows.forEach((row, i) => {
      row = row || {};
      const prefix = `sheets.${sheetId}.rows.${i}`;
      required.forEach((key) => {
        if (!String(row[key] ?? "").trim()) this.errors.push({ path: `${prefix}.${key}`, message: `${key} 必填` });
      });
      if (row.id) {
        if (!/^[a-z][a-z0-9_]*$/.test(String(row.id))) {
          this.errors.push({ path: `${prefix}.id`, message: "id 须小写字母开头，仅字母数字下划线" });
        }
        if (ids[String(row.id)]) this.errors.push({ path: `${prefix}.id`, message: `id 重复：${row.id}` });
        ids[String(row.id)] = true;
      }
      enumFields.forEach((field) => {
        const val = row[field.key];
        if (val == null || val === "") return;
        const allowed = this.enumIdSet(field);
        if (!Object.keys(allowed).length) return;
        const multi = field.widget === "multiselect" || field.widget === "tags";
        const values = multi ? splitMulti(val) : [String(val)];
        values.forEach((id) => {
          if (!allowed[id]) {
            this.errors.push({
              path: `${prefix}.${field.key}`,
              message: `${field.key} 不在枚举 ${field.enum || ""}：${id}`,
            });
          }
        });
      });
      this.checkRow(prefix, row, fields, sheetId);
    });
  }

  protected checkRow(_prefix: string, _row: Row, _fields: FieldDef[], _sheetId: string): void {}
}
