package tables

import (
	"os"
	"path/filepath"
	"strings"
)

const (
	docsSectionStruct = "结构"
	docsSectionCheck  = "检查规则"
	docsSectionExport = "导出规则"
)

func DocsPath(dir, tableID string) string {
	return filepath.Join(dir, FileName(tableID, "docs.md"))
}

func EmptyDocs(tableID string) string {
	return "# " + tableID + "\n\n## " + docsSectionStruct + "\n\n## " + docsSectionCheck + "\n\n## " + docsSectionExport + "\n"
}

func ReadDocs(dir, tableID string) (string, bool) {
	return readFile(dir, tableID, "docs.md")
}

func EnsureDocs(dir, tableID string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path := DocsPath(dir, tableID)
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	return os.WriteFile(path, []byte(EmptyDocs(tableID)), 0o644)
}

func docsHeading(kind string) string {
	switch kind {
	case ModeCheck:
		return "## " + docsSectionCheck
	case ModeExport:
		return "## " + docsSectionExport
	default:
		return "## " + docsSectionStruct
	}
}

func DocsSection(text, kind string) string {
	src := strings.ReplaceAll(text, "\r\n", "\n")
	heading := docsHeading(kind)
	start := strings.Index(src, heading)
	if start < 0 {
		return ""
	}
	body := src[start+len(heading):]
	if cut := strings.Index(body, "\n## "); cut >= 0 {
		body = body[:cut]
	}
	return strings.TrimSpace(body)
}
