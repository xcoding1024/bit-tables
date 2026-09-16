package server

import (
	"bufio"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/xcoding1024/bit-tables/tables"
)

func decodeOK(t *testing.T, res *httptest.ResponseRecorder, dest any) {
	t.Helper()
	var env struct {
		OK   bool            `json:"ok"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &env); err != nil {
		t.Fatalf("json %s", res.Body.String())
	}
	if !env.OK {
		t.Fatalf("not ok %s", res.Body.String())
	}
	if dest != nil {
		if err := json.Unmarshal(env.Data, dest); err != nil {
			t.Fatalf("data %s", res.Body.String())
		}
	}
}

func TestServeRepoFixtures(t *testing.T) {
	root, err := tables.Open(filepath.Join("..", "fixtures"))
	if err != nil {
		t.Fatal(err)
	}
	srv := New(root)
	t.Cleanup(srv.Close)
	h := srv.Handler()
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables", nil))
	var list struct {
		Tables []tables.Info `json:"tables"`
	}
	decodeOK(t, res, &list)
	if len(list.Tables) != 1 || list.Tables[0].ID != "item" || !list.Tables[0].Complete {
		t.Fatalf("fixtures list %#v", list.Tables)
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "data-testid=\"tables-page\"") && !strings.Contains(res.Body.String(), "bit-tables") {
		t.Fatalf("index %d", res.Code)
	}
}

func testServer(t *testing.T) (*Server, http.Handler, *tables.Root) {
	t.Helper()
	root, err := tables.SeedRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	srv := New(root)
	t.Cleanup(srv.Close)
	return srv, srv.Handler(), root
}

func TestListCreateTraversalAndData(t *testing.T) {
	_, h, _ := testServer(t)

	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/root", nil))
	if res.Code != 200 {
		t.Fatalf("root %d %s", res.Code, res.Body.String())
	}
	var rootView struct {
		Path string `json:"path"`
	}
	decodeOK(t, res, &rootView)
	if rootView.Path == "" {
		t.Fatal("empty path")
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables", nil))
	var list struct {
		Tables []tables.Info `json:"tables"`
	}
	decodeOK(t, res, &list)
	if len(list.Tables) != 1 || list.Tables[0].ID != "item" || !list.Tables[0].Complete {
		t.Fatalf("list %#v", list.Tables)
	}

	res = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/tables", strings.NewReader(`{"id":"../etc"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 400 {
		t.Fatalf("escape create %d %s", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/../etc/files", nil))
	if res.Code == 200 {
		t.Fatalf("traversal files %d %s", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/tables/item/data", strings.NewReader(`{"data":"rows:\n  - id: sword\n    name: 钢剑\n"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("put data %d %s", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/files", nil))
	var files tables.Files
	decodeOK(t, res, &files)
	if !strings.Contains(files.Data, "钢剑") {
		t.Fatalf("saved %s", files.Data)
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/editor", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "BitTableEditor") {
		t.Fatalf("editor %d %s", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "bit-tables") {
		t.Fatalf("index %d %s", res.Code, res.Body.String())
	}
}

func TestAppendHistoryAPI(t *testing.T) {
	_, h, _ := testServer(t)
	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/tables/item/history", strings.NewReader(`{"mode":"struct","who":"demo","user":"生成技能表","agent":"已生成四件套","when":"2026-09-16 10:00:00 +08:00"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("history %d %s", res.Code, res.Body.String())
	}
	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/tables/item/history", strings.NewReader(`{"mode":"data","who":"demo","user":"加一行","agent":"已更新数据","when":"2026-09-16 10:01:00 +08:00"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("history data %d %s", res.Code, res.Body.String())
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/files", nil))
	var files tables.Files
	decodeOK(t, res, &files)
	_, structBody, dataBody := tables.SplitHistory(files.History, "item")
	if !strings.Contains(structBody, "生成技能表") || strings.Contains(dataBody, "生成技能表") {
		t.Fatalf("leak %s", files.History)
	}
	if !strings.Contains(dataBody, "加一行") {
		t.Fatalf("data missing %s", files.History)
	}
}

func TestCreateEmptyTableUsesFallbackEditor(t *testing.T) {
	_, h, _ := testServer(t)
	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/tables", strings.NewReader(`{"id":"skill"}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 201 {
		t.Fatalf("create %d %s", res.Code, res.Body.String())
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/skill/editor", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "table-fallback") {
		t.Fatalf("fallback editor %d %s", res.Code, res.Body.String())
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/skill/files", nil))
	var files tables.Files
	decodeOK(t, res, &files)
	if !strings.Contains(files.History, "<!-- bit-history:struct -->") {
		t.Fatalf("empty history %s", files.History)
	}
}

func TestWatchSSEAfterDataWrite(t *testing.T) {
	_, h, root := testServer(t)
	ts := httptest.NewServer(h)
	t.Cleanup(ts.Close)

	time.Sleep(500 * time.Millisecond)
	got := make(chan string, 1)
	go func() {
		res, err := http.Get(ts.URL + "/api/events")
		if err != nil {
			got <- "err:" + err.Error()
			return
		}
		defer res.Body.Close()
		rd := bufio.NewReader(res.Body)
		for {
			line, err := rd.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					got <- "err:" + err.Error()
				}
				return
			}
			if strings.HasPrefix(line, "event: file_changed") {
				got <- "ok"
				return
			}
		}
	}()

	time.Sleep(200 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(root.Path, "item", "item_data.yaml"), []byte("rows:\n  - id: sword\n    name: 钢剑\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	select {
	case msg := <-got:
		if !strings.HasPrefix(msg, "ok") {
			t.Fatalf("sse %s", msg)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting file_changed")
	}
}
