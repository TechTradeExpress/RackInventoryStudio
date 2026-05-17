import { useState } from "react";
import {
  openRepository,
  validateCurrentRepository,
  saveCurrentRepository,
  closeRepository,
  selectRepositoryFolder,
  OpenRepositoryResultDto,
  RepositorySummaryDto,
  ValidationSummaryDto,
  ValidationIssueDto,
  SaveSummaryDto,
} from "./api/tauriClient";

const EXAMPLE_HINT = "examples/example-repository";

function SummaryTable({ summary }: { summary: RepositorySummaryDto }) {
  const rows: [string, string | number][] = [
    ["Path", summary.repo_path],
    ["Code", summary.repository_code],
    ["Name", summary.repository_name],
    ["Locations", summary.locations_count],
    ["Racks", summary.racks_count],
    ["Device Models", summary.device_models_count],
    ["Devices", summary.devices_count],
    ["Placement Files", summary.placement_files_count],
    ["Placements", summary.placements_count],
    ["Unplaced Devices", summary.unplaced_devices_count],
  ];
  return (
    <table style={styles.table}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={styles.th}>{label}</td>
            <td style={styles.td}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ValidationSummaryPanel({ vs }: { vs: ValidationSummaryDto }) {
  return (
    <p style={{ margin: "0.4rem 0" }}>
      Errors:{" "}
      <strong style={{ color: vs.errors > 0 ? "#c00" : "inherit" }}>
        {vs.errors}
      </strong>{" "}
      | Warnings:{" "}
      <strong style={{ color: vs.warnings > 0 ? "#a60" : "inherit" }}>
        {vs.warnings}
      </strong>{" "}
      | Info: <strong>{vs.infos}</strong> | Total:{" "}
      <strong>{vs.total}</strong>
    </p>
  );
}

function IssueRow({ issue }: { issue: ValidationIssueDto }) {
  const bg =
    issue.level === "error"
      ? "#fff0f0"
      : issue.level === "warning"
        ? "#fffbe6"
        : "inherit";
  return (
    <tr style={{ background: bg }}>
      <td style={styles.td}>{issue.level}</td>
      <td style={styles.td}>{issue.code}</td>
      <td style={styles.td}>{issue.message}</td>
      <td style={styles.td}>{issue.object_code ?? issue.object_id ?? ""}</td>
    </tr>
  );
}

export function App() {
  const [repoPath, setRepoPath] = useState("");
  const [summary, setSummary] = useState<RepositorySummaryDto | null>(null);
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummaryDto | null>(null);
  const [issues, setIssues] = useState<ValidationIssueDto[]>([]);
  const [saveSummary, setSaveSummary] = useState<SaveSummaryDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function withWorking<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setWorking(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(String(e));
      return undefined;
    } finally {
      setWorking(false);
    }
  }

  async function handleOpen() {
    if (!repoPath.trim()) return;
    setSaveSummary(null);
    const result = await withWorking<OpenRepositoryResultDto>(() =>
      openRepository(repoPath.trim()),
    );
    if (result) {
      setSummary(result.summary);
      setValidationSummary(result.validation_summary);
      setIssues([]);
    }
  }

  async function handleValidate() {
    setSaveSummary(null);
    const result = await withWorking(() => validateCurrentRepository());
    if (result) {
      setIssues(result);
      setValidationSummary({
        errors: result.filter((i) => i.level === "error").length,
        warnings: result.filter((i) => i.level === "warning").length,
        infos: result.filter((i) => i.level === "info").length,
        total: result.length,
      });
    }
  }

  async function handleSave() {
    const result = await withWorking(() => saveCurrentRepository());
    if (result) {
      setSaveSummary(result);
    }
  }

  async function handleBrowse() {
    try {
      const path = await selectRepositoryFolder();
      if (path !== null) {
        setRepoPath(path);
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleClose() {
    await withWorking(() => closeRepository());
    setSummary(null);
    setValidationSummary(null);
    setIssues([]);
    setSaveSummary(null);
  }

  return (
    <main style={styles.main}>
      <h1 style={{ margin: "0 0 1rem" }}>Rack Inventory Studio</h1>

      <section style={styles.section}>
        <h2 style={styles.h2}>Open Repository</h2>
        <p style={styles.hint}>Example path: {EXAMPLE_HINT}</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            type="text"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleOpen()}
            placeholder="Repository path…"
            style={styles.input}
            disabled={working}
          />
          <button onClick={handleBrowse} disabled={working} style={styles.btn}>
            Browse…
          </button>
          <button
            onClick={handleOpen}
            disabled={working || !repoPath.trim()}
            style={styles.btn}
          >
            Open
          </button>
          {summary && (
            <button onClick={handleClose} disabled={working} style={styles.btn}>
              Close
            </button>
          )}
        </div>
      </section>

      {working && <p style={styles.working}>Working…</p>}

      {error && (
        <section style={styles.errorBox}>
          <strong>Error:</strong> {error}
        </section>
      )}

      {summary && (
        <section style={styles.section}>
          <h2 style={styles.h2}>Repository Summary</h2>
          <SummaryTable summary={summary} />
        </section>
      )}

      {summary && (
        <section style={styles.section}>
          <h2 style={styles.h2}>Validation</h2>
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <button onClick={handleValidate} disabled={working} style={styles.btn}>
              Validate
            </button>
            <button onClick={handleSave} disabled={working} style={styles.btn}>
              Save
            </button>
          </div>

          {validationSummary && (
            <ValidationSummaryPanel vs={validationSummary} />
          )}

          {saveSummary && (
            <p style={{ color: "#060", margin: "0.4rem 0" }}>
              Save complete — Created: {saveSummary.created}, Updated:{" "}
              {saveSummary.updated}, Unchanged: {saveSummary.unchanged}, Total:{" "}
              {saveSummary.total}
            </p>
          )}

          {issues.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <h3 style={{ margin: "0 0 0.4rem" }}>
                Issues (showing first 20 of {issues.length})
              </h3>
              <table style={{ ...styles.table, fontSize: "0.82rem" }}>
                <thead>
                  <tr>
                    {["Level", "Code", "Message", "Object"].map((h) => (
                      <th key={h} style={styles.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issues.slice(0, 20).map((issue, idx) => (
                    <IssueRow key={idx} issue={issue} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    fontFamily: "monospace",
    padding: "1.25rem",
    maxWidth: "960px",
    margin: "0 auto",
  },
  section: {
    marginTop: "1.25rem",
    paddingTop: "0.75rem",
    borderTop: "1px solid #ddd",
  },
  h2: { margin: "0 0 0.5rem" },
  hint: { margin: "0 0 0.4rem", color: "#666", fontSize: "0.82rem" },
  input: {
    flex: 1,
    padding: "0.4rem 0.5rem",
    fontFamily: "monospace",
    fontSize: "0.9rem",
    border: "1px solid #ccc",
    borderRadius: "3px",
  },
  btn: {
    padding: "0.4rem 0.8rem",
    fontFamily: "monospace",
    cursor: "pointer",
    border: "1px solid #999",
    borderRadius: "3px",
    background: "#f4f4f4",
  },
  working: { color: "#888", fontStyle: "italic", margin: "0.5rem 0" },
  errorBox: {
    marginTop: "0.75rem",
    padding: "0.5rem 0.75rem",
    background: "#fff0f0",
    border: "1px solid #f88",
    color: "#b00",
    borderRadius: "3px",
  },
  table: {
    borderCollapse: "collapse",
    width: "100%",
  },
  th: {
    padding: "0.2rem 0.5rem",
    textAlign: "left",
    fontWeight: "bold",
    borderBottom: "1px solid #eee",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "0.2rem 0.5rem",
    borderBottom: "1px solid #eee",
  },
};
