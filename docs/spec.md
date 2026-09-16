# bit-tables

本机配表协议：每张表是子目录里的四件套 + `history.md`。结构/编辑器/检查器与数据分开。不做热更、导表、SVN 或团队共享。

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
- 结构修改：`*_struct.yaml`、`*_editor.js`、`*_checker.js`；字段不兼容时可迁移 data
- 数据修改：只改 `*_data.yaml`
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `fields[]`，由该表 editor/checker 解释
- `history.md` **不是四件套**：记录谁、何时与 Agent 的对话。分节用 `<!-- bit-history:struct -->` / `<!-- bit-history:data -->`（旁注 `## 结构` / `## 数据` 仅给人看）。一轮对话的标题必须是 `### 2006-01-02 15:04:05 -07:00 · 用户`，正文里的 `###` / `##` 不算新轮次。由服务端追加；Agent / Cursor / Codex 不得改此文件

## 宿主约定

AI 生成的 JS 只在沙箱 iframe 跑（`sandbox="allow-scripts"`，禁止主窗口 eval）。

```js
window.BitTableEditor = {
  mount(el, api) { /* api: getStruct/getData/setData/save/askAI */ }
};
window.BitTableChecker = {
  check(data, struct) { return { ok: true, errors: [] }; }
};
```

父页 → iframe：`init`（tableId / struct / data / theme）、`replaceData`。
iframe → 父页：`ready` / `dirty` / `save` / `askAI` / `toast`。

独立页上 `askAI` 提示用 Cursor / Codex 改文件；嵌入宿主时把消息交给父页。

保存：写 data → 隔离跑 checker → 展示错误。磁盘上四件套或 `history.md` 变更后，SSE 推送，页面重载 data、iframe 或历史。

缺 `editor.js` 时工作台用简易回退表（解析 yaml `rows`），仍可查看/保存数据。

## 本机接口

根目录由进程启动参数决定，无 `projectId`。JSON 包体：`{ "ok": true, "data": ... }` 或 `{ "ok": false, "error": { "code", "message" } }`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 工作台 HTML |
| GET | `/api/root` | `{ path }` |
| GET | `/api/tables` | `{ tables, path }` |
| POST | `/api/tables` | `{ id }` 建空表目录（并写空 `history.md`） |
| DELETE | `/api/tables/{id}` | 删除表目录 |
| GET | `/api/tables/{id}/files` | 四件套文本 + `history` |
| PUT | `/api/tables/{id}/data` | `{ data }` 只写 data |
| POST | `/api/tables/{id}/history` | `{ mode, who, user, agent, when? }` 按节追加一轮 |
| GET | `/api/tables/{id}/editor` | iframe HTML 壳（内联 editor.js） |
| GET | `/api/events` | SSE：`file_changed`，data 为 `{ tableId, kind }` |

路径必须落在启动 root 内。

## 嵌入

`/?embed=1&table=item`：藏掉历史栏与根路径操作，只留列表与编辑器。`askAI` 仍 `postMessage` 给父窗口。

## 运行

```bash
bit-tables serve <root>
# 默认 http://127.0.0.1:18780
```
