package tables

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func snapshotContains(js, value string) bool {
	quoted := strconv.QuoteToASCII(value)
	return strings.Contains(js, value) || strings.Contains(strings.ToLower(js), strings.ToLower(quoted[1:len(quoted)-1]))
}

func snapshotTestRun(t *testing.T, dir, program string, args ...string) string {
	t.Helper()
	cmd := exec.Command(program, args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "GIT_AUTHOR_NAME=验收", "GIT_AUTHOR_EMAIL=test@example.invalid", "GIT_COMMITTER_NAME=验收", "GIT_COMMITTER_EMAIL=test@example.invalid")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("%s %v: %v %s", program, args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func TestSnapshotGitReadsRawDocumentsWithoutWriting(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("缺少 git")
	}
	dir := t.TempDir()
	rootPath := filepath.Join(dir, "tables")
	if err := SeedDiffFixture(rootPath, 0); err != nil {
		t.Fatal(err)
	}
	snapshotTestRun(t, dir, "git", "init")
	snapshotTestRun(t, dir, "git", "add", ".")
	snapshotTestRun(t, dir, "git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "-m", "初始配置")
	first := snapshotTestRun(t, dir, "git", "rev-parse", "HEAD")
	if err := SeedDiffFixture(rootPath, 1); err != nil {
		t.Fatal(err)
	}
	snapshotTestRun(t, dir, "git", "add", ".")
	snapshotTestRun(t, dir, "git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "-m", "修改数值")
	last := snapshotTestRun(t, dir, "git", "rev-parse", "HEAD")
	if err := SeedDiffFixture(rootPath, 2); err != nil {
		t.Fatal(err)
	}
	before := snapshotTestRun(t, dir, "git", "status", "--porcelain")
	root, _ := Open(rootPath)
	for _, tc := range []struct{ ref, hash, contains string }{{"base", last, "历史铁剑"}, {first, first, "铁剑"}} {
		got, err := root.Snapshot(context.Background(), "diff_demo", tc.ref)
		if err != nil || got.VCS != "git" || got.Revision != tc.hash || got.Struct == nil || got.Data == nil || !strings.Contains(*got.Data, tc.contains) || strings.Contains(*got.Data, "本地铁剑") {
			t.Fatalf("快照错误: %#v %v", got, err)
		}
	}
	for _, tc := range []struct{ ref, label string }{{"base", "历史卡片"}, {first, "初版卡片"}, {"local", "本地卡片"}} {
		js, err := root.ComparisonScript(context.Background(), "diff_demo", tc.ref)
		if err != nil || !snapshotContains(js, tc.label) || (tc.ref != "local" && snapshotContains(js, "本地卡片")) {
			t.Fatalf("没有使用各自版本的 editor 与依赖: %s %v", tc.ref, err)
		}
	}
	for _, tc := range []struct{ ref, value string }{{first, "stage-0"}, {"base", "stage-1"}, {"local", "stage-2"}} {
		asset, err := root.ComparisonAsset(context.Background(), "diff_demo", tc.ref, "./diff_badge.svg")
		if err != nil || !strings.Contains(string(asset), tc.value) {
			t.Fatalf("图片没有使用对应版本: %s %v", tc.ref, err)
		}
	}
	if _, err := root.ComparisonAsset(context.Background(), "diff_demo", "base", "../../outside"); err == nil {
		t.Fatal("版本资源接受越界路径")
	}
	for _, ref := range []string{"--help", "HEAD", "main", "../../escape", strings.Repeat("f", 40)} {
		if _, err := root.Snapshot(context.Background(), "diff_demo", ref); err == nil {
			t.Fatalf("接受了无效版本 %s", ref)
		}
	}
	newDir := filepath.Join(rootPath, "new_table")
	if err := os.Mkdir(newDir, 0o755); err != nil {
		t.Fatal(err)
	}
	got, err := root.Snapshot(context.Background(), "new_table", first)
	if err != nil || got.Data != nil || got.Struct != nil {
		t.Fatalf("尚不存在的表未返回缺失: %#v %v", got, err)
	}
	if after := snapshotTestRun(t, dir, "git", "status", "--porcelain", "--untracked-files=no"); strings.TrimSpace(strings.ReplaceAll(before, "?? tables/new_table/", "")) != after {
		t.Fatalf("读取改变工作区: %q %q", before, after)
	}
}

func TestSnapshotSVNBaseAndCopyHistory(t *testing.T) {
	for _, program := range []string{"svn", "svnadmin"} {
		if _, err := exec.LookPath(program); err != nil {
			t.Skip("缺少 " + program)
		}
	}
	base := t.TempDir()
	remote, seed, work := filepath.Join(base, "remote"), filepath.Join(base, "seed"), filepath.Join(base, "work")
	if err := SeedDiffFixture(filepath.Join(seed, "trunk", "tables"), 0); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(seed, "branches"), 0o755); err != nil {
		t.Fatal(err)
	}
	snapshotTestRun(t, base, "svnadmin", "create", remote)
	repoURL := "file:///" + strings.TrimPrefix(filepath.ToSlash(remote), "/")
	snapshotTestRun(t, base, "svn", "import", seed, repoURL, "-m", "初始配置", "--non-interactive")
	snapshotTestRun(t, base, "svn", "copy", repoURL+"/trunk", repoURL+"/branches/release", "-m", "创建验收分支", "--non-interactive")
	snapshotTestRun(t, base, "svn", "checkout", repoURL, work, "--non-interactive")
	path := filepath.Join(work, "branches", "release", "tables")
	if err := SeedDiffFixture(path, 2); err != nil {
		t.Fatal(err)
	}
	root, _ := Open(path)
	before := snapshotTestRun(t, work, "svn", "status")
	for _, ref := range []string{"base", "1", "2"} {
		got, err := root.Snapshot(context.Background(), "diff_demo", ref)
		if err != nil || got.VCS != "svn" || got.Struct == nil || got.Data == nil || strings.Contains(*got.Data, "本地铁剑") || !strings.Contains(*got.Data, "铁剑") {
			t.Fatalf("SVN 快照错误 %s: %#v %v", ref, got, err)
		}
		if ref == "base" && (got.Revision != "BASE" || got.FileRevisions["data.yaml"] != "2") {
			t.Fatalf("未返回确定的 BASE 版本: %#v", got)
		}
		js, err := root.ComparisonScript(context.Background(), "diff_demo", ref)
		if err != nil || !snapshotContains(js, "初版卡片") || snapshotContains(js, "本地卡片") {
			t.Fatalf("SVN 没有追溯 editor 或依赖历史: %s %v", ref, err)
		}
	}
	for _, ref := range []string{"--help", "0", "HEAD", "99999"} {
		if _, err := root.Snapshot(context.Background(), "diff_demo", ref); err == nil {
			t.Fatalf("接受无效 SVN 版本 %s", ref)
		}
	}
	newDir := filepath.Join(path, "future")
	if err := os.MkdirAll(newDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(newDir, "future_struct.yaml"), []byte("fields: []\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	snapshotTestRun(t, work, "svn", "add", newDir)
	snapshotTestRun(t, work, "svn", "commit", newDir, "-m", "新建配置表", "--non-interactive")
	got, err := root.Snapshot(context.Background(), "future", "1")
	if err != nil || got.Struct != nil || got.Data != nil {
		t.Fatalf("尚未创建的表处理错误: %#v %v", got, err)
	}
	got, err = root.Snapshot(context.Background(), "future", "base")
	if err != nil || got.Struct == nil || got.Data != nil {
		t.Fatalf("缺失数据文件的 BASE 处理错误: %#v %v", got, err)
	}
	dataFile := filepath.Join(newDir, "future_data.yaml")
	if err := os.WriteFile(dataFile, []byte("rows: []\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	snapshotTestRun(t, work, "svn", "add", dataFile)
	snapshotTestRun(t, work, "svn", "commit", dataFile, "-m", "增加数据文档", "--non-interactive")
	dataRevision := snapshotTestRun(t, work, "svn", "info", "--show-item", "revision", dataFile)
	got, err = root.Snapshot(context.Background(), "future", dataRevision)
	if err != nil || got.Data == nil || *got.Data != "rows: []\n" {
		t.Fatalf("工作副本目录版本较旧时没有读取新版本文件: %#v %v", got, err)
	}
	if after := snapshotTestRun(t, work, "svn", "status"); before != after {
		t.Fatalf("快照改变原有文件: %s %s", before, after)
	}
	dependency := filepath.Join(path, "diff_demo", "diff_layout.ts")
	snapshotTestRun(t, work, "svn", "delete", "--force", dependency)
	snapshotTestRun(t, work, "svn", "commit", dependency, "-m", "删除分支依赖", "--non-interactive")
	snapshotTestRun(t, work, "svn", "update", path, "--non-interactive")
	js, err := root.SnapshotEditor(context.Background(), "diff_demo", "1")
	if err != nil || !snapshotContains(js, "初版卡片") {
		t.Fatalf("当前已删除的依赖未从分支祖先版本还原: %v", err)
	}
}

func TestComparisonDoesNotReplaceMissingHistoricalImportsWithLocalFiles(t *testing.T) {
	dir := t.TempDir()
	if err := SeedDiffFixture(dir, 0); err != nil {
		t.Fatal(err)
	}
	snapshotTestRun(t, dir, "git", "init")
	snapshotTestRun(t, dir, "git", "add", ".")
	snapshotTestRun(t, dir, "git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "-m", "验收历史依赖")
	file := filepath.Join(dir, "diff_demo", "diff_layout.ts")
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	snapshotTestRun(t, dir, "git", "add", ".")
	snapshotTestRun(t, dir, "git", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=", "commit", "-m", "移除历史依赖")
	if err := os.WriteFile(file, []byte("export const layoutLabel = '本地补齐';"), 0o644); err != nil {
		t.Fatal(err)
	}
	root, _ := Open(dir)
	if _, err := root.SnapshotEditor(context.Background(), "diff_demo", "base"); err == nil {
		t.Fatal("历史编译静默使用了本地依赖")
	}
}

func TestSnapshotRejectsEscapeAndCancellation(t *testing.T) {
	dir := t.TempDir()
	root, err := SeedRoot(dir)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := root.Snapshot(context.Background(), "../escape", "base"); err == nil {
		t.Fatal("接受越界表路径")
	}
	if _, err := root.Snapshot(context.Background(), "item", "base"); err == nil {
		t.Fatal("普通目录没有返回错误")
	}
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(dir, "escape")); err == nil {
		if _, err := root.Snapshot(context.Background(), "escape", "base"); err != ErrEscape {
			t.Fatalf("接受目录符号链接越界: %v", err)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := snapshotCommand(ctx, dir, "git", "--version"); err == nil {
		t.Fatal("取消请求未停止版本读取")
	}
}

func TestSnapshotBaselineRemainsAvailableWhenHistoryFails(t *testing.T) {
	if _, err := exec.LookPath("svn"); err != nil {
		t.Skip("缺少 svn")
	}
	root, err := SeedRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root.Path, ".svn"), 0o755); err != nil {
		t.Fatal(err)
	}
	history, err := root.History("item", nil)
	if err != nil || history.VCS != "svn" || history.Error == "" || history.Entries == nil {
		t.Fatalf("历史读取失败丢失了仓库类型或错误: %#v %v", history, err)
	}
}
