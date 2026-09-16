package tables

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	HistoryFileName = "history.md"

	historySectionStruct = "结构"
	historySectionData   = "数据"
	UnknownUser          = "未知用户"
	MarkStructOpen       = "<!-- bit-history:struct -->"
	MarkStructClose      = "<!-- /bit-history:struct -->"
	MarkDataOpen         = "<!-- bit-history:data -->"
	MarkDataClose        = "<!-- /bit-history:data -->"
)

type HistoryTurn struct {
	When  string `json:"when"`
	Who   string `json:"who"`
	User  string `json:"user"`
	Agent string `json:"agent"`
}

func HistoryPath(dir string) string {
	return filepath.Join(dir, HistoryFileName)
}

func EmptyHistory(tableID string) string {
	return JoinHistory("# "+tableID, "", "")
}

func ReadHistory(dir string) (string, bool) {
	b, err := os.ReadFile(HistoryPath(dir))
	if err != nil {
		return "", false
	}
	return string(b), true
}

func EnsureHistory(dir, tableID string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	path := HistoryPath(dir)
	if _, err := os.Stat(path); err == nil {
		return nil
	}
	return os.WriteFile(path, []byte(EmptyHistory(tableID)), 0o644)
}

func HistorySectionTitle(mode string) string {
	if mode == ModeData {
		return historySectionData
	}
	return historySectionStruct
}

func extractMarked(text, open, close string) (string, bool) {
	start := strings.Index(text, open)
	end := strings.Index(text, close)
	if start < 0 || end < 0 || end < start {
		return "", false
	}
	return strings.TrimSpace(text[start+len(open) : end]), true
}

func SplitHistory(text, tableID string) (title, structBody, dataBody string) {
	title = "# " + tableID
	text = strings.ReplaceAll(text, "\r\n", "\n")
	if strings.TrimSpace(text) == "" {
		return title, "", ""
	}
	if line, _, ok := strings.Cut(text, "\n"); ok && strings.HasPrefix(strings.TrimSpace(line), "#") && !strings.HasPrefix(strings.TrimSpace(line), "##") {
		title = strings.TrimSpace(line)
	} else if strings.HasPrefix(strings.TrimSpace(text), "#") && !strings.Contains(text, "\n") {
		title = strings.TrimSpace(text)
	}
	if structMarked, ok1 := extractMarked(text, MarkStructOpen, MarkStructClose); ok1 {
		if dataMarked, ok2 := extractMarked(text, MarkDataOpen, MarkDataClose); ok2 {
			return title, structMarked, dataMarked
		}
	}
	return title, splitLegacySection(text, historySectionStruct), splitLegacySection(text, historySectionData)
}

func splitLegacySection(text, name string) string {
	heading := "## " + name
	other := "## " + historySectionData
	if name == historySectionData {
		other = "## " + historySectionStruct
	}
	lines := strings.Split(text, "\n")
	in := false
	var out []string
	for _, line := range lines {
		trim := strings.TrimSpace(line)
		if trim == heading {
			in = true
			continue
		}
		if trim == other && in {
			break
		}
		if in {
			out = append(out, line)
		}
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

func JoinHistory(title, structBody, dataBody string) string {
	var b strings.Builder
	b.WriteString(strings.TrimSpace(title))
	b.WriteString("\n\n## ")
	b.WriteString(historySectionStruct)
	b.WriteString("\n\n")
	b.WriteString(MarkStructOpen)
	b.WriteString("\n")
	if structBody != "" {
		b.WriteString(structBody)
		if !strings.HasSuffix(structBody, "\n") {
			b.WriteString("\n")
		}
	}
	b.WriteString(MarkStructClose)
	b.WriteString("\n\n## ")
	b.WriteString(historySectionData)
	b.WriteString("\n\n")
	b.WriteString(MarkDataOpen)
	b.WriteString("\n")
	if dataBody != "" {
		b.WriteString(dataBody)
		if !strings.HasSuffix(dataBody, "\n") {
			b.WriteString("\n")
		}
	}
	b.WriteString(MarkDataClose)
	b.WriteString("\n")
	return b.String()
}

func FormatHistoryTurn(when, who, userText, agentText string) string {
	if strings.TrimSpace(when) == "" {
		when = time.Now().Format("2006-01-02 15:04:05 -07:00")
	}
	if strings.TrimSpace(who) == "" {
		who = UnknownUser
	}
	return strings.Join([]string{
		"### " + when + " · " + who,
		"",
		"**用户**",
		"",
		strings.TrimSpace(userText),
		"",
		"**Agent**",
		"",
		strings.TrimSpace(agentText),
	}, "\n")
}

func HistorySection(text, mode string) string {
	src := strings.ReplaceAll(text, "\r\n", "\n")
	tag := ModeData
	if mode != ModeData {
		tag = ModeStruct
	}
	open := "<!-- bit-history:" + tag + " -->"
	close := "<!-- /bit-history:" + tag + " -->"
	a := strings.Index(src, open)
	b := strings.Index(src, close)
	if a >= 0 && b > a {
		return strings.TrimSpace(src[a+len(open) : b])
	}
	heading := "## 结构"
	other := "## 数据"
	if mode == ModeData {
		heading, other = other, heading
	}
	start := strings.Index(src, heading)
	if start < 0 {
		return ""
	}
	body := src[start+len(heading):]
	if cut := strings.Index(body, "\n"+other); cut >= 0 {
		body = body[:cut]
	}
	return strings.TrimSpace(body)
}

func AppendHistory(dir, tableID, mode, who, userText, agentText, when string) error {
	if err := EnsureHistory(dir, tableID); err != nil {
		return err
	}
	raw, _ := ReadHistory(dir)
	title, structBody, dataBody := SplitHistory(raw, tableID)
	turn := FormatHistoryTurn(when, who, userText, agentText)
	if HistorySectionTitle(mode) == historySectionData {
		if dataBody != "" {
			dataBody += "\n\n"
		}
		dataBody += turn
	} else {
		if structBody != "" {
			structBody += "\n\n"
		}
		structBody += turn
	}
	return os.WriteFile(HistoryPath(dir), []byte(JoinHistory(title, structBody, dataBody)), 0o644)
}

func (r *Root) AppendHistory(id, mode, who, userText, agentText, when string) error {
	if mode != ModeData && mode != ModeStruct {
		return ErrBadMode
	}
	dir, err := r.Dir(id)
	if err != nil {
		return err
	}
	if _, err := os.Stat(dir); err != nil {
		return err
	}
	return AppendHistory(dir, id, mode, who, userText, agentText, when)
}
