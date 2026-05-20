import { type CSSProperties, FormEvent, useEffect, useRef, useState } from "react";
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
  getPullDisabledReason,
  getPushDisabledReason,
  type PublishChecklistStep,
} from "./gitStatusHelpers";
import { CreateRepositoryWizard } from "./CreateRepositoryWizard";
import { Banner, Badge, Panel, PageHeader, EmptyState } from "../../components/ui";
import {
  IcFolder,
  IcCheck,
  IcRefresh,
  IcSave,
  IcGitBranch,
  IcMapPin,
  IcServer,
  IcLayers,
  IcBox,
  IcFile,
  IcListChecks,
  IcAlertCircle,
  IcCheckCircle,
  IcDownload,
  IcPush,
  IcClock,
  IcAlertTriangle,
  IcX,
  IcInfo,
} from "../../components/ui/Icon";

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
      <table style={legacyCommon.table}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={legacyCommon.th}>{label}</td>
              <td
                style={{
                  ...legacyCommon.td,
                  ...(label === "Unplaced Devices" && (value as number) > 0
                    ? { color: "var(--st-warn-tx)" }
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
                <td style={legacyCommon.th}>Validation Errors</td>
                <td
                  style={{
                    ...legacyCommon.td,
                    ...(validationSummary.errors > 0
                      ? { color: "var(--st-err-tx)", fontWeight: "bold" }
                      : { color: "var(--st-ok-tx)" }),
                  }}
                >
                  {validationSummary.errors}
                </td>
              </tr>
              <tr>
                <td style={legacyCommon.th}>Validation Warnings</td>
                <td
                  style={{
                    ...legacyCommon.td,
                    ...(validationSummary.warnings > 0
                      ? { color: "var(--st-warn-tx)" }
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
        <p style={{ margin: "0.25rem 0 0", fontSize: "0.78rem", color: "var(--tx-3)" }}>
          Validation counts are from the time of last open. Use the Validation tab for current state.
        </p>
      )}
    </>
  );
}

function StatTileGrid({
  summary,
  validationSummary,
}: {
  summary: RepositorySummaryDto;
  validationSummary?: ValidationSummaryDto | null;
}) {
  const errCount  = validationSummary?.errors ?? 0;
  const warnCount = validationSummary?.warnings ?? 0;
  const valTone   = errCount > 0 ? "err" : warnCount > 0 ? "warn" : "ok";
  const valValue  = validationSummary
    ? `${errCount} / ${warnCount} / ${validationSummary.infos}`
    : "—";
  const unplacedTone = summary.unplaced_devices_count > 0 ? "warn" : "ok";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 0 }}>
      <StatTile label="Locations"      value={summary.locations_count}       icon={<IcMapPin size={14} />}      />
      <StatTile label="Racks"          value={summary.racks_count}            icon={<IcServer size={14} />}      />
      <StatTile label="Device Models"  value={summary.device_models_count}    icon={<IcLayers size={14} />}      />
      <StatTile label="Devices"        value={summary.devices_count}          icon={<IcBox size={14} />}         />
      <StatTile label="Placement Files" value={summary.placement_files_count} icon={<IcFile size={14} />}        />
      <StatTile label="Placements"     value={summary.placements_count}       icon={<IcListChecks size={14} />}  />
      <StatTile label="Unplaced"       value={summary.unplaced_devices_count} icon={<IcAlertCircle size={14} />} tone={unplacedTone} />
      {validationSummary && (
        <StatTile
          label="Validation"
          value={valValue}
          icon={<IcCheckCircle size={14} />}
          tone={valTone}
          sub="errors / warnings / info"
        />
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  tone,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "ok" | "warn" | "err";
  sub?: string;
}) {
  return (
    <div className="stat-tile">
      <div className="st-header">
        <span className="eyebrow">{label}</span>
        <span className={`st-icon${tone ? ` tone-${tone}` : ""}`}>{icon}</span>
      </div>
      <div className={`st-value${tone ? ` tone-${tone}` : ""}`}>{value}</div>
      {sub && <div className="st-sub">{sub}</div>}
    </div>
  );
}

function gitStatusBadge(status: GitStatusDto) {
  const { label, severity } = deriveGitStatusLabel(status);
  const toneMap = { ok: "ok", warn: "warn", error: "err", info: "info" } as const;
  const tone = toneMap[severity];
  const iconMap = {
    ok: <IcCheck size={11} />,
    warn: <IcAlertTriangle size={11} />,
    error: <IcAlertCircle size={11} />,
    info: <IcInfo size={11} />,
  };
  return <Badge tone={tone} icon={iconMap[severity]}>{label}</Badge>;
}

type PublishValidation =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "done"; summary: ReturnType<typeof computeValidationSummary> };

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

  // Reset publish validation whenever unsaved in-memory changes appear.
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
    if (!name) { setAddRemoteError("Remote name cannot be empty."); return; }
    if (!url)  { setAddRemoteError("Remote URL cannot be empty."); return; }
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
      <Panel title="Git">
        <p style={{ margin: 0, color: "var(--tx-3)", fontStyle: "italic", fontSize: 12 }}>Loading Git status…</p>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel title="Git" actions={<button className="btn btn-sm" onClick={() => setRefreshKey((k) => k + 1)}>Retry</button>}>
        <Banner tone="err">{error}</Banner>
      </Panel>
    );
  }

  if (!gitStatus) return null;

  if (!gitStatus.is_repository) {
    return (
      <Panel title="Git" desc="No Git repository detected.">
        <div className="stack">
          <p style={{ margin: 0, fontSize: 12, color: "var(--tx-3)" }}>
            This directory is not tracked by Git.
          </p>
          {initError && <Banner tone="err">{initError}</Banner>}
          <div>
            <button className="btn" onClick={handleInit} disabled={initing}>
              {initing ? "Initializing…" : "Initialize Git repository"}
            </button>
          </div>
        </div>
      </Panel>
    );
  }

  const actionHints = deriveGitActionHints(gitStatus, hasUnsavedChanges);
  const nothingToCommit = gitStatus.is_clean;
  const validationPassed =
    publishValidation.kind === "done" && publishValidation.summary.errors === 0;
  const validationBlocked =
    publishValidation.kind === "idle" ||
    publishValidation.kind === "validating" ||
    (publishValidation.kind === "done" && publishValidation.summary.errors > 0);

  const commitDisabled =
    committing || hasUnsavedChanges || !commitMessage.trim() || nothingToCommit || validationBlocked;

  const pushBlockedReason = getPushDisabledReason(gitStatus, hasUnsavedChanges, selectedRemote);
  const pullBlockedReason = getPullDisabledReason(gitStatus, hasUnsavedChanges, selectedRemote);
  const pushDisabled = pushBlockedReason !== null || pushing || pulling;
  const pullDisabled = pullBlockedReason !== null || pushing || pulling;

  const rawChecklist = derivePublishChecklist(gitStatus, hasUnsavedChanges);
  const checklist: PublishChecklistStep[] = rawChecklist.map((step) => {
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
    <>
      {/* Safe publish stepper */}
      <Panel
        title="Safe publish"
        desc="Save → Validate → Commit → Pull → Push"
        actions={
          <button className="btn btn-sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <IcRefresh size={11} /> Refresh
          </button>
        }
        flush
      >
        <div className="stepper">
          {/* Step 1 — Save */}
          {(() => {
            const state = !hasUnsavedChanges ? "step-done" : "step-active";
            return (
              <div className={`step-row ${state}`}>
                <div className="step-dot">{!hasUnsavedChanges ? <IcCheck size={11} /> : "1"}</div>
                <div>
                  <div className="step-title">Save changes to disk</div>
                  <div className="step-meta">
                    {hasUnsavedChanges
                      ? "In-memory changes not yet written to YAML files."
                      : "All changes are written to YAML."}
                    {saveSuccess && <span style={{ color: "var(--st-ok-tx)", display: "block", marginTop: 2 }}>{saveSuccess}</span>}
                    {saveError && <span style={{ color: "var(--st-err-tx)", display: "block", marginTop: 2 }}>{saveError}</span>}
                  </div>
                </div>
                {hasUnsavedChanges && (
                  <div className="step-action">
                    <button className="btn btn-primary btn-sm" onClick={handleSaveFromGit} disabled={saving}>
                      <IcSave size={11} /> {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Step 2 — Validate */}
          {(() => {
            const done = publishValidation.kind === "done" && publishValidation.summary.errors === 0;
            const blocked = !done && !hasUnsavedChanges;
            const state = done ? "step-done" : blocked ? "step-active" : "step-blocked";
            const meta = publishValidation.kind === "idle"
              ? "Run validation before committing."
              : publishValidation.kind === "validating"
                ? "Validating…"
                : publishValidation.summary.errors > 0
                  ? `${publishValidation.summary.errors} error(s) block the commit.`
                  : `No errors. ${publishValidation.summary.warnings} warning(s), ${publishValidation.summary.infos} info — review optional.`;
            return (
              <div className={`step-row ${state}`}>
                <div className="step-dot">{done ? <IcCheck size={11} /> : "2"}</div>
                <div>
                  <div className="step-title">Validate inventory</div>
                  <div className="step-meta">
                    {meta}
                    {validateError && <span style={{ color: "var(--st-err-tx)", display: "block", marginTop: 2 }}>{validateError}</span>}
                  </div>
                </div>
                <div className="step-action">
                  <button
                    className="btn btn-sm"
                    onClick={handleValidateForPublish}
                    disabled={hasUnsavedChanges || publishValidation.kind === "validating"}
                  >
                    <IcRefresh size={11} /> {publishValidation.kind === "validating" ? "Running…" : "Run"}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Step 3 — Commit */}
          {(() => {
            const done = nothingToCommit && checklist.find(s => s.step === 3)?.done === true;
            const active = !hasUnsavedChanges && validationPassed && !nothingToCommit;
            const state = done ? "step-done" : active ? "step-active" : "step-blocked";
            return (
              <div className={`step-row ${state}`}>
                <div className="step-dot">{done ? <IcCheck size={11} /> : "3"}</div>
                <div style={{ gridColumn: "2 / -1" }}>
                  <div className="step-title">Commit local changes</div>
                  {nothingToCommit ? (
                    <div className="step-meta">Working tree is clean — nothing to commit.</div>
                  ) : (
                    <form onSubmit={handleCommit} style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                      <input
                        className="ri-input"
                        style={{ flex: 1, height: 26, fontSize: 12 }}
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Commit message…"
                        disabled={committing || hasUnsavedChanges || !validationPassed}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={commitDisabled}
                        title={
                          hasUnsavedChanges ? "Save inventory changes to disk first"
                            : !validationPassed ? "Run validation without errors first"
                            : !commitMessage.trim() ? "Enter a commit message"
                            : undefined
                        }
                      >
                        {committing ? "Committing…" : "Commit"}
                      </button>
                    </form>
                  )}
                  {commitError && <div className="step-meta" style={{ color: "var(--st-err-tx)", marginTop: 4 }}>{commitError}</div>}
                  {commitSuccess && <div className="step-meta" style={{ color: "var(--st-ok-tx)", marginTop: 4 }}>{commitSuccess}</div>}
                </div>
              </div>
            );
          })()}

          {/* Step 4 — Pull */}
          {(() => {
            const behind = gitStatus.behind ?? 0;
            const ahead  = gitStatus.ahead ?? 0;
            const done   = behind === 0;
            const diverged = ahead > 0 && behind > 0;
            const state  = done ? "step-done" : "step-active";
            return (
              <div className={`step-row ${state}`}>
                <div className="step-dot">{done ? <IcCheck size={11} /> : "4"}</div>
                <div>
                  <div className="step-title">Pull if remote moved</div>
                  <div className="step-meta">
                    {diverged
                      ? "Branch has diverged — resolve manually."
                      : behind > 0
                        ? `Behind by ${behind} commit${behind !== 1 ? "s" : ""} — fetch before pushing.`
                        : gitStatus.upstream
                          ? "Up to date with remote."
                          : "No upstream configured yet."}
                    {pullError && <span style={{ color: "var(--st-err-tx)", display: "block", marginTop: 2 }}>{pullError}</span>}
                    {pullSuccess && <span style={{ color: "var(--st-ok-tx)", display: "block", marginTop: 2 }}>{pullSuccess}</span>}
                  </div>
                </div>
                <div className="step-action">
                  <button
                    className="btn btn-sm"
                    onClick={handlePull}
                    disabled={pullDisabled}
                    title={!pulling && pullBlockedReason !== null ? pullBlockedReason : undefined}
                  >
                    <IcDownload size={11} /> {pulling ? "Pulling…" : "Pull"}
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Step 5 — Push */}
          {(() => {
            const ahead = gitStatus.ahead ?? 0;
            const done  = ahead === 0 && nothingToCommit;
            const state = done ? "step-done" : "step-active";
            return (
              <div className={`step-row ${state}`}>
                <div className="step-dot">{done ? <IcCheck size={11} /> : "5"}</div>
                <div>
                  <div className="step-title">Push to remote</div>
                  <div className="step-meta">
                    {ahead > 0
                      ? `${ahead} commit${ahead !== 1 ? "s" : ""} ahead of remote — push when ready.`
                      : gitStatus.upstream
                        ? "Remote is up to date."
                        : "No upstream branch — push will configure tracking."}
                    {pushError && <span style={{ color: "var(--st-err-tx)", display: "block", marginTop: 2 }}>{pushError}</span>}
                    {pushSuccess && <span style={{ color: "var(--st-ok-tx)", display: "block", marginTop: 2 }}>{pushSuccess}</span>}
                  </div>
                </div>
                <div className="step-action">
                  <button
                    className="btn btn-sm"
                    onClick={handlePush}
                    disabled={pushDisabled}
                    title={!pushing && pushBlockedReason !== null ? pushBlockedReason : undefined}
                  >
                    <IcPush size={11} /> {pushing ? "Pushing…" : "Push"}
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      </Panel>

      {/* Recent commits */}
      {gitCommits.length > 0 && (
        <Panel title="Recent commits" desc={`Branch: ${gitStatus.branch ?? "—"}`} flush>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 72 }}>Hash</th>
                <th>Subject</th>
                <th style={{ width: 120 }}>Author</th>
                <th style={{ width: 100 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {gitCommits.map((c) => (
                <tr key={c.hash}>
                  <td className="tbl-mono" style={{ color: "var(--ac-text)" }}>{c.short_hash}</td>
                  <td>{c.subject}</td>
                  <td>{c.author ?? ""}</td>
                  <td className="tbl-mono" style={{ color: "var(--tx-3)" }}>{c.date ? c.date.slice(0, 10) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
      {gitCommits.length === 0 && !loading && gitStatus.is_repository && (
        <Panel title="Recent commits">
          <EmptyState icon={<IcClock size={22} strokeWidth={1.2} />} title="No commits yet" body="Commit your first changes using the Safe publish steps above." />
        </Panel>
      )}

      {/* Git status + action hints sidebar content */}
      <Panel title="Git status">
        <div className="stack-3">
          <dl className="kv">
            <dt>Branch</dt>
            <dd className="mono" style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IcGitBranch size={12} /> {gitStatus.branch ?? "—"}
            </dd>
            <dt>Status</dt>
            <dd>{gitStatusBadge(gitStatus)}</dd>
            {gitStatus.upstream && (
              <>
                <dt>Upstream</dt>
                <dd className="mono">{gitStatus.upstream}</dd>
              </>
            )}
            {!gitStatus.is_clean && (
              <>
                <dt>Changes</dt>
                <dd style={{ fontSize: 11, color: "var(--tx-3)" }}>
                  {gitStatus.staged_count} staged · {gitStatus.unstaged_count} unstaged · {gitStatus.untracked_count} untracked
                </dd>
              </>
            )}
          </dl>

          {!gitStatus.upstream && (
            <Banner tone="warn" title="No upstream branch" icon={<IcGitBranch size={14} />}>
              Set tracking before pushing. The first push will configure tracking automatically.
            </Banner>
          )}

          {actionHints.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--tx-2)", lineHeight: 1.7 }}>
              {actionHints.map((hint, i) => <li key={i}>{hint}</li>)}
            </ul>
          )}
        </div>
      </Panel>

      {/* Remote section */}
      <Panel title="Remote" desc={remotes.length > 0 ? `${remotes.length} configured` : "None configured"}>
        <div className="stack-3">
          {remotes.length > 0 && (
            <dl className="kv">
              {remotes.map((r) => (
                <div key={r.name} style={{ display: "contents" }}>
                  <dt className="mono">{r.name}</dt>
                  <dd className="mono" style={{ wordBreak: "break-all", fontSize: 11, color: "var(--tx-2)" }}>{r.url}</dd>
                </div>
              ))}
            </dl>
          )}

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Add remote</div>
            <form onSubmit={handleAddRemote} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input
                className="ri-input ri-mono"
                style={{ width: 90, flexShrink: 0 }}
                value={newRemoteName}
                onChange={(e) => setNewRemoteName(e.target.value)}
                placeholder="Name"
                disabled={addingRemote}
              />
              <input
                className="ri-input ri-mono"
                style={{ flex: 1, minWidth: 160 }}
                value={newRemoteUrl}
                onChange={(e) => setNewRemoteUrl(e.target.value)}
                placeholder="URL (e.g. git@github.com:org/repo.git)"
                disabled={addingRemote}
              />
              <button type="submit" className="btn btn-sm" disabled={addingRemote}>
                {addingRemote ? "Adding…" : "Add"}
              </button>
            </form>
            {addRemoteError && <div style={{ marginTop: 6, fontSize: 12, color: "var(--st-err-tx)" }}>{addRemoteError}</div>}
            {addRemoteSuccess && <div style={{ marginTop: 6, fontSize: 12, color: "var(--st-ok-tx)" }}>{addRemoteSuccess}</div>}
          </div>

          {remotes.length > 0 && (
            <div>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Push / Pull</div>
              {hasUnsavedChanges && (
                <div style={{ marginBottom: 8 }}>
                  <Banner tone="warn">Save and commit all changes before syncing with remote.</Banner>
                </div>
              )}
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--tx-3)", whiteSpace: "nowrap" }}>Remote:</span>
                <select
                  className="ri-input"
                  style={{ flex: 1 }}
                  value={selectedRemote}
                  onChange={(e) => setSelectedRemote(e.target.value)}
                  disabled={pushing || pulling || hasUnsavedChanges}
                >
                  {remotes.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  className="btn btn-sm"
                  onClick={handlePull}
                  disabled={pullDisabled}
                  title={!pulling && pullBlockedReason !== null ? pullBlockedReason : undefined}
                >
                  <IcDownload size={11} /> {pulling ? "Pulling…" : "Pull"}
                </button>
                <button
                  className="btn btn-sm"
                  onClick={handlePush}
                  disabled={pushDisabled}
                  title={!pushing && pushBlockedReason !== null ? pushBlockedReason : undefined}
                >
                  <IcPush size={11} /> {pushing ? "Pushing…" : "Push"}
                </button>
              </div>
            </div>
          )}
        </div>
      </Panel>
    </>
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
  // ── Landing state (no repository open) ──────────────────────────────────────
  if (!summary) {
    return (
      <>
        <PageHeader
          title="Open a repository"
          subtitle="Rack Inventory Studio stores its data as YAML files in a Git repository on disk."
        />
        <div className="page-content">
          <div className="cols-sidebar">
            <div className="stack-4">
              {recentRepos.length > 0 && (
                <Panel
                  title="Recent repositories"
                  desc="Repositories you've opened on this machine."
                  flush
                >
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Path</th>
                        <th style={{ width: 64 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentRepos.map((path) => (
                        <tr key={path} className="tbl-clickable">
                          <td
                            className="tbl-mono"
                            onClick={() => onRepoPathChange(path)}
                            title={`Click to fill path: ${path}`}
                            style={{ color: "var(--ac-text)", cursor: "pointer" }}
                          >
                            {path}
                          </td>
                          <td className="tbl-actions">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => { onRepoPathChange(path); }}
                              disabled={working}
                            >
                              Open
                            </button>
                            <button
                              className="btn btn-ghost btn-sm btn-icon"
                              onClick={() => onRemoveRecentRepo?.(path)}
                              disabled={working}
                              title="Remove from list"
                            >
                              <IcX size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}

              <Panel title="Open by path" desc="Paste or browse to a repository directory.">
                <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Repository path</label>
                    <div className="input-group">
                      <input
                        className="ri-input ri-mono"
                        value={repoPath}
                        onChange={(e) => onRepoPathChange(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && onOpen()}
                        placeholder="e.g. examples/example-repository"
                        disabled={working}
                      />
                      <button className="btn" onClick={onBrowse} disabled={working}>
                        <IcFolder size={12} /> Browse…
                      </button>
                    </div>
                    <div className="fld-help">Example: {EXAMPLE_HINT}</div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={onOpen}
                    disabled={working || !repoPath.trim()}
                  >
                    Open
                  </button>
                </div>
              </Panel>

              <Panel title="Create new repository" desc="Scaffold an empty RIS repository on disk.">
                <CreateRepositoryWizard onSuccess={onCreateSuccess} />
              </Panel>
            </div>

            <div className="stack-4">
              <Panel title="Quick reference">
                <div className="stack-3">
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 6 }}>Repository shape</div>
                    <pre className="mono" style={{
                      background: "var(--bg-sunken)", padding: 12, borderRadius: 4,
                      fontSize: 11, lineHeight: 1.6, margin: 0, color: "var(--tx-2)",
                      overflowX: "auto"
                    }}>
{`inventory/
├─ repo.yaml
├─ locations.yaml
├─ device-models/
├─ devices/
└─ placements/`}
                    </pre>
                  </div>
                  <div className="hr" style={{ margin: 0 }} />
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--tx-2)", lineHeight: 1.7 }}>
                    <li>Open or browse to an existing repository directory.</li>
                    <li>Create a new repository and optionally initialize Git.</li>
                    <li>Single-user, offline-first.</li>
                  </ul>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Repository open ──────────────────────────────────────────────────────────
  return (
    <>
      <PageHeader
        title="Repository"
        subtitle={<span className="mono" style={{ fontSize: 12, color: "var(--tx-3)" }}>{summary.repo_path}</span>}
        actions={
          <>
            <button className="btn" onClick={onBrowse} disabled={working}>
              <IcFolder size={12} /> Switch…
            </button>
            <button className="btn btn-danger" onClick={onClose} disabled={working}>
              <IcX size={12} /> Close
            </button>
          </>
        }
      />
      <div className="page-content">
        <div className="cols-sidebar">
          <div className="stack-4">
            <Panel title="Repository summary" desc="Entity counts and validation snapshot.">
              <StatTileGrid summary={summary} validationSummary={validationSummary} />
            </Panel>
            <GitSection
              repoPath={summary.repo_path}
              hasUnsavedChanges={hasUnsavedChanges}
              onSaveSuccess={onSaveSuccess}
              onPullSuccess={onPullSuccess}
              onPullRunning={onPullRunning}
            />
          </div>
          <div className="stack-4" style={{ minWidth: 0 }}>
            {/* The Git status, action hints and remote panels are rendered inside GitSection,
                but we need them in the sidebar. Temporarily render the legacy summary table
                here — will be separated into sidebar in a follow-up. */}
            <Panel title="Repository details" flush>
              <div style={{ padding: "12px 16px" }}>
                <SummaryTable summary={summary} validationSummary={validationSummary} />
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

const legacyCommon = {
  table: {
    borderCollapse: "collapse" as const,
    width: "100%",
    fontSize: 12,
  },
  th: {
    padding: "4px 8px",
    textAlign: "left" as const,
    fontWeight: 500,
    color: "var(--tx-3)",
    whiteSpace: "nowrap" as const,
    width: "40%",
  },
  td: {
    padding: "4px 8px",
    borderBottom: "1px solid var(--bd-1)",
    color: "var(--tx-1)",
    fontSize: 12,
  },
};
