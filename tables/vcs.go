package tables

import (
	"bytes"
	"context"
	"encoding/xml"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const historyLimit = 80

type HistoryEntry struct {
	ID      string   `json:"id"`
	Author  string   `json:"author"`
	When    string   `json:"when"`
	Message string   `json:"message"`
	Kinds   []string `json:"kinds"`
}

type History struct {
	ID      string         `json:"id"`
	VCS     string         `json:"vcs"`
	Entries []HistoryEntry `json:"entries"`
}

func NormalizeHistoryKinds(kinds []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, raw := range kinds {
		k := strings.TrimSpace(raw)
		switch k {
		case ModeStruct, ModeCheck, ModeExport, ModeData:
			if !seen[k] {
				seen[k] = true
				out = append(out, k)
			}
		}
	}
	if len(out) == 0 {
		return []string{ModeStruct, ModeCheck, ModeExport, ModeData}
	}
	return out
}

func historyKindOfFile(tableID, name string) string {
	base := filepath.Base(strings.ReplaceAll(name, "\\", "/"))
	switch base {
	case FileName(tableID, "struct.yaml"), FileName(tableID, "editor.js"):
		return ModeStruct
	case FileName(tableID, "checker.js"):
		return ModeCheck
	case FileName(tableID, "export.js"):
		return ModeExport
	case FileName(tableID, "data.yaml"):
		return ModeData
	default:
		return ""
	}
}

func historyFileNames(tableID string, kinds []string) []string {
	var names []string
	for _, k := range kinds {
		switch k {
		case ModeStruct:
			names = append(names, FileName(tableID, "struct.yaml"), FileName(tableID, "editor.js"))
		case ModeCheck:
			names = append(names, FileName(tableID, "checker.js"))
		case ModeExport:
			names = append(names, FileName(tableID, "export.js"))
		case ModeData:
			names = append(names, FileName(tableID, "data.yaml"))
		}
	}
	return names
}

func findVCSRoot(start, marker string) string {
	dir := start
	for {
		if st, err := os.Stat(filepath.Join(dir, marker)); err == nil && (st.IsDir() || marker == ".git") {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

func filterHistory(entries []HistoryEntry, kinds []string) []HistoryEntry {
	want := map[string]bool{}
	for _, k := range kinds {
		want[k] = true
	}
	var out []HistoryEntry
	for _, ent := range entries {
		keep := []string{}
		for _, k := range ent.Kinds {
			if want[k] {
				keep = append(keep, k)
			}
		}
		if len(keep) == 0 {
			continue
		}
		ent.Kinds = keep
		out = append(out, ent)
	}
	if out == nil {
		out = []HistoryEntry{}
	}
	return out
}

func formatHistoryTime(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05 -0700",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t.Local().Format("2006-01-02 15:04:05")
		}
	}
	if i := strings.Index(raw, "."); i > 0 && strings.HasSuffix(raw, "Z") {
		if t, err := time.Parse("2006-01-02T15:04:05.999999Z", raw); err == nil {
			return t.Local().Format("2006-01-02 15:04:05")
		}
	}
	return raw
}

func runVCS(ctx context.Context, dir, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", err
	}
	return stdout.String(), nil
}

func (r *Root) History(id string, kinds []string) (History, error) {
	dir, err := r.Dir(id)
	if err != nil {
		return History{}, err
	}
	if _, err := os.Stat(dir); err != nil {
		return History{}, err
	}
	kinds = NormalizeHistoryKinds(kinds)
	out := History{ID: id, Entries: []HistoryEntry{}}
	gitRoot := findVCSRoot(dir, ".git")
	svnRoot := findVCSRoot(dir, ".svn")
	useGit := gitRoot != "" && (svnRoot == "" || len(gitRoot) >= len(svnRoot))
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if useGit {
		if _, err := exec.LookPath("git"); err == nil {
			out.VCS = "git"
			entries, err := gitHistory(ctx, gitRoot, dir, id, kinds)
			if err == nil {
				out.Entries = entries
			}
			return out, nil
		}
	}
	if svnRoot != "" {
		if _, err := exec.LookPath("svn"); err == nil {
			out.VCS = "svn"
			entries, err := svnHistory(ctx, svnRoot, dir, id, kinds)
			if err == nil {
				out.Entries = entries
			}
			return out, nil
		}
	}
	return out, nil
}

func gitHistory(ctx context.Context, gitRoot, tableDir, tableID string, kinds []string) ([]HistoryEntry, error) {
	var rels []string
	for _, name := range historyFileNames(tableID, kinds) {
		rel, err := filepath.Rel(gitRoot, filepath.Join(tableDir, name))
		if err != nil {
			continue
		}
		rels = append(rels, filepath.ToSlash(rel))
	}
	if len(rels) == 0 {
		return []HistoryEntry{}, nil
	}
	args := []string{"-c", "core.quotepath=false", "log", "-n", itoa(int64(historyLimit)), "--pretty=format:COMMIT %H%x1f%an%x1f%aI%x1f%s", "--name-only", "--"}
	args = append(args, rels...)
	raw, err := runVCS(ctx, gitRoot, "git", args...)
	if err != nil {
		return nil, err
	}
	return parseGitLog(raw, tableID, kinds), nil
}

func parseGitLog(raw, tableID string, kinds []string) []HistoryEntry {
	text := strings.ReplaceAll(raw, "\r\n", "\n")
	text = strings.TrimSpace(text)
	if text == "" {
		return []HistoryEntry{}
	}
	if strings.HasPrefix(text, "COMMIT ") {
		text = text[len("COMMIT "):]
	}
	var entries []HistoryEntry
	for _, block := range strings.Split(text, "\nCOMMIT ") {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}
		lines := strings.Split(block, "\n")
		fields := strings.SplitN(lines[0], "\x1f", 4)
		if len(fields) < 4 {
			continue
		}
		var kindList []string
		seen := map[string]bool{}
		for _, line := range lines[1:] {
			k := historyKindOfFile(tableID, strings.TrimSpace(line))
			if k == "" || seen[k] {
				continue
			}
			seen[k] = true
			kindList = append(kindList, k)
		}
		if len(kindList) == 0 {
			continue
		}
		author := strings.TrimSpace(fields[1])
		if author == "" {
			author = "未知作者"
		}
		entries = append(entries, HistoryEntry{
			ID:      strings.TrimSpace(fields[0]),
			Author:  author,
			When:    formatHistoryTime(fields[2]),
			Message: strings.TrimSpace(fields[3]),
			Kinds:   kindList,
		})
	}
	return filterHistory(entries, kinds)
}

type svnLogXML struct {
	XMLName xml.Name       `xml:"log"`
	Entries []svnLogEntry  `xml:"logentry"`
}

type svnLogEntry struct {
	Revision string        `xml:"revision,attr"`
	Author   string        `xml:"author"`
	Date     string        `xml:"date"`
	Msg      string        `xml:"msg"`
	Paths    []svnLogPath  `xml:"paths>path"`
}

type svnLogPath struct {
	Value string `xml:",chardata"`
}

func svnHistory(ctx context.Context, svnRoot, tableDir, tableID string, kinds []string) ([]HistoryEntry, error) {
	target := tableDir
	if _, err := os.Stat(tableDir); err != nil {
		target = svnRoot
	}
	raw, err := runVCS(ctx, svnRoot, "svn", "log", "-l", itoa(int64(historyLimit)), "-v", "--xml", "--non-interactive", "--", target)
	if err != nil {
		return nil, err
	}
	return parseSvnLog(raw, tableID, kinds), nil
}

func parseSvnLog(raw, tableID string, kinds []string) []HistoryEntry {
	var doc svnLogXML
	if err := xml.Unmarshal([]byte(raw), &doc); err != nil {
		return []HistoryEntry{}
	}
	var entries []HistoryEntry
	for _, item := range doc.Entries {
		var kindList []string
		seen := map[string]bool{}
		for _, p := range item.Paths {
			k := historyKindOfFile(tableID, strings.TrimSpace(p.Value))
			if k == "" || seen[k] {
				continue
			}
			seen[k] = true
			kindList = append(kindList, k)
		}
		if len(kindList) == 0 {
			continue
		}
		author := strings.TrimSpace(item.Author)
		if author == "" {
			author = "未知作者"
		}
		entries = append(entries, HistoryEntry{
			ID:      strings.TrimSpace(item.Revision),
			Author:  author,
			When:    formatHistoryTime(item.Date),
			Message: strings.TrimSpace(item.Msg),
			Kinds:   kindList,
		})
	}
	return filterHistory(entries, kinds)
}
