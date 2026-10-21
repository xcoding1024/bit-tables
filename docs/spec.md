# bit-tables

本机配表协议：每张表是子目录里的五件套 + `{id}_docs.md`。结构/编辑器/检查器/导出脚本与数据分开。不做热更或团队共享。历史记录只读 git / svn 提交。工作台编排执行各表 `{id}_export.ts`，客户端与服务端产物分别写入配表根上一级的 `build/client/` 与 `build/server/`，不发明统一导表格式。

## 目录

### 版本比对

- 从右侧历史记录进入：顶部「与基线比对」使用 Git HEAD 或 SVN BASE；每条提交提供「与本地比对」。全屏只读浮层关闭后保留原页签、历史滚动位置、草稿和撤销栈，不增加查看菜单入口。
- 右侧采集完整本地草稿并标注未保存状态，左侧可选择基线或历史提交。当前单元格编辑和在途写操作完成后才采集；不触发保存。快照冻结，手动刷新重新采集；换表、换目录关闭浮层并取消旧请求。
- 默认 Editor 视图，历史侧编译所选版本的 editor 与依赖，本地侧使用当前 editor，分别传入历史数据和本地草稿，保留卡片、表单、图表布局；可切换原始表格核对全部字段。不含 Excel、跨分支、历史互比或合并。按 sheet ID、字段 key 与完整唯一的行 ID 对齐；缺失或重复 ID 时整页按行位置对齐并提示。行调序不算修改，增删行列和分页留空占位；保留双方原始行号。比较区分类型、缺失和 null；对象忽略键顺序，数组保留顺序。
- 全部／差异／相同按行筛选，默认全部；支持当前 sheet 内差异跳转、同步横纵滚动、完整值查看、差异统计和分页；采用行列虚拟渲染。
- `GET /api/tables/{id}/snapshot?revision=base|<提交标识>` 透传窗口 `rootPath`，返回 `{ vcs, revision, struct, data, fileRevisions? }`；缺失文件为 null，失败明确报错。Git 固定提交哈希；SVN BASE 返回各文件版本，历史追溯分支复制。参数仅接受 base、Git 哈希或 SVN 正整数；固定读取结构和数据，校验目录及符号链接边界，命令设置超时，不修改工作副本。
- 本功能的读取、差异算法、只读组件和历史入口与 bit-agent 同步，宿主接口及目录接线分别适配。`go test ./tables ./server` 验证版本读取和隔离，构建 frontend 后 `npm run test:diff` 验证共享算法、实际历史和基线入口、草稿只读及关闭恢复。
- 历史接口可选 `error` 字段保留读取失败原因及仓库类型，本地基线入口继续可用。无法识别的行数据、非法 YAML 或循环引用明确报错，不当作空表。
- `/api/tables/{id}/renderer?revision=local|base|<提交标识>` 提供只读宿主 HTML；历史模块、相对导入、bit-tables 基类和 YAML／JSON 均从选中版本读取，缺失模块不使用当前文件补齐。资源接口同样接受 revision，图片与跨表枚举按版本读取。编译或渲染失败时可切换原始表格。
- 比对 iframe 只允许脚本运行，CSP 禁止网络连接；无写入通道，setData、save、fill、undo／redo 和 AI 均不生效。`EditorAPI.isReadOnly?()`／`getComparison?()` 提供状态与差异元数据。init 增加 comparison 行映射、字段差异与资源接口，宿主按标准 data-index／data-key 做差异标记和定位，支持分页重绘及比例滚动同步；非标准布局可保留原有渲染并用原始表格核对细节。

### 配表子窗口

- 配置表页签右键和「查看」菜单提供「在新窗口打开」。各桌面窗口共用本机服务，独立保存所选配表目录与活动页签，可最大化、F11 全屏、Esc 退出全屏。
- 子窗口通过 `tableWindow=1&rootPath=<绝对目录>&table=<表路径>` 定位。所有配表 API、编辑器资源、插件、历史、导出和 SSE 均携带 `rootPath`；子窗口切目录只更新自己的地址，刷新后继续使用该目录。主窗口保留默认目录与最近打开记录。
- 草稿未保存或保存、插件、导出操作尚未结束时，先完成当前操作再开新窗口或切目录。关闭与刷新触发草稿保护。关闭主窗口依次关闭所有子窗口，任何子窗口取消关闭时主窗口保留。
- 交互夹具使用临时复制的两份 `demo`，同名 `fill_demo` 表具有不同数据与资源。`go test ./server ./tables` 验证目录读写、资源、导出、SSE 隔离；`npm run test:desktop` 验证 IPC 与窗口生命周期；构建 frontend 后 `npm run test:windows` 使用 Playwright 验证浏览器与真实 Electron 窗口。`npm run test:e2e` 回归填充、保存与撤销行为。

### 表目录布局

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
- 打开配表时选择包含 `tables` 的项目根，实际绑定该目录下的 `tables`；直接选择 `tables` 目录会提示改选上一级。工作台预加载全部 `kind: enum` sheet；标题栏「查看 → 枚举」可搜索浏览
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

导出：每张表只编译 export 脚本（`GET /api/tables/{id}/files?view=export`）。最多 4 个 Worker 并行调用 `BitTableExporter.export(data, struct)`。导出过程显示已完成数量、进度条和正在导出的表。把返回的 `{ client:[{ name, content }], server:[{ name, content }] }` 分别写入配表根上一级的 `build/client/` 与 `build/server/`。缺 `export.ts` / `export.js` 的表跳过。导出当前表的集合 = 当前表 ∪ 所有传递下游（struct 里跨表 enum 引用它的表）。导出所有不按依赖扩张。导出产物不计入配表文件、不触发 SSE。兼容旧返回 `{ files }` 时，两端各写一份。

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
## 文件搜索与新建

文件栏顶部提供搜索框，按表名、ID、文件路径实时过滤文件树并展开匹配目录，空查询恢复完整文件树，无结果显示「没有匹配的文件」。新建表入口在「项目 → 新建表」，未绑定目录时禁用。

底部操作日志展开后提供清除按钮；清除只影响当前内存日志，面板保持展开并显示「就绪」。

## 插件目标与来源

- 插件绑定与交互跟随当前配表目录；更换目录清除点选状态。
- 一个目标（单元格或列）最多绑定一个插件。单元格绑定替换本单元格及与其冲突的列绑定，保留同字段其它单元格的绑定；整列绑定替换该列的所有绑定。
- 插件面板同一时间只展开一个插件。目标通过普通表格选择切换；更改来源期间目标锁定。
- 普通选择（单格、框选、多列或整列）只展示选区内已激活插件的来源；没有激活插件则无标注。来源以虚线框标注，旁边显示「插件名->插件参数名」（取插件参数 label，缺省用参数 key）。标注随表、sheet、滚动、分页及重绘更新。
- 多个已选目标共用同一来源时，合并来源边框，并在标注中列出全部插件名。
- 点击来源「更改」进入插件点选模式，隐藏所有「选中」按钮，当前来源显示「取消」「完成」。允许拖拽或 Shift 框选矩形范围、单格、单列与多列；行首不作为来源；禁止编辑表数据。点选期间显示当前来源草稿，退出后恢复为所选目标实际激活插件的来源。
- 点选期间仅预览来源。完成保留来源到插件参数草稿，取消或 Escape 恢复之前来源；两者都退出模式，绑定/应用后才持久化。
- 范围来源按行、列位置对应目标选区，单格来源可广播；有限范围的尺寸不匹配时拒绝应用，不截取首格。整列来源按目标行位置取值。范围绑定记录原始 `targetRange`，重新加载后保持位置映射。
- 激活/应用先计算，成功后持久化数据和绑定；自身写入期间及写入前发出的旧文件读取不得覆盖新草稿。失败不激活，重新读取或打开仍保持已保存计算结果。数据重绘保留滚动位置。
- iframe 协议 `pluginInteraction`：`picking` 和当前 sheet 的 `sources[]`（`field`、`row`、可选 `endField` / `endRow`、`pluginName`、`label`）。宿主显示标注并拦截点选；iframe 发范围 `selection` 或 `cancelPluginPick`，兼容已有项目编辑器。


## Excel 只读数据源

- 每张配置表目录直接包含的 `.xlsx` 自动作为数据源，支持多个文件和大小写扩展名，忽略 `~$` 临时文件；不提供上传和修改入口。按文件名排序、工作表按文件内部顺序排列，包括隐藏工作表。
- 文件响应增加可选 `excel[]`：每个工作簿包含 `file`、原始文件内容的 `md5`、`sheets[]` 和可选 `error`；每个工作表包含 `name`、`rows`、`columns`、按 A1 坐标存放的稀疏 `cells`、`merges` 和可选 `error`。单元格包含 `text`、`value` 和可选 `error`。路径必须位于已绑定配表根内，拒绝越界软链接。`files?view=excel-hashes` 只返回文件名、内容摘要和读取错误，不解析工作表，禁止 HTTP 缓存。
- Excel 分页追加到普通分页之后，带 Excel 图标；保持工作表原名，与任意分页重名时附加文件名。悬停显示来源文件。内部标识由完整文件名和工作表名确定，不按分页显示名定位。
- 网格从 A1 展示实际单元格及合并范围的内容边界，保留首行、空白、行列位置和合并布局。显示 Excel 格式化文本；不复刻字体、颜色等样式。支持滚动、选区复制、单格、矩形和单列/多列选择；行号不作为插件来源。
- 插件取值保持数字、文本、布尔原类型，日期取 Excel 序列值，空白取 null。合并区域只有左上角有值，覆盖位置取 null。公式只取已保存缓存，不执行公式；无缓存提示在 Excel 重算并保存。缺缓存公式和 Excel 错误值拒绝参与插件计算。损坏文件单独报告，不阻断普通表或其他 Excel 文件。
- 插件来源引用为 `xlsx://表路径/文件名/工作表名!A1`，支持 `A1:B3`、`A:A` 和 `A:C`；三个路径段分别按 RFC3986 编码，嵌套表路径的 `/` 编为 `%2F`。支持同表/跨表来源、单格广播及既有范围位置映射和尺寸校验；Excel 不能作为插件目标。旧配置表引用与绑定兼容。
- 插件更改来源保持原目标锁定，支持完成、取消、Escape、来源定位和带插件/参数名称的虚线标注。Excel 分页禁用保存、编辑、撤销和重做，切回普通分页保留草稿。
- Excel 数据独立于 `struct` 和 `data`，不传入检查器或导出器，不写入配表数据。通过插件计算后写入配置表的普通值仍按该表原有规则检查、导出。
- 编辑器独立缓存每张已打开表关联 XLSX 的 MD5，每 10 秒比较一次文件内容摘要，覆盖本表工作簿与插件绑定的跨表工作簿。文件通知、分页重读不会提前推进此缓存；只有刷新、重算、整体保存成功后才确认新摘要。摘要未变不重算、不保存、不提示；关闭表或切换项目清除对应监测状态。
- F5 或重新进入页面恢复当前表时，等待通用插件脚本就绪，立即强制重读当前表及跨表来源、重算并保存，不等待 10 秒轮询或 MD5 差异。初始化更新失败保留已保存数据，下次轮询重试。
- XLSX 内容变化后，强制重新读取来源，按依赖顺序重算当前表全部插件目标，连同现有草稿一起整体保存 data/plugins，更新编辑器，并飘字提示「xlsx数据源已更新」。不重算或保存其它未打开的依赖表。「刷新来源」同样重算并保存，刷新页面后结果仍有效。编辑单元格、选择插件来源或其它写操作进行中延后更新。读取、重算或保存失败不应用部分结果、不提示成功、不确认摘要，下一轮继续重试。文件或工作表删除使旧引用明确失败，不匹配同名分页。
- 示例包含多文件、重名、中文及隐藏分页、空白与合并布局、格式化数字、缓存公式和异常公式。Go 验证读取、MD5 内容摘要、隔离与导出边界；浏览器验收覆盖 10 秒轮询、跨表来源、无变化不重复保存、保存失败重试、编辑期间延后更新及 F5 后结果保留。


## 向下填充柄

- 共享编辑器基类的普通表格视图在单格或矩形选区右下角提供填充柄，悬停为十字光标，已激活插件的格子也支持。卡片视图和只读 Excel 页不提供；编辑中、插件来源点选中及操作处理中禁用。
- 向下拖拽只预览当前页目标，松手应用，Escape 取消；双击从选区下方填至当前 sheet 筛选结果的最后一行，跨全部分页且只产生一次操作。完成保留页码和滚动位置。
- 操作开始固定完整筛选结果的有序行列表，只修改列表中的目标记录。单格重复同值，多行、多列按来源行循环；不推算数字或日期序列。保留值类型，对对象深拷贝。结构上不可写的 ID、图标字段跳过。
- 普通来源覆盖目标值并解除目标插件；插件来源覆盖目标绑定并计算。有限引用按来源格与目标格在完整数据中的行位置差移动；普通表换算回行 ID，Excel 移动行坐标并保持文件、工作表和列。整列来源仍按目标行取值。旧绑定含 `targetRange` 时先解析来源格实际引用，新绑定写为单格且不继承旧目标范围。
- 与目标整列绑定冲突时，将该绑定展开为逐行绑定，再替换本次目标；选区外绑定和已存数据保持原值。全部引用解析、边界、循环检查及目标插件计算成功后才应用；任一失败不改数据与绑定。
- 每次填充独立记录一次撤销，不与相邻输入合并；撤销、重做同时恢复数据和绑定。普通值填充沿用草稿与手动保存；插件来源填充或绑定发生变化时立即整体保存（即使目标已有相同引用），该操作的撤销、重做同样整体保存。
- `EditorAPI` 新增可选 `fillCells({ sheet, sourceRows, targetRows, fields, idReadonly? }): Promise<void>`，行以 ID（无 ID 使用既有 `#行位置`）按顺序传递，兼容旧编辑器。iframe 发送带递增 `requestId` 的 `fillCells` / `restoreTableState`（含当前 sheet 数据，恢复时含该 sheet 绑定）；工作台返回 `tableStateResult`（同编号、数据及绑定，或 `error`）。收到成功响应后才更新数据和撤销栈；处理中锁定写入操作。
- 整体保存接受 `{ data, plugins }` 两个文本字段，两者均必填。先准备两个临时文件，再替换；失败恢复原文件。接口读取与文件变更检测使用同一锁，避免读到半更新状态；不写入 Excel。
- 开发夹具 `fill_demo` 含 300 行、非连续分组、布尔/对象、已有绑定和 320 行带缓存公式的中文 Excel 来源；`fill_source` 含 320 行普通跨表来源。通过本机开发态播种，在 Mock 登录后实际操作。
- Go 验收覆盖整体保存、绑定读回、第二个文件写入失败回滚和目录边界；浏览器验收覆盖拖拽预览与取消、跨页及非首页双击、循环复制、筛选/不可写字段、对象值、独立撤销重做、普通/跨表/Excel 相对引用、旧范围绑定、整列局部替换、刷新及越界/循环/保存失败不应用，并回归插件和 Excel。

整体保存接口为 `PUT /api/tables/{id}/state`，只写当前根目录内的配置表；与 bit-agent 的共享填充行为一致。

浏览器验收：先运行 `npm --prefix frontend run build`，再运行 `npm run test:e2e`。脚本使用临时示例项目，不修改仓库数据；`npm run test:e2e -- --help` 查看说明。
