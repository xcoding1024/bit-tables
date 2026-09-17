window.BitTableEditor = {
  mount: function (el, api) {
    var FALLBACK_FIELDS = [
      { key: "id", label: "ID", type: "string", widget: "text", group: "basic", required: true },
      { key: "name", label: "名称", type: "string", widget: "text", group: "basic", required: true },
      { key: "icon", label: "图标", type: "icon", widget: "icon", group: "basic", path: "res/item_icons/{id}.png" },
      { key: "kind", label: "分类", type: "enum", widget: "select", group: "basic", enum: "kinds" },
      { key: "rarity", label: "稀有度", type: "enum", widget: "radio", group: "basic", enum: "enum_demo.rarities" },
      { key: "desc", label: "描述", type: "string", widget: "textarea", group: "basic" },
      { key: "enabled", label: "启用", type: "bool", widget: "checkbox", group: "value" },
      { key: "stack", label: "堆叠上限", type: "int", widget: "number", group: "value", min: 1, max: 999 },
      { key: "weight", label: "重量", type: "float", widget: "number", group: "value", step: 0.1 },
      { key: "power", label: "强度", type: "int", widget: "range", group: "value", min: 0, max: 100 },
      { key: "available_from", label: "上架日期", type: "date", widget: "date", group: "extra" },
      { key: "tags", label: "标签", type: "enum", widget: "multiselect", group: "extra", enum: "enum_demo.tags" },
      { key: "params", label: "自定义参数", type: "object", widget: "params", group: "extra" },
    ];
    var GROUP_NAMES = { basic: "基础信息", value: "数值与开关", extra: "展示与扩展" };
    // 按分类写死不同的自定义参数形态（表格摘要 + 弹窗共用）
    var PARAM_SCHEMAS = {
      weapon: [
        { key: "atk", label: "攻击", type: "int", min: 0, max: 9999 },
        { key: "crit", label: "暴击率", type: "float", min: 0, max: 1, step: 0.01 },
        { key: "durability", label: "耐久", type: "int", min: 0, max: 9999 },
      ],
      armor: [
        { key: "def", label: "防御", type: "int", min: 0, max: 9999 },
        { key: "resist_fire", label: "火抗", type: "int", min: 0, max: 100 },
        { key: "durability", label: "耐久", type: "int", min: 0, max: 9999 },
      ],
      consumable: [
        { key: "heal", label: "治疗量", type: "int", min: 0, max: 9999 },
        { key: "duration", label: "持续秒数", type: "int", min: 0, max: 3600 },
        { key: "cooldown", label: "冷却秒数", type: "int", min: 0, max: 3600 },
      ],
      material: [
        { key: "purity", label: "纯度", type: "float", min: 0, max: 1, step: 0.01 },
        { key: "craft_bonus", label: "锻造加成", type: "int", min: 0, max: 100 },
        { key: "refine_cost", label: "精炼消耗", type: "int", min: 0, max: 9999 },
      ],
    };
    var PARAM_SCHEMA_TITLES = {
      weapon: "武器参数",
      armor: "防具参数",
      consumable: "消耗品参数",
      material: "材料参数",
    };

    var struct = api.getStruct() || {};
    var data = normalizeData(api.getData());
    var enumsBag = (api.getEnums && api.getEnums()) || {};
    var fields = parseFields(struct);
    var title = struct.name || "Sheet 控件演示表";
    var view = "table";
    var picked = {};
    var colFilters = {};
    var openFilterKey = null;
    var batchOpen = false;
    var batchKey = "kind";
    var batchDraft = {};
    var openMultiKey = null;
    var paramsEditRi = null;
    var paramsDraft = null;

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

    function enumOptions(field) {
      var ref = field && field.enum ? String(field.enum).trim() : "";
      if (ref && enumsBag[ref] && enumsBag[ref].length) {
        return enumsBag[ref].map(function (item) {
          return { id: String(item.id), name: String(item.name || item.id) };
        });
      }
      var raw = field && field.options;
      var list = Array.isArray(raw)
        ? raw.map(String)
        : String(raw || "")
            .split(",")
            .map(function (s) {
              return s.trim();
            })
            .filter(Boolean);
      return list.map(function (id) {
        return { id: id, name: id };
      });
    }

    function optionsOf(field) {
      return enumOptions(field).map(function (item) {
        return item.id;
      });
    }

    function splitMulti(value) {
      if (Array.isArray(value)) {
        return value.map(String).map(function (s) {
          return s.trim();
        }).filter(Boolean);
      }
      return String(value == null ? "" : value)
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
    }

    function joinMulti(ids) {
      return ids.join(", ");
    }

    function multiSummary(field, val) {
      var ids = splitMulti(val);
      if (!ids.length) return "请选择…";
      var byId = {};
      enumOptions(field).forEach(function (opt) {
        byId[opt.id] = opt.name;
      });
      return ids
        .map(function (id) {
          return byId[id] || id;
        })
        .join(", ");
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
      if (i === "batch") {
        batchDraft[key] = value;
        return;
      }
      if (!data.rows[i]) data.rows[i] = {};
      data.rows[i][key] = value;
      api.setData(data);
    }

    function selectedIndexes() {
      return Object.keys(picked)
        .map(Number)
        .filter(function (i) {
          return picked[i] && data.rows[i];
        })
        .sort(function (a, b) {
          return a - b;
        });
    }

    function rowFilterText(field, row) {
      if (!field || !field.key) return "";
      if (field.widget === "params" || field.type === "object") return paramsSummary(row[field.key], row.kind);
      if (field.widget === "icon" || field.type === "icon") return iconRelPath(field, row);
      if (field.widget === "multiselect" || field.widget === "tags") return multiSummary(field, row[field.key]);
      if (field.type === "bool") return truthy(row[field.key]) ? "true" : "false";
      var val = row[field.key] == null ? "" : row[field.key];
      if (field.enum || field.type === "enum") {
        var name = "";
        enumOptions(field).forEach(function (opt) {
          if (String(opt.id) === String(val)) name = opt.name;
        });
        return String(val) + (name ? " " + name : "");
      }
      return String(val);
    }

    function rowMatchesFilters(row) {
      for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        if (!field || !field.key) continue;
        if (field.widget === "icon" || field.type === "icon") continue;
        var q = String(colFilters[field.key] == null ? "" : colFilters[field.key]).trim();
        if (!q) continue;
        if (field.type === "bool") {
          if ((truthy(row[field.key]) ? "true" : "false") !== q) return false;
          continue;
        }
        if ((field.enum || field.type === "enum") && field.widget !== "multiselect" && field.widget !== "tags") {
          if (String(row[field.key] == null ? "" : row[field.key]) !== q) return false;
          continue;
        }
        if (rowFilterText(field, row).toLowerCase().indexOf(q.toLowerCase()) < 0) return false;
      }
      return true;
    }

    function filteredRowIndexes() {
      var out = [];
      data.rows.forEach(function (row, i) {
        if (rowMatchesFilters(row || {})) out.push(i);
      });
      return out;
    }

    function hasActiveFilters() {
      return fields.some(function (field) {
        return field && field.key && String(colFilters[field.key] || "").trim();
      });
    }

    function filterIconSvg(active) {
      var color = active ? "#3794ff" : "#a3a3a3";
      return (
        '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style="display:block">' +
        '<path fill="' +
        color +
        '" d="M1.2 2.2h9.6L7.1 6.5v3.2L4.9 11V6.5L1.2 2.2z"/></svg>'
      );
    }

    function filterableField(field) {
      return field && field.key && field.widget !== "icon" && field.type !== "icon";
    }

    function removeFilterMenu() {
      var old = el.querySelector('[data-role="col-filter-menu"]');
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    function placeFilterMenu(field) {
      removeFilterMenu();
      if (!field || !filterableField(field)) {
        openFilterKey = null;
        return;
      }
      var btn = el.querySelector('[data-role="col-filter-btn"][data-key="' + field.key + '"]');
      if (!btn) return;
      var rect = btn.getBoundingClientRect();
      var cur = colFilters[field.key] == null ? "" : String(colFilters[field.key]);
      var menu = document.createElement("div");
      menu.setAttribute("data-role", "col-filter-menu");
      menu.setAttribute("data-key", field.key);
      var inputHtml = "";
      var inputStyle =
        "width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px;box-sizing:border-box";
      if (field.type === "bool") {
        inputHtml =
          '<select data-role="col-filter-input" style="' +
          inputStyle +
          '"><option value="">全部</option>' +
          '<option value="true"' +
          (cur === "true" ? " selected" : "") +
          ">开启</option>" +
          '<option value="false"' +
          (cur === "false" ? " selected" : "") +
          ">关闭</option></select>";
      } else if (
        (field.enum || field.type === "enum") &&
        field.widget !== "multiselect" &&
        field.widget !== "tags"
      ) {
        inputHtml = '<select data-role="col-filter-input" style="' + inputStyle + '"><option value="">全部</option>';
        enumOptions(field).forEach(function (opt) {
          inputHtml +=
            '<option value="' +
            escapeAttr(opt.id) +
            '"' +
            (cur === String(opt.id) ? " selected" : "") +
            ">" +
            escapeHtml(opt.name) +
            "</option>";
        });
        inputHtml += "</select>";
      } else {
        inputHtml =
          '<input data-role="col-filter-input" type="text" value="' +
          escapeAttr(cur) +
          '" placeholder="包含文字…" style="' +
          inputStyle +
          '" />';
      }
      menu.innerHTML =
        '<div style="margin-bottom:8px;color:#d4d4d4;font-size:12px">筛选 · ' +
        escapeHtml(field.label || field.key) +
        "</div>" +
        inputHtml +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px">' +
        '<button type="button" data-role="col-filter-clear" style="height:26px;padding:0 10px;background:transparent;color:#f5f5f5;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer">清除</button>' +
        '<button type="button" data-role="col-filter-ok" style="height:26px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px;cursor:pointer">确定</button></div>';
      var width = 220;
      var left = Math.min(rect.left, window.innerWidth - width - 8);
      if (left < 8) left = 8;
      var top = rect.bottom + 4;
      if (top + 160 > window.innerHeight) {
        top = Math.max(8, rect.top - 164);
      }
      menu.style.cssText =
        "position:fixed;z-index:10000;width:" +
        width +
        "px;left:" +
        left +
        "px;top:" +
        top +
        "px;background:#141414;border:1px solid #3a3a3a;border-radius:8px;padding:10px;box-shadow:0 12px 32px rgba(0,0,0,.55)";
      el.appendChild(menu);
      menu.addEventListener("click", function (ev) {
        ev.stopPropagation();
      });
      var input = menu.querySelector('[data-role="col-filter-input"]');
      var clear = menu.querySelector('[data-role="col-filter-clear"]');
      var ok = menu.querySelector('[data-role="col-filter-ok"]');
      function applyAndClose(next) {
        colFilters[field.key] = next == null ? "" : String(next);
        openFilterKey = null;
        removeFilterMenu();
        render();
      }
      if (clear) {
        clear.addEventListener("click", function () {
          applyAndClose("");
        });
      }
      if (ok) {
        ok.addEventListener("click", function () {
          applyAndClose(input ? input.value : "");
        });
      }
      if (input) {
        if (input.tagName === "SELECT") {
          input.addEventListener("change", function () {
            applyAndClose(input.value);
          });
        } else {
          input.focus();
          input.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
              ev.preventDefault();
              applyAndClose(input.value);
            } else if (ev.key === "Escape") {
              ev.preventDefault();
              openFilterKey = null;
              removeFilterMenu();
              render();
            }
          });
        }
      }
    }

    function headerFilterBtn(field) {
      if (!filterableField(field)) return "";
      var active = String(colFilters[field.key] || "").trim();
      return (
        '<button type="button" data-role="col-filter-btn" data-key="' +
        escapeAttr(field.key) +
        '" title="筛选" style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-left:4px;padding:0;border:0;border-radius:3px;cursor:pointer;background:' +
        (active || openFilterKey === field.key ? "#243044" : "transparent") +
        '">' +
        filterIconSvg(Boolean(active) || openFilterKey === field.key) +
        "</button>"
      );
    }

    function coerce(field, value) {
      if (!field) return value;
      if (field.type === "int") return String(parseInt(value, 10) || 0);
      if (field.type === "float") return String(Number(value) || 0);
      if (field.type === "bool") return value === true || value === "true" || value === 1 || value === "1" ? "true" : "false";
      return value;
    }

    function batchableFields() {
      return fields.filter(function (f) {
        return (
          f.key !== "id" &&
          f.widget !== "icon" &&
          f.type !== "icon" &&
          f.widget !== "params" &&
          f.type !== "object"
        );
      });
    }

    function paramFieldsFor(kind) {
      var key = String(kind || "").trim();
      return PARAM_SCHEMAS[key] || PARAM_SCHEMAS.weapon;
    }

    function defaultParams(kind) {
      var out = {};
      paramFieldsFor(kind).forEach(function (f) {
        out[f.key] = 0;
      });
      return out;
    }

    function normalizeParams(val, kind) {
      var out = defaultParams(kind);
      if (!val || typeof val !== "object" || Array.isArray(val)) return out;
      paramFieldsFor(kind).forEach(function (f) {
        if (val[f.key] == null || val[f.key] === "") return;
        var n = Number(val[f.key]);
        out[f.key] = isNaN(n) ? 0 : n;
      });
      return out;
    }

    function formatParamValue(field, value) {
      var n = Number(value);
      if (isNaN(n) || !n) return "";
      if (field.key === "crit" || field.key === "purity") {
        return field.label + " " + Math.round(n * 1000) / 10 + "%";
      }
      return field.label + " " + n;
    }

    function paramsSummary(val, kind) {
      var fields = paramFieldsFor(kind);
      var p = normalizeParams(val, kind);
      var parts = [];
      fields.forEach(function (f) {
        var text = formatParamValue(f, p[f.key]);
        if (text) parts.push(text);
      });
      return parts.length ? parts.join(" · ") : "未设置";
    }

    function iconRelPath(field, row) {
      var tpl = (field && (field.path || field.icon)) || "";
      return String(tpl).replace(/\{([a-zA-Z0-9_]+)\}/g, function (_, key) {
        var v = row && row[key];
        return v == null ? "" : String(v);
      });
    }

    function iconSrc(field, row) {
      var rel = iconRelPath(field, row);
      if (!rel || /\{|\}/.test(rel) || rel.indexOf("//") >= 0) return "";
      if (api.assetURL) return api.assetURL(rel);
      return rel;
    }

    function refreshRowIcons(ri) {
      var row = data.rows[ri] || {};
      fields.forEach(function (field) {
        if (!field || (field.widget !== "icon" && field.type !== "icon")) return;
        var img = el.querySelector('[data-testid="demo-' + field.key + "-" + ri + '"]');
        if (!img || img.tagName !== "IMG") return;
        var src = iconSrc(field, row);
        img.src = src || "";
        img.alt = src ? iconRelPath(field, row) : "无图标";
        img.style.opacity = src ? "1" : "0.35";
        img.title = iconRelPath(field, row) || "";
      });
    }

    function fieldByKey(key) {
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].key === key) return fields[i];
      }
      return batchableFields()[0];
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
      if (widget === "icon" || field.type === "icon") {
        var src = iconSrc(field, row);
        var rel = iconRelPath(field, row);
        var size = compact ? 36 : 48;
        return (
          '<div style="display:flex;align-items:center;gap:8px">' +
          '<img ' +
          test +
          ' src="' +
          escapeAttr(src) +
          '" alt="' +
          escapeAttr(rel || "icon") +
          '" title="' +
          escapeAttr(rel) +
          '" width="' +
          size +
          '" height="' +
          size +
          '" style="width:' +
          size +
          "px;height:" +
          size +
          "px;object-fit:contain;background:#141414;border:1px solid #3a3a3a;border-radius:6px;image-rendering:auto;opacity:" +
          (src ? "1" : "0.35") +
          '" />' +
          (compact
            ? ""
            : '<span style="color:#737373;font-size:11px;word-break:break-all">' +
              escapeHtml(rel || "缺少 path") +
              "</span>") +
          "</div>"
        );
      }
      if (widget === "params" || field.type === "object") {
        var summary = paramsSummary(val, row.kind);
        return (
          '<button type="button" data-role="params-open" ' +
          test +
          ' style="' +
          input +
          ";min-width:" +
          (compact ? "140px" : "100%") +
          ';display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer">' +
          '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;' +
          (summary === "未设置" ? "color:#737373" : "color:#f5f5f5") +
          '">' +
          escapeHtml(summary) +
          "</span>" +
          '<span style="color:#a3a3a3;flex-shrink:0">编辑</span></button>'
        );
      }
      if (widget === "select") {
        var html = "<select " + test + ' style="' + input + '">';
        enumOptions(field).forEach(function (opt) {
          html +=
            '<option value="' +
            escapeAttr(opt.id) +
            '"' +
            (String(val) === opt.id ? " selected" : "") +
            ">" +
            escapeHtml(opt.name) +
            "</option>";
        });
        return html + "</select>";
      }
      if (widget === "radio") {
        var radios = '<div style="display:flex;flex-wrap:wrap;gap:8px 12px;padding-top:4px">';
        enumOptions(field).forEach(function (opt) {
          radios +=
            '<label style="display:flex;align-items:center;gap:4px">' +
            '<input type="radio" name="demo-' +
            escapeAttr(key) +
            "-" +
            ri +
            '" value="' +
            escapeAttr(opt.id) +
            '" ' +
            test +
            (String(val) === opt.id ? " checked" : "") +
            " />" +
            escapeHtml(opt.name) +
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
      if (widget === "date") {
        return '<input type="date" ' + test + ' value="' + escapeAttr(val) + '" style="' + input + '" />';
      }
      if (widget === "multiselect" || widget === "tags") {
        var mid = key + "-" + ri;
        var summary = multiSummary(field, val);
        return (
          '<div data-role="multi-wrap" data-multi-id="' +
          escapeAttr(mid) +
          '" style="position:relative;min-width:' +
          (compact ? "140px" : "100%") +
          '">' +
          '<button type="button" data-role="multi-toggle" ' +
          test +
          ' style="' +
          input +
          ';display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer">' +
          '<span data-role="multi-label" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;' +
          (splitMulti(val).length ? "color:#f5f5f5" : "color:#737373") +
          '">' +
          escapeHtml(summary) +
          "</span>" +
          '<span style="color:#a3a3a3;flex-shrink:0">▾</span></button></div>'
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

    function removeMultiMenu() {
      var old = el.querySelector('[data-role="multi-menu"]');
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    function currentMultiValue(ri, key) {
      if (ri === "batch") return batchDraft[key] == null ? "" : batchDraft[key];
      var row = data.rows[ri] || {};
      return row[key] == null ? "" : row[key];
    }

    function placeMultiMenu(field, ri) {
      removeMultiMenu();
      var mid = field.key + "-" + ri;
      var wrap = el.querySelector('[data-role="multi-wrap"][data-multi-id="' + mid + '"]');
      if (!wrap) return;
      var toggle = wrap.querySelector('[data-role="multi-toggle"]');
      var label = wrap.querySelector('[data-role="multi-label"]');
      if (!toggle) return;
      var rect = toggle.getBoundingClientRect();
      var selected = {};
      splitMulti(currentMultiValue(ri, field.key)).forEach(function (id) {
        selected[id] = true;
      });
      var menu = document.createElement("div");
      menu.setAttribute("data-role", "multi-menu");
      menu.setAttribute("data-multi-id", mid);
      var opts = enumOptions(field);
      var inner = "";
      opts.forEach(function (opt) {
        inner +=
          '<label style="display:flex;align-items:center;gap:8px;padding:4px 6px;border-radius:4px;cursor:pointer;white-space:nowrap">' +
          '<input type="checkbox" data-role="multi" value="' +
          escapeAttr(opt.id) +
          '"' +
          (selected[opt.id] ? " checked" : "") +
          " />" +
          escapeHtml(opt.name) +
          "</label>";
      });
      if (!opts.length) {
        inner = '<div style="padding:8px;color:#737373;font-size:12px">暂无枚举项</div>';
      }
      menu.innerHTML = inner;
      var maxH = 220;
      var spaceBelow = window.innerHeight - rect.bottom - 8;
      var spaceAbove = rect.top - 8;
      var openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
      var height = Math.min(maxH, Math.max(120, openUp ? spaceAbove : spaceBelow));
      menu.style.cssText =
        "position:fixed;z-index:9999;min-width:" +
        Math.max(rect.width, 160) +
        "px;max-height:" +
        height +
        "px;overflow:auto;background:#1a1a1a;border:1px solid #3a3a3a;border-radius:4px;padding:6px;box-shadow:0 10px 28px rgba(0,0,0,.5);left:" +
        rect.left +
        "px;" +
        (openUp
          ? "bottom:" + (window.innerHeight - rect.top + 2) + "px;top:auto;"
          : "top:" + (rect.bottom + 2) + "px;");
      el.appendChild(menu);
      menu.addEventListener("click", function (ev) {
        ev.stopPropagation();
      });
      menu.addEventListener(
        "wheel",
        function (ev) {
          ev.stopPropagation();
          var dy = ev.deltaY;
          if (!dy) return;
          var before = menu.scrollTop;
          menu.scrollTop = before + dy;
          ev.preventDefault();
        },
        { passive: false }
      );
      var boxes = menu.querySelectorAll('[data-role="multi"]');
      function syncMulti() {
        var ids = [];
        for (var i = 0; i < boxes.length; i++) {
          if (boxes[i].checked) ids.push(boxes[i].value);
        }
        var next = joinMulti(ids);
        setRow(ri, field.key, next);
        if (label) {
          label.textContent = multiSummary(field, next);
          label.style.color = ids.length ? "#f5f5f5" : "#737373";
        }
      }
      for (var mi = 0; mi < boxes.length; mi++) {
        boxes[mi].addEventListener("change", syncMulti);
      }
    }

    function removeParamsDialog() {
      var old = el.querySelector('[data-role="params-dialog"]');
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    function placeParamsDialog() {
      removeParamsDialog();
      if (paramsEditRi == null || !data.rows[paramsEditRi]) {
        paramsEditRi = null;
        paramsDraft = null;
        return;
      }
      var row = data.rows[paramsEditRi] || {};
      var kind = row.kind;
      var fields = paramFieldsFor(kind);
      if (!paramsDraft) paramsDraft = normalizeParams(row.params, kind);
      var overlay = document.createElement("div");
      overlay.setAttribute("data-role", "params-dialog");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px";
      var panel =
        '<div data-role="params-panel" style="width:min(420px,100%);background:#141414;border:1px solid #3a3a3a;border-radius:10px;box-shadow:0 16px 48px rgba(0,0,0,.55);padding:16px">';
      panel +=
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">' +
        "<div><div style=\"font-size:14px;color:#f5f5f5\">" +
        escapeHtml(PARAM_SCHEMA_TITLES[kind] || "编辑自定义参数") +
        '</div><div style="margin-top:2px;color:#737373;font-size:12px">' +
        escapeHtml(row.name || row.id || "行 " + (paramsEditRi + 1)) +
        " · " +
        escapeHtml(kind || "unknown") +
        "</div></div>" +
        '<button type="button" data-role="params-close" style="height:28px;padding:0 10px;background:#2a2a2a;color:#f5f5f5;border:0;border-radius:4px;cursor:pointer">关闭</button></div>';
      panel += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 12px">';
      fields.forEach(function (f) {
        var v = paramsDraft[f.key];
        panel +=
          '<label style="display:block"><div style="margin-bottom:4px;color:#a3a3a3">' +
          escapeHtml(f.label) +
          '</div><input data-role="params-field" data-key="' +
          escapeAttr(f.key) +
          '" type="number" value="' +
          escapeAttr(v) +
          '"' +
          (f.min != null ? " min=" + f.min : "") +
          (f.max != null ? " max=" + f.max : "") +
          (f.step != null ? " step=" + f.step : f.type === "float" ? " step=0.01" : "") +
          ' style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px" /></label>';
      });
      panel += "</div>";
      panel +=
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">' +
        '<button type="button" data-role="params-cancel" style="height:28px;padding:0 12px;background:transparent;color:#f5f5f5;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer">取消</button>' +
        '<button type="button" data-role="params-save" style="height:28px;padding:0 12px;background:#3794ff;color:#fff;border:0;border-radius:4px;cursor:pointer">确定</button></div>';
      panel += "</div>";
      overlay.innerHTML = panel;
      el.appendChild(overlay);
      overlay.addEventListener("click", function (ev) {
        if (ev.target === overlay) {
          paramsEditRi = null;
          paramsDraft = null;
          render();
        }
      });
      var panelEl = overlay.querySelector('[data-role="params-panel"]');
      if (panelEl) {
        panelEl.addEventListener("click", function (ev) {
          ev.stopPropagation();
        });
      }
      overlay.querySelectorAll('[data-role="params-field"]').forEach(function (input) {
        input.addEventListener("change", function () {
          var key = input.getAttribute("data-key");
          var meta = null;
          for (var i = 0; i < fields.length; i++) {
            if (fields[i].key === key) meta = fields[i];
          }
          var n = meta && meta.type === "int" ? parseInt(input.value, 10) : Number(input.value);
          if (isNaN(n)) n = 0;
          if (meta && meta.min != null && n < meta.min) n = meta.min;
          if (meta && meta.max != null && n > meta.max) n = meta.max;
          paramsDraft[key] = n;
          input.value = String(n);
        });
      });
      function closeDialog() {
        paramsEditRi = null;
        paramsDraft = null;
        render();
      }
      var closeBtn = overlay.querySelector('[data-role="params-close"]');
      var cancelBtn = overlay.querySelector('[data-role="params-cancel"]');
      if (closeBtn) closeBtn.addEventListener("click", closeDialog);
      if (cancelBtn) cancelBtn.addEventListener("click", closeDialog);
      var saveBtn = overlay.querySelector('[data-role="params-save"]');
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          overlay.querySelectorAll('[data-role="params-field"]').forEach(function (input) {
            input.dispatchEvent(new Event("change"));
          });
          setRow(paramsEditRi, "params", normalizeParams(paramsDraft, kind));
          paramsEditRi = null;
          paramsDraft = null;
          render();
        });
      }
    }

    function bindControl(root, field, ri) {
      var widget = field.widget || "text";
      if (widget === "icon" || field.type === "icon") return;
      if (widget === "params" || field.type === "object") {
        var btnOpen = root.querySelector('[data-testid="demo-' + field.key + "-" + ri + '"]');
        if (!btnOpen) return;
        btnOpen.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var row = data.rows[ri] || {};
          paramsEditRi = ri;
          paramsDraft = normalizeParams(row.params, row.kind);
          render();
        });
        return;
      }
      if (widget === "multiselect" || widget === "tags") {
        var mid = field.key + "-" + ri;
        var wrap = root.querySelector('[data-role="multi-wrap"][data-multi-id="' + mid + '"]');
        if (!wrap) return;
        var toggle = wrap.querySelector('[data-role="multi-toggle"]');
        if (toggle) {
          toggle.addEventListener("click", function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            openMultiKey = openMultiKey === mid ? null : mid;
            render();
          });
        }
        if (openMultiKey === mid) placeMultiMenu(field, ri);
        return;
      }
      var nodes = root.querySelectorAll('[data-testid="demo-' + field.key + "-" + ri + '"]');
      if (!nodes.length) return;
      var node = nodes[0];
      if (node.tagName === "SELECT") widget = "select";
      if (node.tagName === "TEXTAREA") widget = "textarea";
      if (node.type === "checkbox") widget = "checkbox";
      if (node.type === "range") widget = "range";
      function apply(value) {
        if (field.type === "int") setRow(ri, field.key, String(parseInt(value, 10) || 0));
        else if (field.type === "float") setRow(ri, field.key, String(Number(value) || 0));
        else if (field.type === "bool") setRow(ri, field.key, value ? "true" : "false");
        else setRow(ri, field.key, value);
        if (field.key === "id") refreshRowIcons(ri);
        if (field.key === "kind") {
          var row = data.rows[ri] || {};
          row.params = normalizeParams(row.params, value);
          api.setData(data);
          render();
        }
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
        var rangeLabel = nodes[0].parentNode.querySelector("[data-role=range-label]");
        nodes[0].addEventListener("input", function (ev) {
          if (rangeLabel) rangeLabel.textContent = ev.target.value;
          apply(ev.target.value);
        });
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

    function btn(kind, extra) {
      if (kind === "primary") {
        return "height:28px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px;cursor:pointer;" + (extra || "");
      }
      if (kind === "danger") {
        return "height:28px;padding:0 10px;background:transparent;color:#eb5757;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer;" + (extra || "");
      }
      return "height:28px;padding:0 10px;background:#2a2a2a;color:#f5f5f5;border:0;border-radius:4px;cursor:pointer;" + (extra || "");
    }

    function toolbar(html) {
      var n = selectedIndexes().length;
      var disabled = n === 0 ? "opacity:.45;cursor:default" : "";
      html += '<div data-testid="table-editor" style="padding:16px 20px;box-sizing:border-box;height:100%;display:flex;flex-direction:column;min-height:0">';
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:12px;flex-wrap:wrap">';
      html += '<div><div style="font-weight:500">' + escapeHtml(title) + "</div>";
      html += '<div style="color:#a3a3a3;margin-top:2px">表格与卡片 · 表头漏斗可筛选 · 勾选后可批量修改或删除</div></div>';
      html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
      html +=
        '<div style="display:flex;padding:2px;border:1px solid #3a3a3a;border-radius:6px">' +
        '<button type="button" data-testid="demo-view-table" style="' +
        tabStyle(view === "table") +
        '">表格</button>' +
        '<button type="button" data-testid="demo-view-card" style="' +
        tabStyle(view === "card") +
        '">卡片</button></div>';
      if (view === "table" && hasActiveFilters()) {
        html +=
          '<button type="button" data-testid="demo-filter-clear" style="' +
          btn("ghost") +
          '">清除筛选</button>';
      }
      html += '<span data-testid="demo-selected-count" style="color:#a3a3a3;min-width:64px">已选 ' + n + " 行</span>";
      html +=
        '<button type="button" data-testid="demo-batch-edit" ' +
        (n ? "" : "disabled ") +
        'style="' +
        btn("ghost", disabled) +
        '">批量修改</button>';
      html +=
        '<button type="button" data-testid="demo-batch-delete" ' +
        (n ? "" : "disabled ") +
        'style="' +
        btn("danger", disabled) +
        '">批量删除</button>';
      html += '<button type="button" data-testid="demo-add" style="' + btn("ghost") + '">新增一行</button>';
      html += '<button type="button" data-testid="demo-save" style="' + btn("primary") + '">保存</button></div></div>';
      if (batchOpen) html += renderBatchPanel();
      return html;
    }

    function renderBatchPanel() {
      var field = fieldByKey(batchKey) || batchableFields()[0];
      if (!field) return "";
      batchKey = field.key;
      if (batchDraft[field.key] == null) {
        var opts = enumOptions(field);
        if (field.type === "bool") batchDraft[field.key] = "true";
        else if (opts.length) batchDraft[field.key] = opts[0].id;
        else if (field.type === "int" || field.type === "float") batchDraft[field.key] = "0";
        else if (field.widget === "multiselect") batchDraft[field.key] = "";
        else batchDraft[field.key] = "";
      }
      var html =
        '<div data-testid="demo-batch-panel" style="margin-bottom:12px;padding:12px;border:1px solid #3a3a3a;border-radius:8px;background:#141414">';
      html += '<div style="margin-bottom:8px;color:#d4d4d4">把下列值写到已选 ' + selectedIndexes().length + " 行</div>";
      html += '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">';
      html += '<label style="min-width:160px"><div style="margin-bottom:4px;color:#a3a3a3">字段</div>';
      html +=
        '<select data-testid="demo-batch-field" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px">';
      batchableFields().forEach(function (f) {
        html +=
          '<option value="' +
          escapeAttr(f.key) +
          '"' +
          (f.key === batchKey ? " selected" : "") +
          ">" +
          escapeHtml(f.label || f.key) +
          "</option>";
      });
      html += "</select></label>";
      html += '<label style="min-width:220px;flex:1"><div style="margin-bottom:4px;color:#a3a3a3">新值</div>';
      html += fieldControl(field, batchDraft, "batch", true);
      html += "</label>";
      html +=
        '<button type="button" data-testid="demo-batch-apply" style="' +
        btn("primary") +
        '">应用到选中行</button>';
      html +=
        '<button type="button" data-testid="demo-batch-cancel" style="' +
        btn("ghost") +
        '">取消</button></div></div>';
      return html;
    }

    function renderTable() {
      var idxs = filteredRowIndexes();
      var allOn = idxs.length > 0 && idxs.every(function (i) {
        return picked[i];
      });
      var html =
        '<div style="flex:1;min-height:0;overflow:hidden">' +
        '<div data-testid="demo-table" style="width:100%;overflow-x:auto;overflow-y:hidden;border:1px solid #3a3a3a;border-radius:8px">';
      html += '<table style="width:max-content;min-width:100%;border-collapse:collapse">';
      html += "<thead><tr>";
      html +=
        '<th style="position:sticky;top:0;z-index:2;background:#1a1a1a;padding:8px;border-bottom:1px solid #3a3a3a">' +
        '<input type="checkbox" data-testid="demo-pick-all"' +
        (allOn ? " checked" : "") +
        " /></th>";
      fields.forEach(function (field) {
        html +=
          '<th style="position:sticky;top:0;z-index:2;background:#1a1a1a;text-align:left;color:#a3a3a3;font-weight:500;padding:8px;border-bottom:1px solid #3a3a3a;white-space:nowrap">' +
          '<span style="display:inline-flex;align-items:center;gap:2px">' +
          escapeHtml(field.label || field.key) +
          headerFilterBtn(field) +
          "</span></th>";
      });
      html +=
        '<th style="position:sticky;top:0;z-index:2;background:#1a1a1a;padding:8px;border-bottom:1px solid #3a3a3a;color:#a3a3a3">操作</th></tr></thead><tbody>';
      if (!idxs.length) {
        html +=
          '<tr><td colspan="' +
          (fields.length + 2) +
          '" style="padding:24px;text-align:center;color:#a3a3a3">' +
          (data.rows.length ? "无匹配行，试试清除筛选" : "暂无行，点击「新增一行」") +
          "</td></tr>";
      }
      idxs.forEach(function (ri, vis) {
        var row = data.rows[ri] || {};
        html +=
          '<tr data-testid="demo-row-' +
          ri +
          '" style="background:' +
          (picked[ri] ? "#1c2430" : vis % 2 ? "#111" : "#0a0a0a") +
          '">';
        html +=
          '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a;text-align:center">' +
          '<input type="checkbox" data-role="pick" data-index="' +
          ri +
          '" data-testid="demo-pick-' +
          ri +
          '"' +
          (picked[ri] ? " checked" : "") +
          " /></td>";
        fields.forEach(function (field) {
          html += '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a;vertical-align:middle">';
          html += fieldControl(field, row, ri, true);
          html += "</td>";
        });
        html +=
          '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a"><button type="button" data-role="remove" data-index="' +
          ri +
          '" style="' +
          btn("danger") +
          '">删除</button></td></tr>';
      });
      html += "</tbody></table></div></div>";
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
          '<label style="display:flex;align-items:center;gap:8px;font-family:ui-monospace,monospace;color:#d4d4d4">' +
          '<input type="checkbox" data-role="pick" data-index="' +
          ri +
          '" data-testid="demo-pick-' +
          ri +
          '"' +
          (picked[ri] ? " checked" : "") +
          " />" +
          escapeHtml(row.id || "未命名") +
          (row.name ? " · " + escapeHtml(row.name) : "") +
          "</label>";
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
            var wide =
              field.widget === "textarea" ||
              field.widget === "radio" ||
              field.widget === "multiselect" ||
              field.widget === "tags" ||
              field.widget === "params" ||
              field.type === "object";
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
      var row = {};
      fields.forEach(function (f) {
        if (!f || !f.key) return;
        if (f.key === "id") row.id = "new_" + (data.rows.length + 1);
        else if (f.widget === "icon" || f.type === "icon") return;
        else if (f.widget === "params" || f.type === "object") row[f.key] = defaultParams(row.kind || "weapon");
        else if (f.type === "bool") row[f.key] = "true";
        else if (f.type === "int" || f.type === "float") row[f.key] = "0";
        else if (f.widget === "multiselect") row[f.key] = "";
        else {
          var opts = enumOptions(f);
          row[f.key] = opts.length ? opts[0].id : "";
        }
      });
      if (!row.id) row.id = "new_" + (data.rows.length + 1);
      return row;
    }

    function syncTableScroll() {
      var wrap = el.querySelector("[data-testid=demo-table]");
      if (!wrap) return;
      var holder = wrap.parentElement;
      var table = wrap.querySelector("table");
      if (!holder || !table) return;
      wrap.style.height = "auto";
      wrap.style.maxHeight = "";
      wrap.style.overflowX = "auto";
      wrap.style.overflowY = "hidden";
      var maxH = holder.clientHeight;
      if (maxH <= 0) return;
      var tableH = table.offsetHeight;
      var hBar = wrap.scrollWidth > wrap.clientWidth ? wrap.offsetHeight - wrap.clientHeight : 0;
      if (hBar < 0) hBar = 0;
      if (!hBar && wrap.scrollWidth > wrap.clientWidth) hBar = 10;
      var need = tableH + hBar;
      if (need > maxH) {
        wrap.style.height = maxH + "px";
        wrap.style.overflowY = "auto";
      } else {
        wrap.style.height = need + "px";
        wrap.style.overflowY = "hidden";
      }
    }

    function render() {
      var rows = data.rows;
      var prevTable = el.querySelector("[data-testid=demo-table]");
      var savedScrollLeft = prevTable ? prevTable.scrollLeft : 0;
      var savedScrollTop = prevTable ? prevTable.scrollTop : 0;
      var html = toolbar("");
      html += view === "table" ? renderTable() : renderCards(rows);
      html += "</div>";
      el.innerHTML = html;

      var visible = view === "table" ? filteredRowIndexes() : rows.map(function (_, i) {
        return i;
      });
      visible.forEach(function (ri) {
        fields.forEach(function (field) {
          bindControl(el, field, ri);
        });
      });
      if (paramsEditRi != null) placeParamsDialog();

      el.querySelectorAll('[data-role="col-filter-btn"]').forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var key = btn.getAttribute("data-key");
          openFilterKey = openFilterKey === key ? null : key;
          render();
        });
      });
      if (openFilterKey) {
        var filterField = fieldByKey(openFilterKey);
        if (filterField) placeFilterMenu(filterField);
        else openFilterKey = null;
      }
      var clearBtn = el.querySelector("[data-testid=demo-filter-clear]");
      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          colFilters = {};
          openFilterKey = null;
          removeFilterMenu();
          render();
        });
      }
      if (!el._bitFilterCloseBound) {
        el._bitFilterCloseBound = true;
        document.addEventListener("click", function (ev) {
          if (!openFilterKey) return;
          var target = ev.target;
          if (
            target &&
            target.closest &&
            (target.closest('[data-role="col-filter-menu"]') || target.closest('[data-role="col-filter-btn"]'))
          ) {
            return;
          }
          openFilterKey = null;
          removeFilterMenu();
          render();
        });
      }

      syncTableScroll();
      var nextTable = el.querySelector("[data-testid=demo-table]");
      if (nextTable) {
        nextTable.scrollLeft = savedScrollLeft;
        nextTable.scrollTop = savedScrollTop;
      }
      if (!el._bitResizeBound) {
        el._bitResizeBound = true;
        window.addEventListener("resize", function () {
          syncTableScroll();
        });
      }
      if (!el._bitMultiCloseBound) {
        el._bitMultiCloseBound = true;
        document.addEventListener("click", function (ev) {
          if (!openMultiKey) return;
          var target = ev.target;
          if (
            target &&
            target.closest &&
            (target.closest('[data-role="multi-wrap"]') || target.closest('[data-role="multi-menu"]'))
          ) {
            return;
          }
          openMultiKey = null;
          removeMultiMenu();
          render();
        });
      }
      if (!el._bitMultiScrollBound) {
        el._bitMultiScrollBound = true;
        el.addEventListener(
          "scroll",
          function (ev) {
            if (!openMultiKey) return;
            var menu = el.querySelector('[data-role="multi-menu"]');
            if (menu && (ev.target === menu || (menu.contains && menu.contains(ev.target)))) {
              return;
            }
            var table = el.querySelector("[data-testid=demo-table]");
            if (table && (ev.target === table || (table.contains && table.contains(ev.target)))) {
              openMultiKey = null;
              removeMultiMenu();
              render();
            }
          },
          true
        );
      }

      el.querySelectorAll("[data-role=remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var removed = Number(btn.getAttribute("data-index"));
          data.rows.splice(removed, 1);
          var next = {};
          Object.keys(picked).forEach(function (key) {
            var i = Number(key);
            if (i === removed) return;
            next[i > removed ? i - 1 : i] = true;
          });
          picked = next;
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

      el.querySelectorAll("[data-role=pick]").forEach(function (box) {
        box.addEventListener("change", function () {
          var i = Number(box.getAttribute("data-index"));
          if (box.checked) picked[i] = true;
          else delete picked[i];
          render();
        });
      });
      var pickAll = el.querySelector("[data-testid=demo-pick-all]");
      if (pickAll) {
        pickAll.addEventListener("change", function () {
          var idxs = filteredRowIndexes();
          if (pickAll.checked) {
            idxs.forEach(function (i) {
              picked[i] = true;
            });
          } else {
            idxs.forEach(function (i) {
              delete picked[i];
            });
          }
          render();
        });
      }

      var batchEdit = el.querySelector("[data-testid=demo-batch-edit]");
      if (batchEdit) {
        batchEdit.addEventListener("click", function () {
          if (!selectedIndexes().length) return;
          batchOpen = true;
          render();
        });
      }
      var batchDelete = el.querySelector("[data-testid=demo-batch-delete]");
      if (batchDelete) {
        batchDelete.addEventListener("click", function () {
          var idxs = selectedIndexes();
          if (!idxs.length) return;
          if (!window.confirm("删除已选 " + idxs.length + " 行？")) return;
          idxs
            .slice()
            .reverse()
            .forEach(function (i) {
              data.rows.splice(i, 1);
            });
          picked = {};
          batchOpen = false;
          api.setData(data);
          render();
        });
      }
      var batchCancel = el.querySelector("[data-testid=demo-batch-cancel]");
      if (batchCancel) {
        batchCancel.addEventListener("click", function () {
          batchOpen = false;
          render();
        });
      }
      var batchField = el.querySelector("[data-testid=demo-batch-field]");
      if (batchField) {
        batchField.addEventListener("change", function () {
          batchKey = batchField.value;
          render();
        });
      }
      if (batchOpen) {
        var bf = fieldByKey(batchKey);
        if (bf) bindControl(el, bf, "batch");
      }
      var batchApply = el.querySelector("[data-testid=demo-batch-apply]");
      if (batchApply) {
        batchApply.addEventListener("click", function () {
          var field = fieldByKey(batchKey);
          if (!field) return;
          var value = coerce(field, batchDraft[field.key]);
          selectedIndexes().forEach(function (i) {
            if (!data.rows[i]) data.rows[i] = {};
            data.rows[i][field.key] = value;
          });
          api.setData(data);
          batchOpen = false;
          render();
        });
      }
    }

    render();
  },
};
