import { BitTableCheckerBase, type FieldDef, type Row } from "base";

const PARAM_RULES: Record<string, Record<string, { min?: number; max?: number }>> = {
  weapon: { atk: { min: 0 }, crit: { min: 0, max: 1 }, durability: { min: 0 } },
  armor: { def: { min: 0 }, resist_fire: { min: 0, max: 100 }, durability: { min: 0 } },
  consumable: { heal: { min: 0 }, duration: { min: 0 }, cooldown: { min: 0 } },
  material: { purity: { min: 0, max: 1 }, craft_bonus: { min: 0, max: 100 }, refine_cost: { min: 0 } },
};

class SheetDemoChecker extends BitTableCheckerBase {
  protected extraRequired(sheetId: string, fields: FieldDef[]): string[] {
    if (this.requiredKeys(fields).length || sheetId === "kinds") return [];
    return ["id", "name"];
  }

  protected checkRow(prefix: string, row: Row): void {
    const stack = Number(row.stack);
    if (row.stack != null && row.stack !== "" && (Number.isNaN(stack) || stack < 1 || stack > 999)) {
      this.errors.push({ path: `${prefix}.stack`, message: "堆叠上限须在 1–999" });
    }
    const power = Number(row.power);
    if (row.power != null && row.power !== "" && (Number.isNaN(power) || power < 0 || power > 100)) {
      this.errors.push({ path: `${prefix}.power`, message: "强度须在 0–100" });
    }
    if (row.params == null || row.params === "") return;
    if (typeof row.params !== "object" || Array.isArray(row.params)) {
      this.errors.push({ path: `${prefix}.params`, message: "自定义参数须为对象" });
      return;
    }
    const kind = String(row.kind || "");
    const schema = PARAM_RULES[kind];
    if (!schema) return;
    const params = row.params as Row;
    Object.keys(schema).forEach((k) => {
      if (params[k] == null || params[k] === "") return;
      const n = Number(params[k]);
      const rule = schema[k];
      if (Number.isNaN(n) || (rule.min != null && n < rule.min) || (rule.max != null && n > rule.max)) {
        this.errors.push({ path: `${prefix}.params.${k}`, message: `${k} 超出 ${kind} 参数范围` });
      }
    });
  }
}

window.BitTableChecker = new SheetDemoChecker();
