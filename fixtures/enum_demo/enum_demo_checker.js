window.BitTableChecker = {
  check: function (data, struct) {
    var errors = [];

    function checkRows(sheetId, rows) {
      var ids = {};
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i] || {};
        var prefix = "sheets." + sheetId + ".rows." + i;
        if (!String(row.id == null ? "" : row.id).trim()) {
          errors.push({ path: prefix + ".id", message: "id 必填" });
        } else {
          if (!/^[a-z][a-z0-9_]*$/.test(String(row.id))) {
            errors.push({ path: prefix + ".id", message: "id 须小写字母开头，仅字母数字下划线" });
          }
          if (ids[row.id]) {
            errors.push({ path: prefix + ".id", message: "id 重复：" + row.id });
          }
          ids[row.id] = true;
        }
        if (!String(row.name == null ? "" : row.name).trim()) {
          errors.push({ path: prefix + ".name", message: "name 必填" });
        }
      }
    }

    var sheets = struct && Array.isArray(struct.sheets) ? struct.sheets : [];
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
      checkRows(sid, rows);
    }
    return { ok: errors.length === 0, errors: errors };
  },
};
