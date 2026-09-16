package tables

import "strings"

func EditorHTML(editorJS string) string {
	editorJS = strings.ReplaceAll(editorJS, "</script", "<\\/script")
	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  html,body,#root{margin:0;height:100%;overflow:hidden;background:#0a0a0a;color:#f5f5f5;font:13px Inter,Segoe UI,system-ui,sans-serif;color-scheme:dark}
  *{box-sizing:border-box;scrollbar-width:thin;scrollbar-color:#525252 #1a1a1a}
  *::-webkit-scrollbar{width:8px;height:8px}
  *::-webkit-scrollbar-track{background:#1a1a1a}
  *::-webkit-scrollbar-thumb{background:#525252;border-radius:4px}
  *::-webkit-scrollbar-thumb:hover{background:#737373}
  *::-webkit-scrollbar-corner{background:#1a1a1a}
</style>
</head>
<body>
<div id="root"></div>
<script>
` + editorJS + `
</script>
<script>
(function () {
  var root = document.getElementById("root");
  var struct = null;
  var data = null;
  var sheetId = "";
  var enums = {};
  var api = {
    getStruct: function () { return struct; },
    getData: function () { return data; },
    getEnums: function () { return enums || {}; },
    setData: function (next) {
      data = next;
      parent.postMessage({ type: "dirty", data: data }, "*");
    },
    save: function () { parent.postMessage({ type: "save", data: data }, "*"); },
    askAI: function (mode, prompt) { parent.postMessage({ type: "askAI", mode: mode, prompt: prompt }, "*"); },
    assetURL: function (rel) {
      var m = String(location.pathname || "").match(/\/api\/tables\/([^/]+)\/editor/);
      var id = m ? decodeURIComponent(m[1]) : "";
      if (!id || rel == null || rel === "") return "";
      return "/api/tables/" + encodeURIComponent(id) + "/asset?path=" + encodeURIComponent(String(rel));
    }
  };
  function mount() {
    root.innerHTML = "";
    if (window.BitTableEditor && typeof window.BitTableEditor.mount === "function") {
      window.BitTableEditor.mount(root, api);
    }
  }
  window.addEventListener("message", function (ev) {
    var msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "init" || msg.type === "setSheet") {
      if (msg.struct != null) struct = msg.struct;
      if (msg.data != null) data = msg.data;
      if (msg.sheetId != null) sheetId = msg.sheetId;
      if (msg.enums != null) enums = msg.enums;
      mount();
    } else if (msg.type === "replaceData") {
      data = msg.data;
      if (msg.enums != null) enums = msg.enums;
      mount();
    }
  });
  parent.postMessage({ type: "ready" }, "*");
})();
</script>
</body>
</html>
`
}

func FallbackEditorJS() string {
	return `window.BitTableEditor = {
  mount: function (el, api) {
    var data = api.getData() || { rows: [] };
    if (!data.rows) data.rows = [];
    function esc(s) {
      return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    }
    function render() {
      var rows = data.rows || [];
      var html = '<div data-testid="table-fallback" style="padding:12px">';
      html += '<div style="margin-bottom:8px;color:#a3a3a3">缺少 editor.js，简易回退</div>';
      html += '<table style="width:100%;border-collapse:collapse"><thead><tr>';
      var keys = [];
      for (var i = 0; i < rows.length; i++) {
        Object.keys(rows[i] || {}).forEach(function (k) {
          if (keys.indexOf(k) < 0) keys.push(k);
        });
      }
      if (!keys.length) keys = ["id", "name"];
      keys.forEach(function (k) {
        html += '<th style="text-align:left;color:#a3a3a3;padding:6px;border-bottom:1px solid #3a3a3a">' + esc(k) + "</th>";
      });
      html += "</tr></thead><tbody>";
      rows.forEach(function (row, ri) {
        html += "<tr>";
        keys.forEach(function (k) {
          html += '<td style="padding:6px;border-bottom:1px solid #3a3a3a">' + esc(row[k] || "") + "</td>";
        });
        html += "</tr>";
      });
      html += "</tbody></table>";
      html += '<button data-testid="fallback-save" type="button" style="margin-top:12px;height:28px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px">保存</button>';
      html += "</div>";
      el.innerHTML = html;
      var btn = el.querySelector("[data-testid=fallback-save]");
      if (btn) btn.addEventListener("click", function () { api.save(); });
    }
    render();
  }
};`
}
