## Summary

Stage 3F.5.6: root-caused and fixed the native `git-clone-workflows`
application hang that Stage 3F.5.5-R1 left unresolved.

Captured a live symbolized thread-stack trace (via `cdb.exe -pv -p <pid>`,
a non-invasive live attach that doesn't require elevation, against a
locally-built PDB) during a reproduced hang. It proved — not inferred —
the exact blocking chain: `clone_repository_cmd` → `ris_git::clone()` →
`std::process::Command::output()` → `WaitForMultipleObjects`, running
synchronously on the WebView2 message-dispatch (UI/event-loop) thread.
That same thread also services `@wdio/tauri-service`'s own
`get_window_states` health-check IPC call, so a slow-but-finite clone
under real resource contention presented to WDIO as a total application
hang rather than a slow command.

A standalone reproduction (outside WDIO/Tauri, same native-sshd-fixture
seed-then-clone sequence) completed in 560ms, ruling out "the SSH/
ForceCommand mechanism is broken" as the cause. Direct source comparison
found `push_git_current_branch`/`pull_git_ff_only` (the two operations
used by the two already-passing native specs) are both `async fn` that
offload their blocking git subprocess call to
`tauri::async_runtime::spawn_blocking` — `pull_git_ff_only`'s own doc
comment states why: "so the WebView remains responsive." `clone_repository_cmd`
was a plain synchronous `fn` with no such offloading.

**Fix**: converted `clone_repository_cmd` to `async fn`, wrapping both the
blocking `ris_git::clone()` call and the post-clone `open_repository()`
disk read in `spawn_blocking`, mirroring the existing, already-reviewed
push/pull pattern exactly. No sleeps, retries, timeout increases, or
weakened assertions.

**Validated**: native `git-clone-workflows` now passes 3/3 consecutively
(11-12s each, down from a ~12.5-minute hang/timeout), plus 1/1 each of
native `git-remote-workflows`/`git-diverged-pull` and all three specs
under the container provider — 7/7 real-host runs, all clean teardown, no
residue.

**Stage 3F.5.6 status: COMPLETE — ROOT CAUSE FIXED.**

**Parent Stage 3F.5.5 status: COMPLETE — READY FOR DEFAULT-PROVIDER DECISION.**

Per this stage's own completion rule, all required native/container
regressions plus the full static validation suite pass, so the
previously-blocking gate (native clone never passing) is now closed. The
default provider itself was not flipped — that remains a deliberately
separate future stage.

## Files changed

- `apps/desktop/src-tauri/src/commands/repository.rs` — `clone_repository_cmd`
  converted from a synchronous `pub fn` to `pub async fn`
  (`state: State<'_, AppState>`); the blocking `ris_git::clone()` call and
  the post-clone `open_repository()` disk read are now each run inside
  `tauri::async_runtime::spawn_blocking`, mirroring
  `push_git_current_branch`/`pull_git_ff_only` in `commands/git.rs`. Added
  a doc comment explaining why (UI-thread responsiveness).
- `apps/desktop/e2e-wdio/specs/git-clone-workflows.e2e.ts` — doc-comment-only
  correction: the audit note describing `clone_repository_cmd` as
  synchronous was directly superseded by this fix; updated to describe the
  new async/`spawn_blocking` behavior and point at the Stage 3F.5.6
  investigation. No test logic, assertions, or timeouts changed.
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.6" section: reproduction
  matrix, dump-capture method, exact symbolized execution boundary,
  comparative analysis (clone vs. push/pull), root cause, fix, regression
  coverage rationale, full real-host validation table, static validation
  results, and corrected parent Stage 3F.5.5 status. Marked the prior
  "STAGE 3F.5.5 INCOMPLETE" line as superseded rather than rewritten.
- `.ai/cc-report.md` — this file.

## Tests

- `cargo check` (desktop crate) — clean.
- `cargo fmt --all -- --check` — clean (after `cargo fmt` applied
  formatting to the new code in `repository.rs`).
- `cargo clippy --workspace -- -D warnings` — clean.
- `cargo test --workspace` — all passed (no regressions; no new Rust
  test added — see rationale below).
- `git diff --check` — clean (two harmless CRLF-normalization warnings
  from git's own autocrlf handling, not real conflicts; `Cargo.toml` shows
  as modified in `git status` but is byte-identical to `HEAD` — an
  index/eol artifact, not a real change, left unstaged).
- `pnpm install --frozen-lockfile` — clean.
- `pnpm check:version` — clean.
- `pnpm check:hygiene` — 8/8 clean.
- `pnpm test:scripts` — 237/237 passed.
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm --filter @rack-inventory-studio/desktop test` — 1242/1242 passed,
  60 files.
- `node scripts/build-wdio-plugin-binary.mjs` — rebuilt the WDIO test
  binary with the fix; succeeded.

### Real-host WDIO validation (fresh binary, clean environment verified
before every run: no leftover app/driver process, ports 4444/4445 clear)

| Spec | Provider | Result | Runtime |
|------|----------|--------|---------|
| `git-clone-workflows` | native | PASS (1/3) | 12s |
| `git-clone-workflows` | native | PASS (2/3) | 12s |
| `git-clone-workflows` | native | PASS (3/3) | 11s |
| `git-remote-workflows` | native | PASS | 14s |
| `git-diverged-pull` | native | PASS | 9s |
| `git-clone-workflows` | container | PASS | 25s |
| `git-remote-workflows` | container | PASS | 26s |
| `git-diverged-pull` | container | PASS | 21s |

All seven runs: `ports_free=true`, no residual app/driver/`sshd` process.
Every run also reported the runner's own `PASS_WITH_FORCED_CLEANUP`
benchmark categorization — a pre-existing driver-process teardown-timing
quirk in `scripts/run-wdio-performance-benchmark.mjs` (invoked internally
by `scripts/run-wdio-e2e.mjs` for every spec run), identical across all
seven runs regardless of spec/provider, confirming it predates and is
unrelated to this fix.

### Regression coverage rationale

No new Rust-level unit test was added. This codebase has no existing
harness for invoking a `#[tauri::command]` outside a running Tauri app,
and a test that only asserts "this function is `async`" or "calls
`spawn_blocking`" would merely assert new implementation text. The
existing native `git-clone-workflows.e2e.ts` spec (unmodified except the
superseded doc comment) is real, non-synthetic, end-to-end regression
coverage: it reliably hung on the pre-fix implementation (5/5
reproductions across this and the parent stage) and now passes reliably
(3/3 post-fix).

## Diagnostic artifacts (not committed)

All temporary diagnostics for this investigation live under
`%LOCALAPPDATA%\Temp\stage-3f.5.6\` on the local investigation host and
were never added to Git, per this stage's evidence-handling rule:

- `control1-live1.dmp` — full memory dump captured via `cdb.exe .dump /ma`
  during a reproduced hang. **108.3 MB (113,511,012 bytes).**
- `control1-cdb1.txt` / `control1-cdb2-symbols.txt` — unsymbolized and
  PDB-symbolized thread-stack dumps; the symbolized thread-0 stack is the
  evidence behind this report's root-cause claim.
- `control1-processes.txt`, `control1-app-metrics-1.txt`,
  `control1-windows.txt`, `control1-children.txt` — process list, app
  responsiveness metrics, Win32 window enumeration, child-process query.
- `enum-windows.ps1` — the P/Invoke window-enumeration script used for the
  hidden-modal-dialog check.
- `standalone-repro.mjs` / `.log` / `2.log` — the isolated seed+clone
  reproduction used to rule out the SSH/ForceCommand mechanism.
- `native-clone-pass{1,2,3}.log`, `native-remote-workflows.log`,
  `native-diverged-pull.log`, `container-{clone,remote-workflows,
  diverged-pull}.log` — the eight post-fix real-host validation run logs.

No `.dmp`, private keys, env secrets, WebView2 profile data, or
investigation-only binaries were committed.

## Risks

- The `spawn_blocking` fix does not add askpass/SSH-passphrase wiring to
  `clone_repository_cmd` (it still has none) — this was already a known,
  documented, pre-existing gap noted in the spec's own doc comment and is
  unrelated to this stage's scope; not introduced or worsened here.
- The exact reason the underlying git-upload-pack/SSH round trip is slow
  enough under real WDIO+WebView2 contention to matter (vs. the 560ms
  standalone timing) was not independently isolated further — this became
  moot once the fix was applied, since a merely-slow operation now
  completes well within the spec's existing tolerance (observed p99 well
  under 2.5s across all seven post-fix runs).
- `PASS_WITH_FORCED_CLEANUP` (driver-process teardown-timing) is a
  pre-existing runner-level quirk observed on every run in this
  investigation, native and container alike — not new, not blocking, and
  out of this stage's scope to fix.
- Everything carried forward from Stage 3F.5.4/R1-R5 and 3F.5.5/R1 that
  this stage did not touch: `support/git-remote.ts`'s three unrepaired
  `existsSync()` sites, the WSL2 idle-shutdown workaround, the
  intermittent UI-open flake.

## Not done

- Did not flip `resolveGitRemoteProvider()`'s default — remains a
  deliberately separate future stage per this stage's own non-objective.
- Did not remove the native fixture.
- Did not add askpass/passphrase support to `clone_repository_cmd` — out
  of scope.
- Did not add sleeps, retries, or timeout increases to any spec.
- Did not merge to `development`, run the full release gate, or
  tag/publish a release.
- Did not fix the pre-existing `PASS_WITH_FORCED_CLEANUP` runner quirk —
  unrelated to the proven root cause and out of this stage's scope.
- Did not add a new Rust-level unit test — see "Regression coverage
  rationale" above for why the existing E2E spec is the appropriate
  coverage instead.

## Suggested next step

With Stage 3F.5.5 now COMPLETE — READY FOR DEFAULT-PROVIDER DECISION, the
natural next stage is a dedicated default-provider-switch stage: flip
`resolveGitRemoteProvider()`'s default to `container` and validate the
container path in CI (currently validated only on this local host), per
the non-objective this stage deliberately left alone.
