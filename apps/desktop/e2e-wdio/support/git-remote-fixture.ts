/**
 * Provider-neutral Git-remote fixture adapter (Stage 3F.5.5).
 *
 * git-remote-workflows.e2e.ts (Stage 3F.2, hardened through Stage
 * 3F.5.4-R1/R2) proved a provider-selection pattern — resolve
 * `RIS_E2E_GIT_REMOTE_PROVIDER`, build either the native local-sshd fixture
 * (support/git-remote.ts) or the containerized fixture
 * (support/container-git-remote.ts) behind one small shape, assign the
 * spec's fixture variable only once fully initialized, and assert teardown
 * via `FixtureCleanupResult`/`assertFixtureCleanupSucceeded` — inline,
 * directly in that spec.
 *
 * This stage migrates the two remaining Git-over-SSH specs
 * (git-clone-workflows.e2e.ts, git-diverged-pull.e2e.ts) to the same
 * pattern. Both would otherwise duplicate git-remote-workflows.e2e.ts's
 * ~40-line `before()`/adapter-construction block almost verbatim (the only
 * per-spec difference is the plus-one `seedBareRemote` capability
 * git-clone-workflows needs) — exactly the "same code would otherwise be
 * copied three times" case this stage's NSP calls out as justifying
 * extraction. `createGitRemoteFixture()` here is that shared boundary.
 *
 * git-remote-workflows.e2e.ts itself is deliberately left as-is: it is
 * already migrated, already validated across R1-R5, and this stage's NSP
 * does not require retrofitting already-working code merely for uniformity
 * — see this stage's own report for that explicit call.
 *
 * Scope discipline (per this stage's NSP):
 *  - no WebdriverIO imports here — this module knows nothing about
 *    `browser`/`expect`/selectors, only about which Git-remote fixture
 *    provider is active and how to reach it;
 *  - no scenario assertions — a spec's `it()` bodies still make every
 *    product-level assertion themselves;
 *  - not a second implementation of container-git-remote.ts — the
 *    container branch below is a thin pass-through to
 *    `createContainerRemoteFixture()`'s own atomic, already-hardened
 *    factory, not a reimplementation of its lifecycle.
 */
import {
  buildSshRemoteUrl as buildNativeSshRemoteUrl,
  cleanup as cleanupNativeRemoteServer,
  configureSsh as configureNativeSsh,
  createBareRemote as createNativeBareRemote,
  findSshd,
  getRemoteCommitCount as getNativeRemoteCommitCount,
  getRemoteHeadCommit as getNativeRemoteHeadCommit,
  pushSimulatedRemoteCommit as pushSimulatedNativeRemoteCommit,
  seedBareRemoteFromLocalRepo,
  startRemote,
} from "./git-remote";
import {
  assertFixtureCleanupSucceeded,
  createContainerRemoteFixture,
  resolveGitRemoteProvider,
  type FixtureCleanupResult,
} from "./container-git-remote";

export { assertFixtureCleanupSucceeded };

function log(msg: string): void {
  const ts = new Date().toISOString().substring(11, 23);
  console.log(`[git-remote-fixture ${ts}] ${msg}`);
}

/**
 * The one shape every Git-over-SSH spec needs, regardless of provider.
 * Deliberately narrow — see this module's own doc comment on what is *not*
 * exposed (no raw container server object, no Docker/WSL/`docker exec`
 * access, no provider-specific SSH configuration reaching the spec).
 */
export interface GitRemoteFixture {
  createBareRemote(label: string): Promise<string>;
  buildRemoteUrl(bareRepoPath: string): string;
  /** Seeds an otherwise-empty remote with `localRepoPath`'s current branch
   * — needed only by specs that require remote content to exist *before*
   * the application acts on it (e.g. clone). Native: a local-filesystem
   * push (`seedBareRemoteFromLocalRepo`). Container: a real SSH push over
   * this fixture's own configured transport
   * (`seedContainerBareRemoteFromLocalRepo`). */
  seedBareRemote(localRepoPath: string, bareRepoPath: string, branch: string): Promise<void>;
  getRemoteHeadCommit(bareRepoPath: string, ref?: string): Promise<string>;
  getRemoteCommitCount(bareRepoPath: string, ref?: string): Promise<number>;
  pushSimulatedRemoteCommit(
    bareRepoPath: string,
    branch: string,
    fileName: string,
    message: string,
  ): Promise<string>;
  /** Provider-neutral (Stage 3F.5.4-R2) — never `Promise<unknown>`. A
   * caller's `after()` hook must be able to act on whether cleanup
   * actually succeeded; see `assertFixtureCleanupSucceeded`. */
  cleanup(): Promise<FixtureCleanupResult>;
}

/**
 * Resolves `RIS_E2E_GIT_REMOTE_PROVIDER` and returns a fully-initialized,
 * provider-neutral fixture. Never returns a partially-set-up fixture: the
 * container branch reuses `createContainerRemoteFixture()`'s own atomic
 * start+configure boundary unchanged; the native branch applies the
 * equivalent safety inline (mirrors git-remote-workflows.e2e.ts's own
 * `before()` — a `configureNativeSsh()` failure after `startRemote()` has
 * already succeeded triggers `cleanupNativeRemoteServer()` before
 * rethrowing, so no resource the native fixture acquired is ever leaked
 * behind an unassigned caller variable).
 *
 * Throws (not skips) when `sshd` cannot be found for the native provider —
 * same policy every Git-over-SSH spec in this program uses: a missing
 * prerequisite for a spec whose entire purpose is SSH remote coverage must
 * fail loudly, not report green having tested nothing.
 */
export async function createGitRemoteFixture(): Promise<GitRemoteFixture> {
  const provider = resolveGitRemoteProvider();
  log(`git remote provider: ${provider}`);

  if (provider === "container") {
    log("starting the containerized Git-over-SSH fixture");
    const handle = await createContainerRemoteFixture();
    log("containerized fixture ready");
    return handle;
  }

  const sshdPath = await findSshd();
  if (!sshdPath) {
    throw new Error(
      "sshd was not found (checked PATH and /usr/sbin, /sbin, /usr/local/sbin) — " +
        "required to run this spec under the native provider. Install OpenSSH server " +
        "(e.g. `sudo apt-get install -y openssh-server` on Linux), or set " +
        "RIS_E2E_GIT_REMOTE_PROVIDER=container to use the containerized fixture instead.",
    );
  }

  log("starting the local sshd remote-Git fixture");
  const server = await startRemote();
  try {
    configureNativeSsh(server);
  } catch (error) {
    await cleanupNativeRemoteServer(server).catch(() => {});
    throw error;
  }
  log(`fixture ready: 127.0.0.1:${server.port}, username=${server.username}`);

  return {
    createBareRemote: (label) => createNativeBareRemote(server.remotesParent, label),
    buildRemoteUrl: (bareRepoPath) => buildNativeSshRemoteUrl(server, bareRepoPath),
    seedBareRemote: (localRepoPath, bareRepoPath, branch) =>
      seedBareRemoteFromLocalRepo(localRepoPath, bareRepoPath, branch),
    getRemoteHeadCommit: (bareRepoPath, ref) => getNativeRemoteHeadCommit(bareRepoPath, ref),
    getRemoteCommitCount: (bareRepoPath, ref) => getNativeRemoteCommitCount(bareRepoPath, ref),
    pushSimulatedRemoteCommit: (bareRepoPath, branch, fileName, message) =>
      pushSimulatedNativeRemoteCommit(bareRepoPath, server.remotesParent, branch, fileName, message),
    // Maps the native fixture's own Promise<void>/throws-on-failure cleanup
    // onto the shared FixtureCleanupResult shape (same "zero native-fixture
    // footprint" approach Stage 3F.5.4-R1/R2 used) rather than changing
    // support/git-remote.ts itself. A thrown error is never silently
    // swallowed — it's captured into `errors` so
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
}
