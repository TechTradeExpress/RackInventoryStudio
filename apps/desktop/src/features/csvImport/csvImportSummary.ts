interface PreviewLike {
  rows: Array<{
    action: string;
    issues: Array<{ level: string }>;
  }>;
}

export interface CsvImportUiSummary {
  totalRows: number;
  importableRows: number;
  cleanRows: number;
  warningRows: number;
  skippedRows: number;
}

export function deriveCsvImportUiSummary(
  preview: PreviewLike | null,
): CsvImportUiSummary {
  if (preview === null) {
    return { totalRows: 0, importableRows: 0, cleanRows: 0, warningRows: 0, skippedRows: 0 };
  }

  const importableRows = preview.rows.filter(
    (r) => r.action !== "skip_due_to_error",
  ).length;

  // Rows with at least one warning, including rows that also have errors.
  const warningRows = preview.rows.filter((r) =>
    r.issues.some((i) => i.level === "warning"),
  ).length;

  // Importable rows with at least one warning (for cleanRows calculation).
  const importableWarningRows = preview.rows.filter(
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
    cleanRows: importableRows - importableWarningRows,
    warningRows,
    skippedRows,
  };
}
