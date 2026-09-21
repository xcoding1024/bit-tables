package tables

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/evanw/esbuild/pkg/api"
)

var importLineRe = regexp.MustCompile(`(?m)^\s*(import|export)\b`)

func scriptFile(dir, tableID, kind string) (path string, ok bool) {
	ts := filepath.Join(dir, FileName(tableID, kind+".ts"))
	if st, err := os.Stat(ts); err == nil && !st.IsDir() {
		return ts, true
	}
	js := filepath.Join(dir, FileName(tableID, kind+".js"))
	if st, err := os.Stat(js); err == nil && !st.IsDir() {
		return js, true
	}
	return "", false
}

func hasScript(dir, tableID, kind string) bool {
	_, ok := scriptFile(dir, tableID, kind)
	return ok
}

func (r *Root) projectRoot() string {
	return filepath.Clean(filepath.Dir(r.Path))
}

func needsBundle(path, src string) bool {
	if strings.EqualFold(filepath.Ext(path), ".ts") {
		return true
	}
	return importLineRe.MatchString(src)
}

func underProjectRoot(root, path string) bool {
	rel, err := filepath.Rel(root, filepath.Clean(path))
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		return false
	}
	return true
}

func resolveUnderRoot(projectRoot, abs string) (string, error) {
	abs = filepath.Clean(abs)
	candidates := []string{abs}
	if filepath.Ext(abs) == "" {
		candidates = append(candidates, abs+".ts", abs+".js", filepath.Join(abs, "index.ts"), filepath.Join(abs, "index.js"))
	}
	var lastEscape bool
	for _, c := range candidates {
		c = filepath.Clean(c)
		if !underProjectRoot(projectRoot, c) {
			lastEscape = true
			continue
		}
		if st, err := os.Stat(c); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	if lastEscape {
		return "", fmt.Errorf("import 超出项目根: %s", abs)
	}
	return "", fmt.Errorf("找不到模块 %s", abs)
}

var bitTablesImportRe = regexp.MustCompile(`^bit-tables\.([a-z][a-z0-9_]*)$`)

func resolveBitTablesImport(projectRoot, spec string) (string, error) {
	m := bitTablesImportRe.FindStringSubmatch(spec)
	if m == nil {
		return "", fmt.Errorf("无效的 bit-tables 模块: %s", spec)
	}
	name := m[1]
	allowed := map[string]string{
		"editor":  "editor.ts",
		"checker": "checker.ts",
		"export":  "export.ts",
		"dom":     "dom.ts",
		"types":   "types.ts",
	}
	file, ok := allowed[name]
	if !ok {
		return "", fmt.Errorf("未知的 bit-tables 模块: %s", spec)
	}
	return resolveUnderRoot(projectRoot, filepath.Join(projectRoot, "src", file))
}

func sandboxPlugin(projectRoot string) api.Plugin {
	return api.Plugin{
		Name: "bit-tables-sandbox",
		Setup: func(build api.PluginBuild) {
			build.OnResolve(api.OnResolveOptions{Filter: `^(bit-tables\.|\.)`}, func(args api.OnResolveArgs) (api.OnResolveResult, error) {
				var abs string
				var err error
				if strings.HasPrefix(args.Path, "bit-tables.") {
					abs, err = resolveBitTablesImport(projectRoot, args.Path)
					if err != nil {
						return api.OnResolveResult{}, err
					}
					return api.OnResolveResult{Path: abs}, nil
				}
				abs = filepath.Join(args.ResolveDir, args.Path)
				resolved, err := resolveUnderRoot(projectRoot, abs)
				if err != nil {
					return api.OnResolveResult{}, err
				}
				return api.OnResolveResult{Path: resolved}, nil
			})
		},
	}
}

func (r *Root) bundleScript(entry string) (string, error) {
	projectRoot := r.projectRoot()
	if !underProjectRoot(projectRoot, entry) {
		return "", fmt.Errorf("脚本不在项目根内: %s", entry)
	}
	opts := api.BuildOptions{
		EntryPoints: []string{entry},
		Bundle:      true,
		Write:       false,
		Format:      api.FormatIIFE,
		Platform:    api.PlatformBrowser,
		Target:      api.ES2020,
		LogLevel:    api.LogLevelSilent,
		AbsWorkingDir: projectRoot,
		Loader: map[string]api.Loader{
			".yaml": api.LoaderText,
			".yml":  api.LoaderText,
		},
		Plugins: []api.Plugin{sandboxPlugin(projectRoot)},
	}
	result := api.Build(opts)
	if len(result.Errors) > 0 {
		var parts []string
		for _, item := range result.Errors {
			loc := ""
			if item.Location != nil {
				loc = fmt.Sprintf("%s:%d:%d: ", item.Location.File, item.Location.Line, item.Location.Column)
			}
			parts = append(parts, loc+item.Text)
		}
		return "", errors.New(strings.Join(parts, "\n"))
	}
	if len(result.OutputFiles) == 0 {
		return "", errors.New("打包未产生输出")
	}
	return string(result.OutputFiles[0].Contents), nil
}

func (r *Root) loadTableScript(dir, tableID, kind string) (string, bool, error) {
	path, ok := scriptFile(dir, tableID, kind)
	if !ok {
		return "", false, nil
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", true, err
	}
	src := string(raw)
	if !needsBundle(path, src) {
		return src, true, nil
	}
	js, err := r.bundleScript(path)
	if err != nil {
		return "", true, err
	}
	return js, true, nil
}

func compileErrorJSON(msg string) string {
	b, err := json.Marshal(msg)
	if err != nil {
		return `"脚本编译失败"`
	}
	return string(b)
}

func CompileErrorEditorJS(msg string) string {
	safe := compileErrorJSON("编译失败：" + msg)
	return `window.BitTableEditor = {
  mount: function (el) {
    el.innerHTML = '<div data-testid="table-compile-error" style="padding:16px;color:#eb5757;white-space:pre-wrap"></div>';
    var box = el.firstChild;
    if (box) box.textContent = ` + safe + `;
  }
};`
}

func CompileErrorCheckerJS(msg string) string {
	safe := compileErrorJSON("编译失败：" + msg)
	return `window.BitTableChecker = {
  check: function () {
    return { ok: false, errors: [{ path: "", message: ` + safe + ` }] };
  }
};`
}

func CompileErrorExportJS(msg string) string {
	safe := compileErrorJSON("编译失败：" + msg)
	return `window.BitTableExporter = {
  export: function () {
    var file = { name: "error.txt", content: ` + safe + ` };
    return { client: [file], server: [file] };
  }
};`
}

func CompileErrorPluginsJS(msg string) string {
	safe := compileErrorJSON("编译失败：" + msg)
	return `window.BitTablePlugins = { plugins: [], error: ` + safe + ` };`
}

func CompileErrorTablePluginsJS(msg string) string {
	safe := compileErrorJSON("编译失败：" + msg)
	return `window.BitTableTablePlugins = { plugins: [], error: ` + safe + ` };`
}

func pluginFlattenJS() string {
	return `
function __bitPluginList(item) {
  if (item == null) return [];
  if (Array.isArray(item)) {
    var out = [];
    for (var i = 0; i < item.length; i++) out = out.concat(__bitPluginList(item[i]));
    return out;
  }
  if (item.plugins && Array.isArray(item.plugins)) return __bitPluginList(item.plugins);
  if (item.default != null && item.default !== item) return __bitPluginList(item.default);
  return [item];
}
`
}

func listPluginFiles(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var names []string
	for _, ent := range entries {
		if ent.IsDir() {
			continue
		}
		name := ent.Name()
		ext := strings.ToLower(filepath.Ext(name))
		if ext != ".ts" && ext != ".js" {
			continue
		}
		if strings.HasPrefix(name, "_") {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func (r *Root) bundlePluginEntry(source string) (string, error) {
	projectRoot := r.projectRoot()
	opts := api.BuildOptions{
		Stdin: &api.StdinOptions{
			Contents:   source,
			ResolveDir: projectRoot,
			Sourcefile: "bit-plugins-entry.js",
			Loader:     api.LoaderJS,
		},
		Bundle:        true,
		Write:         false,
		Format:        api.FormatIIFE,
		Platform:      api.PlatformBrowser,
		Target:        api.ES2020,
		LogLevel:      api.LogLevelSilent,
		AbsWorkingDir: projectRoot,
		Loader: map[string]api.Loader{
			".yaml": api.LoaderText,
			".yml":  api.LoaderText,
		},
		Plugins: []api.Plugin{sandboxPlugin(projectRoot)},
	}
	result := api.Build(opts)
	if len(result.Errors) > 0 {
		var parts []string
		for _, item := range result.Errors {
			loc := ""
			if item.Location != nil {
				loc = fmt.Sprintf("%s:%d:%d: ", item.Location.File, item.Location.Line, item.Location.Column)
			}
			parts = append(parts, loc+item.Text)
		}
		return "", errors.New(strings.Join(parts, "\n"))
	}
	if len(result.OutputFiles) == 0 {
		return "", errors.New("打包未产生输出")
	}
	return string(result.OutputFiles[0].Contents), nil
}

func (r *Root) GenericPluginsJS() string {
	dir := filepath.Join(r.projectRoot(), "src", "plugins")
	names := listPluginFiles(dir)
	if len(names) == 0 {
		return `window.BitTablePlugins = { plugins: [] };`
	}
	var b strings.Builder
	for i, name := range names {
		spec := filepath.ToSlash(filepath.Join("src", "plugins", name))
		fmt.Fprintf(&b, "import p%d from %q;\n", i, "./"+spec)
	}
	b.WriteString(pluginFlattenJS())
	b.WriteString("var list = [];\n")
	for i := range names {
		fmt.Fprintf(&b, "list = list.concat(__bitPluginList(p%d));\n", i)
	}
	b.WriteString("window.BitTablePlugins = { plugins: list };\n")
	js, err := r.bundlePluginEntry(b.String())
	if err != nil {
		return CompileErrorPluginsJS(err.Error())
	}
	return js
}

func (r *Root) TablePluginJS(dir, tableID string) string {
	path, ok := scriptFile(dir, tableID, "plugin")
	if !ok {
		return `window.BitTableTablePlugins = { plugins: [] };`
	}
	projectRoot := r.projectRoot()
	rel, err := filepath.Rel(projectRoot, path)
	if err != nil {
		return CompileErrorTablePluginsJS(err.Error())
	}
	spec := filepath.ToSlash(rel)
	var b strings.Builder
	fmt.Fprintf(&b, "import p0 from %q;\n", "./"+spec)
	b.WriteString(pluginFlattenJS())
	b.WriteString("window.BitTableTablePlugins = { plugins: __bitPluginList(p0) };\n")
	js, err := r.bundlePluginEntry(b.String())
	if err != nil {
		return CompileErrorTablePluginsJS(err.Error())
	}
	return js
}

func (r *Root) compiledScript(dir, tableID, kind string) (string, bool) {
	js, has, err := r.loadTableScript(dir, tableID, kind)
	if !has {
		return "", false
	}
	if err == nil {
		return js, true
	}
	switch kind {
	case "checker":
		return CompileErrorCheckerJS(err.Error()), true
	case "export":
		return CompileErrorExportJS(err.Error()), true
	default:
		return CompileErrorEditorJS(err.Error()), true
	}
}
