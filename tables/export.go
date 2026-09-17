package tables

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

type ExportSide string

const (
	ExportSideClient ExportSide = "client"
	ExportSideServer ExportSide = "server"
)

type ExportFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type ExportWritten struct {
	Side string `json:"side"`
	Name string `json:"name"`
}

func (r *Root) ExportBaseDir() string {
	return filepath.Join(filepath.Dir(r.Path), "build")
}

func (r *Root) ExportDir(side ExportSide) string {
	return filepath.Join(r.ExportBaseDir(), string(side))
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

func (r *Root) WriteExportFiles(client, server []ExportFile) ([]ExportWritten, error) {
	written := make([]ExportWritten, 0, len(client)+len(server))
	clientNames, err := writeExportSide(r.ExportDir(ExportSideClient), client)
	if err != nil {
		return written, err
	}
	for _, name := range clientNames {
		written = append(written, ExportWritten{Side: string(ExportSideClient), Name: name})
	}
	serverNames, err := writeExportSide(r.ExportDir(ExportSideServer), server)
	if err != nil {
		return written, err
	}
	for _, name := range serverNames {
		written = append(written, ExportWritten{Side: string(ExportSideServer), Name: name})
	}
	return written, nil
}

func writeExportSide(dir string, files []ExportFile) ([]string, error) {
	if len(files) == 0 {
		return nil, nil
	}
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
