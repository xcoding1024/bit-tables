package tables

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSeasonTableCreation(t *testing.T) {
	for _, enabled := range []bool{false, true} {
		project := t.TempDir()
		rootPath := filepath.Join(project, "tables")
		if err := os.MkdirAll(rootPath, 0o755); err != nil {
			t.Fatal(err)
		}
		root, err := Open(rootPath)
		if err != nil {
			t.Fatal(err)
		}
		info, err := root.Create("item", enabled)
		if err != nil {
			t.Fatal(err)
		}
		if !info.Complete {
			t.Fatalf("新表五件套不完整: %#v", info)
		}
		files, err := root.Files("item")
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(files.Struct, "key: $season") != enabled {
			t.Fatal(files.Struct)
		}
		flag := "multi_season: false"
		if enabled {
			flag = "multi_season: true"
		}
		if !strings.Contains(files.Struct, flag) {
			t.Fatal(files.Struct)
		}
		dir, _ := root.Dir("item")
		for _, kind := range []string{"editor", "checker", "export"} {
			if _, ok, err := root.loadTableScript(dir, "item", kind); err != nil || !ok {
				t.Fatalf("%s: %v", kind, err)
			}
		}
	}
}

func TestSeasonDemoFixture(t *testing.T) {
	project := t.TempDir()
	if err := SeedDemoProject(project); err != nil {
		t.Fatal(err)
	}
	root, err := Open(filepath.Join(project, "tables"))
	if err != nil {
		t.Fatal(err)
	}
	files, err := root.Files("season_demo")
	if err != nil {
		t.Fatal(err)
	}
	if !files.Complete || !strings.Contains(files.Data, "[10200~]") {
		t.Fatalf("缺少赛季夹具: %#v", files.Info)
	}
}
