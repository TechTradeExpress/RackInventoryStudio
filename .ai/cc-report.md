## Summary

Stage 3B.3: Windows WDIO performance experiment — Linux continuation.

Branch `experiment/e2e-wdio-windows-performance` from `roadmap/e2e-wdio`
(base SHA 95ea5fd3795b42769da9e7a4907ab2a82e6d9bc6).

Adds opt-in command timing instrumentation, configurable driver provider
(external/embedded), optional embedded WebDriver Cargo feature, and a
benchmark runner script.  No coverage counts changed.

Linux continuation pass (2026-07-23): static validation, unit tests, two
binary builds, and a full Linux supplementary benchmark were run.
app-smoke: all 4 A/B runs PASS — embedded 15–39% faster.
core-inventory: external PASS (1376s, 852 cmds); embedded FAIL at
`submit-placement` step (matrix stopped).  Windows matrix still required.

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
| bde24a2 | docs(e2e): record Windows driver performance comparison |
| 7100ebcf | fix(e2e): harden Windows WDIO benchmark harness |
| 526647e | fix(e2e): resolve smoke-test blockers found on real Windows execution |
| (pending) | docs(e2e): record supplementary Linux benchmark results |

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/support/command-timing.ts` | New: per-command timing hooks, measureStep, NDJSON+summary output; hardened (no sync I/O per command, idempotent flush) |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Add provider env (RIS_WDIO_DRIVER_PROVIDER), embedded port, timing hook |
| `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` | Add measureStep() for 9 representative business steps; @wdio/globals import |
| `apps/desktop/package.json` | Add @wdio/globals as explicit devDependency (was imported but undeclared) |
| `scripts/run-wdio-performance-benchmark.mjs` | New: benchmark runner (Node.js built-ins only); spawns WDIO via process.execPath, not .cmd; time-windowed orphan cleanup; CRLF Cargo.lock support; Edge version via PowerShell VersionInfo |
| `scripts/run-wdio-performance-benchmark.test.mjs` | New: 66 unit tests for runner (node:test) |
| `apps/desktop/src-tauri/Cargo.toml` | Add wdio-embedded feature + optional tauri-plugin-wdio-webdriver |
| `apps/desktop/src-tauri/build.rs` | Conditional capability file generation for embedded feature |
| `apps/desktop/src-tauri/src/lib.rs` | #[cfg(feature = "wdio-embedded")] plugin registration |
| `apps/desktop/src-tauri/src/ssh_askpass.rs` | Fix Windows-only clippy unused_mut warning |
| `.gitignore` | Gitignore capabilities/embedded-test.json and target-embedded/ |
| `Cargo.lock` | Updated with tauri-plugin-wdio-webdriver 1.2.0 |
| `pnpm-lock.yaml` | Updated for @wdio/globals explicit dependency |
| `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` | New: benchmark design, pending results, decision criteria; Linux supplementary section added |
| `docs/E2E_WDIO_PLAN.md` | Add Stage 3B.3 section; update with Linux supplementary results |
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

## Benchmark results

### Linux supplementary (2026-07-23, WebKit/xvfb, supplementary only)

**Unit tests:** 66/66 PASS

**Infrastructure smoke:**

| Provider | Spec | Result | Total | Commands | Median | P95 |
|----------|------|--------|-------|----------|--------|-----|
| external | app-smoke | PASS | 81s | 37 | 10ms | 12398ms |
| embedded | app-smoke | PASS | 68s | 39 | 11ms | 10337ms |

**app-smoke A/B comparison (--compare, ×2):**

| Run | Provider | Result | Total | Session startup | Cmd median | Cmd P95 |
|-----|----------|--------|-------|-----------------|-----------|---------|
| 1 | external | PASS | 80s | 965ms | 19ms | 12345ms |
| 2 | embedded | PASS | 68s | 220ms | 11ms | 10357ms |
| 3 | external | PASS | 80s | 958ms | 18ms | 12446ms |
| 4 | embedded | PASS | 68s | 228ms | 11ms | 10362ms |

Session startup improvement: 738ms (77%).  Test execution improvement: ~12s (16%).

**core-inventory A/B comparison (--compare, ×2, matrix stopped after failure):**

| Run | Provider | Result | Total | Commands | Median | P95 |
|-----|----------|--------|-------|----------|--------|-----|
| 1 | external | PASS | 1376s | 852 | 9ms | 24503ms |
| 2 | embedded | FAIL | 889s | 667 | 13ms | 20451ms |

Embedded failure: `submit-placement` step failed; `save-and-close` and
`reopen-repository` not reached.  Steps before failure: ~15–17% faster than external.

**Dependency audit:** 4 advisories (brace-expansion ×2, fast-xml-parser ×1, 1 low) —
all pre-existing in base branch lockfile, not introduced by this PR.

### Windows matrix (PENDING)

8 runs (external×4 + embedded×4 across app-smoke and core-inventory) are PENDING.
See `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` for the full matrix and decision criteria.

## Decision

PENDING WINDOWS MATRIX — Linux data is supplementary only.
- app-smoke on Linux: embedded faster in all metrics, all runs PASS
- core-inventory on Linux: embedded failed at submit-placement (risk signal for Windows)
- Cannot ADOPT EMBEDDED based on Linux alone

## Not done

- Windows benchmark execution (requires Windows machine)
- Filling in Windows matrix in `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`
- Final decision (ADOPT EMBEDDED / KEEP EXTERNAL / INCONCLUSIVE)
- Full 11-spec WDIO suite validation (not required unless embedded becomes default)

## Risks

- Embedded provider failed `submit-placement` on Linux/WebKit — may be WebKit-specific; must verify on Windows/WebView2 before adoption
- `tauri-plugin-wdio-webdriver` may require additional Tauri permissions not anticipated (build.rs creates the capability file conditionally)
- Dependency audit: 4 pre-existing advisories in brace-expansion/fast-xml-parser chain; no fix available without upstream updates
- On Windows, Defender scanning may inflate startup and IPC step timings independently of provider choice

## Suggested next step

Execute the controlled A/B comparison on Windows using the embedded binary:
```powershell
node scripts\run-wdio-performance-benchmark.mjs --compare --spec app-smoke --repeat 2 --binary "target-embedded\release\rack-inventory-studio-desktop.exe"
node scripts\run-wdio-performance-benchmark.mjs --compare --spec core-inventory --repeat 2 --binary "target-embedded\release\rack-inventory-studio-desktop.exe"
```
Then fill in `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` with Windows data and commit.
Pay special attention to whether embedded also fails `submit-placement` on Windows.
