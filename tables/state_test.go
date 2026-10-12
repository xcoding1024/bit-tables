package tables

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestStateSavesBothFilesAndRemovesEmptyBindings(t *testing.T) {
	r := excelTestRoot(t)
	data := "rows:\n  - id: a\n    value: 12\n"
	plugins := "bindings:\n  - sheet: main\n    row: a\n    field: value\n    plugin: reference\n"
	if err := r.PutState("combat/item", data, plugins); err != nil {
		t.Fatal(err)
	}
	f, err := r.Files("item")
	if err != nil || f.Data != data || f.Plugins != plugins {
		t.Fatalf("read state: %#v %v", f, err)
	}
	if err := r.PutState("item", "rows: []\n", "bindings: []"); err != nil {
		t.Fatal(err)
	}
	dir, _ := r.Dir("item")
	if _, err := os.Stat(filepath.Join(dir, "item_plugins.yaml")); !os.IsNotExist(err) {
		t.Fatalf("bindings not removed: %v", err)
	}
	for _, id := range []string{"../item", "missing"} {
		if err := r.PutState(id, data, plugins); err == nil {
			t.Fatalf("accepted %s", id)
		}
	}
}

func TestStateRollsBackWhenSecondReplaceFails(t *testing.T) {
	r := excelTestRoot(t)
	dir, _ := r.Dir("item")
	oldData, oldPlugins := "rows: []\n", "bindings: []\n"
	if err := r.PutPlugins("item", "bindings:\n  - plugin: old\n"); err != nil {
		t.Fatal(err)
	}
	oldPlugins = "bindings:\n  - plugin: old\n"
	want := errors.New("模拟插件文件替换失败")
	err := putStateFiles(dir, "item", "rows: [{id: new}]\n", "bindings: [{plugin: new}]\n", func(from, to string) error {
		if strings.HasSuffix(to, "_plugins.yaml") {
			return want
		}
		return os.Rename(from, to)
	})
	if !errors.Is(err, want) {
		t.Fatalf("expected write error: %v", err)
	}
	f, err := r.Files("item")
	if err != nil || f.Data != oldData || f.Plugins != oldPlugins {
		t.Fatalf("rollback: %#v %v", f, err)
	}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".state-") {
			t.Fatal("temporary file left behind")
		}
	}
}

func TestStatePreparationFailureLeavesDataUnchanged(t *testing.T) {
	r := excelTestRoot(t)
	dir, _ := r.Dir("item")
	if err := os.Mkdir(filepath.Join(dir, "item_plugins.yaml"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := r.PutState("item", "new data", "new binding"); err == nil {
		t.Fatal("accepted non-file target")
	}
	data, _ := os.ReadFile(filepath.Join(dir, "item_data.yaml"))
	if string(data) != "rows: []\n" {
		t.Fatal("preparation modified data")
	}
}

func TestStateRejectsSymlinkEscapes(t *testing.T) {
	r := excelTestRoot(t)
	outside := t.TempDir()
	if err := WriteText(outside, "escape", "struct.yaml", "rows: []\n"); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(r.Path, "escape")); err != nil {
		t.Skipf("system cannot create symlinks: %v", err)
	}
	if err := r.PutState("escape", "changed", "changed"); !errors.Is(err, ErrEscape) {
		t.Fatalf("directory escape accepted: %v", err)
	}
	dir, _ := r.Dir("item")
	path := filepath.Join(outside, "external.yaml")
	if err := os.WriteFile(path, []byte("original"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(path, filepath.Join(dir, "item_plugins.yaml")); err != nil {
		t.Fatal(err)
	}
	if err := r.PutState("item", "changed", "changed"); !errors.Is(err, ErrEscape) {
		t.Fatalf("file escape accepted: %v", err)
	}
	data, _ := os.ReadFile(filepath.Join(dir, "item_data.yaml"))
	external, _ := os.ReadFile(path)
	if string(data) != "rows: []\n" || string(external) != "original" {
		t.Fatal("escape changed files")
	}
}
