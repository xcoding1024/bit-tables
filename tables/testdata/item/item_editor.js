window.BitTableEditor = {
  mount: function (el, api) {
    var data = api.getData() || { rows: [] };
    if (!data.rows) {
      data.rows = [];
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
    function render() {
      var rows = data.rows || [];
      var html = '<div data-testid="table-editor" style="padding:12px;box-sizing:border-box">';
      html += '<div style="margin-bottom:8px;color:#a3a3a3">道具表</div>';
      html += '<table style="width:100%;border-collapse:collapse">';
      html += "<thead><tr>";
      html += '<th style="text-align:left;color:#a3a3a3;padding:6px;border-bottom:1px solid #3a3a3a">id</th>';
      html += '<th style="text-align:left;color:#a3a3a3;padding:6px;border-bottom:1px solid #3a3a3a">名称</th>';
      html += "</tr></thead><tbody>";
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i] || {};
        var id = row.id || "row" + i;
        html += '<tr data-testid="item-row-' + escapeAttr(id) + '">';
        html +=
          '<td style="padding:6px;border-bottom:1px solid #3a3a3a;font-family:ui-monospace,monospace">' +
          escapeHtml(id) +
          "</td>";
        html +=
          '<td style="padding:6px;border-bottom:1px solid #3a3a3a"><input data-testid="item-name-' +
          escapeAttr(id) +
          '" value="' +
          escapeAttr(row.name || "") +
          '" style="width:100%;height:28px;background:#1a1a1a;border:1px solid #3a3a3a;color:#f5f5f5;border-radius:4px;padding:0 8px" /></td>';
        html += "</tr>";
      }
      html += "</tbody></table>";
      html +=
        '<button data-testid="item-save" type="button" style="margin-top:12px;height:28px;padding:0 10px;background:#3794ff;color:#fff;border:0;border-radius:4px">保存</button>';
      html += "</div>";
      el.innerHTML = html;
      var inputs = el.querySelectorAll("input[data-testid^='item-name-']");
      for (var j = 0; j < inputs.length; j++) {
        inputs[j].addEventListener("input", function (ev) {
          var key = ev.target.getAttribute("data-testid").slice("item-name-".length);
          for (var k = 0; k < data.rows.length; k++) {
            if (String(data.rows[k].id) === key) {
              data.rows[k].name = ev.target.value;
            }
          }
          api.setData(data);
        });
      }
      var saveBtn = el.querySelector("[data-testid=item-save]");
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          api.save();
        });
      }
    }
    render();
  },
};
