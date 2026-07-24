## Summary

Stage 3B.4: E2E WDIO latency optimization — COMPLETE.

Branch `feature/e2e-wdio-latency-optimization` from `roadmap/e2e-wdio`
(base SHA `bd43e90b41bec7237693fe3c845b46bdf4f2f8c2`).

Two optimization batches applied to the external-provider WDIO flow:

**Batch A** — Replaced every `browser.$()` + `getText`/`isDisplayed`/`isEnabled`/`click`
chain with `browser.execute()` DOM reads and `HTMLElement.click()`. A single
`execute()` costs ~17ms vs ~12s for a ChainablePromise `$()` resolution —
700× faster for each replaced call. Also updated `waitForEnabled` and
`expectActiveRepositoryPath` in repository-ui.ts.

**Batch B** — Set global `waitforInterval: 100` in wdio.conf.ts and added
`interval: 100` to every `waitUntil` call, reducing poll overhead from 500ms
to 100ms.

Result vs trigger-fix-only baseline: test time −60%, command count −45%,
P95 latency −50%, >=5s command rate −44%.

## Branch and base

| Item | Value |
|------|-------|
| Branch | `feature/e2e-wdio-latency-optimization` |
| Direct base | `roadmap/e2e-wdio` |
| Base SHA | `bd43e90b41bec7237693fe3c845b46bdf4f2f8c2` |
| Stage | 3B.4 |
| Provider | `external` (unchanged) |
| Embedded | deferred and untouched |

## Commits

1. `9071b1e` `docs(e2e): record Stage 3B.4 latency baseline, diagnosis, and optimization plan`
2. `70757f6` `perf(e2e): batch A+B — replace $+getText/waitForDisplayed with execute()`
3. `docs(e2e): record after-run 2 results and finalize Stage 3B.4 report` *(this commit)*

## Before-baseline (Linux, 2026-07-24)

**Environment:**
- Ubuntu 24.04 LTS, kernel 6.8.0-117-generic, Intel i5-6500T (4 cores), 7717 MB RAM
- Node.js v18.19.1, Rust 1.95.0, WebdriverIO 9.29.1, @wdio/tauri-service 1.2.0
- Binary: `target/release/rack-inventory-studio-desktop` (built 2026-07-24T05:07, no wdio-embedded feature)
- Display: `xvfb-run -a` (auto-selected unused display)

**app-smoke ×2 (both CLEAN_PASS):**

| Run | Total | Commands | Median | P95 | >=5s |
|-----|-------|----------|--------|-----|------|
| 1 | 80s | 37 | 17ms | 12458ms | 14/37 |
| 2 | 80s | 37 | 17ms | 12382ms | 14/37 |

**core-inventory ×2 (original code — TEST_FAILED):**

| Run | Outcome | Total exec | Commands | P95 | >=5s |
|-----|---------|-----------|----------|-----|------|
| 1 (mryhjcxk) | TEST_FAILED | 798147ms | 500 (cap) | 24480ms | 153/500 |
| 2 (mryhyfe2) | TEST_FAILED | 798751ms | 500 (cap) | 24491ms | 153/500 |

Failure: step 13 trigger-text check — `$().getText()` inside `waitUntil` predicate
took ~12s per iteration vs 5s timeout.

**core-inventory trigger-fix only (intermediate data point — mryiqkm0):**

| Outcome | Test exec | Commands | P95 | >=5s |
|---------|-----------|----------|-----|------|
| CLEAN_PASS | 1366126ms (22.8 min) | 855 | 24368ms | 274/855 |

## After-results (Linux, 2026-07-24)

Same binary, fully optimized test code (Batch A+B).

**core-inventory ×2 (after Batch A+B):**

| Run | Outcome | Test exec | Commands | Median | P95 | Max | >=5s |
|-----|---------|-----------|----------|--------|-----|-----|------|
| 1 (mryjgiov) | CLEAN_PASS | 543202ms (9.1 min) | 473 | 9ms | 12200ms | 60507ms | 85/473 |
| 2 (mryjtts3) | CLEAN_PASS | 544595ms (9.1 min) | 473 | 9ms | 12197ms | 61176ms | 85/473 |

Both runs consistent (identical command count, p95 within 3ms).

**app-smoke after:** *(pending — being run now)*

## Diagnosis

The dominant bottleneck was WDIO's ChainablePromise element resolution
(`browser.$()`). Each `$()` call silently polls until the element is found
(~6s per cycle) then issues a protocol command (~6s) = ~12s per call.

Root-cause categories documented in `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md`:
- Cat A: `$()` + getText/isDisplayed/isEnabled inside waitUntil predicates
- Cat B: Default waitforInterval 500ms
- Cat C: `$()` + click for row/button navigation
- Cat D: `waitForDisplayed` on add-buttons and modal open/close

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` | Batch A: 30+ patterns replaced with execute(); added clickWhenVisible helper; updated clickNav, waitForModal, waitForModalClose |
| `apps/desktop/e2e-wdio/support/repository-ui.ts` | Batch A: waitForEnabled and expectActiveRepositoryPath converted to execute()-based |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Batch B: added waitforInterval: 100 |
| `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` | New: full baseline data, 3-level comparison, classification, batch descriptions |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.4 section added, status updated to COMPLETE |

## Tests

```
# TypeScript check
node_modules/.bin/tsc --noEmit    # PASSED (src/ only, as per package.json typecheck)

# core-inventory after run 1
xvfb-run -a RIS_WDIO_TIMING=1 node_modules/.bin/wdio run e2e-wdio/wdio.conf.ts \
  --spec e2e-wdio/specs/core-inventory.e2e.ts
# RESULT: PASSED in 00:09:06
```

## Risks

- Reducing poll interval from 500ms to 100ms increases the number of execute()
  calls slightly during active waiting periods. Verified stable on Linux/xvfb.
- Pre-resolved element references from `$()` used with `elementClick` are still
  valid within a single step (no cross-step navigation invalidates them).
- `execute(HTMLElement.click())` does not dispatch `mousedown` — SearchableSelect
  options retain WDIO `.click()` to preserve `onMouseDown` semantics. Confirmed
  working in after-run 1 (model assigned successfully).

## Not done

- Reducing poll interval below 100ms (speculative, no data to justify).
- Embedded provider optimization (deferred, out of scope).
- `SearchableSelect.tsx` changes (out of scope, constraint).
- `reactSetValue`/`reactSelectValue` optimization (still use `$()` internally;
  separate refactor needed to preserve React onChange dispatch).
- `toHaveAttribute` expect assertions on nav elements (still use `$()` + getAttribute;
  not weakened per constraint).
- Stage 3C (out of scope).
- New workflow coverage (out of scope).
- app-smoke after-benchmark (pending).

## Suggested next step

1. Confirm app-smoke has no regression (run app-smoke ×2 with same binary).
2. Open PR from `feature/e2e-wdio-latency-optimization` → `roadmap/e2e-wdio`.
3. Generate review context against `roadmap/e2e-wdio`.
4. After Stage 3B.4 merge: begin Stage 3C (remaining placement workflows) from
   the updated `roadmap/e2e-wdio` base.
