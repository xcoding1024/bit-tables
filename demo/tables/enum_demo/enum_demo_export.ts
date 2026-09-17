import { BitTableExporterBase } from "bit-tables.export";

class EnumDemoExporter extends BitTableExporterBase {
  fileName = "enum_demo.json";
}

window.BitTableExporter = new EnumDemoExporter();
