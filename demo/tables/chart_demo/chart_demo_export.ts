import { BitTableExporterBase } from "bit-tables.export";

class ChartDemoExporter extends BitTableExporterBase {
  fileName = "chart_demo.json";
}

window.BitTableExporter = new ChartDemoExporter();
