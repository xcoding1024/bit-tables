---
title: 文件结构
description: 理解一张配置表的数据、结构、编辑、检查、导出与文档文件。
---

# 文件结构

一张表位于与表 ID 同名的目录中。以 `sheet_demo` 为例：

```text
tables/sheet_demo/
  sheet_demo_struct.yaml   字段、Sheet 与界面元数据
  sheet_demo_data.yaml     实际配置数据
  sheet_demo_editor.ts     这张表的编辑界面
  sheet_demo_checker.ts    检查规则
  sheet_demo_export.ts     客户端与服务端导出规则
  sheet_demo_docs.md       结构、检查与导出说明
```

## 日常改数值

只修改 `_data.yaml`。在工作台双击单元格、批量修改或使用插件，最终都会更新这个文件。保存前可撤销，保存后仍应通过版本管理审阅差异。

## 改字段或规则

字段变化通常同时影响 `_struct.yaml`、编辑器、检查器和导出器；完成后必须同步 `_docs.md`。不确定影响范围时，先让 AI 只分析并列出计划，不要直接修改。

## 多 Sheet 数据

多 Sheet 数据写在 `sheets.<sheetId>.rows` 下。枚举 Sheet 使用 `kind: enum`；普通字段通过 `enum: kinds` 引用本表枚举，或通过 `enum: enum_demo.rarities` 引用另一张表。
