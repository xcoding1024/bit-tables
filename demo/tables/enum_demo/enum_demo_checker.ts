import { BitTableCheckerBase } from "bit-tables.checker";
import type { FieldDef } from "bit-tables.types";

class EnumDemoChecker extends BitTableCheckerBase {
  protected extraRequired(_sheetId: string, fields: FieldDef[]): string[] {
    const have = new Set(this.requiredKeys(fields));
    return ["id", "name"].filter((key) => !have.has(key));
  }
}

window.BitTableChecker = new EnumDemoChecker();
