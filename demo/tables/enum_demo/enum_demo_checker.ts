import { BitTableCheckerBase, type FieldDef } from "base";

class EnumDemoChecker extends BitTableCheckerBase {
  protected extraRequired(_sheetId: string, fields: FieldDef[]): string[] {
    const have = new Set(this.requiredKeys(fields));
    return ["id", "name"].filter((key) => !have.has(key));
  }
}

window.BitTableChecker = new EnumDemoChecker();
