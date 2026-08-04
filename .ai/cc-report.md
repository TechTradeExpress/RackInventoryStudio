## Summary

Stage 3F.5.4-R2 RP: a strict review of Stage 3F.5.4-R1's containerized
Git-over-SSH fixture found one remaining correctness class — teardown could
report success without that success ever being conclusively verified. Fixed
it end to end and proved it against real Docker state.

Fixed: (1) `checkContainerExists` collapsed every `docker inspect` failure
(daemon down, WSL unavailable, permission denied, `wsl.exe` erroring) to the
same boolean as genuine absence — replaced with a tri-state
`ContainerPresence` (`present`/`absent`/`unknown`), where only Docker's own
exact not-found message (`isDockerNotFoundError`, checked against a
preserved `DockerCommandError.stderr`, never the flattened message) may set
`"absent"`. (2) The spec's `after()` hook never inspected `cleanup()`'s
return value — added `isCleanupSuccessful`/`assertCleanupSucceeded` with a
clear predicate (`sshConfigCleared && containerVerifiedAbsent &&
workDirRemoved && keepAliveStopped && errors.length === 0`), and made
`RemoteFixture.cleanup()` return a shared, provider-neutral
`FixtureCleanupResult` (`{ok, provider, errors}`) instead of
`Promise<unknown>`, for both the container and native adapters; `after()`
is now `assertFixtureCleanupSucceeded(await fixture.cleanup())`. (3)
`createContainerRemoteFixture()`'s init-failure path discarded cleanup's
outcome (`.catch(() => {})`) — now attaches it as a non-replacing
`cleanupDiagnostics` property on the original (still-primary) error. (4)
The generated container name is now recorded before `docker run` is even
attempted, so a partial `docker run` failure (real engine-side container
creation, then a thrown error) can still be rolled back by exact name — a
real experiment against this host's Docker proved the rollback removes the
real container. Also gave `removeWorkDir` a tri-state result
(`removed`/`already-absent`/`refused`) so a path-safety refusal is reported
as an error, not silent success, and hardened idempotency (calling cleanup
twice on already-absent resources is still reported as success).

**Verdict: STAGE 3F.5.4-R2 COMPLETE — READY FOR MIGRATION.**

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` — the bulk of
  this RP: `ContainerPresence`/`isDockerNotFoundError`/
  `inspectContainerPresence` (injectable `DockerInspectFn` seam),
  `DockerCommandError`/`isDockerCommandError` (preserved stderr/exitCode/
  cause on `execDocker` failures), `WorkDirRemovalResult`, refined
  `CleanupResult` (`containerRemovalAttempted`/`keepAliveStopRequested`
  added), `isCleanupSuccessful`/`assertCleanupSucceeded`/
  `formatCleanupFailure`, `FixtureCleanupResult`/`toFixtureCleanupResult`/
  `assertFixtureCleanupSucceeded`/`formatFixtureCleanupFailure`,
  `ErrorWithCleanupDiagnostics`, rewritten `cleanupContainerRemote` (tri-state
  presence verification), rewritten `rollbackPartialContainerFixture` (new
  `rollbackContainerByName` helper, presence-aware), `startContainerRemote`
  (container name recorded before `docker run`), `createContainerRemoteFixture`
  (cleanup diagnostics attached on init failure).
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — grew from
  109 to 158 tests: presence classification, teardown-authority helpers,
  provider-neutral contract, rewritten rollback/cleanup coverage for the
  tri-state contract plus idempotency, three partial-`docker run`-failure
  fault-injection scenarios, atomic-init diagnostics coverage.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` — `RemoteFixture.
  cleanup()` returns `Promise<FixtureCleanupResult>`; native adapter wraps
  `cleanupNativeRemoteServer()` to map onto the shared shape without
  changing `git-remote.ts`; `after()` asserts via
  `assertFixtureCleanupSucceeded`.
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.4-R2" section.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1176 tests, 59
  files, all passed (was 1127 before this RP; +49 net, mostly in
  `container-git-remote.test.ts`).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm install --frozen-lockfile` / `pnpm check:version` /
  `pnpm check:hygiene` (8/8) / `pnpm test:scripts` (237/237) — all clean.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` / `cargo clippy --workspace -- -D warnings`
  / `cargo test --workspace` — all clean (no Rust files touched).
- **Controlled real-host validation** (standalone script against real
  Docker, deleted before commit): normal start+cleanup succeeded and was
  independently confirmed absent via `docker inspect`; a second cleanup on
  the same (now-absent) container also succeeded (idempotency); a forced
  `"unknown"` presence result on a real, already-removed container made
  `assertCleanupSucceeded` throw (`containerVerifiedAbsent` stayed `false`
  — never converted to success); a real `docker run`-created container was
  made to fail immediately afterward and rollback still removed it,
  confirmed via a fresh `docker inspect`. No residue left behind.
- **Container provider validation**: one functional
  `RIS_E2E_GIT_REMOTE_PROVIDER=container` run against `git-remote-workflows`,
  then a fresh 5-run stability matrix — **5/5 passed** (24-31s each), every
  run's teardown conclusively successful. Verified after all five runs: no
  fixture-labeled containers, no `sleep 86400` keep-alive process, no
  per-run work directory left behind.
- **Native provider regression**: first attempt (launched immediately
  after the container matrix) failed at the WDIO-launcher level
  (`exitCode=1`, no spec dot-report ever produced — a session-start
  failure, not a test failure); four immediate consecutive re-runs all
  passed cleanly. Attributed to transient driver-port contention right
  after the preceding matrix's own forced port cleanup, not a regression —
  this RP touched no native-fixture internals (`git-remote.ts` unchanged).

## Risks

- The native-provider session-start failure noted above recurred zero
  times across four immediate re-runs; flagged as a residual Windows
  driver-port-contention characteristic (same class already documented for
  tauri-driver/msedgedriver in `wdio.conf.ts`), not investigated further —
  out of this RP's scope.
- Keep-alive "stopped" is still reported as "the kill call didn't throw",
  not a confirmed-exit wait — explicitly allowed to remain a residual risk
  by this RP's own scope rather than enlarging the repair.
- Everything else carried forward from Stage 3F.5.4/R1: WSL2 VM
  idle-shutdown worked around, not eliminated; `/mnt/c` automount
  assumption untested on a remapped host; only `git-remote-workflows` is
  migrated; the intermittent UI-open flake (unrelated to either fixture
  provider) remains unexplained.

## Not done

- Did not migrate `git-clone-workflows` or `git-diverged-pull` — out of
  this RP's explicit scope.
- Did not change the Git workflow scenarios themselves, application code,
  SSH behavior, or Docker image contents.
- Did not investigate the repository-active-root UI flake or add retries/
  sleeps.
- Did not restart the full Windows WDIO Gate, merge to `development`, or
  tag/publish a release.
- Did not implement bounded keep-alive exit confirmation (documented as a
  residual risk instead, per this RP's own escape hatch for that item).

## Suggested next step

Migrate `git-clone-workflows` and `git-diverged-pull` to the container
provider now that teardown is authoritative for both providers, then retire
the native fixture's Windows-only branches.
