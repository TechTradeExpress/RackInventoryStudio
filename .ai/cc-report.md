## Summary

Stage 3B.4: E2E WDIO latency optimization — Windows repair pass (IN REVIEW).
Work continued from the Linux Class A/B/C optimization (base HEAD `51fc68b`,
already documented) onto Windows as the primary measurement environment for
this pass, per explicit operator direction. Same branch, same PR #154, no
new stage started.

Delivered in this pass:

1. **Correctness repairs** to `expectActiveRepositoryPath` (restored
   polling — a visible element whose text hasn't caught up with a
   just-completed navigation no longer fails on the first read),
   `isDomElementVisible`/new `isSelectorVisible` (fixed an AND/OR visibility
   bug — an element with only one zero dimension is not visible), and
   consolidated five independently-duplicated inline visibility checks into
   one canonical, unit-tested helper.
2. **New opt-in Windows benchmark** (`representative-latency.e2e.ts`) — nine
   named interaction-pattern cases (A–I) drawn from existing specs in one
   continuous minimal workflow, plus runner support
   (`resolveSpecPath`/`BENCHMARK_ONLY_SPECS`, `isMeasurementEligible`,
   `computeSingleModeAggregate`).
3. **Windows baseline ×2**: 1,069,722ms median total, P95 15,417ms, 500
   commands, 112 commands ≥5s.
4. **Root-cause diagnosis**: read `@wdio/tauri-service`'s compiled source
   and found a `beforeCommand` hook that retries a plugin-availability probe
   up to 100 times (~7.7s) on every `findElement`/`elementClick`/`getTitle`/
   `$`/`$$` command, and — because it only caches a *successful* probe —
   never remembers the failure, so every such command pays the full
   ~7.7s retry loop for the entire session when `tauri-plugin-wdio` isn't
   installed.
5. **Three optimization commits**: (a) bypass `$()`/`.waitForDisplayed()`
   and WDIO's client-side `.click()` wrapper via direct WebDriver protocol
   calls (`clickElementProtocol`, `clickWhenEnabled`), (b) apply the same to
   two remaining raw click sites, (c) install `tauri-plugin-wdio` behind a
   new, strictly test-only `wdio-plugin` Cargo feature (mirrors the existing
   `wdio-embedded` pattern; zero impact on default/production builds) — the
   actual fix for the root cause found in step 4.
6. **Windows final ×2**: 12,287ms median total, P95 73ms, ~296 commands,
   0 commands ≥5s. **−98.9% median total time**, **−99.5% P95**, **−100%
   commands ≥5s**, **−40.8% command count** — every success criterion in the
   operator brief exceeded by a wide margin.

Full WDIO suite intentionally deferred for this pass — not a merge gate.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/support/dom-helpers.ts` | Fixed visibility AND→OR bug; added `isSelectorVisible` (selector-based, serializable for `browser.execute()`) |
| `apps/desktop/e2e-wdio/support/dom-helpers.test.ts` | Added partial-zero-dimension cases; added `isSelectorVisible` test suite |
| `apps/desktop/e2e-wdio/support/repository-ui.ts` | Restored `expectActiveRepositoryPath` polling; `reactSetValue`/`reactSelectValue` bypass `$()`+`.waitForDisplayed()`; new `clickWhenEnabled` |
| `apps/desktop/e2e-wdio/support/repository-ui.test.ts` | Added `expectActiveRepositoryPath` regression test (stale-then-correct read), `clickWhenEnabled` tests |
| `apps/desktop/e2e-wdio/support/spec-interactions.ts` | New: extracted `clickNav`/`waitForModal`/`waitForModalClose`/`clickWhenVisible`/`clickRowViaDom` from the spec; new `clickElementProtocol` |
| `apps/desktop/e2e-wdio/support/spec-interactions.test.ts` | New: `clickElementProtocol`/`clickNav`/`clickWhenVisible` tests |
| `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` | Imports shared helpers instead of local duplicates; all inline visibility checks → `isSelectorVisible`; all `waitForEnabled().click()` → `clickWhenEnabled` |
| `apps/desktop/e2e-wdio/benchmarks/representative-latency.e2e.ts` | New: opt-in 9-case representative benchmark |
| `scripts/run-wdio-performance-benchmark.mjs` | `resolveSpecPath`/`BENCHMARK_ONLY_SPECS`/`isValidSpecName`, `isMeasurementEligible`, `computeSingleModeAggregate`, `buildBenchmarkOutputBasename` |
| `scripts/run-wdio-performance-benchmark.test.mjs` | Unit tests for all of the above (123 tests total, up from ~102) |
| `apps/desktop/src-tauri/Cargo.toml` | New `wdio-plugin` feature, optional `tauri-plugin-wdio` dependency |
| `apps/desktop/src-tauri/src/lib.rs` | Conditional `tauri_plugin_wdio::init()` registration, placed after `tauri_plugin_log` (logger-claim ordering) |
| `apps/desktop/src-tauri/build.rs` | Generates/removes `capabilities/wdio-plugin-test.json` based on the `wdio-plugin` feature |
| `apps/desktop/src/main.tsx` | Conditionally imports `@wdio/tauri-plugin` when `VITE_WDIO_PLUGIN=true` at build time |
| `apps/desktop/src/vite-env.d.ts` | New: Vite client types (`import.meta.env` wasn't usable in this project before) |
| `apps/desktop/package.json` / `pnpm-lock.yaml` | Added `@wdio/tauri-plugin` devDependency |
| `Cargo.lock` | Added `tauri-plugin-wdio` |
| `.gitignore` | Added `capabilities/wdio-plugin-test.json` |
| `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` | New §11: Windows repair pass — correctness fixes, case matrix, baseline, root cause, optimization batches, final, comparison, remaining bottlenecks, deferred full suite |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.4 section updated with Windows repair-pass summary |

## Tests

```
node --test scripts/run-wdio-performance-benchmark.test.mjs
# 123/123 PASSED

pnpm -C apps/desktop typecheck   (tsc --noEmit)
# PASSED — 0 errors

pnpm -C apps/desktop test        (vitest run)
# PASSED — 885/885

node scripts/check-repo-hygiene.mjs
# PASSED — 8/8

cargo fmt --all --check
# PASSED

cargo check --workspace                                        # default features
cargo check -p rack-inventory-studio-desktop --features wdio-embedded
cargo check -p rack-inventory-studio-desktop --features wdio-plugin
# all PASSED

cargo clippy --workspace -- -D warnings                                          # default
cargo clippy -p rack-inventory-studio-desktop --features wdio-embedded -- -D warnings
cargo clippy -p rack-inventory-studio-desktop --features wdio-plugin -- -D warnings
# all PASSED

git diff --check
# PASSED (no whitespace errors; CRLF-conversion warnings only, harmless)
```

Windows `representative-latency` benchmark (external provider):

- Baseline ×2 (HEAD `6ff82114dfc6dd72d7d50556ece271bb17388dcb`): both
  `PASS_WITH_FORCED_CLEANUP`, `measurementEligible: true`, median total
  1,069,722ms, P95 15,417ms, 500 commands, 112 ≥5s. Variance 0.17%.
- Final ×2 (HEAD `930a61537a8e617e48bbad0f1020ad8072769b94`): both
  `PASS_WITH_FORCED_CLEANUP`, `measurementEligible: true`, `testPassed:
  true`, `reportValid: true`, zero validation errors, all 9 cases
  `successful: 1/1`. Median total 12,287ms, P95 73ms, ~296 commands, 0 ≥5s.
  Variance 4.6%.

Both binaries built via `pnpm -C apps/desktop tauri build --no-bundle`
(baseline: no extra features; final: `--features wdio-plugin` +
`VITE_WDIO_PLUGIN=true` + `--config withGlobalTauri:true`).

Isolated diagnostic (informal, not committed): three consecutive
`findElement()` calls on an already-visible element — 7.6–7.7s each without
`tauri-plugin-wdio`, 43–66ms each with it (both `logLevel: "info"` and
`"silent"` tested, ruling out logging overhead as the cause).

## Risks

- `tauri-plugin-wdio` is a new third-party Rust + npm dependency, though
  strictly gated behind an opt-in Cargo feature + env var with zero default
  build impact — verified by full default-feature `cargo check`/
  `clippy`/`fmt` and 885/885 Vitest passing unchanged.
- `tauri_plugin_wdio::init()` must stay registered *after*
  `tauri_plugin_log` in `lib.rs`'s builder chain (logger-claim ordering); if
  someone reorders the plugin chain in a future change without knowing this,
  the `wdio-plugin` build will panic at startup with
  `PluginInitialization("log", ...)`. Documented inline in `lib.rs` and in
  `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §11.5.3.
- All four Windows external-provider runs in this pass landed on
  `PASS_WITH_FORCED_CLEANUP`, never `CLEAN_PASS` — a known, already-documented
  (`docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`) Windows/`@wdio/tauri-service`
  teardown gap, unrelated to and unaffected by this pass. `measurementEligible`
  (new, independent of `passed`/`CLEAN_PASS`) correctly includes these runs
  in the benchmark aggregate since cleanup was independently verified safe
  and successful in every case.
- Several stray `tauri-driver.exe`/`msedgedriver.exe` processes leaked
  during this session from ad-hoc diagnostic `wdio run` invocations
  (bypassing the benchmark runner's PID-safe cleanup) — identified by PID
  and manually cleaned up before the final ×2 run; the runner's own cleanup
  correctly refused to touch them as pre-existing/unrelated
  (`CLEANUP_UNSAFE`), confirming the safety logic works as designed.
- `@wdio/tauri-service`'s window-focus retry-loop-without-negative-caching
  behavior (root cause, §11.5.1) is an upstream library characteristic that
  was worked around (by installing the plugin it expects), not patched or
  reported upstream as part of this pass.

## Not done

- Full 11-spec WDIO suite — intentionally deferred per explicit operator
  direction for this pass; not a merge gate.
- Stage 3C (remaining placement workflows) — out of scope, not started.
- `SearchableSelect.tsx` / embedded provider — untouched, as required.
- Reducing `reactSetValue`/`reactSelectValue` further, or the
  `toHaveAttribute` nav assertions beyond what §10/§11.8 already note —
  case F (SearchableSelect) and case I (save/close/reopen) are now
  dominated by real backend/IPC and native-click work, not test-harness
  overhead; no further optimization attempted per the "don't optimize real
  application time" constraint.
- Reporting the `@wdio/tauri-service` retry-loop-without-negative-caching
  behavior upstream (would benefit other Tauri+WDIO projects, but is
  outside this repository's scope).

## Suggested next step

1. Update PR #154 body: replace the "Full WDIO suite" pending section with
   the deferred statement, add the case matrix, Windows environment,
   baseline/final ×2 results, and the `tauri-plugin-wdio` root-cause note.
2. Wait for standard CI (Frontend checks, Rust workspace, Script/hygiene,
   Version consistency, Workflow lint) on HEAD `930a615`.
3. Generate a fresh review context against `roadmap/e2e-wdio` (the direct
   PR base) and hand it off for review.
4. After Stage 3B.4 merges: consider reporting the `@wdio/tauri-service`
   plugin-probe negative-caching gap upstream, and begin Stage 3C from the
   updated `roadmap/e2e-wdio` base.
