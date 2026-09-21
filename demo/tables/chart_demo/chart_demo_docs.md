# chart_demo

## 结构

- 表名：图表演示表
- `default_sheet: line`
- sheet `line`（折线图）：`month` / `value` — 月度趋势
- sheet `bar`（柱状图）：`category` / `value` — 分类对比
- sheet `pie`（饼图）：`label` / `value` — 占比（按 value 求和归一）
- 编辑器按当前 sheet 用纯 SVG 绘制对应图表，下方表格默认只读；单击或拖拽框选单元格，单击表头选列、单击行首选行，Ctrl+C / Ctrl+V 复制粘贴，Ctrl+Shift+C 复制引用；双击单元格编辑；支持勾选后批量修改 / 批量删除；可选择每页行数，默认 100；超过当前每页行数时分页
- 复制引用文本：单元格 `表.sheet!字段[行id]`，区域左上到右下 `表.sheet!字段A[行A]:字段B[行B]`，整列 `表.sheet!字段`，整行 `表.sheet![行id]`，整表 `表.sheet`；另附 `path`

## 检查规则

- 校整表所有 sheet；路径形如 `sheets.line.rows.0.month`
- 标签字段（month / category / label）与 `value` 必填；`value` 须为有限数字；饼图 `value ≥ 0`
- 对应 `chart_demo_checker.ts` 的 `BitTableChecker.check`

## 导出规则

- 对应 `chart_demo_export.ts` 的 `BitTableExporter.export`
- 客户端：写入配表根上一级 `build/client/chart_demo.json`（`JSON.stringify` 整表 data）
- 服务端：写入配表根上一级 `build/server/chart_demo.json`（`JSON.stringify` 整表 data）
