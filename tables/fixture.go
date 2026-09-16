package tables

import (
	"embed"
	"os"
	"strings"
)

//go:embed testdata/item
var itemFixtureFS embed.FS

func CopyItemFixture(dir, tableID string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	mapping := []struct {
		src  string
		kind string
	}{
		{"item_struct.yaml", "struct.yaml"},
		{"item_data.yaml", "data.yaml"},
		{"item_editor.js", "editor.js"},
		{"item_checker.js", "checker.js"},
	}
	for _, item := range mapping {
		b, err := itemFixtureFS.ReadFile("testdata/item/" + item.src)
		if err != nil {
			return err
		}
		text := strings.ReplaceAll(string(b), "{{TABLE_ID}}", tableID)
		if err := WriteText(dir, tableID, item.kind, text); err != nil {
			return err
		}
	}
	return EnsureHistory(dir, tableID)
}

func (r *Root) SeedItem(tableID string) error {
	if tableID == "" {
		tableID = "item"
	}
	dir, err := r.Dir(tableID)
	if err != nil {
		return err
	}
	return CopyItemFixture(dir, tableID)
}

func SeedRoot(root string) (*Root, error) {
	if err := os.MkdirAll(root, 0o755); err != nil {
		return nil, err
	}
	r, err := Open(root)
	if err != nil {
		return nil, err
	}
	if err := r.SeedItem("item"); err != nil {
		return nil, err
	}
	return r, nil
}
