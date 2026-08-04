## Summary

Stage 3F.5.5 NSP: migrated the two remaining Git-over-SSH WDIO specs
(`git-clone-workflows.e2e.ts`, `git-diverged-pull.e2e.ts`) to support the
containerized Git-over-SSH fixture alongside the native fixture, completing
the migration `git-remote-workflows.e2e.ts` started in Stage 3F.5.4. All
three specs now support `RIS_E2E_GIT_REMOTE_PROVIDER=container`/`native`
identically, with scenario meaning unchanged in both migrated specs.

Added: `support/git-remote-fixture.ts`, a shared provider-neutral adapter
(`createGitRemoteFixture()`) extracting the provider-selection pattern
`git-remote-workflows.e2e.ts` already proved, avoiding a third near-identical
copy for the two new specs. `git-remote-workflows.e2e.ts` itself is left
untouched (already migrated/validated; not worth retrofitting for
uniformity alone). Added `seedContainerBareRemoteFromLocalRepo`
(`support/container-git-remote.ts`) — the container counterpart to
`seedBareRemoteFromLocalRepo`, seeding a container-hosted bare remote via a
real SSH push (the same transport the application itself uses) since,
unlike the native fixture's bare remote, the container's isn't reachable as
a local filesystem path. `git-diverged-pull.e2e.ts` needed no new fixture
capability, only one path-domain fix: its pre-pull divergence probe fetch
now targets the fixture's SSH remote URL instead of a raw bare-repo
filesystem path, making it reachable for either provider while remaining
functionally identical for native.

Validated individually (container: all three specs pass, 20-42s each) and
as a combined stability matrix (`RIS_E2E_GIT_REMOTE_PROVIDER=container`,
5 iterations × 3 specs): **15/15 spec executions passed, 5/5 iterations
clean**, no fixture residue afterward. Native-provider validation surfaced
one real finding: `git-clone-workflows` hangs reproducibly at a
pre-spec WDIO/Tauri driver-diagnostics call on this host — confirmed,
via a controlled baseline run of the unmodified pre-migration file, to be
a pre-existing condition unrelated to this migration (`git-diverged-pull`
and `git-remote-workflows` both pass cleanly under native).

**Verdict: STAGE 3F.5.5 COMPLETE — READY FOR NATIVE FIXTURE RETIREMENT DECISION.**

## Files changed

- `apps/desktop/e2e-wdio/support/git-remote-fixture.ts` (new) —
  `GitRemoteFixture` interface, `createGitRemoteFixture()`. No WebdriverIO
  imports, no scenario assertions; a thin pass-through to each provider's
  own already-hardened lifecycle.
- `apps/desktop/e2e-wdio/support/container-git-remote.ts` — new
  `seedContainerBareRemoteFromLocalRepo` (real SSH push + `docker exec`
  HEAD fix); `seedBareRemote` added to `ContainerRemoteFixtureHandle` and
  wired into `createContainerRemoteFixture()`; `runGit` (from
  `./local-git`) imported for the push.
- `apps/desktop/e2e-wdio/specs/git-clone-workflows.e2e.ts` — migrated to
  `createGitRemoteFixture()`/`assertFixtureCleanupSucceeded`; all
  `server.*`/direct `git-remote.ts` calls replaced with `fixture.*`
  equivalents. Scenario bodies and assertions unchanged.
- `apps/desktop/e2e-wdio/specs/git-diverged-pull.e2e.ts` — same migration
  pattern; the probe-fetch step now uses `fixture.buildRemoteUrl(bareDir)`
  instead of the raw bare-repo path.
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.5" section.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1230 tests, 59
  files, all passed (unchanged from Stage 3F.5.4-R5 — this stage's changes
  are entirely in `e2e-wdio/`, not covered by the vitest suite's file
  selection beyond `container-git-remote.test.ts`, which is itself
  unaffected by this stage's additions — see rationale below).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean (covers
  `src/` only; `e2e-wdio/` has no dedicated `tsc` gate in this repo, same
  as every prior Git-SSH stage).
- `pnpm install --frozen-lockfile` / `pnpm check:version` /
  `pnpm check:hygiene` (8/8) / `pnpm test:scripts` (237/237) — all clean.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` / `cargo clippy --workspace -- -D warnings`
  / `cargo test --workspace` — all clean (no Rust files touched).
- **No new unit tests added.** `seedContainerBareRemoteFromLocalRepo` and
  `createGitRemoteFixture()` are real-process orchestration (a real `git
  push`, `docker exec`, provider branching composed entirely of
  already-unit-tested primitives — `resolveGitRemoteProvider`,
  `createContainerRemoteFixture`, `startRemote`/`configureSsh`/`cleanup`),
  matching this codebase's existing precedent: none of
  `container-git-remote.ts`'s other administrative functions
  (`createContainerBareRemote`, `pushSimulatedContainerRemoteCommit`, etc.)
  have synthetic unit tests either — they're proven via real-host
  validation, which both new capabilities received extensively (below).
  Forcing dependency injection into either just to unit-test them would
  restate their own composition, not test new logic.

## Individual container runs

- `git-remote-workflows`: passed, 26-42s across this stage's multiple runs.
- `git-clone-workflows`: passed, 23-40s.
- `git-diverged-pull`: passed, 20-37s.

All teardowns conclusively successful; no residue after any individual run.

## Individual native runs

- `git-remote-workflows` (unmodified): passed, 14-20s, multiple runs.
- `git-diverged-pull`: passed, 9s, first attempt.
- `git-clone-workflows`: **hung** on every attempt (4 total: 2 against the
  migrated file, 1 against the migrated file after an intervening
  successful `git-remote-workflows`-native environment-health probe, 1
  against the original pre-migration file restored via `git stash`) — see
  "Root-cause finding" below.

## Root-cause finding: native git-clone-workflows hang

The hang occurs inside WDIO/`@wdio/tauri-service`'s own pre-spec session
diagnostics (`get_window_states`, a generic `execute/async` WebDriver call)
— before `git-clone-workflows.e2e.ts`'s `before()` hook, or any of its own
code, ever runs. Diagnosis performed:

1. Two attempts against the migrated file both hung identically.
2. An intervening run of the **unmodified** `git-remote-workflows.e2e.ts`
   under native passed cleanly (14s) — proving the environment itself
   (driver, WebView2, ports) was healthy at that moment, ruling out a
   session-wide degradation explanation.
3. A third attempt against the migrated file hung again, identically.
4. `git-clone-workflows.e2e.ts` was temporarily reverted to its
   pre-migration `HEAD` content via `git stash push -- <file>` and run
   again under native: **it hung identically** — conclusive proof this is
   a pre-existing, host-specific condition, not caused by this stage's
   migration. The stash was then popped to restore the migration.

All hung attempts were killed via `taskkill /T /F` on the top-level
process tree (verified via `Get-CimInstance Win32_Process` command-line
inspection to identify exact PIDs) after confirming no forward progress in
the log for 30-60s; ports 4444/4445 and all related processes were
confirmed clear before each subsequent attempt.

This is reported, not fixed — root-causing a WDIO/Tauri driver-launch flake
specific to one spec file on one host is outside this migration stage's
scope, and the RP's own instruction is explicit: do not add retries to
hide a failure, and do not weaken teardown assertions to route around it.
The container-provider path for this exact spec is fully validated (5/5 in
the combined matrix, plus individual passes), so this does not block the
container-provider migration's own completion.

## Combined five-iteration container matrix

`RIS_E2E_GIT_REMOTE_PROVIDER=container`, all three specs run sequentially
per iteration (the orchestration script only honors its last `--spec` flag
when repeated, so the matrix was driven by an explicit shell loop, not a
single multi-spec invocation), five iterations, continue-on-failure:

| Iteration | git-remote-workflows | git-clone-workflows | git-diverged-pull |
|---|---|---|---|
| 1 | PASS 41s | PASS 40s | PASS 36s |
| 2 | PASS 42s | PASS 39s | PASS 35s |
| 3 | PASS 40s | PASS 40s | PASS 36s |
| 4 | PASS 42s | PASS 39s | PASS 37s |
| 5 | PASS 40s | PASS 40s | PASS 37s |

**15/15 spec executions passed, 5/5 iterations clean.** Every run's own log
confirmed conclusive teardown (`cleaned up container ...`, the
zero-errors log branch — never the error-count branch). Independently
verified after the matrix completed: `docker ps -a --filter
label=ris.e2e.fixture=git-ssh` empty, no `sleep 86400` keep-alive process,
all 15 run-specific work directories (and their `ssh-remote-command.env`
files) removed from the OS temp root.

One unrelated container was found and removed during this validation
session (not from the matrix itself): an orphan from an earlier malformed
matrix-invocation attempt (`run-wdio-e2e.mjs --spec A --spec B --spec C`
silently only honors the last `--spec`) that was force-killed via
`taskkill` mid-run, before its own `after()` cleanup hook could execute —
collateral from that forceful termination, not a fixture teardown defect.
Removed via `docker rm -f` before the matrix's own residue check.

## Default provider decision

Kept `native` as the default (`resolveGitRemoteProvider()` unchanged).
This stage's plan/documentation does not commit to flipping the default as
part of this migration, and the native `git-clone-workflows` driver-launch
flake (above) means flipping now would be premature regardless — reported
explicitly per this stage's own instruction, deferred to a dedicated
future default-switch stage. Both explicit overrides
(`RIS_E2E_GIT_REMOTE_PROVIDER=container`/`native`) remain fully supported.

## Risks

- The native `git-clone-workflows` driver-launch hang (root-caused as
  pre-existing but not resolved) blocks native-provider validation for
  that one spec on this host. Does not affect the container provider.
- `support/git-remote.ts`'s three `existsSync()`-as-authority sites
  (documented in Stage 3F.5.4-R5) remain unrepaired — unchanged, not
  newly introduced.
- Everything else carried forward from Stage 3F.5.4/R1-R5: WSL2 idle-shutdown
  workaround, `/mnt/c` automount assumption, keep-alive "stopped" meaning
  "didn't throw," the intermittent UI-open flake.

## Not done

- Did not flip the default provider to `container` — explicitly deferred,
  see "Default provider decision" above.
- Did not fix the native `git-clone-workflows` driver-launch flake — out
  of this migration stage's scope; reported with full diagnostic evidence.
- Did not fix `support/git-remote.ts`'s `existsSync()` sites.
- Did not remove the native fixture, `support/git-remote.ts`, Windows
  OpenSSH-server branches, or Git Bash/ForceCommand/ACL compatibility
  logic.
- Did not change application code, production Git commands, or the
  container image.
- Did not restart the full Windows WDIO Gate, merge to `development`, or
  tag/publish a release.

## Suggested next step

Root-cause the native `git-clone-workflows` driver-launch hang (likely a
targeted, isolated investigation — e.g. compare msedgedriver/WebView2
version pinning, or a startup-ordering race specific to this spec's binary
launch) as its own small repair pass. In parallel or after, a dedicated
default-provider-switch stage can flip `resolveGitRemoteProvider()`'s
default to `container` once native `git-clone-workflows` is resolved (or
explicitly waived) and CI validates the container path — at that point the
native fixture retirement recommendation from this stage's docs section
becomes actionable.
