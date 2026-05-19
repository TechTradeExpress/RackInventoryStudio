import { FormEvent, useEffect, useRef, useState } from "react";
import { common } from "../../lib/styles";
import {
  commitRepositoryChanges,
  getGitLog,
  getGitStatus,
  initGitRepository,
  type GitCommitDto,
  type GitStatusDto,
  type RepositorySummaryDto,
} from "../../api/tauriClient";

interface Props {
  repoPath: string;
  onRepoPathChange: (v: string) => void;
  onOpen: () => void;
  onBrowse: () => void;
  onClose: () => void;
  working: boolean;
  summary: RepositorySummaryDto | null;
  hasUnsavedChanges: boolean;
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

interface GitSectionProps {
  repoPath: string;
  hasUnsavedChanges: boolean;
}

function GitSection({ repoPath, hasUnsavedChanges }: GitSectionProps) {
  const [gitStatus, setGitStatus] = useState<GitStatusDto | null>(null);
  const [gitCommits, setGitCommits] = useState<GitCommitDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);

  const [initing, setIniting] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const prevRepoPathRef = useRef("");

  useEffect(() => {
    const isRepoSwitch = prevRepoPathRef.current !== repoPath;
    prevRepoPathRef.current = repoPath;
    if (isRepoSwitch) {
      setGitStatus(null);
      setGitCommits([]);
      setCommitMessage("");
      setCommitError(null);
      setCommitSuccess(null);
      setInitError(null);
      setError(null);
    }

    setLoading(true);
    Promise.all([getGitStatus(), getGitLog(5)])
      .then(([status, commits]) => {
        setGitStatus(status);
        setGitCommits(commits);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [repoPath, refreshKey]);

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
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setCommitError(String(e));
    } finally {
      setCommitting(false);
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

  const commitDisabled =
    committing ||
    hasUnsavedChanges ||
    !commitMessage.trim();

  return (
    <section style={common.section}>
      <h2 style={common.h2}>Git</h2>

      <table style={{ ...common.table, marginBottom: "0.75rem" }}>
        <tbody>
          <tr>
            <td style={common.th}>Branch</td>
            <td style={common.td}>{gitStatus.branch ?? "—"}</td>
          </tr>
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

      <div style={styles.commitSection}>
        <h3 style={common.h3}>Commit saved changes</h3>
        {hasUnsavedChanges && (
          <div style={styles.warningBox}>
            Save repository changes before creating a Git commit.
          </div>
        )}
        <form onSubmit={handleCommit} style={styles.commitForm}>
          <input
            style={common.input}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message…"
            disabled={committing || hasUnsavedChanges}
          />
          <button
            type="submit"
            style={common.btn}
            disabled={commitDisabled}
          >
            {committing ? "Committing…" : "Commit"}
          </button>
        </form>
        {commitError && <div style={common.errorBox}>{commitError}</div>}
        {commitSuccess && <div style={styles.successBox}>{commitSuccess}</div>}
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
        />
      )}
    </>
  );
}

const styles = {
  commitSection: {
    marginTop: "0.75rem",
    paddingTop: "0.5rem",
    borderTop: "1px solid #eee",
  },
  commitForm: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.4rem",
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
