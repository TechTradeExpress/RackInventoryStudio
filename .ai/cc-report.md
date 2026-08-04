## Summary

Stage 3F.5.4-R3 RP: a strict review of Stage 3F.5.4-R2 found two final edge
cases where cleanup could still incorrectly fail or incorrectly report
success — both from steps reporting success purely from "the call didn't
throw" rather than an explicit result, the exact pattern R2 already fixed
for presence and work-directory removal. Closed both, added focused tests,
and validated against real Docker state.

Fixed: (1) `removeContainer` let Docker's exact not-found error (during
removal, not just inspection) propagate as a generic failure — even though
`containerVerifiedAbsent` would later correctly become `true`, the
non-empty `errors` array made teardown fail anyway. `docker rm -f
<already-absent-name>` happens to exit 0 on this project's validated host
(Docker Engine 29.4.3), but that's a version detail, not a guarantee — a
real cross-version simulation proved the classification also works when
`rm -f` exits non-zero. New `removeContainerViaDocker` (mirroring
`inspectContainerPresence`'s injectable seam) classifies the thrown error's
preserved stderr via the same `isDockerNotFoundError`, returning
`ContainerRemovalResult = "removed" | "already-absent"`; every other
failure still rethrows. (2) `clearContainerSshConfig` silently returned
`void` on a missing `RIS_E2E_RUN_ROOT`, which `cleanupContainerRemote` read
as `sshConfigCleared = true` purely because nothing threw — the same
success-from-silence bug R2 had already fixed for work-directory removal.
Now returns `SshConfigRemovalResult = "removed" | "already-absent" |
"refused"`; `"refused"` is reported as an error, never as success. Both
results are wired into `cleanupContainerRemote` and
`rollbackContainerByName`/`rollbackPartialContainerFixture` with the same
"already-absent is success, refused/failure is not" treatment. Added two
small defensive-hardening items: `assertFixtureCleanupSucceeded` now
rejects an internally inconsistent `ok:true`-with-errors result, and
`cleanupContainerRemote`'s `inspectContainerPresence` call is
try/catch-guarded so a dependency that violates its own never-throws
contract degrades to `"unknown"` instead of aborting cleanup before
work-directory removal and keep-alive shutdown run.

**Verdict: STAGE 3F.5.4-R3 COMPLETE — READY FOR MIGRATION.**

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` —
  `ContainerRemovalResult`/`removeContainerViaDocker` (injectable
  `DockerRemoveFn` seam, mirrors `DockerInspectFn`), `SshConfigRemovalResult`,
  `clearContainerSshConfig` exported and made tri-state, `cleanupContainerRemote`
  updated to treat `"already-absent"` as success and `"refused"` as an
  error for both new results, `rollbackContainerByName`/
  `rollbackPartialContainerFixture` given the same treatment,
  `assertFixtureCleanupSucceeded` rejects an inconsistent `ok:true`+errors
  result, `inspectContainerPresence` call in `cleanupContainerRemote`
  wrapped in try/catch.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — grew from
  158 to 181 tests: `removeContainerViaDocker` classification (success,
  both not-found stderr shapes, daemon/WSL/permission/generic-unrelated all
  rethrow), `clearContainerSshConfig` against a real temp
  `RIS_E2E_RUN_ROOT` (removed/already-absent/refused), cleanup and rollback
  integration for both new results, two defensive-hardening cases. Existing
  `fakeDeps` helpers across the file updated to return realistic tri-state
  values instead of implicit `undefined`.
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.4-R3" section.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` — unchanged;
  confirmed no cleanup-result type it references changed shape.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1199 tests, 59
  files, all passed (was 1176 before this RP; +23 net, all in
  `container-git-remote.test.ts`, which itself grew from 158 to 181).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm install --frozen-lockfile` / `pnpm check:version` /
  `pnpm check:hygiene` (8/8) / `pnpm test:scripts` (237/237) — all clean.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` / `cargo clippy --workspace -- -D warnings`
  / `cargo test --workspace` — all clean (no Rust files touched).
- **Real-host validation** (standalone script against real Docker, deleted
  before commit): normal start+cleanup succeeded, independently confirmed
  via `docker inspect`; a second cleanup call (including a second
  `clearContainerSshConfig()`, correctly returning `"already-absent"`) also
  succeeded; a real container was removed out-of-band, then
  `removeContainerViaDocker` was driven through a *simulated* non-zero-exit
  "No such container" stderr for that same now-genuinely-absent container
  — correctly classified `"already-absent"`, and a `cleanupContainerRemote`
  built on that classification still succeeded. No residue left behind.
- **Container provider regression**: one `RIS_E2E_GIT_REMOTE_PROVIDER=container`
  run against `git-remote-workflows` — passed cleanly (29s), teardown
  conclusively successful, no leftover container/work directory.
- **Native provider regression**: one `RIS_E2E_GIT_REMOTE_PROVIDER=native`
  run — passed cleanly (14s) on the first attempt, no driver-port
  contention this time.

## Risks

- Same residual items carried forward from R1/R2, none newly introduced or
  newly investigated by this RP: WSL2 VM idle-shutdown worked around, not
  eliminated; `/mnt/c` automount assumption untested on a remapped host;
  keep-alive "stopped" still means "the kill call didn't throw," not a
  confirmed-exit wait; the intermittent UI-open flake and driver-port
  contention are unrelated to fixture-cleanup logic and out of this RP's
  scope; only `git-remote-workflows` is migrated.

## Not done

- Did not migrate `git-clone-workflows` or `git-diverged-pull` — out of
  this RP's explicit scope.
- Did not change the Git workflow scenarios themselves, application code,
  SSH authentication, or Dockerfile/entrypoint.sh/sshd_config.
- Did not investigate the UI-open flake or driver-port contention, add
  retries, or add sleeps.
- Did not restart the full Windows WDIO Gate, merge to `development`, or
  tag/publish a release.
- Did not run a fresh 5-run stability matrix — not required for this small
  repair per the RP's own scope; single runs sufficed for both providers.

## Suggested next step

Migrate `git-clone-workflows` and `git-diverged-pull` to the container
provider now that both cleanup edge cases are closed and teardown is
authoritative and idempotent for both providers.
