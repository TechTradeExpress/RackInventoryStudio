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

### Regular external binary (production build)

```powershell
# From repo root on Windows:
node apps\desktop\node_modules\.bin\tauri build --no-bundle --config '{\"build\":{\"beforeBuildCommand\":\"\"}}'
# Binary: target\release\rack-inventory-studio-desktop.exe
```

### Embedded test binary

```powershell
# Option A — via Tauri CLI (passes feature to cargo):
node apps\desktop\node_modules\.bin\tauri build --no-bundle --config '{\"build\":{\"beforeBuildCommand\":\"\"}}' -- --features wdio-embedded

# Option B — direct cargo (requires frontend dist already built):
cargo build --release -p rack-inventory-studio-desktop --features wdio-embedded
# Binary: target\release\rack-inventory-studio-desktop.exe
# Note: copy or rename to avoid overwriting the regular binary.
```

### Distinguishing the two binaries

```powershell
# Recommended: build embedded binary to a separate path
$env:CARGO_TARGET_DIR = "target-embedded"
cargo build --release -p rack-inventory-studio-desktop --features wdio-embedded
# Embedded binary: target-embedded\release\rack-inventory-studio-desktop.exe
```

---

## Benchmark matrix

Run using the benchmark runner:

```powershell
# external — app-smoke
node scripts\run-wdio-performance-benchmark.mjs --provider external --spec app-smoke --repeat 2

# embedded — app-smoke (point at the embedded binary)
node scripts\run-wdio-performance-benchmark.mjs --provider embedded --spec app-smoke --repeat 2 --binary "target-embedded\release\rack-inventory-studio-desktop.exe"

# external — core-inventory
node scripts\run-wdio-performance-benchmark.mjs --provider external --spec core-inventory --repeat 2

# embedded — core-inventory
node scripts\run-wdio-performance-benchmark.mjs --provider embedded --spec core-inventory --repeat 2 --binary "target-embedded\release\rack-inventory-studio-desktop.exe"
```

For the controlled A/B comparison, both providers use the **same embedded binary**
so the only variable is the driver channel.

---

## Raw run results

> All 8 cells are PENDING.  Fill in from benchmark runner output after Windows execution.

| # | Provider | Spec | Run | Result | Duration | Commands | Median | P95 | P99 | Max | ≥1 s | ≥5 s | Run root | Cleanup |
|---|----------|------|-----|--------|----------|----------|--------|-----|-----|-----|------|------|----------|---------|
| 1 | external | app-smoke | 1 | PENDING | — | — | — | — | — | — | — | — | — | — |
| 2 | embedded | app-smoke | 1 | PENDING | — | — | — | — | — | — | — | — | — | — |
| 3 | external | app-smoke | 2 | PENDING | — | — | — | — | — | — | — | — | — | — |
| 4 | embedded | app-smoke | 2 | PENDING | — | — | — | — | — | — | — | — | — | — |
| 5 | external | core-inventory | 1 | PENDING | — | — | — | — | — | — | — | — | — | — |
| 6 | embedded | core-inventory | 1 | PENDING | — | — | — | — | — | — | — | — | — | — |
| 7 | external | core-inventory | 2 | PENDING | — | — | — | — | — | — | — | — | — | — |
| 8 | embedded | core-inventory | 2 | PENDING | — | — | — | — | — | — | — | — | — | — |

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

## Related files

- `apps/desktop/e2e-wdio/support/command-timing.ts` — timing instrumentation
- `apps/desktop/e2e-wdio/wdio.conf.ts` — provider env + hook registration
- `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` — measureStep integration
- `apps/desktop/src-tauri/Cargo.toml` — wdio-embedded feature
- `apps/desktop/src-tauri/build.rs` — conditional capability file generation
- `apps/desktop/src-tauri/src/lib.rs` — conditional plugin registration
- `scripts/run-wdio-performance-benchmark.mjs` — benchmark runner
- `docs/E2E_WDIO_PLAN.md` — Stage 3B.3 section
