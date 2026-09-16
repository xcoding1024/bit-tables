window.BitTableChecker = {
  check: function (data, struct) {
    var errors = [];
    var sheets = struct && Array.isArray(struct.sheets) ? struct.sheets : [];
    var bag = (data && data.sheets) || {};
    var def = (struct && struct.default_sheet) || (sheets[0] && sheets[0].id);

    function labelKey(sheetId) {
      if (sheetId === "line") return "month";
      if (sheetId === "bar") return "category";
      if (sheetId === "pie") return "label";
      return "label";
    }

    function checkRows(sheetId, rows) {
      var key = labelKey(sheetId);
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i] || {};
        var prefix = "sheets." + sheetId + ".rows." + i;
        if (!String(row[key] == null ? "" : row[key]).trim()) {
          errors.push({ path: prefix + "." + key, message: key + " 必填" });
        }
        if (row.value == null || row.value === "") {
          errors.push({ path: prefix + ".value", message: "value 必填" });
        } else {
          var n = Number(row.value);
          if (!isFinite(n)) {
            errors.push({ path: prefix + ".value", message: "value 须为数字" });
          } else if (sheetId === "pie" && n < 0) {
            errors.push({ path: prefix + ".value", message: "饼图 value 须 ≥ 0" });
          }
        }
      }
    }

    for (var s = 0; s < sheets.length; s++) {
      var sid = sheets[s] && sheets[s].id;
      if (!sid) continue;
      var part = bag[sid];
      var rows = part && Array.isArray(part.rows) ? part.rows : [];
      if (!part && data && Array.isArray(data.rows) && sid === def) {
        rows = data.rows;
      }
      checkRows(sid, rows);
    }
    return { ok: errors.length === 0, errors: errors };
  },
};
