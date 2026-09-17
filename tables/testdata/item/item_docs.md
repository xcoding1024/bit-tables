# {{TABLE_ID}}

## 结构

- 表名：道具表
- sheet：`main`（道具），`default_sheet: main`
- `main` 字段：
  - id：唯一标识，必填
  - name：显示名，必填
- 数据仍可用顶层 `rows`（工作台当作 `main`），或写成 `sheets.main.rows`

## 检查规则

- 每个 sheet 的 `id`、`name` 必填
- 有 `sheets` 时路径形如 `sheets.main.rows.0.id`；旧表仍用 `rows.0.id`
- 对应 `{{TABLE_ID}}_checker.js` 的 `BitTableChecker.check`

## 导出规则

- 对应 `{{TABLE_ID}}_export.js` 的 `BitTableExporter.export`
- 客户端：写入 `build/client/{{TABLE_ID}}.json`（`JSON.stringify` 整表 data）
- 服务端：写入 `build/server/{{TABLE_ID}}.json`（`JSON.stringify` 整表 data）
