package tables

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDocsSectionParse(t *testing.T) {
	text := "# skill\n\n## 结构\n\n字段 id/name\n\n## 检查规则\n\nid 必填\n\n## 导出规则\n\n导出 skill.json\n"
	if got := DocsSection(text, ModeStruct); got != "字段 id/name" {
		t.Fatalf("struct %q", got)
	}
	if got := DocsSection(text, ModeCheck); got != "id 必填" {
		t.Fatalf("check %q", got)
	}
	if got := DocsSection(text, ModeExport); got != "导出 skill.json" {
		t.Fatalf("export %q", got)
	}
	if DocsSection(text, "missing") != "字段 id/name" {
		t.Fatalf("default kind should be struct")
	}
}

func TestEnsureDocsTemplate(t *testing.T) {
	dir := t.TempDir()
	if err := EnsureDocs(dir, "skill"); err != nil {
		t.Fatal(err)
	}
	raw, ok := ReadDocs(dir, "skill")
	if !ok {
		t.Fatal("missing docs")
	}
	if !strings.Contains(raw, "## 结构") || !strings.Contains(raw, "## 检查规则") || !strings.Contains(raw, "## 导出规则") {
		t.Fatalf("template %s", raw)
	}
	if DocsSection(raw, ModeStruct) != "" || DocsSection(raw, ModeCheck) != "" || DocsSection(raw, ModeExport) != "" {
		t.Fatalf("empty sections should be blank: %s", raw)
	}
}

func TestRootRejectsEscapeID(t *testing.T) {
	r, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := r.Dir("../etc"); err != ErrBadID {
		t.Fatalf("dir %v", err)
	}
	if _, err := r.Create("../etc"); err != ErrBadID {
		t.Fatalf("create %v", err)
	}
}

func TestSeedItemAndPutData(t *testing.T) {
	root := t.TempDir()
	r, err := SeedRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	files, err := r.Files("item")
	if err != nil {
		t.Fatal(err)
	}
	if !files.Complete || !files.HasExport || !files.HasDocs {
		t.Fatalf("fixture %#v", files.Info)
	}
	if !strings.Contains(files.Data, "sword") || !strings.Contains(files.Editor, "BitTableEditor") {
		t.Fatalf("fixture %#v", files)
	}
	if !strings.Contains(files.Export, "BitTableExporter") {
		t.Fatalf("export %s", files.Export)
	}
	if !strings.Contains(files.Docs, "## 结构") || !strings.Contains(files.Docs, "## 检查规则") || !strings.Contains(files.Docs, "## 导出规则") {
		t.Fatalf("docs %s", files.Docs)
	}
	if err := r.PutData("item", "rows:\n  - id: sword\n    name: 钢剑\n"); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(root, "item", "item_data.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(b), "钢剑") {
		t.Fatalf("saved %s", b)
	}
}
