import { BitTableExporterBase } from "base";

class ChartDemoExporter extends BitTableExporterBase {
  fileName = "chart_demo.json";
}

window.BitTableExporter = new ChartDemoExporter();
