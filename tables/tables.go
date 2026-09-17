package tables

import (
	"errors"
	"io/fs"
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
	ModeData   = "data"
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
	Path       string `json:"path,omitempty"`
	HasStruct  bool   `json:"hasStruct"`
	HasData    bool   `json:"hasData"`
	HasEditor  bool   `json:"hasEditor"`
	HasChecker bool   `json:"hasChecker"`
	HasExport  bool   `json:"hasExport"`
	HasDocs    bool   `json:"hasDocs"`
	Complete   bool   `json:"complete"`
}

type TreeNode struct {
	Name     string     `json:"name"`
	Path     string     `json:"path"`
	Kind     string     `json:"kind"`
	Table    *Info      `json:"table,omitempty"`
	Children []TreeNode `json:"children,omitempty"`
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

func TableID(id string) string {
	s := strings.ReplaceAll(strings.TrimSpace(id), "\\", "/")
	s = strings.Trim(s, "/")
	if i := strings.LastIndex(s, "/"); i >= 0 {
		return s[i+1:]
	}
	return s
}

func ValidPath(id string) bool {
	s := strings.ReplaceAll(strings.TrimSpace(id), "\\", "/")
	s = strings.Trim(s, "/")
	if s == "" {
		return false
	}
	for _, part := range strings.Split(s, "/") {
		if !ValidID(part) {
			return false
		}
	}
	return true
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
	s := strings.ReplaceAll(strings.TrimSpace(id), "\\", "/")
	s = strings.Trim(s, "/")
	if !ValidPath(s) {
		return "", ErrBadID
	}
	if !strings.Contains(s, "/") {
		direct := filepath.Join(r.Path, s)
		if isTableDir(direct) {
			return direct, nil
		}
		if found := r.findTable(s); found != "" {
			return found, nil
		}
	}
	return r.joinPath(s)
}

func (r *Root) joinPath(slashPath string) (string, error) {
	parts := strings.Split(slashPath, "/")
	dir := filepath.Join(append([]string{r.Path}, parts...)...)
	rel, err := filepath.Rel(r.Path, dir)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		return "", ErrEscape
	}
	return dir, nil
}

func (r *Root) relPath(dir string) string {
	rel, err := filepath.Rel(r.Path, dir)
	if err != nil {
		return filepath.Base(dir)
	}
	return filepath.ToSlash(rel)
}

func (r *Root) findTable(id string) string {
	var found string
	var walk func(string)
	walk = func(abs string) {
		if found != "" {
			return
		}
		entries, err := os.ReadDir(abs)
		if err != nil {
			return
		}
		sort.Slice(entries, func(i, j int) bool { return entries[i].Name() < entries[j].Name() })
		var dirs []os.DirEntry
		for _, ent := range entries {
			if !ent.IsDir() || strings.HasPrefix(ent.Name(), ".") {
				continue
			}
			child := filepath.Join(abs, ent.Name())
			if isTableDir(child) {
				if ent.Name() == id {
					found = child
					return
				}
				continue
			}
			dirs = append(dirs, ent)
		}
		for _, ent := range dirs {
			walk(filepath.Join(abs, ent.Name()))
			if found != "" {
				return
			}
		}
	}
	walk(r.Path)
	return found
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
	info.HasEditor = hasScript(dir, tableID, "editor")
	info.HasChecker = hasScript(dir, tableID, "checker")
	info.HasExport = hasScript(dir, tableID, "export")
	_, info.HasDocs = readFile(dir, tableID, "docs.md")
	info.Complete = info.HasStruct && info.HasData && info.HasEditor && info.HasChecker && info.HasExport
	return info
}

func hasStructYAML(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		if strings.HasSuffix(name, "_struct.yaml") && len(name) > len("_struct.yaml") {
			return true
		}
	}
	return false
}

func isTableDir(dir string) bool {
	st, err := os.Stat(dir)
	if err != nil || !st.IsDir() {
		return false
	}
	if !ValidID(filepath.Base(dir)) {
		return false
	}
	return hasStructYAML(dir)
}

func (r *Root) inspectAt(abs, rel string) Info {
	info := Inspect(abs, filepath.Base(abs))
	info.Path = rel
	return info
}

func (r *Root) walkNodes(abs, rel string, keepEmpty bool) ([]TreeNode, error) {
	entries, err := os.ReadDir(abs)
	if err != nil {
		return nil, err
	}
	var nodes []TreeNode
	for _, ent := range entries {
		if !ent.IsDir() || strings.HasPrefix(ent.Name(), ".") {
			continue
		}
		childRel := ent.Name()
		if rel != "" {
			childRel = rel + "/" + ent.Name()
		}
		childAbs := filepath.Join(abs, ent.Name())
		if isTableDir(childAbs) {
			info := r.inspectAt(childAbs, childRel)
			nodes = append(nodes, TreeNode{
				Name:  ent.Name(),
				Path:  childRel,
				Kind:  "table",
				Table: &info,
			})
			continue
		}
		children, err := r.walkNodes(childAbs, childRel, keepEmpty)
		if err != nil {
			return nil, err
		}
		if !keepEmpty && len(children) == 0 {
			continue
		}
		nodes = append(nodes, TreeNode{
			Name:     ent.Name(),
			Path:     childRel,
			Kind:     "dir",
			Children: children,
		})
	}
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].Kind != nodes[j].Kind {
			return nodes[i].Kind == "dir"
		}
		return nodes[i].Name < nodes[j].Name
	})
	return nodes, nil
}

func (r *Root) Tree() ([]TreeNode, error) {
	nodes, err := r.walkNodes(r.Path, "", true)
	if err != nil {
		return nil, err
	}
	if nodes == nil {
		nodes = []TreeNode{}
	}
	return nodes, nil
}

func (r *Root) List() ([]Info, error) {
	var out []Info
	var collect func([]TreeNode)
	collect = func(nodes []TreeNode) {
		for i := range nodes {
			node := nodes[i]
			if node.Kind == "table" && node.Table != nil {
				out = append(out, *node.Table)
				continue
			}
			collect(node.Children)
		}
	}
	nodes, err := r.walkNodes(r.Path, "", false)
	if err != nil {
		return nil, err
	}
	collect(nodes)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Path == out[j].Path {
			return out[i].ID < out[j].ID
		}
		return out[i].Path < out[j].Path
	})
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
	tableID := TableID(id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Info{}, err
	}
	if err := EnsureDocs(dir, tableID); err != nil {
		return Info{}, err
	}
	if err := WriteText(dir, tableID, "struct.yaml", "id: "+tableID+"\n"); err != nil {
		return Info{}, err
	}
	info := Inspect(dir, tableID)
	info.Path = r.relPath(dir)
	return info, nil
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
	tableID := TableID(id)
	structText, hasStruct := readFile(dir, tableID, "struct.yaml")
	dataText, hasData := readFile(dir, tableID, "data.yaml")
	editor, hasEditor := r.compiledScript(dir, tableID, "editor")
	checker, hasChecker := r.compiledScript(dir, tableID, "checker")
	exportText, hasExport := r.compiledScript(dir, tableID, "export")
	docs, hasDocs := ReadDocs(dir, tableID)
	return Files{
		Info: Info{
			ID:         tableID,
			Path:       r.relPath(dir),
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
	return WriteText(dir, TableID(id), "data.yaml", data)
}

func (r *Root) EditorJS(id string) (string, error) {
	dir, err := r.Dir(id)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(dir); err != nil {
		return "", err
	}
	js, ok, err := r.loadTableScript(dir, TableID(id), "editor")
	if !ok {
		return "", os.ErrNotExist
	}
	if err != nil {
		return CompileErrorEditorJS(err.Error()), nil
	}
	return js, nil
}

// ResolveAsset resolves a resource path for a table.
//   - Paths starting with "." are relative to the table directory.
//   - Other paths are relative to the parent of the tables root
//     (e.g. res/... beside the tables root, as in demo/res next to demo/tables).
//
// The cleaned file must stay under the parent of the tables root.
func (r *Root) ResolveAsset(tableID, rel string) (string, error) {
	dir, err := r.Dir(tableID)
	if err != nil {
		return "", err
	}
	rel = strings.TrimSpace(rel)
	if rel == "" {
		return "", ErrEscape
	}
	rel = filepath.FromSlash(rel)
	if filepath.IsAbs(rel) {
		return "", ErrEscape
	}
	base := filepath.Clean(filepath.Dir(r.Path))
	var joined string
	slash := filepath.ToSlash(rel)
	if strings.HasPrefix(slash, "./") || strings.HasPrefix(slash, "../") || slash == "." || slash == ".." {
		joined = filepath.Clean(filepath.Join(dir, rel))
	} else {
		joined = filepath.Clean(filepath.Join(base, rel))
	}
	relToBase, err := filepath.Rel(base, joined)
	if err != nil || relToBase == ".." || strings.HasPrefix(relToBase, ".."+string(os.PathSeparator)) || filepath.IsAbs(relToBase) {
		return "", ErrEscape
	}
	st, err := os.Stat(joined)
	if err != nil {
		return "", err
	}
	if st.IsDir() {
		return "", errors.New("不是文件")
	}
	return joined, nil
}

func (r *Root) Signature() (string, error) {
	var b strings.Builder
	err := filepath.WalkDir(r.Path, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		name := d.Name()
		if d.IsDir() {
			if path != r.Path && strings.HasPrefix(name, ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(name, ".") {
			return nil
		}
		rel, err := filepath.Rel(r.Path, path)
		if err != nil {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		b.WriteString(filepath.ToSlash(rel))
		b.WriteByte('@')
		b.WriteString(info.ModTime().UTC().String())
		b.WriteByte('#')
		b.WriteString(itoa(info.Size()))
		b.WriteByte(';')
		return nil
	})
	if err != nil {
		return "", err
	}
	parent := filepath.Dir(r.Path)
	coreDir := filepath.Join(parent, "core")
	_ = filepath.WalkDir(coreDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		if !strings.HasSuffix(d.Name(), ".ts") || strings.HasPrefix(d.Name(), ".") {
			return nil
		}
		rel, relErr := filepath.Rel(parent, path)
		if relErr != nil {
			return nil
		}
		_ = appendFileSig(&b, path, "../"+filepath.ToSlash(rel))
		return nil
	})
	return b.String(), nil
}

func appendFileSig(b *strings.Builder, path, label string) error {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if info.IsDir() {
		return nil
	}
	b.WriteString(label)
	b.WriteByte('@')
	b.WriteString(info.ModTime().UTC().String())
	b.WriteByte('#')
	b.WriteString(itoa(info.Size()))
	b.WriteByte(';')
	return nil
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
