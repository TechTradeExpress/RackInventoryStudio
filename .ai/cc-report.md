## Summary

Stage 3B.3: Windows WDIO performance experiment — repair pass and finalization.

Branch `experiment/e2e-wdio-windows-performance` from `roadmap/e2e-wdio`
(base SHA `95ea5fd3795b42769da9e7a4907ab2a82e6d9bc6`).

This pass, on the real Windows machine: (1) fixed three review-identified
blockers in the benchmark runner (result semantics conflating test-pass with
cleanup-success; name/time-based process targeting that could kill an
unrelated process; the main A/B experiment itself still incomplete); (2) ran
the full 8-run Windows A/B matrix twice (once before, once after root-causing
and fixing a device-model-selection issue in the core-inventory spec); (3)
determined the underlying cause of the embedded provider's core-inventory
failure to be a genuine `tauri-plugin-wdio-webdriver` click-event-synthesis
gap, not a test race or an application bug. The final
ADOPT EMBEDDED / KEEP EXTERNAL / INCONCLUSIVE call is left to maintainer
review rather than asserted by this pass — see
`docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` §Decision.

## Branch and base

| Item | Value |
|------|-------|
| Branch | `experiment/e2e-wdio-windows-performance` |
| Direct base | `roadmap/e2e-wdio` |
| Base SHA | `95ea5fd3795b42769da9e7a4907ab2a82e6d9bc6` |
| PR | #153 |
| Starting HEAD (this pass) | `ae67784` |
| Final HEAD | `44446a6` |

## Commits (full branch history vs. base)

| SHA | Message |
|-----|---------|
| 8c1b46c | test(e2e): add opt-in WDIO command timing benchmark |
| 170abae | test(e2e): add test-only embedded WebDriver experiment |
| bde24a2 | docs(e2e): record Windows driver performance comparison |
| 7100ebc | fix(e2e): harden Windows WDIO benchmark harness |
| 526647e | fix(e2e): resolve smoke-test blockers found on real Windows execution |
| ae67784 | docs(e2e): record supplementary Linux benchmark results |
| **fc309a8** | **fix(e2e): make Windows benchmark cleanup PID-safe** (this pass) |
| **1390477** | **fix(e2e): give driver processes a natural-teardown grace window** (this pass) |
| **44446a6** | **fix(e2e): close device-model selection race in core-inventory spec** (this pass) |

## Files changed (this pass)

| File | Change |
|------|--------|
| `scripts/run-wdio-performance-benchmark.mjs` | Outcome model: closed enum (`CLEAN_PASS`/`PASS_WITH_FORCED_CLEANUP`/`TEST_FAILED`/`REPORT_INVALID`/`CLEANUP_UNSAFE`/`CLEANUP_FAILED`/`TIMED_OUT`/`INTERRUPTED`); `passed=true` only for `CLEAN_PASS`. PID-safe cleanup: resolves each port's actual `OwningProcess` via `Get-NetTCPConnection`, verifies identity via `Get-CimInstance Win32_Process`, only auto-kills when confirmed new/expected-name/port-owning; ambiguity → `CLEANUP_UNSAFE`, never auto-resolved. Pre-run PID snapshot to exclude pre-existing processes. 5s natural-teardown grace window before declaring cleanup required. Aggregates/comparisons restricted to `CLEAN_PASS` runs; `INSUFFICIENT_CLEAN_RUNS` status when a provider has <2 clean runs for a spec. |
| `scripts/run-wdio-performance-benchmark.test.mjs` | +36 unit tests (66→102): outcome classification, port-ownership resolution, cleanup eligibility (process targeting), PowerShell output parsers. No real `taskkill` invoked in tests. |
| `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` | Added explicit post-selection verification that the device-model trigger reflects the selected model before submitting the device form — closes a previously-silent wrong-data failure mode and revealed the true (driver-level) root cause of the embedded `submit-placement` failure. |
| `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` | Full Windows results: 8-row matrix, cleanup/process-ownership detail, `submit-placement` root-cause writeup, diagnostic A/B comparison, measureStep breakdown, decision criteria table (left open for maintainer review). |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.3 section updated with final Windows results summary; status stays `IN REVIEW`. |
| `.ai/cc-report.md` | This report. |

PR body corrected (via `gh pr edit`, not a repo file change): replaced "no
new dependencies introduced by this PR" with the precise audit-advisory
statement, listed `@wdio/globals` and optional `tauri-plugin-wdio-webdriver`
as new dependencies, and documented the mechanical `ssh_askpass.rs` clippy
fix.

## Windows environment (this pass)

| Item | Value |
|------|-------|
| OS | Windows 11 Pro, build 10.0.26200, x64 |
| CPU / RAM | AMD Ryzen 7 5800X 8-Core (16 logical cores) / 32680 MB |
| Node.js | v22.23.1 |
| Rust | rustc/cargo 1.97.1 |
| Edge | 150.0.4078.83 |
| @wdio/tauri-service | 1.2.0 |
| webdriverio | 9.29.1 |
| tauri-plugin-wdio-webdriver | 1.2.0 |

## Builds

- Regular binary: `target\release\rack-inventory-studio-desktop.exe` —
  `pnpm -C apps/desktop tauri build --no-bundle`, PASS. Confirmed no
  `wdio-embedded` plugin, zero listeners on ports 4444/4445 after a 5s
  run-and-check.
- Embedded binary: `target-embedded\release\rack-inventory-studio-desktop.exe`
  — separate `CARGO_TARGET_DIR`, `--features wdio-embedded`, PASS. Confirmed
  separate from the regular binary (different size/timestamp); generated
  `capabilities/embedded-test.json` gitignored, absent from `git status`.

## Smoke tests

- External app-smoke: `PASS_WITH_FORCED_CLEANUP` (correct test, but
  `tauri-driver.exe`/`msedgedriver.exe` required safe forced cleanup even
  after adding a 5s natural-teardown grace window — confirmed a persistent
  upstream `@wdio/tauri-service` Windows teardown gap, not a race).
- Embedded app-smoke: `CLEAN_PASS` on first attempt.
- Per user decision, `PASS_WITH_FORCED_CLEANUP` was accepted as external's
  practical ceiling on Windows (safely and correctly remediated every time)
  before proceeding to the full matrix, since embedded's own smoke gate was
  cleanly satisfied.

## Full Windows matrix — run twice (final data supersedes first pass)

**First pass** (HEAD `fc309a8`): app-smoke 4/4 as expected (external ×2
`PASS_WITH_FORCED_CLEANUP`, embedded ×2 `CLEAN_PASS`); core-inventory:
external run 1 `PASS_WITH_FORCED_CLEANUP`, embedded run 1 `TEST_FAILED` at
`submit-placement` (matching the Linux/WebKit signal), external run 2
`TEST_FAILED` after 35s due to an unrelated transient network failure
downloading msedgedriver (`tauri-driver exited unexpectedly during startup`),
embedded run 2 `TEST_FAILED` at `submit-placement` again (2/2 reproducible).

Root-caused (see `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` §"submit-placement
root cause"): a device-model dropdown selection in `core-inventory.e2e.ts`
was not verified before submitting the device form. Fixed (commit `44446a6`)
by adding an explicit wait for the model trigger to reflect the selection.
Per the investigation process, the **entire matrix was re-run from scratch**
on the fixed HEAD rather than mixing pre/post-fix data.

**Final pass** (HEAD `44446a6`, canonical data for the doc/PR):

| Spec | External | Embedded |
|------|----------|----------|
| app-smoke (×2) | `PASS_WITH_FORCED_CLEANUP` ×2 | `CLEAN_PASS` ×2 |
| core-inventory (×2) | `PASS_WITH_FORCED_CLEANUP` ×2 (all 9 steps pass both times) | `TEST_FAILED` ×2 (both fail at device-model assignment, before step 7) |

The re-run revealed the true cause: `tauri-plugin-wdio-webdriver`'s click
does not dispatch a real `mousedown` event, so the `onMouseDown`-based
`SearchableSelect` component (`DeviceFormModal`, `PlacePlacementModal`)
cannot be interacted with under the embedded provider. Confirmed a
**provider bug**, reproduced identically on Linux/WebKit and Windows/WebView2
— ruling out a browser-engine-specific quirk. Not fixed in this pass (would
require either patching third-party `tauri-plugin-wdio-webdriver`, out of
this repo, or a production UI change to `SearchableSelect.tsx` with
test-suite-wide blast radius — explicitly deferred to maintainer input).

## Cleanup outcomes (PID-safe verification)

All 4 external runs (2 app-smoke + 2 core-inventory) required forced
cleanup; in every case the runner confirmed the exact owning
`tauri-driver.exe` PID (new, not pre-existing, created within the run
window) and its child `msedgedriver.exe` PID (confirmed via matching
`ParentProcessId`) before killing — `cleanupSucceeded: true` in all 4 cases,
ports verified free immediately after. No embedded run ever required
cleanup. No unrelated process was ever at risk — the eligibility logic never
returned `eligible: true` for a pre-existing or unexpected-name process in
any run this pass.

## submit-placement (final determination)

Not a WebDriver-protocol quirk specific to WebKit or WebView2, not a test
race, not an application defect — a confirmed `tauri-plugin-wdio-webdriver`
click-event-synthesis gap. See `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`
§"submit-placement root cause" for full diagnostics (error text, step
timing, log excerpts, what was/wasn't changed).

## Decision

**PENDING MAINTAINER REVIEW** — by explicit instruction, this pass collected
and analyzed the full dataset but did not assert a final ADOPT EMBEDDED /
KEEP EXTERNAL / INCONCLUSIVE call. Evidence summary: where embedded works
(app-smoke, and 6 of 9 core-inventory steps) it is consistently ~34–35%
faster with ~79–83% lower session startup; it cannot currently complete the
full core-inventory flow due to the confirmed driver bug above. External
completes the full flow correctly but never reaches `CLEAN_PASS` due to a
confirmed, safely-mitigated upstream teardown gap. Full criteria checklist
in `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` §Decision.

## Static validation (this pass, Windows)

```
TypeScript (tsc --noEmit)                           PASS (0 errors)
Vitest                                              PASS (853/853)
Hygiene (check-repo-hygiene.mjs)                    PASS (8/8)
Runner unit tests (node --test)                     PASS (102/102, was 66)
cargo fmt --all --check                             PASS
cargo check --workspace (no feature)                PASS
cargo check --features wdio-embedded                PASS
cargo clippy --workspace -- -D warnings              PASS
cargo clippy --features wdio-embedded -- -D warnings PASS
git diff --check                                    PASS
```

## CI (PR #153, commit fc309a8 push)

```
Frontend checks              PASS
Rust workspace                PASS
Script and hygiene checks     PASS
Version consistency           PASS
Workflow lint                 PASS
Rust dependency audit          PASS
Frontend dependency audit      FAIL (pre-existing, see below)
```

## Dependency audit

4 advisories (`brace-expansion` ×2 high, `fast-xml-parser` ×1 high, 1 low).
Verified directly against `origin/roadmap/e2e-wdio`'s `pnpm-lock.yaml`:
`brace-expansion@1.1.15`, `brace-expansion@2.1.1`, and
`fast-xml-parser@5.9.3` are already present at the same versions in the base
lockfile — no advisory is newly introduced by this PR. The CI "Frontend
dependency audit" job fails because it runs `pnpm audit` unconditionally
(exit 1 on any finding) rather than diffing against base; this is expected,
pre-existing CI behavior unrelated to this PR's changes.

## Not done

- The ADOPT EMBEDDED / KEEP EXTERNAL / INCONCLUSIVE decision itself (by
  explicit instruction — left to maintainer review).
- Fixing `tauri-plugin-wdio-webdriver`'s click-event-synthesis gap (third-party
  dependency, out of this repo) or patching `SearchableSelect.tsx` to work
  around it (production UI change, out of this PR's scope).
- Screenshot capture on the `submit-placement` root-cause investigation's
  final-pass failure point (would require its own spec change).
- `pnpm`/Tauri CLI version capture in the runner's environment probe on this
  machine returned "unavailable" (cosmetic harness gap; the actual `pnpm`/
  `tauri` commands used to build and test all worked correctly).

## Risks

- `tauri-plugin-wdio-webdriver`'s click gap could affect other, not-yet-written
  E2E coverage that relies on `onMouseDown`-based components if embedded is
  ever adopted before the driver issue is fixed upstream.
- External's Windows teardown gap in `@wdio/tauri-service` means every
  external Windows run will show `PASS_WITH_FORCED_CLEANUP`, never
  `CLEAN_PASS`, until that upstream library issue is fixed — any future CI
  gate keyed strictly to `CLEAN_PASS` would need to account for this.
- Dependency audit: 4 pre-existing advisories, no fix available without
  upstream updates (unchanged from prior passes).

## Suggested next step

Maintainer review of `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` §Decision to
make the ADOPT EMBEDDED / KEEP EXTERNAL / INCONCLUSIVE call. If embedded is
of interest despite the current core-inventory gap, the concrete next step
would be either an upstream fix/report against `tauri-plugin-wdio-webdriver`
for its click-event synthesis, or a scoped follow-up PR to make
`SearchableSelect.tsx` (and any other `onMouseDown`-reliant component) also
respond to a plain `click` event — with its own review and full regression
run, independent of this harness-repair PR.

## Working tree

Clean at final HEAD `44446a6` (confirmed via `git status --short`; the only
prior artifact, a CRLF-only line-ending diff on `Cargo.toml`, is unrelated
working-tree noise from `core.autocrlf`, not a content change, and was
excluded from every commit in this pass).
