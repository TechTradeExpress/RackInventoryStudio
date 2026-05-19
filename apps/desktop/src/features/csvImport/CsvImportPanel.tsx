import { FormEvent, useState } from "react";
import { common } from "../../lib/styles";
import {
  importDeviceCsv,
  previewDeviceCsvImport,
  readCsvFile,
  selectCsvFile,
  type CsvImportPreviewDto,
  type CsvImportPreviewRowDto,
} from "../../api/tauriClient";

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

interface Props {
  onRepositoryMutated: () => void;
}

function hasErrors(preview: CsvImportPreviewDto): boolean {
  return (
    preview.file_issues.some((i) => i.level === "error") ||
    preview.rows.some((r) => r.action === "skip_due_to_error")
  );
}

function issueText(row: CsvImportPreviewRowDto): string {
  if (row.issues.length === 0) return "";
  const errors = row.issues.filter((i) => i.level === "error");
  const warnings = row.issues.filter((i) => i.level === "warning");
  const parts: string[] = [];
  if (errors.length > 0) parts.push(`${errors.length} error${errors.length > 1 ? "s" : ""}`);
  if (warnings.length > 0)
    parts.push(`${warnings.length} warning${warnings.length > 1 ? "s" : ""}`);
  return parts.join(", ");
}

export function CsvImportPanel({ onRepositoryMutated }: Props) {
  const [csvContent, setCsvContent] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvImportPreviewDto | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  async function handleChooseFile() {
    setFileError(null);
    setFileLoading(true);
    try {
      const path = await selectCsvFile();
      if (path === null) return; // user cancelled — do nothing
      const content = await readCsvFile(path);
      setSelectedFile(path);
      setCsvContent(content);
      setPreview(null);
      setImportSuccess(null);
      setImportError(null);
    } catch (e) {
      setFileError(String(e));
    } finally {
      setFileLoading(false);
    }
  }

  function handleClearFile() {
    setSelectedFile(null);
    setFileError(null);
  }

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    setPreview(null);
    setPreviewError(null);
    setImportError(null);
    setImportSuccess(null);
    setPreviewing(true);
    try {
      const result = await previewDeviceCsvImport(csvContent);
      setPreview(result);
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function handleImport() {
    if (!preview || hasErrors(preview)) return;
    setImportError(null);
    setImportSuccess(null);
    setImporting(true);
    try {
      const result = await importDeviceCsv(csvContent);
      onRepositoryMutated();
      setImportSuccess(
        `Import complete: ${result.created_count} device${result.created_count !== 1 ? "s" : ""} created.` +
          (result.warning_count > 0
            ? ` (${result.warning_count} warning${result.warning_count > 1 ? "s" : ""})`
            : ""),
      );
      setPreview(null);
      setCsvContent("");
      setSelectedFile(null);
    } catch (e) {
      setImportError(String(e));
    } finally {
      setImporting(false);
    }
  }

  const blocked = preview !== null && hasErrors(preview);

  return (
    <section style={common.section}>
      <h2 style={common.h2}>CSV Import</h2>

      <p style={common.hint}>
        Import new concrete Device records from CSV. Choose a CSV file using
        the button below, or paste the CSV content directly into the text area.
        Placements and Device Models are not imported.
      </p>
      <p style={styles.formatHint}>
        Expected columns:{" "}
        <code>
          code, device_type, name, device_model_code, serial_number, asset_tag,
          external_ref, status, tags
        </code>
        <br />
        Required: <code>code</code>, <code>device_type</code>,{" "}
        <code>status</code>. Tags use <code>;</code> as separator.
      </p>

      <form onSubmit={handlePreview} style={styles.form}>
        <div style={styles.filePickerRow}>
          <button
            type="button"
            style={common.btn}
            onClick={handleChooseFile}
            disabled={fileLoading || previewing || importing}
          >
            {fileLoading ? "Loading…" : "Choose CSV file…"}
          </button>
          {selectedFile && (
            <>
              <span style={styles.selectedFile}>{fileName(selectedFile)}</span>
              <button
                type="button"
                style={styles.clearBtn}
                onClick={handleClearFile}
                disabled={fileLoading || previewing || importing}
              >
                Clear
              </button>
            </>
          )}
        </div>
        {fileError && (
          <div style={common.errorBox}>{fileError}</div>
        )}

        <div style={styles.fieldRow}>
          <label style={styles.label}>CSV Content</label>
          <textarea
            value={csvContent}
            onChange={(e) => {
              setCsvContent(e.target.value);
              setPreview(null);
              setImportSuccess(null);
              setImportError(null);
            }}
            style={styles.textarea}
            placeholder={"code,device_type,status,name\nsrv-new,server,planned,New Server"}
            disabled={previewing || importing}
            rows={8}
          />
        </div>

        {previewError && <div style={common.errorBox}>{previewError}</div>}

        <div style={styles.buttonRow}>
          <button
            type="submit"
            disabled={!csvContent.trim() || previewing || importing}
            style={common.btn}
          >
            {previewing ? "Previewing…" : "Preview"}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!preview || blocked || previewing || importing}
            style={blocked ? styles.btnDisabled : common.btn}
          >
            {importing ? "Importing…" : "Import valid devices"}
          </button>
        </div>

        {blocked && (
          <div style={styles.blockedBanner}>
            Import is blocked: fix all errors before importing.
          </div>
        )}

        {importError && <div style={common.errorBox}>{importError}</div>}
        {importSuccess && <div style={styles.successBox}>{importSuccess}</div>}
      </form>

      {preview && (
        <div style={styles.previewSection}>
          <h3 style={common.h3}>Preview</h3>

          <div style={styles.summaryGrid}>
            <span style={styles.summaryLabel}>Total rows</span>
            <span>{preview.summary.total_rows}</span>
            <span style={styles.summaryLabel}>Valid rows</span>
            <span style={preview.summary.valid_rows > 0 ? styles.ok : undefined}>
              {preview.summary.valid_rows}
            </span>
            <span style={styles.summaryLabel}>Error rows</span>
            <span
              style={
                preview.summary.error_rows > 0 ? styles.errorText : undefined
              }
            >
              {preview.summary.error_rows}
            </span>
            <span style={styles.summaryLabel}>Warnings</span>
            <span
              style={
                preview.summary.warning_count > 0
                  ? styles.warnText
                  : undefined
              }
            >
              {preview.summary.warning_count}
            </span>
          </div>

          {preview.file_issues.length > 0 && (
            <div style={styles.fileIssuesSection}>
              <strong style={styles.fileIssuesTitle}>File-level issues</strong>
              <ul style={styles.issueList}>
                {preview.file_issues.map((iss, idx) => (
                  <li
                    key={idx}
                    style={
                      iss.level === "error" ? styles.errorText : styles.warnText
                    }
                  >
                    [{iss.level.toUpperCase()}] {iss.message}
                    {iss.details ? ` (${iss.details})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preview.rows.length > 0 && (
            <div style={styles.tableWrapper}>
              <table style={common.table}>
                <thead>
                  <tr>
                    {[
                      "Row",
                      "Code",
                      "Type",
                      "Model",
                      "Serial",
                      "Asset Tag",
                      "Status",
                      "Action",
                      "Issues",
                    ].map((h) => (
                      <th key={h} style={common.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => {
                    const isError = row.action === "skip_due_to_error";
                    const rowStyle = isError
                      ? { background: "#fff0f0" }
                      : undefined;
                    return (
                      <tr key={row.row_number} style={rowStyle}>
                        <td style={common.td}>{row.row_number}</td>
                        <td style={{ ...common.td, fontFamily: "monospace" }}>
                          {row.code ?? ""}
                        </td>
                        <td style={common.td}>{row.device_type ?? ""}</td>
                        <td
                          style={{ ...common.td, fontFamily: "monospace" }}
                        >
                          {row.device_model_code ?? ""}
                        </td>
                        <td
                          style={{ ...common.td, fontFamily: "monospace" }}
                        >
                          {row.serial_number ?? ""}
                        </td>
                        <td
                          style={{ ...common.td, fontFamily: "monospace" }}
                        >
                          {row.asset_tag ?? ""}
                        </td>
                        <td style={common.td}>{row.status ?? ""}</td>
                        <td
                          style={{
                            ...common.td,
                            color: isError ? "#b00" : "#2e7d32",
                            fontWeight: 600,
                          }}
                        >
                          {isError ? "skip" : "create"}
                        </td>
                        <td style={{ ...common.td, fontSize: "0.78rem" }}>
                          {issueText(row)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {preview.rows.length > 0 &&
            preview.rows.some((r) => r.issues.length > 0) && (
              <div style={styles.rowIssueDetails}>
                <strong>Row issue details</strong>
                <ul style={styles.issueList}>
                  {preview.rows.flatMap((row) =>
                    row.issues.map((iss, idx) => (
                      <li
                        key={`${row.row_number}-${idx}`}
                        style={
                          iss.level === "error"
                            ? styles.errorText
                            : styles.warnText
                        }
                      >
                        Row {row.row_number} [{iss.level.toUpperCase()}]{" "}
                        {iss.message}
                        {iss.details ? ` — ${iss.details}` : ""}
                      </li>
                    )),
                  )}
                </ul>
              </div>
            )}
        </div>
      )}
    </section>
  );
}

const styles = {
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.6rem",
    maxWidth: "800px",
  },
  fieldRow: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.2rem",
  },
  label: {
    fontSize: "0.82rem",
    color: "#555",
  },
  textarea: {
    fontFamily: "monospace",
    fontSize: "0.85rem",
    padding: "0.4rem 0.5rem",
    border: "1px solid #ccc",
    borderRadius: "3px",
    resize: "vertical" as const,
  },
  buttonRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
  },
  btnDisabled: {
    padding: "0.4rem 0.8rem",
    fontFamily: "monospace",
    cursor: "not-allowed",
    border: "1px solid #ccc",
    borderRadius: "3px",
    background: "#f4f4f4",
    color: "#aaa",
  },
  blockedBanner: {
    padding: "0.35rem 0.75rem",
    background: "#fff0f0",
    border: "1px solid #f88",
    borderRadius: 3,
    fontSize: "0.82rem",
    color: "#b00",
  },
  successBox: {
    padding: "0.4rem 0.75rem",
    background: "#f0fff4",
    border: "1px solid #5cb85c",
    color: "#2d6a2d",
    borderRadius: "3px",
    fontSize: "0.85rem",
  },
  formatHint: {
    margin: "0 0 0.75rem",
    fontSize: "0.8rem",
    color: "#555",
    lineHeight: 1.5,
  },
  previewSection: {
    marginTop: "1.5rem",
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "auto auto",
    gap: "0.15rem 0.75rem",
    width: "fit-content",
    marginBottom: "0.75rem",
    fontSize: "0.85rem",
  },
  summaryLabel: {
    color: "#666",
  },
  ok: {
    color: "#2e7d32",
    fontWeight: 600,
  },
  errorText: {
    color: "#b00",
    fontWeight: 600,
  },
  warnText: {
    color: "#7a5800",
  },
  fileIssuesSection: {
    marginBottom: "0.75rem",
  },
  fileIssuesTitle: {
    fontSize: "0.85rem",
  },
  issueList: {
    margin: "0.25rem 0 0",
    paddingLeft: "1.2rem",
    fontSize: "0.82rem",
    lineHeight: 1.6,
  },
  tableWrapper: {
    overflowX: "auto" as const,
    marginBottom: "0.75rem",
  },
  rowIssueDetails: {
    marginTop: "0.5rem",
    fontSize: "0.82rem",
  },
  filePickerRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap" as const,
    marginBottom: "0.25rem",
  },
  selectedFile: {
    fontFamily: "monospace",
    fontSize: "0.85rem",
    color: "#333",
  },
  clearBtn: {
    padding: "0.25rem 0.5rem",
    fontFamily: "monospace",
    fontSize: "0.8rem",
    border: "1px solid #ccc",
    borderRadius: "3px",
    background: "#f4f4f4",
    cursor: "pointer",
    color: "#555",
  },
};
