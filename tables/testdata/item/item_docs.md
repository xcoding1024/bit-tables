# {{TABLE_ID}}

## 结构

- 表名：道具表
- 字段：
  - id：唯一标识，必填
  - name：显示名，必填

## 检查规则

- `id`、`name` 必填
- 对应 `{{TABLE_ID}}_checker.js` 的 `BitTableChecker.check`

## 导出规则

- 对应 `{{TABLE_ID}}_export.js` 的 `BitTableExporter.export`
- 导出 `{{TABLE_ID}}.json`（`JSON.stringify(data)`）
