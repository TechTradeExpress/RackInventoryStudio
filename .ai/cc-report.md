## Summary

Stage 3F.5.5-R1 RP: a strict review of Stage 3F.5.5 found two issues. (1)
The new shared adapter's native-setup failure path silently discarded
native cleanup failure diagnostics — the same bug class Stage
3F.5.4-R1/R2/R3 had already closed for the container provider's own atomic
init, just not yet applied to the new native adapter. (2) Stage 3F.5.5 was
marked COMPLETE despite native `git-clone-workflows` never passing (4
hangs, 0 passes) — real, valuable root-cause evidence that the hang
predates the migration is not the same thing as a passed gate, and the
stage's own verdict conflated "the container migration is implemented" with
"every required validation passed."

Fixed: `createGitRemoteFixture()`'s `configureNativeSsh()`-failure path now
mirrors `createContainerRemoteFixture()`'s own atomic-init diagnostics
exactly (reusing its `ErrorWithCleanupDiagnostics` shape) — the original
setup error stays primary; a subsequent cleanup failure is attached as
`cleanupDiagnostics`, never swallowed. Added an injectable
`CreateGitRemoteFixtureDeps` seam and 12 new unit tests
(`git-remote-fixture.test.ts`, auto-discovered by the existing vitest
config). Hardened the container seed push to an explicit full refspec
(`refs/heads/<branch>:refs/heads/<branch>`).

Performed a bounded, confirmed-clean-environment investigation of the
native `git-clone-workflows` hang (this doubled as the RP-required
post-repair validation attempt) and found something more precise than
Stage 3F.5.5's own characterization: `rack-inventory-studio-desktop.exe`
itself reports `Responding: False` with near-zero CPU — a genuine Windows
message-loop deadlock **inside the application binary**, not a
WDIO/Tauri-service driver-launch flake. The WebDriver session and TCP
layer are healthy throughout. This remains Outcome B (still unresolved) —
no safe, narrow test-infrastructure fix exists for an application-level
deadlock, and fixing application code is out of both this RP's and Stage
3F.5.5's scope.

**Repair status: STAGE 3F.5.5-R1 COMPLETE.**

**Parent stage status: STAGE 3F.5.5 INCOMPLETE — NATIVE CLONE VALIDATION UNRESOLVED.**

Container-provider migration for all three specs remains fully implemented
and validated (Stage 3F.5.5's original 15/15 combined-matrix result, plus
this RP's own fresh single-run regression, all passed) — that evidence is
not discarded by the corrected parent-stage status.

## Files changed

- `apps/desktop/e2e-wdio/support/git-remote-fixture.ts` — added
  `CreateGitRemoteFixtureDeps` (injectable seam) and
  `defaultCreateGitRemoteFixtureDeps`; `createGitRemoteFixture()` now takes
  an optional `deps` parameter; the native `configureNativeSsh()`-failure
  path rewritten to preserve the original error instance and attach
  `cleanupDiagnostics` (imported from `container-git-remote.ts`) on a
  subsequent cleanup failure instead of `.catch(() => {})`.
- `apps/desktop/e2e-wdio/support/git-remote-fixture.test.ts` (new) — 12
  tests covering container pass-through, native prerequisite-missing,
  native setup success with full argument-wiring verification, native
  configure-failure (successful/failed/non-`Error` cleanup), ready-fixture
  cleanup mapping, no-partial-fixture, and `server.remotesParent`
  argument-scoping.
- `apps/desktop/e2e-wdio/support/container-git-remote.ts` —
  `seedContainerBareRemoteFromLocalRepo`'s push refspec changed from
  `${branch}:${branch}` to `refs/heads/${branch}:refs/heads/${branch}`.
- `docs/E2E_WDIO_PLAN.md` — corrected Stage 3F.5.5's own verdict and
  supporting claims; new "Stage 3F.5.5-R1" section.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1242 tests, 60
  files, all passed (was 1230/59 before this RP; +12 tests, +1 file —
  `git-remote-fixture.test.ts`, auto-discovered by the existing vitest
  glob, no configuration change needed).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm install --frozen-lockfile` / `pnpm check:version` /
  `pnpm check:hygiene` (8/8) / `pnpm test:scripts` (237/237) — all clean.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` / `cargo clippy --workspace -- -D warnings`
  / `cargo test --workspace` — all clean (no Rust files touched).

## Container regression

Fresh single-process runs, `RIS_E2E_GIT_REMOTE_PROVIDER=container`:

- `git-remote-workflows`: passed, 32s.
- `git-clone-workflows`: passed **3/3** (26-30s each) — run three times
  because the seeding refspec changed.
- `git-diverged-pull`: passed, 25s.

All teardowns conclusive; no residue after any run. A fresh 5-iteration
matrix was not re-run — not required, since this RP does not alter
container lifecycle architecture and Stage 3F.5.5 already passed 15/15.

## Native regression

- `git-remote-workflows`: passed, 20s.
- `git-diverged-pull`: passed, 14s.
- `git-clone-workflows`: **hung** — the single required post-repair
  fresh-process attempt (launched with a confirmed-clean environment: no
  lingering driver/app processes, ports 4444/4445 free beforehand). Per
  the RP's own branching rule, a second attempt is required only if the
  first *passes*; since it hung, no further attempts were made. Not
  reported as passed.

## Native clone hang investigation

Traced `@wdio/tauri-service`'s `get_window_states` call into its own
source (`ensureActiveWindowFocus` in `node_modules/@wdio/tauri-service`) —
a per-command focus-check hook triggered by the first relevant WebDriver
command of any session (`getTitle`, `$`, `elementClick`, etc.), not a
one-time pre-`before()` diagnostic as Stage 3F.5.5 had characterized it.

Captured bounded diagnostics for the 5th reproduction (via
`Get-CimInstance Win32_Process` for exact PIDs/command lines of every
`node.exe`/`tauri-driver.exe`/`msedgedriver.exe`/app process, `netstat`
for port state, and `Get-Process`/`Responding` for the application
process):

- Driver layer healthy: `tauri-driver.exe` listening on 4444, established
  connection to `msedgedriver.exe` on 4445, `msedgedriver.exe` itself with
  an established connection to the application.
- **`rack-inventory-studio-desktop.exe`: `Responding = False`, CPU time
  0.125s** (near-zero — not a slow/busy operation, a genuine stalled
  Windows message loop).

Conclusion: the hang is an application-binary-level deadlock, not a
WDIO/Tauri driver-launch flake. `get_window_states` times out because the
deadlocked app never answers the Tauri IPC call — a symptom, not the
cause. **Outcome B (still unresolved)**: no safe, narrow
test-infrastructure fix exists for an in-process application deadlock;
fixing application code is out of scope for both this RP and the parent
migration stage. This is a more precise, better-evidenced characterization
than Stage 3F.5.5's own "WDIO/Tauri driver-launch hang" — still confirmed
pre-existing (reproduces on the unmodified pre-migration file) and still
blocking for this one spec/provider combination.

## Parent Stage 3F.5.5 completion status

- **A. Migration implementation**: container-provider migration for all
  three SSH specs is implemented and validated — Stage 3F.5.5's original
  15/15 combined-matrix result stands, plus this RP's own fresh regression
  (5/5 container runs, including 3/3 for the refspec-changed clone seed).
- **B. Parent-stage gate**: native `git-clone-workflows` has never passed
  (5 attempts total across both stages, 5 hangs) — the original Stage
  3F.5.5 completion criteria are not all met. This RP does not
  self-authorize a waiver.
- **C. Repair stage**: this RP's own scope is complete.

## Default provider decision

Unchanged — `native` remains the default. Reasons (not the clone flake as
primary justification, per this RP's own instruction): the default switch
was always deferred to a dedicated future stage; the container path is
validated only on this local host, not yet in CI; developer/CI rollout
needs explicit documentation; and parent Stage 3F.5.5 now has a
confirmed-unresolved required native gate. Native's flakiness here is
native technical debt, not evidence against the container path — the
container path remains the more thoroughly validated one.

## Resource residue verification

After all real-host execution in this RP: no `ris.e2e.fixture=git-ssh`
container, no `sleep 86400` keep-alive process, no `node.exe`/
`tauri-driver.exe`/`msedgedriver.exe`/app-binary process, no `sshd`
process, ports 4444/4445 both clear (no `LISTENING` entries), and every
run-specific work directory (with its `ssh-remote-command.env`) removed
from the OS temp root — verified directly via `docker ps`, `pgrep`,
`tasklist`, and `netstat`, not solely via hook log messages.

## Risks

- Native `git-clone-workflows` remains blocked by a genuine application-level
  deadlock on this host — root cause is now much better characterized
  (message-loop hang, not driver flake) but not fixed; that would require
  application-level debugging, out of scope here.
- `support/git-remote.ts`'s three `existsSync()` sites remain unrepaired
  (unchanged from R5).
- Everything else carried forward from Stage 3F.5.4/R1-R5 and Stage
  3F.5.5: WSL2 idle-shutdown workaround, `/mnt/c` automount assumption,
  keep-alive "stopped" meaning "didn't throw," the intermittent UI-open
  flake.

## Not done

- Did not fix the native `git-clone-workflows` application deadlock — out
  of scope (application code); reported with concrete new diagnostic
  evidence instead.
- Did not self-authorize a waiver for the unresolved native clone gate.
- Did not flip the default provider.
- Did not remove the native fixture or retrofit `git-remote-workflows.e2e.ts`
  onto the shared adapter.
- Did not fix `support/git-remote.ts`'s `existsSync()` sites.
- Did not run a new 5-iteration container matrix (not required; container
  lifecycle architecture unchanged).
- Did not restart the full Windows WDIO Gate, merge to `development`, or
  tag/publish a release.

## Suggested next step

The native `git-clone-workflows` gate needs one of: (a) an application-level
debugging investigation into the message-loop deadlock (attach a debugger
or add targeted app-side diagnostics to `rack-inventory-studio-desktop.exe`
during a hung repro), or (b) an explicit human waiver accepting the
container-provider validation as sufficient for this stage's completion,
given native remains available as a documented fallback for the other two
specs. Once either resolves, a dedicated default-provider-switch stage
(flip `resolveGitRemoteProvider()`'s default to `container`, validate in
CI) becomes the natural next stage.
