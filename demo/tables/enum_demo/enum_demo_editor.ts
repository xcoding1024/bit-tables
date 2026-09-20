import { BitTableEditorBase } from "bit-tables.editor";

class EnumDemoEditor extends BitTableEditorBase {
  testPrefix = "enum-demo";
  rootTestId = "enum-demo-editor";
  toolbarHint = "单击或拖拽框选单元格，Ctrl+C / Ctrl+V 复制粘贴 · 双击编辑 · 勾选后可批量修改或删除";
  idReadonly = false;
}

window.BitTableEditor = new EnumDemoEditor();
