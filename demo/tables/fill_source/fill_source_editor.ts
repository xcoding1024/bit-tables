import { BitTableEditorBase } from "bit-tables.editor";
const editor = new BitTableEditorBase();
editor.testPrefix = "fill-source";
editor.enableColFilters = true;
editor.enableTableScroll = true;
editor.toolbarHint = "选择单元格，拖拽右下角向下填充；双击填到筛选结果最后一行";
window.BitTableEditor = editor;
