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
  type OpenRepositoryResultDto,
  type RepositorySummaryDto,
  type ValidationSummaryDto,
} from "../../api/tauriClient";
import { computeValidationSummary, isNothingToCommitError } from "./publishHelpers";
import {
  deriveGitActionHints,
  deriveGitStatusLabel,
  derivePublishChecklist,
  type GitSeverity,
  type PublishChecklistStep,
} from "./gitStatusHelpers";
import { CreateRepositoryWizard } from "./CreateRepositoryWizard";

interface Props {
  repoPath: string;
  onRepoPathChange: (v: string) => void;
  onOpen: () => void;
  onBrowse: () => void;
  onClose: () => void;
  working: boolean;
  summary: RepositorySummaryDto | null;
  validationSummary?: ValidationSummaryDto | null;
  recentRepos?: string[];
  onRemoveRecentRepo?: (path: string) => void;
  hasUnsavedChanges: boolean;
  onSaveSuccess: () => void;
  onPullSuccess: (summary: RepositorySummaryDto) => void;
  onPullRunning: (running: boolean) => void;
  onCreateSuccess: (result: OpenRepositoryResultDto) => void;
}

const EXAMPLE_HINT = "examples/example-repository";

function SummaryTable({
  summary,
  validationSummary,
}: {
  summary: RepositorySummaryDto;
  validationSummary?: ValidationSummaryDto | null;
}) {
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
    <>
      <table style={common.table}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={common.th}>{label}</td>
              <td
                style={{
                  ...common.td,
                  ...(label === "Unplaced Devices" && (value as number) > 0
                    ? { color: "#7a5800" }
                    : {}),
                }}
              >
                {value}
              </td>
            </tr>
          ))}
          {validationSummary && (
            <>
              <tr>
                <td style={common.th}>Validation Errors</td>
                <td
                  style={{
                    ...common.td,
                    ...(validationSummary.errors > 0
                      ? { color: "#b00020", fontWeight: "bold" }
                      : { color: "#2d6a2d" }),
                  }}
                >
                  {validationSummary.errors}
                </td>
              </tr>
              <tr>
                <td style={common.th}>Validation Warnings</td>
                <td
                  style={{
                    ...common.td,
                    ...(validationSummary.warnings > 0
                      ? { color: "#7a5800" }
                      : {}),
                  }}
                >
                  {validationSummary.warnings}
                </td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      {validationSummary && (
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: "#888" }}>
          Validation counts are from the time of last open. Use the Validation tab for current state.
        </p>
      )}
    </>
  );
}

const SEVERITY_COLOR: Record<GitSeverity, string> = {
  ok: "#2d6a2d",
  warn: "#7a5800",
  error: "#b00020",
  info: "#555",
};

function ChecklistRow({ steps }: { steps: PublishChecklistStep[] }) {
  if (steps.length === 0) return null;
  return (
    <div style={styles.checklist}>
      {steps.map((s) => (
        <span
          key={s.step}
          style={{
            ...styles.checklistItem,
            color:
              s.done === true
                ? "#2d6a2d"
                : s.done === null
                  ? "#888"
                  : "#7a3800",
          }}
          title={s.note}
        >
          <span style={styles.checklistIcon}>
            {s.done === true ? "✓" : s.done === null ? "·" : "○"}
          </span>
          {s.label}
          {s.note && (
            <span style={styles.checklistNote}> — {s.note}</span>
          )}
        </span>
      ))}
    </div>
  );
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
      setRefreshKey((k) => k + 1);
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
        <p style={{ ...common.hint, color: SEVERITY_COLOR.info }}>
          No Git repository detected — this directory is not tracked by Git.
        </p>
        {initError && <div style={common.errorBox}>{initError}</div>}
        <button style={common.btn} onClick={handleInit} disabled={initing}>
          {initing ? "Initializing…" : "Initialize Git repository"}
        </button>
      </section>
    );
  }

  const { label: statusLabel, severity: statusSeverity } =
    deriveGitStatusLabel(gitStatus);
  const actionHints = deriveGitActionHints(gitStatus, hasUnsavedChanges);

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

  // Build publish checklist and inject current validation state into step 2
  const rawChecklist = derivePublishChecklist(gitStatus, hasUnsavedChanges);
  const checklist: typeof rawChecklist = rawChecklist.map((step) => {
    if (step.step !== 2) return step;
    if (publishValidation.kind === "done") {
      return {
        ...step,
        done: publishValidation.summary.errors === 0,
        note:
          publishValidation.summary.errors > 0
            ? `${publishValidation.summary.errors} error(s) — fix and re-validate.`
            : undefined,
      };
    }
    return step;
  });

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Git</h2>

      <table style={{ ...common.table, marginBottom: "0.5rem" }}>
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
          <tr>
            <td style={common.th}>Status</td>
            <td
              style={{
                ...common.td,
                color: SEVERITY_COLOR[statusSeverity],
                fontWeight: statusSeverity === "error" ? "bold" : undefined,
              }}
            >
              {statusLabel}
              {!gitStatus.is_clean && (
                <span style={{ marginLeft: "0.5rem", color: "#888", fontWeight: "normal" }}>
                  ({gitStatus.staged_count} staged, {gitStatus.unstaged_count} unstaged,{" "}
                  {gitStatus.untracked_count} untracked)
                </span>
              )}
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

      {actionHints.length > 0 && (
        <ul style={styles.hintList}>
          {actionHints.map((hint, i) => (
            <li key={i} style={styles.hintItem}>
              {hint}
            </li>
          ))}
        </ul>
      )}

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
        <ChecklistRow steps={checklist} />
        <p style={styles.flowHint}>
          Safe publish path: save changes to disk → validate → commit →
          pull if behind → push. Commit requires no unsaved changes and
          validation without errors.
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
                placeholder="e.g. Add rack-b01 to Warsaw server room"
                disabled={committing || hasUnsavedChanges || !validationPassed}
              />
              <button
                type="submit"
                style={common.btn}
                disabled={commitDisabled}
                title={
                  hasUnsavedChanges
                    ? "Save inventory changes to disk first"
                    : !validationPassed
                      ? "Run validation without errors before committing"
                      : !commitMessage.trim()
                        ? "Enter a commit message"
                        : nothingToCommit
                          ? "Nothing to commit — working tree is clean"
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
              Save and commit all changes before syncing with remote.
            </div>
          )}
          {remotes.length === 0 ? (
            <p style={common.hint}>Add a remote above to enable push and pull.</p>
          ) : (
            <>
              {!hasUnsavedChanges &&
                gitStatus.behind !== null &&
                gitStatus.behind > 0 &&
                gitStatus.ahead !== null &&
                gitStatus.ahead > 0 && (
                  <div style={styles.blockedBox}>
                    Branch has diverged from remote — manual git intervention
                    required before push or pull.
                  </div>
                )}
              {!hasUnsavedChanges &&
                gitStatus.behind !== null &&
                gitStatus.behind > 0 &&
                !(gitStatus.ahead !== null && gitStatus.ahead > 0) && (
                  <div style={styles.warningBox}>
                    Branch is {gitStatus.behind} commit
                    {gitStatus.behind !== 1 ? "s" : ""} behind remote — pull
                    before pushing.
                  </div>
                )}
              {!hasUnsavedChanges &&
                gitStatus.ahead !== null &&
                gitStatus.ahead > 0 &&
                !(gitStatus.behind !== null && gitStatus.behind > 0) && (
                  <div style={styles.okBox}>
                    Branch is {gitStatus.ahead} commit
                    {gitStatus.ahead !== 1 ? "s" : ""} ahead of remote — push
                    when ready.
                  </div>
                )}
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
                  title={syncDisabled && !pushing && !pulling ? "Save and commit all changes before pushing" : undefined}
                >
                  {pushing ? "Pushing…" : "Push current branch"}
                </button>
                <button
                  style={common.btn}
                  onClick={handlePull}
                  disabled={syncDisabled}
                  title={syncDisabled && !pushing && !pulling ? "Save and commit all changes before pulling" : undefined}
                >
                  {pulling ? "Pulling…" : "Pull latest"}
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
  validationSummary,
  recentRepos = [],
  onRemoveRecentRepo,
  hasUnsavedChanges,
  onSaveSuccess,
  onPullSuccess,
  onPullRunning,
  onCreateSuccess,
}: Props) {
  // ── No repository open: landing state ───────────────────────────────────────
  if (!summary) {
    return (
      <section style={common.section}>
        <h2 style={common.h2}>Open or Create a Repository</h2>
        <p style={styles.landingDescription}>
          Rack Inventory Studio manages rack inventory as a file-based
          repository on disk. Open an existing repository to start working, or
          create a new one from scratch.
        </p>

        {recentRepos.length > 0 && (
          <div style={styles.recentSection}>
            <h3 style={styles.subHeading}>Recent repositories</h3>
            <ul style={styles.recentList}>
              {recentRepos.map((path) => (
                <li key={path} style={styles.recentItem}>
                  <button
                    style={styles.recentPathBtn}
                    onClick={() => onRepoPathChange(path)}
                    disabled={working}
                    title={`Click to fill path: ${path}`}
                  >
                    {path}
                  </button>
                  <button
                    style={styles.recentRemoveBtn}
                    onClick={() => onRemoveRecentRepo?.(path)}
                    title="Remove from recent list"
                    disabled={working}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <h3 style={styles.subHeading}>Open existing repository</h3>
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
        </div>
        <p style={common.hint}>Example: {EXAMPLE_HINT}</p>

        <h3 style={{ ...styles.subHeading, marginTop: "1.25rem" }}>
          Create new repository
        </h3>
        <p style={common.hint}>
          Scaffold a new RIS repository on disk. Git initialization is optional
          and can be done later.
        </p>
        <CreateRepositoryWizard onSuccess={onCreateSuccess} />
      </section>
    );
  }

  // ── Repository open ──────────────────────────────────────────────────────────
  return (
    <>
      <section style={styles.openBar}>
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
          <button onClick={onClose} disabled={working} style={common.btn}>
            Close
          </button>
        </div>
      </section>

      <section style={common.section}>
        <h2 style={common.h2}>Repository Summary</h2>
        <SummaryTable summary={summary} validationSummary={validationSummary} />
      </section>

      <GitSection
        repoPath={summary.repo_path}
        hasUnsavedChanges={hasUnsavedChanges}
        onSaveSuccess={onSaveSuccess}
        onPullSuccess={onPullSuccess}
        onPullRunning={onPullRunning}
      />
    </>
  );
}

const styles = {
  landingDescription: {
    margin: "0 0 1rem",
    fontSize: "0.88rem",
    color: "#555",
    lineHeight: 1.55,
  } as CSSProperties,
  subHeading: {
    fontSize: "0.95rem",
    fontWeight: 600,
    margin: "0.75rem 0 0.4rem",
    color: "#333",
  } as CSSProperties,
  recentSection: {
    marginBottom: "0.5rem",
  } as CSSProperties,
  recentList: {
    listStyle: "none",
    margin: "0",
    padding: "0",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.2rem",
  } as CSSProperties,
  recentItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  } as CSSProperties,
  recentPathBtn: {
    background: "none",
    border: "1px solid #ccc",
    borderRadius: 3,
    padding: "0.2rem 0.5rem",
    fontFamily: "monospace",
    fontSize: "0.82rem",
    cursor: "pointer",
    color: "#2255aa",
    textAlign: "left" as const,
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  recentRemoveBtn: {
    background: "none",
    border: "1px solid transparent",
    borderRadius: 3,
    padding: "0.15rem 0.4rem",
    cursor: "pointer",
    color: "#999",
    fontSize: "0.9rem",
    flexShrink: 0,
  } as CSSProperties,
  openBar: {
    paddingBottom: "0.5rem",
    marginBottom: "0.25rem",
    borderBottom: "1px solid #eee",
  } as CSSProperties,
  hintList: {
    margin: "0 0 0.75rem",
    padding: "0.35rem 0.75rem 0.35rem 1.5rem",
    background: "#fffbf0",
    border: "1px solid #e8d88a",
    borderRadius: 3,
    fontSize: "0.82rem",
    color: "#5a4400",
    listStyle: "disc",
    lineHeight: 1.5,
  } as CSSProperties,
  hintItem: {
    margin: "0.1rem 0",
  } as CSSProperties,
  checklist: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem 1rem",
    margin: "0.4rem 0 0.5rem",
    padding: "0.4rem 0.75rem",
    background: "#f8f8f8",
    border: "1px solid #ddd",
    borderRadius: 3,
    fontSize: "0.8rem",
  } as CSSProperties,
  checklistItem: {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "0.25rem",
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  checklistIcon: {
    fontWeight: "bold" as const,
    minWidth: "0.9rem",
    textAlign: "center" as const,
  } as CSSProperties,
  checklistNote: {
    fontStyle: "italic" as const,
    color: "#7a5800",
    fontSize: "0.78rem",
  } as CSSProperties,
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
