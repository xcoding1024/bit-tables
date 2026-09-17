export class BitTableExporterBase {
  fileName = "table.json";
  clientFileName = "";
  serverFileName = "";

  export(data: unknown): {
    client: { name: string; content: string }[];
    server: { name: string; content: string }[];
  } {
    const json = JSON.stringify(data, null, 2);
    const clientName = this.clientFileName || this.fileName;
    const serverName = this.serverFileName || this.fileName;
    return {
      client: [{ name: clientName, content: json }],
      server: [{ name: serverName, content: json }],
    };
  }
}
