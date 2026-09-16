package tables

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestHistoryKindOfFile(t *testing.T) {
	if got := historyKindOfFile("item", "item/item_struct.yaml"); got != ModeStruct {
		t.Fatalf("struct %s", got)
	}
	if got := historyKindOfFile("item", `trunk\item\item_editor.js`); got != ModeStruct {
		t.Fatalf("editor %s", got)
	}
	if got := historyKindOfFile("item", "item_checker.js"); got != ModeCheck {
		t.Fatalf("check %s", got)
	}
	if got := historyKindOfFile("item", "item_export.js"); got != ModeExport {
		t.Fatalf("export %s", got)
	}
	if got := historyKindOfFile("item", "item_data.yaml"); got != ModeData {
		t.Fatalf("data %s", got)
	}
	if got := historyKindOfFile("item", "item_docs.md"); got != "" {
		t.Fatalf("docs %s", got)
	}
}

func TestParseGitLogFiltersKinds(t *testing.T) {
	raw := "COMMIT aaa\x1fAlice\x1f2026-09-16T10:00:00+08:00\x1f改结构\nitem/item_struct.yaml\nitem/item_editor.js\n\nCOMMIT bbb\x1fBob\x1f2026-09-16T11:00:00+08:00\x1f改数据\nitem/item_data.yaml\n"
	all := parseGitLog(raw, "item", NormalizeHistoryKinds(nil))
	if len(all) != 2 || all[0].Author != "Alice" || all[1].Author != "Bob" {
		t.Fatalf("%#v", all)
	}
	if strings.Join(all[0].Kinds, ",") != "struct" || strings.Join(all[1].Kinds, ",") != "data" {
		t.Fatalf("kinds %#v", all)
	}
	onlyData := parseGitLog(raw, "item", []string{ModeData})
	if len(onlyData) != 1 || onlyData[0].ID != "bbb" {
		t.Fatalf("data %#v", onlyData)
	}
}

func TestParseSvnLog(t *testing.T) {
	raw := `<?xml version="1.0"?>
<log>
<logentry revision="12">
<author>carol</author>
<date>2026-09-16T03:00:00.000000Z</date>
<msg>检查器</msg>
<paths>
<path action="M">/design/item/item_checker.js</path>
</paths>
</logentry>
</log>`
	got := parseSvnLog(raw, "item", []string{ModeCheck})
	if len(got) != 1 || got[0].Author != "carol" || got[0].ID != "12" || got[0].Kinds[0] != ModeCheck {
		t.Fatalf("%#v", got)
	}
}

func TestGitHistoryFromRepo(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not installed")
	}
	root := t.TempDir()
	r, err := SeedRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = root
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=Tester", "GIT_AUTHOR_EMAIL=t@example.com", "GIT_COMMITTER_NAME=Tester", "GIT_COMMITTER_EMAIL=t@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v %s", args, err, out)
		}
	}
	run("init")
	run("add", ".")
	run("-c", "user.name=Tester", "-c", "user.email=t@example.com", "commit", "-m", "初始五件套")
	if err := r.PutData("item", "rows:\n  - id: sword\n    name: 钢剑\n"); err != nil {
		t.Fatal(err)
	}
	run("add", filepath.Join("item", "item_data.yaml"))
	run("-c", "user.name=Tester", "-c", "user.email=t@example.com", "commit", "-m", "改数值")

	hist, err := r.History("item", nil)
	if err != nil {
		t.Fatal(err)
	}
	if hist.VCS != "git" || len(hist.Entries) < 2 {
		t.Fatalf("%#v", hist)
	}
	if hist.Entries[0].Author == "" || hist.Entries[0].When == "" {
		t.Fatalf("missing author/when %#v", hist.Entries[0])
	}
	dataOnly, err := r.History("item", []string{ModeData})
	if err != nil {
		t.Fatal(err)
	}
	if len(dataOnly.Entries) == 0 || !strings.Contains(dataOnly.Entries[0].Message, "改数值") {
		t.Fatalf("data %#v", dataOnly)
	}
}

func TestHistoryWithoutVCS(t *testing.T) {
	r, err := SeedRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	hist, err := r.History("item", nil)
	if err != nil {
		t.Fatal(err)
	}
	if hist.VCS != "" || len(hist.Entries) != 0 {
		t.Fatalf("%#v", hist)
	}
}
