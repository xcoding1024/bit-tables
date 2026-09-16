# bit-tables

本机配表工作台：每张表是子目录里的五件套 + `{id}_docs.md`。桌面应用直接打开窗口，不必再开浏览器。Cursor / Codex 仍直接改磁盘上的 YAML 与脚本。

约定见 [docs/spec.md](docs/spec.md)。Agent 提示见 [AGENTS.md](AGENTS.md)。

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
