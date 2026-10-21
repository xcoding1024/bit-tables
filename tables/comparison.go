package tables

// ComparisonEditorHTML 给各版本 editor 添加独立的只读宿主和差异标记。
func ComparisonEditorHTML(js string) string {
	return EditorHTML(comparisonPrelude + "\n" + js)
}

const comparisonPrelude = `
(function () {
  var root = document.getElementById("root");
  var config = { rows: [], columns: [], assetBase: "" };
  var queued = false, suppressScroll = false;
  var style = document.createElement("style");
  style.textContent = '[data-comparison-status="modified"]{box-shadow:inset 0 0 0 999px rgba(180,120,20,.25)!important}[data-comparison-status="added"]{box-shadow:inset 0 0 0 999px rgba(30,160,90,.2)!important}[data-comparison-status="removed"]{box-shadow:inset 0 0 0 999px rgba(200,60,60,.22)!important}[data-comparison-column="1"]{outline:1px solid #c99535;outline-offset:-1px}';
  document.head.appendChild(style);
  function post(type, detail) { parent.postMessage(Object.assign({ type: type }, detail || {}), "*"); }
  function error(message) { post("comparisonError", { message: String(message || "editor 渲染失败") }); }
  window.addEventListener("error", function (event) { error(event.message); event.preventDefault(); });
  window.addEventListener("unhandledrejection", function (event) { error(event.reason && event.reason.message || event.reason); event.preventDefault(); });
  style.textContent += 'svg [data-comparison-status="modified"]{stroke:#e2b340!important;stroke-width:3px!important}svg [data-comparison-status="added"]{stroke:#3ecf8e!important;stroke-width:3px!important}svg [data-comparison-status="removed"]{stroke:#eb5757!important;stroke-width:3px!important}';
  function navigation(el) { return el && el.closest && el.closest('[data-testid$="-page-size"],[data-role="col-filter-menu"],[data-role="col-filter-input"],[data-role="chart-y"],[data-role="chart-group"],[data-comparison-browse]'); }
  function isWriteButton(el) { return /-(?:save|add|batch-edit|batch-delete|batch-apply|delete|remove|undo|redo|fill-handle)$/.test(el.getAttribute("data-testid") || ""); }
  function locate(el) {
    var cell = el.closest && el.closest('[data-index][data-key]');
    if (cell) return { index: Number(cell.getAttribute("data-index")), field: cell.getAttribute("data-key") };
    var tagged = el.closest && el.closest('[data-testid]');
    if (!tagged) return null;
    var id = tagged.getAttribute("data-testid") || "";
    for (var i = 0; i < config.rows.length; i++) for (var j = 0; j < config.columns.length; j++) {
      var key = config.columns[j].key;
      if (id.endsWith("-" + key + "-" + i)) return { index: i, field: key };
    }
    return null;
  }
  function paint() {
    queued = false;
    root.querySelectorAll("input,textarea,select,[contenteditable]").forEach(function (el) {
      if (navigation(el)) return;
      if (el.matches('input[type="text"],input[type="number"],input:not([type]),textarea')) el.readOnly = true;
      else if ("disabled" in el) el.disabled = true;
      if (el.hasAttribute("contenteditable")) el.setAttribute("contenteditable", "false");
    });
    root.querySelectorAll("button").forEach(function (el) { if (isWriteButton(el)) { el.disabled = true; el.hidden = true; } });
    root.querySelectorAll('[data-index][data-key]').forEach(function (el) {
      var row = config.rows[Number(el.getAttribute("data-index"))], key = el.getAttribute("data-key");
      if (!row) return;
      el.setAttribute("data-comparison-row", row.key);
      el.setAttribute("data-comparison-field", key);
      el.setAttribute("data-comparison-original-index", String(row.originalIndex));
      if (row.changes.indexOf(key) >= 0) el.setAttribute("data-comparison-status", row.status);
      else el.removeAttribute("data-comparison-status");
    });
    root.querySelectorAll('[data-role="col-head"]').forEach(function (el) {
      var column = config.columns[Number(el.getAttribute("data-col"))];
      if (column && column.changed) el.setAttribute("data-comparison-column", "1");
      else el.removeAttribute("data-comparison-column");
    });
    root.querySelectorAll('[data-role="row-head"]').forEach(function (el) {
      var row = config.rows[Number(el.getAttribute("data-index"))];
      if (row) el.title = "原始行号 " + (row.originalIndex + 1);
    });
  }
  function schedulePaint() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
  new MutationObserver(schedulePaint).observe(root, { childList: true, subtree: true });
  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("button");
    if (button && isWriteButton(button)) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    var cell = locate(event.target), row = cell && config.rows[cell.index];
    if (row) post("comparisonCell", { row: row.key, field: cell.field });
  }, true);
  ["dblclick", "beforeinput", "paste", "cut", "drop"].forEach(function (type) {
    document.addEventListener(type, function (event) { if (!navigation(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  });
  document.addEventListener("change", function (event) { if (!navigation(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  document.addEventListener("keydown", function (event) {
    var key = event.key.toLowerCase();
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); post("comparisonClose"); }
    if ((event.ctrlKey || event.metaKey) && ["s", "z", "y", "v", "x"].indexOf(key) >= 0) { event.preventDefault(); event.stopImmediatePropagation(); }
    if (!navigation(event.target) && (key === "delete" || key === "backspace" || key === "enter")) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  function scroller() {
    var best = document.scrollingElement, range = best ? best.scrollHeight - best.clientHeight : 0;
    [root].concat(Array.from(root.querySelectorAll("div"))).forEach(function (el) {
      var next = el.scrollHeight - el.clientHeight + el.scrollWidth - el.clientWidth;
      if (next > range && el.clientHeight > 0) { best = el; range = next; }
    });
    return best || root;
  }
  document.addEventListener("scroll", function (event) {
    if (suppressScroll) return;
    var el = event.target === document ? document.scrollingElement : event.target;
    if (!el || !el.scrollHeight) return;
    post("comparisonScroll", { y: el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight), x: el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth) });
  }, true);
  window.addEventListener("message", function (event) {
    if (event.source !== parent || !event.data || event.data.type !== "comparisonScroll") return;
    var el = scroller(); suppressScroll = true;
    el.scrollTop = Number(event.data.y || 0) * Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollLeft = Number(event.data.x || 0) * Math.max(0, el.scrollWidth - el.clientWidth);
    requestAnimationFrame(function () { requestAnimationFrame(function () { suppressScroll = false; }); });
  });
  window.__bitComparison = {
    configure: function (next) { config = next || config; schedulePaint(); },
    assetURL: function (rel) { return config.assetBase ? config.assetBase + "&path=" + encodeURIComponent(String(rel)) : ""; },
    getConfig: function () { return config; }, error: error
  };
})();
`
