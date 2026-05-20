import type { GitStatusDto } from "../../api/tauriClient";

export type GitSeverity = "ok" | "warn" | "error" | "info";

export interface GitStatusLabel {
  label: string;
  severity: GitSeverity;
}

/** Returns a human-readable semantic label for the current Git working-tree state. */
export function deriveGitStatusLabel(status: GitStatusDto): GitStatusLabel {
  if (!status.is_repository) {
    return { label: "No Git repository detected", severity: "info" };
  }
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  if (!status.is_clean) {
    return { label: "Local changes not committed", severity: "warn" };
  }
  if (ahead > 0 && behind > 0) {
    return {
      label: `Diverged from remote (↑${ahead} ↓${behind})`,
      severity: "error",
    };
  }
  if (behind > 0) {
    return {
      label: `Behind remote by ${behind} commit${behind !== 1 ? "s" : ""}`,
      severity: "warn",
    };
  }
  if (ahead > 0) {
    return {
      label: `Ahead of remote by ${ahead} commit${ahead !== 1 ? "s" : ""}`,
      severity: "ok",
    };
  }
  return { label: "Clean working tree", severity: "ok" };
}

/**
 * Returns contextual action hints describing what the user should do next.
 * Empty when there is nothing actionable to suggest.
 */
export function deriveGitActionHints(
  status: GitStatusDto,
  hasUnsavedChanges: boolean,
): string[] {
  if (!status.is_repository) return [];
  const hints: string[] = [];

  if (hasUnsavedChanges) {
    hints.push("Save in-memory changes to disk before committing to Git.");
  } else if (!status.is_clean) {
    hints.push("Working tree has uncommitted changes — validate, then commit.");
  }

  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;

  if (!status.upstream) {
    hints.push(
      "No upstream branch — push requires a configured remote and tracking branch.",
    );
  } else if (ahead > 0 && behind > 0) {
    hints.push(
      "Branch has diverged from remote — manual git intervention required.",
    );
  } else if (behind > 0) {
    hints.push(
      `Branch is ${behind} commit${behind !== 1 ? "s" : ""} behind remote — pull before pushing.`,
    );
  } else if (ahead > 0) {
    hints.push(
      `Branch is ${ahead} commit${ahead !== 1 ? "s" : ""} ahead of remote — push when ready.`,
    );
  }

  return hints;
}

/**
 * Returns the reason Push should be disabled, or null when push is allowed.
 * selectedRemote must be the currently selected remote name (empty string if none selected).
 */
export function getPushDisabledReason(
  status: GitStatusDto,
  hasUnsavedChanges: boolean,
  selectedRemote: string,
): string | null {
  if (hasUnsavedChanges) return "Save inventory changes to disk first";
  if (!selectedRemote) return "Select a remote to push to";
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  if (ahead > 0 && behind > 0) {
    return "Branch has diverged — resolve manually with Git";
  }
  if (behind > 0) return "Pull latest before pushing";
  return null;
}

/**
 * Returns the reason Pull should be disabled, or null when pull is allowed.
 * selectedRemote must be the currently selected remote name (empty string if none selected).
 */
export function getPullDisabledReason(
  status: GitStatusDto,
  hasUnsavedChanges: boolean,
  selectedRemote: string,
): string | null {
  if (hasUnsavedChanges) return "Save inventory changes to disk first";
  if (!selectedRemote) return "Select a remote to pull from";
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  if (ahead > 0 && behind > 0) {
    return "Branch has diverged — resolve manually with Git";
  }
  return null;
}

export interface PublishChecklistStep {
  step: number;
  label: string;
  /** true = done, false = pending, null = unknown until action is taken */
  done: boolean | null;
  note?: string;
}

/**
 * Returns a checklist reflecting the safe publish path:
 * Save → Validate → Commit → Pull → Push.
 * Step 2 (validate) is always null (unknown) — callers should override it
 * with the local validation state.
 */
export function derivePublishChecklist(
  status: GitStatusDto,
  hasUnsavedChanges: boolean,
): PublishChecklistStep[] {
  if (!status.is_repository) return [];
  const ahead = status.ahead ?? 0;
  const behind = status.behind ?? 0;
  const changedCount =
    status.staged_count + status.unstaged_count + status.untracked_count;
  return [
    {
      step: 1,
      label: "Save changes to disk",
      done: !hasUnsavedChanges,
      note: hasUnsavedChanges
        ? "In-memory changes not yet written to YAML files."
        : undefined,
    },
    {
      step: 2,
      label: "Validate — no errors",
      done: null,
    },
    {
      step: 3,
      label: "Commit local changes",
      done: status.is_clean,
      note:
        !status.is_clean && changedCount > 0
          ? `${changedCount} file${changedCount !== 1 ? "s" : ""} changed.`
          : undefined,
    },
    {
      step: 4,
      label: "Pull if behind",
      done: behind === 0,
      note:
        behind > 0
          ? `${behind} commit${behind !== 1 ? "s" : ""} to pull.`
          : undefined,
    },
    {
      step: 5,
      label: "Push to remote",
      done: ahead === 0,
      note:
        ahead > 0
          ? `${ahead} commit${ahead !== 1 ? "s" : ""} ready to push.`
          : undefined,
    },
  ];
}
