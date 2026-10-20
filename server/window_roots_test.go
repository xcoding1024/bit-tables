package server

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/xcoding1024/bit-tables/tables"
)

func TestWindowRootIsolation(t *testing.T) {
	_, h, mainRoot := testServer(t)
	childRoot, err := tables.SeedRoot(filepath.Join(t.TempDir(), "tables"))
	if err != nil {
		t.Fatal(err)
	}
	scoped := func(route string) string {
		sep := "?"
		if strings.Contains(route, "?") {
			sep = "&"
		}
		return route + sep + "rootPath=" + url.QueryEscape(childRoot.Path)
	}
	call := func(method, route string, body any) *httptest.ResponseRecorder {
		t.Helper()
		data, _ := json.Marshal(body)
		res := httptest.NewRecorder()
		h.ServeHTTP(res, httptest.NewRequest(method, route, strings.NewReader(string(data))))
		return res
	}
	before, err := mainRoot.Files("item")
	if err != nil {
		t.Fatal(err)
	}
	decodeOK(t, call("PUT", scoped("/api/tables/item/state"), map[string]string{
		"data": "rows:\n  - id: child_only\n", "plugins": "bindings: []\n",
	}), nil)
	after, _ := mainRoot.Files("item")
	if before.Data != after.Data {
		t.Fatal("子窗口写入修改了主目录")
	}
	var files tables.Files
	decodeOK(t, call("GET", scoped("/api/tables/item/files"), nil), &files)
	if !strings.Contains(files.Data, "child_only") {
		t.Fatal("子窗口未读取自己的数据")
	}
	for _, route := range []string{"/api/root", "/api/tables", "/api/tables/item/history", "/api/tables/item/files?view=export", "/api/plugins"} {
		decodeOK(t, call("GET", scoped(route), nil), nil)
	}
	if err := os.WriteFile(filepath.Join(childRoot.Path, "item", "window.svg"), []byte("<svg>child</svg>"), 0644); err != nil {
		t.Fatal(err)
	}
	asset := call("GET", scoped("/api/tables/item/asset?path=./window.svg"), nil)
	if asset.Code != 200 || asset.Body.String() != "<svg>child</svg>" {
		t.Fatalf("asset %d %s", asset.Code, asset.Body.String())
	}
	editor := call("GET", scoped("/api/tables/item/editor"), nil)
	if editor.Code != 200 || !strings.Contains(editor.Body.String(), `get("rootPath")`) {
		t.Fatal("编辑器缺少独立资源路径")
	}
	decodeOK(t, call("POST", scoped("/api/export"), map[string]any{
		"client": []map[string]string{{"name": "window.json", "content": "child"}},
		"server": []map[string]string{},
	}), nil)
	if _, err := os.Stat(filepath.Join(childRoot.ExportDir(tables.ExportSideClient), "window.json")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(mainRoot.ExportDir(tables.ExportSideClient), "window.json")); !os.IsNotExist(err) {
		t.Fatal("导出写入了主目录")
	}
	decodeOK(t, call("PUT", scoped("/api/root"), map[string]string{"path": childRoot.Path}), nil)
	var root struct{ Path string }
	decodeOK(t, call("GET", "/api/root", nil), &root)
	if root.Path != mainRoot.Path {
		t.Fatal("子窗口切目录影响了主窗口")
	}
	for _, dir := range []string{"", "relative", "../tables"} {
		if res := call("GET", "/api/root?rootPath="+url.QueryEscape(dir), nil); res.Code != 400 {
			t.Fatalf("非法目录被接受: %q", dir)
		}
	}
}

func TestWindowEventsFollowOwnRoot(t *testing.T) {
	s, _, mainRoot := testServer(t)
	childRoot, err := tables.SeedRoot(filepath.Join(t.TempDir(), "tables"))
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", ts.URL+"/api/events?rootPath="+url.QueryEscape(childRoot.Path), nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	events := make(chan string, 8)
	go func() {
		scanner := bufio.NewScanner(res.Body)
		for scanner.Scan() {
			if strings.HasPrefix(scanner.Text(), "data: ") {
				events <- scanner.Text()
			}
		}
	}()
	if err := mainRoot.PutData("item", "rows: []\n"); err != nil {
		t.Fatal(err)
	}
	select {
	case ev := <-events:
		t.Fatalf("收到主目录事件: %s", ev)
	case <-time.After(900 * time.Millisecond):
	}
	if err := childRoot.PutData("item", "rows: []\n"); err != nil {
		t.Fatal(err)
	}
	select {
	case <-events:
	case <-time.After(3 * time.Second):
		t.Fatal("未收到子目录事件")
	}
	cancel()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		n := len(s.windows)
		s.mu.Unlock()
		if n == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("子窗口监听未释放")
}
