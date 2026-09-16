window.BitTableEditor = {
  mount: function (el, api) {
    var struct = api.getStruct() || {};
    var data = api.getData() || { rows: [] };
    if (!Array.isArray(data.rows)) data.rows = [];
    var fields =
      Array.isArray(struct.fields) && struct.fields.length
        ? struct.fields
        : [
            { key: "label", label: "标签", required: true },
            { key: "value", label: "数值", type: "float", required: true },
          ];
    var COLORS = ["#3794ff", "#3ecf8e", "#f5a524", "#eb5757", "#56b6c2", "#c678dd", "#e5c07b", "#98c379"];
    var CHART_META = {
      line: { title: "折线图", hint: "月度趋势 · 勾选后可批量修改或删除" },
      bar: { title: "柱状图", hint: "分类对比 · 勾选后可批量修改或删除" },
      pie: { title: "饼图", hint: "占比 · 勾选后可批量修改或删除" },
    };
    var picked = {};
    var batchOpen = false;
    var batchKey = "";
    var batchDraft = {};

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    function escapeAttr(s) {
      return escapeHtml(s).replace(/"/g, "&quot;");
    }
    function detectKind() {
      var keys = {};
      fields.forEach(function (f) {
        if (f && f.key) keys[f.key] = true;
      });
      if (keys.month) return "line";
      if (keys.category) return "bar";
      if (keys.label) return "pie";
      return "bar";
    }
    function labelKey(kind) {
      if (kind === "line") return "month";
      if (kind === "bar") return "category";
      return "label";
    }
    function num(v) {
      var n = Number(v);
      return isFinite(n) ? n : 0;
    }
    function emptyRow() {
      var kind = detectKind();
      var row = {};
      fields.forEach(function (f) {
        if (!f || !f.key) return;
        if (f.key === "value") row.value = 0;
        else if (f.key === labelKey(kind)) row[f.key] = "项" + (data.rows.length + 1);
        else row[f.key] = "";
      });
      return row;
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
    function batchableFields() {
      return fields.filter(function (f) {
        return f && f.key;
      });
    }
    function fieldByKey(key) {
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].key === key) return fields[i];
      }
      return batchableFields()[0];
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
    function renderBatchPanel() {
      var list = batchableFields();
      if (!list.length) return "";
      var field = fieldByKey(batchKey) || list[0];
      batchKey = field.key;
      if (batchDraft[field.key] == null) {
        batchDraft[field.key] = field.key === "value" || field.type === "float" || field.type === "int" ? "0" : "";
      }
      var isNum = field.key === "value" || field.type === "float" || field.type === "int";
      var html =
        '<div data-testid="chart-demo-batch-panel" style="padding:12px;border:1px solid #3a3a3a;border-radius:8px;background:#141414">';
      html += '<div style="margin-bottom:8px;color:#d4d4d4">把下列值写到已选 ' + selectedIndexes().length + " 行</div>";
      html += '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">';
      html += '<label style="min-width:140px"><div style="margin-bottom:4px;color:#a3a3a3">字段</div>';
      html +=
        '<select data-testid="chart-demo-batch-field" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px">';
      list.forEach(function (f) {
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
      html +=
        '<label style="min-width:200px;flex:1"><div style="margin-bottom:4px;color:#a3a3a3">新值</div>' +
        '<input data-testid="chart-demo-batch-value" type="' +
        (isNum ? "number" : "text") +
        '" step="' +
        (field.step != null ? field.step : isNum ? "0.1" : "any") +
        '" value="' +
        escapeAttr(batchDraft[field.key]) +
        '" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px" /></label>';
      html +=
        '<button type="button" data-testid="chart-demo-batch-apply" style="' +
        btn("primary") +
        '">应用到选中行</button>';
      html +=
        '<button type="button" data-testid="chart-demo-batch-cancel" style="' +
        btn("ghost") +
        '">取消</button></div></div>';
      return html;
    }
    function points() {
      var kind = detectKind();
      var key = labelKey(kind);
      return data.rows.map(function (row, i) {
        row = row || {};
        return {
          label: String(row[key] == null ? "" : row[key]) || "#" + (i + 1),
          value: num(row.value),
        };
      });
    }

    function renderLine(pts, w, h) {
      var padL = 44;
      var padR = 16;
      var padT = 16;
      var padB = 36;
      var iw = w - padL - padR;
      var ih = h - padT - padB;
      var max = 0;
      pts.forEach(function (p) {
        if (p.value > max) max = p.value;
      });
      if (max <= 0) max = 1;
      var svg =
        '<svg viewBox="0 0 ' +
        w +
        " " +
        h +
        '" width="100%" height="' +
        h +
        '" style="display:block">';
      svg +=
        '<rect x="0" y="0" width="' +
        w +
        '" height="' +
        h +
        '" fill="#111" rx="8" />';
      for (var g = 0; g <= 4; g++) {
        var gy = padT + (ih * g) / 4;
        var gv = max * (1 - g / 4);
        svg +=
          '<line x1="' +
          padL +
          '" y1="' +
          gy +
          '" x2="' +
          (w - padR) +
          '" y2="' +
          gy +
          '" stroke="#2a2a2a" />';
        svg +=
          '<text x="' +
          (padL - 8) +
          '" y="' +
          (gy + 4) +
          '" text-anchor="end" fill="#737373" font-size="11">' +
          Math.round(gv) +
          "</text>";
      }
      if (!pts.length) {
        svg +=
          '<text x="' +
          w / 2 +
          '" y="' +
          h / 2 +
          '" text-anchor="middle" fill="#737373" font-size="13">暂无数据</text></svg>';
        return svg;
      }
      var path = "";
      var circles = "";
      pts.forEach(function (p, i) {
        var x = padL + (pts.length === 1 ? iw / 2 : (iw * i) / (pts.length - 1));
        var y = padT + ih * (1 - p.value / max);
        path += (i ? " L " : "M ") + x + " " + y;
        circles +=
          '<circle cx="' +
          x +
          '" cy="' +
          y +
          '" r="4" fill="#3794ff" stroke="#0a0a0a" stroke-width="2" />';
        svg +=
          '<text x="' +
          x +
          '" y="' +
          (h - 12) +
          '" text-anchor="middle" fill="#a3a3a3" font-size="11">' +
          escapeHtml(p.label) +
          "</text>";
      });
      svg +=
        '<path d="' +
        path +
        '" fill="none" stroke="#3794ff" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />';
      svg += circles + "</svg>";
      return svg;
    }

    function renderBar(pts, w, h) {
      var padL = 44;
      var padR = 16;
      var padT = 16;
      var padB = 40;
      var iw = w - padL - padR;
      var ih = h - padT - padB;
      var max = 0;
      pts.forEach(function (p) {
        if (p.value > max) max = p.value;
      });
      if (max <= 0) max = 1;
      var svg =
        '<svg viewBox="0 0 ' +
        w +
        " " +
        h +
        '" width="100%" height="' +
        h +
        '" style="display:block">';
      svg +=
        '<rect x="0" y="0" width="' +
        w +
        '" height="' +
        h +
        '" fill="#111" rx="8" />';
      for (var g = 0; g <= 4; g++) {
        var gy = padT + (ih * g) / 4;
        var gv = max * (1 - g / 4);
        svg +=
          '<line x1="' +
          padL +
          '" y1="' +
          gy +
          '" x2="' +
          (w - padR) +
          '" y2="' +
          gy +
          '" stroke="#2a2a2a" />';
        svg +=
          '<text x="' +
          (padL - 8) +
          '" y="' +
          (gy + 4) +
          '" text-anchor="end" fill="#737373" font-size="11">' +
          Math.round(gv) +
          "</text>";
      }
      if (!pts.length) {
        svg +=
          '<text x="' +
          w / 2 +
          '" y="' +
          h / 2 +
          '" text-anchor="middle" fill="#737373" font-size="13">暂无数据</text></svg>';
        return svg;
      }
      var gap = 12;
      var bw = Math.max(8, (iw - gap * (pts.length + 1)) / pts.length);
      pts.forEach(function (p, i) {
        var x = padL + gap + i * (bw + gap);
        var bh = ih * (p.value / max);
        var y = padT + ih - bh;
        var color = COLORS[i % COLORS.length];
        svg +=
          '<rect x="' +
          x +
          '" y="' +
          y +
          '" width="' +
          bw +
          '" height="' +
          Math.max(bh, 1) +
          '" fill="' +
          color +
          '" rx="3" />';
        svg +=
          '<text x="' +
          (x + bw / 2) +
          '" y="' +
          (h - 14) +
          '" text-anchor="middle" fill="#a3a3a3" font-size="11">' +
          escapeHtml(p.label) +
          "</text>";
      });
      svg += "</svg>";
      return svg;
    }

    function polar(cx, cy, r, angle) {
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    }

    function renderPie(pts, w, h) {
      var cx = Math.min(w, h) / 2 + 8;
      var cy = h / 2;
      var r = Math.min(w, h) * 0.32;
      var total = 0;
      pts.forEach(function (p) {
        total += Math.max(0, p.value);
      });
      var svg =
        '<svg viewBox="0 0 ' +
        w +
        " " +
        h +
        '" width="100%" height="' +
        h +
        '" style="display:block">';
      svg +=
        '<rect x="0" y="0" width="' +
        w +
        '" height="' +
        h +
        '" fill="#111" rx="8" />';
      if (!pts.length || total <= 0) {
        svg +=
          '<text x="' +
          w / 2 +
          '" y="' +
          h / 2 +
          '" text-anchor="middle" fill="#737373" font-size="13">暂无数据</text></svg>';
        return svg;
      }
      var angle = -Math.PI / 2;
      pts.forEach(function (p, i) {
        var share = Math.max(0, p.value) / total;
        var sweep = share * Math.PI * 2;
        var a0 = angle;
        var a1 = angle + sweep;
        var p0 = polar(cx, cy, r, a0);
        var p1 = polar(cx, cy, r, a1);
        var large = sweep > Math.PI ? 1 : 0;
        var d =
          "M " +
          cx +
          " " +
          cy +
          " L " +
          p0.x +
          " " +
          p0.y +
          " A " +
          r +
          " " +
          r +
          " 0 " +
          large +
          " 1 " +
          p1.x +
          " " +
          p1.y +
          " Z";
        svg += '<path d="' + d + '" fill="' + COLORS[i % COLORS.length] + '" stroke="#0a0a0a" stroke-width="1" />';
        angle = a1;
      });
      var legendX = cx + r + 28;
      var legendY = 28;
      pts.forEach(function (p, i) {
        var pct = Math.round((Math.max(0, p.value) / total) * 1000) / 10;
        var y = legendY + i * 22;
        svg +=
          '<rect x="' +
          legendX +
          '" y="' +
          (y - 10) +
          '" width="10" height="10" rx="2" fill="' +
          COLORS[i % COLORS.length] +
          '" />';
        svg +=
          '<text x="' +
          (legendX + 16) +
          '" y="' +
          y +
          '" fill="#d4d4d4" font-size="12">' +
          escapeHtml(p.label) +
          " · " +
          pct +
          "%</text>";
      });
      svg += "</svg>";
      return svg;
    }

    function renderChart() {
      var kind = detectKind();
      var pts = points();
      var w = 720;
      var h = 280;
      if (kind === "line") return renderLine(pts, w, h);
      if (kind === "pie") return renderPie(pts, w, h);
      return renderBar(pts, w, h);
    }

    function render() {
      var kind = detectKind();
      var meta = CHART_META[kind] || CHART_META.bar;
      var n = selectedIndexes().length;
      var disabled = n === 0 ? "opacity:.45;cursor:default" : "";
      var allOn = data.rows.length > 0 && data.rows.every(function (_, i) {
        return picked[i];
      });
      var html =
        '<div data-testid="chart-demo-editor" style="padding:12px;box-sizing:border-box;height:100%;overflow:auto;display:flex;flex-direction:column;gap:12px">';
      html +=
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        "<div><div style=\"font-size:14px;color:#f5f5f5\">" +
        escapeHtml(meta.title) +
        '</div><div style="margin-top:2px;color:#a3a3a3;font-size:12px">' +
        escapeHtml(meta.hint) +
        "</div></div>" +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<span style="color:#a3a3a3;min-width:56px">已选 ' +
        n +
        "</span>" +
        '<button type="button" data-testid="chart-demo-batch-edit" ' +
        (n ? "" : "disabled ") +
        'style="' +
        btn("ghost", disabled) +
        '">批量修改</button>' +
        '<button type="button" data-testid="chart-demo-batch-delete" ' +
        (n ? "" : "disabled ") +
        'style="' +
        btn("danger", disabled) +
        '">批量删除</button>' +
        '<button type="button" data-testid="chart-demo-add" style="' +
        btn("ghost") +
        '">新增一行</button>' +
        '<button type="button" data-testid="chart-demo-save" style="' +
        btn("primary") +
        '">保存</button></div></div>';
      if (batchOpen) html += renderBatchPanel();
      html +=
        '<div data-testid="chart-demo-canvas" style="border:1px solid #3a3a3a;border-radius:8px;overflow:hidden;background:#111">' +
        renderChart() +
        "</div>";
      html +=
        '<div style="border:1px solid #3a3a3a;border-radius:8px;overflow:hidden"><table style="width:100%;border-collapse:collapse"><thead><tr>';
      html +=
        '<th style="width:36px;padding:8px;border-bottom:1px solid #3a3a3a;background:#1a1a1a">' +
        '<input type="checkbox" data-testid="chart-demo-pick-all"' +
        (allOn ? " checked" : "") +
        " /></th>";
      fields.forEach(function (f) {
        html +=
          '<th style="text-align:left;color:#a3a3a3;font-weight:500;padding:8px;border-bottom:1px solid #3a3a3a;background:#1a1a1a">' +
          escapeHtml(f.label || f.key) +
          "</th>";
      });
      html +=
        '<th style="padding:8px;border-bottom:1px solid #3a3a3a;background:#1a1a1a;color:#a3a3a3">操作</th></tr></thead><tbody>';
      if (!data.rows.length) {
        html +=
          '<tr><td colspan="' +
          (fields.length + 2) +
          '" style="padding:24px;text-align:center;color:#a3a3a3">暂无行，点击「新增一行」</td></tr>';
      }
      data.rows.forEach(function (row, ri) {
        row = row || {};
        html +=
          '<tr data-testid="chart-demo-row-' +
          ri +
          '" style="background:' +
          (picked[ri] ? "#1c2430" : "transparent") +
          '">';
        html +=
          '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a;text-align:center">' +
          '<input type="checkbox" data-role="pick" data-index="' +
          ri +
          '"' +
          (picked[ri] ? " checked" : "") +
          " /></td>";
        fields.forEach(function (f) {
          var key = f.key;
          var val = row[key] == null ? "" : row[key];
          var isNum = key === "value" || f.type === "float" || f.type === "int";
          html +=
            '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a"><input data-testid="chart-demo-' +
            escapeAttr(key) +
            "-" +
            ri +
            '" type="' +
            (isNum ? "number" : "text") +
            '" step="' +
            (f.step != null ? f.step : isNum ? "0.1" : "any") +
            '" value="' +
            escapeAttr(val) +
            '" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px" /></td>';
        });
        html +=
          '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a"><button type="button" data-role="remove" data-index="' +
          ri +
          '" style="height:28px;padding:0 8px;background:transparent;color:#eb5757;border:1px solid #3a3a3a;border-radius:4px;cursor:pointer">删除</button></td></tr>';
      });
      html += "</tbody></table></div></div>";
      el.innerHTML = html;

      data.rows.forEach(function (_, ri) {
        fields.forEach(function (f) {
          var input = el.querySelector('[data-testid="chart-demo-' + f.key + "-" + ri + '"]');
          if (!input) return;
          var evName = f.key === "value" || f.type === "float" || f.type === "int" ? "change" : "input";
          function apply() {
            if (!data.rows[ri]) data.rows[ri] = {};
            if (f.key === "value" || f.type === "float" || f.type === "int") {
              data.rows[ri][f.key] = String(Number(input.value) || 0);
              input.value = data.rows[ri][f.key];
            } else {
              data.rows[ri][f.key] = input.value;
            }
            api.setData(data);
            var canvas = el.querySelector("[data-testid=chart-demo-canvas]");
            if (canvas) canvas.innerHTML = renderChart();
          }
          input.addEventListener(evName, apply);
          if (evName === "change") input.addEventListener("input", apply);
        });
      });
      el.querySelectorAll("[data-role=pick]").forEach(function (box) {
        box.addEventListener("change", function () {
          var i = Number(box.getAttribute("data-index"));
          if (box.checked) picked[i] = true;
          else delete picked[i];
          render();
        });
      });
      var pickAll = el.querySelector("[data-testid=chart-demo-pick-all]");
      if (pickAll) {
        pickAll.addEventListener("change", function () {
          picked = {};
          if (pickAll.checked) {
            data.rows.forEach(function (_, i) {
              picked[i] = true;
            });
          }
          render();
        });
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
      var addBtn = el.querySelector("[data-testid=chart-demo-add]");
      if (addBtn) {
        addBtn.addEventListener("click", function () {
          data.rows.push(emptyRow());
          api.setData(data);
          render();
        });
      }
      var saveBtn = el.querySelector("[data-testid=chart-demo-save]");
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          api.save();
        });
      }
      var batchEdit = el.querySelector("[data-testid=chart-demo-batch-edit]");
      if (batchEdit) {
        batchEdit.addEventListener("click", function () {
          if (!selectedIndexes().length) return;
          batchOpen = true;
          if (!batchKey) {
            var first = batchableFields()[0];
            batchKey = first ? first.key : "";
          }
          render();
        });
      }
      var batchDelete = el.querySelector("[data-testid=chart-demo-batch-delete]");
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
      var batchCancel = el.querySelector("[data-testid=chart-demo-batch-cancel]");
      if (batchCancel) {
        batchCancel.addEventListener("click", function () {
          batchOpen = false;
          render();
        });
      }
      var batchField = el.querySelector("[data-testid=chart-demo-batch-field]");
      if (batchField) {
        batchField.addEventListener("change", function () {
          batchKey = batchField.value;
          render();
        });
      }
      var batchValue = el.querySelector("[data-testid=chart-demo-batch-value]");
      if (batchValue) {
        batchValue.addEventListener("input", function () {
          batchDraft[batchKey] = batchValue.value;
        });
      }
      var batchApply = el.querySelector("[data-testid=chart-demo-batch-apply]");
      if (batchApply) {
        batchApply.addEventListener("click", function () {
          var field = fieldByKey(batchKey);
          if (!field) return;
          var raw = batchDraft[field.key] == null ? "" : batchDraft[field.key];
          var value =
            field.key === "value" || field.type === "float" || field.type === "int"
              ? String(Number(raw) || 0)
              : raw;
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
