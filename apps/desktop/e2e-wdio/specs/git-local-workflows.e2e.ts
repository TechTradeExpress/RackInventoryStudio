/**
 * Local Git workflows — validate, commit, add remote, push/pull local
 * error paths (Stage 3F.1B).
 *
 * Builds on Stage 3F.1A's Git detection/init coverage. Scope here is
 * strictly local: no successful push, pull, or clone; no SSH; no network
 * reachability at all. Fake HTTPS remotes (`https://example.invalid/...`
 * — RFC 2606 reserved, guaranteed never to resolve) are used only to
 * exercise the *error path* of push/pull, never a successful round-trip.
 *
 * Fixtures are built exclusively via `createLocalGitRepository` (Stage
 * 3F.0.5) and opened through "Open by path" — same rationale as
 * git-detection-init.e2e.ts: `create_repository_cmd` always runs
 * `git init` itself, so a fixture with pre-baked state (an existing
 * commit, an uncommitted change) can only reach the app this way.
 *
 * Validate/Commit gating, read from RepositoryPanel.tsx before writing
 * this spec: the "Safe publish" stepper's Commit step is disabled until
 * `publishValidation.kind === "done" && summary.errors === 0` — so
 * Validate must genuinely be run and pass before Commit is reachable.
 * The minimal fixture's only validation issue is VAL-LOC-005 ("no
 * locations defined"), which is INFO-level (crates/ris-validation/src/
 * validators/location.rs) — it does not block validationPassed.
 *
 * Push/Pull gating (apps/desktop/src/features/repository/
 * gitStatusHelpers.ts): both are enabled once a remote is selected and
 * there are no unsaved app-level changes and the branch hasn't diverged —
 * neither requires `ahead > 0`/an existing upstream, so both are
 * reachable immediately after adding a fresh remote.
 *
 * Selector scope note (this stage's own instruction): Push/Pull render
 * as two simultaneous, functionally-identical button pairs (the "Safe
 * publish" stepper and the "Remote" panel), flagged since Stage 3F.0's
 * audit. This stage selectorizes only the stepper's pair
 * (`git-stepper-push-btn` / `git-stepper-pull-btn`) — the Remote panel's
 * pair is left unselectorized, avoiding any selector that matches more
 * than one element. The stepper's push/pull error text
 * (`git-push-error` / `git-pull-error`) is also the only place either
 * error is ever rendered.
 *
 * Selector contract: `git-validate-btn`, `git-commit-message-input`,
 * `git-commit-btn`, `git-remote-name-input`, `git-remote-url-input`,
 * `git-remote-add-btn`, `git-remote-add-success`, `git-stepper-push-btn`,
 * `git-stepper-pull-btn`, `git-push-error`, `git-pull-error` (new — this
 * stage), plus pre-existing `repository-landing-title`,
 * `repository-open-path-input`, `repository-open-path-submit`,
 * `repository-active-root`, `repository-close-action`,
 * `repository-active-path`, `git-branch-value` (Stage 3F.1A).
 */
import { browser, expect } from "@wdio/globals";
import { reactSetValue, clickWhenEnabled, expectActiveRepositoryPath } from "../support/repository-ui";
import {
  createLocalGitRepository,
  getCommitCount,
  getCurrentBranch,
  getHeadCommit,
  getRemoteUrl,
  getWorkingTreeStatus,
} from "../support/local-git";

const FAKE_REMOTE_URL = "https://example.invalid/repository.git";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[git-local-workflows ${ts}] ${msg}`);
}

/** Fills and submits the landing screen's "Open by path" field, then waits
 * for the repository to open. Spec-local, duplicated from
 * git-detection-init.e2e.ts rather than shared, per this stage's
 * instruction not to modify Stage 3F.1A. */
async function openRepositoryByPath(repoPath: string): Promise<void> {
  await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
  await reactSetValue("repository-open-path-input", repoPath);
  await clickWhenEnabled("repository-open-path-submit");
  await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
  await expectActiveRepositoryPath(repoPath);
}

async function closeRepository(): Promise<void> {
  await browser.$('[data-testid="repository-close-action"]').click();
  await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 15_000 });
  await browser
    .$('[data-testid="repository-active-path"]')
    .waitForDisplayed({ timeout: 5_000, reverse: true });
}

/** Best-effort close for use in `finally` — never throws, so it cannot
 * mask an assertion failure from the try block. */
async function closeRepositorySafely(): Promise<void> {
  try {
    await closeRepository();
  } catch (e) {
    log(`WARNING: best-effort close in finally failed (continuing to cleanup): ${e instanceof Error ? e.message : String(e)}`);
  }
}

function normalizeBranchText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function getDisplayedBranch(): Promise<string> {
  const text = await browser.$('[data-testid="git-branch-value"]').getText();
  return normalizeBranchText(text);
}

/** Adds a remote through the UI and waits for the success banner. */
async function addRemoteThroughUi(name: string, url: string): Promise<void> {
  await reactSetValue("git-remote-name-input", name);
  await reactSetValue("git-remote-url-input", url);
  await clickWhenEnabled("git-remote-add-btn");
  await browser.$('[data-testid="git-remote-add-success"]').waitForDisplayed({
    timeout: 10_000,
    timeoutMsg: `git-remote-add-success never appeared after adding remote "${name}"`,
  });
}

describe("Rack Inventory Studio — local Git workflows", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("validates a clean-enough repository and commits an uncommitted change", async () => {
    log("creating a fixture with an initial commit plus an uncommitted change (dirty)");
    const repo = await createLocalGitRepository({
      initialized: true,
      initialCommit: true,
      dirty: true,
      label: "validate-commit",
    });
    const headBefore = await getHeadCommit(repo.path);
    const countBefore = await getCommitCount(repo.path);
    expect(countBefore).toBe(1);
    expect(await getWorkingTreeStatus(repo.path)).toBe("dirty");
    log(`fixture at ${repo.path}, headBefore=${headBefore}`);

    let opened = false;
    try {
      log("opening the fixture by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log("running Validate");
      await clickWhenEnabled("git-validate-btn");
      log("waiting for the commit input to become enabled (validation passed with 0 errors)");
      await browser.waitUntil(
        async () => {
          const el = browser.$('[data-testid="git-commit-message-input"]');
          return (await el.isExisting()) && (await el.isEnabled());
        },
        {
          timeout: 15_000,
          timeoutMsg: "git-commit-message-input never became enabled after Validate — validation may not have completed successfully",
        },
      );
      log("confirmed — validate completed successfully and the commit step unblocked");

      log("entering a commit message and committing");
      await reactSetValue("git-commit-message-input", "WDIO Stage 3F.1B test commit");
      await clickWhenEnabled("git-commit-btn");

      log("waiting for the commit form to disappear (nothing left to commit)");
      await browser
        .$('[data-testid="git-commit-message-input"]')
        .waitForExist({ timeout: 15_000, reverse: true, timeoutMsg: "commit form never disappeared after committing" });
      log("commit form gone — UI reports a clean working tree");

      const statusAfter = await getWorkingTreeStatus(repo.path);
      const headAfter = await getHeadCommit(repo.path);
      const countAfter = await getCommitCount(repo.path);
      expect(statusAfter).toBe("clean");
      expect(headAfter).not.toBe(headBefore);
      expect(countAfter).toBe(countBefore + 1);
      log(`confirmed via helpers — status=${statusAfter}, HEAD ${headBefore} -> ${headAfter}, commitCount ${countBefore} -> ${countAfter}`);

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await repo.cleanup();
    }
  });

  it("adds a remote with a fake URL without contacting it", async () => {
    log("creating a fixture with an initial commit");
    const repo = await createLocalGitRepository({ initialized: true, initialCommit: true, label: "add-remote" });

    let opened = false;
    try {
      log("opening the fixture by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log(`adding remote "origin" -> ${FAKE_REMOTE_URL}`);
      await addRemoteThroughUi("origin", FAKE_REMOTE_URL);
      log("git-remote-add-success shown — UI reports the remote was added");

      const remoteUrl = await getRemoteUrl(repo.path, "origin");
      expect(remoteUrl).toBe(FAKE_REMOTE_URL);
      log(`confirmed via helper — .git/config now has origin = ${remoteUrl}`);

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await repo.cleanup();
    }
  });

  it("surfaces errors for push and pull against an unreachable remote, leaving the repository usable and unchanged", async () => {
    log("creating a fixture with an initial commit");
    const repo = await createLocalGitRepository({ initialized: true, initialCommit: true, label: "push-pull-error" });
    const headBefore = await getHeadCommit(repo.path);
    const countBefore = await getCommitCount(repo.path);
    const branchBefore = await getCurrentBranch(repo.path);

    let opened = false;
    try {
      log("opening the fixture by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log(`adding an unreachable remote -> ${FAKE_REMOTE_URL}`);
      await addRemoteThroughUi("origin", FAKE_REMOTE_URL);

      // ── Push against an unreachable remote ────────────────────────────────
      log("clicking git-stepper-push-btn");
      await clickWhenEnabled("git-stepper-push-btn");
      log("waiting for git-push-error");
      await browser.$('[data-testid="git-push-error"]').waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "git-push-error never appeared after pushing to an unreachable remote",
      });
      log("confirmed — push against the unreachable remote surfaced an error");

      let displayedBranch = await getDisplayedBranch();
      expect(displayedBranch).toBe(normalizeBranchText(branchBefore));
      expect(await getHeadCommit(repo.path)).toBe(headBefore);
      expect(await getCommitCount(repo.path)).toBe(countBefore);
      log("confirmed via helpers — repository state unchanged after the failed push, UI still responsive");

      // ── Pull against the same unreachable remote ──────────────────────────
      log("clicking git-stepper-pull-btn");
      await clickWhenEnabled("git-stepper-pull-btn");
      log("waiting for git-pull-error");
      await browser.$('[data-testid="git-pull-error"]').waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "git-pull-error never appeared after pulling from an unreachable remote",
      });
      log("confirmed — pull against the unreachable remote surfaced an error");

      displayedBranch = await getDisplayedBranch();
      expect(displayedBranch).toBe(normalizeBranchText(branchBefore));
      expect(await getHeadCommit(repo.path)).toBe(headBefore);
      expect(await getCommitCount(repo.path)).toBe(countBefore);
      log("confirmed via helpers — repository state still unchanged after the failed pull");

      // Application remains usable: the ordinary close flow still works.
      await closeRepository();
      opened = false;
      log("confirmed — repository closed normally after both failures");
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await repo.cleanup();
    }
  });
});
