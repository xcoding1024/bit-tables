---
title: 多 Sheet 与 Excel
description: 在同一张表中切换多种编辑视图，并使用只读 Excel 来源。
---

# 多 Sheet 与 Excel

`sheet_demo` 是完整示例：道具使用表格视图，礼包使用卡片视图，分类是本表枚举；同目录的 `来源 数据.xlsx` 与 `补充.xlsx` 作为只读来源显示在底部。

<DemoFigure src="/demos/sheets-and-charts.gif" alt="sheet_demo 和 chart_demo 的多 Sheet 视图" caption="依次展示参数编辑、礼包卡片以及折线图、柱状图、饼图。" />

## 切换普通 Sheet

点击底部 Sheet 名称即可切换。工作台只把当前 Sheet 的字段和行交给编辑器，但保存、检查与导出仍处理整张表的全部 Sheet。

## 浏览 Excel

带 Excel 图标的 Sheet 只读，保留空白、合并布局和格式化文本。它适合做迁移期数据来源或插件输入，不直接参与配置表检查和导出。

<DemoFigure src="/demos/excel-source.png" alt="sheet_demo 中的只读 Excel 来源页面" caption="Excel 页面只读；选择单元格或区域可作为插件来源。" />

公式单元格必须在 Excel 中保存过缓存结果，插件才能读取。缺少缓存、错误单元格或不支持的区域会在插件应用前报错。
