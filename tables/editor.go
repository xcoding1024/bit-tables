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
  html,body,#root{margin:0;height:100%;overflow:auto;background:#0a0a0a;color:#f5f5f5;font:13px Inter,Segoe UI,system-ui,sans-serif;color-scheme:dark}
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
  var tableId = "";
  var sheetId = "";
  var pluginCells = [];
  var pluginBindings = [];
  var stateSeq = 0;
  var statePending = {};
  var stateBusy = false;
  var editorEditing = false;
  function reportEditing() {
    var active = document.activeElement;
    var editing = Boolean(active && active.matches && active.matches("input, textarea, select, [contenteditable='true']"));
    if (editing === editorEditing) return;
    editorEditing = editing;
    parent.postMessage({ type: "editorEditing", editing: editing }, "*");
  }
  document.addEventListener("focusin", reportEditing, true);
  document.addEventListener("focusout", function () { setTimeout(reportEditing, 0); }, true);
  new MutationObserver(reportEditing).observe(root, { childList: true, subtree: true });
  var pluginPicking = false;
  var pluginPickAnchor = null;
  var pluginPickFocus = null;
  var pluginDragging = false;
  var pluginSources = [];
  var pluginPaintPending = false;
  var pluginOverlay = document.createElement("div");
  pluginOverlay.setAttribute("data-testid", "plugin-source-overlays");
  pluginOverlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:1000;overflow:hidden";
  document.body.appendChild(pluginOverlay);
  function paintPluginSources() {
    pluginPaintPending = false;
    pluginOverlay.innerHTML = "";
    root.querySelectorAll("[data-plugin-source]").forEach(function (el) { el.removeAttribute("data-plugin-source"); });
    var rows = (data && data.rows) || [];
    var fields = (struct && struct.fields) || [];
    var seen = {};
    pluginSources.forEach(function (source) {
      var field = String(source.field || "");
      var row = String(source.row || "*");
      var endField = String(source.endField || field);
      var endRow = String(source.endRow || row);
      var key = field + "\t" + row + "\t" + endField + "\t" + endRow + "\t" + source.pluginName;
      if (!field || seen[key]) return;
      seen[key] = true;
      var firstCol = fields.findIndex(function (f) { return f.key === field; });
      var lastCol = fields.findIndex(function (f) { return f.key === endField; });
      var rowId = function (item, index) { return String(item.id == null || item.id === "" ? "#" + index : item.id); };
      var firstRow = row === "*" ? 0 : rows.findIndex(function (item, index) { return rowId(item, index) === row; });
      var lastRow = row === "*" ? rows.length - 1 : rows.findIndex(function (item, index) { return rowId(item, index) === endRow; });
      if (firstCol < 0 || lastCol < 0 || firstRow < 0 || lastRow < 0) return;
      var nodes = [];
      root.querySelectorAll('[data-role="cell"], [data-role="cell-edit"]').forEach(function (el) {
        var ci = fields.findIndex(function (f) { return f.key === el.getAttribute("data-key"); });
        var index = Number(el.getAttribute("data-index"));
        if (ci >= Math.min(firstCol, lastCol) && ci <= Math.max(firstCol, lastCol)
          && index >= Math.min(firstRow, lastRow) && index <= Math.max(firstRow, lastRow)) nodes.push(el);
      });
      if (row === "*") {
        root.querySelectorAll('[data-role="col-head"]').forEach(function (el) {
          var ci = Number(el.getAttribute("data-col"));
          if (ci >= Math.min(firstCol, lastCol) && ci <= Math.max(firstCol, lastCol)) nodes.unshift(el);
        });
      }
      if (!nodes.length) return;
      var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      nodes.forEach(function (el) {
        el.setAttribute("data-plugin-source", "1");
        var rect = el.getBoundingClientRect();
        left = Math.min(left, rect.left); top = Math.min(top, rect.top);
        right = Math.max(right, rect.right); bottom = Math.max(bottom, rect.bottom);
      });
      var clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      for (var parentEl = nodes[0].parentElement; parentEl; parentEl = parentEl.parentElement) {
        var style = getComputedStyle(parentEl);
        var bounds = parentEl.getBoundingClientRect();
        if (/(auto|scroll|hidden)/.test(style.overflowX)) { clip.left = Math.max(clip.left, bounds.left); clip.right = Math.min(clip.right, bounds.right); }
        if (/(auto|scroll|hidden)/.test(style.overflowY)) { clip.top = Math.max(clip.top, bounds.top); clip.bottom = Math.min(clip.bottom, bounds.bottom); }
      }
      left = Math.max(left, clip.left); top = Math.max(top, clip.top);
      right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom);
      if (right <= left || bottom <= top) return;
      var box = document.createElement("div");
      box.setAttribute("data-testid", "plugin-source-mark");
      box.setAttribute("data-field", field);
      box.setAttribute("data-row", row);
      box.style.cssText = "position:absolute;border:2px dashed #e2b340;box-sizing:border-box;left:" + left + "px;top:" + top + "px;width:" + (right-left) + "px;height:" + (bottom-top) + "px";
      var label = document.createElement("span");
      label.textContent = source.label || source.pluginName || "";
      label.title = label.textContent;
      label.style.cssText = "position:absolute;right:0;top:" + (top >= 18 ? "-18px" : "0") + ";background:#332b11;color:#ffdf80;padding:1px 4px;font-size:11px;white-space:nowrap;max-width:240px;overflow:hidden;text-overflow:ellipsis";
      box.appendChild(label);
      pluginOverlay.appendChild(box);
    });
  }
  function schedulePluginSources() {
    if (pluginPaintPending) return;
    pluginPaintPending = true;
    requestAnimationFrame(paintPluginSources);
  }
  new MutationObserver(schedulePluginSources).observe(root, { childList: true, subtree: true });
  window.addEventListener("scroll", schedulePluginSources, true);
  window.addEventListener("resize", schedulePluginSources);
  function isPluginPaging(target) {
    return target && target.closest('[data-testid$="page-next"], [data-testid$="page-prev"], [data-testid$="page-size"]');
  }
  function pluginSourcePosition(target) {
    var cell = target.closest('[data-role="cell"], [data-role="cell-edit"]');
    var head = target.closest('[data-role="col-head"]');
    var fields = (struct && struct.fields) || [];
    var ci = head ? Number(head.getAttribute("data-col")) : cell ? fields.findIndex(function (f) { return f.key === cell.getAttribute("data-key"); }) : -1;
    if (!fields[ci]) return null;
    return { ci: ci, ri: cell ? Number(cell.getAttribute("data-index")) : 0, mode: head ? "col" : "cell" };
  }
  function reportPluginSource() {
    if (!pluginPickAnchor || !pluginPickFocus) return;
    var fields = (struct && struct.fields) || [];
    var rows = (data && data.rows) || [];
    var mode = pluginPickAnchor.mode;
    var r0 = Math.min(pluginPickAnchor.ri, pluginPickFocus.ri), r1 = Math.max(pluginPickAnchor.ri, pluginPickFocus.ri);
    var c0 = Math.min(pluginPickAnchor.ci, pluginPickFocus.ci), c1 = Math.max(pluginPickAnchor.ci, pluginPickFocus.ci);
    var selected = [];
    function push(ri, ci) {
      var row = rows[ri] || {}, field = fields[ci];
      if (!field) return;
      var id = mode === "col" ? "*" : String(row.id == null || row.id === "" ? "#" + ri : row.id);
      selected.push({ id: id, field: field.key, type: field.type || "", widget: field.widget || "" });
    }
    push(r0, c0);
    if (r0 !== r1 || c0 !== c1) push(r1, c1);
    parent.postMessage({ type: "selection", tableId: tableId, sheet: sheetId || "main", mode: mode, cells: selected }, "*");
  }
  function pickPluginSource(ev) {
    if (!pluginPicking || ev.button !== 0 || isPluginPaging(ev.target)) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    var pos = pluginSourcePosition(ev.target);
    pluginDragging = Boolean(pos);
    if (!pos) return;
    if (!ev.shiftKey || !pluginPickAnchor || pluginPickAnchor.mode !== pos.mode) pluginPickAnchor = pos;
    pluginPickFocus = pos;
    reportPluginSource();
  }
  document.addEventListener("mousedown", pickPluginSource, true);
  document.addEventListener("mousemove", function (ev) {
    if (!pluginPicking || !pluginDragging) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    var pos = pluginSourcePosition(ev.target);
    if (!pos || pos.mode !== pluginPickAnchor.mode) return;
    if (pos.ri === pluginPickFocus.ri && pos.ci === pluginPickFocus.ci) return;
    pluginPickFocus = pos;
    reportPluginSource();
  }, true);
  document.addEventListener("mouseup", function () { pluginDragging = false; }, true);
  ["click", "dblclick", "contextmenu", "paste", "cut", "beforeinput", "change"].forEach(function (type) {
    document.addEventListener(type, function (ev) {
      if (!pluginPicking || isPluginPaging(ev.target)) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
    }, true);
  });
  document.addEventListener("keydown", function (ev) {
    if (!pluginPicking) return;
    if (ev.key === "Escape") {
      ev.preventDefault(); ev.stopImmediatePropagation();
      parent.postMessage({ type: "cancelPluginPick" }, "*");
    } else if (ev.key !== "Tab" && !/^Arrow/.test(ev.key) && ev.key !== "PageDown" && ev.key !== "PageUp") {
      ev.preventDefault(); ev.stopImmediatePropagation();
    }
  }, true);
  var checkErrors = [];
  var errorTotal = 0;
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
  function snapshot(next) { return { data: clone(next == null ? data : next), bindings: clone(pluginBindings) }; }
  function resetHistory() {
    histories[historyKey()] = { undo: [], redo: [], committed: snapshot(), lastPushAt: 0 };
  }
  function history() {
    if (!histories[historyKey()]) resetHistory();
    return histories[historyKey()];
  }
  function alignHistory() {
    var h = histories[historyKey()];
    if (!h || !same(h.committed, snapshot())) resetHistory();
  }
  function canUndo() { return !window.__bitComparison && history().undo.length > 0 && !isStateBusy(); }
  function canRedo() { return !window.__bitComparison && history().redo.length > 0 && !isStateBusy(); }
  function isStateBusy() { return stateBusy || Object.keys(statePending).length > 0; }
  function paintStateBusy() { root.setAttribute("data-state-busy", isStateBusy() ? "1" : "0"); }
  function requestState(type, payload, action) {
    if (isStateBusy()) return Promise.reject(new Error("正在处理配表操作"));
    var id = ++stateSeq;
    return new Promise(function (resolve, reject) {
      statePending[id] = { resolve: resolve, reject: reject, h: history(), action: action, sheet: sheetId, persist: Boolean(payload.persist) };
      paintStateBusy();
      parent.postMessage(Object.assign({ type: type, requestId: id, sheetId: sheetId, data: clone(data) }, payload), "*");
    });
  }
  function restoreHistory(action) {
    if (window.__bitComparison) return;
    var h = history();
    var list = action === "undo" ? h.undo : h.redo;
    if (isStateBusy() || !list.length) return;
    var next = clone(list[list.length - 1]);
    requestState("restoreTableState", { data: next.data, bindings: next.bindings, persist: next.persist }, action).catch(function (err) {
      parent.postMessage({ type: "toast", text: String(err.message || err) }, "*");
    });
  }
  function undo() { restoreHistory("undo"); }
  function redo() { restoreHistory("redo"); }
  function recordChange(next) {
    var h = history();
    var snap = snapshot(next);
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
    isReadOnly: function () { return Boolean(window.__bitComparison); },
    getComparison: function () { return window.__bitComparison ? window.__bitComparison.getConfig() : null; },
    getStruct: function () { return struct; },
    getData: function () { return data; },
    getEnums: function () { return enums || {}; },
    setData: function (next) {
      if (window.__bitComparison) return;
      if (!applying) recordChange(next);
      else history().committed = snapshot(next);
      data = next;
      parent.postMessage({ type: "dirty", data: data }, "*");
    },
    save: function () { if (!window.__bitComparison && !isStateBusy()) parent.postMessage({ type: "save", data: data }, "*"); },
    fillCells: function (request) { return window.__bitComparison ? Promise.reject(new Error("版本比对为只读")) : requestState("fillCells", { request: request }, "fill"); },
    isFillBusy: isStateBusy,
    askAI: function (mode, prompt) { if (!window.__bitComparison) parent.postMessage({ type: "askAI", mode: mode, prompt: prompt }, "*"); },
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    getTableId: function () {
      if (tableId) return tableId;
      var m = String(location.pathname || "").match(/\/tables\/([^/]+)\/editor/);
      return m ? decodeURIComponent(m[1]) : "";
    },
    getSheetId: function () { return sheetId || "main"; },
    getPluginCells: function () { return pluginCells || []; },
    getCheckErrors: function () { return checkErrors || []; },
    getCheckErrorTotal: function () { return errorTotal || 0; },
    assetURL: function (rel) {
      if (window.__bitComparison) return window.__bitComparison.assetURL(rel);
      var id = api.getTableId();
      if (!id || rel == null || rel === "") return "";
      var rootPath = new URLSearchParams(location.search).get("rootPath");
      return "/api/tables/" + encodeURIComponent(id) + "/asset?path=" + encodeURIComponent(String(rel)) + (rootPath ? "&rootPath=" + encodeURIComponent(rootPath) : "");
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
  function scheduleSelectByRef(target) {
    if (!target) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var editor = window.BitTableEditor;
        if (editor && typeof editor.selectByRef === "function") editor.selectByRef(target);
      });
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
  function mount(preserveScroll) {
    var scroll = [];
    var rootScroll = { left: root.scrollLeft, top: root.scrollTop };
    if (preserveScroll !== false) {
      root.querySelectorAll("[data-testid]").forEach(function (el) {
        if (el.scrollLeft || el.scrollTop) scroll.push({ id: el.getAttribute("data-testid"), left: el.scrollLeft, top: el.scrollTop });
      });
    }
    root.innerHTML = "";
    if (window.BitTableEditor && typeof window.BitTableEditor.mount === "function") {
      try { window.BitTableEditor.mount(root, api); }
      catch (error) {
        if (!window.__bitComparison) throw error;
        window.__bitComparison.error(error.message || error);
      }
    }
    if (preserveScroll !== false) {
      root.scrollLeft = rootScroll.left; root.scrollTop = rootScroll.top;
      scroll.forEach(function (pos) {
        root.querySelectorAll("[data-testid]").forEach(function (el) {
          if (el.getAttribute("data-testid") === pos.id) { el.scrollLeft = pos.left; el.scrollTop = pos.top; }
        });
      });
    }
  }
  window.addEventListener("message", function (ev) {
    var msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "tableStateResult") {
      var pending = statePending[msg.requestId];
      if (!pending) return;
      delete statePending[msg.requestId];
      paintStateBusy();
      if (msg.error) { pending.reject(new Error(msg.error)); return; }
      data = clone(msg.data);
      pluginBindings = clone(msg.bindings || []);
      pluginCells = pluginBindings.map(function (binding) { return { row: binding.row, field: binding.field }; });
      var h = pending.h, next = snapshot();
      if (pending.action === "undo") { h.redo.push(Object.assign(clone(h.committed), { persist: pending.persist })); h.undo.pop(); }
      else if (pending.action === "redo") { h.undo.push(Object.assign(clone(h.committed), { persist: pending.persist })); h.redo.pop(); }
      else if (!same(h.committed, next)) { h.undo.push(Object.assign(clone(h.committed), { persist: Boolean(msg.persist) })); h.redo = []; }
      if (h.undo.length > MAX_HISTORY) h.undo.shift();
      h.committed = next; h.lastPushAt = 0;
      if (pending.action !== "fill") mount();
      pending.resolve();
      return;
    }
    if (msg.type === "pluginInteraction") {
      if (pluginPicking !== Boolean(msg.picking)) { pluginPickAnchor = null; pluginPickFocus = null; pluginDragging = false; }
      pluginPicking = Boolean(msg.picking);
      stateBusy = Boolean(msg.busy);
      paintStateBusy();
      pluginSources = Array.isArray(msg.sources) ? msg.sources : [];
      root.setAttribute("data-plugin-picking", pluginPicking ? "1" : "0");
      schedulePluginSources();
      return;
    }
    if (msg.type === "reveal") {
      scheduleReveal(msg);
      return;
    }
    if (msg.type === "selectByRef") {
      var byRef = window.BitTableEditor;
      if (byRef && typeof byRef.selectByRef === "function") byRef.selectByRef(msg);
      return;
    }
    if (msg.type === "checkErrors") {
      checkErrors = msg.errors || [];
      errorTotal = msg.total != null ? msg.total : checkErrors.length;
      var checker = window.BitTableEditor;
      if (checker && typeof checker.setCheckErrors === "function") checker.setCheckErrors(checkErrors, errorTotal);
      return;
    }
    if (msg.type === "clearReveal") {
      clearReveal();
      return;
    }
    if (msg.type === "init" || msg.type === "setSheet") {
      if (window.__bitComparison && msg.comparison) window.__bitComparison.configure(msg.comparison);
      var prevSheet = sheetId;
      if (msg.struct != null) struct = msg.struct;
      if (msg.tableId != null) tableId = msg.tableId;
      if (msg.sheetId != null) sheetId = msg.sheetId;
      if (msg.enums != null) enums = msg.enums;
      if (msg.pluginCells != null) pluginCells = msg.pluginCells;
      if (msg.pluginBindings != null) pluginBindings = clone(msg.pluginBindings);
      if (msg.checkErrors != null) checkErrors = msg.checkErrors;
      if (msg.errorTotal != null) errorTotal = msg.errorTotal;
      var sameSheet = msg.type === "setSheet" && prevSheet && sheetId === prevSheet;
      if (!sameSheet) {
        if (msg.data != null) data = msg.data;
        alignHistory();
      } else if (msg.data != null && !canUndo() && !canRedo()) {
        data = msg.data;
        alignHistory();
      }
      mount(sameSheet);
      if (msg.reveal) scheduleReveal(msg.reveal);
      if (msg.selectByRef) scheduleSelectByRef(msg.selectByRef);
    } else if (msg.type === "replaceData") {
      if (msg.struct != null) struct = msg.struct;
      if (msg.tableId != null) tableId = msg.tableId;
      if (msg.sheetId != null) sheetId = msg.sheetId;
      data = msg.data;
      if (msg.enums != null) enums = msg.enums;
      if (msg.pluginCells != null) pluginCells = msg.pluginCells;
      if (msg.pluginBindings != null) pluginBindings = clone(msg.pluginBindings);
      if (msg.checkErrors != null) checkErrors = msg.checkErrors;
      if (msg.errorTotal != null) errorTotal = msg.errorTotal;
      alignHistory();
      mount();
      if (msg.reveal) scheduleReveal(msg.reveal);
      if (msg.selectByRef) scheduleSelectByRef(msg.selectByRef);
    } else if (msg.type === "undo") {
      undo();
    } else if (msg.type === "redo") {
      redo();
    } else if (msg.type === "save") {
      api.save();
    }
  });
  ["mousedown", "dblclick", "beforeinput", "change", "paste", "cut", "keydown"].forEach(function (type) {
    document.addEventListener(type, function (ev) {
      if (!isStateBusy()) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
    }, true);
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
    } else if (ev.code === "Backquote" && ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      parent.postMessage({ type: "shortcut", key: String.fromCharCode(96) }, "*");
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
