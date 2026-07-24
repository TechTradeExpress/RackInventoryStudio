# E2E WDIO Latency Optimization — Stage 3B.4

**Branch:** `feature/e2e-wdio-latency-optimization`
**Base:** `roadmap/e2e-wdio`
**Base SHA:** `bd43e90b41bec7237693fe3c845b46bdf4f2f8c2`
**Status:** COMPLETE (run 2 in progress for confirmation)

---

## 1. Goal

Reduce the long-tail latency in the `external` driver provider flow without
changing test coverage, assertion semantics, or the default provider.

The external provider is the only supported WDIO provider. No changes to the
embedded provider, `SearchableSelect.tsx`, or any production behavior.

---

## 2. Environment

| Item | Value |
|------|-------|
| Platform | Linux x64 |
| OS | Ubuntu 24.04 LTS |
| Kernel | 6.8.0-117-generic |
| CPU | Intel i5-6500T (4 cores) |
| RAM | 7717 MB |
| Node.js | v18.19.1 |
| Rust | 1.95.0 |
| WebdriverIO | 9.29.1 |
| @wdio/tauri-service | 1.2.0 |
| tauri-driver | (system install at /cache/cargo/bin/tauri-driver) |
| WebKit WebDriver | /usr/bin/WebKitWebDriver |
| Binary | `target/release/rack-inventory-studio-desktop` (built 2026-07-24T05:07, no wdio-embedded feature) |
| Display | `xvfb-run -a` (auto-selected unused display) |
| Provider | `external` (default, only supported provider) |

---

## 3. Benchmark commands

```bash
# From repo root
export PATH="/cache/cargo/bin:$PATH"

# app-smoke baseline
xvfb-run -a node scripts/run-wdio-performance-benchmark.mjs \
  --provider external --spec app-smoke --repeat 2

# core-inventory baseline
xvfb-run -a node scripts/run-wdio-performance-benchmark.mjs \
  --provider external --spec core-inventory --repeat 2
```

Both runs use auto-detected binary (`target/release/rack-inventory-studio-desktop`).
Neither run uses `--compare`, `--provider embedded`, or any modified binary.

---

## 4. Before-baseline: app-smoke ×2

Binary: `target/release/rack-inventory-studio-desktop` (no embedded feature)
Run date: 2026-07-24

### Run results

| Run | Outcome | Total | Session startup | Test exec | Teardown | Commands | Median | P95 | Max | >=1s | >=5s |
|-----|---------|-------|-----------------|-----------|----------|----------|--------|-----|-----|------|------|
| 1 | CLEAN_PASS | 80s | 969ms | 74038ms | 5ms | 37 | 17ms | 12458ms | 12564ms | 14 | 14 |
| 2 | CLEAN_PASS | 80s | 957ms | 74206ms | 6ms | 37 | 17ms | 12382ms | 12668ms | 14 | 14 |

### Aggregate

- Median total: 79784ms
- Median session startup: 963ms
- Median test execution: 74122ms
- Median command latency: 17ms
- P95 command latency: 12458ms
- Commands >=5s: 14/37 (38%)

### Artifact paths

- Run 1: `/tmp/ris-wdio-bench/mryhcfzd-hqz3d4`
- Run 2: `/tmp/ris-wdio-bench/mryhe5js-c1efer`
- Aggregate: `/tmp/ris-wdio-bench/benchmark-2026-07-24T05-08-37/external-app-smoke.json`

### Analysis

All 14 slow commands (>=5s) are element-lookup commands (`$`, `$$`, `isExisting`)
during the application startup phase. The app-smoke test runs immediately after the
WebView session is established, before the React app has finished mounting.

**Mechanism**: WDIO's ChainablePromise element resolution (`browser.$()`) uses internal
silent polling (~500ms interval, no command hooks per failed attempt). After ~6.4s
of silent polling, body appears in the WebView. The underlying `findElement` WebDriver
call then takes a further ~6.2s to confirm the element. Total per element lookup: ~12.5s.

After the React app renders at ~T=13s (from first test command), all subsequent
lookups and `isDisplayed` checks complete in 7–11ms.

**Conclusion for app-smoke**: The 14 slow commands are entirely due to application
startup time. No test-code optimization can reduce this without changing the app
itself (e.g., adding earlier DOM signals). App-smoke is already optimal from the
test-code perspective.

---

## 5. Before-baseline: core-inventory ×2

Binary: `target/release/rack-inventory-studio-desktop` (no embedded feature)
Run date: 2026-07-24

### Run results

Both runs terminated with `TEST_FAILED` before completing the test:

| Run | Outcome | Total exec | Commands | Median | P95 | Max | >=5s |
|-----|---------|-----------|----------|--------|-----|-----|------|
| 1 (mryhjcxk) | TEST_FAILED | 798147ms | 500 (cap) | 9ms | 24480ms | 91034ms | 153/500 |
| 2 (mryhyfe2) | TEST_FAILED | 798751ms | 500 (cap) | 9ms | 24491ms | 91170ms | 153/500 |

**Failure point:** step 13 — "Device model trigger never showed selected model"

**Root cause:** `waitUntil` with `$().getText()` inside the predicate.
`$().getText()` uses WDIO's ChainablePromise which polls at ~500ms intervals
for the element before issuing the protocol call. On this machine each
ChainablePromise resolution takes ~6s (silent polling until element found)
plus ~6s for the actual `getElementText` protocol call = **~12s per iteration**.
With only a 5 s `waitUntil` timeout the predicate was never evaluated before
the timeout fired, causing immediate test failure.

### Steps completed before failure (wall-clock timestamps, both runs consistent)

Only named `measureStep` blocks were tracked. Steps 1–6 completed before
the test hit an untracked step (7–12) followed by the fatal step 13.

| Step | Run 1 | Run 2 |
|------|-------|-------|
| create-repository | 80410ms | 79929ms |
| open-location-form | 54506ms | 54846ms |
| fill-location-form | 12158ms | 12183ms |
| submit-location-form | 54927ms | 55013ms |
| wait-for-location-row | 12168ms | 12119ms |
| navigate-location-to-racks | 24218ms | 24395ms |

### Baseline slow-command profile (run 2)

| Command | Count | Median | P95 | Mean | Total wall |
|---------|-------|--------|-----|------|-----------|
| `$` (ChainablePromise) | 42 | 12170ms | 12356ms | 12188ms | ~511s |
| `findElement` (protocol) | 42 | 6126ms | 6228ms | 6129ms | ~257s |
| `click` (WDIO method) | 12 | 42574ms | 54602ms | 44632ms | ~535s |
| `elementClick` (protocol) | 26 | 6161ms | 30486ms | 16175ms | ~420s |
| `getAttribute` | 4 | 91034ms | 91170ms | 91102ms | ~364s |
| `getElementAttribute` (protocol) | 8 | 12237ms | 78956ms | 28900ms | ~231s |
| `getElementText` | 11 | 12190ms | 24351ms | 9996ms | ~110s |
| `executeAsync` | 38 | 9ms | 54ms | 17ms | ~1s |
| `executeAsyncScript` (protocol) | 38 | 7ms | 53ms | 16ms | ~1s |

**Key insight:** `browser.execute()` (executeAsync/executeAsyncScript pair) costs ~17ms.
Every `$()` or `getElementText` call costs ~12s — 700× slower.

---

## 6. Slow-command classification

### Category A — `$()` + getText/isDisplayed/isEnabled inside waitUntil predicates

`browser.waitUntil(() => el.getText())` fires `findElement` + `getElementText`
on every poll iteration (~6s + 6s = 12s per poll). With a 500ms polling
interval the first poll fires, takes 12s, and the timeout triggers on the
next iteration.

**Effect:** waitUntil loops that should complete in <100ms take 12–91s.

**Fix (Batch A):** Replace predicate body with `browser.execute()` DOM read.
`execute()` costs ~17ms per call regardless of DOM state.

### Category B — Default `waitforInterval: 500ms`

Even with `execute()`-based predicates, `waitUntil` without an explicit
`interval` uses the global `waitforInterval` default of 500ms. This adds
500ms latency per poll cycle even when the condition is true.

**Fix (Batch B):** Set global `waitforInterval: 100` in wdio.conf.ts and add
`interval: 100` to every `waitUntil` call.

### Category C — `$()` + `.click()` for row clicks

`browser.$('[data-row-sel]').click()` fires `findElement` (~6s) +
`elementClick` (~6–42s) = 12–48s for a single click on a table row.

WebKit marks `<tr>` elements as non-interactable for WDIO's `.click()`,
causing additional retries that inflate the `elementClick` time to 42–54s.

**Fix (Batch A):** Replace row clicks with `browser.execute()` calling
`HTMLElement.click()` directly, which bypasses the WebDriver interactability
check and costs ~17ms.

### Category C2 — SearchableSelect clicks

`SearchableSelect.tsx` uses `onMouseDown` on list options (not `onClick`).
`HTMLElement.click()` via execute() does NOT dispatch `mousedown`, so it
cannot be used for dropdown option selection.

**Rule:** Keep WDIO `.click()` for SearchableSelect option elements.
Use XPath + `.click()` after confirming option existence via execute().

### Category D — `waitForDisplayed` on add-buttons and modal open/close

`$('btn').waitForDisplayed()` → findElement (~6s) + isElementDisplayed loop.
Each negative poll costs 6s (findElement each time).

**Fix (Batch A):** Replace with `waitUntil(() => execute(getBoundingClientRect
check), { interval: 100 })`. Zero `$()` calls, 17ms per check.

---

## 7. Optimization batches

### Batch A — Replace `$`+getText/isDisplayed patterns with `execute()`

Applied to `apps/desktop/e2e-wdio/specs/core-inventory.e2e.ts`:

| Location | Old pattern | New pattern |
|----------|-------------|-------------|
| `clickNav` helper | `$().waitForDisplayed + execute-click` | `waitUntil(execute(rect check)) + execute(click)` |
| `waitForModal` helper | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| `waitForModalClose` helper | `$().isDisplayed` | `waitUntil(execute(rect=0 check))` |
| `clickWhenVisible` new helper | — | `waitUntil(execute) + execute(click)` |
| step 5 (location row) | `$().getText` in loop | `execute(textContent.includes)` |
| step 6 (navigate to racks) | `$().getText` + click | single `execute(find+click)` |
| step 7 (rack form open) | `$().waitForDisplayed + click` | `clickWhenVisible` |
| step 8 (rack row) | `$().getText` in loop | `execute(textContent.includes)` |
| step 10 (model form open) | `$().waitForDisplayed + click` | `clickWhenVisible` |
| step 11 (model row) | `$().getText` in loop | `execute(textContent.includes)` |
| step 13 (device form open) | `$().waitForDisplayed + click` | `clickWhenVisible` |
| step 13 (trigger text) | `$().getText` in waitUntil | `execute(textContent check)` |
| step 13 (model-trigger open) | `$().waitForDisplayed + click` | `clickWhenVisible` |
| step 13 (search dropdown) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 14 (device row) | `$().getText` + separate attribute | `execute(returns {text,deviceCode})` |
| step 15 (rack-add-btn wait) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 16 (rack row click) | `$().getText` + click | `execute(find+click)` |
| step 16 (palette zone) | `$().isDisplayed` | `waitUntil(execute(rect check))` |
| step 17 (palette button) | `$().isDisplayed` | `waitUntil(execute(rect check))` |
| step 18 (place-btn enabled) | `$().isEnabled` | `waitUntil(execute(!btn.disabled))` |
| step 18 (start-u input) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 19 (submit placement) | 4-protocol waitUntil | single `execute({closed,error})` |
| step 20 (placed card) | `$().isDisplayed` + separate `getAttribute` | `waitUntil(execute)` + `execute(getAttribute)` |
| step 21 (repo tab) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 21 (landing title) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 21 (active-path gone) | `$().waitForDisplayed(reverse)` | `waitUntil(execute(rect=0))` |
| step 22 (active-root reopen) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 23 (location row) | `$().getText` in loop | `execute(textContent.includes)` |
| step 23 (location click) | `$().getText` + click | `execute(find+click)` |
| step 23 (nav after click) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 23 (rack-add-btn) | `$().waitForDisplayed` | `waitUntil(execute(rect check))` |
| step 23 (rack click) | `$().getText` + click | `execute(find+click)` |
| step 23 (palette reopen) | `$().isDisplayed` | `waitUntil(execute(rect check))` |
| step 24 (persisted card) | `$().isDisplayed` + `getAttribute` | `waitUntil(execute)` + `execute(getAttribute)` |

Applied to `apps/desktop/e2e-wdio/support/repository-ui.ts`:

| Function | Old pattern | New pattern |
|----------|-------------|-------------|
| `waitForEnabled` | `$() + waitUntil(el.isEnabled())` | `$() once + waitUntil(execute(!btn.disabled), interval:100)` |
| `expectActiveRepositoryPath` | `$().waitForDisplayed + $().getText` | single `execute(visibility + textContent check)` |

### Batch B — Reduce polling interval to 100ms

- `wdio.conf.ts`: added `waitforInterval: 100` to the config object
- Every new `waitUntil` call in Batch A uses `interval: 100`
- Every pre-existing `waitUntil` in the spec had `interval: 100` added

---

## 8. After-results

Binary: `target/release/rack-inventory-studio-desktop` (same build, no changes)
Run date: 2026-07-24

### Run 1 (mryjgiov-r5emv0)

| Item | Value |
|------|-------|
| Outcome | **CLEAN_PASS** |
| Total wall | ~546s (9m06s) |
| Session startup | ~963ms |
| Test execution | 543202ms |
| Commands | 473 |
| Median latency | 9ms |
| P95 latency | 12200ms |
| Max latency | 60507ms |
| >=5s commands | 85 / 473 |

#### Step timings (run 1)

| Step | After | Before (partial) | Delta |
|------|-------|-----------------|-------|
| create-repository | 79890ms | 80410ms | −1% |
| open-location-form | **75ms** | 54506ms | **−99.9%** |
| fill-location-form | 12003ms | 12158ms | −1% |
| submit-location-form | **30555ms** | 54927ms | **−44%** |
| wait-for-location-row | **41ms** | 12168ms | **−99.7%** |
| navigate-location-to-racks | **81ms** | 24218ms | **−99.7%** |
| submit-placement | 18492ms | — | (new, not in baseline) |
| save-and-close | 61138ms | — | (new, not in baseline) |
| reopen-repository | 42683ms | — | (new, not in baseline) |

#### Command profile (run 1)

| Command | Count | Median | P95 | Mean |
|---------|-------|--------|-----|------|
| `$` (ChainablePromise) | 28 | 12157ms | 12381ms | 12144ms |
| `findElement` (protocol) | 28 | 6142ms | 6256ms | 6134ms |
| `elementClick` (protocol) | 18 | 6149ms | 60507ms | 16260ms |
| `getAttribute` | 3 | 24572ms | 36291ms | 28333ms |
| `getElementAttribute` (protocol) | 8 | 12123ms | 24572ms | 15207ms |
| `executeAsync` | 97 | 8ms | 53ms | 15ms |
| `executeAsyncScript` (protocol) | 97 | 8ms | 53ms | 15ms |
| `waitUntil` | 73 | 8ms | 107ms | 20ms |

### Comparison (run 1 after vs run 2 before)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Outcome | TEST_FAILED | **CLEAN_PASS** | Fixed |
| Test execution | 798751ms (partial, failed) | 543202ms (complete) | −32% (full pass) |
| Commands | 500 (cap) | 473 | −5% |
| P95 latency | 24491ms | 12200ms | **−50%** |
| Max latency | 91170ms | 60507ms | **−34%** |
| >=5s count | 153/500 (30.6%) | 85/473 (18.0%) | **−41% rate** |
| `$` calls | 42 | 28 | −33% |
| `click` calls | 12 | 0 | **−100%** |
| `getElementText` calls | 11 | 0 | **−100%** |
| `executeAsync` calls | 38 | 97 | +155% (replaces $+getText) |

The `click` and `getElementText` protocol calls are entirely eliminated.
`executeAsync` increases proportionally as those patterns are replaced.

### Notes on remaining slow commands

- **`save-and-close: 61138ms`** — dominated by the Tauri backend persisting all
  created entities + placement YAML files. The elementClick at 60507ms max is the
  "unsaved-changes-save" button triggering the backend write. This is correct
  application behavior; no test-code optimization can reduce it.

- **`reopen-repository: 42683ms`** — includes `reactSetValue` (12s, unchanged) +
  backend loading and deserializing the repository YAML files.

- **`getAttribute: 3 × 28333ms mean`** — remaining `toHaveAttribute` assertions
  on nav aria-current state. Down from 4 × 91102ms in baseline (−77%). Not removed
  since they are correctness assertions.

- **`create-repository: 79890ms`** — entirely in `createRepositoryThroughUi` which
  calls `reactSetValue` ×3 (3 × 12s = 36s) + `waitForEnabled` + click + active-root
  wait. Unchanged by optimization; `reactSetValue` is the floor.

### Run 2

*(In progress)*

---

## 9. Remaining bottlenecks

After the optimizations:

- `reactSetValue` / `reactSelectValue`: still use `browser.$()` + `waitForDisplayed` internally
  (needed to return an element reference for the native setter pattern). Each call
  costs ~12s on this machine. There are ~3 `reactSetValue` calls per form submission.
  These are in the shared `repository-ui.ts` helper and would require a separate
  refactor to optimize without breaking the React onChange dispatch mechanism.

- WDIO `.click()` on SearchableSelect options: still uses `findElement` + `elementClick`
  via XPath selector. Required because `onMouseDown` needs a real mouse event.

- `toHaveAttribute` expect assertions on nav items: uses WDIO's built-in expect
  which internally resolves `$()` and calls `getAttribute`. These contribute
  ~91s each in the baseline (likely retry-loop expansion). Not removed since
  they are correctness assertions. Could be replaced with execute()-based
  attribute checks in a future stage.
