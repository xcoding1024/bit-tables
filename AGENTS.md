# 配表 Agent 约定

工作目录可能是配表根目录，或某一张表的子目录。用中文说明改动。不要改 `history.md`。

## 目录

```text
{root}/
  item/
    item_struct.yaml
    item_data.yaml
    item_editor.js
    item_checker.js
    history.md
```

- 表 id = 目录名：`^[a-z][a-z0-9_]{0,31}$`
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `fields[]`，由该表 editor/checker 解释

## 结构修改

只改 `{id}_struct.yaml`、`{id}_editor.js`、`{id}_checker.js`。字段不兼容时才迁移 `{id}_data.yaml`。新建或补齐时必须一次生成四件套。

`editor.js` 必须定义：

```js
window.BitTableEditor = { mount(el, api) { /* api: getStruct/getData/setData/save/askAI */ } };
```

`checker.js` 必须定义：

```js
window.BitTableChecker = { check(data, struct) { return { ok: true, errors: [{ path, message }] }; } };
```

## 数据修改

只改 `{id}_data.yaml`，不要改结构、编辑器或检查器。

## 禁止

- 不要修改 `history.md`（由工作台 / `POST /api/tables/{id}/history` 追加）
- 不要假设全项目统一 schema
- 不要发明导表、热更或共享流程
