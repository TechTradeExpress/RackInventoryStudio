## Summary

Stage 3B.3: Windows WDIO performance experiment.

Branch `experiment/e2e-wdio-windows-performance` from `roadmap/e2e-wdio`
(base SHA 95ea5fd3795b42769da9e7a4907ab2a82e6d9bc6).

Adds opt-in command timing instrumentation, configurable driver provider
(external/embedded), optional embedded WebDriver Cargo feature, and a
benchmark runner script.  No coverage counts changed.  All benchmark
results are PENDING — Windows execution required.

## Branch and base

| Item | Value |
|------|-------|
| Branch | `experiment/e2e-wdio-windows-performance` |
| Direct base | `roadmap/e2e-wdio` |
| Base SHA | `95ea5fd3795b42769da9e7a4907ab2a82e6d9bc6` |
| Final head | (post-push — see PR) |

## Commits

| SHA | Message |
|-----|---------|
| 8c1b46c | test(e2e): add opt-in WDIO command timing benchmark |
| 170abae | test(e2e): add test-only embedded WebDriver experiment |
| (commit 3) | docs(e2e): record Windows driver performance comparison |

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/support/command-timing.ts` | New: per-command timing hooks, measureStep, NDJSON+summary output |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Add provider env (RIS_WDIO_DRIVER_PROVIDER), embedded port, timing hook |
| `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` | Add measureStep() for 8 representative business steps |
| `scripts/run-wdio-performance-benchmark.mjs` | New: benchmark runner (Node.js built-ins only) |
| `apps/desktop/src-tauri/Cargo.toml` | Add wdio-embedded feature + optional tauri-plugin-wdio-webdriver |
| `apps/desktop/src-tauri/build.rs` | Conditional capability file generation for embedded feature |
| `apps/desktop/src-tauri/src/lib.rs` | #[cfg(feature = "wdio-embedded")] plugin registration |
| `.gitignore` | Gitignore generated capabilities/embedded-test.json |
| `Cargo.lock` | Updated with tauri-plugin-wdio-webdriver 1.2.0 |
| `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` | New: benchmark design, pending results, decision criteria |
| `docs/E2E_WDIO_PLAN.md` | Add Stage 3B.3 section |
| `.ai/cc-report.md` | This report |

## Environment

| Tool | Value |
|------|-------|
| Platform (validation) | linux |
| Node.js | 18.x |
| TypeScript | 5.x |
| Vitest | 4.x |
| @wdio/tauri-service | 1.2.0 |
| tauri-plugin-wdio-webdriver | 1.2.0 (new, optional) |

## Measurement design

- Activated by `RIS_WDIO_TIMING=1` (absent = zero overhead, zero output)
- Per-command: seq, commandName, start/end/duration ms, success/error, testName, suiteName, platform, provider, pid, runId
- Output: NDJSON to `os.tmpdir()/ris-wdio-bench/<run-id>/commands.ndjson`
- Summary JSON: session ms, command count, min/mean/median/p90/p95/p99/max, buckets (≥250/500/1000/2000/5000 ms), top-20 slowest, per-command aggregates
- `measureStep("name", fn)` for logical steps — wraps async fn, records step duration as a separate entry in NDJSON
- Slow commands logged to console at threshold `RIS_WDIO_SLOW_COMMAND_MS` (default 500 ms)
- Provider stored in every record; RUN_ID shared across launcher+worker via `process.env['RIS_WDIO_RUN_ID']`

## Production build isolation

| Check | Result |
|-------|--------|
| `cargo check --workspace` (no feature) | PASS |
| `cargo clippy --workspace -- -D warnings` (no feature) | PASS |
| `cargo check -p rack-inventory-studio-desktop --features wdio-embedded` | PASS |
| `cargo clippy -p rack-inventory-studio-desktop --features wdio-embedded` | PASS |
| `cargo fmt --all --check` | PASS |
| No embedded plugin in default build | Confirmed (optional dep, not compiled) |
| No port 4445 in default build | Confirmed (plugin not registered) |

## Static checks (Linux)

```
TypeScript (npx tsc --noEmit)           PASS (0 errors)
Vitest                                  PASS (853/853)
Hygiene (check-repo-hygiene.mjs)        PASS (8/8)
cargo fmt --all --check                 PASS
cargo check --workspace                 PASS
cargo check --features wdio-embedded    PASS
cargo clippy --workspace                PASS
cargo clippy --features wdio-embedded   PASS
git diff --check                        PASS
```

## Benchmark results (PENDING — Windows execution required)

All 8 runs (external×4 + embedded×4 across app-smoke and core-inventory) are PENDING.
See `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` for the full matrix and decision criteria.

## Decision

PENDING — cannot evaluate until Windows benchmark runs are complete.

## Not done

- Windows benchmark execution (requires Windows machine)
- Filling in `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` raw results, aggregation, interpretation, decision
- Commit 3 (`docs(e2e): record Windows driver performance comparison`)
- Full 11-spec WDIO suite validation (not required for this experiment branch unless embedded becomes default)

## Risks

- `tauri-plugin-wdio-webdriver` may require additional Tauri permissions not anticipated (build.rs creates the capability file conditionally)
- The Cargo feature approach correctly isolates the plugin; the `#[cfg(feature = "wdio-embedded")]` guard is explicit, not `debug_assertions`
- On Windows, Defender scanning may inflate startup and IPC step timings independently of provider choice

## Suggested next step

Execute the 8-run benchmark matrix on Windows using:
```
node scripts\run-wdio-performance-benchmark.mjs --provider external --spec app-smoke --repeat 2
node scripts\run-wdio-performance-benchmark.mjs --provider embedded --spec app-smoke --repeat 2 --binary "..."
node scripts\run-wdio-performance-benchmark.mjs --provider external --spec core-inventory --repeat 2
node scripts\run-wdio-performance-benchmark.mjs --provider embedded --spec core-inventory --repeat 2 --binary "..."
```
Then fill in `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` and commit as:
`docs(e2e): record Windows driver performance comparison`
