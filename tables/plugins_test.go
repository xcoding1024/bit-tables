package tables

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestGenericPluginsJSFromDemo(t *testing.T) {
	root, err := Open(filepath.Join("..", "demo", "tables"))
	if err != nil {
		t.Fatal(err)
	}
	js := root.GenericPluginsJS()
	if !strings.Contains(js, "BitTablePlugins") {
		t.Fatalf("catalog %s", js)
	}
	if strings.Contains(js, "编译失败") {
		t.Fatalf("bundle error %s", js)
	}
	if !strings.Contains(js, "scale") {
		t.Fatalf("missing scale plugin %s", js)
	}
}

func TestTablePluginJSFromDemo(t *testing.T) {
	root, err := Open(filepath.Join("..", "demo", "tables"))
	if err != nil {
		t.Fatal(err)
	}
	dir, err := root.Dir("sheet_demo")
	if err != nil {
		t.Fatal(err)
	}
	js := root.TablePluginJS(dir, "sheet_demo")
	if strings.Contains(js, "编译失败") {
		t.Fatalf("bundle error %s", js)
	}
	if !strings.Contains(js, "sheet_demo_power") {
		t.Fatalf("missing exclusive plugin %s", js)
	}
}
