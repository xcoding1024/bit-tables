window.BitTableExporter = {
  export: function (data) {
    return {
      files: [
        { name: "{{TABLE_ID}}.json", content: JSON.stringify(data, null, 2) },
      ],
    };
  },
};
