# demo

## 结构

- 表名：控件演示表
- 视图：表格、卡片，默认表格
- `default_sheet: items`
- sheet `items`（道具）分组：基础信息、数值与开关、展示与扩展
- `items` 字段：
  - id：英文标识，必填，创建后不建议改
  - name：名称，必填
  - icon：图标，`type/widget: icon`，字段 `path: fixtures_res/item_icons/{id}.png`（相对配表根的上一级，按行字段替换占位符后展示，不写入 data）
  - kind：分类，`enum: kinds`（存 id，下拉显示名称）
  - rarity：稀有度，`enum: rarities`
  - desc：描述
  - enabled：是否启用
  - stack：堆叠上限，1–999
  - weight：重量
  - power：强度，0–100（滑条）
  - available_from：上架日期
  - tags：标签，`enum: tags` + `widget: multiselect`（下拉多选，存逗号分隔 id，显示名称）
  - params：自定义参数，`type: object` + `widget: params`；对象形态按 `kind` 在 `demo_editor.js` 写死（武器/防具为战斗属性，消耗品为治疗与冷却，材料为纯度与锻造等），表格显示对应摘要，点击弹窗编辑；切换分类会按新形态归一化 params
- sheet `kinds` / `rarities` / `tags`（`kind: enum`）：id / name
- 数据按 sheet 写在 `sheets.items.rows` 等

## 检查规则

- 校整表所有 sheet；路径形如 `sheets.items.rows.0.id`
- 该 sheet `required` 字段必填；缺省时 items 至少检查 id、name
- id 须小写字母开头，仅字母数字下划线，且在同一 sheet 内不重复
- items：kind / rarity 须落在对应枚举；tags 每个 id 须落在 tags 枚举；stack 1–999；power 0–100
- params 若存在须为对象，且只校验当前 kind 对应字段（如 weapon 的 atk/crit/durability，consumable 的 heal/duration/cooldown，material 的 purity/craft_bonus/refine_cost）
- 对应 `demo_checker.js` 的 `BitTableChecker.check(data, struct, enums)`

## 导出规则

- 对应 `demo_export.js` 的 `BitTableExporter.export`
- 导出 `demo.json`（`JSON.stringify` 整表 data，含全部 sheet）
