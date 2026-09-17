import { BitTableExporterBase } from "bit-tables.export";

class SheetDemoExporter extends BitTableExporterBase {
  fileName = "sheet_demo.json";
}

window.BitTableExporter = new SheetDemoExporter();
