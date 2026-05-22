import type { CsvImportPreviewDto } from "../../api/tauriClient";

export interface CsvImportUiSummary {
  totalRows: number;
  importableRows: number;
  cleanRows: number;
  warningRows: number;
  skippedRows: number;
}

export function deriveCsvImportUiSummary(
  preview: CsvImportPreviewDto | null,
): CsvImportUiSummary {
  if (preview === null) {
    return { totalRows: 0, importableRows: 0, cleanRows: 0, warningRows: 0, skippedRows: 0 };
  }

  const importableRows = preview.rows.filter(
    (r) => r.action !== "skip_due_to_error",
  ).length;

  const warningRows = preview.rows.filter(
    (r) =>
      r.action !== "skip_due_to_error" &&
      r.issues.some((i) => i.level === "warning"),
  ).length;

  const skippedRows = preview.rows.filter(
    (r) => r.action === "skip_due_to_error",
  ).length;

  return {
    totalRows: preview.rows.length,
    importableRows,
    cleanRows: importableRows - warningRows,
    warningRows,
    skippedRows,
  };
}
