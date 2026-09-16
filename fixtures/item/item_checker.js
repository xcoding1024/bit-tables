window.BitTableChecker = {
  check: function (data) {
    var errors = [];
    var rows = (data && data.rows) || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      if (!row.id) {
        errors.push({ path: "rows." + i + ".id", message: "id 必填" });
      }
      if (!String(row.name || "").trim()) {
        errors.push({ path: "rows." + i + ".name", message: "名称必填" });
      }
    }
    return { ok: errors.length === 0, errors: errors };
  },
};
