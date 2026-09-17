package tables

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSeedDemoProject(t *testing.T) {
	project := t.TempDir()
	tablesRoot := filepath.Join(project, "tables")
	if err := os.MkdirAll(tablesRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := SeedSampleRoot(tablesRoot); err != nil {
		t.Fatal(err)
	}
	root, err := Open(tablesRoot)
	if err != nil {
		t.Fatal(err)
	}
	list, err := root.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) < 3 {
		t.Fatalf("demo tables %#v", list)
	}
	ids := map[string]bool{}
	for _, item := range list {
		ids[item.ID] = true
	}
	for _, id := range []string{"sheet_demo", "enum_demo", "chart_demo"} {
		if !ids[id] {
			t.Fatalf("missing %s in %#v", id, list)
		}
	}
	for _, rel := range []string{
		"src/editor.ts",
		"src/export.ts",
		"res/ATTRIBUTION.txt",
		"export.mjs",
		"package.json",
		"package-lock.json",
		"tsconfig.json",
	} {
		if _, err := os.Stat(filepath.Join(project, filepath.FromSlash(rel))); err != nil {
			t.Fatalf("missing %s: %v", rel, err)
		}
	}
}

func TestSeedSampleRootLegacyItem(t *testing.T) {
	dir := t.TempDir()
	if err := SeedSampleRoot(dir); err != nil {
		t.Fatal(err)
	}
	root, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	list, err := root.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ID != "item" {
		t.Fatalf("legacy %#v", list)
	}
}
