# E2E WDIO Latency Optimization — Stage 3B.4

**Branch:** `feature/e2e-wdio-latency-optimization`
**Base:** `roadmap/e2e-wdio`
**Base SHA:** `bd43e90b41bec7237693fe3c845b46bdf4f2f8c2`
**Status:** IN REVIEW

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
silent polling (~500ms interval, no command hooks per failed attempt). In the measured
Linux external-provider environment, this results in ~6.4s of silent polling until the
body appears in the WebView, followed by a further ~6.2s `findElement` WebDriver call —
about 12.5s per element lookup on this machine.

After the React app renders at ~T=13s (from first test command), all subsequent
lookups and `isDisplayed` checks complete in 7–11ms.

**Conclusion for app-smoke**: The 14 slow commands are entirely due to application
startup time. No test-code optimization can reduce this without changing the app
itself (e.g., adding earlier DOM signals). App-smoke is already optimal from the
test-code perspective.

### After-optimization: app-smoke ×2 (regression check)

Run date: 2026-07-24 (same binary, Batch A+B code applied).

| Run | Outcome | Test exec | Commands | Median | P95 | >=5s |
|-----|---------|-----------|----------|--------|-----|------|
| 1 (mryk82vk) | CLEAN_PASS | 74147ms | 37 | 18ms | 12402ms | 14/37 |
| 2 (mryk9sj8) | CLEAN_PASS | 75138ms | 37 | 17ms | 12651ms | 14/37 |

**No regression.** Command count, slow-command count, and P95 are all identical
to baseline within normal run-to-run variance. The `waitforInterval: 100` change
does not affect app-smoke because that spec has no `waitUntil` calls; its 14
slow commands remain the inherent startup-time floor.

---

## 5. Before-baseline: core-inventory ×2

Binary: `target/release/rack-inventory-studio-desktop` (no embedded feature)
Run date: 2026-07-24

### Run results — full original code (TEST_FAILED)

Both runs terminated with `TEST_FAILED` before completing the test:

| Run | Outcome | Total exec | Commands | Median | P95 | Max | >=5s |
|-----|---------|-----------|----------|--------|-----|-----|------|
| 1 (mryhjcxk) | TEST_FAILED | 798147ms | 500 (cap) | 9ms | 24480ms | 91034ms | 153/500 |
| 2 (mryhyfe2) | TEST_FAILED | 798751ms | 500 (cap) | 9ms | 24491ms | 91170ms | 153/500 |

**Failure point:** step 13 — "Device model trigger never showed selected model"

**Root cause:** `waitUntil` with `$().getText()` inside the predicate.
`$().getText()` uses WDIO's ChainablePromise which polls at ~500ms intervals
for the element before issuing the protocol call. In the measured Linux
external-provider environment, each ChainablePromise resolution consistently
took ~6s (silent polling until element found) plus ~6s for the actual
`getElementText` protocol call — about 12s per iteration on this machine.
With only a 5s `waitUntil` timeout the predicate was never evaluated before
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

**Key insight:** In the measured Linux external-provider environment,
`browser.execute()` (executeAsync/executeAsyncScript pair) costs ~17ms while the
affected `$()` and `getElementText` paths consistently took ~12s — about 700× slower.

### Class B diagnostic: trigger-fix only (single run — mryiqkm0-z6uuy8)

This data point was captured incidentally. A background benchmark task that
started before Batch A+B was applied ran two sequential spec passes.
Run 1 ran with only the trigger-text fix applied (the $().getText() → execute()
change that made the test pass at all); all other $+waitForDisplayed patterns
remained unchanged.

**This is a single-run diagnostic reference, not a validated median.** It is
included to show the contribution of the trigger fix alone. No second run was
captured to validate it. See the data classification section for context.

| Outcome | Test exec | Commands | Median | P95 | Max | >=5s |
|---------|-----------|----------|--------|-----|-----|------|
| CLEAN_PASS | 1366126ms (22.8 min) | 855 | 9ms | 24368ms | 91713ms | 274/855 |

| Step | Trigger-fix only | Full original (partial) |
|------|-----------------|------------------------|
| create-repository | 79902ms | 80410ms |
| open-location-form | 55034ms | 54506ms |
| fill-location-form | 12294ms | 12158ms |
| submit-location-form | 55600ms | 54927ms |
| wait-for-location-row | 12196ms | 12168ms |
| navigate-location-to-racks | 24547ms | 24218ms |
| submit-placement | 42403ms | — (test failed before) |
| save-and-close | 97296ms | — |
| reopen-repository | 65916ms | — |

With only the trigger fixed, the test passes but takes 22.8 minutes. Steps 1–6
are nearly identical to the failing baseline — the $+getText patterns in those
steps were not yet replaced.

---

## 6. Slow-command classification

### Category A — `$()` + getText/isDisplayed/isEnabled inside waitUntil predicates

`browser.waitUntil(() => el.getText())` fires `findElement` + `getElementText`
on every poll iteration. In the measured Linux external-provider environment
each iteration consistently took about 12s (~6s + 6s). With a 500ms polling
interval the first poll fires, takes ~12s, and the timeout triggers on the
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

| Location | Old pattern | New pattern (after RP) |
|----------|-------------|------------------------|
| `clickNav` helper | `$().waitForDisplayed + execute-click` | `waitUntil(execute(visibility check)) + browser.$().click()` |
| `waitForModal` helper | `$().waitForDisplayed` | `waitUntil(execute(visibility check))` |
| `waitForModalClose` helper | `$().isDisplayed` | `waitUntil(execute(rect=0 check))` |
| `clickWhenVisible` new helper | — | `waitUntil(execute(visibility check)) + browser.$().click()` |
| row click patterns | inline `execute(find+click)` | `clickRowViaDom()` helper (WebKit non-interactable `<tr>` exception; comment documents why) |
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

| Function | Old pattern | New pattern (after RP) |
|----------|-------------|------------------------|
| `waitForEnabled` | `$() + waitUntil(el.isEnabled())` | `waitUntil(execute(!btn.disabled), interval:100)` + re-fetch `$()` after wait |
| `expectActiveRepositoryPath` | `$().waitForDisplayed + $().getText` | `waitUntil(execute(visibility check))` + `execute(textContent)` + Node-side `canonicalPath()` comparison |

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

### Data classification

Three classes of benchmark data appear in this document; they are not
directly comparable and must not be conflated:

- **Class A — direct-base partial runs (TEST_FAILED):** Original code, both
  runs hit the 500-command cap before the test could complete. These show the
  slow-command profile but do not represent a complete test execution.
- **Class B — single-run diagnostic reference (trigger-fix only):** One run
  with only the `$().getText()` trigger fix applied. Included as a reference
  point to isolate the trigger-fix contribution; it is NOT a formal median
  and was NOT validated with a second run.
- **Class C — optimized validation series:** Batch A+B code, repeated twice
  (×2) to establish a stable baseline. Pre-repair and post-repair runs are
  tracked separately within this class.

### Three-level comparison

| Metric | Class A: Original (TEST_FAILED) | Class B: Trigger-fix only | Class C: Full Batch A+B |
|--------|--------------------------------|--------------------------|-----------------------|
| Outcome | TEST_FAILED | CLEAN_PASS | **CLEAN_PASS** |
| Test execution | 798751ms (partial) | 1366126ms (22.8 min) | **543202ms (9.1 min)** |
| Commands | 500 (cap) | 855 | **473** |
| P95 latency | 24491ms | 24368ms | **12200ms** |
| Max latency | 91170ms | 91713ms | **60507ms** |
| >=5s count | 153/500 | 274/855 | **85/473** |
| >=5s rate | 30.6% | 32% | **18%** |
| `$` calls | 42 | ~42 | **28** |
| `click` calls | 12 | ~12 | **0** |
| `getElementText` calls | 11 | ~11 | **0** |
| `executeAsync` calls | 38 | ~38 | **97** |

**Batch A+B savings vs Class B (trigger-fix-only) reference:**
- Test time: 1366s → 543s = **−60%**
- Command count: 855 → 473 = **−45% count reduction**
- P95 latency: 24368ms → 12200ms = **−50%**
- >=5s count: 274 → 85 = **−69% count reduction** (absolute number of slow commands)
- >=5s rate: 32% → 18% = **−44% relative rate reduction** (percentage of commands that are slow)

The >=5s count and >=5s rate reductions are distinct metrics and must not be
conflated: the count reduction (−69%) reflects fewer total commands issued;
the rate reduction (−44%) reflects that a smaller fraction of those commands
are slow.

The `click` and `getElementText` protocol calls are entirely eliminated.
`executeAsync` increases proportionally as those patterns are replaced.

**Note:** The measured result reflects the combined Batch A+B change. The
individual contribution of each batch was not isolated — no separate Batch-A-only
or Batch-B-only run was captured.

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

### Run 2 (mryjtts3-iwqr6i)

| Item | Value |
|------|-------|
| Outcome | **CLEAN_PASS** |
| Total wall | ~547s (9m07s) |
| Test execution | 544595ms |
| Commands | 473 |
| Median latency | 9ms |
| P95 latency | 12197ms |
| Max latency | 61176ms |
| >=5s commands | 85 / 473 |

#### Step timings (run 2)

| Step | Run 2 | Run 1 |
|------|-------|-------|
| create-repository | 79376ms | 79890ms |
| open-location-form | 88ms | 75ms |
| fill-location-form | 12089ms | 12003ms |
| submit-location-form | 30674ms | 30555ms |
| wait-for-location-row | 8ms | 41ms |
| navigate-location-to-racks | 30ms | 81ms |
| submit-placement | 18411ms | 18492ms |
| save-and-close | 61258ms | 61138ms |
| reopen-repository | 42784ms | 42683ms |

Both runs are consistent within normal run-to-run variance (1–2%).

### After ×2 aggregate

| Metric | Run 1 | Run 2 | Notes |
|--------|-------|-------|-------|
| Outcome | CLEAN_PASS | CLEAN_PASS | Both pass |
| Test exec | 543202ms | 544595ms | Consistent |
| Commands | 473 | 473 | Identical |
| Median | 9ms | 9ms | Identical |
| P95 | 12200ms | 12197ms | Essentially identical |
| Max | 60507ms | 61176ms | Backend write variance |
| >=5s | 85/473 | 85/473 | Identical |

---

## 9. Post-repair final results (Class C post-RP)

Binary: `target/release/rack-inventory-studio-desktop` (same build)
Run date: 2026-07-24. Code: Batch A+B + RP semantic fixes.

### core-inventory ×2

| Run | Outcome | Test exec | Commands | Median | P95 | Max | >=5s |
|-----|---------|-----------|----------|--------|-----|-----|------|
| 1 (mrylvzca) | **CLEAN_PASS** | 889498ms (14m49s) | 528 | 8ms | 12250ms | 66813ms | 120/528 |
| 2 (mrymf66z) | **CLEAN_PASS** | 895845ms (14m56s) | 528 | 8ms | 12307ms | 67343ms | 120/528 |

Both runs consistent (identical command count, P95 within 57ms).

#### Step timings (run 1 / run 2)

| Step | Run 1 | Run 2 | Pre-RP (run 1) | Delta vs pre-RP |
|------|-------|-------|----------------|-----------------|
| create-repository | 79831ms | 80681ms | 79890ms | ~0% |
| open-location-form | 30352ms | 30720ms | 75ms | +30 277ms |
| fill-location-form | 12018ms | 11917ms | 12003ms | ~0% |
| submit-location-form | 30451ms | 30774ms | 30555ms | ~0% |
| wait-for-location-row | 44ms | 42ms | 41ms | ~0% |
| navigate-location-to-racks | 75ms | 31ms | 81ms | ~0% |
| submit-placement | 30210ms | 30526ms | 18492ms | +11 718ms |
| save-and-close | 61439ms | 61199ms | 61138ms | ~0% |
| reopen-repository | 42984ms | 42707ms | 42683ms | ~0% |

#### Command profile (run 1 mrylvzca)

| Command | Count | Median | P95 | Mean |
|---------|-------|--------|-----|------|
| `$` (ChainablePromise) | 40 | 12144ms | 12292ms | 12156ms |
| `findElement` (protocol) | 40 | 6126ms | 6209ms | 6124ms |
| `click` (WDIO with retry) | 5 | 42591ms | 54636ms | 44968ms |
| `elementClick` (protocol) | 34 | 6126ms | 30670ms | 13620ms |
| `getAttribute` | 3 | 24572ms | 36291ms | 28333ms |
| `getElementAttribute` | 8 | — | — | — |
| `executeAsync` | 85 | 8ms | 52ms | 17ms |
| `waitForDisplayed` (WDIO retry) | 24 | 8ms | 13ms | 8ms |
| `isDisplayed` (WDIO retry) | 26 | 7ms | 12ms | 8ms |
| `waitUntil` | 72 | 8ms | 107ms | 20ms |

### Pre-RP vs post-RP comparison (Class C)

| Metric | Class C pre-RP | Class C post-RP | Delta |
|--------|---------------|----------------|-------|
| Test exec | 543202ms (9.1 min) | 889498ms (14.8 min) | **+5.7 min** |
| Commands | 473 | 528 | +55 |
| Median | 9ms | 8ms | −1ms |
| P95 | 12200ms | 12250ms | +50ms |
| Max | 60507ms | 66813ms | +6306ms |
| >=5s count | 85/473 | 120/528 | +35 |
| >=5s rate | 18% | 22.7% | +4.7pp |
| `click` (WDIO) | 0 | 5 (median 42591ms) | new |
| `$` calls | 28 | 40 | +12 |
| `elementClick` | 18 | 34 | +16 |
| `executeAsync` | 97 | 85 | −12 |

**Explanation of regression:** The RP restored WebDriver `.click()` for `clickNav`
and `clickWhenVisible` to preserve the full pointer-event sequence. Under WebKit
(Xvfb), WDIO's `.click()` triggers an interactability-retry loop (`isDisplayed` +
`waitForDisplayed` + `elementClick` retries), causing each click to take 42–54s.
The 5 WDIO `click` commands account for ~215s of the 5.7-min regression; the
remaining comes from extra `findElement` calls.

This is correct behavior — nav and button elements must use the full WebDriver
click path. The execute()-based click previously bypassed interactability and
pointer-event semantics.

**vs Class B diagnostic (trigger-fix only):** Post-RP is still faster:
14.8 min vs 22.8 min (−35%), 528 vs 855 commands (−38%), P95 12307ms vs 24368ms
(−50%).

### app-smoke ×2 (post-RP regression check)

| Run | Outcome | Test exec | Commands | Median | P95 | >=5s |
|-----|---------|-----------|----------|--------|-----|------|
| 1 (mrylsf58) | **CLEAN_PASS** | — | 37 | 10ms | 12409ms | 14/37 |
| 2 (mrylu4ty) | **CLEAN_PASS** | — | 37 | 19ms | 12466ms | 14/37 |

No regression. Identical to pre-RP app-smoke (37 cmds, 14/37 ≥5s).

---

## 10. Remaining bottlenecks

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

---

## 11. Windows representative benchmark (repair pass, primary environment)

Work continued on Windows from this point on, per the same branch
(`feature/e2e-wdio-latency-optimization`) and PR (#154). Sections 1–10 above
are the historical Linux Class A/B/C baseline/diagnosis/optimization —
kept for reference and never re-run on this pass. Everything from here on
is Windows-only, external provider, and uses a new opt-in **representative
benchmark** (`representative-latency`) instead of re-running the full
`core-inventory`/`app-smoke` specs.

### 11.1. Correctness repairs (applied before any benchmarking)

Three pre-existing correctness issues were fixed first, verified by new
unit tests, and committed separately from anything performance-related:

1. **`expectActiveRepositoryPath` polling** — previously waited for
   visibility once and read text exactly once, so a visible element whose
   text hadn't yet caught up with a just-completed navigation could fail on
   a stale read. Now polls: each `waitUntil` iteration re-reads visibility
   and `textContent` and only succeeds once the canonicalized displayed path
   matches the canonicalized expected path.
2. **Visibility gate**: `rect.width === 0 && rect.height === 0` (AND) →
   `rect.width <= 0 || rect.height <= 0` (OR). An element with only one zero
   dimension is not visible; the old AND-gate missed that case.
3. **Consolidated visibility logic**: `isSelectorVisible` (new,
   `dom-helpers.ts`) is the single self-contained visibility check safe to
   pass by reference to `browser.execute()`. `clickNav`, `clickWhenVisible`,
   `waitForModal`, `waitForModalClose`, `expectActiveRepositoryPath`, and the
   new benchmark all use it instead of independently duplicated inline
   rect/display/visibility checks. `waitForModalClose` now treats "closed"
   as "does not exist OR fails `isSelectorVisible`", not a zero-rect special
   case.

`clickNav`, `waitForModal`, `waitForModalClose`, `clickWhenVisible`, and
`clickRowViaDom` were also extracted from `core-inventory.e2e.ts` into
`support/spec-interactions.ts` so the new benchmark and the existing spec
share one implementation.

Commit: `fix(e2e): restore canonical wait and visibility semantics` (`cd0beec`).

### 11.2. Representative benchmark case matrix

`apps/desktop/e2e-wdio/benchmarks/representative-latency.e2e.ts` — opt-in,
outside the default WDIO spec glob, one continuous minimal workflow (one
repository → one location → one rack → one device model → one device →
one placement → save/close/reopen), nine named `measureStep` cases:

| Case | Name | Source spec/test | Interaction type | Assertion | Setup dependency | Helper(s) |
|------|------|-------------------|-------------------|-----------|-------------------|-----------|
| A | `case-a-app-ready` | `app-smoke.e2e.ts` (landing screen) | Poll DOM visibility | Landing title visible | None | `isSelectorVisible` via `waitUntil` |
| B | `case-b-controlled-input` | `core-inventory.e2e.ts` step 2 (`create-repository`) | 3× controlled-input set + submit + confirm | Repository open (active-root visible) | None | `createRepositoryThroughUi` (`reactSetValue` ×3, `clickWhenEnabled`) |
| C | `case-c-open-modal` | `core-inventory.e2e.ts` step 4 (`open-location-form`) | Visibility wait + click | Modal submit button visible | Repository created (B) | `clickWhenVisible`, `waitForModal` |
| D | `case-d-modal-fill-submit-close` | `core-inventory.e2e.ts` step 4 (`submit-location-form`) | Controlled-input set + click + close wait | Modal closed | Modal open (C) | `reactSetValue`, `clickWhenEnabled`, `waitForModalClose` |
| E | `case-e-row-lookup-navigate` | `core-inventory.e2e.ts` step 6 (`navigate-location-to-racks`) | Row text search + DOM click (WebKit `<tr>` exception) + nav wait | `nav-racks` visible | Location created (D) | `clickRowViaDom` |
| F | `case-f-searchable-select` | `core-inventory.e2e.ts` step 13 (device-model assignment) | Open dropdown + type + native WDIO click + confirm | Trigger text reflects selection | Device model exists (setup) | `clickWhenVisible` + native `.click()` on option (unchanged — `onMouseDown`) |
| G | `case-g-attribute-assertion` | `core-inventory.e2e.ts` steps 3/9/12 (`aria-current` checks) | Single `execute()` attribute read | `aria-current === "page"` | Nav click occurred | Inline `execute()` (replaces `expect(...).toHaveAttribute()`) |
| H | `case-h-submit-placement` | `core-inventory.e2e.ts` step 19 (`submit-placement`) | Click + atomic closed/error read + card-visible wait | Placed card references correct model | Device+rack+model exist | `clickWhenEnabled` + atomic `execute()` |
| I | `case-i-save-close-reopen` | `core-inventory.e2e.ts` steps 21–22 (`save-and-close`, `reopen-repository`) | Click sequence + modal wait + canonical path polling | `expectActiveRepositoryPath` matches | Placement exists (H) | `clickElementProtocol`, `clickWhenEnabled`, `expectActiveRepositoryPath` |

Steps between cases (rack/model/device creation, form fills) are workflow
scaffolding, intentionally left outside any `measureStep` block.

Not new business coverage — every interaction already exists in
`specs/*.e2e.ts`; no assertion was weakened; the SearchableSelect option
click and WebKit-`<tr>` row-click exceptions were preserved exactly as
documented in section 6.

Commit: `test(e2e): add representative latency benchmark` (`6ff8211`), plus
runner support (`resolveSpecPath`/`BENCHMARK_ONLY_SPECS`,
`isMeasurementEligible`, `computeSingleModeAggregate`,
`buildBenchmarkOutputBasename` — all unit-tested).

### 11.3. Windows environment

| Item | Value |
|------|-------|
| Windows edition | Microsoft Windows 11 Pro |
| OS build | 10.0.26200 |
| CPU | AMD Ryzen 7 5800X 8-Core Processor (16 logical cores) |
| RAM | 32680 MB |
| Node.js | v22.23.1 |
| pnpm | 10.33.4 |
| Rust | rustc 1.97.1 (8bab26f4f 2026-07-14) / cargo 1.97.1 (c980f4866 2026-06-30) |
| WebdriverIO | 9.29.1 |
| @wdio/cli | 9.29.1 |
| @wdio/tauri-service | 1.2.0 |
| Tauri CLI | tauri-cli 2.11.2 |
| Edge | 150.0.4078.83 |
| WebView2 runtime | 150.0.4078.83 |
| tauri-driver | v2.0.6 (`C:\Users\<user>\.cargo\bin\tauri-driver.exe`) |
| msedgedriver | auto-downloaded per run by `@wdio/tauri-service` (150.0.4078.83) |
| Power plan | Balanced (`381b4222-f694-41f0-9685-ff5bb260df2e`) |
| Provider | `external` (unchanged) |
| Binary (baseline, §11.4) | `target\release\rack-inventory-studio-desktop.exe`, built via `pnpm -C apps/desktop tauri build --no-bundle` (no extra features) |
| Binary (post-optimization, §11.6) | Same path, rebuilt with `--features wdio-plugin` + `VITE_WDIO_PLUGIN=true` + `--config withGlobalTauri:true` (see §11.5.3) |

### 11.4. Baseline ×2 (HEAD `6ff82114dfc6dd72d7d50556ece271bb17388dcb`)

Binary built via `pnpm -C apps/desktop tauri build --no-bundle` (no
`wdio-plugin` feature — that fix came later, see §11.5.3). Ports 4444/4445
confirmed free before each run.

```powershell
node scripts\run-wdio-performance-benchmark.mjs `
  --provider external --spec representative-latency --repeat 2 `
  --binary "C:\ris\RackInventoryStudio\target\release\rack-inventory-studio-desktop.exe" `
  --continue-on-failure
```

`--continue-on-failure` is required on Windows: the external provider does
not reach `CLEAN_PASS` here (see §11.7, `measurementEligible`), so the
runner's default "stop after the first non-CLEAN_PASS run" would otherwise
abort after run 1.

| Run | Outcome | measurementEligible | Total | Commands | Median | P90 | P95 | P99 | Max | ≥5s |
|-----|---------|----------------------|-------|----------|--------|-----|-----|-----|-----|-----|
| 1 (`mrytz1e2-omdcf3`) | PASS_WITH_FORCED_CLEANUP | true | 1,069,722ms | 500 | 10ms | 15,263ms | 15,411ms | 53,689ms | 100,078ms | 112 |
| 2 (`mryum5g0-im8rp4`) | PASS_WITH_FORCED_CLEANUP | true | 1,071,581ms | 500 | 11ms | 15,265ms | 15,417ms | 53,910ms | 99,973ms | 112 |

Variance between runs: 0.17% (well under the 10% third-run threshold).
Aggregate: `measurementEligibleRuns: 2/2`, `status: OK`, median total
1,069,722ms, median command latency 10ms, P95-of-P95 15,417ms.

Per-case (mean of the two runs' `measureStep` durations):

| Case | Duration |
|------|----------|
| A — app-ready | 9–22ms |
| B — controlled-input | 99,985–100,079ms |
| C — open-modal | 38,163–38,334ms |
| D — modal-fill-submit-close | 53,437–53,853ms |
| E — row-lookup-navigate | 27–31ms |
| F — searchable-select | 92,209–92,462ms |
| G — attribute-assertion | 14–16ms |
| H — submit-placement | 38,292–38,372ms |
| I — save-close-reopen | 130,838–130,843ms |

Command profile (run 2): `elementClick` (35, median 7,707ms),
`$` ChainablePromise (36, median 15,376ms), `click` WDIO composite (5,
median 54,020ms), `findElement` (36, median 7,700ms), `executeAsync`/
`executeAsyncScript` (82 each, median ~13ms).

Raw paths: `%TEMP%\ris-wdio-bench\benchmark-2026-07-24T11-02-06\`
(aggregate JSON/MD) and per-run dirs under `%TEMP%\ris-wdio-bench\<runId>\`.

### 11.5. Optimization batches

#### 11.5.1. Root-cause finding — retry loop, not a timeout

`elementClick`/`findElement` durations in the baseline landed at near-exact
multiples of a ~7.7s base unit (2×, 4×, 5×, 7×, 9×, up to 13× = ~100s), and
every single command in that family carried this cost even with zero
retries visible at the WDIO-client level. An isolated diagnostic spec
(three consecutive `findElement()` calls on an already-known-existing
element, nothing else in between, both `logLevel: "info"` and `"silent"`
tested to rule out logging overhead) confirmed each call cost ~7.6–7.7s
independent of retries, element state, or log verbosity — never a timeout,
every command's `success` was `true`.

Root cause (found by reading `@wdio/tauri-service`'s compiled source,
`dist/cjs/index.js`): a `beforeCommand` hook (`ensureActiveWindowFocus`)
runs before exactly `['getTitle', 'findElement', 'findElements', '$', '$$',
'elementClick']` — the precise command set observed as slow — and calls
`getWindowStates()` → `browser.tauri.execute(...)`. That internal
`execute()` helper checks whether `window.wdioTauri` exists (i.e. whether
`tauri-plugin-wdio` is installed in the app); when it is not, it retries the
check **up to 100 times** (`browser.execute()` + 50ms sleep each ≈ 6.5–7s)
before giving up — and because it only caches a *successful* probe
(`pluginAvailabilityCache`, a `WeakMap`, is only ever set to `true`), a
*failed* probe is never remembered: **every single** command in that family
re-runs the full 100-attempt loop from scratch, for the entire session.
`execute()`/`executeAsync` calls are unaffected because the hook early-returns
for any command outside that list. No config option exists to disable this
or tune the retry count/interval — both are hardcoded local constants.

#### 11.5.2. Batch 1+2 — bypass WDIO's client-side retry wrapper

Two commits, applied together since they address the same diagnosed
mechanism (not independent hypotheses):

- `reactSetValue`/`reactSelectValue` (`repository-ui.ts`): replaced
  `$()` + `.waitForDisplayed()` with `waitUntil(isSelectorVisible)` + a
  single `execute()` that both reads and sets the value — no `$()` call at
  all.
- `clickElementProtocol` (new, `spec-interactions.ts`): direct WebDriver
  protocol click (`findElement` + `elementClick`) — same standards-compliant
  Element Click algorithm and full React event dispatch as
  `browser.$().click()`, but bypasses whichever of WDIO's/the driver's own
  client-side retry logic was amplifying the per-command cost. Used by
  `clickNav`, `clickWhenVisible`, and the new `clickWhenEnabled` (replaces
  `(await waitForEnabled(id)).click()` in `core-inventory.e2e.ts` and the
  benchmark; `waitForEnabled` itself is unchanged and still used elsewhere).
- A follow-up commit applied `clickElementProtocol` to the two remaining raw
  `browser.$(selector).click()` sites (palette Place button,
  `repository-close-action`) that the `waitForEnabled().click()` sweep
  didn't cover.

Not touched: SearchableSelect option clicks (still require WDIO's own
`.click()` for `onMouseDown` dispatch) and `clickRowViaDom`'s
`execute()`-based row clicks (WebKit non-interactable `<tr>` exception) —
both explicitly out of scope per the documented exceptions in §6.

Measured effect (1 run, informal check before the final ×2): total run
1,069,722ms → 448,120ms (**−58%**), commands 500 → 305 (**−39%**). Case B
99,985ms → 15,618ms, case C 38,163ms → 15,425ms, case D 53,437ms →
15,465ms.

Commits: `perf(e2e): bypass WDIO client-side retry overhead in shared
input/click helpers` (`e24e197`), `perf(e2e): apply protocol-level click to
the remaining ordinary-button clicks` (`68da68e`).

#### 11.5.3. Batch 3 — install `tauri-plugin-wdio` (the actual root fix)

Batch 1+2 reduced the *number* of retries paid per interaction (by removing
redundant `$()`/`.waitForDisplayed()` calls), but every remaining
`findElement`/`elementClick` call still individually paid the ~7.7s
plugin-probe cost once. The batch-1+2 command profile still showed
`findElement` (24, median 7,675ms) and `elementClick` (22, median 7,707ms)
— confirming the retry loop itself, not just its repetition count, was the
dominant remaining cost.

The real fix is the one `@wdio/tauri-service`'s own plugin-setup docs
describe: install `tauri-plugin-wdio` so `window.wdioTauri` genuinely
exists, the probe succeeds on attempt 1, and the result is cached for the
rest of the session.

Implementation, gated to be strictly test-only (mirrors the existing
`wdio-embedded` Cargo feature pattern exactly — zero impact on
default/production builds):

- New Cargo feature `wdio-plugin` (`src-tauri/Cargo.toml`): optional
  `tauri-plugin-wdio = "1"` dependency.
- `src-tauri/src/lib.rs`: `.plugin(tauri_plugin_wdio::init())` conditionally
  registered behind `#[cfg(feature = "wdio-plugin")]`, **after**
  `tauri_plugin_log`'s registration. Both plugins attempt to claim the
  global `log` crate logger on setup; `tauri_plugin_log` panics
  (`PluginInitialization("log", "attempted to set a logger after the
  logging system was already initialized")`) if that slot is already taken,
  while `tauri-plugin-wdio`'s own setup already tolerates losing that race
  (catches the error, only warns) — so `tauri_plugin_log` must register
  first. This harness doesn't use `tauri-plugin-wdio`'s log-forwarding
  feature, only its execute API, so losing that race is harmless.
- `build.rs`: generates `capabilities/wdio-plugin-test.json`
  (`wdio:default`) only when the feature is active, gitignored between
  builds — same mechanism as `capabilities/embedded-test.json`.
- `src/main.tsx`: conditionally imports `@wdio/tauri-plugin` only when
  `VITE_WDIO_PLUGIN=true` is set at build time (Vite inlines
  `import.meta.env.VITE_*` at build time; absent in every other build —
  dev, release, or the plain `wdio-embedded` test binary). Added
  `src/vite-env.d.ts` (missing Vite client types; `import.meta.env` wasn't
  usable in this project before).
- `withGlobalTauri: true` (required by `@wdio/tauri-plugin`) applied via a
  `--config` override at build time, not baked into the base
  `tauri.conf.json` used for the real release build.

Build command for the WDIO test binary from this point on:

```powershell
Remove-Item Env:CARGO_TARGET_DIR -ErrorAction SilentlyContinue
$env:VITE_WDIO_PLUGIN = "true"
pnpm -C apps/desktop tauri build --no-bundle --features wdio-plugin `
  --config '{"app":{"withGlobalTauri":true}}'
Remove-Item Env:VITE_WDIO_PLUGIN
```

(In practice, pass the JSON as a file path — Windows shell quoting mangles
inline `--config` JSON; see `apps/desktop/src-tauri/wdio-plugin.config.json.tmp`
pattern used during this pass, not committed.)

Verified via the same isolated diagnostic spec: `findElement()` calls that
cost 7,575–7,744ms without the plugin cost 43–66ms with it — a **~150×**
reduction on that command family alone. Default (no-feature) build
unaffected: `cargo check`/`clippy --features wdio-plugin` clean,
default-feature `cargo check`/`clippy`/`fmt --check` clean, 885/885 Vitest,
`tsc --noEmit` clean.

Commit: `perf(e2e): register tauri-plugin-wdio behind an opt-in test-only
Cargo feature` (`930a615`).

### 11.6. Final ×2 (HEAD `930a61537a8e617e48bbad0f1020ad8072769b94`)

Binary rebuilt per §11.5.3 (`--features wdio-plugin`,
`VITE_WDIO_PLUGIN=true`, `withGlobalTauri: true`). Ports 4444/4445
confirmed free before each run (stray driver processes from ad-hoc
diagnostic `wdio run` invocations during this pass were identified by PID
and manually cleaned up first — the benchmark runner's own PID-safe
cleanup correctly refused to touch them as pre-existing/unrelated).

```powershell
node scripts\run-wdio-performance-benchmark.mjs `
  --provider external --spec representative-latency --repeat 2 `
  --binary "C:\ris\RackInventoryStudio\target\release\rack-inventory-studio-desktop.exe" `
  --continue-on-failure
```

| Run | Outcome | measurementEligible | Total | Commands | Median | P90 | P95 | P99 | Max | ≥5s |
|-----|---------|----------------------|-------|----------|--------|-----|-----|-----|-----|-----|
| 1 (`mryxmd14-r9h0zr`) | PASS_WITH_FORCED_CLEANUP | true | 12,857ms | 295 | 15ms | 56ms | 72ms | 129ms | 232ms | 0 |
| 2 (`mryxmujl-bcy1vv`) | PASS_WITH_FORCED_CLEANUP | true | 12,287ms | 297 | 15ms | 56ms | 73ms | 129ms | 233ms | 0 |

Variance: 4.6% (under the 10% third-run threshold). Aggregate:
`measurementEligibleRuns: 2/2`, `status: OK`, median total 12,287ms,
median command latency 15ms, P95-of-P95 73ms. Both runs: `testPassed:
true`, `reportValid: true`, zero `validationErrors`, all 9 `measureStep`
cases `successful: 1/1`.

Per-case (mean of the two runs):

| Case | Duration |
|------|----------|
| A — app-ready | 6–10ms |
| B — controlled-input | 351–365ms |
| C — open-modal | 149ms |
| D — modal-fill-submit-close | 181–288ms |
| E — row-lookup-navigate | 16–27ms |
| F — searchable-select | 459–473ms |
| G — attribute-assertion | 15ms |
| H — submit-placement | 144–160ms |
| I — save-close-reopen | 701–702ms |

Raw paths: `%TEMP%\ris-wdio-bench\benchmark-2026-07-24T12-44-13\`
(aggregate JSON/MD) and per-run dirs under `%TEMP%\ris-wdio-bench\<runId>\`.

### 11.7. Before/after comparison

| Metric | Baseline (§11.4) | Final (§11.6) | Delta | Target (§14 of the operator brief) |
|--------|-------------------|-----------------|-------|----------------------------------|
| Median total run time | 1,069,722ms | 12,287ms | **−98.9%** | ≥20% |
| Command count | 500 | 296 (median of 295/297) | **−40.8%** | ≥20% |
| Commands ≥5s | 112 | 0 | **−100%** | ≥25% |
| P95 (P95-of-P95) | 15,417ms | 73ms | **−99.5%** | ≥20% |
| P99 | 53,689–53,910ms | 129ms | −99.8% | — |
| Max | 99,973–100,078ms | 232–233ms | −99.8% | — |

Every success criterion is met, by a wide margin. No assertion was
weakened or removed. No `HTMLElement.click()` JS click was introduced for
ordinary elements — `clickElementProtocol` still issues the real WebDriver
`elementClick` command. SearchableSelect retains native WDIO `.click()`.
Row clicks retain the documented `execute()`-based WebKit `<tr>` exception.
`measurementEligible: true` for all four Windows runs (baseline ×2, final
×2); `passed`/`CLEAN_PASS` semantics are unchanged — every external-provider
Windows run in this pass landed on `PASS_WITH_FORCED_CLEANUP` (tauri-driver/
msedgedriver do not reliably release their ports on their own, a known,
already-documented Windows/`@wdio/tauri-service` teardown gap — see
`docs/E2E_WDIO_WINDOWS_PERFORMANCE.md` §"Outcome semantics" — unrelated to
and unaffected by this optimization pass).

### 11.8. Remaining bottlenecks

- **Case I (save-close-reopen, ~700ms)** and **case F (SearchableSelect,
  ~460–470ms)** are now the two largest single cases, both dominated by
  real backend/IPC work (repository save/close/reopen round-trips; device
  model list filtering) rather than test-harness overhead — no further
  test-code optimization is expected to move these meaningfully. Per the
  operator brief's constraint, no attempt was made to optimize real
  application/backend time.
- The `tauri-plugin-wdio` install is test-only (gated behind the
  `wdio-plugin` Cargo feature + `VITE_WDIO_PLUGIN` env var); it has no path
  into a release build. Future WDIO benchmark/spec runs on Windows should
  use the `--features wdio-plugin` build from §11.5.3 rather than the plain
  build — the plain build is ~85× slower for no benefit once this fix
  exists in the repo, though it remains a valid (just far slower) way to
  run WDIO against an unmodified binary if ever needed for isolation.
- `@wdio/tauri-service`'s `ensureActiveWindowFocus` retry-loop-without-negative-caching
  behavior (§11.5.1) is an upstream library characteristic, not something
  this repository can fix directly; it was worked around, not patched.

### 11.9. Full WDIO suite — intentionally deferred

Per the Stage 3B.4 Windows repair-pass scope, the full 11-spec WDIO suite
is **not** a merge gate for this PR and was not run in this pass. Validation
is centered entirely on the Windows `representative-latency` benchmark
above (baseline ×2, final ×2), which covers nine interaction-pattern
classes drawn from the existing specs. Full-suite validation is deferred to
a separate stabilization stage or a later E2E program milestone, per
explicit operator direction for this pass.
