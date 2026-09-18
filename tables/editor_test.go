package tables

import (
	"strings"
	"testing"
)

func TestEditorHTMLIncludesUndoRedo(t *testing.T) {
	html := EditorHTML("window.BitTableEditor={mount:function(){}}")
	for _, needle := range []string{
		"function undo()",
		"function redo()",
		"canUndo",
		"canRedo",
		"COALESCE_MS",
		"keydown",
		"alignHistory()",
		"replaceData",
		"msg.struct != null",
		`msg.type === "undo"`,
		`msg.type === "redo"`,
		`msg.type === "reveal"`,
		"function applyReveal",
		"function scheduleReveal",
		"function markRevealDom",
		"function clearReveal",
		`msg.type === "clearReveal"`,
		`ev.key === "Escape"`,
		`key === "s"`,
	} {
		if !strings.Contains(html, needle) {
			t.Fatalf("EditorHTML missing %q", needle)
		}
	}
	if strings.Contains(html, "</script>") && !strings.Contains(html, `<script>`) {
		t.Fatal("unexpected raw script close")
	}
}
