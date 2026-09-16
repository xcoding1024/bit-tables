window.BitTableExporter = {
  export: function (data) {
    return {
      files: [
        { name: "sheet_demo.json", content: JSON.stringify(data, null, 2) },
      ],
    };
  },
};
