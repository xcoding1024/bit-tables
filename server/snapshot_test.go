package server

import (
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/xcoding1024/bit-tables/tables"
)

func TestSnapshotAPIReadsWindowRoot(t *testing.T) {
	dir := t.TempDir()
	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=验收", "GIT_AUTHOR_EMAIL=test@example.invalid", "GIT_COMMITTER_NAME=验收", "GIT_COMMITTER_EMAIL=test@example.invalid")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git: %v %s", err, out)
		}
	}
	rootPath := filepath.Join(dir, "tables")
	if err := tables.SeedDiffFixture(rootPath, 0); err != nil {
		t.Fatal(err)
	}
	run("init")
	run("add", ".")
	run("-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "-m", "初始配置")
	root, _ := tables.Open(rootPath)
	srv := New(root)
	defer srv.Close()
	res := httptest.NewRecorder()
	srv.Handler().ServeHTTP(res, httptest.NewRequest("GET", "/api/tables/diff_demo/snapshot?revision=base", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), `"vcs":"git"`) || res.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("快照接口失败: %d %s", res.Code, res.Body.String())
	}
	for _, target := range []string{"/api/tables/diff_demo/snapshot?revision=--help", "/api/tables/diff_demo/snapshot?rootPath=relative"} {
		res := httptest.NewRecorder()
		srv.Handler().ServeHTTP(res, httptest.NewRequest("GET", target, nil))
		if res.Code == 200 {
			t.Fatalf("错误版本或目录被接受: %s", target)
		}
	}
}
