package tables

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func excelTestRoot(t *testing.T) *Root {
	t.Helper()
	root, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root.Path, "combat", "item")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, kind := range []string{"struct.yaml", "data.yaml"} {
		if err := WriteText(dir, "item", kind, "rows: []\n"); err != nil {
			t.Fatal(err)
		}
	}
	for _, name := range []string{"来源 数据.xlsx", "补充.xlsx"} {
		b, err := os.ReadFile(filepath.Join("testdata", "excel", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestExcelContentHashes(t *testing.T) {
	r := excelTestRoot(t)
	dir, _ := r.Dir("item")
	file := filepath.Join(dir, "来源 数据.xlsx")
	original, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	stat, _ := os.Stat(file)
	books, err := r.ExcelHashes("item")
	if err != nil || len(books) != 2 {
		t.Fatalf("摘要读取失败: %#v %v", books, err)
	}
	want := fmt.Sprintf("%x", md5.Sum(original))
	if books[0].MD5 != want || len(books[0].Sheets) != 0 {
		t.Fatalf("摘要不匹配或解析了工作簿: %#v", books[0])
	}
	files, _ := r.Files("item")
	if files.Excel[0].MD5 != want {
		t.Fatal("分页内容与摘要不一致")
	}
	replacement, _ := os.ReadFile(filepath.Join(dir, "补充.xlsx"))
	if err := os.WriteFile(file, replacement, 0o644); err != nil {
		t.Fatal(err)
	}
	// 内容检测不能只依赖修改时间。
	if err := os.Chtimes(file, stat.ModTime(), stat.ModTime()); err != nil {
		t.Fatal(err)
	}
	changed, _ := r.ExcelHashes("item")
	if changed[0].MD5 == want || changed[0].MD5 != fmt.Sprintf("%x", md5.Sum(replacement)) {
		t.Fatal("内容变化未反映到 MD5")
	}
	if _, err := r.ExcelHashes("../item"); err == nil {
		t.Fatal("摘要接口允许目录越界")
	}
}

func TestExcelPreservesCoordinatesValuesAndFormulaCaches(t *testing.T) {
	r := excelTestRoot(t)
	files, err := r.Files("combat/item")
	if err != nil {
		t.Fatal(err)
	}
	if len(files.Excel) != 2 || files.Excel[0].File != "来源 数据.xlsx" || files.Excel[1].File != "补充.xlsx" {
		t.Fatalf("workbooks: %#v", files.Excel)
	}
	book := files.Excel[0]
	if book.Error != "" || len(book.Sheets) != 3 {
		t.Fatalf("sheets: %#v", book)
	}
	if book.Sheets[1].Name != "中文 !() 分页" || book.Sheets[2].Name != "隐藏" {
		t.Fatalf("sheet order: %#v", book.Sheets)
	}
	sheet := book.Sheets[0]
	if sheet.Rows != 7 || sheet.Columns != 5 {
		t.Fatalf("content bounds: %d x %d", sheet.Rows, sheet.Columns)
	}
	for cell, want := range map[string]any{"A1": "原始首行", "A2": "  文本  ", "A3": "换行\n文本", "B2": float64(12), "C2": float64(0.1), "B5": float64(27), "C5": true, "D5": "", "E5": float64(123), "A5": float64(45000)} {
		if got := sheet.Cells[cell]; got.Value != want || got.Error != "" {
			t.Errorf("%s: %#v, want %#v", cell, got, want)
		}
	}
	if sheet.Cells["C2"].Text != "10%" || sheet.Cells["E5"].Text != "00123" || sheet.Cells["B5"].Text != "27" {
		t.Fatalf("formatted values: %#v", sheet.Cells)
	}
	if sheet.Cells["A5"].Text == "45000" {
		t.Fatal("date must use formatted display")
	}
	if sheet.Cells["B6"].Error == "" || sheet.Cells["B6"].Value != nil {
		t.Fatal("missing formula cache accepted")
	}
	if sheet.Cells["C6"].Text != "#DIV/0!" || sheet.Cells["C6"].Error == "" {
		t.Fatal("Excel error lost")
	}
	if len(sheet.Merges) != 1 || sheet.Merges[0] != "D1:E2" || sheet.Cells["D1"].Value != "合并标题" {
		t.Fatalf("merges: %#v", sheet)
	}
	for _, covered := range []string{"D2", "E1", "E2", "A4"} {
		if _, ok := sheet.Cells[covered]; ok {
			t.Errorf("blank or merge cover expanded: %s", covered)
		}
	}
	if _, err := json.Marshal(files); err != nil {
		t.Fatal(err)
	}
}

func TestExcelDiscoveryFailuresAndExportIsolation(t *testing.T) {
	r := excelTestRoot(t)
	dir, _ := r.Dir("combat/item")
	data, _ := os.ReadFile(filepath.Join(dir, "补充.xlsx"))
	for name, contents := range map[string][]byte{"~$临时.xlsx": data, "不读取.xls": data, "损坏.xlsx": []byte("broken"), "大写.XLSX": data} {
		if err := os.WriteFile(filepath.Join(dir, name), contents, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(dir, "child"), 0o755); err != nil {
		t.Fatal(err)
	}
	_ = os.WriteFile(filepath.Join(dir, "child", "嵌套.xlsx"), data, 0o644)
	files, err := r.Files("item")
	if err != nil {
		t.Fatal(err)
	}
	if len(files.Excel) != 4 {
		t.Fatalf("discovery: %#v", files.Excel)
	}
	for _, book := range files.Excel {
		if book.File == "损坏.xlsx" && book.Error == "" {
			t.Fatal("broken workbook did not report error")
		}
	}
	if files.Struct != "rows: []\n" || files.Data != "rows: []\n" {
		t.Fatal("Excel changed config documents")
	}
	exported, err := r.ExportSource("item")
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(exported)
	if err != nil || strings.Contains(string(encoded), "excel") || strings.Contains(string(encoded), "原始首行") {
		t.Fatalf("Excel leaked into export: %s %v", encoded, err)
	}
	list, err := r.List()
	if err != nil || len(list) != 1 || list[0].Path != "combat/item" {
		t.Fatalf("xlsx became a table: %#v %v", list, err)
	}
	before, _ := r.Signature()
	if err := os.Remove(filepath.Join(dir, "补充.xlsx")); err != nil {
		t.Fatal(err)
	}
	after, _ := r.Signature()
	if before == after {
		t.Fatal("Excel deletion not observed")
	}
	files, _ = r.Files("item")
	if len(files.Excel) != 3 {
		t.Fatal("deleted workbook still returned")
	}
	if _, err := r.Files("../item"); err == nil {
		t.Fatal("path escape accepted")
	}
}

func TestExcelRejectsSymlinkOutsideRoot(t *testing.T) {
	r := excelTestRoot(t)
	dir, _ := r.Dir("item")
	outside := filepath.Join(t.TempDir(), "outside.xlsx")
	b, _ := os.ReadFile(filepath.Join(dir, "补充.xlsx"))
	if err := os.WriteFile(outside, b, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "外部.xlsx")); err != nil {
		t.Skipf("system cannot create symlinks: %v", err)
	}
	files, err := r.Files("item")
	if err != nil {
		t.Fatal(err)
	}
	for _, book := range files.Excel {
		if book.File == "外部.xlsx" {
			if !strings.Contains(book.Error, ErrEscape.Error()) {
				t.Fatalf("escape: %#v", book)
			}
			return
		}
	}
	t.Fatal("missing escaped file error")
}
