window.BitTableChecker = {
  check: function (data, struct) {
    var errors = [];
    function checkRows(rows, prefix) {
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i] || {};
        if (!row.id) {
          errors.push({ path: prefix + i + ".id", message: "id 必填" });
        }
        if (!String(row.name || "").trim()) {
          errors.push({ path: prefix + i + ".name", message: "名称必填" });
        }
      }
    }
    var sheets = struct && Array.isArray(struct.sheets) ? struct.sheets : [];
    if (sheets.length) {
      var bag = (data && data.sheets) || {};
      var def = (struct && struct.default_sheet) || (sheets[0] && sheets[0].id);
      for (var s = 0; s < sheets.length; s++) {
        var sid = sheets[s] && sheets[s].id;
        if (!sid) continue;
        var part = bag[sid];
        var rows = part && Array.isArray(part.rows) ? part.rows : [];
        if (!part && data && Array.isArray(data.rows) && sid === def) {
          rows = data.rows;
        }
        checkRows(rows, "sheets." + sid + ".rows.");
      }
    } else {
      checkRows((data && data.rows) || [], "rows.");
    }
    return { ok: errors.length === 0, errors: errors };
  },
};
