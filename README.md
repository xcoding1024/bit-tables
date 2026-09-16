# bit-tables

本机配表工作台：每张表是子目录里的四件套 + `history.md`。本质是一张 HTML 页，配一个读写本机文件的小服务。Cursor / Codex 直接改磁盘上的 YAML 与脚本。

约定见 [docs/spec.md](docs/spec.md)。Agent 提示见 [AGENTS.md](AGENTS.md)。

## 运行

需要 Go 1.23+。

```bash
go run ./cmd/bit-tables serve ./fixtures
```

打开 http://127.0.0.1:18780 。`fixtures` 里有示例表 `item`。

```bash
go run ./cmd/bit-tables serve D:\game\tables --addr 127.0.0.1:18780
```

嵌入宿主：`http://127.0.0.1:18780/?embed=1&table=item`。

## 编译

交叉编译 Win / macOS / Linux 到 `dist/`：

```powershell
powershell -File scripts/build-all.ps1
```

## 测试

```bash
go test ./...
```
