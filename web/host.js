(function (global) {
  function unquoteYAML(value) {
    var t = String(value || "").trim();
    if ((t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') || (t.charAt(0) === "'" && t.charAt(t.length - 1) === "'")) {
      return t.slice(1, -1);
    }
    return t;
  }

  function historySection(text, mode) {
    var src = String(text || "").replace(/\r\n/g, "\n");
    var tag = mode === "struct" ? "struct" : "data";
    var open = "<!-- bit-history:" + tag + " -->";
    var close = "<!-- /bit-history:" + tag + " -->";
    var a = src.indexOf(open);
    var b = src.indexOf(close);
    if (a >= 0 && b > a) {
      return src.slice(a + open.length, b).trim();
    }
    var heading = mode === "struct" ? "## 结构" : "## 数据";
    var other = mode === "struct" ? "## 数据" : "## 结构";
    var start = src.indexOf(heading);
    if (start < 0) return "";
    var body = src.slice(start + heading.length);
    var cut = body.indexOf("\n" + other);
    if (cut >= 0) body = body.slice(0, cut);
    return body.trim();
  }

  function parseHistoryTurns(section) {
    var src = String(section || "").replace(/\r\n/g, "\n");
    if (!src.trim()) return [];
    var turnRe = /^### (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{2}:\d{2}) · (.+)$/gm;
    var matches = [];
    var m;
    while ((m = turnRe.exec(src))) matches.push(m);
    if (!matches.length) return [];
    return matches.map(function (item, i) {
      var start = item.index + item[0].length;
      var end = i + 1 < matches.length ? matches[i + 1].index : src.length;
      var body = src.slice(start, end);
      var userAt = body.indexOf("**用户**");
      var agentAt = body.indexOf("**Agent**");
      var user = "";
      var agent = "";
      if (userAt >= 0) {
        user = body.slice(userAt + "**用户**".length, agentAt >= 0 ? agentAt : undefined).trim();
      }
      if (agentAt >= 0) {
        agent = body.slice(agentAt + "**Agent**".length).trim();
      }
      return { when: item[1], who: item[2].trim(), user: user, agent: agent };
    });
  }

  function parseTableDoc(text) {
    var raw = String(text || "").trim();
    if (!raw) return { rows: [] };
    if (raw.charAt(0) === "{" || raw.charAt(0) === "[") {
      return JSON.parse(raw);
    }
    var rows = [];
    var current = null;
    raw.split(/\r?\n/).forEach(function (line) {
      if (/^\s*-\s+/.test(line)) {
        if (current) rows.push(current);
        current = {};
        var kv = line.match(/^\s*-\s+(\w+)\s*:\s*(.*)$/);
        if (kv) current[kv[1]] = unquoteYAML(kv[2]);
        return;
      }
      var kv2 = line.match(/^\s+(\w+)\s*:\s*(.*)$/);
      if (kv2 && current) current[kv2[1]] = unquoteYAML(kv2[2]);
    });
    if (current) rows.push(current);
    return { rows: rows };
  }

  function stringifyTableDoc(data) {
    if (typeof data === "string") return data;
    var rec = data || {};
    if (Array.isArray(rec.rows)) {
      if (rec.rows.length === 0) return "rows: []\n";
      var out = "rows:\n";
      rec.rows.forEach(function (row) {
        var keys = Object.keys(row || {});
        keys.forEach(function (key, i) {
          out += (i === 0 ? "  - " : "    ") + key + ": " + String(row[key] == null ? "" : row[key]).replace(/\n/g, " ") + "\n";
        });
      });
      return out;
    }
    return JSON.stringify(data, null, 2) + "\n";
  }

  function runTableChecker(checkerJs, data, struct) {
    if (!String(checkerJs || "").trim()) {
      return Promise.resolve({ ok: true, errors: [] });
    }
    return new Promise(function (resolve) {
      var html =
        '<!doctype html><meta charset="utf-8"><script>' +
        checkerJs.replace(/<\/script/gi, "<\\/script") +
        '</script><script>' +
        'window.addEventListener("message", function (ev) {' +
        "  try {" +
        "    var fn = window.BitTableChecker && window.BitTableChecker.check;" +
        "    var result = fn ? fn(ev.data.data, ev.data.struct) : { ok: true, errors: [] };" +
        '    parent.postMessage({ type: "result", result: result }, "*");' +
        "  } catch (err) {" +
        '    parent.postMessage({ type: "result", result: { ok: false, errors: [{ path: "", message: String(err) }] } }, "*");' +
        "  }" +
        "});" +
        'parent.postMessage({ type: "ready" }, "*");' +
        "</script>";
      var url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      var iframe = document.createElement("iframe");
      iframe.sandbox.add("allow-scripts");
      iframe.style.display = "none";
      iframe.src = url;
      function finish(result) {
        window.removeEventListener("message", onMsg);
        iframe.remove();
        URL.revokeObjectURL(url);
        resolve({
          ok: Boolean(result && result.ok),
          errors: result && Array.isArray(result.errors) ? result.errors : [],
        });
      }
      function onMsg(ev) {
        if (ev.source !== iframe.contentWindow || !ev.data || typeof ev.data !== "object") return;
        if (ev.data.type === "ready") {
          iframe.contentWindow.postMessage({ data: data, struct: struct }, "*");
        } else if (ev.data.type === "result") {
          finish(ev.data.result);
        }
      }
      window.addEventListener("message", onMsg);
      document.body.appendChild(iframe);
      setTimeout(function () {
        finish({ ok: false, errors: [{ path: "", message: "检查器超时" }] });
      }, 4000);
    });
  }

  global.BitTablesHost = {
    unquoteYAML: unquoteYAML,
    historySection: historySection,
    parseHistoryTurns: parseHistoryTurns,
    parseTableDoc: parseTableDoc,
    stringifyTableDoc: stringifyTableDoc,
    runTableChecker: runTableChecker,
  };
})(window);
