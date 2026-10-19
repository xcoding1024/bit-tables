package tables

import (
	"archive/zip"
	"bytes"
	"crypto/md5"
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"
)

// Excel 数据独立于配表结构和数据，只供浏览及插件引用。
type ExcelWorkbook struct {
	File   string       `json:"file"`
	MD5    string       `json:"md5,omitempty"`
	Sheets []ExcelSheet `json:"sheets"`
	Error  string       `json:"error,omitempty"`
}

type ExcelSheet struct {
	Name    string               `json:"name"`
	Rows    int                  `json:"rows"`
	Columns int                  `json:"columns"`
	Cells   map[string]ExcelCell `json:"cells"`
	Merges  []string             `json:"merges"`
	Error   string               `json:"error,omitempty"`
}

type ExcelCell struct {
	Text  string `json:"text"`
	Value any    `json:"value"`
	Error string `json:"error,omitempty"`
}

func (r *Root) readExcel(dir string) []ExcelWorkbook {
	return r.readExcelSources(dir, false)
}

// ExcelHashes 只读取文件内容摘要，不解析工作簿。
func (r *Root) ExcelHashes(id string) ([]ExcelWorkbook, error) {
	stateMu.RLock()
	defer stateMu.RUnlock()
	dir, err := r.Dir(id)
	if err != nil {
		return nil, err
	}
	if _, err := os.Stat(dir); err != nil {
		return nil, err
	}
	return r.readExcelSources(dir, true), nil
}

func (r *Root) readExcelSources(dir string, hashesOnly bool) []ExcelWorkbook {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var books []ExcelWorkbook
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.EqualFold(filepath.Ext(name), ".xlsx") || strings.HasPrefix(name, "~$") {
			continue
		}
		book := ExcelWorkbook{File: name, Sheets: []ExcelSheet{}}
		file := filepath.Join(dir, name)
		resolved, err := filepath.EvalSymlinks(file)
		root, rootErr := filepath.EvalSymlinks(r.Path)
		if err == nil && rootErr == nil {
			rel, relErr := filepath.Rel(root, resolved)
			if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
				err = ErrEscape
			}
		} else if err == nil {
			err = rootErr
		}
		if err == nil {
			var data []byte
			data, err = os.ReadFile(resolved)
			if err == nil {
				book.MD5 = fmt.Sprintf("%x", md5.Sum(data))
				if !hashesOnly {
					book.Sheets, err = readExcelData(data)
				}
			}
		}
		if err != nil {
			book.Sheets = []ExcelSheet{}
			book.Error = "读取 Excel 失败：" + err.Error()
		}
		books = append(books, book)
	}
	sort.Slice(books, func(i, j int) bool { return books[i].File < books[j].File })
	return books
}

// 读取工作表 XML 中实际存在的坐标及缓存标记，避免 GetRows 压缩空白、
// GetCellValue 将合并区域的锚点值填入覆盖单元格，或把无缓存公式当成空值。
func readExcelData(data []byte) ([]ExcelSheet, error) {
	f, err := excelize.OpenReader(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	z, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, err
	}
	parts := map[string]*zip.File{}
	for _, file := range z.File {
		parts[file.Name] = file
	}
	readXML := func(name string, value any) error {
		part := parts[name]
		if part == nil {
			return fmt.Errorf("缺少 %s", name)
		}
		r, err := part.Open()
		if err != nil {
			return err
		}
		defer r.Close()
		return xml.NewDecoder(io.LimitReader(r, 256<<20)).Decode(value)
	}
	var wb struct {
		Sheets []struct {
			Name string `xml:"name,attr"`
			ID   string `xml:"id,attr"`
		} `xml:"sheets>sheet"`
	}
	var rels struct {
		Items []struct {
			ID     string `xml:"Id,attr"`
			Target string `xml:"Target,attr"`
			Mode   string `xml:"TargetMode,attr"`
		} `xml:"Relationship"`
	}
	if err := readXML("xl/workbook.xml", &wb); err != nil {
		return nil, err
	}
	if err := readXML("xl/_rels/workbook.xml.rels", &rels); err != nil {
		return nil, err
	}
	targets := map[string]string{}
	for _, rel := range rels.Items {
		if rel.Mode == "External" {
			continue
		}
		target := path.Clean(path.Join("xl", rel.Target))
		if strings.HasPrefix(rel.Target, "/") {
			target = strings.TrimPrefix(path.Clean(rel.Target), "/")
		}
		targets[rel.ID] = target
	}
	sheets := make([]ExcelSheet, 0, len(wb.Sheets))
	for _, sheet := range wb.Sheets {
		next := ExcelSheet{Name: sheet.Name, Rows: 1, Columns: 1, Cells: map[string]ExcelCell{}, Merges: []string{}}
		var doc struct {
			Rows []struct {
				Cells []struct {
					Ref     string  `xml:"r,attr"`
					Type    string  `xml:"t,attr"`
					Formula *string `xml:"f"`
					Value   *string `xml:"v"`
				} `xml:"c"`
			} `xml:"sheetData>row"`
			Merges []struct {
				Ref string `xml:"ref,attr"`
			} `xml:"mergeCells>mergeCell"`
		}
		if err := readXML(targets[sheet.ID], &doc); err != nil {
			next.Error = "读取工作表失败：" + err.Error()
			sheets = append(sheets, next)
			continue
		}
		grow := func(cell string) {
			col, row, err := excelize.CellNameToCoordinates(cell)
			if err == nil {
				next.Rows = max(next.Rows, row)
				next.Columns = max(next.Columns, col)
			}
		}
		for _, row := range doc.Rows {
			for _, cell := range row.Cells {
				grow(cell.Ref)
				value := ExcelCell{}
				value.Text, err = f.GetCellValue(sheet.Name, cell.Ref)
				if err != nil {
					value.Error = err.Error()
				}
				raw, rawErr := f.GetCellValue(sheet.Name, cell.Ref, excelize.Options{RawCellValue: true})
				if rawErr != nil {
					value.Error = rawErr.Error()
				}
				switch cell.Type {
				case "s", "inlineStr", "str":
					value.Value = raw
				case "b":
					value.Value = raw == "1" || strings.EqualFold(raw, "true")
				case "e":
					value.Value = raw
					value.Error = "Excel 单元格错误：" + raw
				default:
					if raw != "" {
						value.Value, err = strconv.ParseFloat(raw, 64)
						if err != nil || math.IsNaN(value.Value.(float64)) || math.IsInf(value.Value.(float64), 0) {
							value.Value = nil
							value.Error = "无法读取单元格值：" + raw
						}
					}
				}
				if cell.Formula != nil && (cell.Value == nil || (*cell.Value == "" && cell.Type != "str")) {
					value.Value = nil
					value.Text = "需在 Excel 中重算并保存"
					value.Error = "公式缺少已保存结果，请在 Excel 中重算并保存"
				}
				next.Cells[cell.Ref] = value
			}
		}
		for _, merge := range doc.Merges {
			coords := strings.Split(merge.Ref, ":")
			if len(coords) != 2 {
				continue
			}
			aCol, aRow, e1 := excelize.CellNameToCoordinates(coords[0])
			bCol, bRow, e2 := excelize.CellNameToCoordinates(coords[1])
			if e1 != nil || e2 != nil {
				continue
			}
			grow(coords[1])
			next.Merges = append(next.Merges, merge.Ref)
			// 只删除实际存在的覆盖单元格，不展开巨大合并区域。
			for coord := range next.Cells {
				col, row, _ := excelize.CellNameToCoordinates(coord)
				if col >= aCol && col <= bCol && row >= aRow && row <= bRow && coord != coords[0] {
					delete(next.Cells, coord)
				}
			}
		}
		sheets = append(sheets, next)
	}
	return sheets, nil
}
