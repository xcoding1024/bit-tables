package tables

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	demotpl "github.com/xcoding1024/bit-tables/demo"
)

// SeedDemoProject writes a full sample project (same layout as repo demo/) into projectDir:
// tables/, src/, res/, and export scripts. projectDir must be empty or only contain an empty tables/.
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

// SeedSampleRoot seeds an empty tables root. If the directory is named "tables",
// it writes a full demo-like project into the parent directory; otherwise it writes
// the legacy single item table into this root.
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
