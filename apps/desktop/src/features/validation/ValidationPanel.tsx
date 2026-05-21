import { useState } from "react";
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
import { PageHeader } from "../../components/ui/PageHeader";
import { Panel } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { Banner } from "../../components/ui/Banner";
import { EmptyState } from "../../components/ui/EmptyState";
import { IcRefresh, IcSave, IcCheckCircle, IcCornerArrow } from "../../components/ui/Icon";

interface Props {
  working: boolean;
  setWorking: (v: boolean) => void;
  setError: (v: string | null) => void;
  onSaveSuccess: () => void;
  onNavigate?: (target: ValidationNavigationTarget) => void;
}

type LevelFilter = "all" | "error" | "warning" | "info";

function valLevelBadge(level: string) {
  if (level === "error")   return <Badge tone="err">error</Badge>;
  if (level === "warning") return <Badge tone="warn">warning</Badge>;
  return <Badge tone="info">info</Badge>;
}

function SummaryRow({ tone, label, value, desc }: { tone: "err" | "warn" | "info"; label: string; value: number; desc: string }) {
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

export function ValidationPanel({
  working,
  setWorking,
  setError,
  onSaveSuccess,
  onNavigate,
}: Props) {
  const [validationSummary, setValidationSummary] = useState<ValidationSummaryDto | null>(null);
  const [issues, setIssues] = useState<ValidationIssueDto[]>([]);
  const [saveSummary, setSaveSummary] = useState<SaveSummaryDto | null>(null);
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");

  async function handleValidate() {
    setWorking(true);
    setError(null);
    setSaveSummary(null);
    try {
      const result = await validateCurrentRepository();
      setIssues(result);
      setValidationSummary({
        errors:   result.filter((i) => i.level === "error").length,
        warnings: result.filter((i) => i.level === "warning").length,
        infos:    result.filter((i) => i.level === "info").length,
        total:    result.length,
      });
      setLevelFilter("all");
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

  const filtered = levelFilter === "all" ? issues : issues.filter((i) => i.level === levelFilter);
  const errCount  = validationSummary?.errors ?? 0;
  const warnCount = validationSummary?.warnings ?? 0;
  const infoCount = validationSummary?.infos ?? 0;

  const filterPills: { k: LevelFilter; label: string; count: number }[] = [
    { k: "all",     label: "All",      count: issues.length },
    { k: "error",   label: "Errors",   count: errCount },
    { k: "warning", label: "Warnings", count: warnCount },
    { k: "info",    label: "Info",     count: infoCount },
  ];

  return (
    <>
      <PageHeader
        title="Validation"
        subtitle="VAL-* checks run against the in-memory inventory."
        actions={
          <>
            <button className="btn" onClick={handleValidate} disabled={working}>
              <IcRefresh size={12} /> Validate
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={working}>
              <IcSave size={12} /> Save inventory
            </button>
          </>
        }
      />
      <div className="page-content">
        {saveSummary && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="ok">
              Save complete — Created: {saveSummary.created}, Updated: {saveSummary.updated},
              Unchanged: {saveSummary.unchanged}, Total: {saveSummary.total}
            </Banner>
          </div>
        )}

        <div className="cols-sidebar">
          {/* Main: issues table */}
          <div className="stack-4">
            <Panel
              title="Issues"
              desc={validationSummary ? `${filtered.length} of ${issues.length} shown` : "Run validation to see results."}
              flush
              actions={
                validationSummary ? (
                  <div className="row" style={{ gap: 2 }}>
                    {filterPills.map((f) => (
                      <button
                        key={f.k}
                        className={`btn btn-sm${levelFilter === f.k ? " btn-primary" : ""}`}
                        onClick={() => setLevelFilter(f.k)}
                      >
                        {f.label} <span style={{ marginLeft: 4, opacity: 0.7 }}>{f.count}</span>
                      </button>
                    ))}
                  </div>
                ) : undefined
              }
            >
              {!validationSummary ? (
                <EmptyState
                  icon={<IcCheckCircle size={28} />}
                  title="No results yet"
                  body="Click Validate to validate the current inventory."
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<IcCheckCircle size={28} />}
                  title="Nothing to report"
                  body="No issues match this filter."
                />
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Level</th>
                      <th style={{ width: 140 }}>Code</th>
                      <th>Message</th>
                      <th style={{ width: 180 }}>Object</th>
                      <th style={{ width: 120 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, 50).map((issue, idx) => {
                      const navTarget = issueToNavigationTarget(issue);
                      return (
                        <tr key={idx}>
                          <td>{valLevelBadge(issue.level)}</td>
                          <td className="tbl-mono"><strong>{issue.code}</strong></td>
                          <td>{issue.message}</td>
                          <td className="tbl-mono">{issue.object_code ?? issue.object_id ?? "—"}</td>
                          <td className="tbl-actions">
                            {navTarget && onNavigate ? (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() => onNavigate(navTarget)}
                              >
                                <IcCornerArrow size={11} /> {navigationTargetLabel(navTarget)}
                              </button>
                            ) : (
                              <span style={{ color: "var(--tx-4)", fontSize: 11 }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {issues.length > 50 && (
                    <tfoot>
                      <tr>
                        <td colSpan={5}>Showing first 50 of {issues.length} issues</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}
            </Panel>
          </div>

          {/* Sidebar: summary + notes */}
          <div className="stack-4">
            {validationSummary ? (
              <Panel title="Summary">
                <div className="stack-3">
                  <SummaryRow tone="err"  label="Errors"   value={errCount}  desc="Block commit" />
                  <SummaryRow tone="warn" label="Warnings" value={warnCount} desc="Should be reviewed" />
                  <SummaryRow tone="info" label="Info"     value={infoCount} desc="Optional informational notes" />
                </div>
              </Panel>
            ) : (
              <Panel title="Summary">
                <p style={{ fontSize: 12, color: "var(--tx-3)", margin: 0 }}>
                  Run validation to see a summary.
                </p>
              </Panel>
            )}
            <Panel title="Common fixes">
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--tx-2)", lineHeight: 1.7 }}>
                <li><span className="code">VAL-DEV-013</span> — place the device, or set status to <span className="code">in_stock</span>.</li>
                <li><span className="code">VAL-DEV-014</span> — installed devices must be placed somewhere.</li>
                <li><span className="code">VAL-PLC-015</span> — verify height override is intentional.</li>
                <li><span className="code">VAL-RACK-007</span> — empty placement files can be deleted.</li>
              </ul>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}
