package server

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/xcoding1024/bit-tables/tables"
)

func TestExcelFileAPIAndExportIsolation(t *testing.T) {
	root, err := tables.Open(filepath.Join("..", "demo", "tables"))
	if err != nil {
		t.Fatal(err)
	}
	s := New(root)
	t.Cleanup(s.Close)
	res := httptest.NewRecorder()
	s.Handler().ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/sheet_demo/files", nil))
	var files tables.Files
	decodeOK(t, res, &files)
	if len(files.Excel) != 2 || len(files.Excel[0].Sheets) != 3 || files.Excel[0].Sheets[0].Cells["B5"].Value != float64(27) {
		t.Fatalf("Excel API: %#v", files.Excel)
	}
	res = httptest.NewRecorder()
	s.Handler().ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/sheet_demo/files?view=export", nil))
	var source tables.ExportSource
	decodeOK(t, res, &source)
	if strings.Contains(res.Body.String(), `"excel"`) || strings.Contains(source.Data, "原始首行") {
		t.Fatal("Excel leaked into export")
	}
}
