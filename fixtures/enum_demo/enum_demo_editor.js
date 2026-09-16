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

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }
    function escapeAttr(s) {
      return escapeHtml(s).replace(/"/g, "&quot;");
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
    function render() {
      var html =
        '<div data-testid="enum-demo-editor" style="padding:12px;box-sizing:border-box;height:100%;overflow:auto">';
      html +=
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-wrap:wrap">' +
        '<div><div style="font-size:14px">' +
        escapeHtml(title) +
        '</div><div style="margin-top:2px;color:#a3a3a3;font-size:12px">枚举项 · id 存值，name 显示</div></div>' +
        '<div style="display:flex;gap:8px">' +
        '<button type="button" data-testid="enum-demo-add" style="height:28px;padding:0 10px;background:#2a2a2a;color:#f5f5f5;border:0;border-radius:4px;cursor:pointer">新增一行</button>' +
        '<button type="button" data-testid="enum-demo-save" style="height:28px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px;cursor:pointer">保存</button>' +
        "</div></div>";
      html +=
        '<div style="border:1px solid #3a3a3a;border-radius:8px;overflow:hidden"><table style="width:100%;border-collapse:collapse"><thead><tr>';
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
          (fields.length + 1) +
          '" style="padding:24px;text-align:center;color:#a3a3a3">暂无行</td></tr>';
      }
      data.rows.forEach(function (row, ri) {
        row = row || {};
        html += '<tr data-testid="enum-demo-row-' + ri + '">';
        fields.forEach(function (f) {
          var key = f.key;
          var val = row[key] == null ? "" : row[key];
          var ro = key === "id" && row.id ? "" : "";
          html +=
            '<td style="padding:6px 8px;border-bottom:1px solid #2a2a2a"><input data-testid="enum-demo-' +
            escapeAttr(key) +
            "-" +
            ri +
            '" value="' +
            escapeAttr(val) +
            '"' +
            ro +
            ' style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px;font-family:' +
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
      el.querySelectorAll("[data-role=remove]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          data.rows.splice(Number(btn.getAttribute("data-index")), 1);
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
    }
    render();
  },
};
