window.BitTableExporter = {
  export: function (data) {
    return {
      files: [
        { name: "chart_demo.json", content: JSON.stringify(data, null, 2) },
      ],
    };
  },
};
