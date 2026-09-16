# bit-tables

本机配表协议：每张表是子目录里的五件套 + `{id}_docs.md`。结构/编辑器/检查器/导出脚本与数据分开。不做热更、工作台级导表、SVN 或团队共享。

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
- 结构修改：`*_struct.yaml`、`*_editor.js`、`*_checker.js`、`*_export.js`；字段不兼容时可迁移 data；同时更新 `{id}_docs.md`
- 数据修改：只改 `*_data.yaml`，并核对更新 `{id}_docs.md`
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `fields[]`，由该表 editor/checker/export 解释
- `{id}_docs.md` 用 `## 结构` / `## 检查规则` / `## 导出规则` 三节说明当前表。Agent 改结构或数据后必须更新文档
- 导出由该表 `{id}_export.js` 定义，不要发明工作台级导表 / 热更 / 共享流程

## 宿主约定

AI 生成的 JS 只在沙箱 iframe 跑（`sandbox="allow-scripts"`，禁止主窗口 eval）。

```js
window.BitTableEditor = {
  mount(el, api) { /* api: getStruct/getData/setData/save/askAI */ }
};
window.BitTableChecker = {
  check(data, struct) { return { ok: true, errors: [] }; }
};
window.BitTableExporter = {
  export(data, struct) { return { files: [{ name, content }] }; }
};
```

父页 → iframe：`init`（tableId / struct / data / theme）、`replaceData`。
iframe → 父页：`ready` / `dirty` / `save` / `askAI` / `toast`。

独立页上 `askAI` 提示用 Cursor / Codex 改文件；嵌入宿主时把消息交给父页。

保存：写 data → 隔离跑 checker → 展示错误。磁盘上五件套或 `{id}_docs.md` 变更后，SSE 推送，页面重载 data、iframe 或右栏文档。工作台本轮不执行 exporter。

缺 `editor.js` 时工作台用简易回退表（解析 yaml `rows`），仍可查看/保存数据。

右栏页签：结构、检查规则、导出规则（展示 `{id}_docs.md` 对应章节）、历史记录（先留空）。

## 本机接口

根目录由进程启动参数决定，也可在运行中 `PUT /api/root` 切换。无 `projectId`。JSON 包体：`{ "ok": true, "data": ... }` 或 `{ "ok": false, "error": { "code", "message" } }`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 工作台 HTML |
| GET | `/api/root` | `{ path, guide }` |
| PUT | `/api/root` | `{ path, sample?, guide? }` 切换配表根目录 |
| GET | `/api/tables` | `{ tables, path }` |
| POST | `/api/tables` | `{ id }` 建空表目录（并写空 `{id}_docs.md`） |
| DELETE | `/api/tables/{id}` | 删除表目录 |
| GET | `/api/tables/{id}/files` | 五件套文本 + `docs` |
| PUT | `/api/tables/{id}/data` | `{ data }` 只写 data |
| GET | `/api/tables/{id}/editor` | iframe HTML 壳（内联 editor.js） |
| GET | `/api/events` | SSE：`file_changed`，data 为 `{ tableId, kind }` |

路径必须落在启动 root 内。

## 嵌入

`/?embed=1&table=item`：藏掉右栏与根路径操作，只留列表与编辑器。`askAI` 仍 `postMessage` 给父窗口。

## 运行

```bash
bit-tables serve <root>
# 默认 http://127.0.0.1:18780
```
