# demo

示例配表项目：

```text
demo/
  tables/          # 配表根（各表五件套）
  src/             # 共享 editor / checker / export 基类（bit-tables.*）
  res/             # 资源
  build/client/    # 客户端导表产物
  build/server/    # 服务端导表产物
  export.mjs       # 命令行导表
```

## 命令行导表

跨平台跑各表 `{id}_export.ts` / `{id}_export.js`，产物写入 `build/client/` 与 `build/server/`。

需要本机已安装 **Node.js**（建议 18+）。首次运行会自动 `npm install`。

```bash
# Linux / macOS
./export.sh
./export.sh sheet_demo
./export.sh --all

# Windows cmd
export.cmd
export.cmd sheet_demo

# Windows PowerShell
.\export.ps1
.\export.ps1 enum_demo

# 任意平台
npm install
node export.mjs --root ./tables
```

- 无参数或 `--all`：导出全部有 export 脚本的表
- 指定表 id：导出这些表及其**传递下游**（引用它们的表，与工作台「导出当前表」一致）
- `--root <路径>`：指定配表根（默认 `./tables`）
