# enum_demo

## 结构

- 表名：枚举演示表
- `default_sheet: rarities`
- sheet `rarities`（`kind: enum`）：稀有度，字段 id / name
- sheet `tags`（`kind: enum`）：标签，字段 id / name
- 供他表以 `enum: enum_demo.rarities` / `enum: enum_demo.tags` 引用（如 sheet_demo）
- 编辑器表格默认只读；单击或拖拽框选单元格，Ctrl+C / Ctrl+V 复制粘贴；双击单元格编辑；支持勾选后批量修改 / 批量删除；可选择每页行数，默认 100；超过当前每页行数时分页

## 检查规则

- 校整表所有 sheet；路径形如 `sheets.rarities.rows.0.id`
- id、name 必填；id 须小写字母开头，仅字母数字下划线，且在同一 sheet 内不重复
- 对应 `enum_demo_checker.ts` 的 `BitTableChecker.check`

## 导出规则

- 对应 `enum_demo_export.ts` 的 `BitTableExporter.export`
- 客户端：写入配表根上一级 `build/client/enum_demo.json`（`JSON.stringify` 整表 data）
- 服务端：写入配表根上一级 `build/server/enum_demo.json`（`JSON.stringify` 整表 data）
