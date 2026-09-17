package tables

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	demotpl "github.com/xcoding1024/bit-tables/demo"
)

// SeedDemoProject 向 projectDir 写入完整示例项目（tables/、src/、res/、导表脚本）。
func SeedDemoProject(projectDir string) error {
	abs, err := filepath.Abs(projectDir)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return err
	}
	return fs.WalkDir(demotpl.TemplateFS, ".", func(name string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if name == "." {
			return nil
		}
		// embed paths use forward slashes
		rel := filepath.FromSlash(name)
		dest := filepath.Join(abs, rel)
		if d.IsDir() {
			return os.MkdirAll(dest, 0o755)
		}
		b, err := demotpl.TemplateFS.ReadFile(name)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		mode := os.FileMode(0o644)
		base := filepath.Base(rel)
		if base == "export.sh" || strings.HasSuffix(base, ".sh") {
			mode = 0o755
		}
		return os.WriteFile(dest, b, mode)
	})
}

// SeedSampleRoot 为空配表根写入示例：目录名为 tables 时在上一级写入完整示例项目，否则写入 item 表。
func SeedSampleRoot(tablesRoot string) error {
	abs, err := filepath.Abs(tablesRoot)
	if err != nil {
		return err
	}
	if filepath.Base(abs) == "tables" {
		return SeedDemoProject(filepath.Dir(abs))
	}
	r, err := Open(abs)
	if err != nil {
		return err
	}
	return r.SeedItem("item")
}
