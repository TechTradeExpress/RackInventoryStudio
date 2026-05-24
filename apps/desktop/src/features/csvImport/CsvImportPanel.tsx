import { FormEvent, useState } from "react";
import {
  importDeviceCsv,
  previewDeviceCsvImport,
  readCsvFile,
  selectCsvFile,
  type CsvImportPreviewDto,
  type CsvImportPreviewRowDto,
} from "../../api/tauriClient";
import { useBusy } from "../../lib/appBusy";
import { deriveCsvImportUiSummary } from "./csvImportSummary";
import { downloadSampleCsv } from "./csvSample";
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { IcRefresh, IcDownload, IcFolder, IcX } from "../../components/ui/Icon";

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

function rowBadge(row: CsvImportPreviewRowDto) {
  if (row.action === "skip_due_to_error") return <Badge tone="err" dot>skip</Badge>;
  if (row.issues.some((i) => i.level === "warning")) return <Badge tone="warn" dot>create</Badge>;
  return <Badge tone="ok" dot>create</Badge>;
}

function issueText(row: CsvImportPreviewRowDto): string {
  if (row.issues.length === 0) return "";
  const errs  = row.issues.filter((i) => i.level === "error").length;
  const warns = row.issues.filter((i) => i.level === "warning").length;
  const parts: string[] = [];
  if (errs  > 0) parts.push(`${errs} error${errs  > 1 ? "s" : ""}`);
  if (warns > 0) parts.push(`${warns} warning${warns > 1 ? "s" : ""}`);
  return parts.join(", ");
}

function SummaryRow({ tone, label, value, desc }: { tone: "ok" | "warn" | "err"; label: string; value: number; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span className={`status-dot ${tone}`} />
      <div className="grow">
        <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
        <div style={{ color: "var(--tx-3)", fontSize: 11 }}>{desc}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: `var(--st-${tone}-tx)` }}>{value}</div>
    </div>
  );
}

export function CsvImportPanel({ onRepositoryMutated }: Props) {
  const { isBusy, runBusy } = useBusy();

  const [csvContent, setCsvContent]     = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileError, setFileError]       = useState<string | null>(null);
  const [preview, setPreview]           = useState<CsvImportPreviewDto | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importError, setImportError]   = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  async function handleChooseFile() {
    setFileError(null);
    try {
      const path = await selectCsvFile();
      if (path === null) return;
      const content = await readCsvFile(path);
      setSelectedFile(path);
      setCsvContent(content);
      setPreview(null);
      setImportSuccess(null);
      setImportError(null);
    } catch (e) {
      setFileError(String(e));
    }
  }

  function handleClearFile() {
    setSelectedFile(null);
    setFileError(null);
  }

  async function handlePreview(e: FormEvent) {
    e.preventDefault();
    setPreview(null); setPreviewError(null);
    setImportError(null); setImportSuccess(null);
    try {
      const result = await runBusy("Previewing CSV…", () => previewDeviceCsvImport(csvContent));
      setPreview(result);
    } catch (e) {
      setPreviewError(String(e));
    }
  }

  async function handleImport() {
    if (!preview || hasErrors(preview)) return;
    setImportError(null); setImportSuccess(null);
    try {
      const result = await runBusy("Importing CSV…", () => importDeviceCsv(csvContent));
      onRepositoryMutated();
      setImportSuccess(
        `Import complete: ${result.created_count} device${result.created_count !== 1 ? "s" : ""} created.` +
        (result.warning_count > 0 ? ` (${result.warning_count} warning${result.warning_count > 1 ? "s" : ""})` : ""),
      );
      setPreview(null); setCsvContent(""); setSelectedFile(null);
    } catch (e) {
      setImportError(String(e));
    }
  }

  const blocked = preview !== null && hasErrors(preview);
  const { totalRows, importableRows, cleanRows, warningRows, skippedRows } =
    deriveCsvImportUiSummary(preview);

  return (
    <>
      <PageHeader
        title="CSV Import"
        subtitle="Import new Device records from a CSV file. Placements and Device Models are not imported."
      />
      <div className="page-content">
        <div className="cols-sidebar">
          <div className="stack-4">
            {/* Source panel */}
            <Panel title="Source" desc="Pick a CSV file or paste contents.">
              <form onSubmit={handlePreview} className="stack-3">
                <div>
                  <label className="eyebrow" style={{ marginBottom: 6, display: "block" }}>File</label>
                  <div className="row" style={{ gap: 6 }}>
                    <div className="input-group" style={{ flex: 1 }}>
                      <input
                        className="ri-input"
                        style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}
                        value={selectedFile ? fileName(selectedFile) : ""}
                        readOnly
                        placeholder="No file selected"
                      />
                      <button
                        type="button"
                        className="btn"
                        onClick={handleChooseFile}
                        disabled={isBusy}
                      >
                        <IcFolder size={12} /> Browse…
                      </button>
                    </div>
                    {selectedFile && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        onClick={handleClearFile}
                        disabled={isBusy}
                        title="Clear file"
                      >
                        <IcX size={12} />
                      </button>
                    )}
                  </div>
                  {fileError && (
                    <div style={{ marginTop: 6 }}>
                      <Banner tone="err">{fileError}</Banner>
                    </div>
                  )}
                </div>

                <div className="hr" style={{ margin: 0 }} />

                <div>
                  <label className="eyebrow" style={{ marginBottom: 4, display: "block" }}>Or paste CSV content</label>
                  <p style={{ fontSize: 11, color: "var(--tx-3)", margin: "0 0 6px" }}>
                    Comma-separated. Use <span className="code">;</span> as separator inside tags column.
                  </p>
                  <textarea
                    className="ri-input"
                    style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 11.5, resize: "vertical" }}
                    rows={6}
                    value={csvContent}
                    placeholder={"code,device_type,status,name\nsrv-new,server,planned,New Server"}
                    onChange={(e) => {
                      setCsvContent(e.target.value);
                      setPreview(null); setImportSuccess(null); setImportError(null);
                    }}
                    disabled={isBusy}
                  />
                </div>

                <div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={downloadSampleCsv}
                    data-testid="btn-download-sample"
                  >
                    <IcDownload size={12} /> Download sample CSV
                  </button>
                  <p style={{ fontSize: 11, color: "var(--tx-3)", margin: "4px 0 0" }}>
                    Use this template as a starting point, then preview it before importing.
                  </p>
                </div>

                {previewError && <Banner tone="err">{previewError}</Banner>}

                <div className="row">
                  <button
                    type="submit"
                    className="btn"
                    disabled={!csvContent.trim() || isBusy}
                  >
                    <IcRefresh size={12} /> Preview
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleImport}
                    disabled={!preview || blocked || isBusy}
                  >
                    <IcDownload size={12} /> {`Import ${importableRows} row${importableRows !== 1 ? "s" : ""}`}
                  </button>
                </div>

                {blocked && <Banner tone="err">Import is blocked — fix all errors before importing.</Banner>}
                {importError && <Banner tone="err">{importError}</Banner>}
                {importSuccess && <Banner tone="ok">{importSuccess}</Banner>}
              </form>
            </Panel>

            {/* Preview panel */}
            {preview && (
              <Panel
                title="Preview"
                desc={`${totalRows} rows · ${cleanRows} clean · ${warningRows} with warnings · ${skippedRows} skipped`}
                flush
              >
                {preview.file_issues.length > 0 && (
                  <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--bd-1)" }}>
                    {preview.file_issues.map((iss, idx) => (
                      <Banner key={idx} tone={iss.level === "error" ? "err" : "warn"}>
                        {iss.message}{iss.details ? ` (${iss.details})` : ""}
                      </Banner>
                    ))}
                  </div>
                )}
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th style={{ width: 80 }}>Status</th>
                      <th className="tbl-mono">Code</th>
                      <th>Type</th>
                      <th>Name</th>
                      <th className="tbl-mono">Model</th>
                      <th className="tbl-mono">Serial</th>
                      <th>Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.row_number}>
                        <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>{row.row_number}</td>
                        <td>{rowBadge(row)}</td>
                        <td className="tbl-mono">
                          {row.code ?? <span style={{ color: "var(--st-err-tx)" }}>—</span>}
                        </td>
                        <td className="tbl-mono">{row.device_type ?? "—"}</td>
                        <td>{row.name ?? <span style={{ color: "var(--tx-4)" }}>—</span>}</td>
                        <td className="tbl-mono">{row.device_model_code ?? "—"}</td>
                        <td className="tbl-mono">{row.serial_number ?? "—"}</td>
                        <td style={{ fontSize: 11, color: row.issues.some((i) => i.level === "error") ? "var(--st-err-tx)" : "var(--st-warn-tx)" }}>
                          {issueText(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </div>

          {/* Sidebar */}
          <div className="stack-4">
            <Panel title="Schema">
              <div className="stack-3">
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Required columns</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {["code", "device_type", "status"].map((c) => <span key={c} className="tag">{c}</span>)}
                  </div>
                </div>
                <div>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Optional columns</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {["name", "device_model_code", "serial_number", "asset_tag", "external_ref", "tags"].map((c) => (
                      <span key={c} className="tag">{c}</span>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize: 11, color: "var(--tx-3)", margin: 0, lineHeight: 1.5 }}>
                  Tags use <span className="code">;</span> as separator.
                  Duplicate codes are skipped (update-existing is not supported).
                </p>
              </div>
            </Panel>

            {preview && (
              <Panel title="Outcome">
                <div className="stack-3">
                  <SummaryRow tone="ok"   label="Will create" value={importableRows} desc="Rows that will be imported" />
                  <SummaryRow tone="warn" label="Warnings"    value={warningRows}   desc="Importable rows with warnings — review after import" />
                  <SummaryRow tone="err"  label="Skipped"     value={skippedRows}   desc="Need fixes in source CSV" />
                </div>
              </Panel>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
