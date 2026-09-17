# bit-tables AI时代的全新游戏配表方式

核心特性：

- 每一张配置表都有自己独特的编辑方式，表的结构，检查/导表规则，甚至连修改历史记录都可以在编辑器里一览无余
- 所有的内容都是纯文本，对AI非常友好
- 数值表同时能兼顾AI修改和人工微调，并且可以用图表等形式去做校对
- 多人同时修改同一张表时不易产生冲突，就算是冲突了也可以让ai轻松解决
- 在配表阶段就已经把错误扼杀在摇篮

## 一张配置表里有什么

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

`struct.yaml` 是描述字段和 sheet

`data.yaml` 是数值表

`editor.js` 是画这张表的界面代码，要表格、卡片还是图都可以，没有的话工作台会给一个简易表格

`checker.js`是规则检查脚本，错了会标到具体字段，比如 `sheets.items.rows.0.id`

`export.js` 是导表规则脚本，可以把当前配置表转换成具体的产物

`docs.md` 是结构、检查规则、导出规则的文档，AI改完表就会顺手改这个文档，方面之后查看。

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

约定见 [docs/spec.md](docs/spec.md)。给 Agent 用的提示见 [AGENTS.md](AGENTS.md)。

## 开发

需要 Go 1.23+ 与 Node.js。默认打开本仓库 [demo/tables](demo/tables)（含 `sheet_demo`、`enum_demo` 等示例表；资源在 [demo/res](demo/res)）。

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
go run ./cmd/bit-tables serve ./demo/tables
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
