package tables

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// 保存配表状态时，接口读取与文件变更检测不能看到只更新了一半的状态。
var stateMu sync.RWMutex

func (r *Root) PutState(id, data, plugins string) error {
	stateMu.Lock()
	defer stateMu.Unlock()
	dir, err := r.Dir(id)
	if err != nil {
		return err
	}
	resolved, err := filepath.EvalSymlinks(dir)
	if err != nil {
		return err
	}
	root, err := filepath.EvalSymlinks(r.Path)
	if err != nil {
		return err
	}
	rel, err := filepath.Rel(root, resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		return ErrEscape
	}
	if !isTableDir(resolved) {
		return os.ErrNotExist
	}
	return putStateFiles(resolved, TableID(id), data, plugins, os.Rename)
}

type stateFile struct {
	path    string
	old     []byte
	mode    os.FileMode
	existed bool
	next    string
	remove  bool
}

func stageStateFile(dir string, content []byte, mode os.FileMode) (string, error) {
	f, err := os.CreateTemp(dir, ".state-*")
	if err != nil {
		return "", err
	}
	name := f.Name()
	err = f.Chmod(mode)
	if err == nil {
		_, err = f.Write(content)
	}
	if err == nil {
		err = f.Sync()
	}
	err = errors.Join(err, f.Close())
	if err != nil {
		_ = os.Remove(name)
		return "", err
	}
	return name, nil
}

func putStateFiles(dir, id, data, plugins string, rename func(string, string) error) error {
	trimmed := strings.TrimSpace(plugins)
	files := []stateFile{{path: filepath.Join(dir, FileName(id, "data.yaml"))}, {path: filepath.Join(dir, FileName(id, "plugins.yaml")), remove: trimmed == "" || trimmed == "bindings: []"}}
	contents := []string{data, plugins}
	defer func() {
		for _, f := range files {
			if f.next != "" {
				_ = os.Remove(f.next)
			}
		}
	}()
	for i := range files {
		f := &files[i]
		f.mode = 0o644
		st, err := os.Lstat(f.path)
		if err == nil {
			if st.Mode()&os.ModeSymlink != 0 {
				return ErrEscape
			}
			if !st.Mode().IsRegular() {
				return fmt.Errorf("配表状态目标不是普通文件：%s", filepath.Base(f.path))
			}
			f.existed = true
			f.mode = st.Mode().Perm()
			f.old, err = os.ReadFile(f.path)
			if err != nil {
				return err
			}
		} else if !os.IsNotExist(err) {
			return err
		}
		if !f.remove {
			f.next, err = stageStateFile(dir, []byte(contents[i]), f.mode)
			if err != nil {
				return err
			}
		}
	}
	for i, f := range files {
		var err error
		if f.remove {
			if f.existed {
				err = os.Remove(f.path)
			}
		} else {
			err = rename(f.next, f.path)
		}
		if err == nil {
			continue
		}
		for j := i - 1; j >= 0; j-- {
			prev := files[j]
			var rollback error
			if !prev.existed {
				rollback = os.Remove(prev.path)
			} else {
				var staged string
				staged, rollback = stageStateFile(dir, prev.old, prev.mode)
				if rollback == nil {
					rollback = rename(staged, prev.path)
					_ = os.Remove(staged)
				}
			}
			if rollback != nil {
				err = errors.Join(err, fmt.Errorf("回滚失败：%w", rollback))
			}
		}
		return err
	}
	return nil
}
