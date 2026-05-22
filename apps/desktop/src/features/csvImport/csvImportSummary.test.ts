import { describe, it, expect } from "vitest";
import { deriveCsvImportUiSummary } from "./csvImportSummary";
import type { CsvImportPreviewDto, CsvImportPreviewRowDto } from "../../api/tauriClient";

function makeRow(
  action: "create" | "skip_due_to_error",
  hasWarning = false,
): CsvImportPreviewRowDto {
  return {
    row_number: 1,
    code: "dev-001",
    device_type: "server",
    name: null,
    device_model_code: null,
    serial_number: null,
    asset_tag: null,
    status: "planned",
    action,
    issues: hasWarning
      ? [{ code: "W001", level: "warning", message: "test warning", details: null }]
      : [],
  };
}

function makePreview(rows: CsvImportPreviewRowDto[]): CsvImportPreviewDto {
  return {
    summary: { total_rows: rows.length, valid_rows: 0, error_rows: 0, warning_count: 0 },
    file_issues: [],
    rows,
  };
}

describe("deriveCsvImportUiSummary", () => {
  it("returns all zeros for null preview", () => {
    expect(deriveCsvImportUiSummary(null)).toEqual({
      totalRows: 0,
      importableRows: 0,
      cleanRows: 0,
      warningRows: 0,
      skippedRows: 0,
    });
  });

  it("counts one clean importable row correctly", () => {
    const result = deriveCsvImportUiSummary(makePreview([makeRow("create")]));
    expect(result).toEqual({
      totalRows: 1,
      importableRows: 1,
      cleanRows: 1,
      warningRows: 0,
      skippedRows: 0,
    });
  });

  it("counts one warning importable row correctly", () => {
    const result = deriveCsvImportUiSummary(
      makePreview([makeRow("create", true)]),
    );
    expect(result).toEqual({
      totalRows: 1,
      importableRows: 1,
      cleanRows: 0,
      warningRows: 1,
      skippedRows: 0,
    });
  });

  it("does not double-count warning rows in mixed preview", () => {
    const rows: CsvImportPreviewRowDto[] = [
      makeRow("create"),
      makeRow("create"),
      makeRow("create", true),
      makeRow("skip_due_to_error"),
    ];
    const result = deriveCsvImportUiSummary(makePreview(rows));
    expect(result).toEqual({
      totalRows: 4,
      importableRows: 3,
      cleanRows: 2,
      warningRows: 1,
      skippedRows: 1,
    });
    // Key invariant: importableRows === cleanRows + warningRows (no double-count)
    expect(result.importableRows).toBe(result.cleanRows + result.warningRows);
  });
});
