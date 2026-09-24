# bit-tables

本机配表协议：每张表是子目录里的五件套 + `{id}_docs.md`。结构/编辑器/检查器/导出脚本与数据分开。不做热更或团队共享。历史记录只读 git / svn 提交。工作台编排执行各表 `{id}_export.ts`，客户端与服务端产物分别写入配表根上一级的 `build/client/` 与 `build/server/`，不发明统一导表格式。

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
- 只有包含 `*_struct.yaml` 的目录才识别为配置表；其它目录是普通文件夹。左侧列表按文件树展示，可嵌套（`combat/skill`）。Ctrl/Cmd+P 按文件名打开表，Ctrl/Cmd+F 在当前表中查找（当前 Sheet 或全部 Sheet），选中结果定位并高亮对应单元格，Esc 取消高亮。底部栏显示带时间戳的操作日志，Ctrl+` 加高查看历史
- 结构修改：`*_struct.yaml`、`*_editor.ts`、`*_checker.ts`、`*_export.ts`（兼容旧 `*.js`）；字段不兼容时可迁移 data；同时更新 `{id}_docs.md`
- 数据修改：只改 `*_data.yaml`，并核对更新 `{id}_docs.md`
- `struct.yaml` 无统一 schema，推荐 `id` / `name` / `default_sheet` / `sheets[]`（每张 sheet 自带 `id` / `name` / `fields[]`，以及该表 editor 需要的 views/groups 等），由该表 editor/checker/export 解释
- sheet `id`：`^[a-z][a-z0-9_]{0,31}$`。无 `sheets` 时视为一张隐式表 `id=main`，`fields=struct.fields`，数据仍是顶层 `rows`
- 多 sheet 数据写在 `sheets.{id}.rows`；单 sheet / 旧表可继续只写顶层 `rows`（当作 `default_sheet` 或第一张 / `main`）
- **枚举 sheet**：`kind: enum`，推荐字段 `id` + `name`。字段用 `enum: kinds`（本表）或 `enum: item.kinds`（他表）引用；值存 id，编辑器下拉默认显示 name（无则 label，再无则 id）。无 `enum` 时仍可用扁平 `options: a, b, c`
- 打开配表根目录时工作台预加载全部 `kind: enum` sheet；标题栏「查看 → 枚举」可搜索浏览
- 标题栏「查看 → 依赖关系」画出表间引用：跨表 `enum: table.sheet`、字段 `checker` 里的 `表#分页`（`@ItemArrayChecker` 视为引用 `item`）、以及结构根上的 `refs` 列表。本表 `enum: kinds` 和以 `#` 开头的本表检查器不算跨表边
- 标题栏「查看 → 编辑模板」浏览可复用的 editor / checker / export 基类预览与用法（`bit-tables.*` → 配表根上一级 `src/`）
- 标题栏「导出 → 导出当前表 / 导出所有」：跑各表 `export.ts`。导出当前表时连带导出所有传递下游（直接或间接引用它的表）；导出所有则跑全部有导出脚本的表。每张表分别产出客户端与服务端文件

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
- `{id}_docs.md` 用 `## 结构` / `## 检查规则` / `## 导出规则` 三节说明当前表；导出规则须区分客户端与服务端。Agent 改结构或数据后必须更新文档
- 导出格式由该表 `{id}_export.ts`（或兼容的 `.js`）定义；工作台只编排执行并分别写入配表根上一级 `build/client/` 与 `build/server/`，不要发明统一导表格式 / 热更 / 共享流程

## 宿主约定

AI 生成的脚本只在沙箱 iframe 跑（`sandbox="allow-scripts"`，禁止主窗口 eval）。源码优先 `{id}_*.ts`，服务端打包成 IIFE 再内联；仍兼容无 import 的 `{id}_*.js`。若配表根上一级有 `src/`，可 `import { ... } from "bit-tables.editor"` / `bit-tables.checker` / `bit-tables.export` / `bit-tables.dom` / `bit-tables.types`（映射到 `src/*.ts`）。无共享基类时写自包含脚本即可。运行时全局对象不变：

```ts
window.BitTableEditor = {
  mount(el, api) {
    /* api: getStruct/getData/getEnums/setData/save/askAI，可选 undo/redo/canUndo/canRedo */
  }
};
window.BitTableChecker = {
  check(data, struct, enums) { return { ok: true, errors: [] }; }
};
window.BitTableExporter = {
  export(data, struct) { return { client: [{ name, content }], server: [{ name, content }] }; }
};
```

父页 → iframe：`init` / `setSheet`（tableId / sheetId / 切片后的 struct.fields + data.rows / `enums` / theme；完整 `struct.sheets` 与 `data.sheets` 仍在）、`replaceData`（可带 enums）。
iframe → 父页：`ready` / `dirty` / `save` / `askAI` / `toast`。工作台按 sheet 画页签；保存时把 iframe 的 `data.rows` 写回 `data.sheets[sheetId].rows`。

宿主拦截 `setData` 为当前 sheet 维护表数据撤销栈（深拷贝快照，400ms 内连续改合同一条，上限 100）。`api.undo` / `api.redo` / `api.canUndo` / `api.canRedo` 可选；快捷键 Ctrl/Cmd+Z 撤销，Ctrl/Cmd+Y 或 Ctrl/Cmd+Shift+Z 重做。`init` / 切 sheet / `replaceData` 在数据与已提交快照一致时保留该 sheet 的栈，否则重置。同一 sheet 的 `setSheet`（如枚举刷新）若已有撤销/重做记录则保留当前数据与栈。保存本身不清栈；工作台在刚保存后忽略 SSE `replaceData`。

Checker / export 吃整表 struct + data（所有 sheet），错误路径形如 `sheets.items.rows.0.id`。Checker 可收到宿主注入的 `enums`。`check` 必须走完所有 sheet、行和字段规则，一次返回全部 `{ path, message }`；单条失败不得从 `check` / `checkSheet` 提前返回。

编辑器 `setCheckErrors` 保存 `{ rowIndex, field, message }`。`render` 结束后按当前视图调用 `markTableErrors` 或 `markCardErrors`，给对应单元格标红。标题栏「检查」可检查当前表或全部表；有错误的表在文件列表标出。

独立页上 `askAI` 提示用 Cursor / Codex 改文件；嵌入宿主时把消息交给父页。

保存：写 data → 隔离跑 checker → 展示错误。磁盘上五件套或 `{id}_docs.md` 变更后，SSE 推送，页面重载 data、iframe 或右栏文档。

导出：沙箱 iframe 调 `BitTableExporter.export(data, struct)`，把返回的 `{ client:[{ name, content }], server:[{ name, content }] }` 分别写入配表根上一级的 `build/client/` 与 `build/server/`。缺 `export.ts` / `export.js` 的表跳过。导出当前表的集合 = 当前表 ∪ 所有传递下游（struct 里跨表 enum 引用它的表）。导出所有不按依赖扩张。导出产物不计入配表文件、不触发 SSE。兼容旧返回 `{ files }` 时，两端各写一份。

缺 `editor.ts` / `editor.js` 时工作台用简易回退表（解析当前 sheet 的 `rows`），仍可查看/保存数据。回退编辑器不画 sheet 页签。

右栏页签：结构、检查规则、导出规则（展示 `{id}_docs.md` 对应章节）、历史记录（该表文件的 git / svn 提交，可筛选结构 / 检查规则 / 导出规则 / 数值修改，显示作者与时间）。

## 本机接口

根目录由进程启动参数决定，也可在运行中 `PUT /api/root` 切换。无 `projectId`。JSON 包体：`{ "ok": true, "data": ... }` 或 `{ "ok": false, "error": { "code", "message" } }`。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 工作台 HTML |
| GET | `/api/root` | `{ path, guide }` |
| PUT | `/api/root` | `{ path, sample?, guide? }` 切换配表根目录；`sample` 且目录为空时：路径以 `tables` 结尾则在上一级写入完整示例项目，否则写入 `item` 示例表 |
| GET | `/api/tables` | `{ tables, tree, path }`；`tree` 为文件树（`dir` / `table`），`tables` 为扁平表列表；表项含 `id` 与 struct 顶层 `name` |
| POST | `/api/tables` | `{ id }` 建空表目录（可写 `folder/id`）；写入空 `{id}_struct.yaml` 与 `{id}_docs.md` |
| DELETE | `/api/tables/{id}` | 删除表目录 |
| GET | `/api/tables/{id}/files` | 五件套文本 + `docs` |
| GET | `/api/tables/{id}/history` | `{ vcs, entries[] }` 表文件提交；`?kinds=struct,check,export,data` 可选 |
| PUT | `/api/tables/{id}/data` | `{ data }` 只写 data |
| GET | `/api/tables/{id}/editor` | iframe HTML 壳（内联编译后的 editor） |
| GET | `/api/tables/{id}/asset` | 表资源文件（`?path=`） |
| GET | `/api/events` | SSE：`file_changed`，data 为 `{ tableId, kind }` |
| GET | `/api/export` | `{ client, server }` 两端导出目录（配表根上一级 `build/client` 与 `build/server`，目录不存在也返回规划路径） |
| POST | `/api/export` | `{ client: [{ name, content }], server: [{ name, content }] }` 分别写入两端目录，返回 `{ client, server, written: [{ side, name }] }`；`name` 为相对路径，禁止 `..` |

配表文件路径必须落在启动 root 内。导出产物写在 root 上一级的 `build/client/` 与 `build/server/`。

demo 示例还提供命令行导表工具（[demo](../demo)，Node，Win / Linux / macOS）：`export.sh` / `export.cmd` / `export.ps1` 或 `node export.mjs`，默认导出 `demo/tables`。

## 嵌入

`/?embed=1&table=item`：藏掉右栏与根路径操作，只留列表与编辑器。`askAI` 仍 `postMessage` 给父窗口。

## 运行

```bash
bit-tables serve <root>
# 默认 http://127.0.0.1:18780
```
