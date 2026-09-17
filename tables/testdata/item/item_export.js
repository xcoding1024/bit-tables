window.BitTableExporter = {
  export: function (data) {
    var file = { name: "{{TABLE_ID}}.json", content: JSON.stringify(data, null, 2) };
    return { client: [file], server: [file] };
  },
};
