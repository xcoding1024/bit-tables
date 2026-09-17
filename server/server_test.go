package server

import (
	"bufio"
	"encoding/json"
	"io"
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
	root, err := tables.Open(filepath.Join("..", "demo", "tables"))
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
	var sheetDemo *tables.Info
	for i := range list.Tables {
		if list.Tables[i].ID == "sheet_demo" {
			sheetDemo = &list.Tables[i]
		}
	}
	if sheetDemo == nil || !sheetDemo.Complete {
		t.Fatalf("demo tables %#v", list.Tables)
	}
	if _, err := root.ResolveAsset("sheet_demo", "res/item_icons/iron_sword.png"); err != nil {
		t.Fatalf("demo asset %v", err)
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "data-testid=\"tables-page\"") && !strings.Contains(res.Body.String(), "bit-tables") {
		t.Fatalf("index %d", res.Code)
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/sheet_demo/editor", nil))
	body := res.Body.String()
	if res.Code != 200 || strings.Contains(body, `from "bit-tables.`) || strings.Contains(body, "缺少 editor") || !strings.Contains(body, "view-table") || !strings.Contains(body, "SheetDemo") {
		t.Fatalf("editor %d fallback=%v import=%v sheet=%v", res.Code, strings.Contains(body, "缺少 editor"), strings.Contains(body, `from "bit-tables.`), strings.Contains(body, "SheetDemo"))
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
		Path  string `json:"path"`
		Guide bool   `json:"guide"`
	}
	decodeOK(t, res, &rootView)
	if rootView.Path == "" {
		t.Fatal("empty path")
	}
	if rootView.Guide {
		t.Fatal("guide should be off")
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
	if !strings.Contains(res.Header().Get("Content-Security-Policy"), "img-src") {
		t.Fatalf("editor csp %s", res.Header().Get("Content-Security-Policy"))
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/", nil))
	if res.Code != 200 || !strings.Contains(res.Body.String(), "bit-tables") {
		t.Fatalf("index %d %s", res.Code, res.Body.String())
	}
}

func TestTableAsset(t *testing.T) {
	_, h, root := testServer(t)
	dir := filepath.Join(filepath.Dir(root.Path), "res", "item_icons")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	icon := filepath.Join(dir, "probe.png")
	if err := os.WriteFile(icon, []byte("png"), 0o644); err != nil {
		t.Fatal(err)
	}

	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/asset?path="+url.QueryEscape("res/item_icons/probe.png"), nil))
	if res.Code != 200 || res.Body.String() != "png" {
		t.Fatalf("asset %d %q", res.Code, res.Body.String())
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/asset?path="+url.QueryEscape("../../secret.png"), nil))
	if res.Code == 200 {
		t.Fatalf("escaped asset allowed")
	}
}

func TestFilesIncludeDocsAndExport(t *testing.T) {
	_, h, _ := testServer(t)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/files", nil))
	var files tables.Files
	decodeOK(t, res, &files)
	if !files.HasExport || !strings.Contains(files.Export, "BitTableExporter") {
		t.Fatalf("export %#v", files)
	}
	if !files.HasDocs || tables.DocsSection(files.Docs, tables.ModeStruct) == "" {
		t.Fatalf("docs %s", files.Docs)
	}
	if !strings.Contains(files.Docs, "## 检查规则") || !strings.Contains(files.Docs, "## 导出规则") {
		t.Fatalf("docs headings %s", files.Docs)
	}
}

func TestHistoryAPIWithoutVCS(t *testing.T) {
	_, h, _ := testServer(t)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/history", nil))
	var hist tables.History
	decodeOK(t, res, &hist)
	if hist.ID != "item" || hist.VCS != "" || hist.Entries == nil {
		t.Fatalf("%#v", hist)
	}
}

func TestPutRootSwitchesDirectory(t *testing.T) {
	_, h, _ := testServer(t)
	other, err := tables.SeedRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := other.Create("skill"); err != nil {
		t.Fatal(err)
	}

	payload, err := json.Marshal(map[string]any{"path": other.Path})
	if err != nil {
		t.Fatal(err)
	}
	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/root", strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("put root %d %s", res.Code, res.Body.String())
	}
	var view struct {
		Path  string `json:"path"`
		Guide bool   `json:"guide"`
	}
	decodeOK(t, res, &view)
	if view.Path != other.Path || view.Guide {
		t.Fatalf("put view %#v", view)
	}

	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables", nil))
	var list struct {
		Tables []tables.Info `json:"tables"`
		Path   string        `json:"path"`
	}
	decodeOK(t, res, &list)
	if list.Path != other.Path {
		t.Fatalf("list path %s want %s", list.Path, other.Path)
	}
	if len(list.Tables) != 2 {
		t.Fatalf("tables %#v", list.Tables)
	}

	empty := t.TempDir()
	payload, err = json.Marshal(map[string]any{"path": empty, "sample": true})
	if err != nil {
		t.Fatal(err)
	}
	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/root", strings.NewReader(string(payload)))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 200 {
		t.Fatalf("put sample %d %s", res.Code, res.Body.String())
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables", nil))
	decodeOK(t, res, &list)
	if len(list.Tables) != 1 || list.Tables[0].ID != "item" || !list.Tables[0].Complete {
		t.Fatalf("sample %#v", list.Tables)
	}

	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/root", strings.NewReader(`{"path":""}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 400 {
		t.Fatalf("empty path %d %s", res.Code, res.Body.String())
	}
}

func TestRootGuideFlag(t *testing.T) {
	srv, h, _ := testServer(t)
	srv.Guide = true
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/root", nil))
	var view struct {
		Path  string `json:"path"`
		Guide bool   `json:"guide"`
	}
	decodeOK(t, res, &view)
	if !view.Guide || view.Path == "" {
		t.Fatalf("guide %#v", view)
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
	if !files.HasDocs || !strings.Contains(files.Docs, "## 结构") || !strings.Contains(files.Docs, "## 检查规则") || !strings.Contains(files.Docs, "## 导出规则") {
		t.Fatalf("empty docs %s", files.Docs)
	}
	if files.HasExport || files.Export != "" {
		t.Fatalf("empty table should not have export: %#v", files)
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

func TestExportWritesAndRejectsTraversal(t *testing.T) {
	_, h, root := testServer(t)
	wantDir := filepath.Join(filepath.Dir(root.Path), "export")

	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/export", nil))
	var info struct {
		Path string `json:"path"`
	}
	decodeOK(t, res, &info)
	if info.Path != wantDir {
		t.Fatalf("export path %s want %s", info.Path, wantDir)
	}

	res = httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/export", strings.NewReader(`{"files":[{"name":"item.json","content":"{}"}]}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	var wrote struct {
		Path    string   `json:"path"`
		Written []string `json:"written"`
	}
	decodeOK(t, res, &wrote)
	if wrote.Path != wantDir || len(wrote.Written) != 1 || wrote.Written[0] != "item.json" {
		t.Fatalf("write %#v", wrote)
	}
	got, err := os.ReadFile(filepath.Join(wantDir, "item.json"))
	if err != nil || string(got) != "{}" {
		t.Fatalf("disk %s %v", got, err)
	}

	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/export", strings.NewReader(`{"files":[{"name":"lua/item.json","content":"1"}]}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	decodeOK(t, res, &wrote)
	if len(wrote.Written) != 1 || wrote.Written[0] != "lua/item.json" {
		t.Fatalf("nested %#v", wrote)
	}
	got, err = os.ReadFile(filepath.Join(wantDir, "lua", "item.json"))
	if err != nil || string(got) != "1" {
		t.Fatalf("nested disk %s %v", got, err)
	}

	res = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPost, "/api/export", strings.NewReader(`{"files":[{"name":"../secret.json","content":"x"}]}`))
	req.Header.Set("Content-Type", "application/json")
	h.ServeHTTP(res, req)
	if res.Code != 400 {
		t.Fatalf("traversal %d %s", res.Code, res.Body.String())
	}
	if _, err := os.Stat(filepath.Join(filepath.Dir(wantDir), "secret.json")); err == nil {
		t.Fatal("escaped write")
	}
}

