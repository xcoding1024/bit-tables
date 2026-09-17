package tables

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeFile(t *testing.T, path, text string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestPreferTSOverJS(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "item_editor.ts"), `window.BitTableEditor = { mount() {} };`)
	writeFile(t, filepath.Join(dir, "item_editor.js"), `window.BitTableEditor = { mount() { /* js */ } };`)
	path, ok := scriptFile(dir, "item", "editor")
	if !ok || !strings.HasSuffix(path, "item_editor.ts") {
		t.Fatalf("path %s ok=%v", path, ok)
	}
	info := Inspect(dir, "item")
	if !info.HasEditor {
		t.Fatal("expected HasEditor")
	}
}

func TestBundleBitTablesImport(t *testing.T) {
	project := t.TempDir()
	tablesRoot := filepath.Join(project, "tables")
	item := filepath.Join(tablesRoot, "item")
	writeFile(t, filepath.Join(project, "core", "editor.ts"), `
export class BitTableEditorBase {
  mount() { (window as any).BitTableEditor = { mount() {} }; }
}
`)
	writeFile(t, filepath.Join(item, "item_editor.ts"), `
import { BitTableEditorBase } from "bit-tables.editor";
class ItemEditor extends BitTableEditorBase {}
window.BitTableEditor = new ItemEditor();
`)
	writeFile(t, filepath.Join(item, "item_struct.yaml"), "id: item\n")
	r, err := Open(tablesRoot)
	if err != nil {
		t.Fatal(err)
	}
	js, ok, err := r.loadTableScript(item, "item", "editor")
	if err != nil || !ok {
		t.Fatalf("bundle %v ok=%v", err, ok)
	}
	if strings.Contains(js, `from "bit-tables.editor"`) || strings.Contains(js, "import {") {
		t.Fatalf("still has import: %s", js)
	}
	if !strings.Contains(js, "BitTableEditor") {
		t.Fatalf("missing BitTableEditor: %s", js)
	}
}

func TestBundleRejectsUnknownBitTables(t *testing.T) {
	project := t.TempDir()
	tablesRoot := filepath.Join(project, "tables")
	item := filepath.Join(tablesRoot, "item")
	writeFile(t, filepath.Join(item, "item_editor.ts"), `
import { x } from "bit-tables.unknown";
window.BitTableEditor = { mount() { console.log(x); } };
`)
	writeFile(t, filepath.Join(item, "item_struct.yaml"), "id: item\n")
	r, err := Open(tablesRoot)
	if err != nil {
		t.Fatal(err)
	}
	_, ok, err := r.loadTableScript(item, "item", "editor")
	if !ok || err == nil {
		t.Fatal("expected unknown module error")
	}
	if !strings.Contains(err.Error(), "未知的 bit-tables") && !strings.Contains(err.Error(), "Could not resolve") {
		t.Fatalf("err %v", err)
	}
}

func TestBundleRejectsEscapeImport(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "secret.ts"), `export const x = 1;`)
	tablesRoot := filepath.Join(root, "project", "tables")
	item := filepath.Join(tablesRoot, "item")
	writeFile(t, filepath.Join(item, "item_editor.ts"), `
import { x } from "../../../secret";
window.BitTableEditor = { mount() { console.log(x); } };
`)
	writeFile(t, filepath.Join(item, "item_struct.yaml"), "id: item\n")
	r, err := Open(tablesRoot)
	if err != nil {
		t.Fatal(err)
	}
	_, ok, err := r.loadTableScript(item, "item", "editor")
	if !ok || err == nil {
		t.Fatal("expected escape compile error")
	}
	if !strings.Contains(err.Error(), "超出项目根") && !strings.Contains(err.Error(), "Could not resolve") {
		t.Fatalf("err %v", err)
	}
}

func TestPlainJSPassthrough(t *testing.T) {
	dir := t.TempDir()
	src := "window.BitTableEditor = { mount: function () {} };\n"
	writeFile(t, filepath.Join(dir, "item_editor.js"), src)
	r, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	js, ok, err := r.loadTableScript(dir, "item", "editor")
	if err != nil || !ok || js != src {
		t.Fatalf("passthrough %v ok=%v %q", err, ok, js)
	}
}

func TestSignatureIncludesCoreTS(t *testing.T) {
	project := t.TempDir()
	tablesRoot := filepath.Join(project, "tables")
	if err := os.MkdirAll(tablesRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	r, err := Open(tablesRoot)
	if err != nil {
		t.Fatal(err)
	}
	writeFile(t, filepath.Join(project, "core", "editor.ts"), "export const y = 2;\n")
	sig, err := r.Signature()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sig, "../core/editor.ts@") {
		t.Fatalf("core signature %s", sig)
	}
}
