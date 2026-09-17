export class BitTableExporterBase {
  fileName = "table.json";

  export(data: unknown): { files: { name: string; content: string }[] } {
    return { files: [{ name: this.fileName, content: JSON.stringify(data, null, 2) }] };
  }
}
