import { BitTableExporterBase } from "base";

class EnumDemoExporter extends BitTableExporterBase {
  fileName = "enum_demo.json";
}

window.BitTableExporter = new EnumDemoExporter();
