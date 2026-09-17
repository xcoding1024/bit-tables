# bit-tables

本机配表协议：每张表是子目录里的五件套 + `{id}_docs.md`。结构/编辑器/检查器/导出脚本与数据分开。不做热更、工作台级导表或团队共享。历史记录只读 git / svn 提交。

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
  combat/                 # 普通目录（无 *_struct.yaml）
    skill/
      skill_struct.yaml
      ...
```

- 表 id = 目录名：`^[a-z][a-z0-9_]{0,31}$`
- 只有包含 `*_struct.yaml` 的目录才识别为配置表；其它目录是普通文件夹。左侧列表按文件树展示，可嵌套（`combat/skill`）
- 结构修改：`*_struct.yaml`、`*_editor.ts`、`*_checker.ts`、`*_export.ts`（兼容旧 `*.js`）；字段不兼容时可迁移 data；同时更新 `{id}_docs.md`
- 数据修改：只改 `*_data.yaml`，并核对更新 `{id}_docs.md`
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `default_sheet` / `sheets[]`（每张 sheet 自带 `id` / `name` / `fields[]`，以及该表 editor 需要的 views/groups 等），由该表 editor/checker/export 解释
- sheet `id`：`^[a-z][a-z0-9_]{0,31}$`。无 `sheets` 时视为一张隐式表 `id=main`，`fields=struct.fields`，数据仍是顶层 `rows`
- 多 sheet 数据写在 `sheets.{id}.rows`；单 sheet / 旧表可继续只写顶层 `rows`（当作 `default_sheet` 或第一张 / `main`）
- **枚举 sheet**：`kind: enum`，推荐字段 `id` + `name`。字段用 `enum: kinds`（本表）或 `enum: item.kinds`（他表）引用；值存 id，编辑器下拉默认显示 name（无则 label，再无则 id）。无 `enum` 时仍可用扁平 `options: a, b, c`
- 打开配表根目录时工作台预加载全部 `kind: enum` sheet；标题栏「查看 → 枚举」可搜索浏览

```yaml
# {id}_struct.yaml
id: item
name: 道具表
default_sheet: items
sheets:
  - id: items
    name: 道具
    fields:
      - key: id
        type: string
        required: true
      - key: kind
        type: enum
        widget: select
        enum: kinds
  - id: kinds
    name: 分类
    kind: enum
    fields:
      - key: id
        type: string
      - key: name
        type: string

# {id}_data.yaml
sheets:
  items:
    rows:
      - id: sword
        name: 铁剑
        kind: weapon
  kinds:
    rows:
      - id: weapon
        name: 武器
```
- `{id}_docs.md` 用 `## 结构` / `## 检查规则` / `## 导出规则` 三节说明当前表。Agent 改结构或数据后必须更新文档
- 导出由该表 `{id}_export.ts`（或兼容的 `.js`）定义，不要发明工作台级导表 / 热更 / 共享流程

## 宿主约定

AI 生成的脚本只在沙箱 iframe 跑（`sandbox="allow-scripts"`，禁止主窗口 eval）。源码优先 `{id}_*.ts`，服务端打包成 IIFE 再内联；仍兼容无 import 的 `{id}_*.js`。若配表根上一级有 `base.ts`，可 `import { ... } from "base"`（demo 的 `base.ts` 再导出 `core/` 里的控件基类）。无 `base.ts` 时写自包含脚本即可。运行时全局对象不变：

```ts
window.BitTableEditor = {
  mount(el, api) { /* api: getStruct/getData/getEnums/setData/save/askAI */ }
};
window.BitTableChecker = {
  check(data, struct, enums) { return { ok: true, errors: [] }; }
};
window.BitTableExporter = {
  export(data, struct) { return { files: [{ name, content }] }; }
};
```

父页 → iframe：`init` / `setSheet`（tableId / sheetId / 切片后的 struct.fields + data.rows / `enums` / theme；完整 `struct.sheets` 与 `data.sheets` 仍在）、`replaceData`（可带 enums）。
iframe → 父页：`ready` / `dirty` / `save` / `askAI` / `toast`。工作台按 sheet 画页签；保存时把 iframe 的 `data.rows` 写回 `data.sheets[sheetId].rows`。

Checker / export 吃整表 struct + data（所有 sheet），错误路径形如 `sheets.items.rows.0.id`。Checker 可收到宿主注入的 `enums`。

独立页上 `askAI` 提示用 Cursor / Codex 改文件；嵌入宿主时把消息交给父页。

保存：写 data → 隔离跑 checker → 展示错误。磁盘上五件套或 `{id}_docs.md` 变更后，SSE 推送，页面重载 data、iframe 或右栏文档。工作台本轮不执行 exporter。

缺 `editor.ts` / `editor.js` 时工作台用简易回退表（解析当前 sheet 的 `rows`），仍可查看/保存数据。回退编辑器不画 sheet 页签。

右栏页签：结构、检查规则、导出规则（展示 `{id}_docs.md` 对应章节）、历史记录（该表文件的 git / svn 提交，可筛选结构 / 检查规则 / 导出规则 / 数值修改，显示作者与时间）。

## 本机接口

根目录由进程启动参数决定，也可在运行中 `PUT /api/root` 切换。无 `projectId`。JSON 包体：`{ "ok": true, "data": ... }` 或 `{ "ok": false, "error": { "code", "message" } }`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 工作台 HTML |
| GET | `/api/root` | `{ path, guide }` |
| PUT | `/api/root` | `{ path, sample?, guide? }` 切换配表根目录 |
| GET | `/api/tables` | `{ tables, tree, path }`；`tree` 为文件树（`dir` / `table`），`tables` 为扁平表列表 |
| POST | `/api/tables` | `{ id }` 建空表目录（可写 `folder/id`）；写入空 `{id}_struct.yaml` 与 `{id}_docs.md` |
| DELETE | `/api/tables/{id}` | 删除表目录 |
| GET | `/api/tables/{id}/files` | 五件套文本 + `docs` |
| GET | `/api/tables/{id}/history` | `{ vcs, entries[] }` 表文件提交；`?kinds=struct,check,export,data` 可选 |
| PUT | `/api/tables/{id}/data` | `{ data }` 只写 data |
| GET | `/api/tables/{id}/editor` | iframe HTML 壳（内联编译后的 editor） |
| GET | `/api/events` | SSE：`file_changed`，data 为 `{ tableId, kind }` |

路径必须落在启动 root 内。

## 嵌入

`/?embed=1&table=item`：藏掉右栏与根路径操作，只留列表与编辑器。`askAI` 仍 `postMessage` 给父窗口。

## 运行

```bash
bit-tables serve <root>
# 默认 http://127.0.0.1:18780
```
