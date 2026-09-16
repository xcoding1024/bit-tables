window.BitTableExporter = {
  export: function (data) {
    return {
      files: [
        { name: "item.json", content: JSON.stringify(data, null, 2) },
      ],
    };
  },
};
