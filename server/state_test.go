package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/xcoding1024/bit-tables/tables"
)

func TestStateAPI(t *testing.T) {
	_, h, root := testServer(t)
	data := "rows: [{id: filled, power: 33}]\n"
	plugins := "bindings: [{sheet: items, row: filled, field: power, plugin: reference}]\n"
	body, _ := json.Marshal(map[string]string{"data": data, "plugins": plugins})
	res := httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodPut, "/api/tables/item/state", strings.NewReader(string(body))))
	decodeOK(t, res, nil)
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/api/tables/item/files", nil))
	var files tables.Files
	decodeOK(t, res, &files)
	if files.Data != data || files.Plugins != plugins {
		t.Fatal("state did not round trip")
	}
	res = httptest.NewRecorder()
	h.ServeHTTP(res, httptest.NewRequest(http.MethodPut, "/api/tables/item/state", strings.NewReader(`{"data":""}`)))
	if res.Code != http.StatusBadRequest {
		t.Fatalf("missing bindings accepted: %d", res.Code)
	}
	dir, _ := root.Dir("item")
	if err := os.Remove(filepath.Join(dir, "item_plugins.yaml")); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(dir, "item_plugins.yaml"), 0o755); err != nil {
		t.Fatal(err)
	}
	res = httptest.NewRecorder()
	body, _ = json.Marshal(map[string]string{"data": "rows: [{id: rejected}]\n", "plugins": plugins})
	h.ServeHTTP(res, httptest.NewRequest(http.MethodPut, "/api/tables/item/state", strings.NewReader(string(body))))
	if res.Code == http.StatusOK {
		t.Fatal("state accepted invalid plugin file")
	}
	actual, _ := os.ReadFile(filepath.Join(dir, "item_data.yaml"))
	if string(actual) != data {
		t.Fatal("failed save changed data")
	}
}
