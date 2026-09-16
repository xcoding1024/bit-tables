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
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `fields[]`，由该表 editor/checker/export 解释
- `{id}_docs.md` 分三节：`## 结构`、`## 检查规则`、`## 导出规则`

## 结构修改

只改 `{id}_struct.yaml`、`{id}_editor.js`、`{id}_checker.js`、`{id}_export.js`，并更新 `{id}_docs.md`。字段不兼容时才迁移 `{id}_data.yaml`。新建或补齐时必须一次生成五件套与 docs。

`editor.js` 必须定义：

```js
window.BitTableEditor = { mount(el, api) { /* api: getStruct/getData/setData/save/askAI */ } };
```

`checker.js` 必须定义：

```js
window.BitTableChecker = { check(data, struct) { return { ok: true, errors: [{ path, message }] }; } };
```

`export.js` 必须定义：

```js
window.BitTableExporter = { export(data, struct) { return { files: [{ name, content }] }; } };
```

## 数据修改

只改 `{id}_data.yaml`，不要改结构、编辑器、检查器或导出脚本。仍须核对并更新 `{id}_docs.md` 三节。

## 禁止

- 不要假设全项目统一 schema
- 导出由该表 `{id}_export.js` 定义，不要发明工作台级导表、热更或共享流程
