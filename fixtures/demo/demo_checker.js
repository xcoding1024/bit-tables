window.BitTableChecker = {
  check: function (data, struct, enums) {
    var errors = [];
    enums = enums || {};

    function requiredKeys(fields) {
      var keys = [];
      for (var i = 0; i < fields.length; i++) {
        if (fields[i] && fields[i].key && (fields[i].required === true || fields[i].required === "true")) {
          keys.push(fields[i].key);
        }
      }
      return keys;
    }

    function enumIdSet(field) {
      var ref = field && field.enum ? String(field.enum).trim() : "";
      var set = {};
      if (ref && enums[ref] && enums[ref].length) {
        enums[ref].forEach(function (item) {
          if (item && item.id) set[String(item.id)] = true;
        });
        return set;
      }
      var bag = (data && data.sheets) || {};
      if (ref && bag[ref] && Array.isArray(bag[ref].rows)) {
        bag[ref].rows.forEach(function (row) {
          if (row && row.id) set[String(row.id)] = true;
        });
        return set;
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
      list.forEach(function (id) {
        set[id] = true;
      });
      return set;
    }

    function checkRows(sheetId, rows, fields) {
      var required = requiredKeys(fields);
      if (!required.length && sheetId !== "kinds" && sheetId !== "rarities" && sheetId !== "tags") {
        required = ["id", "name"];
      }
      var ids = {};
      var enumFields = (fields || []).filter(function (f) {
        return f && (f.enum || f.type === "enum");
      });
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i] || {};
        var prefix = "sheets." + sheetId + ".rows." + i;
        required.forEach(function (key) {
          if (!String(row[key] == null ? "" : row[key]).trim()) {
            errors.push({ path: prefix + "." + key, message: key + " 必填" });
          }
        });
        if (row.id) {
          if (!/^[a-z][a-z0-9_]*$/.test(String(row.id))) {
            errors.push({ path: prefix + ".id", message: "id 须小写字母开头，仅字母数字下划线" });
          }
          if (ids[row.id]) {
            errors.push({ path: prefix + ".id", message: "id 重复：" + row.id });
          }
          ids[row.id] = true;
        }
        enumFields.forEach(function (field) {
          var key = field.key;
          var val = row[key];
          if (val == null || val === "") return;
          var allowed = enumIdSet(field);
          if (!Object.keys(allowed).length) return;
          var multi = field.widget === "multiselect" || field.widget === "tags";
          var values = multi
            ? String(val)
                .split(",")
                .map(function (s) {
                  return s.trim();
                })
                .filter(Boolean)
            : [String(val)];
          values.forEach(function (id) {
            if (!allowed[id]) {
              errors.push({
                path: prefix + "." + key,
                message: key + " 不在枚举 " + (field.enum || "") + "：" + id,
              });
            }
          });
        });
        var stack = Number(row.stack);
        if (row.stack != null && row.stack !== "" && (isNaN(stack) || stack < 1 || stack > 999)) {
          errors.push({ path: prefix + ".stack", message: "堆叠上限须在 1–999" });
        }
        var power = Number(row.power);
        if (row.power != null && row.power !== "" && (isNaN(power) || power < 0 || power > 100)) {
          errors.push({ path: prefix + ".power", message: "强度须在 0–100" });
        }
      }
    }

    var sheets = struct && Array.isArray(struct.sheets) ? struct.sheets : [];
    if (sheets.length) {
      var bag = (data && data.sheets) || {};
      var def = (struct && struct.default_sheet) || (sheets[0] && sheets[0].id);
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s] || {};
        var sid = sheet.id;
        if (!sid) continue;
        var part = bag[sid];
        var rows = part && Array.isArray(part.rows) ? part.rows : [];
        if (!part && data && Array.isArray(data.rows) && sid === def) {
          rows = data.rows;
        }
        checkRows(sid, rows, sheet.fields || []);
      }
      return { ok: errors.length === 0, errors: errors };
    }

    checkRows("main", (data && data.rows) || [], (struct && (struct.fields || struct.rows)) || []);
    errors.forEach(function (err) {
      err.path = err.path.replace(/^sheets\.main\./, "");
    });
    return { ok: errors.length === 0, errors: errors };
  },
};
