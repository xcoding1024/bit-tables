# demo

## 结构

- 表名：控件演示表
- 视图：表格、卡片，默认表格
- `default_sheet: items`
- sheet `items`（道具）分组：基础信息、数值与开关、展示与扩展
- `items` 字段：
  - id：英文标识，必填，创建后不建议改
  - name：名称，必填
  - kind：分类，`enum: kinds`（存 id，下拉显示名称）
  - rarity：稀有度，`enum: rarities`
  - desc：描述
  - enabled：是否启用
  - stack：堆叠上限，1–999
  - weight：重量
  - power：强度，0–100
  - atk / def：攻击、防御
  - color：品质色 #RRGGBB
  - available_from：上架日期
  - tags：标签，逗号分隔
- sheet `kinds`（分类，`kind: enum`）：id / name
- sheet `rarities`（稀有度，`kind: enum`）：id / name
- 数据按 sheet 写在 `sheets.items.rows` / `sheets.kinds.rows` / `sheets.rarities.rows`

## 检查规则

- 校整表所有 sheet；路径形如 `sheets.items.rows.0.id`
- 该 sheet `required` 字段必填；缺省时 items 至少检查 id、name
- id 须小写字母开头，仅字母数字下划线，且在同一 sheet 内不重复
- items：kind / rarity 须落在对应枚举 sheet；stack 1–999；power 0–100；color `#RRGGBB`
- 对应 `demo_checker.js` 的 `BitTableChecker.check(data, struct, enums)`

## 导出规则

- 对应 `demo_export.js` 的 `BitTableExporter.export`
- 导出 `demo.json`（`JSON.stringify` 整表 data，含全部 sheet）
