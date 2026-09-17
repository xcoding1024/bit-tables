import { BitTableCheckerBase } from "bit-tables.checker";
import type { Row } from "bit-tables.types";

class ChartDemoChecker extends BitTableCheckerBase {
  protected extraRequired(): string[] {
    return [];
  }

  protected checkRow(prefix: string, row: Row, _fields: unknown, sheetId: string): void {
    if (row.value == null || row.value === "") return;
    const n = Number(row.value);
    if (!Number.isFinite(n)) {
      this.errors.push({ path: `${prefix}.value`, message: "value 须为数字" });
    } else if (sheetId === "pie" && n < 0) {
      this.errors.push({ path: `${prefix}.value`, message: "饼图 value 须 ≥ 0" });
    }
  }
}

window.BitTableChecker = new ChartDemoChecker();
