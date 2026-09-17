window.BitTableEditor = {
  mount: function (el, api) {
    var struct = api.getStruct() || {};
    var data = api.getData() || { rows: [] };
    if (!Array.isArray(data.rows)) data.rows = [];
    var fields = Array.isArray(struct.fields) && struct.fields.length
      ? struct.fields
      : [
          { key: "id", label: "ID", required: true },
          { key: "name", label: "名称", required: true },
        ];
    var title = struct.name || "枚举";
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
        return f && f.key && f.key !== "id";
      });
    }
    function fieldByKey(key) {
      for (var i = 0; i < fields.length; i++) {
        if (fields[i].key === key) return fields[i];
      }
      return batchableFields()[0];
    }
    function emptyRow() {
      var row = {};
      fields.forEach(function (f) {
        if (!f || !f.key) return;
        if (f.key === "id") row.id = "new_" + (data.rows.length + 1);
        else row[f.key] = "";
      });
      if (!row.id) row.id = "new_" + (data.rows.length + 1);
      return row;
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
      if (batchDraft[field.key] == null) batchDraft[field.key] = "";
      var html =
        '<div data-testid="enum-demo-batch-panel" style="margin-bottom:12px;padding:12px;border:1px solid #3a3a3a;border-radius:8px;background:#141414">';
      html += '<div style="margin-bottom:8px;color:#d4d4d4">把下列值写到已选 ' + selectedIndexes().length + " 行</div>";
      html += '<div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap">';
      html += '<label style="min-width:140px"><div style="margin-bottom:4px;color:#a3a3a3">字段</div>';
      html +=
        '<select data-testid="enum-demo-batch-field" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px">';
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
        '<input data-testid="enum-demo-batch-value" value="' +
        escapeAttr(batchDraft[field.key]) +
        '" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px" /></label>';
      html +=
        '<button type="button" data-testid="enum-demo-batch-apply" style="' +
        btn("primary") +
        '">应用到选中行</button>';
      html +=
        '<button type="button" data-testid="enum-demo-batch-cancel" style="' +
        btn("ghost") +
        '">取消</button></div></div>';
      return html;
    }
    function render() {
      var n = selectedIndexes().length;
      var disabled = n === 0 ? "opacity:.45;cursor:default" : "";
      var allOn = data.rows.length > 0 && data.rows.every(function (_, i) {
        return picked[i];
      });
      var html =
        '<div data-testid="enum-demo-editor" style="padding:12px;box-sizing:border-box;height:100%;overflow:auto">';
      html +=
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap">' +
        '<div><div style="font-size:14px">' +
        escapeHtml(title) +
        '</div><div style="margin-top:2px;color:#a3a3a3;font-size:12px">枚举项 · 勾选后可批量修改或删除</div></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<span style="color:#a3a3a3;min-width:56px">已选 ' +
        n +
        "</span>" +
        '<button type="button" data-testid="enum-demo-batch-edit" ' +
        (n ? "" : "disabled ") +
        'style="' +
        btn("ghost", disabled) +
        '">批量修改</button>' +
        '<button type="button" data-testid="enum-demo-batch-delete" ' +
        (n ? "" : "disabled ") +
        'style="' +
        btn("danger", disabled) +
        '">批量删除</button>' +
        '<button type="button" data-testid="enum-demo-add" style="' +
        btn("ghost") +
        '">新增一行</button>' +
        '<button type="button" data-testid="enum-demo-save" style="' +
        btn("primary") +
        '">保存</button></div></div>';
      if (batchOpen) html += renderBatchPanel();
      html +=
        '<div style="border:1px solid #3a3a3a;border-radius:8px;overflow:hidden"><table style="width:100%;border-collapse:collapse"><thead><tr>';
      html +=
        '<th style="width:36px;padding:8px;border-bottom:1px solid #3a3a3a;background:#1a1a1a">' +
        '<input type="checkbox" data-testid="enum-demo-pick-all"' +
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
          '" style="padding:24px;text-align:center;color:#a3a3a3">暂无行</td></tr>';
      }
      data.rows.forEach(function (row, ri) {
        row = row || {};
        html +=
          '<tr data-testid="enum-demo-row-' +
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
          html +=
            '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a"><input data-testid="enum-demo-' +
            escapeAttr(key) +
            "-" +
            ri +
            '" value="' +
            escapeAttr(val) +
            '" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px;font-family:' +
            (key === "id" ? "ui-monospace,monospace" : "inherit") +
            '" /></td>';
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
          var input = el.querySelector('[data-testid="enum-demo-' + f.key + "-" + ri + '"]');
          if (!input) return;
          input.addEventListener("input", function (ev) {
            if (!data.rows[ri]) data.rows[ri] = {};
            data.rows[ri][f.key] = ev.target.value;
            api.setData(data);
          });
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
      var pickAll = el.querySelector("[data-testid=enum-demo-pick-all]");
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
      var addBtn = el.querySelector("[data-testid=enum-demo-add]");
      if (addBtn) {
        addBtn.addEventListener("click", function () {
          data.rows.push(emptyRow());
          api.setData(data);
          render();
        });
      }
      var saveBtn = el.querySelector("[data-testid=enum-demo-save]");
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          api.save();
        });
      }
      var batchEdit = el.querySelector("[data-testid=enum-demo-batch-edit]");
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
      var batchDelete = el.querySelector("[data-testid=enum-demo-batch-delete]");
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
      var batchCancel = el.querySelector("[data-testid=enum-demo-batch-cancel]");
      if (batchCancel) {
        batchCancel.addEventListener("click", function () {
          batchOpen = false;
          render();
        });
      }
      var batchField = el.querySelector("[data-testid=enum-demo-batch-field]");
      if (batchField) {
        batchField.addEventListener("change", function () {
          batchKey = batchField.value;
          render();
        });
      }
      var batchValue = el.querySelector("[data-testid=enum-demo-batch-value]");
      if (batchValue) {
        batchValue.addEventListener("input", function () {
          batchDraft[batchKey] = batchValue.value;
        });
      }
      var batchApply = el.querySelector("[data-testid=enum-demo-batch-apply]");
      if (batchApply) {
        batchApply.addEventListener("click", function () {
          var field = fieldByKey(batchKey);
          if (!field) return;
          var value = batchDraft[field.key] == null ? "" : batchDraft[field.key];
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
