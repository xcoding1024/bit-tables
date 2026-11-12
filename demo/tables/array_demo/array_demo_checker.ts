import { BitTableCheckerBase } from "bit-tables.checker";
import type { Row } from "bit-tables.types";

class ArrayDemoChecker extends BitTableCheckerBase {
  protected checkRow(prefix: string, row: Row): void {
    if (!Array.isArray(row.rewards)) return;
    row.rewards.forEach((reward, index) => {
      if (!reward || typeof reward.name !== "string" || !reward.name.trim() || !Number.isSafeInteger(reward.count) || reward.count < 0) {
        this.errors.push({ path: `${prefix}.rewards`, message: `奖励第 ${index + 1} 项需要名称与非负整数数量` });
      }
    });
  }
}

window.BitTableChecker = new ArrayDemoChecker();
