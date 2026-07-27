/**
 * Local Git detection & init workflow (Stage 3F.1A).
 *
 * Covers the `GitSection`'s "not tracked by Git" state, the "Initialize
 * Git repository" action, and that detection persists correctly across a
 * close/reopen cycle — the first real Git *workflow* coverage in the
 * program (Stage 3F.0/3F.0.5 were audit and infrastructure only).
 *
 * Fixture repositories are built exclusively via
 * `createLocalGitRepository` (support/local-git.ts, Stage 3F.0.5) —
 * never through the app's own "Create repository" wizard, because
 * `create_repository_cmd` always runs `git init` itself (confirmed by
 * reading apps/desktop/src-tauri/src/commands/repository.rs and by
 * repository-lifecycle.e2e.ts's own `.git` assertion right after create).
 * Only the "Open by path" flow can present the app with a RackInventoryStudio
 * directory that genuinely has no `.git` yet, which is what this spec's
 * first two parts need. `open_repository_cmd` (same file) never runs git
 * init as a side effect, confirmed by reading it directly.
 *
 *   PART A — Repository with no Git: open a `createLocalGitRepository({
 *             initialized: false })` fixture; the app must show the
 *             "not tracked by Git" state (`git-not-initialized`), not the
 *             Git-detected sidebar.
 *   PART B — Init: click `git-init-btn`; `.git` must exist on disk
 *             (verified via `isGitRepository`, not a raw fs check, per
 *             this stage's helper-reuse instruction); the app must switch
 *             to the Git-detected sidebar with a real branch name
 *             (`git-branch-value`) — i.e. status was refreshed after init.
 *   PART C — Reopen: close the repository and reopen it by the same path;
 *             Git detection (`git-branch-value`, matching
 *             `getCurrentBranch`) must still hold — detection isn't a
 *             one-time artifact of the init click.
 *
 * A second `it()` covers the idempotency case required by the stage: a
 * repository that already has Git before it is ever opened must show the
 * Git-detected sidebar immediately — the "not tracked by Git" state and
 * `git-init-btn` must never appear. This describes the application's
 * actual current behavior (the init affordance is only rendered while
 * `gitStatus.is_repository` is false) rather than exercising any
 * dedicated "re-init" product behavior, which does not exist.
 *
 * Selector contract: `git-not-initialized`, `git-init-btn`,
 * `git-branch-value` (new — this stage), plus pre-existing
 * `repository-landing-title`, `repository-open-path-input`,
 * `repository-open-path-submit`, `repository-active-root`,
 * `repository-close-action`, `repository-active-path`.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { browser, expect } from "@wdio/globals";
import { reactSetValue, clickWhenEnabled, expectActiveRepositoryPath } from "../support/repository-ui";
import { createLocalGitRepository, isGitRepository, getCurrentBranch } from "../support/local-git";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[git-detect-init ${ts}] ${msg}`);
}

/** Fills and submits the landing screen's "Open by path" field, then waits
 * for the repository to open. Spec-local — not promoted to a shared
 * helper, per this stage's "don't add helpers ahead of need" instruction. */
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

describe("Rack Inventory Studio — local Git detection and init", () => {
  before(() => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }
  });

  it("detects a missing Git repository, initializes it, and detection persists across reopen", async () => {
    log("creating a RackInventoryStudio fixture with no Git (initialized: false)");
    const repo = await createLocalGitRepository({ initialized: false, label: "detect-init" });
    log(`fixture created at ${repo.path}`);
    expect(repo.initialized).toBe(false);
    expect(await isGitRepository(repo.path)).toBe(false);

    try {
      // ── PART A: open a non-Git RackInventoryStudio directory ──────────────
      log("part A: opening the fixture by path");
      await openRepositoryByPath(repo.path);
      log("part A: opened — waiting for the not-tracked-by-Git state");
      await browser.$('[data-testid="git-not-initialized"]').waitForDisplayed({
        timeout: 15_000,
        timeoutMsg: "git-not-initialized never appeared for a repository with no .git",
      });
      // The Git-detected sidebar's own marker must not be present at the same time.
      const branchValueVisibleBeforeInit = await browser.$('[data-testid="git-branch-value"]').isExisting();
      expect(branchValueVisibleBeforeInit).toBe(false);
      log("part A: confirmed — app correctly shows no Git detected");

      // ── PART B: initialize Git through the UI ─────────────────────────────
      log("part B: clicking git-init-btn");
      await clickWhenEnabled("git-init-btn");
      log("part B: waiting for git-branch-value (status refreshed post-init)");
      await browser.$('[data-testid="git-branch-value"]').waitForDisplayed({
        timeout: 15_000,
        timeoutMsg: "git-branch-value never appeared after clicking git-init-btn",
      });
      await browser
        .$('[data-testid="git-not-initialized"]')
        .waitForDisplayed({ timeout: 5_000, reverse: true });
      log("part B: app now shows the Git-detected sidebar");

      expect(await isGitRepository(repo.path)).toBe(true);
      expect(existsSync(join(repo.path, ".git"))).toBe(true);
      const branchAfterInit = await getCurrentBranch(repo.path);
      expect(branchAfterInit.length).toBeGreaterThan(0);
      log(`part B: confirmed — .git exists on disk, current branch is "${branchAfterInit}"`);

      // ── PART C: close and reopen — detection must persist ─────────────────
      log("part C: closing the repository");
      await closeRepository();
      log("part C: reopening the same repository by path");
      await openRepositoryByPath(repo.path);
      log("part C: waiting for git-branch-value again after reopen");
      await browser.$('[data-testid="git-branch-value"]').waitForDisplayed({
        timeout: 15_000,
        timeoutMsg: "git-branch-value did not reappear after reopening an initialized repository",
      });
      const notInitializedStillGone = await browser.$('[data-testid="git-not-initialized"]').isExisting();
      expect(notInitializedStillGone).toBe(false);
      log("part C: confirmed — Git detection persists across close/reopen");

      await closeRepository();
    } finally {
      await repo.cleanup();
    }
  });

  it("shows the Git-detected sidebar immediately for a repository that already has Git — no re-init affordance", async () => {
    log("creating a RackInventoryStudio fixture that already has Git (initialized: true)");
    const repo = await createLocalGitRepository({ initialized: true, label: "already-git" });
    expect(await isGitRepository(repo.path)).toBe(true);

    try {
      log("opening the already-initialized fixture by path");
      await openRepositoryByPath(repo.path);

      log("waiting for git-branch-value to appear directly, with no not-initialized state ever shown");
      await browser.$('[data-testid="git-branch-value"]').waitForDisplayed({
        timeout: 15_000,
        timeoutMsg: "git-branch-value never appeared for an already-initialized repository",
      });
      const notInitializedShown = await browser.$('[data-testid="git-not-initialized"]').isExisting();
      const initBtnShown = await browser.$('[data-testid="git-init-btn"]').isExisting();
      expect(notInitializedShown).toBe(false);
      expect(initBtnShown).toBe(false);
      log("confirmed — the app never offers re-init for a repository that already has Git");

      await closeRepository();
    } finally {
      await repo.cleanup();
    }
  });
});
