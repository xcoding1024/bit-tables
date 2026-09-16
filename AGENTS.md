# 配表 Agent 约定

工作目录可能是配表根目录，或某一张表的子目录。用中文说明改动。改结构或数据后必须更新 `{id}_docs.md`。

## 目录

```text
{root}/
  item/
    item_struct.yaml
    item_data.yaml
    item_editor.js
    item_checker.js
    item_export.js
    item_docs.md
```

- 表 id = 目录名：`^[a-z][a-z0-9_]{0,31}$`
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `default_sheet` / `sheets[]`（每张 sheet 自带 `id` / `name` / `fields[]`），由该表 editor/checker/export 解释
- sheet `id`：`^[a-z][a-z0-9_]{0,31}$`。无 `sheets` 时视为隐式 `main`，数据仍可用顶层 `rows`
- 多 sheet 数据写在 `sheets.{id}.rows`。editor 按当前 sheet 的 `fields` + `rows` 画一页；checker / export 校整表，路径形如 `sheets.items.rows.0.id`
- 枚举 sheet 设 `kind: enum`（字段推荐 `id`/`name`）。字段用 `enum: kinds` 或 `enum: other.kinds` 引用；存 id，下拉显示 name
- `{id}_docs.md` 分三节：`## 结构`、`## 检查规则`、`## 导出规则`

## 结构修改

只改 `{id}_struct.yaml`、`{id}_editor.js`、`{id}_checker.js`、`{id}_export.js`，并更新 `{id}_docs.md`。字段不兼容时才迁移 `{id}_data.yaml`。新建或补齐时必须一次生成五件套与 docs。

`editor.js` 必须定义：

```js
window.BitTableEditor = { mount(el, api) { /* api: getStruct/getData/getEnums/setData/save/askAI */ } };
```

`checker.js` 必须定义：

```js
window.BitTableChecker = { check(data, struct, enums) { return { ok: true, errors: [{ path, message }] }; } };
```

`export.js` 必须定义：

```js
window.BitTableExporter = { export(data, struct) { return { files: [{ name, content }] }; } };
```

枚举：sheet 设 `kind: enum`；字段 `enum: sheet` 或 `enum: table.sheet`；兼容旧 `options`。

## 数据修改

只改 `{id}_data.yaml`，不要改结构、编辑器、检查器或导出脚本。仍须核对并更新 `{id}_docs.md` 三节。

## 禁止

- 不要假设全项目统一 schema
- 导出由该表 `{id}_export.js` 定义，不要发明工作台级导表、热更或共享流程
