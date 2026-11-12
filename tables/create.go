package tables

import (
	"fmt"
	"os"
	"path/filepath"

	demotpl "github.com/xcoding1024/bit-tables/demo"
)

func (r *Root) writeNewTable(dir, id string, multiSeason bool) error {
	// 已有项目基类保留原样；新目录补齐独立运行所需的共享基类。
	for _, name := range []string{"types.ts", "dom.ts", "search_select.ts", "season.ts", "season_editor.ts", "column_layout.ts", "array_editor.ts", "editor.ts", "checker.ts", "export.ts"} {
		target := filepath.Join(r.projectRoot(), "src", name)
		if _, err := os.Stat(target); err == nil {
			continue
		}
		content, err := demotpl.TemplateFS.ReadFile("src/" + name)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}
		file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if os.IsExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		_, err = file.Write(content)
		closeErr := file.Close()
		if err != nil {
			return err
		}
		if closeErr != nil {
			return closeErr
		}
	}
	fields := "  - key: id\n    label: id\n    type: string\n    required: true\n"
	if multiSeason {
		fields += "  - key: $season\n    label: 适用赛季\n    type: string\n"
	}
	fields += "  - key: name\n    label: 名称\n    type: string\n"
	files := map[string]string{
		"struct.yaml": fmt.Sprintf("id: %s\nname: %s\nmulti_season: %t\nfields:\n%s", id, id, multiSeason, fields),
		"data.yaml":   "rows: []\n",
		"editor.ts":   "import { BitTableEditorBase } from 'bit-tables.editor';\nwindow.BitTableEditor = new BitTableEditorBase();\n",
		"checker.ts":  "import { BitTableCheckerBase } from 'bit-tables.checker';\nwindow.BitTableChecker = new BitTableCheckerBase();\n",
		"export.ts":   fmt.Sprintf("import { BitTableExporterBase } from 'bit-tables.export';\nconst exporter = new BitTableExporterBase();\nexporter.fileName = '%s.json';\nwindow.BitTableExporter = exporter;\n", id),
		"docs.md":     fmt.Sprintf("# %s\n\n## 结构\n\nmulti_season: %t。id 为业务键，name 为名称。启用多赛季时，适用赛季由 $season 表示，空值为通用兜底。\n\n## 检查规则\n\nid 必填；同键通用行唯一，专属范围不能重叠。之前、之后和区间均包含端点，跨剧本比较。\n\n## 导出规则\n\n客户端和服务端分别导出 %s.json，保留原始配置。具体赛季产物由本表导出规则定义。\n", id, multiSeason, id),
	}
	for kind, text := range files {
		if err := WriteText(dir, id, kind, text); err != nil {
			return err
		}
	}
	return nil
}
