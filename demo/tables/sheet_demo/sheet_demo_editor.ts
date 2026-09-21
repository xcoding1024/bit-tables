import { BitTableEditorBase } from "bit-tables.editor";
import type { ParamField, Row } from "bit-tables.types";

const PARAM_SCHEMAS: Record<string, ParamField[]> = {
  weapon: [
    { key: "atk", label: "攻击", type: "int", min: 0, max: 9999 },
    { key: "crit", label: "暴击率", type: "float", min: 0, max: 1, step: 0.01 },
    { key: "durability", label: "耐久", type: "int", min: 0, max: 9999 },
  ],
  armor: [
    { key: "def", label: "防御", type: "int", min: 0, max: 9999 },
    { key: "resist_fire", label: "火抗", type: "int", min: 0, max: 100 },
    { key: "durability", label: "耐久", type: "int", min: 0, max: 9999 },
  ],
  consumable: [
    { key: "heal", label: "治疗量", type: "int", min: 0, max: 9999 },
    { key: "duration", label: "持续秒数", type: "int", min: 0, max: 3600 },
    { key: "cooldown", label: "冷却秒数", type: "int", min: 0, max: 3600 },
  ],
  material: [
    { key: "purity", label: "纯度", type: "float", min: 0, max: 1, step: 0.01 },
    { key: "craft_bonus", label: "锻造加成", type: "int", min: 0, max: 100 },
    { key: "refine_cost", label: "精炼消耗", type: "int", min: 0, max: 9999 },
  ],
};

const PARAM_TITLES: Record<string, string> = {
  weapon: "武器参数",
  armor: "防具参数",
  consumable: "消耗品参数",
  material: "材料参数",
};

class SheetDemoEditor extends BitTableEditorBase {
  testPrefix = "demo";
  rootTestId = "table-editor";
  toolbarHint = "单击或拖拽框选单元格，Ctrl+C / Ctrl+V 复制粘贴 · Ctrl+Shift+C 复制引用 · 双击编辑 · 表头漏斗可筛选 · 勾选后可批量修改或删除";
  enableCardView = false;
  enableColFilters = true;
  enableTableScroll = true;
  checkboxHint = "开启后对玩家可见";
  selectedCountSuffix = " 行";
  groupNames = { basic: "基础信息", value: "数值与开关", extra: "展示与扩展" };

  protected paramsSchema(row: Row): ParamField[] {
    const key = String(row.kind || "").trim();
    return PARAM_SCHEMAS[key] || PARAM_SCHEMAS.weapon;
  }

  protected paramsTitle(row: Row): string {
    return PARAM_TITLES[String(row.kind || "")] || "编辑自定义参数";
  }

  protected formatParamValue(field: ParamField, value: unknown): string {
    const n = Number(value);
    if (Number.isNaN(n) || !n) return "";
    if (field.key === "crit" || field.key === "purity") {
      return `${field.label} ${Math.round(n * 1000) / 10}%`;
    }
    return `${field.label} ${n}`;
  }
}

window.BitTableEditor = new SheetDemoEditor();
