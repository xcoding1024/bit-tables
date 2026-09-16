---
name: bit-tables
description: 按 bit-tables 五件套约定安全改游戏配置表。扫描表目录，改结构或数据时同步更新 {id}_docs.md。
---

# bit-tables

先确认 cwd 是配表根目录还是某一张表目录。只有包含 `*_struct.yaml` 的目录才是配置表，其它目录是普通文件夹。表目录名为 id（`^[a-z][a-z0-9_]{0,31}$`），可位于子目录中，内含：

- `{id}_struct.yaml`
- `{id}_data.yaml`
- `{id}_editor.js`
- `{id}_checker.js`
- `{id}_export.js`
- `{id}_docs.md`（`## 结构` / `## 检查规则` / `## 导出规则`）

## 流程

1. 列出五件套与 docs 是否齐全。缺文件时按结构模式一次补齐。
2. 用户改字段/编辑器/检查规则/导出 → 只动 struct / editor.js / checker.js / export.js，并更新 docs；不兼容再迁 data。
3. 用户改行数据 → 只动 `{id}_data.yaml`，仍须核对 docs 三节。
4. editor.js 必须 `window.BitTableEditor = { mount(el, api) }`（api 含 `getEnums`）；checker.js 必须 `window.BitTableChecker = { check(data, struct, enums) }` 返回 `{ ok, errors }`；export.js 必须 `window.BitTableExporter = { export(data, struct) }` 返回 `{ files:[{name,content}] }`。
5. 不要假设统一 schema；`struct.yaml` 推荐 `sheets[]`（每张 sheet 自带 `fields[]`），无 `sheets` 时视为隐式 `main` + 顶层 `rows`。枚举 sheet 设 `kind: enum`，字段用 `enum: sheet` / `enum: table.sheet`。checker / export 校整表。
6. 改完用中文简述动了哪些文件。

详见仓库 `AGENTS.md` 与 `docs/agent-prompt.md`。
