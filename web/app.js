(function () {
  var host = window.BitTablesHost;
  var params = new URLSearchParams(location.search);
  var embed = params.get("embed") === "1";
  var tableId = params.get("table") || "";
  var mode = "struct";
  var files = null;
  var editorKey = 0;
  if (embed) document.body.classList.add("embed");

  var els = {
    root: document.querySelector("[data-testid=tables-root-current]"),
    list: document.querySelector("[data-testid=tables-list]"),
    status: document.querySelector("[data-testid=tables-status]"),
    empty: document.querySelector("[data-testid=tables-editor-empty]"),
    frame: document.querySelector("[data-testid=table-editor-frame]"),
    history: document.querySelector("[data-testid=tables-history]"),
    newBtn: document.querySelector("[data-testid=tables-new]"),
    newForm: document.querySelector("[data-testid=tables-new-form]"),
    newId: document.querySelector("[data-testid=tables-new-id]"),
    newSubmit: document.querySelector("[data-testid=tables-new-submit]"),
  };

  function api(path, opt) {
    return fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opt || {})).then(function (res) {
      if ((res.headers.get("content-type") || "").indexOf("json") >= 0) {
        return res.json().then(function (body) {
          if (!body.ok) throw new Error((body.error && body.error.message) || res.statusText);
          return body.data;
        });
      }
      if (!res.ok) throw new Error(res.statusText);
      return res.text();
    });
  }

  function setStatus(text, kind) {
    els.status.innerHTML = "";
    if (!text) return;
    var div = document.createElement("div");
    div.className = kind === "ok" ? "ok" : "err";
    div.textContent = text;
    if (kind === "ok") div.setAttribute("data-testid", "tables-check-ok");
    if (kind === "err") div.setAttribute("data-testid", "tables-check-errors");
    els.status.appendChild(div);
  }

  function renderHistory() {
    var section = host.historySection((files && files.history) || "", mode);
    var turns = host.parseHistoryTurns(section);
    if (!turns.length) {
      els.history.innerHTML = '<div class="empty">暂无' + (mode === "struct" ? "结构" : "数据") + "历史</div>";
      return;
    }
    els.history.innerHTML = turns
      .map(function (t) {
        return (
          '<div class="turn"><div class="meta">' +
          escapeHtml(t.when) +
          " · " +
          escapeHtml(t.who) +
          '</div><div class="body">' +
          escapeHtml(t.user) +
          (t.agent ? "\n\n" + escapeHtml(t.agent) : "") +
          "</div></div>"
        );
      })
      .join("");
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function selectTable(id, remount) {
    tableId = id;
    var next = new URL(location.href);
    if (id) next.searchParams.set("table", id);
    else next.searchParams.delete("table");
    if (embed) next.searchParams.set("embed", "1");
    history.replaceState(null, "", next);
    document.querySelectorAll(".item").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-id") === id);
    });
    if (!id) {
      files = null;
      els.empty.hidden = false;
      els.frame.hidden = true;
      renderHistory();
      return Promise.resolve();
    }
    return api("/api/tables/" + encodeURIComponent(id) + "/files").then(function (nextFiles) {
      files = nextFiles;
      els.empty.hidden = true;
      els.frame.hidden = false;
      if (remount) {
        editorKey += 1;
        els.frame.src = "/api/tables/" + encodeURIComponent(id) + "/editor?t=" + editorKey;
      } else if (els.frame.contentWindow) {
        els.frame.contentWindow.postMessage({ type: "replaceData", data: host.parseTableDoc(files.data) }, "*");
      } else {
        els.frame.src = "/api/tables/" + encodeURIComponent(id) + "/editor?t=" + editorKey;
      }
      renderHistory();
      return runCheck();
    });
  }

  function runCheck(data) {
    if (!files) return Promise.resolve();
    var parsed = data || host.parseTableDoc(files.data);
    var struct = files.struct ? host.parseTableDoc(files.struct) : {};
    if (files.struct && files.struct.trim().charAt(0) !== "{" && files.struct.trim().charAt(0) !== "[") {
      struct = { raw: files.struct };
    }
    return host.runTableChecker(files.checker, parsed, struct).then(function (result) {
      if (result.ok) setStatus("检查通过", "ok");
      else {
        setStatus(
          result.errors
            .map(function (e) {
              return (e.path ? e.path + "：" : "") + e.message;
            })
            .join("\n") || "检查失败",
          "err",
        );
      }
    });
  }

  function renderTree(nodes, depth) {
    return (nodes || [])
      .map(function (node) {
        var pad = "padding-left:" + (8 + depth * 12) + "px";
        if (node.kind === "dir") {
          return (
            '<div class="tree-folder" style="' +
            pad +
            '" data-testid="tables-folder-' +
            escapeHtml(node.path) +
            '">▸ ' +
            escapeHtml(node.name) +
            "</div>" +
            renderTree(node.children || [], depth + 1)
          );
        }
        var item = node.table || { id: node.name, complete: true };
        return (
          '<a class="item' +
          (item.id === tableId ? " active" : "") +
          '" style="' +
          pad +
          '" href="?table=' +
          encodeURIComponent(item.id) +
          (embed ? "&embed=1" : "") +
          '" data-testid="tables-item-' +
          item.id +
          '" data-id="' +
          item.id +
          '"><div>' +
          escapeHtml(item.id) +
          "</div>" +
          (item.complete ? "" : '<div class="hint">五件套不完整</div>') +
          "</a>"
        );
      })
      .join("");
  }

  function loadList() {
    return api("/api/tables").then(function (data) {
      els.root.textContent = data.path || "";
      var tables = data.tables || [];
      var tree = data.tree;
      if ((!tree || !tree.length) && !tables.length) {
        els.list.innerHTML = '<div class="empty">暂无配置表</div>';
      } else if (tree && tree.length) {
        els.list.innerHTML = renderTree(tree, 0);
      } else {
        els.list.innerHTML = tables
          .map(function (item) {
            return (
              '<a class="item' +
              (item.id === tableId ? " active" : "") +
              '" href="?table=' +
              encodeURIComponent(item.id) +
              (embed ? "&embed=1" : "") +
              '" data-testid="tables-item-' +
              item.id +
              '" data-id="' +
              item.id +
              '"><div>' +
              escapeHtml(item.id) +
              "</div>" +
              (item.complete ? "" : '<div class="hint">五件套不完整</div>') +
              "</a>"
            );
          })
          .join("");
      }
      if (tableId && !tables.some(function (t) { return t.id === tableId; })) {
        return selectTable("", true);
      }
      if (tableId) return selectTable(tableId, !files || files.id !== tableId);
      if (tables.length === 1) return selectTable(tables[0].id, true);
    });
  }

  function handleSave(data) {
    if (!tableId) return;
    return api("/api/tables/" + encodeURIComponent(tableId) + "/data", {
      method: "PUT",
      body: JSON.stringify({ data: host.stringifyTableDoc(data) }),
    })
      .then(function () {
        return api("/api/tables/" + encodeURIComponent(tableId) + "/files");
      })
      .then(function (next) {
        files = next;
        return runCheck(data);
      })
      .catch(function (err) {
        setStatus(err.message || "保存失败", "err");
      });
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== els.frame.contentWindow || !ev.data || typeof ev.data !== "object") return;
    var msg = ev.data;
    if (msg.type === "ready" && files) {
      var parsed = host.parseTableDoc(files.data);
      var struct = files.struct;
      try {
        struct = host.parseTableDoc(files.struct);
      } catch (e) {
        struct = files.struct;
      }
      els.frame.contentWindow.postMessage(
        { type: "init", tableId: files.id, struct: struct, data: parsed, theme: "dark" },
        "*",
      );
    } else if (msg.type === "save") {
      handleSave(msg.data);
    } else if (msg.type === "askAI") {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(msg, "*");
      } else {
        setStatus("请用 Cursor / Codex 直接改表目录中的文件", "err");
      }
    }
  });

  els.list.addEventListener("click", function (ev) {
    var a = ev.target.closest("a[data-id]");
    if (!a) return;
    ev.preventDefault();
    selectTable(a.getAttribute("data-id"), true).catch(function (err) {
      setStatus(err.message, "err");
    });
  });

  document.querySelectorAll(".tab").forEach(function (tab) {
    tab.addEventListener("click", function () {
      mode = tab.getAttribute("data-mode");
      document.querySelectorAll(".tab").forEach(function (el) {
        el.classList.toggle("active", el === tab);
      });
      renderHistory();
    });
  });

  els.newBtn.addEventListener("click", function () {
    els.newForm.classList.toggle("open");
    els.newId.focus();
  });

  els.newSubmit.addEventListener("click", function () {
    var id = els.newId.value.trim();
    if (!id) return;
    api("/api/tables", { method: "POST", body: JSON.stringify({ id: id }) })
      .then(function (info) {
        els.newForm.classList.remove("open");
        els.newId.value = "";
        tableId = (info && info.id) || id.split("/").pop();
        return loadList();
      })
      .catch(function (err) {
        setStatus(err.message, "err");
      });
  });

  if (window.EventSource) {
    var es = new EventSource("/api/events");
    es.addEventListener("file_changed", function () {
      if (!tableId) {
        loadList();
        return;
      }
      var prevEditor = files && files.editor;
      var prevStruct = files && files.struct;
      api("/api/tables/" + encodeURIComponent(tableId) + "/files")
        .then(function (next) {
          files = next;
          renderHistory();
          if (next.editor !== prevEditor || next.struct !== prevStruct) {
            return selectTable(tableId, true);
          }
          if (els.frame.contentWindow) {
            els.frame.contentWindow.postMessage({ type: "replaceData", data: host.parseTableDoc(next.data) }, "*");
          }
          return runCheck();
        })
        .then(function () {
          return loadList();
        })
        .catch(function () {});
    });
  }

  loadList().catch(function (err) {
    setStatus(err.message, "err");
  });
})();
