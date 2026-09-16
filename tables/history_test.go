package tables

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAppendHistoryDoesNotLeakSections(t *testing.T) {
	dir := t.TempDir()
	if err := EnsureHistory(dir, "skill"); err != nil {
		t.Fatal(err)
	}
	if err := AppendHistory(dir, "skill", ModeStruct, "demo", "生成技能表", "已生成四件套", "2026-09-16 10:00:00 +08:00"); err != nil {
		t.Fatal(err)
	}
	if err := AppendHistory(dir, "skill", ModeData, "demo", "加一行", "已更新数据", "2026-09-16 10:01:00 +08:00"); err != nil {
		t.Fatal(err)
	}
	raw, ok := ReadHistory(dir)
	if !ok {
		t.Fatal("missing history")
	}
	_, structBody, dataBody := SplitHistory(raw, "skill")
	if !strings.Contains(structBody, "生成技能表") || !strings.Contains(structBody, "已生成四件套") {
		t.Fatalf("struct %s", structBody)
	}
	if strings.Contains(dataBody, "生成技能表") {
		t.Fatalf("struct leaked: %s", dataBody)
	}
	if !strings.Contains(dataBody, "加一行") || strings.Contains(structBody, "加一行") {
		t.Fatalf("data/struct mix %s / %s", dataBody, structBody)
	}
}

func TestHistorySectionParse(t *testing.T) {
	dir := t.TempDir()
	if err := AppendHistory(dir, "item", ModeData, "alice", "改名", "好", "2026-01-02 15:04:05 +08:00"); err != nil {
		t.Fatal(err)
	}
	raw, _ := ReadHistory(dir)
	sec := HistorySection(raw, ModeData)
	if !strings.Contains(sec, "改名") {
		t.Fatalf("section %s", sec)
	}
	if HistorySection(raw, ModeStruct) != "" {
		t.Fatalf("unexpected struct: %s", HistorySection(raw, ModeStruct))
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
	if !files.Complete || !strings.Contains(files.Data, "sword") || !strings.Contains(files.Editor, "BitTableEditor") {
		t.Fatalf("fixture %#v", files)
	}
	if !strings.Contains(files.History, "## 结构") {
		t.Fatalf("history %s", files.History)
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
