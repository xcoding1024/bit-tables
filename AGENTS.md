# 配表 Agent 约定

工作目录可能是配表根目录，或某一张表的子目录。用中文说明改动。改结构或数据后必须更新 `{id}_docs.md`。

## 目录

```text
{root}/
  item/
    item_struct.yaml
    item_data.yaml
    item_editor.ts
    item_checker.ts
    item_export.ts
    item_docs.md
  combat/                 # 普通目录
    skill/
      skill_struct.yaml
      ...
```

- 表 id = 目录名：`^[a-z][a-z0-9_]{0,31}$`
- 只有包含 `*_struct.yaml` 的目录才识别为配置表；其它目录是普通文件夹，左侧按文件树展示。可嵌套，如 `combat/skill`
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `default_sheet` / `sheets[]`（每张 sheet 自带 `id` / `name` / `fields[]`），由该表 editor/checker/export 解释
- sheet `id`：`^[a-z][a-z0-9_]{0,31}$`。无 `sheets` 时视为隐式 `main`，数据仍可用顶层 `rows`
- 多 sheet 数据写在 `sheets.{id}.rows`。editor 按当前 sheet 的 `fields` + `rows` 画一页；checker / export 校整表，路径形如 `sheets.items.rows.0.id`
- 枚举 sheet 设 `kind: enum`（字段推荐 `id`/`name`）。字段用 `enum: kinds` 或 `enum: other.kinds` 引用；存 id，下拉显示 name
- `{id}_docs.md` 分三节：`## 结构`、`## 检查规则`、`## 导出规则`

## 结构修改

只改 `{id}_struct.yaml`、`{id}_editor.ts`、`{id}_checker.ts`、`{id}_export.ts`，并更新 `{id}_docs.md`。字段不兼容时才迁移 `{id}_data.yaml`。新建或补齐时必须一次生成五件套与 docs。仍兼容旧的 `*.js`。

`editor.ts` 必须定义：

```ts
window.BitTableEditor = { mount(el, api) { /* api: getStruct/getData/getEnums/setData/save/askAI */ } };
```

`checker.ts` 必须定义：

```ts
window.BitTableChecker = { check(data, struct, enums) { return { ok: true, errors: [{ path, message }] }; } };
```

`export.ts` 必须定义：

```ts
window.BitTableExporter = { export(data, struct) { return { files: [{ name, content }] }; } };
```

若配表根上一级有 `core/`（如 demo），可按需引用：`import { BitTableEditorBase } from "bit-tables.editor"`、`bit-tables.checker`、`bit-tables.export`、`bit-tables.dom`、`bit-tables.types`。无共享基类时写自包含脚本即可。

枚举：sheet 设 `kind: enum`；字段 `enum: sheet` 或 `enum: table.sheet`；兼容旧 `options`。

## 数据修改

只改 `{id}_data.yaml`，不要改结构、编辑器、检查器或导出脚本。仍须核对并更新 `{id}_docs.md` 三节。

## 禁止

- 不要假设全项目统一 schema
- 导出由该表 `{id}_export.ts`（或兼容的 `.js`）定义，不要发明统一导表格式、热更或共享流程。工作台只编排执行各表 exporter，产物写入配表根上一级的 `export/`
