## Summary

Stage 3F.5.4-R5 RP: Stage 3F.5.4-R4's own report explicitly flagged, as a
deliberately-unfixed follow-up, that `removeWorkDirImpl`'s
`!existsSync(workDir) → "already-absent"` had the identical correctness
gap R4 had just closed for SSH config. This RP closes that gap, plus a
second, smaller one: a valid time-of-check/time-of-use race between a
successful `lstat` and the `remove` call that follows it, where the
correct final state (resource gone) was previously reported as a cleanup
*failure* rather than idempotent success.

Fixed: `removeWorkDirImpl` renamed to the exported `removeContainerWorkDir`
(mirroring `clearContainerSshConfig`'s naming/export rationale) and
rewritten to use `lstat` instead of `existsSync`, with the same
`isNodeErrorWithCode`-based classification — only a thrown `ENOENT`
produces `"already-absent"`; `EACCES`, `EPERM`, `EBUSY`, `EIO`, `ENOTDIR`,
and an error with no recognized code at all are all rethrown unchanged. An
async `WorkDirFsDeps` (`{lstat, remove}`) injectable seam mirrors
`SshConfigFsDeps`'s shape for deterministic testing. Both
`clearContainerSshConfig` and `removeContainerWorkDir` now also wrap their
`remove` call in the same ENOENT-aware try/catch as their `lstat` call — a
`remove` that throws `ENOENT` (the resource was removed concurrently
between inspection and removal) is idempotent success, not a failure.
`RIS_E2E_RUN_ROOT` validation, `isStrictChildPath`, and the recursive
removal retry behavior are all preserved exactly; `cleanupContainerRemote()`
and `rollbackPartialContainerFixture()` needed no changes — both already
treated a thrown error as authoritative failure and now simply receive
more precisely classified results.

A full `existsSync()` sweep confirms `container-git-remote.ts` now has
zero remaining authoritative-absence `existsSync()` calls. Three
equivalent-defect call sites remain in `support/git-remote.ts` (the native
fixture's `clearSshConfig`/`cleanup`) — explicitly out of this RP's scope,
documented as an observation only.

**Verdict: STAGE 3F.5.4-R5 COMPLETE — READY FOR MIGRATION.**

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` —
  `clearContainerSshConfig`'s `remove` step wrapped in ENOENT-aware
  try/catch (TOCTOU fix); `WorkDirFsDeps`/`defaultWorkDirFsDeps`; new
  exported `removeContainerWorkDir` replacing the private
  `removeWorkDirImpl`, using `lstat`/`isNodeErrorWithCode` classification
  with the same TOCTOU handling on removal; `defaultContainerOpsDeps.
  removeWorkDir` rewired to it. `existsSync` import removed (no longer
  used); `lstat` added to the `node:fs/promises` import.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — grew from
  194 to 212 tests: full `removeContainerWorkDir` dependency-injected
  classification (refused/removed/ENOENT/EACCES/EPERM/EIO/ENOTDIR/no-code
  on inspection, ENOENT/EPERM/EBUSY on removal), two SSH-config TOCTOU
  cases, and cleanup/rollback integration tests including two that wire
  the *real* `removeContainerWorkDir` into a real `cleanupContainerRemote`/
  `rollbackPartialContainerFixture` call to prove the TOCTOU-ENOENT path
  end to end.
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.4-R5" section, including the
  `existsSync()` sweep result.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` — unchanged;
  no type contract it references changed shape.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1230 tests, 59
  files, all passed (was 1212 before this RP; +18 net, all in
  `container-git-remote.test.ts`, which itself grew from 194 to 212).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm install --frozen-lockfile` / `pnpm check:version` /
  `pnpm check:hygiene` (8/8) / `pnpm test:scripts` (237/237) — all clean.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` / `cargo clippy --workspace -- -D warnings`
  / `cargo test --workspace` — all clean (no Rust files touched).
- **Real-host validation** (standalone script against real Docker/filesystem,
  deleted before commit): a real container fixture's work directory and
  ephemeral SSH key confirmed present; cleaned up once (succeeded, work
  directory genuinely gone from disk); a second full cleanup call also
  succeeded with the work directory correctly reported already-absent; no
  container, work directory, or config remained afterward, and a repeated
  `clearContainerSshConfig()` call independently confirmed already-absent.
  No NTFS-denial or race experiment run (not required — structured-error
  and TOCTOU paths are covered deterministically in unit tests).
- **Container provider regression**: one `RIS_E2E_GIT_REMOTE_PROVIDER=container`
  run against `git-remote-workflows` — passed cleanly (31s), teardown
  conclusively successful, no leftover resources. Native-provider run
  skipped per this RP's own guidance (spec/native adapter unchanged, no
  shared cleanup-result type changed shape).

## Risks

- Same residual items carried forward from R1-R4, none newly introduced:
  WSL2 VM idle-shutdown worked around, not eliminated; `/mnt/c` automount
  assumption untested on a remapped host; keep-alive "stopped" still means
  "the kill call didn't throw," not a confirmed-exit wait; the intermittent
  UI-open flake and driver-port contention are unrelated to fixture-cleanup
  logic; only `git-remote-workflows` is migrated.
- `support/git-remote.ts` (the native fixture) has three `existsSync()`
  call sites with the identical correctness gap this RP just fixed for the
  container fixture — not repaired here, explicitly out of scope (see
  "Do not modify the native fixture").

## Not done

- Did not fix `support/git-remote.ts`'s equivalent `existsSync()` sites —
  documented as an observation, out of this RP's explicit scope.
- Did not migrate `git-clone-workflows` or `git-diverged-pull`.
- Did not change application code, Docker lifecycle, the container image,
  SSH authentication, Git workflow assertions, or the native fixture.
- Did not investigate the UI-open flake or driver-port contention, add
  retries, or add sleeps.
- Did not run a native-provider WDIO regression (optional per this RP,
  skipped since nothing shared changed shape).
- Did not restart the full Windows WDIO Gate, merge to `development`, or
  tag/publish a release.

## Suggested next step

If a future repair pass is warranted, apply the same
`lstat`/`ENOENT`/injectable-deps pattern to `support/git-remote.ts`'s three
remaining `existsSync()`-as-authority sites (out of scope for the
container-fixture-only stages so far). Otherwise, proceed with migrating
`git-clone-workflows` and `git-diverged-pull` to the container provider —
all identified container-fixture cleanup correctness gaps are now closed.
