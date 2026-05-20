import { describe, expect, it } from "vitest";
import type { GitStatusDto } from "../../api/tauriClient";
import {
  deriveGitActionHints,
  deriveGitStatusLabel,
  derivePublishChecklist,
} from "./gitStatusHelpers";

function makeStatus(overrides: Partial<GitStatusDto> = {}): GitStatusDto {
  return {
    is_repository: true,
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    is_clean: true,
    staged_count: 0,
    unstaged_count: 0,
    untracked_count: 0,
    message: null,
    ...overrides,
  };
}

// ── deriveGitStatusLabel ──────────────────────────────────────────────────────

describe("deriveGitStatusLabel", () => {
  it("returns no-git label when not a repository", () => {
    const result = deriveGitStatusLabel(makeStatus({ is_repository: false }));
    expect(result.label).toBe("No Git repository detected");
    expect(result.severity).toBe("info");
  });

  it("returns clean when tree is clean and up to date", () => {
    const result = deriveGitStatusLabel(makeStatus());
    expect(result.label).toBe("Clean working tree");
    expect(result.severity).toBe("ok");
  });

  it("returns uncommitted when tree is dirty", () => {
    const result = deriveGitStatusLabel(
      makeStatus({ is_clean: false, unstaged_count: 2 }),
    );
    expect(result.label).toBe("Local changes not committed");
    expect(result.severity).toBe("warn");
  });

  it("returns ahead label when ahead of remote", () => {
    const result = deriveGitStatusLabel(makeStatus({ ahead: 3 }));
    expect(result.label).toBe("Ahead of remote by 3 commits");
    expect(result.severity).toBe("ok");
  });

  it("uses singular for ahead=1", () => {
    const result = deriveGitStatusLabel(makeStatus({ ahead: 1 }));
    expect(result.label).toBe("Ahead of remote by 1 commit");
  });

  it("returns behind label when behind remote", () => {
    const result = deriveGitStatusLabel(makeStatus({ behind: 2 }));
    expect(result.label).toBe("Behind remote by 2 commits");
    expect(result.severity).toBe("warn");
  });

  it("uses singular for behind=1", () => {
    const result = deriveGitStatusLabel(makeStatus({ behind: 1 }));
    expect(result.label).toBe("Behind remote by 1 commit");
  });

  it("returns diverged when both ahead and behind", () => {
    const result = deriveGitStatusLabel(makeStatus({ ahead: 2, behind: 1 }));
    expect(result.label).toContain("Diverged");
    expect(result.severity).toBe("error");
  });

  it("prioritises dirty label over ahead/behind", () => {
    const result = deriveGitStatusLabel(
      makeStatus({ is_clean: false, staged_count: 1, ahead: 2 }),
    );
    expect(result.label).toBe("Local changes not committed");
  });
});

// ── deriveGitActionHints ──────────────────────────────────────────────────────

describe("deriveGitActionHints", () => {
  it("returns no hints when not a repository", () => {
    const hints = deriveGitActionHints(
      makeStatus({ is_repository: false }),
      false,
    );
    expect(hints).toHaveLength(0);
  });

  it("returns no hints for clean up-to-date repo with no unsaved changes", () => {
    const hints = deriveGitActionHints(makeStatus(), false);
    expect(hints).toHaveLength(0);
  });

  it("hints to save when there are unsaved app changes", () => {
    const hints = deriveGitActionHints(makeStatus(), true);
    expect(hints.some((h) => h.includes("Save in-memory"))).toBe(true);
  });

  it("hints to commit when tree is dirty and no unsaved changes", () => {
    const hints = deriveGitActionHints(
      makeStatus({ is_clean: false, unstaged_count: 1 }),
      false,
    );
    expect(hints.some((h) => h.includes("uncommitted changes"))).toBe(true);
  });

  it("hints about no upstream when upstream is null", () => {
    const hints = deriveGitActionHints(makeStatus({ upstream: null }), false);
    expect(hints.some((h) => h.includes("No upstream"))).toBe(true);
  });

  it("hints to pull when behind remote", () => {
    const hints = deriveGitActionHints(makeStatus({ behind: 3 }), false);
    expect(hints.some((h) => h.includes("3 commits behind"))).toBe(true);
  });

  it("uses singular for behind=1", () => {
    const hints = deriveGitActionHints(makeStatus({ behind: 1 }), false);
    expect(hints.some((h) => h.includes("1 commit behind"))).toBe(true);
  });

  it("hints to push when ahead of remote", () => {
    const hints = deriveGitActionHints(makeStatus({ ahead: 2 }), false);
    expect(hints.some((h) => h.includes("2 commits ahead"))).toBe(true);
  });

  it("hints diverged when both ahead and behind", () => {
    const hints = deriveGitActionHints(
      makeStatus({ ahead: 1, behind: 2 }),
      false,
    );
    expect(hints.some((h) => h.toLowerCase().includes("diverged"))).toBe(true);
  });
});

// ── derivePublishChecklist ────────────────────────────────────────────────────

describe("derivePublishChecklist", () => {
  it("returns empty checklist when not a repository", () => {
    const steps = derivePublishChecklist(
      makeStatus({ is_repository: false }),
      false,
    );
    expect(steps).toHaveLength(0);
  });

  it("returns 5 steps for a git repository", () => {
    const steps = derivePublishChecklist(makeStatus(), false);
    expect(steps).toHaveLength(5);
  });

  it("step 1 done when no unsaved changes", () => {
    const steps = derivePublishChecklist(makeStatus(), false);
    expect(steps[0].done).toBe(true);
    expect(steps[0].note).toBeUndefined();
  });

  it("step 1 pending when there are unsaved changes", () => {
    const steps = derivePublishChecklist(makeStatus(), true);
    expect(steps[0].done).toBe(false);
    expect(steps[0].note).toContain("In-memory");
  });

  it("step 2 (validate) is always null — unknown until run", () => {
    const steps = derivePublishChecklist(makeStatus(), false);
    expect(steps[1].done).toBeNull();
  });

  it("step 3 (commit) done when tree is clean", () => {
    const steps = derivePublishChecklist(makeStatus(), false);
    expect(steps[2].done).toBe(true);
  });

  it("step 3 (commit) pending when tree is dirty", () => {
    const steps = derivePublishChecklist(
      makeStatus({ is_clean: false, unstaged_count: 2 }),
      false,
    );
    expect(steps[2].done).toBe(false);
    expect(steps[2].note).toContain("2 files");
  });

  it("step 4 (pull) done when not behind", () => {
    const steps = derivePublishChecklist(makeStatus(), false);
    expect(steps[3].done).toBe(true);
  });

  it("step 4 (pull) pending when behind", () => {
    const steps = derivePublishChecklist(makeStatus({ behind: 3 }), false);
    expect(steps[3].done).toBe(false);
    expect(steps[3].note).toContain("3 commits");
  });

  it("step 5 (push) done when not ahead", () => {
    const steps = derivePublishChecklist(makeStatus(), false);
    expect(steps[4].done).toBe(true);
  });

  it("step 5 (push) pending when ahead", () => {
    const steps = derivePublishChecklist(makeStatus({ ahead: 2 }), false);
    expect(steps[4].done).toBe(false);
    expect(steps[4].note).toContain("2 commits");
  });

  it("step 5 uses singular for ahead=1", () => {
    const steps = derivePublishChecklist(makeStatus({ ahead: 1 }), false);
    expect(steps[4].note).toContain("1 commit");
    expect(steps[4].note).not.toContain("1 commits");
  });
});
