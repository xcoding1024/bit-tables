window.BitTableChecker = {
  check: function (data, struct) {
    var errors = [];
    var rows = (data && data.rows) || [];
    var kinds = { weapon: 1, armor: 1, consumable: 1, material: 1 };
    var rarities = { common: 1, rare: 1, epic: 1, legendary: 1 };
    var ids = {};
    var fields = (struct && (struct.fields || struct.rows)) || [];

    function requiredKeys() {
      var keys = [];
      for (var i = 0; i < fields.length; i++) {
        if (fields[i] && fields[i].key && (fields[i].required === true || fields[i].required === "true")) {
          keys.push(fields[i].key);
        }
      }
      if (!keys.length) keys = ["id", "name"];
      return keys;
    }

    var required = requiredKeys();
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i] || {};
      var prefix = "rows." + i;
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
      if (row.kind && !kinds[row.kind]) {
        errors.push({ path: prefix + ".kind", message: "分类无效" });
      }
      if (row.rarity && !rarities[row.rarity]) {
        errors.push({ path: prefix + ".rarity", message: "稀有度无效" });
      }
      var stack = Number(row.stack);
      if (row.stack != null && row.stack !== "" && (isNaN(stack) || stack < 1 || stack > 999)) {
        errors.push({ path: prefix + ".stack", message: "堆叠上限须在 1–999" });
      }
      var power = Number(row.power);
      if (row.power != null && row.power !== "" && (isNaN(power) || power < 0 || power > 100)) {
        errors.push({ path: prefix + ".power", message: "强度须在 0–100" });
      }
      if (row.color && !/^#[0-9a-fA-F]{6}$/.test(String(row.color))) {
        errors.push({ path: prefix + ".color", message: "品质色须为 #RRGGBB" });
      }
    }
    return { ok: errors.length === 0, errors: errors };
  },
};
