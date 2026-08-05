## Summary

Stage 3F.5.7: switched the default Git-over-SSH remote fixture provider from
`native` to `container` for all three Windows WDIO specs
(`git-remote-workflows`, `git-clone-workflows`, `git-diverged-pull`).

`resolveGitRemoteProvider()` now returns `"container"` when
`RIS_E2E_GIT_REMOTE_PROVIDER` is unset or empty (previously `"native"`).
Every other branch is unchanged: explicit `"native"`/`"container"` resolve
exactly as named (still case-sensitive, non-trimmed), and any other value
still throws before either fixture is created. `native` remains fully
supported via `RIS_E2E_GIT_REMOTE_PROVIDER=native` — not removed, only
demoted from default. There is no automatic container->native fallback on
container startup failure (confirmed by inspection; a failed container
prerequisite fails the run).

Container-prerequisite failure diagnostics (WSL/Docker discovery,
distribution selection, image build, SSH port publication) now append a
fixed hint naming the new default and the native override, without
altering the underlying diagnostic text.

Validated on the real Windows/WSL2/Docker host: 23 real WDIO spec
executions (19 container-provider passes across individual + 5×3 stability
matrix + explicit-override runs, 3 explicit-native passes, 1 invalid-value
failure-before-fixture-creation), all with correct provider resolution,
clean fixture teardown, and verified zero residue. Full detail in
`docs/E2E_WDIO_PLAN.md`'s new "Stage 3F.5.7" section.

**Stage 3F.5.7 status: COMPLETE — READY FOR LINUX PORTABILITY VALIDATION.**

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` —
  `resolveGitRemoteProvider()`'s unset/empty-string branch now returns
  `"container"` instead of `"native"`; doc comments (module header and the
  function's own) updated to describe the new default and no-fallback
  policy. Added `withNativeFallbackHint()` and applied it to every
  container-prerequisite failure message (WSL distribution discovery,
  `selectDistribution`'s override/no-WSL2/no-Docker throws, `wsl.exe`
  invocation failure, `ensureImageBuilt`'s build failure, and
  `startContainerRemote`'s port-parsing failure) so the first actionable
  error names the new default and the `RIS_E2E_GIT_REMOTE_PROVIDER=native`
  override. No lifecycle/control-flow logic changed.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — updated
  `resolveGitRemoteProvider` tests for the new default (unset/empty ->
  container), added tests for invalid-value message content
  (names both accepted values), case-sensitivity/no-trim preservation, and
  a new sub-suite exercising the real `process.env` (with
  `beforeEach`/`afterEach` save-restore) to prove the zero-argument
  production call path resolves correctly with no cross-test leakage.
- `apps/desktop/e2e-wdio/support/git-remote-fixture.test.ts` — new
  "Stage 3F.5.7 default-provider wiring" suite: asserts
  `defaultCreateGitRemoteFixtureDeps.resolveProvider` is the real
  `resolveGitRemoteProvider` by reference, then exercises
  `createGitRemoteFixture()` against the real (save-restored) env to prove
  unset selects the container branch and `native` selects the native
  branch.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` — doc-comment-only
  corrections: removed stale "defaults to native, strictly opt-in" language
  now superseded by this stage's change.
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.7" section (resolver change,
  no-fallback policy, diagnostics, Windows prerequisites, unit/adapter test
  coverage, preflight, individual/matrix/override/fallback/invalid-value
  real-host results, teardown vs. forced-cleanup distinction, residue
  verification, static validation, Linux-boundary deferral, remaining
  risks). Corrected Stage 3F.5.6's "seven runs"/7/7 wording to eight
  runs/8/8 (the table there already had 8 rows; only the prose undercounted
  it).
- `.ai/cc-report.md` — this file.

## Tests

- `git diff --check` — clean.
- `pnpm install --frozen-lockfile` — clean.
- `pnpm check:version` — clean.
- `pnpm check:hygiene` — 8/8 clean.
- `pnpm test:scripts` — 237/237 passed.
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm --filter @rack-inventory-studio/desktop test` — 1249/1249 passed,
  60 files (includes the new/updated resolver and shared-adapter tests
  above).
- `cargo fmt --all -- --check` — clean.
- `cargo clippy --workspace -- -D warnings` — clean.
- `cargo test --workspace` — 104 tests passed (19 + 49 + 36 across
  `ris_core`/`ris_git`/`ris_import`; `ris_repository`/`ris_validation` and
  doc-tests have none), no regressions. No application/Rust source changed
  in this stage, so this is a no-op-expected confirmation run.

### Real-host WDIO validation (Windows + WSL2 Ubuntu + Docker Engine 29.4.3)

Windows preflight (before the matrix): `wsl.exe --status`/`--list
--verbose` resolved `Ubuntu` (WSL2); `docker info` inside it reported
Engine 29.4.3 running; a throwaway `docker run -p 127.0.0.1::PORT`
container's published port was reachable from Windows and removed cleanly;
`/mnt/c` mounted and the fixture directory reachable through it; no
`ris.e2e.fixture=git-ssh` container, no stale app/driver process, ports
4444/4445 clear.

| Group | Provider(env) | Specs × runs | Result |
|-------|----------------|---------------|--------|
| Individual unset-provider runs | unset -> container | 3 (one per spec) | 3/3 PASS, resolved=container |
| 5×3 stability matrix | unset -> container | 15 (5 iterations × 3 specs) | 15/15 PASS, resolved=container |
| Explicit container override | container | 1 (`git-clone-workflows`) | PASS, resolved=container |
| Explicit native fallback | native | 3 (one per spec) | 3/3 PASS, resolved=native |
| Invalid provider (isolated) | invalid | 1 (`git-clone-workflows`) | Failed before fixture creation, as required |

All 22 passing runs reported `ports_free=true` and the pre-existing
`PASS_WITH_FORCED_CLEANUP` runner categorization (same
`tauri-driver.exe`/`msedgedriver.exe` teardown-timing quirk already
documented in Stage 3F.5.6, unrelated to this change, identical regardless
of provider). Fixture-level teardown (`containerVerifiedAbsent` /
native cleanup with no errors) is reported separately from — and is not
conflated with — that runner-level forced-cleanup classification. The
invalid-provider run was re-run in isolation after an initial attempt hit
port contention from being started concurrently with the still-running
matrix (see Risks).

Post-matrix residue check found two orphaned `tauri-driver.exe`/
`msedgedriver.exe` processes not held by ports 4444/4445 at the time of the
check (the canonical runner's forced cleanup targets by current port
ownership, so an early orphan that stopped holding the port before a later
run's cleanup check is never targeted — a pre-existing gap in
`scripts/run-wdio-performance-benchmark.mjs`, not introduced by this
change). Terminated manually; host reverified fully residue-free (no
container, no stale process, ports clear) before static validation.

## Risks

- `scripts/run-wdio-performance-benchmark.mjs`'s forced-cleanup logic
  targets by current port ownership and can miss an orphaned driver
  process from an earlier run once that process no longer holds the port —
  reproduced during this stage's own validation matrix (see Tests above).
  Not new, not introduced by this change, but now documented with concrete
  reproduction evidence. Left for a future infrastructure stage.
- Running two `run-wdio-e2e.mjs` invocations concurrently is unsafe (both
  bind fixed ports 4444/4445); hit once during this stage's own validation
  and resolved by re-running in isolation. A process-discipline note for
  future runs of this matrix, not a defect in the reviewed change.
- Container-provider Windows prerequisites (WSL2 + Docker Engine inside
  it) are now required for the *default* path on every Windows contributor
  machine and CI runner that exercises these three specs — `native`
  remains a fully-supported explicit fallback for hosts without them.

## Not done

- Did not remove the native fixture or any of its Windows-specific
  compatibility logic (ForceCommand/Git-Bash/ACL handling).
- Did not repair `support/git-remote.ts`'s remaining `existsSync()` sites.
- Did not add Linux-native Docker execution or remove any `/mnt/c`
  assumption — explicitly deferred to Stage 3F.5.8.
- Did not change container lifecycle architecture, the container image, or
  SSH authentication.
- Did not add retries, sleeps, or weaken any assertion or timeout.
- Did not fix the `scripts/run-wdio-performance-benchmark.mjs`
  port-ownership forced-cleanup gap found during validation — out of this
  stage's scope (see Risks).
- Did not merge to `development`, run the full release gate, or
  tag/publish a release.
- Left `apps/desktop/src-tauri/Cargo.toml`'s pre-existing working-tree
  modification (a CRLF/LF normalization artifact with an empty `git diff`,
  present before this stage started) untouched and unstaged — unrelated to
  this stage's scope.

## Suggested next step

Stage 3F.5.8: Linux-native Docker portability — direct Linux Docker CLI
execution, removing the `/mnt/c` assumption, `xvfb`/WebKitWebDriver
validation, Linux CI validation, and (only after that's proven) a default
container provider on Linux. Do not begin this until it is separately
scoped and approved, per this stage's own explicit boundary.
