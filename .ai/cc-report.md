## Summary

Stage 3B.4: E2E WDIO latency optimization — IN REVIEW (Repair Pass applied).

**Repair Pass (RP)** addressed the following review findings on `feature/e2e-wdio-latency-optimization`:

1. **`expectActiveRepositoryPath` semantic regression fixed** — Now two-phase:
   execute() waits for visibility, then fetches `textContent`; Node-side
   `canonicalPath()` is applied to both the displayed text and expectedPath.
   Previously, only the expected path was canonicalized; the displayed text
   was only separator-normalized, missing symlink resolution.

2. **`waitForEnabled` stale-reference fixed** — Element reference now re-fetched
   AFTER `waitUntil` completes to avoid returning a stale DOM node if React
   re-rendered during the wait.

3. **`HTMLElement.click()` restricted to WebKit non-interactable `<tr>` exception** —
   `clickNav()` and `clickWhenVisible()` now use WebDriver `browser.$().click()`
   after the visibility wait. Row clicks (location/rack `<tr>`) extracted to
   `clickRowViaDom()` helper with mandatory comment explaining the WebKit
   non-interactable exception. `SearchableSelect` retains WDIO `.click()` for
   `onMouseDown` semantics (unchanged).

4. **`isDomElementVisible` shared helper added** — `dom-helpers.ts` exports the
   canonical visibility definition (exists + rect > 0 + display ≠ none +
   visibility ≠ hidden). Used in `clickNav`, `clickWhenVisible`, `waitForModal`,
   and `expectActiveRepositoryPath` via inline-equivalent logic in execute() calls.

5. **Unit tests added** — `dom-helpers.test.ts` (5 tests, jsdom) for
   `isDomElementVisible`; `repository-ui.test.ts` (8 tests, node) for
   `canonicalPath` comparison and `waitForEnabled` re-fetch order.

6. **Docs qualified** — Benchmark data classified (Class A/B/C); count vs rate
   reductions distinguished; ChainablePromise descriptions qualified with
   "In the measured Linux external-provider environment..."; Batch A+B combined-
   measurement note added; status updated to IN REVIEW everywhere.

Post-repair final benchmarks not yet run (pending CI gate).

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

**app-smoke ×2 after (no regression):**

| Run | Outcome | Test exec | Commands | Median | P95 | >=5s |
|-----|---------|-----------|----------|--------|-----|------|
| 1 (mryk82vk) | CLEAN_PASS | 74147ms | 37 | 18ms | 12402ms | 14/37 |
| 2 (mryk9sj8) | CLEAN_PASS | 75138ms | 37 | 17ms | 12651ms | 14/37 |

Identical to baseline (37 cmds, 14/37 ≥5s, P95 ~12.5s). No regression.

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
| `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts` | Batch A+B: 30+ patterns replaced with execute(); RP: clickNav/clickWhenVisible use browser.$().click(); clickRowViaDom helper added; waitForModal uses isDomElementVisible semantics |
| `apps/desktop/e2e-wdio/support/repository-ui.ts` | Batch A+B: waitForEnabled and expectActiveRepositoryPath converted; RP: stale-ref fixed, canonicalPath applied to both sides |
| `apps/desktop/e2e-wdio/support/dom-helpers.ts` | New: isDomElementVisible canonical visibility definition |
| `apps/desktop/e2e-wdio/support/dom-helpers.test.ts` | New: 5 unit tests for isDomElementVisible (jsdom) |
| `apps/desktop/e2e-wdio/support/repository-ui.test.ts` | New: 8 unit tests for canonicalPath and waitForEnabled |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Batch B: added waitforInterval: 100 |
| `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` | Full baseline data; RP: 3-class data classification, count/rate distinction, ChainablePromise qualifier, Batch A+B combined note, status IN REVIEW |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.4 section; RP: status updated to IN REVIEW |

## Tests

```
# TypeScript check (e2e-wdio files, filtering known WDIO framework type errors)
tsc --noEmit --types @wdio/globals/types,node e2e-wdio/specs/core-inventory.e2e.ts \
  e2e-wdio/support/repository-ui.ts e2e-wdio/support/dom-helpers.ts
# PASSED

# Unit tests (src/ + e2e-wdio/support/*.test.ts)
node_modules/.bin/vitest run
# PASSED — 866 tests in 53 files
# Includes new: dom-helpers.test.ts (5), repository-ui.test.ts (8)

# Hygiene
node scripts/check-repo-hygiene.mjs
# PASSED — 8/8 checks

# core-inventory after run 1 (pre-repair runs — already documented)
# Run 1 (mryjgiov): CLEAN_PASS in 00:09:06
# Run 2 (mryjtts3): CLEAN_PASS in 00:09:07

# Post-repair final benchmarks: PENDING (to run after CI gate)
```

## Risks

- Reducing poll interval from 500ms to 100ms increases execute() calls slightly.
  Verified stable on Linux/xvfb across 4 CLEAN_PASS runs.
- `browser.$().click()` in `clickNav` / `clickWhenVisible` fires `findElement`
  after the visibility wait. This adds one extra protocol round-trip vs the
  previous execute()-click. At ~12s per `findElement` on this machine, nav
  actions will be slightly slower than the pre-repair measurements — acceptable
  since semantic correctness (pointer events, interactability check) is required.
- `execute(HTMLElement.click())` does not dispatch `mousedown` — this is now
  documented in `clickRowViaDom` as the exception for WebKit non-interactable
  `<tr>` rows only. SearchableSelect options retain WDIO `.click()`.
- `expectActiveRepositoryPath` now throws (not returns false) on path mismatch.
  This is intentional — a mismatch at this point is a hard failure.

## Not done

- Post-repair final benchmarks (app-smoke ×2 + core-inventory ×2) — pending CI gate.
- Reducing poll interval below 100ms (speculative, no data to justify).
- Embedded provider optimization (deferred, out of scope).
- `SearchableSelect.tsx` changes (out of scope, constraint).
- `reactSetValue`/`reactSelectValue` optimization (still use `$()` + `waitForDisplayed`
  internally; separate refactor needed to preserve React onChange dispatch).
- `toHaveAttribute` expect assertions on nav elements (still use `$()` + getAttribute;
  not weakened per constraint).
- Stage 3C (out of scope).
- New workflow coverage (out of scope).

## Suggested next step

1. Commit repair pass: `fix(e2e): preserve interaction semantics in latency helpers`
   + `docs(e2e): qualify Stage 3B.4 benchmark conclusions`.
2. Run post-repair final benchmarks: app-smoke ×2 + core-inventory ×2.
3. Push branch and open PR from `feature/e2e-wdio-latency-optimization` → `roadmap/e2e-wdio`.
4. Wait for CI to pass.
5. Generate new review context against `roadmap/e2e-wdio`.
6. After Stage 3B.4 merge: begin Stage 3C (remaining placement workflows) from
   the updated `roadmap/e2e-wdio` base.
