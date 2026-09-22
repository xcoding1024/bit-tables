# sheet_demo

## 结构

- 编辑器 / 检查器 / 导出分别 `import` 自 `bit-tables.editor` / `bit-tables.checker` / `bit-tables.export`（实现位于 `demo/src/`）
- 表名：Sheet 控件演示表
- `default_sheet: items`
- sheet 用 `view: table` / `view: card` 指定展示形态
- 可选择每页行数，默认 100；超过当前每页行数时分页
- sheet `items`（道具，`view: table`）：200 条；表格默认只读展示，单击或拖拽框选单元格，单击表头选列、单击行首选行，Ctrl+C / Ctrl+V 复制粘贴，Ctrl+Shift+C 复制引用，双击进入编辑；表头漏斗筛选；分组基础信息 / 数值与开关 / 展示与扩展
- 复制引用文本：单元格 `表.sheet!字段[行id]`，区域左上到右下 `表.sheet!字段A[行A]:字段B[行B]`，整列 `表.sheet!字段`，整行 `表.sheet![行id]`，整表 `表.sheet`；另附 `path`
- 右面板「插件」按选中单元格或列显示可用插件。通用插件在 `src/plugins/`（如 `scale` 匹配 `type: int`）；专属插件 `sheet_demo_plugin.ts` 的「强度推算」匹配 `items.power`。来源和目标均可为单元格或整列；点「选中」跳到对应位置，点「更改」后在表格单击（可换表或 sheet）。绑定写 `sheet_demo_plugins.yaml`，算值写回 data
- `items` 字段：
  - id：英文标识，必填，创建后不建议改
  - name：名称，必填
  - icon：图标，`type/widget: icon`，字段 `path: res/item_icons/{id}.png`（相对配表根上一级，按行字段替换占位符后展示，不写入 data）
  - kind：分类，`enum: kinds`（本表枚举 sheet）
  - rarity：稀有度，`enum: enum_demo.rarities`（跨表）
  - desc：描述
  - enabled：是否启用
  - stack：堆叠上限，1–999
  - weight：重量
  - power：强度，0–100（滑条）
  - available_from：上架日期
  - tags：标签，`enum: enum_demo.tags` + `widget: multiselect`（跨表；下拉多选，存逗号分隔 id，显示名称）
  - params：自定义参数，`type: object` + `widget: params`；对象形态按 `kind` 在 editor 写死，表格摘要 + 弹窗编辑
- sheet `packs`（礼包，`view: card`）：卡片；字段 id / name / icon / price / bonus / enabled / desc / tags
- sheet `kinds`（`kind: enum`）：本表分类枚举
- 数据按 sheet 写在 `sheets.items.rows` / `sheets.packs.rows` 等

## 检查规则

- 校整表所有 sheet；路径形如 `sheets.items.rows.0.id`
- 该 sheet `required` 字段必填；缺省时非 enum sheet 至少检查 id、name
- id 须小写字母开头，仅字母数字下划线，且在同一 sheet 内不重复
- items：kind 须落在 kinds；rarity / tags 须落在跨表枚举；stack 1–999；power 0–100
- packs：tags 须落在跨表枚举；price / bonus 按字段 min/max
- params 若存在须为对象，且只校验当前 kind 对应字段（仅 items）
- 对应 `sheet_demo_checker.ts` 的 `BitTableChecker.check(data, struct, enums)`

## 导出规则

- 对应 `sheet_demo_export.ts` 的 `BitTableExporter.export`
- 客户端：写入配表根上一级 `build/client/sheet_demo.json`（`JSON.stringify` 整表 data）
- 服务端：写入配表根上一级 `build/server/sheet_demo.json`（`JSON.stringify` 整表 data）
