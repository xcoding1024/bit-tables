package tables

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// SeedDiffFixture 在临时配表根中提供多分页、类型、增删和大表场景。
func SeedDiffFixture(root string, stage int) error {
	field := func(key string) map[string]any { return map[string]any{"key": key, "label": key, "type": "string"} }
	fields := []map[string]any{field("id"), field("name"), field("value"), field("payload")}
	for i := 0; i < 12; i++ {
		fields = append(fields, field(fmt.Sprintf("long_%d", i)))
	}
	if stage < 2 {
		fields = append(fields, field("obsolete"))
	} else {
		fields = append(fields, field("extra"))
	}
	rows := []map[string]any{{"id": "a", "name": "铁剑", "value": 1, "payload": map[string]any{"x": 1, "y": []int{1, 2}}, "obsolete": "旧字段"}, {"id": "deleted", "name": "删除项", "value": 3}}
	if stage > 0 {
		rows[0]["name"], rows[0]["value"] = "历史铁剑", 2
	}
	if stage == 2 {
		delete(rows[0], "obsolete")
		rows[0]["name"], rows[0]["value"], rows[0]["extra"] = "本地铁剑", "2", "新增字段值"
		rows = rows[:1]
	}
	for i := 0; i < 600; i++ {
		rows = append(rows, map[string]any{"id": fmt.Sprintf("row_%d", i), "name": fmt.Sprintf("配置 %d", i), "value": i})
	}
	if stage == 2 {
		rows[1], rows[2] = rows[2], rows[1]
		rows = append(rows, map[string]any{"id": "added", "name": "新增项", "value": 9})
	}
	definitions := []map[string]any{{"id": "main", "name": "道具", "fields": fields}, {"id": "no_id", "name": "无编号", "fields": []map[string]any{field("name"), field("value")}}, {"id": "stable", "name": "相同分页", "fields": []map[string]any{field("id"), field("value")}}}
	data := map[string]any{"main": map[string]any{"rows": rows}, "no_id": map[string]any{"rows": []map[string]any{{"name": "无编号", "value": stage}}}, "stable": map[string]any{"rows": []map[string]any{{"id": "same", "value": true}}}}
	if stage < 2 {
		definitions = append(definitions, map[string]any{"id": "removed", "name": "移除分页", "fields": []map[string]any{field("id")}})
		data["removed"] = map[string]any{"rows": []map[string]any{{"id": "gone"}}}
	} else {
		definitions = append(definitions, map[string]any{"id": "added", "name": "新增分页", "fields": []map[string]any{field("id")}})
		data["added"] = map[string]any{"rows": []map[string]any{{"id": "new"}}}
	}
	dir := filepath.Join(root, "diff_demo")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for name, value := range map[string]any{"struct": map[string]any{"id": "diff_demo", "name": "版本比对示例", "default_sheet": "main", "sheets": definitions}, "data": map[string]any{"sheets": data}} {
		text, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, "diff_demo_"+name+".yaml"), text, 0o644); err != nil {
			return err
		}
	}
	label := []string{"初版卡片", "历史卡片", "本地卡片"}[stage]
	if err := os.WriteFile(filepath.Join(dir, "diff_layout.ts"), []byte(fmt.Sprintf("export const layoutLabel = %q;\n", label)), 0o644); err != nil {
		return err
	}
	editor := `import { layoutLabel } from "./diff_layout";
import importedData from "./diff_demo_data.yaml";
window.BitTableEditor = { mount(el, api) {
  el.innerHTML = "";
  const heading = document.createElement("h2"); heading.dataset.testid = "custom-layout"; heading.textContent = layoutLabel;
  const evidence = document.createElement("span"); evidence.dataset.testid = "imported-data"; evidence.textContent = importedData.includes("本地铁剑") ? "本地依赖数据" : "历史依赖数据";
  el.append(heading, evidence);
  const rows = (api.getData() as { rows: Record<string, unknown>[] }).rows || [];
  rows.forEach((row, index) => {
    const card = document.createElement("section"); card.style.cssText = "margin:12px;padding:12px;border:1px solid #444;border-radius:8px";
    Object.keys(row).forEach((key) => {
      const cell = document.createElement("div"); cell.dataset.role = "cell"; cell.dataset.index = String(index); cell.dataset.key = key;
      cell.textContent = key + ": " + String(typeof row[key] === "object" ? JSON.stringify(row[key]) : row[key]); card.appendChild(cell);
    });
    el.appendChild(card);
  });
} };
`
	if err := os.WriteFile(filepath.Join(dir, "diff_demo_editor.ts"), []byte(editor), 0o644); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "diff_badge.svg"), []byte(fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><text y="15">stage-%d</text></svg>`, stage)), 0o644); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "diff_demo_docs.md"), []byte("## 结构\n多分页配置，字段包含编号、名称、值和对象。\n## 检查规则\n由配表检查器定义。\n## 导出规则\n由配表导出脚本定义客户端与服务端产物。\n"), 0o644)
}
