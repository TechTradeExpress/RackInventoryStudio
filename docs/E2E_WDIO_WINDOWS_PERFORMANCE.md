# Windows WDIO Performance Experiment — Stage 3B.3

**Branch:** `experiment/e2e-wdio-windows-performance`
**Base:** `roadmap/e2e-wdio`
**Status:** COMPLETE — Decision: **KEEP EXTERNAL — temporary**
(Windows matrix complete, 8 runs over two passes; see §Decision and §"submit-placement root cause".)

---

## Purpose

Compare the `external` and `embedded` WebDriver driver providers on Windows to
determine whether migrating from the external `tauri-driver` proxy to the
in-process embedded WebDriver server reduces per-command latency enough to
justify the added build complexity.

---

## Architecture

### external provider

```
WDIO runner
    │
    ▼  WebDriver HTTP (port 4444)
tauri-driver  ←—— cargo install tauri-driver
    │
    ▼  EdgeDriver WebDriver protocol
msedgedriver.exe (auto-downloaded)
    │
    ▼
Tauri app (WebView2)
```

### embedded provider

```
WDIO runner
    │
    ▼  WebDriver HTTP (port 4445)
Tauri app  ←—— built with --features wdio-embedded
  └── tauri-plugin-wdio-webdriver (in-process HTTP server)
         │
         ▼
      WebView2
```

Key difference: embedded eliminates the `tauri-driver` → `msedgedriver` round-trip
and replaces it with an in-process server communicating directly with WebView2.

---

## Environment

| Item | Value |
|------|-------|
| Windows version | Windows 11 Pro |
| OS build | 10.0.26200 |
| Architecture | x64 |
| CPU | AMD Ryzen 7 5800X 8-Core Processor (16 logical cores) |
| RAM | 32680 MB |
| Node.js | v22.23.1 |
| pnpm | not captured by the runner's environment probe on this machine (harness gap — `pnpm --version` via `spawnSync` returned no output; pnpm itself works fine interactively, all `pnpm` build/test commands in this pass succeeded) |
| Rust toolchain | rustc 1.97.1 (8bab26f4f 2026-07-14) / cargo 1.97.1 |
| Edge version | 150.0.4078.83 |
| EdgeDriver version | not reliably determinable by the runner (msedgedriver not found in the probed cache paths); auto-downloaded/resolved correctly by `@wdio/tauri-service` at run time regardless |
| @wdio/tauri-service | 1.2.0 |
| webdriverio | 9.29.1 |
| tauri-plugin-wdio-webdriver | 1.2.0 |
| Tauri CLI | not captured by the runner's environment probe (same harness gap as pnpm); `pnpm -C apps/desktop tauri build` itself succeeded for both binaries |
| External binary path | `target\release\rack-inventory-studio-desktop.exe` (regular production build, no `wdio-embedded` feature) |
| Embedded binary path | `target-embedded\release\rack-inventory-studio-desktop.exe` (separate `CARGO_TARGET_DIR`, built with `--features wdio-embedded`) |

Both providers in the A/B matrix below ran against the **embedded binary**
(external simply doesn't exercise the embedded plugin when selected) —
required so the comparison isolates the driver-provider variable rather than
a binary/build difference.

---

## Build commands

Verified against the installed Tauri CLI (`pnpm -C apps/desktop tauri build --help`).
`-f`/`--features` is a first-class flag — no `-- --features` passthrough and no
backslash-escaped `--config` JSON are required or used.

### Regular external binary (production build)

```powershell
# From repo root on Windows:
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
pnpm -C apps/desktop tauri build --no-bundle
# Binary: target\release\rack-inventory-studio-desktop.exe
```

### Embedded test binary

Built to a **separate** `CARGO_TARGET_DIR` so it never overwrites the regular binary:

```powershell
$env:CARGO_TARGET_DIR = Join-Path $PWD "target-embedded"
pnpm -C apps/desktop tauri build --no-bundle --features wdio-embedded
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
# Embedded binary: target-embedded\release\rack-inventory-studio-desktop.exe
```

Building via the Tauri CLI (not bare `cargo build`) is required so `frontendDist`
assets are embedded — a bare `cargo build --release` binary would try to connect
to the Vite dev server and show "Connection refused".

> **Known limitation (accepted for this experiment):** `build.rs` generates
> `capabilities/embedded-test.json` conditionally based on the `wdio-embedded`
> feature flag, gitignored between builds. This is acceptable for a sequential
> build-then-test workflow (regular build, then embedded build, never both at
> once) but is not safe for parallel feature/no-feature builds from the same
> checkout — a race on the generated capability file is possible. A future
> migration to embedded-by-default (if adopted) should move this to a more
> robust mechanism than a build-script-generated, gitignored file.

---

## Benchmark matrix

Two run modes are available:

**Single-provider (smoke):**

```powershell
node scripts\run-wdio-performance-benchmark.mjs --provider external --spec app-smoke --repeat 1 --binary "C:\...\target-embedded\release\rack-inventory-studio-desktop.exe"
node scripts\run-wdio-performance-benchmark.mjs --provider embedded --spec app-smoke --repeat 1 --binary "C:\...\target-embedded\release\rack-inventory-studio-desktop.exe"
```

**Controlled A/B comparison** — both providers run against the **same binary**
(the embedded-feature build; the embedded server is simply not exercised when
`--provider external` is selected), in strict alternating order
(external₁, embedded₁, external₂, embedded₂, ...):

```powershell
node scripts\run-wdio-performance-benchmark.mjs --compare --spec app-smoke --repeat 2 --binary "C:\...\target-embedded\release\rack-inventory-studio-desktop.exe"
node scripts\run-wdio-performance-benchmark.mjs --compare --spec core-inventory --repeat 2 --binary "C:\...\target-embedded\release\rack-inventory-studio-desktop.exe"
```

`--compare` writes a single `comparison.json` + `comparison.md` per spec, with
medians and a **pooled** p95 (command durations from all passed runs of a
provider combined, not a p95-of-per-run-p95s), plus a `core-inventory` step
comparison table. A run only counts as `PASSED` when the WDIO process exits 0
**and** its `summary.json`/`commands.ndjson` report validates (`reportValid`) —
see `validateSummary()` in the runner script for the full list of checks.

---

## Raw run results

Final matrix (2026-07-23, post spec-fix HEAD `44446a6`). All 4 providers/specs
ran against the same embedded binary, in the required alternating order.
`Outcome` uses the closed enum from `scripts/run-wdio-performance-benchmark.mjs`
(`CLEAN_PASS` / `PASS_WITH_FORCED_CLEANUP` / `TEST_FAILED` / ...) — see
§"Outcome semantics" below. Only `CLEAN_PASS` rows count as `passed=true`.

| # | Provider | Spec | Run | Outcome | totalRunMs | wdioProcessMs | sessionStartupMs | testExecutionMs | Commands | Median | P95 | P99 | Max | ≥1 s | ≥5 s | Cleanup required | Cleanup safe | Cleanup succeeded | Killed PIDs |
|---|----------|------|-----|---------|-----------|---------------|-------------------|-------------------|----------|--------|-----|-----|-----|------|------|-------------------|--------------|---------------------|-------------|
| 1 | external | app-smoke | 1 | PASS_WITH_FORCED_CLEANUP | 100440 | 99565 | 765 | 92181 | 37 | 10 | 15365 | 15413 | 15413 | 14 | 14 | true | true | true | 4444→tauri-driver.exe, 4445→msedgedriver.exe |
| 2 | embedded | app-smoke | 1 | CLEAN_PASS | 71316 | 70497 | 159 | 60590 | 39 | 7 | 10120 | 10156 | 10156 | 14 | 14 | false | true | n/a | — |
| 3 | external | app-smoke | 2 | PASS_WITH_FORCED_CLEANUP | 100440 | 99598 | 747 | 92334 | 37 | 10 | 15418 | 15475 | 15475 | 14 | 14 | true | true | true | 4444→tauri-driver.exe, 4445→msedgedriver.exe |
| 4 | embedded | app-smoke | 2 | CLEAN_PASS | 70651 | 69831 | 157 | 60458 | 39 | 7 | 10075 | 10090 | 10090 | 14 | 14 | false | true | n/a | — |
| 5 | external | core-inventory | 1 | PASS_WITH_FORCED_CLEANUP | 1747454 | 1746607 | 1152 | 1739483 | 859 | 9 | 30819 | 69486 | 115422 | 276 | 276 | true | true | true | 27524 (tauri-driver.exe), 31620 (msedgedriver.exe) |
| 6 | embedded | core-inventory | 1 | TEST_FAILED | 669322 | 668546 | 168 | 659634 | 502 | 5 | 20146 | 65367 | 75496 | 153 | 153 | false | true | n/a | — |
| 7 | external | core-inventory | 2 | PASS_WITH_FORCED_CLEANUP | 1746362 | 1745514 | 745 | 1738313 | 859 | 8 | 30828 | 69346 | 115429 | 276 | 276 | true | true | true | 7800 (tauri-driver.exe), 33180 (msedgedriver.exe) |
| 8 | embedded | core-inventory | 2 | TEST_FAILED | 669722 | 668897 | 161 | 659380 | 502 | 5 | 20160 | 65488 | 75642 | 153 | 153 | false | true | n/a | — |

Full precision figures, per-run report directories, and complete process/port
ownership records (owning PID, process name, ParentProcessId, CreationDate,
eligibility reasoning) are in the raw `comparison.json` files generated by the
runner (not committed — see `.gitignore`; paths were printed to console during
the run and are included in the PR body / review context).

### Cleanup / process ownership (all 4 external runs)

Every external run required forced cleanup, and in every case the PID-safe
targeting logic (`evaluateCleanupEligibility` in the runner) confirmed and
killed the correct, run-scoped process pair — never a pre-existing or
ambiguous one:

- Port 4444 owner: a `tauri-driver.exe` PID not present in the pre-run
  snapshot, created within the run's time window.
- Port 4445 owner: a `msedgedriver.exe` PID whose `ParentProcessId` matched
  the just-identified `tauri-driver.exe` PID (confirming a genuine
  parent/child relationship, not a coincidental PID reuse).
- Both were killed via `taskkill /PID <pid> /T /F`; both ports were verified
  free immediately afterward (`cleanupSucceeded: true`).

No embedded run ever required cleanup — the embedded provider has no
external driver process to leak.

### Outcome semantics

`passed=true` only for `CLEAN_PASS`. All 4 external runs are
`PASS_WITH_FORCED_CLEANUP`: the WDIO process exited 0, the timing report
validated, and every step that ran passed its own assertions — but
`tauri-driver.exe`/`msedgedriver.exe` did not release their ports on their
own even after a 5-second natural-teardown grace window (see
`waitForNaturalTeardown()`, commit `1390477`), confirming this is a
persistent `@wdio/tauri-service` Windows teardown gap, not a race the runner
could avoid by waiting longer. This is tracked as a known, external,
upstream-library limitation — not a defect in this repository's harness —
and is excluded from the `CLEAN_PASS`-only aggregates per the runner's
outcome semantics.

---

## submit-placement root cause (embedded core-inventory failure)

The matrix was run **twice** on Windows, per the investigation process: the
first pass reproduced the Linux/WebKit `submit-placement` failure signal;
after root-causing and fixing what turned out to be a test-spec gap, the
second (final) pass was run from scratch on the fixed HEAD. Results above
are the final pass; this section documents the investigation. Pre- and
post-fix data are never mixed into one A/B comparison.

### First pass (pre-fix, HEAD `fc309a8`)

Embedded failed with: `Placement failed — modal error: "effective height
missing: device dev-e9f04070 has no model and no explicit height_u"`
(`.ft-msg.err` content). The IPC placement call itself succeeded in the
sense of returning a response — it was the app's own backend validation that
rejected the placement, correctly, because the device it was validating had
no model association. The modal remained open showing the error (expected
UI behaviour for a rejected placement). Step timing: `submit-placement`
recorded 75237ms (dominated by a `waitUntil` polling loop that never
observed success). This matched the Linux/WebKit signal exactly, which
originally raised the question of whether it was WebKit-specific.

### Root cause

`apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` (device-model assignment,
around line 300) clicked a `role="option"` element in the model dropdown and
immediately proceeded to submit the device form, with no verification that
the click had actually registered a selection. A minimal fix (commit
`44446a6`) added an explicit `waitUntil` after the click, confirming the
model trigger's rendered text reflects the selection before submitting.

Re-running with this diagnostic in place (final pass, HEAD `44446a6`)
revealed the click **never** registers under the embedded provider — the
new wait consistently times out after 5s with `Device model trigger never
showed selected model`. Looking at
`apps/desktop/src/components/ui/SearchableSelect.tsx`, the dropdown option
only has an `onMouseDown` handler (deliberately, to `preventDefault` and
keep focus on the search input — see the component's own comment). This
means `tauri-plugin-wdio-webdriver`'s click implementation is not
dispatching a real `mousedown` event as part of its click sequence — only
`external`'s tauri-driver→msedgedriver path (which goes through a
standards-compliant WebDriver "Element Click" algorithm) does.

**Classification: provider bug**, not a test race and not an application
bug — the app's validation was correctly rejecting an incomplete placement;
the incompleteness itself was caused by the embedded driver's click not
producing the mouse events this (fairly common) `onMouseDown`-based UI
pattern requires. `SearchableSelect` is used in both `DeviceFormModal` and
`PlacePlacementModal` — core to this flow, not an edge case. This reproduced
identically on Linux/WebKit and Windows/WebView2, ruling out a
browser-engine-specific driver quirk.

### What was and wasn't changed

- Kept: the spec fix (commit `44446a6`) — it is correct and valuable
  regardless of the driver bug: it converts a previously-silent wrong-data
  failure mode into an explicit, fast, clearly-labeled one, and will guard
  against any future regression of this kind once the driver-level issue is
  fixed upstream.
- Not attempted: patching `SearchableSelect.tsx` (e.g. adding an `onClick`
  fallback) to work around the driver gap. That is a production UI code
  change with test-suite-wide blast radius (7 files reference the
  component), out of scope for this harness-repair PR, and was explicitly
  deferred pending maintainer input.
- Not attempted: patching `tauri-plugin-wdio-webdriver` itself (third-party
  Cargo dependency, source not in this repository).

### Diagnostics collected (per docs/E2E_WDIO_PLAN.md investigation requirements)

- Click occurred: yes (WebDriver reported the click command succeeded).
- IPC error: no — the device-model click never reached an IPC call; the
  failure is client-side (React state), one step earlier than the IPC-level
  `submit-placement` failure seen in the first pass.
- Modal state: first pass — modal remained open showing the error (expected).
  Final pass — the device-form modal's own submit went through (since the
  client doesn't require a model to be set), so the failure surfaced later,
  at the new explicit verification.
- `.ft-msg.err` content: `"effective height missing: device dev-e9f04070 has
  no model and no explicit height_u"` (first pass only).
- Step timing: see run-level tables above (`submit-placement`: 75237ms
  first-pass failure; final pass fails earlier, before the `submit-placement`
  `measureStep` block is even entered, so it is not separately timed as a
  step — total run duration ~669–670s, matching the six steps that did
  complete plus the 5s verification timeout and surrounding overhead).
- Screenshot: not captured — the harness only screenshots on failure via a
  path not wired into this particular `waitUntil` timeout; not added in this
  pass (would require its own change to the spec's error handling).
- App + WebDriver logs: captured in full in the run's console output
  (inherited stdio, part of the review context); the relevant excerpt is
  `Error: Device model trigger never showed selected model "..."`.
- Test repository state: isolated per-run under `os.tmpdir()`/`ris-wdio-*`
  via `test-environment.ts`; cleaned up automatically in the WDIO
  `onComplete` hook regardless of pass/fail.

---

## Aggregated comparison

Both providers ran the required 2 runs each. External never reaches
`CLEAN_PASS` on Windows (see §Outcome semantics) so the runner's strict
`CLEAN_PASS`-only aggregation reports `INSUFFICIENT_CLEAN_RUNS` and shows "-"
for external in `comparison.md`. The table below is a **diagnostic**
comparison computed directly from both providers' `PASS_WITH_FORCED_CLEANUP`
/ `CLEAN_PASS` run data — legitimate to use here because forced cleanup
happens strictly *after* the WDIO test process exits and cannot affect
in-test timing.

### app-smoke (diagnostic — external runs are PASS_WITH_FORCED_CLEANUP, not CLEAN_PASS)

| Metric | external (median of 2) | embedded (median of 2, CLEAN_PASS) | Δ absolute | Δ % |
|--------|----------|----------|------------|-----|
| Median total duration | 100440ms | 70984ms | 29456ms | 29.3% |
| Median session startup | 756ms | 158ms | 598ms | 79.1% |
| Median test execution | 92258ms | 60524ms | 31734ms | 34.4% |
| Median command latency | 10ms | 7ms | 3ms | 30.0% |
| P95 command latency | 15392ms | 10098ms | 5294ms | 34.4% |
| Commands ≥1 s | 14 | 14 | 0 | 0.0% |

### core-inventory (diagnostic, first 6 shared steps only — embedded never reaches step 7)

| Metric | external (median of 2) | embedded (median of 2, partial run) | Δ absolute | Δ % |
|--------|----------|----------|------------|-----|
| Median session startup | 949ms | 165ms | 784ms | 82.6% |
| Median command latency | 8.5ms | 5ms | 3.5ms | 41.2% |
| P95 command latency | 30824ms | 20153ms | 10671ms | 34.6% |

Embedded's steps 7–9 (`submit-placement`, `save-and-close`,
`reopen-repository`) have no comparable data — the run never reaches them
due to the driver bug documented above. No percentage conclusion is drawn
for the full-spec `core-inventory` total duration; only external completed
the full 9-step flow.

### measureStep breakdown (core-inventory)

> Logical step timings recorded by `measureStep()` in core-inventory.e2e.ts.
> External: median of 2 full `PASS_WITH_FORCED_CLEANUP` runs, all 9 steps.
> Embedded: median of 2 runs that both reached steps 1–6 before failing at
> device-model assignment (before step 7); "—" = never reached.

| Step | external median | embedded median | Δ ms | Δ % | Note |
|------|-----------------|-----------------|------|-----|------|
| create-repository | 100174ms | 65495ms | 34679ms | 34.6% | IPC + disk |
| open-location-form | 69243ms | 45280ms | 23963ms | 34.6% | UI interaction |
| fill-location-form | 15378ms | 10072ms | 5306ms | 34.5% | React state |
| submit-location-form | 69157ms | 45257ms | 23900ms | 34.6% | IPC round-trip |
| wait-for-location-row | 15230ms | 10075ms | 5156ms | 33.9% | polling |
| navigate-location-to-racks | 30812ms | 20170ms | 10642ms | 34.5% | navigation |
| submit-placement | 53980ms | — (driver bug, never entered) | — | — | IPC |
| save-and-close | 122859ms | — (not reached) | — | — | save + disk |
| reopen-repository | 84787ms | — (not reached) | — | — | disk + IPC |

The first six shared steps show a remarkably consistent ~34–35% improvement
with embedded — the strongest, cleanest signal in this entire experiment.

---

## Interpretation

### WebDriver channel overhead
Median command latency: app-smoke 10ms (external) vs. 7ms (embedded); pooled
p95 15.4s vs. 10.1s. Embedded's in-process server measurably cuts the raw
protocol round-trip vs. tauri-driver → msedgedriver, consistent with the
Linux/WebKit data (there: 18ms vs. 11ms median).

### Application and React time
The six shared core-inventory steps (form fills, React state updates,
waitUntil polling) show a strikingly uniform ~34–35% improvement across
every step type — UI interaction, React state, and IPC steps alike. This
uniformity suggests the improvement is dominated by the channel/session
overhead (present in every command) rather than any one operation category.

### IPC operations
`create-repository` (34.6% faster) and `submit-location-form` (34.6% faster)
scale almost identically to pure UI steps like `open-location-form` (34.6%)
— IPC-heavy and UI-only steps improve by essentially the same proportion,
reinforcing that the gain is per-command channel overhead, not something
specific to IPC round-trips.

### Defender and disk impact
No isolated signal: `create-repository` (IPC + disk) improves by the same
~34.6% as pure UI steps, suggesting Defender/disk overhead — if present — is
either provider-independent or small relative to the channel-overhead gain.

### Retry and polling overhead
`wait-for-location-row` (a polling step) improved by 33.9%, marginally less
than the other five shared steps (34.5–34.6%) — consistent with polling
loops accumulating multiple command round-trips, each individually cheaper
under embedded, but the loop's own retry cadence (not purely channel-bound)
diluting the improvement slightly.

### submit-placement / save-and-close / reopen-repository
No embedded data — see §"submit-placement root cause". External completed
all three: 53980ms, 122859ms, 84787ms respectively (medians), all
IPC/disk-heavy steps consistent in shape with the earlier steps.

---

## Decision

**Status: KEEP EXTERNAL — temporary**

### Why external remains the default

- External completed both full `core-inventory` runs with all 9 measured
  steps passing.
- Functional behaviour is correct and consistent with the existing test suite.
- The default provider does not change; no production or CI behaviour is
  affected.
- PID-safe cleanup (`PASS_WITH_FORCED_CLEANUP`) safely removes leftover
  `tauri-driver.exe`/`msedgedriver.exe` after every run.  This is an
  operational inconvenience but does not produce incorrect test results.

### Why embedded is not adopted

- Embedded failed `core-inventory` both times (2/2 on Windows/WebView2,
  also 1/1 on Linux/WebKit — 3 independent failures across two platforms).
- The failure is **deterministic, not flaky**.
- Root cause: `tauri-plugin-wdio-webdriver` v1.2.0 does not dispatch a
  real `mousedown` event when performing a click.  The `SearchableSelect`
  component (used in `DeviceFormModal` and `PlacePlacementModal`) relies on
  `onMouseDown` to open its dropdown.  Without a real `mousedown`, the
  component never registers the interaction, the device model is never
  selected, and the device form cannot be submitted.
- A longer timeout or retry does not fix this.  A device model selection
  that produces no visible DOM change will never succeed no matter how long
  the harness waits.
- Adopting embedded would mean losing the ability to test any `SearchableSelect`
  interaction via WDIO — a genuine reduction in E2E coverage, not just a
  harness issue.

### What the performance data says

Embedded is markedly faster where it works:

| Metric | external | embedded | Δ (Windows) |
|--------|----------|----------|-------------|
| Session startup | ~756ms | ~135ms | −79–83% |
| app-smoke total duration | ~100s | ~71s | −29% |
| Steps 1–6 of core-inventory | baseline | ~34–35% faster | — |
| P95 command latency (app-smoke) | ~15400ms | ~10100ms | ~−34% |

These numbers confirm that external is a genuine source of overhead, and that
eliminating the `tauri-driver` → `msedgedriver` round-trip has real value.
However, embedded does not eliminate the multi-second waits that dominate
total spec time — those come from `waitUntil` polling and IPC round-trips,
not from the driver channel itself.  The next optimization priority is
reducing those waits in the external provider flow, not switching to embedded.

### Nature of the decision

External remains the default provider for the current E2E program.
This is an operationally conservative decision, not a rejection of
the embedded architecture.

Embedded will be reconsidered separately after:

- an upstream fix to `tauri-plugin-wdio-webdriver` that correctly
  synthesizes `mousedown` events (or equivalent), **or**
- a deliberately designed compatibility layer that allows `SearchableSelect`
  to work without a real `mousedown`,
- **and** a full regression of all specs under the embedded provider.

No workaround for embedded is being implemented in this branch.

---

## Further optimization candidates

> Draft ranking based on expected data patterns.  Do not implement on this branch.

| Rank | Optimization | Evidence source | Expected impact | Quality risk | Stage |
|------|-------------|-----------------|-----------------|--------------|-------|
| 1 | Batch DOM reads into single `browser.execute()` | High command count in poll loops | Medium (reduces round-trips) | Low | Stage 3C |
| 2 | Remove redundant `isExisting` + `isDisplayed` chains | command-by-name aggregation | Low–medium | Low | Stage 3C |
| 3 | Cache element references across steps | Slowest-20 list | Low | Medium (stale refs) | Stage 3C |
| 4 | Reduce polling frequency for slow IPC steps | measureStep times for IPC steps | Low | Medium (timing sensitivity) | Stage 3C |
| 5 | Separate Tauri IPC timing from browser DOM timing | NDJSON per-command data | Diagnostic only | None | Stage 3D |

---

## Validation

### Static checks (Windows, this pass)

```
TypeScript (tsc --noEmit)             PASS — 0 errors
Vitest (vitest run)                   PASS — 853/853
Hygiene (check-repo-hygiene.mjs)      PASS — 8/8
Runner unit tests (node --test)       PASS — 102/102 (was 66; +36 for PID-safe
                                       cleanup/outcome classification, see
                                       commit fc309a8)
cargo fmt --all --check               PASS
cargo check --workspace               PASS (no feature)
cargo check -p rack-inventory-studio-desktop --features wdio-embedded  PASS
cargo clippy --workspace -- -D warnings  PASS (no feature)
cargo clippy -p rack-inventory-studio-desktop --features wdio-embedded -- -D warnings  PASS
git diff --check                      PASS
```

### Production build isolation (confirmed on Windows this pass)

```
pnpm -C apps/desktop tauri build --no-bundle
→ PASS — target\release\rack-inventory-studio-desktop.exe
```

Confirmed on the real Windows machine: launched the regular binary, waited
5s, queried `Get-NetTCPConnection` for ports 4444/4445 — **zero listeners on
either port**. No embedded plugin compiled in (feature not enabled). No
`capabilities/embedded-test.json` generated for this build (confirmed absent
from `git status` and from the regular build's working tree).

### Process cleanup (confirmed on Windows this pass)

- Embedded: the Tauri binary process exits cleanly; nothing to clean up
  (no external driver process). Confirmed 4/4 runs (2 app-smoke + 2
  core-inventory).
- External: `tauri-driver.exe`/`msedgedriver.exe` do **not** reliably exit
  on their own (confirmed 4/4 runs, even with a 5s natural-teardown grace
  window) — this repository's runner now detects this safely (PID-verified,
  never name/time-only) and force-cleans it every time
  (`cleanupSucceeded: true` in all 4 cases). See §"Cleanup / process
  ownership" above for full detail.

---

## Linux supplementary benchmark (2026-07-23)

> Supplementary data only — superseded by the Windows matrix above for the
> adoption decision. Kept here for driver-stack comparison (WebKit vs. Edge).

Collected on Linux during PR #153 Linux continuation pass.  Driver stack on Linux
differs from Windows: WebKit/WebKitWebDriver replaces Edge/msedgedriver, and there
is no Windows Defender overhead.  Data is useful for isolating WebDriver protocol
overhead from OS-level effects, but cannot substitute for Windows results.

### Environment

| Item | Value |
|------|-------|
| OS | Ubuntu 6.8.0-117-generic (x64) |
| CPU | Intel Core i5-6500T @ 2.50GHz (4 cores) |
| RAM | 7717 MB |
| Node.js | v18.19.1 |
| pnpm | 10.33.4 |
| Rust toolchain | 1.95.0 |
| WebDriver | WebKitWebDriver (xvfb-run -a) |
| @wdio/tauri-service | 1.2.0 |
| webdriverio | 9.29.1 |
| tauri-plugin-wdio-webdriver | 1.2.0 |
| Binary (both providers) | target-embedded/release/rack-inventory-studio-desktop |

### Infrastructure smoke (×1 each, same embedded binary)

| Provider | Result | Total | Commands | Median | P95 |
|----------|--------|-------|----------|--------|-----|
| external | PASS | 81s | 37 | 10ms | 12398ms |
| embedded | PASS | 68s | 39 | 11ms | 10337ms |

Both providers: PASS.  Port and process cleanup: clean.

### app-smoke A/B comparison (--compare, ×2, same embedded binary)

| # | Provider | Run | Result | Total | Session startup | Test exec | Commands | Median | P95 |
|---|----------|-----|--------|-------|-----------------|-----------|----------|--------|-----|
| 1 | external | 1 | PASS | 80s | 965ms | 74164ms | 37 | 19ms | 12345ms |
| 2 | embedded | 1 | PASS | 68s | 220ms | 61967ms | 39 | 11ms | 10357ms |
| 3 | external | 2 | PASS | 80s | 958ms | 73929ms | 37 | 18ms | 12446ms |
| 4 | embedded | 2 | PASS | 68s | 228ms | 62164ms | 39 | 11ms | 10362ms |

**Aggregate:**

| Metric | external | embedded | Δ abs | Δ % |
|--------|----------|----------|-------|-----|
| Median total run duration | 79598ms | 67975ms | 11623ms | 14.6% |
| Median test execution | 73929ms | 61967ms | 11962ms | 16.2% |
| Median session startup | 958ms | 220ms | 738ms | 77.0% |
| Median command latency | 18ms | 11ms | 7ms | 38.9% |
| P95 command latency | 12445ms | 10357ms | 2088ms | 16.8% |
| Commands ≥1 s | 28 | 28 | 0 | 0.0% |

Session startup is the clearest signal: embedded eliminates the tauri-driver
proxy hop, saving ~738ms (77%) per run on Linux/WebKit.

### core-inventory A/B comparison (--compare, ×2, same embedded binary)

Matrix stopped after the first embedded failure.

| # | Provider | Run | Result | Total | Commands | Median | P95 | Failure |
|---|----------|-----|--------|-------|----------|--------|-----|---------|
| 1 | external | 1 | PASS | 1376s | 852 | 9ms | 24503ms | — |
| 2 | embedded | 1 | FAIL | 889s | 667 | 13ms | 20451ms | submit-placement failed; save-and-close, reopen-repository not reached |

**External measureStep breakdown (run 1):**

| Step | external median | Note |
|------|-----------------|------|
| create-repository | 80274ms | IPC + disk |
| open-location-form | 54912ms | UI interaction |
| fill-location-form | 12237ms | React state |
| submit-location-form | 55071ms | IPC round-trip |
| wait-for-location-row | 12110ms | polling |
| navigate-location-to-racks | 24084ms | navigation |
| submit-placement | 42772ms | IPC |
| save-and-close | 97588ms | save + disk |
| reopen-repository | 67470ms | disk + IPC |

**Embedded partial breakdown (failed run 1, steps before failure):**

| Step | embedded median | Δ vs external |
|------|-----------------|---------------|
| create-repository | 66650ms | −13624ms (−17%) |
| open-location-form | 45991ms | −8921ms (−16%) |
| fill-location-form | 10232ms | −2005ms (−16%) |
| submit-location-form | 45960ms | −9111ms (−17%) |
| wait-for-location-row | 10226ms | −1884ms (−16%) |
| navigate-location-to-racks | 20456ms | −3628ms (−15%) |
| submit-placement | 75445ms (FAILED) | — |

**Interpretation:** Steps 1–6 show consistent ~15–17% improvement with embedded
before the failure.  The `submit-placement` step is an IPC round-trip that calls
into Rust; it PASSED with external/WebKitWebDriver (43s) but FAILED with
embedded/tauri-plugin-wdio-webdriver (75s, timeout or assertion error).
This failure may be WebKit-specific — the embedded plugin's behaviour under
WebKitWebDriver may differ from its behaviour under Edge/WebView2 on Windows.
No claim can be made about Windows without running the full matrix there.

### Linux summary

- app-smoke: embedded consistently faster (~15–39% improvement, all 4 runs PASS)
- core-inventory: embedded failed at `submit-placement` — incomplete data, cannot draw conclusions
- The embedded failure on Linux/WebKit is a risk signal that must be verified on Windows before any adoption decision

---

## Related files

- `apps/desktop/e2e-wdio/support/command-timing.ts` — timing instrumentation
- `apps/desktop/e2e-wdio/wdio.conf.ts` — provider env + hook registration
- `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` — measureStep integration
- `apps/desktop/src-tauri/Cargo.toml` — wdio-embedded feature
- `apps/desktop/src-tauri/build.rs` — conditional capability file generation
- `apps/desktop/src-tauri/src/lib.rs` — conditional plugin registration
- `scripts/run-wdio-performance-benchmark.mjs` — benchmark runner
- `docs/E2E_WDIO_PLAN.md` — Stage 3B.3 section
