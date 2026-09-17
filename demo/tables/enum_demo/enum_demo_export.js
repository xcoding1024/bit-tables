window.BitTableExporter = {
  export: function (data) {
    return {
      files: [
        { name: "enum_demo.json", content: JSON.stringify(data, null, 2) },
      ],
    };
  },
};
