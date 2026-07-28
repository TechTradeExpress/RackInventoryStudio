/**
 * Diverged pull over SSH — "--ff-only" failure and safe recovery
 * (Stage 3F.4).
 *
 * Stage 3F.2 covered the successful fast-forward pull. This spec covers
 * the other side: what happens when the local branch has a commit the
 * remote does not, and the remote has a commit the local branch does not
 * — a genuinely diverged history that `git pull --ff-only` (the only pull
 * mode the application ever runs — `pull_ff_only_with_env`,
 * crates/ris-git/src/lib.rs) must refuse. The application does not
 * implement merge, rebase, or conflict resolution; this spec proves it
 * fails *safely* — the pull is rejected, nothing is silently merged or
 * rewritten, and every piece of repository state (both commits, working
 * tree, branch, upstream, remote URL) survives untouched, including
 * across a close/reopen cycle.
 *
 * ── File location audit ──────────────────────────────────────────────────────
 *
 * Considered extending git-remote-workflows.e2e.ts (Stage 3F.2) instead of
 * a new file. Rejected: every prior Stage 3F sub-stage — 3F.1A, 3F.1B,
 * 3F.2, 3F.3 — got its own dedicated spec file, including Stage 3F.3
 * (clone), which is thematically at least as close to 3F.2's push/pull as
 * this stage's diverged-pull scenario is, and was still given its own
 * file (git-clone-workflows.e2e.ts) rather than folded into
 * git-remote-workflows.e2e.ts. One-file-per-stage is this program's
 * established convention, not a special case; a new file
 * (git-diverged-pull.e2e.ts, the NSP's own suggested name) follows it.
 *
 * ── Pre-implementation audit — the pull path ─────────────────────────────────
 *
 * - Frontend (`RepositoryPanel.tsx`'s `handlePull`): clears
 *   push/pull error+success state, calls `pullGitFfOnly(selectedRemote)`.
 *   On success: `setPullSuccess`, `onPullSuccess`, and bumps `refreshKey`
 *   (triggers a fresh `get_git_status`/`getGitLog`/`listGitRemotes`
 *   fetch). **On failure: `setPullError` only — `refreshKey` is NOT
 *   bumped.** Confirmed by reading the `catch` block directly: the
 *   displayed `gitStatus` (branch/upstream/ahead/behind) is therefore
 *   whatever was last fetched *before* the failed pull, not a fresh read
 *   — a failed pull does not trigger a status refresh.
 * - `pull_git_ff_only` (Tauri command, `commands/git.rs`): async,
 *   `spawn_blocking`s `ris_git::pull_ff_only_with_env`. On error, builds
 *   the message via `ssh_error_message`, which only special-cases SSH
 *   *authentication* failures (`classify_git_ssh_error`) — a
 *   non-fast-forward failure isn't one, so it falls through to the raw
 *   `GitError::CommandFailed` display (git's own stderr, redacted for
 *   credentials). No product-level "diverged" wording exists anywhere in
 *   this path — confirmed by reading `classify_git_ssh_error` and
 *   `ssh_error_message` in full. This is why this spec asserts on the
 *   stable `git-pull-error` *selector*, not on any particular message
 *   text (git's own wording — "Not possible to fast-forward, aborting."
 *   at the time of writing — varies by version/locale and is not a
 *   product-owned string).
 * - `pull_ff_only_with_env` (`crates/ris-git/src/lib.rs`): checks
 *   `status(repo_path)` first and refuses with `DirtyWorkingTree` if the
 *   tree isn't clean — irrelevant here, the fixture's local commit is
 *   fully committed, not left dirty. Otherwise runs exactly
 *   `git pull --ff-only <remote> <branch>` (plus `TRANSPORT_SAFETY`/
 *   askpass `-c` flags) — confirmed unchanged since the Stage 3F.2 audit.
 * - **Answering the audit's specific questions:**
 *   1. `git-pull-error` is sufficient — it is the only rendered signal on
 *      failure (see above); this spec asserts it appears alongside full
 *      state verification, not in place of it.
 *   2. No existing text distinguishes divergence from any other pull
 *      failure — confirmed above.
 *   3. The app does **not** refresh Git status after a failed pull — this
 *      is why this spec checks `git-branch-value`/`git-upstream-value`
 *      immediately after the failure (safe: neither branch nor upstream
 *      config ever changes in this scenario, on disk or in the stale
 *      cached display, so asserting them here is meaningful, not
 *      coincidentally-stale) but relies on the close/reopen step for a
 *      *fresh* status read.
 *   4. The Pull button remains clickable after a failed attempt — for the
 *      same reason as (3): `getPullDisabledReason` (gitStatusHelpers.ts)
 *      only blocks on the *cached* `ahead`/`behind`, which never updates
 *      to reflect the divergence within this test (no refresh happens),
 *      so it never computes a "diverged" block. Not asserted directly —
 *      the NSP's checklist doesn't require it, and asserting incidental
 *      cache-staleness behavior as if it were a deliberate "retry" design
 *      would overstate what was verified.
 *   5. Close/reopen works with no application restart — confirmed by
 *      reading `handleCloneSuccess`/App.tsx's close handler; reopening
 *      remounts with a fresh `repoPath`, which *does* trigger a new
 *      `get_git_status` fetch (the `useEffect` depends on `repoPath`) —
 *      this is where a fresh, non-stale ahead/behind read would occur if
 *      this spec needed one, though it doesn't (see Scenario, step 13).
 *
 * ── Prototype validation (before writing this spec) ──────────────────────────
 *
 * Reproduced the entire scenario standalone with plain `git` first: local
 * commit B (child of A) never pushed; a scratch clone/commit/push of the
 * bare remote produces commit C (also a child of A, independent of B); a
 * bare `git fetch <bare-path> <branch>` with **no destination refspec**
 * brings C's object into the local repo's object database without
 * touching `refs/remotes/origin/<branch>` (confirmed unchanged
 * before/after); `git merge-base --is-ancestor` both directions exits 1
 * (neither is an ancestor of the other); `git pull --ff-only` then exits
 * 128 with "fatal: Not possible to fast-forward, aborting.", leaving
 * local HEAD at B and (per `git status --branch`) the *real* fetch inside
 * `pull` updates `refs/remotes/origin/<branch>` to C as a side effect
 * (unlike the harmless probe fetch above) — `[ahead 1, behind 1]`.
 *
 * ── Helpers reused (no new fixture/remote infrastructure) ────────────────────
 *
 * `findSshd`, `startRemote`, `configureSsh`, `createBareRemote`,
 * `buildSshRemoteUrl`, `pushSimulatedRemoteCommit`, `getRemoteHeadCommit`,
 * `getRemoteCommitCount`, `cleanup` (support/git-remote.ts, Stage 3F.2,
 * unmodified); `createLocalGitRepository`, `getCurrentBranch`,
 * `getHeadCommit`, `getCommitCount`, `getWorkingTreeStatus`,
 * `getRemoteUrl`, `readGitConfig`, `runGit` (support/local-git.ts);
 * `reactSetValue`, `clickWhenEnabled`, `expectActiveRepositoryPath`
 * (support/repository-ui.ts).
 *
 * One addition: `isAncestor()` in support/local-git.ts — a generic
 * `git merge-base --is-ancestor` wrapper, not present anywhere before this
 * stage (audited first). Needed to prove genuine divergence through Git
 * itself (NSP's own explicit instruction) rather than inferring it from
 * `git-pull-error` text. Covered by its own unit test in
 * local-git.test.ts (linear-history true case, diverged-history false
 * case both directions).
 *
 * Local commit "B" is created test-side (a plain `runGit` add+commit on
 * the already-open fixture's directory, writing a file outside
 * `inventory/` so the RIS loader ignores it — the same pattern
 * `pushSimulatedRemoteCommit` already uses for "C"), not via the
 * application's Validate+Commit UI flow. Documented reasoning, per this
 * stage's own instruction to justify that choice: Stage 3F.1B already
 * covers Validate+Commit through the UI in full (commit message entry,
 * HEAD/commit-count/clean-tree cross-checks) — repeating it here would be
 * duplicative of already-covered ground for no new Git-workflow value. It
 * would also require making a *new* in-app data change first (this
 * fixture starts clean after its initial push, unlike 3F.1B's
 * pre-dirtied fixture), which means touching an unrelated entity-creation
 * UI just to manufacture a commit — broadening this spec's dependencies
 * and fragility for a scenario whose actual subject is the pull failure,
 * not commit creation. A plain filesystem commit is exactly how a user
 * editing outside the app (or a teammate's tooling) would also produce
 * one, which is a realistic input to a diverged-pull scenario in its own
 * right.
 *
 * ── Explicitly out of scope (this stage's NSP) ────────────────────────────────
 *
 * Automatic merge, merge conflict resolution, rebase, reset, force pull,
 * discard-local-changes actions, branch switching/creation, stash,
 * fetch-only workflow, multiple remotes, HTTPS, SSH passphrase prompt,
 * clone, tags, submodules, detached HEAD, force push, and any change to
 * the application's Git strategy (--ff-only stays exactly as it is).
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { browser, expect } from "@wdio/globals";
import { reactSetValue, clickWhenEnabled, expectActiveRepositoryPath } from "../support/repository-ui";
import {
  createLocalGitRepository,
  getCommitCount,
  getCurrentBranch,
  getHeadCommit,
  getRemoteUrl,
  getWorkingTreeStatus,
  isAncestor,
  readGitConfig,
  runGit,
} from "../support/local-git";
import {
  buildSshRemoteUrl,
  cleanup as cleanupRemoteServer,
  configureSsh,
  createBareRemote,
  findSshd,
  getRemoteCommitCount,
  getRemoteHeadCommit,
  pushSimulatedRemoteCommit,
  startRemote,
  type SshRemoteServer,
} from "../support/git-remote";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[git-diverged-pull ${ts}] ${msg}`);
}

/** Duplicated from the other Git specs rather than shared — same
 * spec-local convention this program has used since Stage 3F.1B. */
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

async function closeRepositorySafely(): Promise<void> {
  try {
    await closeRepository();
  } catch (e) {
    log(`WARNING: best-effort close in finally failed (continuing to cleanup): ${e instanceof Error ? e.message : String(e)}`);
  }
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

async function getDisplayedBranch(): Promise<string> {
  const text = await browser.$('[data-testid="git-branch-value"]').getText();
  return normalizeText(text);
}

async function getDisplayedUpstream(): Promise<string | null> {
  const el = browser.$('[data-testid="git-upstream-value"]');
  if (!(await el.isExisting())) return null;
  return normalizeText(await el.getText());
}

async function addRemoteThroughUi(name: string, url: string): Promise<void> {
  await reactSetValue("git-remote-name-input", name);
  await reactSetValue("git-remote-url-input", url);
  await clickWhenEnabled("git-remote-add-btn");
  await browser.$('[data-testid="git-remote-add-success"]').waitForDisplayed({
    timeout: 10_000,
    timeoutMsg: `git-remote-add-success never appeared after adding remote "${name}"`,
  });
}

describe("Rack Inventory Studio — diverged pull over SSH ('--ff-only' failure and recovery)", () => {
  let server: SshRemoteServer;

  before(async () => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const sshdPath = await findSshd();
    if (!sshdPath) {
      // Hard failure, not a skip — same policy as git-remote-workflows.e2e.ts
      // and git-clone-workflows.e2e.ts: this spec's entire purpose is SSH
      // remote coverage, so a quiet skip would let a run report green while
      // testing nothing.
      throw new Error(
        "sshd was not found (checked PATH and /usr/sbin, /sbin, /usr/local/sbin) — " +
          "required to run git-diverged-pull. Install OpenSSH server " +
          "(e.g. `sudo apt-get install -y openssh-server` on Linux) before running this spec.",
      );
    }

    log("starting the local sshd remote-Git fixture (Stage 3F.2 infrastructure, unmodified)");
    server = await startRemote();
    configureSsh(server);
    log(`fixture ready: 127.0.0.1:${server.port}, username=${server.username}`);
  });

  after(async () => {
    if (server) await cleanupRemoteServer(server);
  });

  it("fails a diverged pull safely, preserving both histories, working tree, and remote configuration", async () => {
    log("creating a fixture with initial commit A");
    const repo = await createLocalGitRepository({ initialCommit: true, label: "diverged-pull" });
    const aSha = await getHeadCommit(repo.path);
    const bareDir = await createBareRemote(server.remotesParent, "diverged");
    const remoteUrl = buildSshRemoteUrl(server, bareDir);

    let opened = false;
    try {
      log("opening the fixture by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log(`adding remote "origin" -> ${remoteUrl}`);
      await addRemoteThroughUi("origin", remoteUrl);
      const branch = await getCurrentBranch(repo.path);

      log("pushing A through the app to establish upstream tracking");
      await clickWhenEnabled("git-stepper-push-btn");
      await browser.waitUntil(
        async () => (await getRemoteCommitCount(bareDir, branch).catch(() => 0)) === 1,
        { timeout: 20_000, interval: 200, timeoutMsg: "initial push of A never landed on the remote" },
      );
      expect(await readGitConfig(repo.path, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(repo.path, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      log(`recorded: A=${aSha}, branch=${branch}, remote=${remoteUrl}, upstream configured`);

      log("creating local-only commit B (test-side — see module doc comment for why)");
      writeFileSync(join(repo.path, "local-only-change.txt"), "B\n");
      await runGit(repo.path, ["add", "-A"]);
      await runGit(repo.path, ["commit", "-q", "-m", "Local-only commit B"]);
      const bSha = await getHeadCommit(repo.path);
      expect(bSha).not.toBe(aSha);

      log("creating remote-only commit C, independent of B (child of A, never pushed to B)");
      const cSha = await pushSimulatedRemoteCommit(
        bareDir,
        server.remotesParent,
        branch,
        "remote-only-change.txt",
        "Remote-only commit C",
      );
      expect(cSha).not.toBe(aSha);
      expect(cSha).not.toBe(bSha);
      log(`B=${bSha}, C=${cSha}`);

      log("confirming genuine divergence before clicking Pull (helper-level, not inferred from error text)");
      // Brings C's commit object into the local repo's object database
      // without touching refs/remotes/origin/<branch> — a harmless probe,
      // confirmed standalone (see module doc comment) not to disturb
      // anything the app's own real pull later does.
      await runGit(repo.path, ["fetch", "-q", bareDir, branch]);
      expect(await isAncestor(repo.path, bSha, cSha)).toBe(false);
      expect(await isAncestor(repo.path, cSha, bSha)).toBe(false);
      expect(await getHeadCommit(repo.path)).toBe(bSha);
      expect(await getRemoteHeadCommit(bareDir, branch)).toBe(cSha);
      expect(await getCommitCount(repo.path)).toBe(2); // A, B
      expect(await getRemoteCommitCount(bareDir, branch)).toBe(2); // A, C
      log("confirmed — neither commit is an ancestor of the other; local=B, remote=C, both 2 commits deep");

      log("clicking git-stepper-pull-btn (expected to fail — --ff-only cannot reconcile a diverged history)");
      await clickWhenEnabled("git-stepper-pull-btn");

      await browser.$('[data-testid="git-pull-error"]').waitForDisplayed({
        timeout: 30_000,
        timeoutMsg: "git-pull-error never appeared after pulling a diverged branch",
      });
      log("confirmed — pull was rejected and git-pull-error rendered");

      log("verifying every piece of repository state survived the failed pull, via helpers");
      expect(await getHeadCommit(repo.path)).toBe(bSha);
      expect(await getRemoteHeadCommit(bareDir, branch)).toBe(cSha);
      expect(await getCommitCount(repo.path)).toBe(2);
      expect(await getRemoteCommitCount(bareDir, branch)).toBe(2);
      expect(await getWorkingTreeStatus(repo.path)).toBe("clean");
      expect(existsSync(join(repo.path, ".git", "MERGE_HEAD"))).toBe(false);
      expect(await getCurrentBranch(repo.path)).toBe(branch);
      expect(await readGitConfig(repo.path, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(repo.path, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      expect(await getRemoteUrl(repo.path, "origin")).toBe(remoteUrl);
      log("confirmed via helpers — local HEAD=B, remote HEAD=C, no merge commit, clean tree, no MERGE_HEAD, branch/upstream/remote intact");

      log("verifying branch and upstream are still displayed correctly in the UI");
      expect(await getDisplayedBranch()).toBe(normalizeText(branch));
      expect(await getDisplayedUpstream()).toBe(`origin/${branch}`);
      log("confirmed via UI — no regression in the (still-cached, but still-correct) displayed status");

      log("closing the repository after the failed pull");
      await closeRepository();
      opened = false;

      log("reopening the same repository by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log("verifying state again after a fresh open (fresh git-status fetch, not the stale pre-pull cache)");
      expect(await getHeadCommit(repo.path)).toBe(bSha);
      expect(await getDisplayedBranch()).toBe(normalizeText(branch));
      await browser.waitUntil(
        async () => (await getDisplayedUpstream()) === `origin/${branch}`,
        { timeout: 10_000, timeoutMsg: `git-upstream-value never showed "origin/${branch}" after reopen` },
      );
      expect(await readGitConfig(repo.path, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(repo.path, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      expect(await getRemoteUrl(repo.path, "origin")).toBe(remoteUrl);
      log("confirmed — detection, branch, upstream, and remote configuration all survived close/reopen; app remains usable");

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await repo.cleanup();
    }
  });
});
