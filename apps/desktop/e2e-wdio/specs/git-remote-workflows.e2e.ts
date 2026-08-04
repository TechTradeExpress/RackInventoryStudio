/**
 * Remote Git over SSH — successful push, pull, and upstream persistence
 * (Stage 3F.2).
 *
 * Builds on Stage 3F.1B's local-only coverage (git-local-workflows.e2e.ts),
 * which stopped at the *error* path for push/pull against an unreachable
 * remote. This spec is the first allowed to use a real remote repository —
 * a local, unprivileged `sshd` plus one or more local bare repositories it
 * serves over 127.0.0.1 (support/git-remote.ts) — and covers the successful
 * round trip: push, fast-forward pull, upstream tracking, and the SSH
 * authentication flow (key-based, no passphrase — the passphrase-prompt
 * modal itself is Stage 3F.2's own explicit "out of scope" per its NSP).
 *
 * `sshd` is a required prerequisite for this spec, not an optional one —
 * `before()` throws immediately (via `findSshd()`, support/git-remote.ts)
 * if it cannot be found, exactly like the existing
 * `RIS_E2E_REPOSITORY_PARENT` check right below it and like
 * git-local-workflows.e2e.ts/git-detection-init.e2e.ts's own `before()`
 * hooks. This is deliberately *not* the `if !git_available() { return; }`
 * soft-skip pattern crates/ris-git/tests uses for git itself: that pattern
 * fits a handful of assertions inside a large, mixed-purpose Rust test
 * file where an unrelated dependency being absent shouldn't block every
 * other test in the file. Here the missing dependency and this spec's
 * entire purpose are the same thing — the whole point of Stage 3F.2 is SSH
 * remote coverage, so a quiet skip would let a run report green while
 * exercising zero of its scenarios. wdio.conf.ts's own doc comment already
 * treats `tauri-driver`/`webkit2gtk-driver`/`xvfb` as hard one-time
 * prerequisites with no runtime fallback; `sshd` (openssh-server) belongs
 * in that same tier for this spec, not in the "silently continue without
 * it" category. (The Vitest unit tests in support/git-remote.test.ts are
 * a different case — helper-level tests skip when sshd is absent, which
 * is fine there since they aren't this program's Stage 3F.2 coverage
 * artifact.)
 *
 * Fixtures are built exactly like git-local-workflows.e2e.ts: via
 * `createLocalGitRepository` (already-committed local state) opened through
 * "Open by path", since `create_repository_cmd` always runs `git init`
 * itself and cannot reach a pre-baked commit. Remote-side helpers
 * (`createBareRemote`, `getRemoteHeadCommit`, `getRemoteCommitCount`,
 * `pushSimulatedRemoteCommit`, …) come from support/git-remote.ts and, per
 * this stage's own instruction, are used for cross-checks in preference to
 * relying on UI success messages (`pushSuccess`/`pullSuccess` render with no
 * `data-testid` — only the *error* spans do, see git-local-workflows.e2e.ts's
 * own selector-contract note).
 *
 * Selector contract: this stage adds exactly one new testid,
 * `git-upstream-value` (the existing "Upstream" `<dd>` in the Git status
 * panel had none — needed to prove Scenario 3's redetection-after-reopen at
 * the UI level, not just via `.git/config`). Everything else reuses Stage
 * 3F.1A/3F.1B's existing contract: `repository-landing-title`,
 * `repository-open-path-input`, `repository-open-path-submit`,
 * `repository-active-root`, `repository-active-path`,
 * `repository-close-action`, `git-branch-value`, `git-remote-name-input`,
 * `git-remote-url-input`, `git-remote-add-btn`, `git-remote-add-success`,
 * `git-stepper-push-btn`, `git-stepper-pull-btn`, `git-push-error`,
 * `git-pull-error`.
 *
 * Explicitly out of scope here (see this stage's NSP): clone, merge
 * conflicts, rebase, stash, tags, multiple remotes, HTTPS credentials,
 * branch creation/switching, detached HEAD, force push, and the SSH
 * passphrase-prompt workflow.
 *
 * ── Stage 3F.5.4: containerized fixture (opt-in) ─────────────────────────────
 *
 * This spec is also the sole proof-of-concept target for Stage 3F.5.4's
 * containerized Git-over-SSH fixture (support/container-git-remote.ts) — a
 * Linux container (OpenSSH + git) managed through Docker Engine inside
 * WSL2, reached from the Windows application over a published 127.0.0.1
 * port, replacing only the *server* side of the native fixture above (the
 * Windows application, git.exe, ssh.exe, and every WDIO interaction stay
 * native throughout either way). Selected via
 * `RIS_E2E_GIT_REMOTE_PROVIDER=container`; defaults to the native fixture
 * described above when unset, so this is strictly opt-in for now —
 * git-clone-workflows and git-diverged-pull are not migrated. See the
 * `RemoteFixture` interface right below for how the three scenarios stay
 * provider-agnostic.
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
  readGitConfig,
} from "../support/local-git";
import {
  buildSshRemoteUrl as buildNativeSshRemoteUrl,
  cleanup as cleanupNativeRemoteServer,
  configureSsh as configureNativeSsh,
  createBareRemote as createNativeBareRemote,
  findSshd,
  getRemoteCommitCount as getNativeRemoteCommitCount,
  getRemoteHeadCommit as getNativeRemoteHeadCommit,
  pushSimulatedRemoteCommit as pushSimulatedNativeRemoteCommit,
  startRemote,
} from "../support/git-remote";
import {
  createContainerRemoteFixture,
  resolveGitRemoteProvider,
  assertFixtureCleanupSucceeded,
  type FixtureCleanupResult,
} from "../support/container-git-remote";

/**
 * Unifies the two Git-remote fixture providers (native local-sshd vs.
 * containerized — see support/container-git-remote.ts's own doc comment for
 * the Stage 3F.5.4 proof-of-concept rationale) behind the one shape this
 * spec's three scenarios actually need, so the scenario bodies below don't
 * fork on provider at all. Selected once in before() via
 * RIS_E2E_GIT_REMOTE_PROVIDER (resolveGitRemoteProvider) — defaults to
 * "native", so this stage's proof of concept is strictly opt-in and every
 * existing CI/local run of this spec is unaffected unless that env var is
 * explicitly set.
 */
interface RemoteFixture {
  createBareRemote(label: string): Promise<string>;
  buildRemoteUrl(bareRepoPath: string): string;
  getRemoteHeadCommit(bareRepoPath: string, ref?: string): Promise<string>;
  getRemoteCommitCount(bareRepoPath: string, ref?: string): Promise<number>;
  pushSimulatedRemoteCommit(
    bareRepoPath: string,
    branch: string,
    fileName: string,
    message: string,
  ): Promise<string>;
  /** Provider-neutral (Stage 3F.5.4-R2's defect-2/unified-contract fix):
   * both providers now map onto the shared `FixtureCleanupResult` shape —
   * `after()` below asserts against it via `assertFixtureCleanupSucceeded`,
   * so an unremoved or unverified resource fails the suite instead of
   * silently disappearing behind a discarded `Promise<unknown>`. */
  cleanup(): Promise<FixtureCleanupResult>;
}

function log(msg: string) {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[git-remote-workflows ${ts}] ${msg}`);
}

/** Duplicated from git-local-workflows.e2e.ts rather than shared — same
 * rationale that spec documents: these are spec-local by this program's own
 * convention, not a shared abstraction. */
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

/** Returns the displayed upstream value, or null if the "Upstream" row is
 * not rendered at all (gitStatus.upstream falsy). */
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

describe("Rack Inventory Studio — remote Git workflows (SSH)", () => {
  let fixture: RemoteFixture;

  before(async () => {
    if (!process.env["RIS_E2E_REPOSITORY_PARENT"]) {
      throw new Error(
        "RIS_E2E_REPOSITORY_PARENT is not set. " +
          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
      );
    }

    const provider = resolveGitRemoteProvider();
    log(`git remote provider: ${provider}`);

    if (provider === "container") {
      // Stage 3F.5.4 proof of concept — see support/container-git-remote.ts's
      // module doc comment. Opt-in only (RIS_E2E_GIT_REMOTE_PROVIDER=container).
      // createContainerRemoteFixture() is the atomic init boundary (Stage
      // 3F.5.4-R1): it only returns once the container is fully started AND
      // configured for SSH, and cleans up after itself if either step
      // fails — `fixture` is never assigned a half-initialized provider.
      log("starting the containerized Git-over-SSH fixture");
      fixture = await createContainerRemoteFixture();
      log("containerized fixture ready");
      return;
    }

    const sshdPath = await findSshd();
    if (!sshdPath) {
      // Hard failure, not a skip — see this file's module doc comment for
      // why: a quiet skip here would let this spec's entire purpose (Stage
      // 3F.2 SSH remote coverage) go unexercised while still reporting
      // green. sshd is a required prerequisite for this spec, in the same
      // tier as tauri-driver/webkit2gtk-driver/xvfb (see wdio.conf.ts's own
      // "Prerequisites" doc comment).
      throw new Error(
        "sshd was not found (checked PATH and /usr/sbin, /sbin, /usr/local/sbin) — " +
          "required to run git-remote-workflows. Install OpenSSH server " +
          "(e.g. `sudo apt-get install -y openssh-server` on Linux) before running this spec.",
      );
    }

    log("starting the local sshd remote-Git fixture");
    const server = await startRemote();
    try {
      configureNativeSsh(server);
    } catch (error) {
      // Equivalent atomic-init safety to the container provider's
      // createContainerRemoteFixture() (Stage 3F.5.4-R1): startRemote()
      // already succeeded here (sshd running, keys on disk) — if
      // configureNativeSsh() throws before `fixture` is assigned below,
      // after() would otherwise have nothing to call cleanup on, leaking
      // the sshd process and its key directory.
      await cleanupNativeRemoteServer(server).catch(() => {});
      throw error;
    }
    log(`fixture ready: 127.0.0.1:${server.port}, username=${server.username}`);
    fixture = {
      createBareRemote: (label) => createNativeBareRemote(server.remotesParent, label),
      buildRemoteUrl: (bareRepoPath) => buildNativeSshRemoteUrl(server, bareRepoPath),
      getRemoteHeadCommit: (bareRepoPath, ref) => getNativeRemoteHeadCommit(bareRepoPath, ref),
      getRemoteCommitCount: (bareRepoPath, ref) => getNativeRemoteCommitCount(bareRepoPath, ref),
      pushSimulatedRemoteCommit: (bareRepoPath, branch, fileName, message) =>
        pushSimulatedNativeRemoteCommit(bareRepoPath, server.remotesParent, branch, fileName, message),
      // Maps the native fixture's own Promise<void>/throws-on-failure
      // cleanup onto the shared FixtureCleanupResult shape (Stage
      // 3F.5.4-R2's provider-neutral contract) rather than changing
      // support/git-remote.ts itself — same "zero native-fixture footprint"
      // approach Stage 3F.5.4-R1 used for atomic init. A thrown error is
      // never silently swallowed: it's captured into `errors` so
      // assertFixtureCleanupSucceeded's thrown message names it explicitly.
      cleanup: async () => {
        try {
          await cleanupNativeRemoteServer(server);
          return { ok: true, provider: "native", errors: [] };
        } catch (error) {
          return {
            ok: false,
            provider: "native",
            errors: [error instanceof Error ? error.message : String(error)],
          };
        }
      },
    };
  });

  after(async () => {
    // Teardown is now part of the test result (Stage 3F.5.4-R2's defect-2
    // fix): an unremoved container, an unverified presence check, a
    // refused work-directory removal, or a still-running keep-alive all
    // fail this hook — the suite cannot pass while fixture teardown is
    // inconclusive, for either provider.
    if (fixture) assertFixtureCleanupSucceeded(await fixture.cleanup());
  });

  it("pushes a new commit to a remote over SSH, configuring upstream tracking", async () => {
    log("creating a fixture with an initial commit");
    const repo = await createLocalGitRepository({ initialCommit: true, label: "remote-push" });
    const bareDir = await fixture.createBareRemote("scenario1");
    const remoteUrl = fixture.buildRemoteUrl(bareDir);
    log(`bare remote at ${bareDir}, url=${remoteUrl}`);

    let opened = false;
    try {
      log("opening the fixture by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log(`adding remote "origin" -> ${remoteUrl}`);
      await addRemoteThroughUi("origin", remoteUrl);

      const branch = await getCurrentBranch(repo.path);
      const localHead = await getHeadCommit(repo.path);

      log("clicking git-stepper-push-btn (SSH authentication over the key with no passphrase)");
      await clickWhenEnabled("git-stepper-push-btn");

      log("waiting for the commit to land on the remote bare repository (helper-level, not a UI message)");
      await browser.waitUntil(
        async () => (await fixture.getRemoteCommitCount(bareDir, branch).catch(() => 0)) === 1,
        {
          timeout: 20_000,
          interval: 200,
          timeoutMsg: "push never landed on the remote bare repository",
        },
      );

      expect(await browser.$('[data-testid="git-push-error"]').isExisting()).toBe(false);
      expect(await fixture.getRemoteHeadCommit(bareDir, branch)).toBe(localHead);
      expect(await fixture.getRemoteCommitCount(bareDir, branch)).toBe(1);
      log("confirmed via helpers — remote HEAD and commit count match the pushed local commit");

      expect(await readGitConfig(repo.path, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(repo.path, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      log("confirmed via .git/config — upstream tracking configured");

      expect(await getDisplayedBranch()).toBe(normalizeText(branch));
      await browser.waitUntil(
        async () => (await getDisplayedUpstream()) === `origin/${branch}`,
        {
          timeout: 10_000,
          timeoutMsg: `git-upstream-value never showed "origin/${branch}"`,
        },
      );
      log("confirmed via UI — branch and upstream displayed correctly");

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await repo.cleanup();
    }
  });

  it("pulls a fast-forward commit simulated on the remote", async () => {
    log("creating a fixture with an initial commit");
    const repo = await createLocalGitRepository({ initialCommit: true, label: "remote-pull" });
    const bareDir = await fixture.createBareRemote("scenario2");
    const remoteUrl = fixture.buildRemoteUrl(bareDir);

    let opened = false;
    try {
      log("opening the fixture by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log(`adding remote "origin" -> ${remoteUrl}`);
      await addRemoteThroughUi("origin", remoteUrl);
      const branch = await getCurrentBranch(repo.path);

      log("pushing once to establish upstream tracking before testing pull");
      await clickWhenEnabled("git-stepper-push-btn");
      await browser.waitUntil(
        async () => (await fixture.getRemoteCommitCount(bareDir, branch).catch(() => 0)) === 1,
        { timeout: 20_000, interval: 200, timeoutMsg: "initial push never landed on the remote" },
      );

      log("simulating a teammate's commit landing on the remote (test-side, no SSH)");
      const simulatedSha = await fixture.pushSimulatedRemoteCommit(
        bareDir,
        branch,
        "from-teammate.txt",
        "Simulated remote commit",
      );
      expect(await fixture.getRemoteCommitCount(bareDir, branch)).toBe(2);
      log(`remote now has 2 commits, HEAD=${simulatedSha}`);

      log("clicking git-stepper-pull-btn");
      await clickWhenEnabled("git-stepper-pull-btn");

      log("waiting for local HEAD to fast-forward to the simulated remote commit (helper-level)");
      await browser.waitUntil(
        async () => (await getHeadCommit(repo.path).catch(() => null)) === simulatedSha,
        {
          timeout: 20_000,
          interval: 200,
          timeoutMsg: "local HEAD never fast-forwarded to the simulated remote commit",
        },
      );

      expect(await browser.$('[data-testid="git-pull-error"]').isExisting()).toBe(false);
      expect(await getWorkingTreeStatus(repo.path)).toBe("clean");
      expect(await getCommitCount(repo.path)).toBe(2);
      log("confirmed via helpers — HEAD updated, working tree clean, commit count incremented");

      await closeRepository();
      opened = false;
    } finally {
      if (opened) {
        await closeRepositorySafely();
      }
      await repo.cleanup();
    }
  });

  it("keeps upstream tracking and remote detection after closing and reopening the repository", async () => {
    log("creating a fixture with an initial commit");
    const repo = await createLocalGitRepository({ initialCommit: true, label: "remote-reopen" });
    const bareDir = await fixture.createBareRemote("scenario3");
    const remoteUrl = fixture.buildRemoteUrl(bareDir);

    let opened = false;
    try {
      log("opening the fixture by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log(`adding remote "origin" -> ${remoteUrl}`);
      await addRemoteThroughUi("origin", remoteUrl);
      const branch = await getCurrentBranch(repo.path);

      log("pushing to establish upstream tracking");
      await clickWhenEnabled("git-stepper-push-btn");
      await browser.waitUntil(
        async () => (await fixture.getRemoteCommitCount(bareDir, branch).catch(() => 0)) === 1,
        { timeout: 20_000, interval: 200, timeoutMsg: "push never landed on the remote" },
      );
      expect(await readGitConfig(repo.path, `branch.${branch}.remote`)).toBe("origin");
      log("upstream configured before closing");

      log("closing the repository");
      await closeRepository();
      opened = false;

      log("reopening the same repository by path");
      await openRepositoryByPath(repo.path);
      opened = true;

      log("verifying branch + upstream are redisplayed after reopen");
      expect(await getDisplayedBranch()).toBe(normalizeText(branch));
      await browser.waitUntil(
        async () => (await getDisplayedUpstream()) === `origin/${branch}`,
        {
          timeout: 10_000,
          timeoutMsg: `git-upstream-value never showed "origin/${branch}" after reopen`,
        },
      );

      log("verifying upstream tracking and the remote URL are still configured on disk");
      expect(await readGitConfig(repo.path, `branch.${branch}.remote`)).toBe("origin");
      expect(await readGitConfig(repo.path, `branch.${branch}.merge`)).toBe(`refs/heads/${branch}`);
      expect(await getRemoteUrl(repo.path, "origin")).toBe(remoteUrl);
      log("confirmed via UI and helpers — upstream and remote survive close/reopen");

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
