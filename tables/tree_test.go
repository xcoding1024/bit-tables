package tables

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTable(t *testing.T, dir, id string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, id+"_struct.yaml"), []byte("id: "+id+"\n"), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestListTreeRecognizesStructOnly(t *testing.T) {
	root := t.TempDir()
	writeTable(t, filepath.Join(root, "item"), "item")
	writeTable(t, filepath.Join(root, "combat", "skill"), "skill")
	if err := os.MkdirAll(filepath.Join(root, "notes"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "notes", "readme.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "orphan"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "orphan", "orphan_data.yaml"), []byte("rows: []\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, ".hidden", "ghost"), 0o755); err != nil {
		t.Fatal(err)
	}
	writeTable(t, filepath.Join(root, ".hidden", "ghost"), "ghost")

	r, err := Open(root)
	if err != nil {
		t.Fatal(err)
	}
	list, err := r.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("list %#v", list)
	}
	if list[0].ID != "skill" || list[0].Path != "combat/skill" || !list[0].HasStruct {
		t.Fatalf("nested %#v", list[0])
	}
	if list[1].ID != "item" || list[1].Path != "item" {
		t.Fatalf("root table %#v", list[1])
	}

	tree, err := r.Tree()
	if err != nil {
		t.Fatal(err)
	}
	if len(tree) != 4 {
		t.Fatalf("tree %#v", tree)
	}
	if tree[0].Kind != "dir" || tree[0].Name != "combat" || len(tree[0].Children) != 1 || tree[0].Children[0].Kind != "table" || tree[0].Children[0].Table.ID != "skill" {
		t.Fatalf("combat %#v", tree[0])
	}
	if tree[1].Kind != "dir" || tree[1].Name != "notes" || len(tree[1].Children) != 0 {
		t.Fatalf("notes %#v", tree[1])
	}
	if tree[2].Kind != "dir" || tree[2].Name != "orphan" {
		t.Fatalf("orphan should be a folder %#v", tree[2])
	}
	if tree[3].Kind != "table" || tree[3].Name != "item" {
		t.Fatalf("item %#v", tree[3])
	}

	dir, err := r.Dir("skill")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(filepath.Dir(dir)) != "combat" {
		t.Fatalf("dir %s", dir)
	}
	files, err := r.Files("skill")
	if err != nil {
		t.Fatal(err)
	}
	if files.Path != "combat/skill" || !files.HasStruct {
		t.Fatalf("files %#v", files.Info)
	}

	nested, err := r.Create("story/quest")
	if err != nil {
		t.Fatal(err)
	}
	if nested.ID != "quest" || nested.Path != "story/quest" || !nested.HasStruct {
		t.Fatalf("create %#v", nested)
	}
}

func TestTableIDAndValidPath(t *testing.T) {
	if TableID("combat/skill") != "skill" || TableID("item") != "item" {
		t.Fatal(TableID("combat/skill"))
	}
	if !ValidPath("combat/skill") || ValidPath("../etc") || ValidPath("combat/../skill") {
		t.Fatal("path validation")
	}
}
