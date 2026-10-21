package tables

import (
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// Snapshot 只包含原始配表文档，不加载或执行历史脚本。
type Snapshot struct {
	VCS           string            `json:"vcs"`
	Revision      string            `json:"revision"`
	Struct        *string           `json:"struct"`
	Data          *string           `json:"data"`
	FileRevisions map[string]string `json:"fileRevisions,omitempty"`
}

var snapshotGitRevision = regexp.MustCompile(`^[0-9a-fA-F]{7,64}$`)
var snapshotSVNRevision = regexp.MustCompile(`^[1-9][0-9]*$`)

func snapshotCommand(ctx context.Context, dir, program string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, program, args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return "", fmt.Errorf("读取版本超时或已取消：%w", ctx.Err())
		}
		return "", fmt.Errorf("读取版本失败：%s：%w", strings.TrimSpace(stderr.String()), err)
	}
	return stdout.String(), nil
}

func snapshotInside(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && !filepath.IsAbs(rel) && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func (r *Root) Snapshot(ctx context.Context, id, revision string) (Snapshot, error) {
	out := Snapshot{}
	if r == nil {
		return out, fmt.Errorf("未绑定配表目录")
	}
	dir, err := r.Dir(id)
	if err != nil {
		return out, err
	}
	root, err := filepath.EvalSymlinks(r.Path)
	if err != nil {
		return out, err
	}
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return out, err
	}
	if !snapshotInside(root, resolved) {
		return out, ErrEscape
	}
	for _, kind := range []string{"struct.yaml", "data.yaml"} {
		file := filepath.Join(dir, FileName(TableID(id), kind))
		resolvedFile, err := filepath.EvalSymlinks(file)
		if err != nil && !os.IsNotExist(err) {
			return out, err
		}
		if err == nil && !snapshotInside(root, resolvedFile) {
			return out, ErrEscape
		}
	}
	revision = strings.TrimSpace(revision)
	if revision == "" {
		revision = "base"
	}
	gitRoot, svnRoot := findVCSRoot(dir, ".git"), findVCSRoot(dir, ".svn")
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	switch {
	case gitRoot != "" && (svnRoot == "" || len(gitRoot) >= len(svnRoot)):
		return gitSnapshot(ctx, gitRoot, dir, TableID(id), revision)
	case svnRoot != "":
		return svnSnapshot(ctx, svnRoot, dir, TableID(id), revision)
	default:
		return out, fmt.Errorf("当前目录未纳入 Git 或 SVN")
	}
}

func gitSnapshot(ctx context.Context, root, dir, id, revision string) (Snapshot, error) {
	out := Snapshot{VCS: "git"}
	if revision == "base" {
		revision = "HEAD"
	} else if !snapshotGitRevision.MatchString(revision) {
		return out, fmt.Errorf("Git 版本必须是提交哈希")
	}
	commit, err := snapshotCommand(ctx, root, "git", "rev-parse", "--verify", revision+"^{commit}")
	if err != nil {
		return out, err
	}
	out.Revision = strings.TrimSpace(commit)
	for _, file := range []struct {
		kind string
		dst  **string
	}{{"struct.yaml", &out.Struct}, {"data.yaml", &out.Data}} {
		rel, _ := filepath.Rel(root, filepath.Join(dir, FileName(id, file.kind)))
		rel = filepath.ToSlash(rel)
		entry, err := snapshotCommand(ctx, root, "git", "ls-tree", "-z", out.Revision, "--", rel)
		if err != nil {
			return out, err
		}
		if entry == "" {
			continue
		}
		if !strings.HasPrefix(entry, "100644 blob ") && !strings.HasPrefix(entry, "100755 blob ") {
			return out, fmt.Errorf("历史配表文件不是普通文件")
		}
		text, err := snapshotCommand(ctx, root, "git", "show", out.Revision+":"+rel)
		if err != nil {
			return out, err
		}
		*file.dst = &text
	}
	return out, nil
}

type snapshotSVNInfo struct {
	Entry struct {
		Revision string `xml:"revision,attr"`
		URL      string `xml:"url"`
		Repo     struct {
			Root string `xml:"root"`
		} `xml:"repository"`
	} `xml:"entry"`
}

func svnSnapshotInfo(ctx context.Context, root, target string) (snapshotSVNInfo, error) {
	var info snapshotSVNInfo
	raw, err := snapshotCommand(ctx, root, "svn", "info", "--xml", "--non-interactive", "--", target)
	if err == nil {
		err = xml.Unmarshal([]byte(raw), &info)
	}
	return info, err
}

func svnSnapshotInfoAt(ctx context.Context, root string, info snapshotSVNInfo, revision string) (snapshotSVNInfo, error) {
	raw, err := snapshotCommand(ctx, root, "svn", "info", "--xml", "-r", revision, "--non-interactive", "--", info.Entry.URL+"@"+info.Entry.Revision)
	if err == nil {
		err = xml.Unmarshal([]byte(raw), &info)
	}
	return info, err
}

func svnSnapshotMissing(err error) bool {
	if err == nil {
		return false
	}
	for _, code := range []string{"E160013", "W160013", "E195012", "E155010", "W155010", "E200009"} {
		if strings.Contains(err.Error(), code) {
			return true
		}
	}
	return false
}

func svnSnapshot(ctx context.Context, root, dir, id, revision string) (Snapshot, error) {
	out := Snapshot{VCS: "svn", Revision: "BASE", FileRevisions: map[string]string{}}
	if revision != "base" && !snapshotSVNRevision.MatchString(revision) {
		return out, fmt.Errorf("SVN 版本必须是正整数")
	}
	var location snapshotSVNInfo
	var err error
	ancestor := dir
	for {
		location, err = svnSnapshotInfo(ctx, root, ancestor+"@")
		if err == nil {
			break
		}
		if !svnSnapshotMissing(err) || ancestor == root {
			return out, err
		}
		ancestor = filepath.Dir(ancestor)
	}
	if revision != "base" {
		// 先区分无效版本和该版本尚不存在的表。
		if _, err := svnSnapshotInfo(ctx, root, location.Entry.Repo.Root+"@"+revision); err != nil {
			return out, err
		}
		out.Revision = revision
		location, err = svnSnapshotInfoAt(ctx, root, location, revision)
		if svnSnapshotMissing(err) {
			return out, nil
		}
		if err != nil {
			return out, err
		}
	}
	for _, file := range []struct {
		kind string
		dst  **string
	}{{"struct.yaml", &out.Struct}, {"data.yaml", &out.Data}} {
		path := filepath.Join(dir, FileName(id, file.kind))
		target, rev := path+"@", "BASE"
		if revision == "base" {
			info, err := svnSnapshotInfo(ctx, root, target)
			if svnSnapshotMissing(err) {
				continue
			}
			if err != nil {
				return out, err
			}
			out.FileRevisions[file.kind] = info.Entry.Revision
		} else {
			rel, _ := filepath.Rel(ancestor, path)
			u, err := url.Parse(location.Entry.URL)
			if err != nil {
				return out, err
			}
			u.Path = strings.TrimSuffix(u.Path, "/") + "/" + filepath.ToSlash(rel)
			target, rev = u.String()+"@"+revision, revision
		}
		text, err := snapshotCommand(ctx, root, "svn", "cat", "-r", rev, "--non-interactive", "--", target)
		if svnSnapshotMissing(err) {
			continue
		}
		if err != nil {
			return out, err
		}
		*file.dst = &text
	}
	return out, nil
}
