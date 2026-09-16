window.BitTableEditor = {
  mount: function (el, api) {
    var FALLBACK_FIELDS = [
      { key: "id", label: "ID", type: "string", widget: "text", group: "basic", required: true },
      { key: "name", label: "名称", type: "string", widget: "text", group: "basic", required: true },
      { key: "kind", label: "分类", type: "enum", widget: "select", group: "basic", options: "weapon, armor, consumable, material" },
      { key: "rarity", label: "稀有度", type: "enum", widget: "radio", group: "basic", options: "common, rare, epic, legendary" },
      { key: "desc", label: "描述", type: "string", widget: "textarea", group: "basic" },
      { key: "enabled", label: "启用", type: "bool", widget: "checkbox", group: "value" },
      { key: "stack", label: "堆叠上限", type: "int", widget: "number", group: "value", min: 1, max: 999 },
      { key: "weight", label: "重量", type: "float", widget: "number", group: "value", step: 0.1 },
      { key: "power", label: "强度", type: "int", widget: "range", group: "value", min: 0, max: 100 },
      { key: "atk", label: "攻击", type: "int", widget: "number", group: "value" },
      { key: "def", label: "防御", type: "int", widget: "number", group: "value" },
      { key: "color", label: "品质色", type: "string", widget: "color", group: "extra" },
      { key: "available_from", label: "上架日期", type: "date", widget: "date", group: "extra" },
      { key: "tags", label: "标签", type: "string_list", widget: "tags", group: "extra" },
    ];
    var GROUP_NAMES = { basic: "基础信息", value: "数值与开关", extra: "展示与扩展" };

    var data = normalizeData(api.getData());
    var fields = parseFields(api.getStruct());
    var view = "table";

    function normalizeData(raw) {
      var next = raw && typeof raw === "object" ? raw : { rows: [] };
      if (!Array.isArray(next.rows)) next.rows = [];
      return next;
    }

    function parseFields(struct) {
      if (struct && Array.isArray(struct.fields) && struct.fields.length) return struct.fields;
      if (struct && Array.isArray(struct.rows) && struct.rows.length && struct.rows[0].key) return struct.rows;
      return FALLBACK_FIELDS;
    }

    function optionsOf(field) {
      var raw = field.options;
      if (Array.isArray(raw)) return raw.map(String);
      return String(raw || "")
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }

    function groups() {
      var seen = [];
      fields.forEach(function (f) {
        var g = f.group || "basic";
        if (seen.indexOf(g) < 0) seen.push(g);
      });
      return seen;
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function escapeAttr(s) {
      return escapeHtml(s).replace(/"/g, "&quot;");
    }

    function truthy(v) {
      return v === true || v === "true" || v === 1 || v === "1";
    }

    function num(v, fallback) {
      var n = Number(v);
      return isNaN(n) ? fallback : n;
    }

    function setRow(i, key, value) {
      if (!data.rows[i]) data.rows[i] = {};
      data.rows[i][key] = value;
      api.setData(data);
    }

    function fieldControl(field, row, ri, compact) {
      var key = field.key;
      var val = row[key] == null ? "" : row[key];
      var widget = field.widget || (field.type === "bool" ? "checkbox" : "text");
      if (compact && widget === "radio") widget = "select";
      if (compact && widget === "textarea") widget = "text";
      var test = 'data-testid="demo-' + escapeAttr(key) + "-" + ri + '"';
      var input =
        "width:100%;min-width:" +
        (compact ? "88px" : "100%") +
        ";height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px";
      if (widget === "checkbox") {
        return (
          '<label style="display:flex;align-items:center;justify-content:' +
          (compact ? "center" : "flex-start") +
          ';gap:8px;height:28px">' +
          '<input type="checkbox" ' +
          test +
          (truthy(val) ? " checked" : "") +
          " />" +
          (compact ? "" : '<span style="color:#d4d4d4">开启后对玩家可见</span>') +
          "</label>"
        );
      }
      if (widget === "select") {
        var html = "<select " + test + ' style="' + input + '">';
        optionsOf(field).forEach(function (opt) {
          html +=
            '<option value="' +
            escapeAttr(opt) +
            '"' +
            (String(val) === opt ? " selected" : "") +
            ">" +
            escapeHtml(opt) +
            "</option>";
        });
        return html + "</select>";
      }
      if (widget === "radio") {
        var radios = '<div style="display:flex;flex-wrap:wrap;gap:8px 12px;padding-top:4px">';
        optionsOf(field).forEach(function (opt) {
          radios +=
            '<label style="display:flex;align-items:center;gap:4px">' +
            '<input type="radio" name="demo-' +
            escapeAttr(key) +
            "-" +
            ri +
            '" value="' +
            escapeAttr(opt) +
            '" ' +
            test +
            (String(val) === opt ? " checked" : "") +
            " />" +
            escapeHtml(opt) +
            "</label>";
        });
        return radios + "</div>";
      }
      if (widget === "textarea") {
        return (
          "<textarea " +
          test +
          ' rows="3" style="width:100%;min-height:64px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:6px 8px;resize:vertical">' +
          escapeHtml(val) +
          "</textarea>"
        );
      }
      if (widget === "range") {
        var min = num(field.min, 0);
        var max = num(field.max, 100);
        var cur = num(val, min);
        return (
          '<div style="display:flex;align-items:center;gap:6px;min-width:' +
          (compact ? "120px" : "160px") +
          '">' +
          '<input type="range" ' +
          test +
          " min=" +
          min +
          " max=" +
          max +
          ' value="' +
          escapeAttr(cur) +
          '" style="flex:1" />' +
          '<span data-role="range-label" style="width:28px;color:#a3a3a3;font-family:ui-monospace,monospace">' +
          escapeHtml(cur) +
          "</span></div>"
        );
      }
      if (widget === "color") {
        var color = String(val || "#3794ff");
        return (
          '<div style="display:flex;align-items:center;gap:6px">' +
          '<input type="color" ' +
          test +
          ' value="' +
          escapeAttr(color) +
          '" style="width:28px;height:28px;border:1px solid #3a3a3a;background:#1a1a1a;padding:0" />' +
          (compact
            ? ""
            : '<input data-role="color-text" value="' +
              escapeAttr(color) +
              '" style="' +
              input +
              ';max-width:120px;font-family:ui-monospace,monospace" />') +
          "</div>"
        );
      }
      if (widget === "date") {
        return '<input type="date" ' + test + ' value="' + escapeAttr(val) + '" style="' + input + '" />';
      }
      if (widget === "tags") {
        return (
          '<input type="text" ' +
          test +
          ' value="' +
          escapeAttr(val) +
          '" placeholder="melee, starter" style="' +
          input +
          '" />'
        );
      }
      if (widget === "number" || field.type === "int" || field.type === "float") {
        var extra = "";
        if (field.min != null) extra += " min=" + num(field.min, 0);
        if (field.max != null) extra += " max=" + num(field.max, 0);
        if (field.step != null) extra += " step=" + field.step;
        else if (field.type === "float") extra += " step=0.1";
        return '<input type="number" ' + test + extra + ' value="' + escapeAttr(val) + '" style="' + input + '" />';
      }
      var readonly = key === "id" && row.id ? " readonly" : "";
      return '<input type="text" ' + test + readonly + ' value="' + escapeAttr(val) + '" style="' + input + '" />';
    }

    function bindControl(root, field, ri) {
      var nodes = root.querySelectorAll('[data-testid="demo-' + field.key + "-" + ri + '"]');
      if (!nodes.length) return;
      var node = nodes[0];
      var widget = field.widget || "text";
      if (node.tagName === "SELECT") widget = "select";
      if (node.tagName === "TEXTAREA") widget = "textarea";
      if (node.type === "checkbox") widget = "checkbox";
      if (node.type === "range") widget = "range";
      if (node.type === "color") widget = "color";
      function apply(value) {
        if (field.type === "int") setRow(ri, field.key, String(parseInt(value, 10) || 0));
        else if (field.type === "float") setRow(ri, field.key, String(Number(value) || 0));
        else if (field.type === "bool") setRow(ri, field.key, value ? "true" : "false");
        else setRow(ri, field.key, value);
      }
      if (widget === "checkbox") {
        nodes[0].addEventListener("change", function (ev) {
          apply(ev.target.checked);
        });
        return;
      }
      if (widget === "radio") {
        for (var i = 0; i < nodes.length; i++) {
          nodes[i].addEventListener("change", function (ev) {
            if (ev.target.checked) apply(ev.target.value);
          });
        }
        return;
      }
      if (widget === "range") {
        var label = nodes[0].parentNode.querySelector("[data-role=range-label]");
        nodes[0].addEventListener("input", function (ev) {
          if (label) label.textContent = ev.target.value;
          apply(ev.target.value);
        });
        return;
      }
      if (widget === "color") {
        var text = nodes[0].parentNode.querySelector("[data-role=color-text]");
        nodes[0].addEventListener("input", function (ev) {
          if (text) text.value = ev.target.value;
          apply(ev.target.value);
        });
        if (text) {
          text.addEventListener("change", function (ev) {
            nodes[0].value = ev.target.value;
            apply(ev.target.value);
          });
        }
        return;
      }
      var evName = widget === "select" || widget === "date" || widget === "number" ? "change" : "input";
      nodes[0].addEventListener(evName, function (ev) {
        apply(ev.target.value);
      });
      if (widget === "number") {
        nodes[0].addEventListener("input", function (ev) {
          apply(ev.target.value);
        });
      }
    }

    function tabStyle(active) {
      return (
        "height:28px;padding:0 10px;border:0;border-radius:4px;cursor:pointer;" +
        (active ? "background:#2a2a2a;color:#f5f5f5" : "background:transparent;color:#a3a3a3")
      );
    }

    function toolbar(html) {
      html += '<div data-testid="table-editor" style="padding:16px 20px;box-sizing:border-box;height:100%">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px">';
      html += '<div><div style="font-weight:500">控件演示表</div>';
      html += '<div style="color:#a3a3a3;margin-top:2px">表格与卡片两种形态，控件相同</div></div>';
      html += '<div style="display:flex;align-items:center;gap:8px">';
      html +=
        '<div style="display:flex;padding:2px;border:1px solid #3a3a3a;border-radius:6px">' +
        '<button type="button" data-testid="demo-view-table" style="' +
        tabStyle(view === "table") +
        '">表格</button>' +
        '<button type="button" data-testid="demo-view-card" style="' +
        tabStyle(view === "card") +
        '">卡片</button></div>';
      html +=
        '<button type="button" data-testid="demo-add" style="height:28px;padding:0 10px;background:#2a2a2a;color:#f5f5f5;border:0;border-radius:4px">新增一行</button>';
      html +=
        '<button type="button" data-testid="demo-save" style="height:28px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px">保存</button></div></div>';
      return html;
    }

    function renderTable(rows) {
      var html = '<div data-testid="demo-table" style="overflow:auto;border:1px solid #3a3a3a;border-radius:8px">';
      html += '<table style="width:max-content;min-width:100%;border-collapse:collapse">';
      html += "<thead><tr>";
      fields.forEach(function (field) {
        html +=
          '<th style="position:sticky;top:0;background:#1a1a1a;text-align:left;color:#a3a3a3;font-weight:500;padding:8px;border-bottom:1px solid #3a3a3a;white-space:nowrap">' +
          escapeHtml(field.label || field.key) +
          "</th>";
      });
      html +=
        '<th style="position:sticky;top:0;background:#1a1a1a;padding:8px;border-bottom:1px solid #3a3a3a;color:#a3a3a3">操作</th></tr></thead><tbody>';
      if (!rows.length) {
        html +=
          '<tr><td colspan="' +
          (fields.length + 1) +
          '" style="padding:24px;text-align:center;color:#a3a3a3">暂无行，点击「新增一行」</td></tr>';
      }
      rows.forEach(function (row, ri) {
        row = row || {};
        html += '<tr data-testid="demo-row-' + ri + '" style="background:' + (ri % 2 ? "#111" : "#0a0a0a") + '">';
        fields.forEach(function (field) {
          html += '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a;vertical-align:middle">';
          html += fieldControl(field, row, ri, true);
          html += "</td>";
        });
        html +=
          '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a"><button type="button" data-role="remove" data-index="' +
          ri +
          '" style="height:28px;padding:0 8px;background:transparent;color:#eb5757;border:1px solid #3a3a3a;border-radius:4px">删除</button></td></tr>';
      });
      html += "</tbody></table></div>";
      return html;
    }

    function renderCards(rows) {
      var html = "";
      if (!rows.length) {
        return '<div style="color:#a3a3a3;padding:24px 0;text-align:center">暂无行，点击「新增一行」</div>';
      }
      rows.forEach(function (row, ri) {
        row = row || {};
        html +=
          '<section data-testid="demo-row-' +
          ri +
          '" style="margin-bottom:12px;border:1px solid #3a3a3a;border-radius:8px;background:#141414">';
        html +=
          '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #3a3a3a">';
        html +=
          '<div style="font-family:ui-monospace,monospace;color:#d4d4d4">' +
          escapeHtml(row.id || "未命名") +
          (row.name ? " · " + escapeHtml(row.name) : "") +
          "</div>";
        html +=
          '<button type="button" data-role="remove" data-index="' +
          ri +
          '" style="height:28px;padding:0 8px;background:transparent;color:#eb5757;border:1px solid #3a3a3a;border-radius:4px">删除</button></div>';
        groups().forEach(function (gid) {
          var gFields = fields.filter(function (f) {
            return (f.group || "basic") === gid;
          });
          if (!gFields.length) return;
          html += '<div style="padding:12px;border-top:1px solid #2a2a2a">';
          html += '<div style="color:#a3a3a3;margin-bottom:8px">' + escapeHtml(GROUP_NAMES[gid] || gid) + "</div>";
          html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px 16px">';
          gFields.forEach(function (field) {
            var wide = field.widget === "textarea" || field.widget === "radio" || field.widget === "tags";
            html +=
              '<label style="display:block' +
              (wide ? ";grid-column:1/-1" : "") +
              '"><div style="margin-bottom:4px;color:#a3a3a3">' +
              escapeHtml(field.label || field.key) +
              (field.required === true || field.required === "true" ? " *" : "") +
              "</div>";
            html += fieldControl(field, row, ri, false);
            if (field.hint) {
              html += '<div style="margin-top:4px;color:#737373;font-size:11px">' + escapeHtml(field.hint) + "</div>";
            }
            html += "</label>";
          });
          html += "</div></div>";
        });
        html += "</section>";
      });
      return html;
    }

    function emptyRow() {
      return {
        id: "new_" + (data.rows.length + 1),
        name: "",
        kind: "material",
        rarity: "common",
        desc: "",
        enabled: "true",
        stack: "1",
        weight: "0",
        power: "0",
        atk: "0",
        def: "0",
        color: "#3794ff",
        available_from: "",
        tags: "",
      };
    }

    function render() {
      var rows = data.rows;
      var html = toolbar("");
      html += view === "table" ? renderTable(rows) : renderCards(rows);
      html += "</div>";
      el.innerHTML = html;

      rows.forEach(function (_, ri) {
        fields.forEach(function (field) {
          bindControl(el, field, ri);
        });
      });

      el.querySelectorAll("[data-role=remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          data.rows.splice(Number(btn.getAttribute("data-index")), 1);
          api.setData(data);
          render();
        });
      });

      var tableBtn = el.querySelector("[data-testid=demo-view-table]");
      var cardBtn = el.querySelector("[data-testid=demo-view-card]");
      if (tableBtn) {
        tableBtn.addEventListener("click", function () {
          view = "table";
          render();
        });
      }
      if (cardBtn) {
        cardBtn.addEventListener("click", function () {
          view = "card";
          render();
        });
      }

      var addBtn = el.querySelector("[data-testid=demo-add]");
      if (addBtn) {
        addBtn.addEventListener("click", function () {
          data.rows.push(emptyRow());
          api.setData(data);
          render();
        });
      }
      var saveBtn = el.querySelector("[data-testid=demo-save]");
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          api.save();
        });
      }
    }

    render();
  },
};
