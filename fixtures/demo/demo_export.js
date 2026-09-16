window.BitTableExporter = {
  export: function (data) {
    return {
      files: [
        { name: "demo.json", content: JSON.stringify(data, null, 2) },
      ],
    };
  },
};
