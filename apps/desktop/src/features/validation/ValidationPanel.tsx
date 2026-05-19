import { useState } from "react";
import { common } from "../../lib/styles";
import {
  validateCurrentRepository,
  saveCurrentRepository,
  type ValidationIssueDto,
  type SaveSummaryDto,
  type ValidationSummaryDto,
} from "../../api/tauriClient";
import {
  issueToNavigationTarget,
  navigationTargetLabel,
  type ValidationNavigationTarget,
} from "./navigation";

interface Props {
  working: boolean;
  setWorking: (v: boolean) => void;
  setError: (v: string | null) => void;
  onSaveSuccess: () => void;
  onNavigate?: (target: ValidationNavigationTarget) => void;
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

function IssueRow({
  issue,
  onNavigate,
}: {
  issue: ValidationIssueDto;
  onNavigate?: (target: ValidationNavigationTarget) => void;
}) {
  const bg =
    issue.level === "error"
      ? "#fff0f0"
      : issue.level === "warning"
        ? "#fffbe6"
        : "inherit";
  const navTarget = issueToNavigationTarget(issue);

  return (
    <tr style={{ background: bg }}>
      <td style={common.td}>{issue.level}</td>
      <td style={common.td}>{issue.code}</td>
      <td style={common.td}>{issue.message}</td>
      <td style={common.td}>{issue.object_code ?? issue.object_id ?? ""}</td>
      <td style={common.td}>
        {navTarget && onNavigate ? (
          <button
            type="button"
            onClick={() => onNavigate(navTarget)}
            style={navBtnStyle}
            title={`Navigate to ${navTarget.tab}`}
          >
            {navigationTargetLabel(navTarget)}
          </button>
        ) : (
          <span style={{ color: "#aaa", fontSize: "0.75rem" }}>—</span>
        )}
      </td>
    </tr>
  );
}

export function ValidationPanel({
  working,
  setWorking,
  setError,
  onSaveSuccess,
  onNavigate,
}: Props) {
  const [validationSummary, setValidationSummary] =
    useState<ValidationSummaryDto | null>(null);
  const [issues, setIssues] = useState<ValidationIssueDto[]>([]);
  const [saveSummary, setSaveSummary] = useState<SaveSummaryDto | null>(null);

  async function handleValidate() {
    setWorking(true);
    setError(null);
    setSaveSummary(null);
    try {
      const result = await validateCurrentRepository();
      setIssues(result);
      setValidationSummary({
        errors: result.filter((i) => i.level === "error").length,
        warnings: result.filter((i) => i.level === "warning").length,
        infos: result.filter((i) => i.level === "info").length,
        total: result.length,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  async function handleSave() {
    setWorking(true);
    setError(null);
    try {
      const result = await saveCurrentRepository();
      setSaveSummary(result);
      onSaveSuccess();
    } catch (e) {
      setError(String(e));
    } finally {
      setWorking(false);
    }
  }

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Validation &amp; Save</h2>
      <div style={{ ...common.row, marginBottom: "0.5rem" }}>
        <button onClick={handleValidate} disabled={working} style={common.btn}>
          Validate
        </button>
        <button onClick={handleSave} disabled={working} style={common.btn}>
          Save
        </button>
      </div>

      {validationSummary && <ValidationSummaryPanel vs={validationSummary} />}

      {saveSummary && (
        <p style={{ color: "#060", margin: "0.4rem 0" }}>
          Save complete — Created: {saveSummary.created}, Updated:{" "}
          {saveSummary.updated}, Unchanged: {saveSummary.unchanged}, Total:{" "}
          {saveSummary.total}
        </p>
      )}

      {issues.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <h3 style={common.h3}>
            Issues (showing first 50 of {issues.length})
          </h3>
          <table style={{ ...common.table, fontSize: "0.82rem" }}>
            <thead>
              <tr>
                {["Level", "Code", "Message", "Object", "Navigate"].map(
                  (h) => (
                    <th key={h} style={common.th}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {issues.slice(0, 50).map((issue, idx) => (
                <IssueRow
                  key={idx}
                  issue={issue}
                  onNavigate={onNavigate}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const navBtnStyle: React.CSSProperties = {
  padding: "0.15rem 0.4rem",
  fontSize: "0.75rem",
  cursor: "pointer",
  background: "#e8f0fe",
  border: "1px solid #b3c8f5",
  borderRadius: 3,
  color: "#1a4da0",
  whiteSpace: "nowrap",
};
