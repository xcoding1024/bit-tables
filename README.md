# bit-tables

做了几年游戏配表，越来越觉得 Excel 别扭。xlsx 丢进 git 基本看不出改了哪一格，合并全靠对赌；检查规则东一块西一块，有的在离线脚本里，有的在群消息里，表自己不知道自己合不合法。结构稍微复杂一点就得靠合并单元格硬撑。这两年又多了个麻烦：想让 Cursor、Codex 帮忙改表，对着一份二进制它们根本下不去手。

所以我们把配表从 Excel 里拆出来，变成目录里的一套文件。每张表自己带着结构、数据、编辑器、检查脚本和导出脚本。人用桌面工作台填，Agent 直接改磁盘上的 YAML，两边看的是同一份东西，没有导入导出这一道。

约定见 [docs/spec.md](docs/spec.md)。给 Agent 用的提示见 [AGENTS.md](AGENTS.md)。

## 一张表是什么

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

`struct` 描述字段和 sheet，`data` 是行。没有全项目统一的 schema，新开一张表就按这张表的需求写。`editor.js` 画这张表的界面，要表格、卡片还是图都可以，没有的话工作台会给一个简易表格。保存时跑 `checker.js`，错了会标到具体字段，比如 `sheets.items.rows.0.id`。导出是这张表自己的 `export.js` 说了算，工作台不做统一导表。`docs.md` 把结构、检查规则、导出规则写在表旁边，改完表就改文档，免得口口相传。

枚举做成 `kind: enum` 的 sheet，字段用 `enum: kinds` 或 `enum: item.kinds` 引用，存 id，编辑器里显示名字。打开配表目录时工作台会把所有枚举预加载进来，标题栏「查看 → 枚举」可以搜。

```yaml
# item_struct.yaml
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

# item_data.yaml
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

历史记录直接看 git / svn 提交，没有另外做一套版本系统。外面改了文件，界面会跟着刷新。表里的 JS 只在沙箱 iframe 里跑，主窗口不 eval。

热更、统一导表、在线协作这些没做。继续用各表的 `export.js` 和现有的版本库就行。

## 开发

需要 Go 1.23+ 与 Node.js。默认打开本仓库 [fixtures](fixtures)（含 `sheet_demo`、`enum_demo` 等示例表）。

```powershell
npm install
npm run dev
```

## 桌面打包

Windows zip（本机）：

```powershell
npm run pack:win
```

产物在 `dist/desktop/`。Linux / macOS：

```powershell
npm run pack:linux
npm run pack:mac
```

macOS 安装包请在 Mac 上打。首次启动若没有上次打开的目录，会进入引导页：打开已有配表目录，或创建带 `item` 示例表的项目。

## 命令行

仍可用 HTTP 服务调试 API：

```bash
go run ./cmd/bit-tables serve ./fixtures
```

默认 http://127.0.0.1:18780 。空目录写入示例表：

```bash
go run ./cmd/bit-tables serve D:\game\tables --sample
```

嵌入宿主：`http://127.0.0.1:18780/?embed=1&table=item`。

仅交叉编译 CLI 二进制：

```powershell
powershell -File scripts/build-all.ps1
```

## 测试

```bash
go test ./...
```
