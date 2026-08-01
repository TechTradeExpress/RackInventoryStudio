/**
 * Git clone over SSH — successful clone workflows (Stage 3F.3).
 *
 * Builds directly on Stage 3F.2's infrastructure (`support/git-remote.ts`,
 * `support/ssh-wrapper.sh`, the `GIT_SSH_COMMAND` registration in
 * `wdio.conf.ts`) with no redesign — see "Audit findings" below for what
 * was checked and confirmed unchanged. Covers successful clone only: an
 * RIS-scaffold-only repository, a repository with multiple commits, and
 * clone state surviving close/reopen.
 *
 * ── "Empty repository" (this stage's NSP wording) ────────────────────────────
 *
 * Interpreted as *no inventory data* — the minimal valid RIS scaffold
 * (repo.yaml, locations.yaml with `locations: []`, four empty
 * racks/device-models/devices/placements directories) committed once, not
 * a Git repository with zero commits. A genuinely empty bare repo (no
 * refs at all) cannot be opened successfully: `open_repository` requires
 * `inventory/repo.yaml` to exist and fails hard without it (confirmed by
 * reading crates/ris-repository/src/loader.rs before implementing this
 * scenario), so "clone succeeds and the repository opens correctly" — the
 * NSP's own verification requirement for Scenario 1 — is only reachable
 * with at least the scaffold commit in place. Noted explicitly here so
 * this scenario's coverage is not overstated as "clones a zero-commit
 * repository", which it does not.
 *
 * ── Audit findings (pre-implementation) ──────────────────────────────────────
 *
 * - `clone_repository_cmd` (apps/desktop/src-tauri/src/commands/repository.rs)
 *   is unchanged since the Stage 3F.0/3F.2 audits: a plain, synchronous
 *   command that validates `destination` is empty/absent, calls the plain
 *   `ris_git::clone()` (no askpass wiring — still a known, pre-existing gap
 *   for a passphrase-protected key, irrelevant here since this stage's key
 *   has none), then opens the cloned directory via the same `open_repository`
 *   path `open_repository_cmd`/`create_repository_cmd` use, and returns the
 *   same `OpenRepositoryResultDto` create/open both return.
 * - `ris_git::clone()` (crates/ris-git/src/lib.rs) is unchanged: validates
 *   the URL via `validate_remote_url` (same SCP-like acceptance already
 *   proven for push/pull in Stage 3F.2), then runs `git clone` via
 *   `run_git_global`, a plain `Command::new("git")` with no explicit env
 *   manipulation — meaning it inherits the app process's ambient
 *   environment, including the `GIT_SSH_COMMAND` wdio.conf.ts registers.
 *   Confirmed nothing new is required for the fixture to reach clone.
 * - `CloneRepositoryForm.tsx` already exposes every selector this stage
 *   needs — `clone-form`, `clone-url`, `clone-parent`, `clone-browse`,
 *   `clone-dirname`, `clone-preview`, `clone-submit`, plus `clone-url-error`/
 *   `clone-parent-error`/`clone-dirname-error`/`clone-error` — confirmed by
 *   reading the component; no new selectors added this stage.
 * - The form always renders on the landing screen (RepositoryPanel.tsx,
 *   alongside "Open by path" and "Create new repository") — no separate
 *   navigation step needed to reach it.
 * - Clone success (`App.tsx`'s `handleCloneSuccess`) transitions the app
 *   exactly like open/create success — `repository-active-root`/
 *   `repository-active-path` appear the same way `openRepositoryByPath`
 *   already relies on in the other Git specs, confirmed by reading
 *   `handleCloneSuccess` alongside `handleOpenSuccess`/`handleCreateSuccess`.
 * - `git clone` itself already configures `origin` + upstream tracking for
 *   the checked-out branch as a side effect (confirmed with a standalone
 *   `git clone` against a local bare repo before writing this spec) — no
 *   extra push-to-establish-upstream step is needed here, unlike Stage
 *   3F.2's push/pull scenarios which started from an empty remote.
 * - No drift in `support/git-remote.ts` or `ssh-wrapper.sh` since Stage
 *   3F.2 (git status/log confirm both are unchanged since their original
 *   commit) — reused here without modification, per this stage's own
 *   instruction, plus one small addition: `seedBareRemoteFromLocalRepo()`,
 *   needed because this stage's remotes must already contain content
 *   *before* the app clones them (Stage 3F.2's scenarios always started
 *   from an empty remote and populated it *through* the app instead).
 *
 * ── Infrastructure reuse ──────────────────────────────────────────────────────
 *
 * Reused unmodified: `findSshd`, `startRemote`, `configureSsh`,
 * `createBareRemote`, `buildSshRemoteUrl`, `getRemoteHeadCommit`,
 * `getRemoteCommitCount`, `pushSimulatedRemoteCommit`, `cleanup` (all
 * support/git-remote.ts), `createLocalGitRepository`, `getCurrentBranch`,
 * `getHeadCommit`, `getCommitCount`, `getWorkingTreeStatus`, `getRemoteUrl`,
 * `readGitConfig` (all support/local-git.ts), `reactSetValue`,
 * `clickWhenEnabled`, `expectActiveRepositoryPath` (support/repository-ui.ts).
 * One addition to the existing git-remote.ts module (not a new parallel
 * module): `seedBareRemoteFromLocalRepo()` — see its own doc comment.
 *
 * `sshd` is a required prerequisite for this spec, exactly like
 * git-remote-workflows.e2e.ts (Stage 3F.2's RP) — `before()` throws rather
 * than skips when it cannot be found, for the same reason: this spec's
 * entire purpose is SSH remote coverage, so a quiet skip would let a run
 * report green while cloning nothing.
 *
 * ── Explicitly out of scope (this stage's NSP) ────────────────────────────────
 *
 * SSH passphrase workflow, HTTPS clone, authentication failures, merge
 * conflicts, branch switching, fetch, pull, push, tags, submodules,
 * multiple remotes, shallow clone, detached HEAD, clone cancellation,
 * clone progress, clone retries.
 */
import { existsSync } from "node:fs";
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
  readGitConfig,
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
  seedBareRemoteFromLocalRepo,
  startRemote,
  type SshRemoteServer,
} from "../support/git-remote";

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[git-clone-workflows ${ts}] ${msg}`);
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
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

/** Fills and submits CloneRepositoryForm, then waits for the app to
 * transition to the opened-repository view (mirrors openRepositoryByPath's
 * shape — clone success is the same OpenRepositoryResultDto transition as
 * open/create, see this file's "Audit findings"). */
async function cloneRepositoryThroughUi(
  url: string,
  parentPath: string,
  dirName: string,
  destination: string,
): Promise<void> {
  await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
  await reactSetValue("clone-url", url);
  await reactSetValue("clone-parent", parentPath);
  await reactSetValue("clone-dirname", dirName);
  await clickWhenEnabled("clone-submit");
  await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
  await expectActiveRepositoryPath(destination);
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

describe("Rack Inventory Studio — Git clone workflows (SSH)", () => {
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
      // Hard failure, not a skip — see this file's module doc comment
      // (mirrors Stage 3F.2's RP for git-remote-workflows.e2e.ts).
      throw new Error(
        "sshd was not found (checked PATH and /usr/sbin, /sbin, /usr/local/sbin) — " +
          "required to run git-clone-workflows. Install OpenSSH server " +
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

  it("clones a repository containing only the RIS scaffold (no inventory data) over SSH", async () => {
    log("seeding a bare remote with a scaffold-only commit");
    const seedRepo = await createLocalGitRepository({ initialCommit: true, label: "clone-empty-seed" });
    const bareDir = await createBareRemote(server.remotesParent, "scenario1");
    const branch = await getCurrentBranch(seedRepo.path);
    await seedBareRemoteFromLocalRepo(seedRepo.path, bareDir, branch);
    const remoteUrl = buildSshRemoteUrl(server, bareDir);
    log(`bare remote seeded at ${bareDir}, url=${remoteUrl}`);

    const parentPath = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    const dirName = `clone-empty-${uniqueSuffix()}`;
    const destination = join(parentPath, dirName);

    let opened = false;
    try {
      log("cloning through the UI (SSH authentication over the key with no passphrase)");
      await cloneRepositoryThroughUi(remoteUrl, parentPath, dirName, destination);
      opened = true;

      expect(await browser.$('[data-testid="clone-error"]').isExisting()).toBe(false);
      log("confirmed — repository opened correctly, no clone-error rendered");

      expect(await getDisplayedBranch()).toBe(normalizeText(branch));
      await browser.waitUntil(
        async () => (await getDisplayedUpstream()) === `origin/${branch}`,
        { timeout: 10_000, timeoutMsg: `git-upstream-value never showed "origin/${branch}"` },
      );
      log("confirmed via UI — branch displayed correctly and remote/upstream configured");

      expect(await getCommitCount(destination)).toBe(1);
      expect(await getWorkingTreeStatus(destination)).toBe("clean");
      expect(await getHeadCommit(destination)).toBe(await getRemoteHeadCommit(bareDir, branch));
      expect(await readGitConfig(destination, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(destination, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      expect(await getRemoteUrl(destination, "origin")).toBe(remoteUrl);
      log("confirmed via helpers — HEAD matches remote, clean tree, upstream and remote configured");

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await seedRepo.cleanup();
    }
  });

  it("clones a repository with multiple commits over SSH", async () => {
    log("seeding a bare remote with an initial commit, then simulating a second");
    const seedRepo = await createLocalGitRepository({ initialCommit: true, label: "clone-commits-seed" });
    const bareDir = await createBareRemote(server.remotesParent, "scenario2");
    const branch = await getCurrentBranch(seedRepo.path);
    await seedBareRemoteFromLocalRepo(seedRepo.path, bareDir, branch);

    const secondSha = await pushSimulatedRemoteCommit(
      bareDir,
      server.remotesParent,
      branch,
      "second-commit.txt",
      "Second commit",
    );
    expect(await getRemoteCommitCount(bareDir, branch)).toBe(2);
    log(`remote now has 2 commits, HEAD=${secondSha}`);

    const remoteUrl = buildSshRemoteUrl(server, bareDir);
    const parentPath = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    const dirName = `clone-commits-${uniqueSuffix()}`;
    const destination = join(parentPath, dirName);

    let opened = false;
    try {
      log("cloning through the UI");
      await cloneRepositoryThroughUi(remoteUrl, parentPath, dirName, destination);
      opened = true;

      expect(await browser.$('[data-testid="clone-error"]').isExisting()).toBe(false);

      expect(await getHeadCommit(destination)).toBe(secondSha);
      expect(await getCommitCount(destination)).toBe(2);
      expect(await getWorkingTreeStatus(destination)).toBe("clean");
      expect(existsSync(join(destination, "second-commit.txt"))).toBe(true);
      log("confirmed via helpers — HEAD, commit count, clean tree, and second commit's file all match");

      expect(await readGitConfig(destination, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(destination, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      expect(await getRemoteUrl(destination, "origin")).toBe(remoteUrl);
      log("confirmed via helpers — repository metadata and remote configuration correct");

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await seedRepo.cleanup();
    }
  });

  it("keeps detection, branch, upstream, and remote configuration after closing and reopening a cloned repository", async () => {
    log("seeding a bare remote with a scaffold-only commit");
    const seedRepo = await createLocalGitRepository({ initialCommit: true, label: "clone-reopen-seed" });
    const bareDir = await createBareRemote(server.remotesParent, "scenario3");
    const branch = await getCurrentBranch(seedRepo.path);
    await seedBareRemoteFromLocalRepo(seedRepo.path, bareDir, branch);
    const remoteUrl = buildSshRemoteUrl(server, bareDir);

    const parentPath = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
    const dirName = `clone-reopen-${uniqueSuffix()}`;
    const destination = join(parentPath, dirName);

    let opened = false;
    try {
      log("cloning through the UI");
      await cloneRepositoryThroughUi(remoteUrl, parentPath, dirName, destination);
      opened = true;

      expect(await getDisplayedBranch()).toBe(normalizeText(branch));
      await browser.waitUntil(
        async () => (await getDisplayedUpstream()) === `origin/${branch}`,
        { timeout: 10_000, timeoutMsg: `git-upstream-value never showed "origin/${branch}" after clone` },
      );
      log("upstream and branch configured immediately after clone");

      log("closing the cloned repository");
      await closeRepository();
      opened = false;

      log("reopening the same directory by path");
      await openRepositoryByPath(destination);
      opened = true;

      log("verifying repository detection, branch, and upstream are redisplayed after reopen");
      expect(await getDisplayedBranch()).toBe(normalizeText(branch));
      await browser.waitUntil(
        async () => (await getDisplayedUpstream()) === `origin/${branch}`,
        { timeout: 10_000, timeoutMsg: `git-upstream-value never showed "origin/${branch}" after reopen` },
      );

      expect(await readGitConfig(destination, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(destination, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      expect(await getRemoteUrl(destination, "origin")).toBe(remoteUrl);
      log("confirmed via UI and helpers — detection, branch, upstream, and remote survive close/reopen");

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await seedRepo.cleanup();
    }
  });
});
