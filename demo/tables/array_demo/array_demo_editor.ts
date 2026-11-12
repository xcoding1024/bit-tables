import { BitTableEditorBase, type ArrayItemOptions } from "bit-tables.editor";
import type { ArrayItemDef } from "bit-tables.types";

class ArrayDemoEditor extends BitTableEditorBase {
  testPrefix = "array-demo";
  enableCardView = true;

  protected arrayItemOptions(item: ArrayItemDef): ArrayItemOptions {
    if (item.widget !== "reward") return super.arrayItemOptions(item);
    return {
      createDefault: () => ({ name: "", count: 0 }),
      mount(host, context) {
        const value = context.value as { name: string; count: number };
        host.innerHTML = '<label>奖励名称 <input data-role="reward-name" aria-label="奖励名称"></label><label>数量 <input type="number" step="1" data-role="reward-count" aria-label="数量"></label><div role="alert" style="color:#ff8787"></div>';
        const name = host.querySelector<HTMLInputElement>('[data-role="reward-name"]')!;
        const count = host.querySelector<HTMLInputElement>('[data-role="reward-count"]')!;
        name.value = value.name;
        count.value = String(value.count);
        name.disabled = count.disabled = context.readOnly;
        const validate = () => {
          const valid = name.value.trim() !== "" && count.value !== "" && Number.isSafeInteger(Number(count.value)) && Number(count.value) >= 0;
          host.querySelector('[role="alert"]')!.textContent = valid ? "" : "请输入奖励名称与非负整数数量";
          return valid;
        };
        const change = () => {
          if (validate()) context.onChange({ name: name.value, count: Number(count.value) });
        };
        name.addEventListener("input", change);
        count.addEventListener("input", change);
        return { validate, destroy() { name.removeEventListener("input", change); count.removeEventListener("input", change); } };
      },
    };
  }
}

window.BitTableEditor = new ArrayDemoEditor();
