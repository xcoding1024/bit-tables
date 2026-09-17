import { BitTableEditorBase } from "base";

class EnumDemoEditor extends BitTableEditorBase {
  testPrefix = "enum-demo";
  rootTestId = "enum-demo-editor";
  toolbarHint = "枚举项 · 勾选后可批量修改或删除";
  idReadonly = false;
}

window.BitTableEditor = new EnumDemoEditor();
