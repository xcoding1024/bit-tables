package acceptance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

func root(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("无法定位测试目录")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", ".."))
}

func TestTutorialStructureAndLinks(t *testing.T) {
	repo := root(t)
	site := filepath.Join(repo, "docs", "site")
	required := []string{
		"index.md",
		"getting-started/installation.md",
		"getting-started/first-project.md",
		"concepts/demo-project.md",
		"concepts/file-structure.md",
		"guides/workbench.md",
		"guides/editing.md",
		"guides/sheets-excel.md",
		"guides/plugins.md",
		"guides/validation-export.md",
		"guides/project-tools.md",
		"guides/history.md",
		"guides/ai-workflow.md",
		"reference/shortcuts.md",
		"reference/troubleshooting.md",
	}
	for _, name := range required {
		if _, err := os.Stat(filepath.Join(site, filepath.FromSlash(name))); err != nil {
			t.Errorf("缺少教程页面 %s: %v", name, err)
		}
	}

	linkPattern := regexp.MustCompile(`\]\((/[^)#?]+)(?:#[^)]+)?\)`)
	err := filepath.WalkDir(site, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() || filepath.Ext(path) != ".md" {
			return walkErr
		}
		body, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		content := string(body)
		if strings.Contains(strings.ToLower(content), "xq-common") {
			t.Errorf("用户教程不得引用 xq-common: %s", path)
		}
		for _, match := range linkPattern.FindAllStringSubmatch(content, -1) {
			target := strings.TrimSuffix(match[1], "/")
			if target == "" || strings.HasPrefix(target, "/demos/") {
				continue
			}
			candidate := filepath.Join(site, filepath.FromSlash(strings.TrimPrefix(target, "/"))+".md")
			if _, err := os.Stat(candidate); err != nil {
				t.Errorf("%s 引用了不存在的页面 %s", path, match[1])
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestTutorialUsesOwnDemoAndAssets(t *testing.T) {
	repo := root(t)
	for _, table := range []string{"sheet_demo", "chart_demo", "enum_demo", "fill_demo", "fill_source"} {
		if _, err := os.Stat(filepath.Join(repo, "demo", "tables", table, table+"_struct.yaml")); err != nil {
			t.Errorf("缺少教程引用的自有示例 %s: %v", table, err)
		}
	}
	assets := []string{
		"workbench.gif", "sheets-and-charts.gif", "navigation.png", "editing-fill.gif", "editing-toolbar.png",
		"excel-source.png", "plugin-binding.png", "check-menu.png", "export-result.png", "enums.png", "dependencies.png", "templates.png",
	}
	for _, name := range assets {
		info, err := os.Stat(filepath.Join(repo, "docs", "site", "public", "demos", name))
		if err != nil {
			t.Errorf("缺少教程素材 %s: %v", name, err)
			continue
		}
		if info.Size() < 1024 {
			t.Errorf("教程素材 %s 文件异常小: %d bytes", name, info.Size())
		}
	}
	script, err := os.ReadFile(filepath.Join(repo, "docs", "scripts", "capture-demos.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	content := string(script)
	for _, phrase := range []string{"sourceDemo", "bit-tables-docs-", "prepareFixture", "removeTemp", "拒绝删除非预期临时目录"} {
		if !strings.Contains(content, phrase) {
			t.Errorf("录制脚本缺少安全约定 %q", phrase)
		}
	}
}

func TestDocsScriptsAndCoverage(t *testing.T) {
	repo := root(t)
	body, err := os.ReadFile(filepath.Join(repo, "docs", "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal(body, &pkg); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"dev", "build", "test:e2e", "capture:demos"} {
		if strings.TrimSpace(pkg.Scripts[name]) == "" {
			t.Errorf("docs/package.json 缺少 %s", name)
		}
	}

	wants := map[string][]string{
		"guides/editing.md":           {"fill_demo", "向下填充", "批量修改", "Ctrl/Cmd+Shift+C"},
		"guides/sheets-excel.md":      {"sheet_demo", "chart_demo", "只读", "公式"},
		"guides/plugins.md":           {"_plugins.yaml", "整列", "解除绑定"},
		"guides/validation-export.md": {"检查所有配置表", "build/client", "build/server"},
		"guides/project-tools.md":     {"enum_demo", "依赖关系", "编辑模板"},
		"guides/ai-workflow.md":       {"只修改", "检查所有配置表", "解决冲突"},
	}
	for name, phrases := range wants {
		content, err := os.ReadFile(filepath.Join(repo, "docs", "site", filepath.FromSlash(name)))
		if err != nil {
			t.Errorf("无法读取 %s: %v", name, err)
			continue
		}
		for _, phrase := range phrases {
			if !strings.Contains(string(content), phrase) {
				t.Errorf("教程 %s 缺少关键内容 %q", name, phrase)
			}
		}
	}
}
