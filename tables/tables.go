package tables

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	ModeStruct = "struct"
	ModeCheck  = "check"
	ModeExport = "export"
	IDPattern  = `^[a-z][a-z0-9_]{0,31}$`
)

var (
	idRe = regexp.MustCompile(IDPattern)

	ErrBadID  = errors.New("表 id 无效")
	ErrEscape = errors.New("路径超出配表根目录")
	ErrExists = errors.New("表已存在")
)

type Info struct {
	ID         string `json:"id"`
	HasStruct  bool   `json:"hasStruct"`
	HasData    bool   `json:"hasData"`
	HasEditor  bool   `json:"hasEditor"`
	HasChecker bool   `json:"hasChecker"`
	HasExport  bool   `json:"hasExport"`
	HasDocs    bool   `json:"hasDocs"`
	Complete   bool   `json:"complete"`
}

type Files struct {
	Info
	Struct  string `json:"struct"`
	Data    string `json:"data"`
	Editor  string `json:"editor"`
	Checker string `json:"checker"`
	Export  string `json:"export"`
	Docs    string `json:"docs"`
}

type Root struct {
	Path string
}

func Open(path string) (*Root, error) {
	abs, err := absExistingDir(path)
	if err != nil {
		return nil, err
	}
	return &Root{Path: abs}, nil
}

// OpenAt 打开配表根目录。sample 为真时若目录为空则写入 item 示例表；目录不存在时会创建。
func OpenAt(path string, sample bool) (*Root, error) {
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("路径不能为空")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if sample {
		if err := os.MkdirAll(abs, 0o755); err != nil {
			return nil, err
		}
	}
	root, err := Open(abs)
	if err != nil {
		return nil, err
	}
	if !sample {
		return root, nil
	}
	list, err := root.List()
	if err != nil {
		return nil, err
	}
	if len(list) > 0 {
		return root, nil
	}
	if err := root.SeedItem("item"); err != nil {
		return nil, err
	}
	return root, nil
}

func ValidID(id string) bool {
	return idRe.MatchString(id)
}

func absExistingDir(p string) (string, error) {
	if strings.TrimSpace(p) == "" {
		return "", errors.New("路径不能为空")
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	st, err := os.Stat(abs)
	if err != nil {
		return "", err
	}
	if !st.IsDir() {
		return "", errors.New("不是目录")
	}
	return abs, nil
}

func FileName(tableID, kind string) string {
	return tableID + "_" + kind
}

func (r *Root) Dir(id string) (string, error) {
	if !ValidID(id) {
		return "", ErrBadID
	}
	dir := filepath.Join(r.Path, id)
	rel, err := filepath.Rel(r.Path, dir)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", ErrEscape
	}
	return dir, nil
}

func readFile(dir, tableID, kind string) (string, bool) {
	b, err := os.ReadFile(filepath.Join(dir, FileName(tableID, kind)))
	if err != nil {
		return "", false
	}
	return string(b), true
}

func WriteText(dir, tableID, kind, text string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, FileName(tableID, kind)), []byte(text), 0o644)
}

func Inspect(dir, tableID string) Info {
	info := Info{ID: tableID}
	_, info.HasStruct = readFile(dir, tableID, "struct.yaml")
	_, info.HasData = readFile(dir, tableID, "data.yaml")
	_, info.HasEditor = readFile(dir, tableID, "editor.js")
	_, info.HasChecker = readFile(dir, tableID, "checker.js")
	_, info.HasExport = readFile(dir, tableID, "export.js")
	_, info.HasDocs = readFile(dir, tableID, "docs.md")
	info.Complete = info.HasStruct && info.HasData && info.HasEditor && info.HasChecker && info.HasExport
	return info
}

func (r *Root) List() ([]Info, error) {
	entries, err := os.ReadDir(r.Path)
	if err != nil {
		return nil, err
	}
	var out []Info
	for _, ent := range entries {
		if !ent.IsDir() || strings.HasPrefix(ent.Name(), ".") || !ValidID(ent.Name()) {
			continue
		}
		out = append(out, Inspect(filepath.Join(r.Path, ent.Name()), ent.Name()))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	if out == nil {
		out = []Info{}
	}
	return out, nil
}

func (r *Root) Create(id string) (Info, error) {
	dir, err := r.Dir(id)
	if err != nil {
		return Info{}, err
	}
	if _, err := os.Stat(dir); err == nil {
		return Info{}, ErrExists
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Info{}, err
	}
	if err := EnsureDocs(dir, id); err != nil {
		return Info{}, err
	}
	return Inspect(dir, id), nil
}

func (r *Root) Delete(id string) error {
	dir, err := r.Dir(id)
	if err != nil {
		return err
	}
	if _, err := os.Stat(dir); err != nil {
		return err
	}
	return os.RemoveAll(dir)
}

func (r *Root) Files(id string) (Files, error) {
	dir, err := r.Dir(id)
	if err != nil {
		return Files{}, err
	}
	if _, err := os.Stat(dir); err != nil {
		return Files{}, err
	}
	structText, hasStruct := readFile(dir, id, "struct.yaml")
	dataText, hasData := readFile(dir, id, "data.yaml")
	editor, hasEditor := readFile(dir, id, "editor.js")
	checker, hasChecker := readFile(dir, id, "checker.js")
	exportText, hasExport := readFile(dir, id, "export.js")
	docs, hasDocs := ReadDocs(dir, id)
	return Files{
		Info: Info{
			ID:         id,
			HasStruct:  hasStruct,
			HasData:    hasData,
			HasEditor:  hasEditor,
			HasChecker: hasChecker,
			HasExport:  hasExport,
			HasDocs:    hasDocs,
			Complete:   hasStruct && hasData && hasEditor && hasChecker && hasExport,
		},
		Struct:  structText,
		Data:    dataText,
		Editor:  editor,
		Checker: checker,
		Export:  exportText,
		Docs:    docs,
	}, nil
}

func (r *Root) PutData(id, data string) error {
	dir, err := r.Dir(id)
	if err != nil {
		return err
	}
	if _, err := os.Stat(dir); err != nil {
		return err
	}
	return WriteText(dir, id, "data.yaml", data)
}

func (r *Root) EditorJS(id string) (string, error) {
	dir, err := r.Dir(id)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(dir); err != nil {
		return "", err
	}
	text, ok := readFile(dir, id, "editor.js")
	if !ok {
		return "", os.ErrNotExist
	}
	return text, nil
}

func (r *Root) Signature() (string, error) {
	var b strings.Builder
	entries, err := os.ReadDir(r.Path)
	if err != nil {
		return "", err
	}
	for _, ent := range entries {
		if !ent.IsDir() || !ValidID(ent.Name()) {
			continue
		}
		dir := filepath.Join(r.Path, ent.Name())
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		b.WriteString(ent.Name())
		b.WriteByte(':')
		for _, f := range files {
			info, err := f.Info()
			if err != nil {
				continue
			}
			b.WriteString(f.Name())
			b.WriteByte('@')
			b.WriteString(info.ModTime().UTC().String())
			b.WriteByte('#')
			b.WriteString(itoa(info.Size()))
			b.WriteByte(';')
		}
	}
	return b.String(), nil
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
