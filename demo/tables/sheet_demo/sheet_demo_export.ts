import { BitTableExporterBase } from "base";

class SheetDemoExporter extends BitTableExporterBase {
  fileName = "sheet_demo.json";
}

window.BitTableExporter = new SheetDemoExporter();
