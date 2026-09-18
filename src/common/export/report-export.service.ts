import { BadRequestException, Injectable } from "@nestjs/common";
import * as XLSX from "xlsx";

export type ExportFormat = "csv" | "xlsx";
export interface ExportSheet {
  name: string;
  rows: Record<string, unknown>[];
}
@Injectable()
export class ReportExportService {
  create(
    format: ExportFormat,
    filename: string,
    sheets: ExportSheet[],
    maxRows: number,
  ) {
    const rowCount = sheets.reduce(
      (total, sheet) => total + sheet.rows.length,
      0,
    );
    if (rowCount > maxRows)
      throw new BadRequestException({
        code: "EXPORT_ROW_LIMIT_EXCEEDED",
        message: "Export row limit exceeded",
        details: { detectedRowCount: rowCount, allowedMaximum: maxRows },
      });
    const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, "-");
    if (format === "csv") {
      const rows = sheets[0]?.rows ?? [];
      const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const csv = [
        headers,
        ...rows.map((row) => headers.map((key) => this.cell(row[key]))),
      ]
        .map((row) => row.map((value) => this.quote(value)).join(","))
        .join("\r\n");
      return {
        buffer: Buffer.from(`\uFEFF${csv}`, "utf8"),
        rowCount,
        contentType: "text/csv; charset=utf-8",
        contentDisposition: this.disposition(`${safeFilename}.csv`),
      };
    }
    const workbook = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const rows = sheet.rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key, this.cell(value)]),
        ),
      );
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
      worksheet["!cols"] = this.widths(rows);
      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        this.sheetName(sheet.name),
      );
    }
    return {
      buffer: XLSX.write(workbook, {
        type: "buffer",
        bookType: "xlsx",
        compression: true,
      }) as Buffer,
      rowCount,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentDisposition: this.disposition(`${safeFilename}.xlsx`),
    };
  }
  private cell(value: unknown): string | number | boolean {
    if (value == null) return "";
    if (typeof value === "number" || typeof value === "boolean") return value;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  }
  private quote(value: string | number | boolean) {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  private sheetName(name: string) {
    return (name.replace(/[\\/?*[\]:]/g, " ").trim() || "Sheet").slice(0, 31);
  }
  private disposition(filename: string) {
    return `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
  }
  private widths(rows: Record<string, unknown>[]) {
    const keys = [...new Set(rows.flatMap(Object.keys))];
    return keys.map((key) => ({
      wch: Math.min(
        50,
        Math.max(
          10,
          key.length,
          ...rows.slice(0, 200).map((row) => String(row[key] ?? "").length),
        ),
      ),
    }));
  }
}
