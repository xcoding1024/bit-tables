import { BitTableExporterBase } from "bit-tables.export";

class ArrayDemoExporter extends BitTableExporterBase {
  fileName = "array_demo.json";
}

window.BitTableExporter = new ArrayDemoExporter();
