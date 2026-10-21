package tables

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/evanw/esbuild/pkg/api"
)

func (r *Root) ComparisonScript(ctx context.Context, id, revision string) (string, error) {
	if r == nil {
		return "", fmt.Errorf("未绑定配表目录")
	}
	if revision == "local" {
		return r.EditorJS(id)
	}
	return r.SnapshotEditor(ctx, id, revision)
}

func (r *Root) ComparisonAsset(ctx context.Context, id, revision, rel string) ([]byte, error) {
	if r == nil {
		return nil, fmt.Errorf("未绑定配表目录")
	}
	dir, err := r.Dir(id)
	if err != nil {
		return nil, err
	}
	if rel == "" || filepath.IsAbs(filepath.FromSlash(rel)) {
		return nil, ErrEscape
	}
	project := r.projectRoot()
	base := project
	if strings.HasPrefix(rel, ".") {
		base = dir
	}
	file := filepath.Clean(filepath.Join(base, filepath.FromSlash(rel)))
	if !snapshotInside(project, file) {
		return nil, ErrEscape
	}
	if revision == "local" {
		resolved, err := filepath.EvalSymlinks(file)
		canonicalProject, projectErr := filepath.EvalSymlinks(project)
		if err != nil {
			return nil, err
		}
		if projectErr != nil || !snapshotInside(canonicalProject, resolved) {
			return nil, ErrEscape
		}
		return os.ReadFile(resolved)
	}
	snapshot, err := r.Snapshot(ctx, id, revision)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	read, err := r.versionFileReader(ctx, dir, snapshot)
	if err != nil {
		return nil, err
	}
	text, err := read(file)
	if err != nil {
		return nil, err
	}
	if text == nil {
		return nil, os.ErrNotExist
	}
	return []byte(*text), nil
}

// SnapshotEditor 编译所选版本的源码及依赖，不从当前工作副本补齐历史模块。
func (r *Root) SnapshotEditor(ctx context.Context, id, revision string) (string, error) {
	snapshot, err := r.Snapshot(ctx, id, revision)
	if err != nil {
		return "", err
	}
	if snapshot.Struct == nil && snapshot.Data == nil {
		return "", fmt.Errorf("该版本尚无此表")
	}
	dir, _ := r.Dir(id)
	ctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	read, err := r.versionFileReader(ctx, dir, snapshot)
	if err != nil {
		return "", err
	}
	project := r.projectRoot()
	var mu sync.Mutex
	cache := map[string]*string{}
	get := func(file string) (*string, error) {
		mu.Lock()
		defer mu.Unlock()
		file = filepath.Clean(file)
		if !snapshotInside(project, file) {
			return nil, ErrEscape
		}
		if value, ok := cache[file]; ok {
			return value, nil
		}
		value, err := read(file)
		if err == nil {
			cache[file] = value
		}
		return value, err
	}
	resolve := func(file string) (string, error) {
		candidates := []string{file}
		if filepath.Ext(file) == "" {
			candidates = append(candidates, file+".ts", file+".js", file+".json", filepath.Join(file, "index.ts"), filepath.Join(file, "index.js"))
		}
		for _, candidate := range candidates {
			value, err := get(candidate)
			if err != nil {
				return "", err
			}
			if value != nil {
				return filepath.Clean(candidate), nil
			}
		}
		return "", fmt.Errorf("所选版本缺少模块：%s", file)
	}
	entry := filepath.Join(dir, FileName(TableID(id), "editor.ts"))
	text, err := get(entry)
	if err != nil {
		return "", err
	}
	if text == nil {
		entry = filepath.Join(dir, FileName(TableID(id), "editor.js"))
		text, err = get(entry)
		if err != nil {
			return "", err
		}
	}
	if text == nil {
		return "", fmt.Errorf("所选版本没有 editor，可使用原始表格查看数据")
	}
	plugin := api.Plugin{Name: "version-sources", Setup: func(build api.PluginBuild) {
		build.OnResolve(api.OnResolveOptions{Filter: ".*"}, func(args api.OnResolveArgs) (api.OnResolveResult, error) {
			file := args.Path
			if args.Kind != api.ResolveEntryPoint {
				if match := bitTablesImportRe.FindStringSubmatch(args.Path); match != nil {
					file = filepath.Join(project, "src", match[1]+".ts")
				} else if strings.HasPrefix(args.Path, ".") {
					file = filepath.Join(filepath.Dir(args.Importer), args.Path)
				} else {
					return api.OnResolveResult{}, fmt.Errorf("所选版本无法解析模块：%s", args.Path)
				}
			}
			resolved, err := resolve(file)
			return api.OnResolveResult{Path: resolved, Namespace: "snapshot"}, err
		})
		build.OnLoad(api.OnLoadOptions{Filter: ".*", Namespace: "snapshot"}, func(args api.OnLoadArgs) (api.OnLoadResult, error) {
			text, err := get(args.Path)
			loader := api.LoaderJS
			switch strings.ToLower(filepath.Ext(args.Path)) {
			case ".ts", ".tsx":
				loader = api.LoaderTS
			case ".json":
				loader = api.LoaderJSON
			case ".yaml", ".yml", ".txt", ".svg":
				loader = api.LoaderText
			}
			return api.OnLoadResult{Contents: text, Loader: loader}, err
		})
	}}
	result := api.Build(api.BuildOptions{EntryPoints: []string{entry}, Bundle: true, Write: false, Format: api.FormatIIFE, Platform: api.PlatformBrowser,
		Target: api.ES2020, LogLevel: api.LogLevelSilent, AbsWorkingDir: project, Plugins: []api.Plugin{plugin}})
	if len(result.Errors) > 0 {
		messages := make([]string, 0, len(result.Errors))
		for _, item := range result.Errors {
			messages = append(messages, item.Text)
		}
		return "", fmt.Errorf("历史 editor 编译失败：%s", strings.Join(messages, "\n"))
	}
	if len(result.OutputFiles) == 0 {
		return "", fmt.Errorf("历史 editor 编译未产生输出")
	}
	return string(result.OutputFiles[0].Contents), nil
}

func (r *Root) versionFileReader(ctx context.Context, dir string, snapshot Snapshot) (func(string) (*string, error), error) {
	if snapshot.VCS == "git" {
		root := findVCSRoot(dir, ".git")
		return func(file string) (*string, error) {
			rel, _ := filepath.Rel(root, file)
			rel = filepath.ToSlash(rel)
			entry, err := snapshotCommand(ctx, root, "git", "ls-tree", "-z", snapshot.Revision, "--", rel)
			if err != nil || entry == "" {
				return nil, err
			}
			if strings.HasPrefix(entry, "040000 tree ") {
				return nil, nil
			}
			if !strings.HasPrefix(entry, "100644 blob ") && !strings.HasPrefix(entry, "100755 blob ") {
				return nil, fmt.Errorf("历史模块不是普通文件")
			}
			text, err := snapshotCommand(ctx, root, "git", "show", snapshot.Revision+":"+rel)
			return &text, err
		}, nil
	}
	root := findVCSRoot(dir, ".svn")
	info, err := svnSnapshotInfo(ctx, root, dir+"@")
	if err != nil {
		return nil, err
	}
	if snapshot.Revision != "BASE" {
		info, err = svnSnapshotInfoAt(ctx, root, info, snapshot.Revision)
		if err != nil {
			return nil, err
		}
	}
	return func(file string) (*string, error) {
		target, rev := file+"@", "BASE"
		if snapshot.Revision == "BASE" {
			resolved, err := filepath.EvalSymlinks(file)
			project, projectErr := filepath.EvalSymlinks(r.projectRoot())
			if err == nil && (projectErr != nil || !snapshotInside(project, resolved)) {
				return nil, ErrEscape
			}
			if err != nil && !os.IsNotExist(err) {
				return nil, err
			}
		}
		if snapshot.Revision != "BASE" {
			rel, _ := filepath.Rel(dir, file)
			u, err := url.Parse(info.Entry.URL)
			if err != nil {
				return nil, err
			}
			u.Path = path.Join(u.Path, filepath.ToSlash(rel))
			target, rev = u.String()+"@"+snapshot.Revision, snapshot.Revision
		} else {
			if _, err := os.Lstat(file); err != nil && !os.IsNotExist(err) {
				return nil, err
			}
		}
		text, err := snapshotCommand(ctx, root, "svn", "cat", "-r", rev, "--non-interactive", "--", target)
		if svnSnapshotMissing(err) {
			return nil, nil
		}
		return &text, err
	}, nil
}
