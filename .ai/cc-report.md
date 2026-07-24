## Summary

Stage 3B.4: E2E WDIO latency optimization — second Windows repair pass
(IN REVIEW). Continuation of the first Windows repair pass (start HEAD
`40c24a874146fec2d6d6ce4ab170a66b78fe1dd9`, same branch, same PR #154).
That earlier pass established the `representative-latency` benchmark and
fixed the actual root cause (a missing `tauri-plugin-wdio` install). This
pass moves the verified optimizations from the diagnostic benchmark into
the **real WDIO specs**.

Delivered:

1. **`expectActiveRepositoryPath` hardening** — `canonicalPath()` throws for
   a path that doesn't yet exist on disk; a thrown exception during polling
   now returns `false` (keep polling) instead of aborting the `waitUntil`.
   Regression test: 3-read sequence (empty → nonexistent → valid) confirms
   recovery from both failure modes.
2. **Official `wdio-plugin` test-binary contract**: committed
   `tauri.wdio-plugin.conf.json`, a scripted, tested build
   (`scripts/build-wdio-plugin-binary.mjs`) into a dedicated
   `target-wdio-plugin/` (never `target/release/`), and an opt-in
   `RIS_WDIO_EXPECT_PLUGIN=present|absent` runtime contract check recorded
   into benchmark output as `buildVariant`/`wdioPluginAvailable`.
3. **A/B decision**: `clickElementProtocol` remains ~40%/80ms faster than
   `browser.$().click()` even with the plugin installed (200ms vs 120ms
   median, 5 tries) — kept, not removed.
4. **Migrated 7 of 11 specs** to the shared, already-optimized
   `clickWhenEnabled`/`clickNav` helpers (deleting 7 byte-identical local
   `clickNav` copies), plus a representative row-lookup fix in
   `csv-import.e2e.ts`.
5. **Every modified spec validated directly on Windows** against the
   `target-wdio-plugin` binary: all 7 passed in 6-28 seconds each (was
   minutes-to-~70-minutes historically on Linux — not an isolated
   apples-to-apples delta, see the caveat in
   `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §12.5).
6. **`core-inventory ×2`** (13s, 12s) and **`representative-latency ×2`**
   (12,774ms, 12,598ms) re-validated on the final HEAD. The representative
   benchmark passed its regression gate against the previous final (median
   +2.5%, P95 unchanged, commands ≥5s stayed 0, command count +0.3% — all
   within threshold).

Full WDIO suite remains intentionally deferred — not a merge gate for this
pass.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/support/repository-ui.ts` | `expectActiveRepositoryPath`: catch `canonicalPath()` exceptions during polling |
| `apps/desktop/e2e-wdio/support/repository-ui.test.ts` | 3-read regression test (empty → nonexistent → valid) |
| `apps/desktop/e2e-wdio/support/spec-interactions.ts` | `clickElementProtocol` comment rewritten for current architecture |
| `apps/desktop/e2e-wdio/support/command-timing.ts` | `recordPluginPresenceProbe()`, `buildVariant`/`wdioPluginAvailable` in summary.json |
| `apps/desktop/e2e-wdio/support/plugin-presence.ts` | New: opt-in `RIS_WDIO_EXPECT_PLUGIN` contract check |
| `apps/desktop/e2e-wdio/support/plugin-presence.test.ts` | New: 9 unit tests |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Wires `assertPluginPresenceContract` into the `before` hook |
| `apps/desktop/src-tauri/tauri.wdio-plugin.conf.json` | New: committed `withGlobalTauri:true` override |
| `scripts/build-wdio-plugin-binary.mjs` | New: scripted, tested `wdio-plugin` binary build |
| `scripts/build-wdio-plugin-binary.test.mjs` | New: 17 unit tests |
| `scripts/run-wdio-performance-benchmark.mjs` | `listAvailableSpecNames`/`isKnownSpecName` — real allowlist for `--spec` |
| `scripts/run-wdio-performance-benchmark.test.mjs` | 7 new tests for the above |
| `package.json` | New `build:e2e:wdio-plugin` script |
| `.gitignore` | `target-wdio-plugin/`, `target-production-check/` |
| `apps/desktop/e2e-wdio/specs/csv-import.e2e.ts` | `clickWhenEnabled`, shared `clickNav`, 2 row-lookup patterns → atomic `execute()` |
| `apps/desktop/e2e-wdio/specs/destructive-guards-hierarchy.e2e.ts` | `clickWhenEnabled`, shared `clickNav` |
| `apps/desktop/e2e-wdio/specs/destructive-guards-inventory.e2e.ts` | `clickWhenEnabled`, shared `clickNav` |
| `apps/desktop/e2e-wdio/specs/entity-deletes-hierarchy.e2e.ts` | `clickWhenEnabled`, shared `clickNav` |
| `apps/desktop/e2e-wdio/specs/entity-deletes-inventory.e2e.ts` | `clickWhenEnabled`, shared `clickNav` |
| `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts` | `clickWhenEnabled`, shared `clickNav` |
| `apps/desktop/e2e-wdio/specs/placement-lifecycle.e2e.ts` | `clickWhenEnabled`, shared `clickNav` |
| `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` | New §12: full second-pass documentation |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.4 section extended |
| `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` | Follow-up note pointing to the plugin fix |

## Tests

```
node --test scripts/run-wdio-performance-benchmark.test.mjs scripts/build-wdio-plugin-binary.test.mjs
# 147/147 PASSED

pnpm -C apps/desktop typecheck   (tsc --noEmit)
# PASSED — 0 errors

pnpm -C apps/desktop test        (vitest run)
# PASSED — 895/895

node scripts/check-repo-hygiene.mjs
# PASSED — 8/8

cargo fmt --all --check
# PASSED

cargo check --workspace                                                        # default
cargo check -p rack-inventory-studio-desktop --features wdio-embedded
cargo check -p rack-inventory-studio-desktop --features wdio-plugin
# all PASSED

cargo clippy --workspace -- -D warnings                                        # default
cargo clippy -p rack-inventory-studio-desktop --features wdio-embedded -- -D warnings
cargo clippy -p rack-inventory-studio-desktop --features wdio-plugin -- -D warnings
# all PASSED

git diff --check
# PASSED
```

Windows, `target-wdio-plugin` binary, `RIS_WDIO_EXPECT_PLUGIN=present`:

| Spec | Result | Wall time |
|------|--------|-----------|
| `csv-import` | PASSED | 6s |
| `destructive-guards-hierarchy` | PASSED | 27s |
| `destructive-guards-inventory` | PASSED | 28s |
| `entity-deletes-hierarchy` | PASSED | 13s |
| `entity-deletes-inventory` | PASSED | 15s |
| `entity-updates-work-mode` | PASSED | 23s |
| `placement-lifecycle` | PASSED | 15s |
| `core-inventory` ×2 | PASSED both | 13s, 12s |
| `representative-latency` ×2 | PASSED both, all 9 cases 1/1 | 12,774ms, 12,598ms |

Production build verified on this pass's final HEAD: built to
`target-production-check/`, `app-smoke` run with
`RIS_WDIO_EXPECT_PLUGIN=absent` — passed, confirming `window.wdioTauri` is
genuinely absent (not just visually inspected).

## Risks

- The seven migrated specs' "before" timing is historical (Linux/WebKit,
  pre-plugin) — no isolated "plugin-only" vs "plugin+code-changes" delta
  was captured for them (unlike `representative-latency`, which has a clean
  before/after in this exact environment). Documented explicitly in
  `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §12.5 so the numbers aren't
  mistaken for precise attribution.
- `waitForFormClose` (5 specs) and `support/destructive-ui.ts` (shared by 4
  specs) still use costly `$()`/`.waitForDisplayed()`/`.getText()` chains;
  consciously left untouched this pass — `waitForFormClose` because it
  surfaces error-banner content that the shared `waitForModalClose` doesn't,
  and `destructive-ui.ts` because it's correctness-critical, complex, and
  shared by four specs. Both documented as follow-ups in §12.8.
- Several stray `tauri-driver.exe`/`msedgedriver.exe` processes leaked
  during this session from direct `wdio run` invocations (used to validate
  each spec quickly, outside the benchmark runner's PID-safe cleanup);
  identified by PID/port and manually killed before each subsequent run.
- `wdio-plugin` remains strictly test-only (gated behind an opt-in Cargo
  feature + env var); verified zero impact on the default/production build
  path via full default-feature static checks and a real production build
  + launch + plugin-absence confirmation.

## Not done

- Full 11-spec WDIO suite — intentionally deferred, not a merge gate.
- `waitForFormClose` → shared helper with error-surfacing preserved
  (documented follow-up, §12.8).
- `support/destructive-ui.ts` internals optimization (documented follow-up).
- `placement-lifecycle.e2e.ts`'s `findRowByText`/`navigateToRackDetail` and
  `entity-updates-work-mode.e2e.ts`'s row-scan — same `$$()+.getText()`
  pattern fixed in `csv-import.e2e.ts`, not yet applied here.
- `repository-lifecycle.e2e.ts`, `safety-recovery.e2e.ts`,
  `app-smoke.e2e.ts` — not modified this pass.
- Stage 3C — out of scope, not started.

## Suggested next step

1. Push this pass's commits, wait for standard CI, confirm no new
   dependency advisories from `tauri-plugin-wdio`/`@wdio/tauri-plugin`
   beyond what already exists on the direct base.
2. Update PR #154 body: per-spec before/after table, wdio-plugin binary
   contract, deferred full-suite statement.
3. Generate a fresh review context against `roadmap/e2e-wdio`.
4. After merge: consider the remaining follow-ups in §12.8 (shared
   `waitForFormCloseOrError`, `destructive-ui.ts` optimization, remaining
   row-lookup patterns) as a possible small future pass, and begin Stage 3C
   from the updated `roadmap/e2e-wdio` base.
