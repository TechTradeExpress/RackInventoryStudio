import { type CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import {
  addGitRemote,
  commitRepositoryChanges,
  getGitLog,
  getGitStatus,
  initGitRepository,
  listGitRemotes,
  pullGitFfOnly,
  pushGitCurrentBranch,
  saveCurrentRepository,
  validateCurrentRepository,
  type GitCommitDto,
  type GitRemoteDto,
  type GitStatusDto,
  type RepositorySummaryDto,
  type ValidationSummaryDto,
} from "../../api/tauriClient";
import { computeValidationSummary, isNothingToCommitError } from "./publishHelpers";

interface Props {
  repoPath: string;
  onRepoPathChange: (v: string) => void;
  onOpen: () => void;
  onBrowse: () => void;
  onClose: () => void;
  working: boolean;
  summary: RepositorySummaryDto | null;
  hasUnsavedChanges: boolean;
  onSaveSuccess: () => void;
  onPullSuccess: (summary: RepositorySummaryDto) => void;
  onPullRunning: (running: boolean) => void;
}

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
    <table style={common.table}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={common.th}>{label}</td>
            <td style={common.td}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildSyncLabel(ahead: number | null, behind: number | null): string {
  const parts: string[] = [];
  if (ahead !== null && ahead > 0) parts.push(`↑ ${ahead} ahead`);
  if (behind !== null && behind > 0) parts.push(`↓ ${behind} behind`);
  return parts.length > 0 ? parts.join(", ") : "Up to date";
}

type PublishValidation =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "done"; summary: ValidationSummaryDto };

interface GitSectionProps {
  repoPath: string;
  hasUnsavedChanges: boolean;
  onSaveSuccess: () => void;
  onPullSuccess: (summary: RepositorySummaryDto) => void;
  onPullRunning: (running: boolean) => void;
}

function GitSection({
  repoPath,
  hasUnsavedChanges,
  onSaveSuccess,
  onPullSuccess,
  onPullRunning,
}: GitSectionProps) {
  const [gitStatus, setGitStatus] = useState<GitStatusDto | null>(null);
  const [gitCommits, setGitCommits] = useState<GitCommitDto[]>([]);
  const [remotes, setRemotes] = useState<GitRemoteDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Publish flow state
  const [publishValidation, setPublishValidation] = useState<PublishValidation>({ kind: "idle" });
  const [validateError, setValidateError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);

  const [initing, setIniting] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const [selectedRemote, setSelectedRemote] = useState("");
  const [newRemoteName, setNewRemoteName] = useState("origin");
  const [newRemoteUrl, setNewRemoteUrl] = useState("");
  const [addingRemote, setAddingRemote] = useState(false);
  const [addRemoteError, setAddRemoteError] = useState<string | null>(null);
  const [addRemoteSuccess, setAddRemoteSuccess] = useState<string | null>(null);

  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushSuccess, setPushSuccess] = useState<string | null>(null);

  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [pullSuccess, setPullSuccess] = useState<string | null>(null);

  const prevRepoPathRef = useRef("");

  useEffect(() => {
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setGitStatus(null);
      setGitCommits([]);
      setRemotes([]);
      setCommitMessage("");
      setCommitError(null);
      setCommitSuccess(null);
      setInitError(null);
      setError(null);
      setSelectedRemote("");
      setNewRemoteName("origin");
      setNewRemoteUrl("");
      setAddRemoteError(null);
      setAddRemoteSuccess(null);
      setPushError(null);
      setPushSuccess(null);
      setPullError(null);
      setPullSuccess(null);
      setPublishValidation({ kind: "idle" });
      setValidateError(null);
      setSaveError(null);
      setSaveSuccess(null);
    }

    setLoading(true);
    Promise.all([
      getGitStatus(),
      getGitLog(5),
      listGitRemotes().catch(() => [] as GitRemoteDto[]),
    ])
      .then(([status, commits, remoteList]) => {
        setGitStatus(status);
        setGitCommits(commits);
        setRemotes(remoteList);
        setSelectedRemote((prev) => {
          if (remoteList.length === 0) return "";
          if (remoteList.find((r) => r.name === prev)) return prev;
          return remoteList[0].name;
        });
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, refreshKey]);

  // Reset publish validation whenever unsaved in-memory changes appear —
  // the repository state has changed and previous validation is stale.
  useEffect(() => {
    if (hasUnsavedChanges) {
      setPublishValidation({ kind: "idle" });
      setSaveSuccess(null);
      setSaveError(null);
    }
  }, [hasUnsavedChanges]);

  async function handleInit() {
    setIniting(true);
    setInitError(null);
    try {
      await initGitRepository();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setInitError(String(e));
    } finally {
      setIniting(false);
    }
  }

  async function handleSaveFromGit() {
    setSaveError(null);
    setSaveSuccess(null);
    setSaving(true);
    try {
      const result = await saveCurrentRepository();
      setSaveSuccess(
        `Saved — Created: ${result.created}, Updated: ${result.updated}, Unchanged: ${result.unchanged}.`,
      );
      onSaveSuccess();
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleValidateForPublish() {
    setValidateError(null);
    setPublishValidation({ kind: "validating" });
    try {
      const issues = await validateCurrentRepository();
      setPublishValidation({ kind: "done", summary: computeValidationSummary(issues) });
    } catch (e) {
      setValidateError(String(e));
      setPublishValidation({ kind: "idle" });
    }
  }

  async function handleCommit(e: FormEvent) {
    e.preventDefault();
    setCommitError(null);
    setCommitSuccess(null);
    const msg = commitMessage.trim();
    if (!msg) {
      setCommitError("Commit message cannot be empty.");
      return;
    }
    setCommitting(true);
    try {
      const commit = await commitRepositoryChanges(msg);
      setCommitSuccess(`Committed: ${commit.short_hash} — ${commit.subject}`);
      setCommitMessage("");
      // After commit, repository state changed — reset publish validation.
      setPublishValidation({ kind: "idle" });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      const errStr = String(e);
      if (isNothingToCommitError(errStr)) {
        setCommitError("Nothing to commit — the working tree is already clean.");
      } else {
        setCommitError(errStr);
      }
    } finally {
      setCommitting(false);
    }
  }

  async function handleAddRemote(e: FormEvent) {
    e.preventDefault();
    setAddRemoteError(null);
    setAddRemoteSuccess(null);
    const name = newRemoteName.trim();
    const url = newRemoteUrl.trim();
    if (!name) {
      setAddRemoteError("Remote name cannot be empty.");
      return;
    }
    if (!url) {
      setAddRemoteError("Remote URL cannot be empty.");
      return;
    }
    setAddingRemote(true);
    try {
      await addGitRemote(name, url);
      setAddRemoteSuccess(`Remote "${name}" added.`);
      setNewRemoteName("origin");
      setNewRemoteUrl("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setAddRemoteError(String(e));
    } finally {
      setAddingRemote(false);
    }
  }

  async function handlePush() {
    setPushError(null);
    setPushSuccess(null);
    setPushing(true);
    try {
      await pushGitCurrentBranch(selectedRemote);
      setPushSuccess(`Pushed to "${selectedRemote}".`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setPushError(String(e));
    } finally {
      setPushing(false);
    }
  }

  async function handlePull() {
    setPullError(null);
    setPullSuccess(null);
    setPulling(true);
    onPullRunning(true);
    try {
      const updatedSummary = await pullGitFfOnly(selectedRemote);
      setPullSuccess(`Pulled from "${selectedRemote}".`);
      onPullSuccess(updatedSummary);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setPullError(String(e));
    } finally {
      setPulling(false);
      onPullRunning(false);
    }
  }

  if (loading) {
    return (
      <section style={common.section}>
        <h2 style={common.h2}>Git</h2>
        <p style={common.working}>Loading Git status…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section style={common.section}>
        <h2 style={common.h2}>Git</h2>
        <div style={common.errorBox}>{error}</div>
        <button
          style={{ ...common.btn, marginTop: "0.5rem" }}
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Retry
        </button>
      </section>
    );
  }

  if (!gitStatus) return null;

  if (!gitStatus.is_repository) {
    return (
      <section style={common.section}>
        <h2 style={common.h2}>Git</h2>
        <p style={common.hint}>
          This repository directory is not tracked by Git.
        </p>
        {initError && <div style={common.errorBox}>{initError}</div>}
        <button style={common.btn} onClick={handleInit} disabled={initing}>
          {initing ? "Initializing…" : "Initialize Git repository"}
        </button>
      </section>
    );
  }

  const statusLabel = gitStatus.is_clean
    ? "Clean"
    : `Dirty — ${gitStatus.staged_count} staged, ${gitStatus.unstaged_count} unstaged, ${gitStatus.untracked_count} untracked`;

  // Determine publish readiness
  const nothingToCommit = gitStatus.is_clean;
  const validationPassed =
    publishValidation.kind === "done" && publishValidation.summary.errors === 0;
  const validationBlocked =
    publishValidation.kind === "idle" ||
    publishValidation.kind === "validating" ||
    (publishValidation.kind === "done" && publishValidation.summary.errors > 0);

  const commitDisabled =
    committing ||
    hasUnsavedChanges ||
    !commitMessage.trim() ||
    nothingToCommit ||
    validationBlocked;

  const syncDisabled = pushing || pulling || hasUnsavedChanges || !selectedRemote;

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Git</h2>

      <table style={{ ...common.table, marginBottom: "0.75rem" }}>
        <tbody>
          <tr>
            <td style={common.th}>Branch</td>
            <td style={common.td}>{gitStatus.branch ?? "—"}</td>
          </tr>
          {gitStatus.upstream && (
            <tr>
              <td style={common.th}>Upstream</td>
              <td style={common.td}>{gitStatus.upstream}</td>
            </tr>
          )}
          {gitStatus.upstream && (
            <tr>
              <td style={common.th}>Sync</td>
              <td style={common.td}>
                {buildSyncLabel(gitStatus.ahead, gitStatus.behind)}
              </td>
            </tr>
          )}
          <tr>
            <td style={common.th}>Status</td>
            <td style={{ ...common.td, color: gitStatus.is_clean ? "#2d6a2d" : "#7a3800" }}>
              {statusLabel}
            </td>
          </tr>
          {gitStatus.message && (
            <tr>
              <td style={common.th}>Note</td>
              <td style={common.td}>{gitStatus.message}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div style={{ marginBottom: "0.75rem" }}>
        <button
          style={common.btn}
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          Refresh Git status
        </button>
      </div>

      {gitCommits.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <h3 style={common.h3}>Recent commits</h3>
          <table style={common.table}>
            <thead>
              <tr>
                {["Hash", "Subject", "Author", "Date"].map((h) => (
                  <th key={h} style={common.th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gitCommits.map((c) => (
                <tr key={c.hash}>
                  <td style={{ ...common.td, fontFamily: "monospace" }}>
                    {c.short_hash}
                  </td>
                  <td style={common.td}>{c.subject}</td>
                  <td style={common.td}>{c.author ?? ""}</td>
                  <td style={{ ...common.td, whiteSpace: "nowrap" }}>
                    {c.date ? c.date.slice(0, 10) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {gitCommits.length === 0 && (
        <p style={common.hint}>No commits yet.</p>
      )}

      {/* ── Publish changes ──────────────────────────────────── */}
      <div style={styles.subSection}>
        <h3 style={common.h3}>Publish changes</h3>
        <p style={styles.flowHint}>
          Safe publish flow: save → validate → commit → push.
          Publishing is blocked when there are unsaved changes or validation errors.
        </p>

        {/* Step 1 — Save */}
        <div style={styles.step}>
          <span style={styles.stepLabel}>1. Save</span>
          {hasUnsavedChanges ? (
            <>
              <div style={styles.warningBox}>
                Unsaved in-memory changes — save to disk before committing.
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                <button style={common.btn} onClick={handleSaveFromGit} disabled={saving}>
                  {saving ? "Saving…" : "Save repository"}
                </button>
              </div>
              {saveError && <div style={common.errorBox}>{saveError}</div>}
            </>
          ) : (
            <>
              <div style={styles.okBox}>Changes are saved to disk.</div>
              {saveSuccess && <div style={{ ...styles.successBox, marginTop: "0.25rem" }}>{saveSuccess}</div>}
            </>
          )}
        </div>

        {/* Step 2 — Validate */}
        <div style={styles.step}>
          <span style={styles.stepLabel}>2. Validate</span>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
            <button
              style={common.btn}
              onClick={handleValidateForPublish}
              disabled={hasUnsavedChanges || publishValidation.kind === "validating"}
            >
              {publishValidation.kind === "validating" ? "Validating…" : "Validate"}
            </button>
          </div>
          {validateError && <div style={common.errorBox}>{validateError}</div>}
          {publishValidation.kind === "idle" && !hasUnsavedChanges && (
            <p style={styles.idleHint}>
              Run validation before committing to ensure no errors are published.
            </p>
          )}
          {publishValidation.kind === "done" && publishValidation.summary.errors > 0 && (
            <div style={styles.blockedBox}>
              Publish blocked — {publishValidation.summary.errors} error(s).
              Fix validation errors and re-validate before committing.
              {publishValidation.summary.warnings > 0 && (
                <span> ({publishValidation.summary.warnings} warning(s) do not block publish.)</span>
              )}
            </div>
          )}
          {publishValidation.kind === "done" && publishValidation.summary.errors === 0 && (
            <div style={styles.okBox}>
              Validation passed — {publishValidation.summary.warnings} warning(s),{" "}
              {publishValidation.summary.infos} info(s). Ready to commit.
            </div>
          )}
        </div>

        {/* Step 3 — Commit */}
        <div style={styles.step}>
          <span style={styles.stepLabel}>3. Commit</span>
          {nothingToCommit && (
            <p style={styles.idleHint}>
              Working tree is clean — nothing to commit. Save new changes first.
            </p>
          )}
          {!nothingToCommit && (
            <form onSubmit={handleCommit} style={{ ...styles.commitForm, marginTop: "0.4rem" }}>
              <input
                style={common.input}
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message…"
                disabled={committing || hasUnsavedChanges || !validationPassed}
              />
              <button
                type="submit"
                style={common.btn}
                disabled={commitDisabled}
                title={
                  hasUnsavedChanges
                    ? "Save changes first"
                    : !validationPassed
                      ? "Validate without errors first"
                      : !commitMessage.trim()
                        ? "Enter a commit message"
                        : undefined
                }
              >
                {committing ? "Committing…" : "Commit"}
              </button>
            </form>
          )}
          {commitError && <div style={common.errorBox}>{commitError}</div>}
          {commitSuccess && <div style={styles.successBox}>{commitSuccess}</div>}
        </div>
      </div>

      {/* ── Remote sync ──────────────────────────────────────── */}
      <div style={styles.subSection}>
        <h3 style={common.h3}>Remote sync</h3>

        {remotes.length > 0 ? (
          <table style={{ ...common.table, marginBottom: "0.75rem" }}>
            <thead>
              <tr>
                <th style={common.th}>Name</th>
                <th style={common.th}>URL</th>
              </tr>
            </thead>
            <tbody>
              {remotes.map((r) => (
                <tr key={r.name}>
                  <td style={{ ...common.td, fontFamily: "monospace" }}>{r.name}</td>
                  <td style={{ ...common.td, fontFamily: "monospace", wordBreak: "break-all" }}>
                    {r.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={common.hint}>No remotes configured.</p>
        )}

        <div style={{ marginBottom: "0.75rem" }}>
          <h4 style={styles.h4}>Add remote</h4>
          <form onSubmit={handleAddRemote} style={styles.addRemoteForm}>
            <input
              style={{ ...common.input, flex: "none", width: "8rem" }}
              value={newRemoteName}
              onChange={(e) => setNewRemoteName(e.target.value)}
              placeholder="Name"
              disabled={addingRemote}
            />
            <input
              style={common.input}
              value={newRemoteUrl}
              onChange={(e) => setNewRemoteUrl(e.target.value)}
              placeholder="URL (e.g. git@github.com:org/repo.git)"
              disabled={addingRemote}
            />
            <button type="submit" style={common.btn} disabled={addingRemote}>
              {addingRemote ? "Adding…" : "Add remote"}
            </button>
          </form>
          {addRemoteError && <div style={common.errorBox}>{addRemoteError}</div>}
          {addRemoteSuccess && <div style={styles.successBox}>{addRemoteSuccess}</div>}
        </div>

        <div>
          <h4 style={styles.h4}>Push / Pull</h4>
          {hasUnsavedChanges && (
            <div style={styles.warningBox}>
              Save and commit local changes before syncing.
            </div>
          )}
          {remotes.length === 0 ? (
            <p style={common.hint}>Add a remote above to enable push and pull.</p>
          ) : (
            <>
              <div style={styles.remoteSelectRow}>
                <span style={styles.remoteSelectLabel}>Remote:</span>
                <select
                  value={selectedRemote}
                  onChange={(e) => setSelectedRemote(e.target.value)}
                  disabled={pushing || pulling || hasUnsavedChanges}
                  style={{ ...common.input, flex: "none" }}
                >
                  {remotes.map((r) => (
                    <option key={r.name} value={r.name}>{r.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  style={common.btn}
                  onClick={handlePush}
                  disabled={syncDisabled}
                >
                  {pushing ? "Pushing…" : "Push current branch"}
                </button>
                <button
                  style={common.btn}
                  onClick={handlePull}
                  disabled={syncDisabled}
                >
                  {pulling ? "Pulling…" : "Pull --ff-only"}
                </button>
              </div>
              {pushError && <div style={{ ...common.errorBox, marginTop: "0.4rem" }}>{pushError}</div>}
              {pushSuccess && <div style={{ ...styles.successBox, marginTop: "0.4rem" }}>{pushSuccess}</div>}
              {pullError && <div style={{ ...common.errorBox, marginTop: "0.4rem" }}>{pullError}</div>}
              {pullSuccess && <div style={{ ...styles.successBox, marginTop: "0.4rem" }}>{pullSuccess}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function RepositoryPanel({
  repoPath,
  onRepoPathChange,
  onOpen,
  onBrowse,
  onClose,
  working,
  summary,
  hasUnsavedChanges,
  onSaveSuccess,
  onPullSuccess,
  onPullRunning,
}: Props) {
  return (
    <>
      <section style={common.section}>
        <h2 style={common.h2}>Open Repository</h2>
        <p style={common.hint}>Example path: {EXAMPLE_HINT}</p>
        <div style={common.row}>
          <input
            type="text"
            value={repoPath}
            onChange={(e) => onRepoPathChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onOpen()}
            placeholder="Repository path…"
            style={common.input}
            disabled={working}
          />
          <button onClick={onBrowse} disabled={working} style={common.btn}>
            Browse…
          </button>
          <button
            onClick={onOpen}
            disabled={working || !repoPath.trim()}
            style={common.btn}
          >
            Open
          </button>
          {summary && (
            <button onClick={onClose} disabled={working} style={common.btn}>
              Close
            </button>
          )}
        </div>
      </section>

      {summary && (
        <section style={common.section}>
          <h2 style={common.h2}>Repository Summary</h2>
          <SummaryTable summary={summary} />
        </section>
      )}

      {summary && (
        <GitSection
          repoPath={summary.repo_path}
          hasUnsavedChanges={hasUnsavedChanges}
          onSaveSuccess={onSaveSuccess}
          onPullSuccess={onPullSuccess}
          onPullRunning={onPullRunning}
        />
      )}
    </>
  );
}

const styles = {
  subSection: {
    marginTop: "0.75rem",
    paddingTop: "0.5rem",
    borderTop: "1px solid #eee",
  },
  step: {
    marginTop: "0.6rem",
  },
  stepLabel: {
    display: "block",
    fontWeight: 600,
    fontSize: "0.85rem",
    color: "#333",
    marginBottom: "0.2rem",
  } as CSSProperties,
  flowHint: {
    margin: "0.2rem 0 0.4rem",
    fontSize: "0.8rem",
    color: "#666",
  } as CSSProperties,
  idleHint: {
    margin: "0.25rem 0 0",
    fontSize: "0.82rem",
    color: "#888",
  } as CSSProperties,
  commitForm: {
    display: "flex",
    gap: "0.5rem",
  },
  addRemoteForm: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.4rem",
    flexWrap: "wrap" as const,
  },
  h4: {
    fontSize: "0.9rem",
    fontWeight: 600,
    margin: "0 0 0.35rem",
    color: "#444",
  } as CSSProperties,
  remoteSelectRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    marginBottom: "0.5rem",
  },
  remoteSelectLabel: {
    fontSize: "0.85rem",
    whiteSpace: "nowrap" as const,
  },
  warningBox: {
    marginBottom: "0.4rem",
    padding: "0.35rem 0.75rem",
    background: "#fff8e1",
    border: "1px solid #f5c800",
    borderRadius: 3,
    fontSize: "0.82rem",
    color: "#7a5800",
  },
  blockedBox: {
    marginTop: "0.4rem",
    padding: "0.35rem 0.75rem",
    background: "#fff0f0",
    border: "1px solid #e57373",
    borderRadius: 3,
    fontSize: "0.82rem",
    color: "#b00020",
  },
  okBox: {
    marginTop: "0.25rem",
    padding: "0.35rem 0.75rem",
    background: "#f0fff4",
    border: "1px solid #81c784",
    borderRadius: 3,
    fontSize: "0.82rem",
    color: "#2d6a2d",
  },
  successBox: {
    marginTop: "0.4rem",
    padding: "0.4rem 0.75rem",
    background: "#f0fff4",
    border: "1px solid #5cb85c",
    color: "#2d6a2d",
    borderRadius: "3px",
    fontSize: "0.85rem",
  },
};
