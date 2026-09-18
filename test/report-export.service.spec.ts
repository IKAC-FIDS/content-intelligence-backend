import { BadRequestException } from "@nestjs/common";
import * as XLSX from "xlsx";
import { ReportExportService } from "../src/common/export/report-export.service";

describe("ReportExportService", () => {
  const service = new ReportExportService();

  it("creates BOM-prefixed CSV and neutralizes spreadsheet formulas", () => {
    const file = service.create(
      "csv",
      "quality",
      [{ name: "Issues", rows: [{ value: "=1+1", note: "a,b" }] }],
      10,
    );
    const text = file.buffer.toString("utf8");
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("'=1+1");
    expect(text).toContain('"a,b"');
    expect(text).toContain("\r\n");
  });

  it("rejects exports over the configured row limit", () => {
    expect(() =>
      service.create("csv", "large", [{ name: "Rows", rows: [{}, {}] }], 1),
    ).toThrow(BadRequestException);
  });

  it("creates a valid XLSX workbook with sanitized worksheet names", () => {
    const file = service.create(
      "xlsx",
      "report",
      [{ name: "Bad/Name:*?[] that is much too long", rows: [{ id: 1 }] }],
      10,
    );
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    expect(workbook.SheetNames[0].length).toBeLessThanOrEqual(31);
    expect(workbook.SheetNames[0]).not.toMatch(/[\\/?*[\]:]/);
  });
});
