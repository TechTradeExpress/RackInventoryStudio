import { describe, it, expect } from "vitest";
import { deriveCsvImportUiSummary } from "./csvImportSummary";
import type { CsvImportPreviewDto, CsvImportPreviewRowDto } from "../../api/tauriClient";

function makeRow(
  action: "create" | "skip_due_to_error",
  hasWarning = false,
): CsvImportPreviewRowDto {
  return {
    row_number: 1,
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

function makePreview(
  rows: CsvImportPreviewRowDto[],
  fileIssues: CsvImportPreviewDto["file_issues"] = [],
): CsvImportPreviewDto {
  return {
    summary: { total_rows: rows.length, valid_rows: 0, error_rows: 0, warning_rows: 0 },
    file_issues: fileIssues,
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
    // 2 clean importable, 1 importable-with-warning, 1 skipped (no warning)
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
      warningRows: 1, // only the importable warning row (skipped row has no warning)
      skippedRows: 1,
    });
    // importableRows === cleanRows + importable_warning_rows (no double-count within importable)
    expect(result.importableRows).toBe(result.cleanRows + result.warningRows);
  });

  it("counts a skipped row with a warning in warningRows", () => {
    // Preferred semantics: warningRows includes ALL rows with warnings, even error rows.
    const rows: CsvImportPreviewRowDto[] = [
      makeRow("create"),
      makeRow("skip_due_to_error", true), // error row that also has a warning
    ];
    const result = deriveCsvImportUiSummary(makePreview(rows));
    expect(result.totalRows).toBe(2);
    expect(result.importableRows).toBe(1);
    expect(result.skippedRows).toBe(1);
    expect(result.warningRows).toBe(1); // the skipped row has a warning
    expect(result.cleanRows).toBe(1); // the importable row has no warning
    // warningRows and skippedRows can refer to the same row — that is intentional
  });

  it("file-level warning does not count in warningRows", () => {
    const rows: CsvImportPreviewRowDto[] = [makeRow("create")];
    const fileIssues: CsvImportPreviewDto["file_issues"] = [
      { code: "VAL-CSV-002", level: "warning", message: "unknown column ignored", details: null },
    ];
    const result = deriveCsvImportUiSummary(makePreview(rows, fileIssues));
    expect(result.warningRows).toBe(0); // file-level warning must not count as a row warning
    expect(result.cleanRows).toBe(1);
  });
});
