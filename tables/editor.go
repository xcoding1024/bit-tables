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
  [data-reveal="1"]{outline:2px solid #3794ff;outline-offset:-2px;box-shadow:inset 0 0 0 999px rgba(55,148,255,.22);animation:bit-reveal-flash .7s ease-out}
  @keyframes bit-reveal-flash{0%{box-shadow:inset 0 0 0 999px rgba(55,148,255,.45)}100%{box-shadow:inset 0 0 0 999px rgba(55,148,255,.22)}}
  mark[data-reveal-mark]{background:#e2b340;color:#1a1a1a;padding:0 2px;border-radius:2px}
  td[data-role="cell"],td[data-role="cell-edit"]{user-select:none;-webkit-user-select:none}
  td[data-sel="1"]{background:rgba(55,148,255,.18)}
  td[data-active="1"]:not([data-reveal="1"]){outline:2px solid #3794ff;outline-offset:-2px}
  [data-selecting="1"]{user-select:none;-webkit-user-select:none}
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
  var histories = {};
  var applying = false;
  var MAX_HISTORY = 100;
  var COALESCE_MS = 400;
  function clone(value) {
    if (value == null) return value;
    try { return JSON.parse(JSON.stringify(value)); } catch (err) { return value; }
  }
  function same(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (err) { return a === b; }
  }
  function historyKey() { return sheetId || "main"; }
  function resetHistory() {
    histories[historyKey()] = { undo: [], redo: [], committed: clone(data), lastPushAt: 0 };
  }
  function history() {
    if (!histories[historyKey()]) resetHistory();
    return histories[historyKey()];
  }
  function alignHistory() {
    var h = histories[historyKey()];
    if (!h || !same(h.committed, data)) resetHistory();
  }
  function canUndo() { return history().undo.length > 0; }
  function canRedo() { return history().redo.length > 0; }
  function applySnapshot(next) {
    applying = true;
    data = clone(next);
    history().committed = clone(data);
    mount();
    parent.postMessage({ type: "dirty", data: data }, "*");
    applying = false;
  }
  function undo() {
    var h = history();
    if (!h.undo.length) return;
    h.redo.push(clone(h.committed));
    var prev = h.undo.pop();
    h.lastPushAt = 0;
    applySnapshot(prev);
  }
  function redo() {
    var h = history();
    if (!h.redo.length) return;
    h.undo.push(clone(h.committed));
    var next = h.redo.pop();
    h.lastPushAt = 0;
    applySnapshot(next);
  }
  function recordChange(next) {
    var h = history();
    var snap = clone(next);
    if (same(h.committed, snap)) return;
    var now = Date.now();
    if (!h.undo.length || now - h.lastPushAt >= COALESCE_MS) {
      h.undo.push(h.committed);
      if (h.undo.length > MAX_HISTORY) h.undo.shift();
    }
    h.redo = [];
    h.lastPushAt = now;
    h.committed = snap;
  }
  var api = {
    getStruct: function () { return struct; },
    getData: function () { return data; },
    getEnums: function () { return enums || {}; },
    setData: function (next) {
      if (!applying) recordChange(next);
      else history().committed = clone(next);
      data = next;
      parent.postMessage({ type: "dirty", data: data }, "*");
    },
    save: function () { parent.postMessage({ type: "save", data: data }, "*"); },
    askAI: function (mode, prompt) { parent.postMessage({ type: "askAI", mode: mode, prompt: prompt }, "*"); },
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    assetURL: function (rel) {
      var m = String(location.pathname || "").match(/\/api\/tables\/([^/]+)\/editor/);
      var id = m ? decodeURIComponent(m[1]) : "";
      if (!id || rel == null || rel === "") return "";
      return "/api/tables/" + encodeURIComponent(id) + "/asset?path=" + encodeURIComponent(String(rel));
    }
  };
  function attrEscape(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }
  function applyReveal(target) {
    if (!target) return;
    var editor = window.BitTableEditor;
    if (editor && typeof editor.reveal === "function") {
      editor.reveal(target);
      requestAnimationFrame(function () {
        var el = findRevealEl(target);
        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", inline: "nearest" });
      });
      return;
    }
    requestAnimationFrame(function () {
      markRevealDom(target);
    });
  }
  function scheduleReveal(target) {
    if (!target) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { applyReveal(target); });
    });
  }
  function findRevealEl(target) {
    var ri = target.rowIndex;
    var key = String(target.field || "");
    var el = null;
    if (key) {
      el = root.querySelector('[data-role="cell"][data-index="' + ri + '"][data-key="' + attrEscape(key) + '"]')
        || root.querySelector('[data-role="cell-edit"][data-index="' + ri + '"][data-key="' + attrEscape(key) + '"]')
        || root.querySelector('[data-testid$="-' + attrEscape(key) + '-' + ri + '"]');
    }
    if (!el) {
      el = root.querySelector('[data-testid$="row-' + ri + '"]')
        || root.querySelector('[data-testid="fallback-row-' + ri + '"]');
    }
    return el;
  }
  function clearReveal() {
    var editor = window.BitTableEditor;
    if (editor && typeof editor.clearReveal === "function") {
      editor.clearReveal();
      return;
    }
    var prev = root.querySelectorAll("[data-reveal='1']");
    for (var i = 0; i < prev.length; i++) prev[i].removeAttribute("data-reveal");
  }
  function markRevealDom(target) {
    var prev = root.querySelectorAll("[data-reveal='1']");
    for (var i = 0; i < prev.length; i++) prev[i].removeAttribute("data-reveal");
    var el = findRevealEl(target);
    if (!el) return;
    el.setAttribute("data-reveal", "1");
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", inline: "nearest" });
  }
  function mount() {
    root.innerHTML = "";
    if (window.BitTableEditor && typeof window.BitTableEditor.mount === "function") {
      window.BitTableEditor.mount(root, api);
    }
  }
  window.addEventListener("message", function (ev) {
    var msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "reveal") {
      scheduleReveal(msg);
      return;
    }
    if (msg.type === "clearReveal") {
      clearReveal();
      return;
    }
    if (msg.type === "init" || msg.type === "setSheet") {
      var prevSheet = sheetId;
      if (msg.struct != null) struct = msg.struct;
      if (msg.sheetId != null) sheetId = msg.sheetId;
      if (msg.enums != null) enums = msg.enums;
      var sameSheet = msg.type === "setSheet" && prevSheet && sheetId === prevSheet;
      if (!sameSheet) {
        if (msg.data != null) data = msg.data;
        alignHistory();
      } else if (msg.data != null && !canUndo() && !canRedo()) {
        data = msg.data;
        alignHistory();
      }
      mount();
      if (msg.reveal) scheduleReveal(msg.reveal);
    } else if (msg.type === "replaceData") {
      if (msg.struct != null) struct = msg.struct;
      if (msg.sheetId != null) sheetId = msg.sheetId;
      data = msg.data;
      if (msg.enums != null) enums = msg.enums;
      alignHistory();
      mount();
      if (msg.reveal) scheduleReveal(msg.reveal);
    } else if (msg.type === "undo") {
      undo();
    } else if (msg.type === "redo") {
      redo();
    } else if (msg.type === "save") {
      api.save();
    }
  });
  window.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      var editor = window.BitTableEditor;
      if (editor && typeof editor.clearReveal === "function") return;
      ev.preventDefault();
      clearReveal();
      return;
    }
    var key = String(ev.key || "").toLowerCase();
    var mod = ev.ctrlKey || ev.metaKey;
    if (!mod || ev.altKey) return;
    if (key === "s") {
      ev.preventDefault();
      api.save();
    } else if (key === "p" || key === "f") {
      ev.preventDefault();
      parent.postMessage({ type: "shortcut", key: key }, "*");
    } else if (key === "z" && ev.shiftKey) {
      ev.preventDefault();
      redo();
    } else if (key === "z") {
      ev.preventDefault();
      undo();
    } else if (key === "y") {
      ev.preventDefault();
      redo();
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
      html += '<div style="margin-bottom:8px;color:#a3a3a3">缺少 editor.ts，简易回退</div>';
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
        html += '<tr data-testid="fallback-row-' + ri + '">';
        keys.forEach(function (k) {
          html += '<td data-role="cell" data-index="' + ri + '" data-key="' + esc(k) + '" style="padding:6px;border-bottom:1px solid #3a3a3a">' + esc(row[k] || "") + "</td>";
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
