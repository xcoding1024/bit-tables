---
title: 枚举、依赖与模板
description: 浏览全项目枚举、引用关系和可复用编辑模板。
---

# 枚举、依赖与模板

## 枚举

“查看 → 枚举”汇总所有 `kind: enum` 的 Sheet。搜索名称或 ID 后可查看枚举项，适合回答“这个字段应该填什么 ID”。

<DemoFigure src="/demos/enums.png" alt="bit-tables 项目枚举浏览窗口" caption="示例来自 enum_demo 的稀有度与标签，以及 sheet_demo 的分类。" />

## 依赖关系

“查看 → 依赖关系”根据跨表枚举、检查器引用和结构中的 `refs` 绘制关系图。选择一张表后，右侧可分别查看它引用了谁、谁依赖它。

<DemoFigure src="/demos/dependencies.png" alt="bit-tables 配置表依赖关系图" caption="修改枚举或公共来源前，先查看下游依赖范围。" />

导出当前表时会沿下游依赖传递，因此改动公共枚举后可能同时导出多张表。

## 编辑模板

“查看 → 编辑模板”展示项目 `src` 目录中可复用的编辑器、检查器、导出器和控件。普通用户通常不需要修改模板；当 AI 需要新增字段或新表时，可先让它参考这里已有的模式。

<DemoFigure src="/demos/templates.png" alt="bit-tables 编辑模板浏览窗口" caption="模板用于复用项目已有交互和规则，不影响当前表数据。" />
