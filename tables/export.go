package tables

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type ExportFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

func (r *Root) ExportDir() string {
	return filepath.Join(filepath.Dir(r.Path), "export")
}

func SanitizeExportName(name string) (string, error) {
	raw := strings.TrimSpace(name)
	if raw == "" {
		return "", errors.New("文件名为空")
	}
	raw = strings.ReplaceAll(raw, "\\", "/")
	if filepath.IsAbs(raw) || strings.ContainsAny(raw, ":") {
		return "", errors.New("导出文件名无效")
	}
	parts := strings.Split(raw, "/")
	clean := make([]string, 0, len(parts))
	for _, part := range parts {
		if p := strings.TrimSpace(part); p != "" && p != "." {
			if p == ".." {
				return "", ErrEscape
			}
			clean = append(clean, p)
		}
	}
	if len(clean) == 0 {
		return "", errors.New("文件名为空")
	}
	return strings.Join(clean, "/"), nil
}

func (r *Root) WriteExportFiles(files []ExportFile) ([]string, error) {
	dir := r.ExportDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	written := make([]string, 0, len(files))
	for _, file := range files {
		rel, err := SanitizeExportName(file.Name)
		if err != nil {
			return written, err
		}
		dest := filepath.Join(dir, filepath.FromSlash(rel))
		check, err := filepath.Rel(dir, dest)
		if err != nil || relEscape(check) {
			return written, ErrEscape
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return written, err
		}
		if err := os.WriteFile(dest, []byte(file.Content), 0o644); err != nil {
			return written, err
		}
		written = append(written, rel)
	}
	return written, nil
}

func relEscape(rel string) bool {
	return rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel)
}
