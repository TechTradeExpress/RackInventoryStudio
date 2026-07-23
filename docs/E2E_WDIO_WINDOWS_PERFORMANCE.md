# Windows WDIO Performance Experiment — Stage 3B.3

**Branch:** `experiment/e2e-wdio-windows-performance`
**Base:** `roadmap/e2e-wdio`
**Status:** PENDING — awaiting Windows benchmark execution

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

> Fill in after Windows execution.

| Item | Value |
|------|-------|
| Windows version | — |
| Architecture | — |
| CPU | — |
| RAM | — |
| Node.js | — |
| pnpm | — |
| Rust toolchain | — |
| Edge version | — |
| EdgeDriver version | — |
| @wdio/tauri-service | 1.2.0 |
| webdriverio | 9.x |
| Tauri CLI | 2.x |
| External binary path | — |
| Embedded binary path | — |

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

> All 8 rows are PENDING.  Fill in from `comparison.json` / the runner's console
> output after Windows execution.

| # | Provider | Spec | Run | Result | totalRunMs | wdioProcessMs | sessionStartupMs | testExecutionMs | Commands | Median | P95 | P99 | Max | ≥1 s | ≥5 s | Report dir | Run root cleanup | Process cleanup | Port cleanup |
|---|----------|------|-----|--------|-----------|---------------|-------------------|-------------------|----------|--------|-----|-----|-----|------|------|------------|-------------------|------------------|---------------|
| 1 | external | app-smoke | 1 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 2 | embedded | app-smoke | 1 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 3 | external | app-smoke | 2 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 4 | embedded | app-smoke | 2 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 5 | external | core-inventory | 1 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 6 | embedded | core-inventory | 1 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 7 | external | core-inventory | 2 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |
| 8 | embedded | core-inventory | 2 | PENDING | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — |

---

## Aggregated comparison

> Fill in after Windows execution.

### app-smoke

| Metric | external | embedded | Δ absolute | Δ % |
|--------|----------|----------|------------|-----|
| Median total duration | — | — | — | — |
| Median command latency | — | — | — | — |
| P95 command latency | — | — | — | — |
| Commands ≥1 s | — | — | — | — |

### core-inventory

| Metric | external | embedded | Δ absolute | Δ % |
|--------|----------|----------|------------|-----|
| Median total duration | — | — | — | — |
| Median command latency | — | — | — | — |
| P95 command latency | — | — | — | — |
| Commands ≥1 s | — | — | — | — |

### measureStep breakdown (core-inventory)

> Logical step timings recorded by `measureStep()` in core-inventory.e2e.ts.

| Step | external median | embedded median | Δ ms | Note |
|------|-----------------|-----------------|------|------|
| create-repository | — | — | — | IPC + disk |
| open-location-form | — | — | — | UI interaction |
| fill-location-form | — | — | — | React state |
| submit-location-form | — | — | — | IPC round-trip |
| wait-for-location-row | — | — | — | polling |
| navigate-location-to-racks | — | — | — | navigation |
| submit-placement | — | — | — | IPC |
| save-and-close | — | — | — | save + disk |
| reopen-repository | — | — | — | disk + IPC |

---

## Interpretation

> Fill in after Windows execution.  Template categories below.

### WebDriver channel overhead
How much latency comes from the tauri-driver → msedgedriver hop (external)
vs. the in-process server (embedded)?  Evidence: compare median command
latency across all commands — commands that are pure protocol exchanges with
no app logic show the raw channel cost.

### Application and React time
Steps involving form fills, React state updates, and waitUntil polling show
app-side timing regardless of the driver channel.  If embedded and external
have similar latency here, the bottleneck is not the driver channel.

### IPC operations
`create-repository`, `submit-location-form`, `submit-placement`, `save-and-close`,
`reopen-repository` involve Rust IPC calls and disk writes.  These should be
provider-independent; if they differ significantly between runs, suspect
environmental noise (Defender, disk, background processes).

### Defender and disk impact
Windows Defender real-time scanning can add significant latency to Rust binary
startup, disk writes (repository creation), and executable spawning.  Evidence:
compare `create-repository` step vs. pure UI steps.

### Retry and polling overhead
`waitUntil` loops accumulate command round-trips.  The `wait-for-location-row`,
`wait-for-rack-row` etc. steps show how many poll iterations are needed.
High-latency polls inflate total spec time independently of the driver channel.

---

## Decision

> Fill in after Windows execution.

**Status:** PENDING

Criteria for ADOPT EMBEDDED (all must hold):
1. All embedded runs pass
2. Cleanup works correctly (run roots removed, port 4445 released)
3. No new flaky behaviour observed
4. Regular production build (no feature) passes
5. Embedded test build compiles and runs correctly
6. Improvement is consistent across both runs
7. At least one of:
   - Median core-inventory duration drops ≥ 20 %
   - P95 command latency drops ≥ 30 %
   - Commands ≥ 1 s drop ≥ 30 %

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

### Static checks

```
TypeScript (tsc --noEmit)             PASS — 0 errors
Vitest (node_modules/.bin/vitest run) PASS — 853/853
Hygiene (check-repo-hygiene.mjs)      PASS — 8/8
cargo fmt --all --check               PASS
cargo check --workspace               PASS (no feature)
cargo check -p rack-inventory-studio-desktop --features wdio-embedded  PASS
cargo clippy --workspace -- -D warnings  PASS (no feature)
cargo clippy -p rack-inventory-studio-desktop --features wdio-embedded -- -D warnings  PASS
```

### Production build isolation

> Tauri build without feature (run on Linux/Windows before PR merge).

```
pnpm -C apps/desktop tauri build --no-bundle --config '{"build":{"beforeBuildCommand":""}}'
→ PENDING (Windows) / PASS (Linux — previous CI)
```

Confirmed: production build must not contain the embedded plugin, must not open
port 4445, must not require testids or capabilities from the embedded build.

### Process cleanup

After each run:
- The Tauri binary process must exit cleanly
- Port 4445 must be free for the next run
- No msedgedriver or tauri-driver processes must be left behind

---

## Linux supplementary benchmark (2026-07-23)

> Supplementary data only — does not replace the Windows matrix.
> Decision status remains PENDING WINDOWS MATRIX.

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
