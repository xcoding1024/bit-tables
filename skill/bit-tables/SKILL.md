---
name: bit-tables
description: 按 bit-tables 四件套约定安全改游戏配置表。扫描表目录，只改结构或数据文件，不写 history.md。
---

# bit-tables

先确认 cwd 是配表根目录还是某一张表目录。表目录名为 id（`^[a-z][a-z0-9_]{0,31}$`），内含：

- `{id}_struct.yaml`
- `{id}_data.yaml`
- `{id}_editor.js`
- `{id}_checker.js`
- `history.md`（只读，禁止改）

## 流程

1. 列出四件套是否齐全。缺文件时按结构模式一次补齐。
2. 用户改字段/编辑器/检查规则 → 只动 struct / editor.js / checker.js；不兼容再迁 data。
3. 用户改行数据 → 只动 `{id}_data.yaml`。
4. editor.js 必须 `window.BitTableEditor = { mount(el, api) }`；checker.js 必须 `window.BitTableChecker = { check(data, struct) }` 返回 `{ ok, errors }`。
5. 不要假设统一 schema；`struct.yaml` 由该表自己的 editor/checker 解释。
6. 改完用中文简述动了哪些文件。

详见仓库 `AGENTS.md` 与 `docs/agent-prompt.md`。
