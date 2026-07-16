# ChatGPT Code Review Context

## Review mode
You are a strict code reviewer. Review only this change. Focus on correctness, scope, tests, security, maintainability and operational risk.

Return:
- Status: Approve / Request changes / Needs human decision
- Summary
- Blocking issues
- Non-blocking suggestions
- Scope check
- Tests
- Risks
- Recommended next action

## Repository
- Repo: TechTradeExpress/RackInventoryStudio
- URL: https://github.com/TechTradeExpress/RackInventoryStudio

## Branch
- Current branch: feature/e2e-wdio-entity-updates-work-mode
- Base branch: roadmap/e2e-wdio
- Commits ahead of base: 1
- Uncommitted changes present: yes

## Pull request
- Number: #149
- Title: test(e2e): entity updates and work mode — Stage 3B.1
- URL: https://github.com/TechTradeExpress/RackInventoryStudio/pull/149
- Base: roadmap/e2e-wdio
- Head: feature/e2e-wdio-entity-updates-work-mode
- Changed files: 5
- Additions: 780
- Deletions: 133
- Mergeable: MERGEABLE
- Review decision: 

### Body
## Summary

Stage 3B.1 of the desktop E2E roadmap. Adds one spec covering six previously MISSING workflows:

- **Work mode toggle** — Planning → On-site → Planning; `aria-pressed` verified on `work-mode-planning` and `work-mode-onsite` testids; `after()` hook restores state.
- **Edit device** — name, status (planned→installed), serial; `device-form-submit`; persisted after close/reopen.
- **Edit device model** — name, height (2U→3U), SKU; `model-form-submit`; device list reflects model rename; persisted.
- **Edit rack** — name, height (14U→18U), row (A→B); `rack-form-submit`; persisted.
- **Edit location** — name; `location-form-submit`; persisted.
- **Persistence** — save + close + reopen cycle verifies all four entity edits survive.

Coverage moves from 24/67 (36%) → 30/67 (45%). No new selectors added to application source.

`wdio.conf.ts` timeout raised from 45 min → 60 min: the new spec creates 5 entities and edits 4, running ~50 min vs the prior ~35 min ceiling.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts` | New spec: 9-part entity-update + work-mode coverage |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Bump `mochaOpts.timeout` 2 700 000 → 3 600 000 ms; update comment |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Promote 6 workflows MISSING→COVERED; update summary counts (COVERED 24→30, MISSING 12→6) |
| `docs/E2E_WDIO_PLAN.md` | Stage 3A → COMPLETED (PR #147, 40f6a12); Stage 3B split into 3B.1 IN REVIEW + 3B.2 PLANNED |

## Test results

### TypeScript / Vitest / Rust
- `pnpm exec tsc --noEmit` → clean (0 errors)
- Vitest: 51 files, 844 tests — all passed
- Tauri build (`--no-bundle`): clean, 46.53 s
- `cargo fmt --all --check` → clean
- `cargo test --workspace` → all passed
- `cargo clippy --workspace -- -D warnings` → clean

### Isolated spec × 2 (required gate)

Run 1 — **FAILED** (timeout): spec ran 45:03; hit the old 2 700 000 ms Mocha limit during Part I. Root cause: spec takes ~50 min; previous limit was 45 min. Fixed by raising timeout.

Run 2 — **PASSED**: 49:41 · suffix=mrnu0gd2 · run root `/tmp/ris-wdio-Iwbjhx` (cleaned up). All parts A–I complete; all persistence assertions passed.

Run 3 — **PASSED**: 49:39 · suffix=mrnvt5ez · run root `/tmp/ris-wdio-GjnDP9` (cleaned up). All parts A–I complete; all persistence assertions passed.

### Full WDIO suite (all 7 specs)

```
Spec Files:  7 passed, 7 total (100% completed) in 02:16:28
```

## Risks

- Spec runs ~50 min due to `@wdio/tauri-service` external driver overhead in headless Xvfb — inherent to the current driver configuration.
- `browser.execute()` fires synthetic `click` (not full mousedown/mouseup) for edit buttons. Production IPC paths are still exercised.
- Work mode `after()` hook restores planning mode; hook error propagates rather than being swallowed.

## Not in this PR (Stage 3B.2)

- Edit placement height U
- Remove placement via EditPlacementModal remove button
- PlacementInspectorPanel navigate to device / model
- Delete entity flows
- ConfirmDialog selector

## GitHub checks
Frontend checks	pass	59s	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/29530252629/job/87728586084	
Rust workspace	pass	3m41s	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/29530252629/job/87728585998	
Script and hygiene checks	pass	8s	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/29530252629/job/87728585950	
Version consistency	pass	4s	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/29530252629/job/87728585947	
Workflow lint	pass	12s	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/29530252629/job/87728586087	

## Claude Code report
## Summary

Stage 3B.1: entity updates and work mode spec.

Branch: `feature/e2e-wdio-entity-updates-work-mode` → base: `roadmap/e2e-wdio`

Six MISSING workflows promoted to COVERED by one new spec:

1. **Work mode toggle** — Planning → On-site → Planning; `aria-pressed` verified on both
   `work-mode-planning` and `work-mode-onsite` testids; `after()` hook restores planning mode.

2. **Edit device** — name, status (planned→installed), serial; `device-form-submit`; persisted.

3. **Edit device model** — name, height (2→3), SKU; `model-form-submit`; device list reflects
   model rename; persisted.

4. **Edit rack** — name, height (14→18), row (A→B); `rack-form-submit`; persisted.

5. **Edit location** — name; `location-form-submit`; persisted.

6. **Persistence** — save + close + reopen cycle verifies all four entity updates survive.

No new selectors added to application source. Edit buttons use the existing
`aria-label="Edit <name>"` pattern. All form field testids and submit testids were
already present from prior stages.

`wdio.conf.ts` timeout bumped from 2 700 000 ms (45 min) to 3 600 000 ms (60 min):
the entity-updates-work-mode spec creates 5 entities, edits 4, and persists — wall-clock
~50 min, which exceeded the previous limit on first run.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts` | New spec: 9-part entity-update + work-mode coverage |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Bump `mochaOpts.timeout` 2 700 000 → 3 600 000 ms; update comment |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Promote 6 workflows MISSING→COVERED; update summary counts (COVERED 24→30, MISSING 12→6) |
| `docs/E2E_WDIO_PLAN.md` | Stage 3A → COMPLETED (PR #147, 40f6a12); Stage 3B split into 3B.1 IN REVIEW + 3B.2 PLANNED |

## Tests

### TypeScript

```
pnpm exec tsc --noEmit   → clean (0 errors)
```

### Vitest

```
Test Files  51 passed (51)
     Tests  844 passed (844)
  Duration  31.83s
```

### Tauri build

```
pnpm -C apps/desktop tauri build --no-bundle
Compiling rack-inventory-studio-desktop v0.1.0-beta.2
Finished `release` profile [optimized] target(s) in 46.53s
→ clean (0 errors, 0 warnings)
```

### Rust workspace

```
cargo fmt --all --check  → clean
cargo test --workspace   → all passed
cargo clippy --workspace -- -D warnings  → clean
cargo check --workspace  → clean
```

### Isolated spec × 2 (required gate)

Run 1 — **FAILED** (timeout): spec ran 45:03; hit the old 2 700 000 ms Mocha timeout
during Part I persistence verification. Root cause: spec creates 5 entities and edits 4,
which takes ~50 min; previous limit was 45 min.
Fix: `mochaOpts.timeout` raised to 3 600 000 ms in `wdio.conf.ts`.

Run 2 — **PASSED**: 49:41 · suffix=mrnu0gd2 · run root /tmp/ris-wdio-Iwbjhx (cleaned up).
All parts A–I complete; all persistence assertions passed.

Run 3 — **PASSED**: 49:39 · suffix=mrnvt5ez · run root /tmp/ris-wdio-GjnDP9 (cleaned up).
All parts A–I complete; all persistence assertions passed.

### Full WDIO suite (all 7 specs)

```
Spec Files:  7 passed, 7 total (100% completed) in 02:16:28
run root /tmp/ris-wdio-hp5ww2 (cleaned up)
```

## Risks

- Spec takes ~50 min per run due to `@wdio/tauri-service` external driver overhead in
  headless Xvfb — inherent to the current driver configuration.
- `browser.execute()` fires synthetic `click` (not full mousedown/mouseup sequence) for
  edit buttons and `<tr>` rows. Production IPC paths are still exercised.
- Work mode `after()` hook restores planning mode; hook error propagates rather than
  being swallowed.
- Playwright tests blocked by `libasound2t64` — pre-existing environment limitation.

## Not done

- Edit placement height U (Stage 3B.2)
- Remove placement via EditPlacementModal remove button (Stage 3B.2)
- PlacementInspectorPanel navigate to device / model (Stage 3B.2)
- Delete entity flows (Stage 3B.2)
- ConfirmDialog selector (Stage 3B.2)

## Suggested next step

Merge PR targeting roadmap/e2e-wdio. Plan Stage 3B.2 separately after Stage 3B.1 merge.

## Changed files
M	.ai/cc-report.md
A	apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts
M	apps/desktop/e2e-wdio/wdio.conf.ts
M	docs/E2E_WDIO_COVERAGE_GAPS.md
M	docs/E2E_WDIO_PLAN.md
M	.ai/cc-report.md

## Diff stat
 .ai/cc-report.md                                   | 166 ++----
 .../e2e-wdio/specs/entity-updates-work-mode.e2e.ts | 661 +++++++++++++++++++++
 apps/desktop/e2e-wdio/wdio.conf.ts                 |   7 +-
 docs/E2E_WDIO_COVERAGE_GAPS.md                     |  29 +-
 docs/E2E_WDIO_PLAN.md                              |  50 +-
 5 files changed, 780 insertions(+), 133 deletions(-)
 .ai/cc-report.md | 3 ++-
 1 file changed, 2 insertions(+), 1 deletion(-)

## Diff
From 6233e03e3493d63f7d99e4ba7004a136041e9bf8 Mon Sep 17 00:00:00 2001
From: Jakub Plucinski <su-17@wp.pl>
Date: Thu, 16 Jul 2026 19:59:48 +0000
Subject: [PATCH] =?UTF-8?q?test(e2e):=20entity=20updates=20and=20work=20mo?=
 =?UTF-8?q?de=20spec=20=E2=80=94=20Stage=203B.1?=
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

Six MISSING workflows promoted to COVERED: edit location, edit rack,
edit device model, edit device, toggle to on-site, toggle to planning.
Single 9-part it() exercises all four entity edit IPC paths plus work
mode toggle and full save/close/reopen persistence verification.

Raises mochaOpts.timeout 2 700 000 → 3 600 000 ms: the new spec
creates five entities and edits four, taking ~50 min vs the prior
~35 min ceiling; two isolated runs confirmed PASSED (49:41, 49:39).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
---
 .ai/cc-report.md                              | 166 ++---
 .../specs/entity-updates-work-mode.e2e.ts     | 661 ++++++++++++++++++
 apps/desktop/e2e-wdio/wdio.conf.ts            |   7 +-
 docs/E2E_WDIO_COVERAGE_GAPS.md                |  29 +-
 docs/E2E_WDIO_PLAN.md                         |  50 +-
 5 files changed, 780 insertions(+), 133 deletions(-)
 create mode 100644 apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts

diff --git a/.ai/cc-report.md b/.ai/cc-report.md
index 87e51f6..0e39ad7 100644
--- a/.ai/cc-report.md
+++ b/.ai/cc-report.md
@@ -1,88 +1,44 @@
 ## Summary
 
-Stage 3A RP (review proposal) for PR #147: placement lifecycle spec.
+Stage 3B.1: entity updates and work mode spec.
 
-Branch: `feature/e2e-wdio-placement-lifecycle` → base: `roadmap/e2e-wdio`
+Branch: `feature/e2e-wdio-entity-updates-work-mode` → base: `roadmap/e2e-wdio`
 
-This RP addresses all blocking issues found during strict Stage 3A review:
+Six MISSING workflows promoted to COVERED by one new spec:
 
-1. **Exact single-placement assertions** — spec now proves exactly N cards exist at
-   each checkpoint using `[data-testid^="placed-"][data-device-code="${code}"]` scoped
-   to rack diagram; bare `[data-device-code]` avoided (also appears in Devices table).
-   Checkpoints: count=1 after place, after move, after first reopen; count=0 after remove,
-   after second reopen.
+1. **Work mode toggle** — Planning → On-site → Planning; `aria-pressed` verified on both
+   `work-mode-planning` and `work-mode-onsite` testids; `after()` hook restores planning mode.
 
-2. **Effective 2U height confirmation** — production card `title` attribute now checked
-   for the en-dash range `U${start}–U${start+MODEL_HEIGHT-1}` at every position: U1–U2
-   after initial placement, U5–U6 after move, U5–U6 after first reopen.
+2. **Edit device** — name, status (planned→installed), serial; `device-form-submit`; persisted.
 
-3. **False-positive catches removed** — `waitForEditModalClose()` and the
-   `PlacePlacementModal` close helper rewritten with `isExisting()` for DOM-removal
-   detection (no exception→success conversion). All "no card" negative assertions now
-   use `browser.$$` + length check: no `.catch(() => false)` on negative paths.
-   Any unhandled WebDriver error propagates and fails the test immediately.
+3. **Edit device model** — name, height (2→3), SKU; `model-form-submit`; device list reflects
+   model rename; persisted.
 
-4. **Entity persistence verification (Part 5)** — after second reopen the spec now
-   explicitly verifies: Device unplaced (Devices panel), Device Model exists (Device
-   Models list), Rack accessible (navigateToRackDetail succeeds).
+4. **Edit rack** — name, height (14→18), row (A→B); `rack-form-submit`; persisted.
 
-5. **Coverage stats corrected** — `docs/E2E_WDIO_COVERAGE_GAPS.md` summary table:
-   `MISSING` changed from 14 to 12 so categories sum to 67.
-   Correct math: 15 MISSING before − 3 promoted to COVERED = 12. Summary MISSING=14
-   was wrong (subtracted only 1 instead of 3). Added explanatory text.
+5. **Edit location** — name; `location-form-submit`; persisted.
 
-6. **ConfirmDialog selector documented correctly** — `docs/E2E_WDIO_PLAN.md` now
-   describes actual mechanism: `button.btn-danger` inside `modal-backdrop` via
-   `browser.execute()`. Previous text said `button=Remove from rack` (wrong).
+6. **Persistence** — save + close + reopen cycle verifies all four entity updates survive.
 
-7. **Runtime overhead comment** — `wdio.conf.ts` removed the imprecise "~600ms per
-   command" wording. Now says "significant per-command overhead"; total wall-clock
-   "~35 min confirmed by two isolated runs".
+No new selectors added to application source. Edit buttons use the existing
+`aria-label="Edit <name>"` pattern. All form field testids and submit testids were
+already present from prior stages.
 
-8. **Rust workspace CI** — PR #148 (`fix/rust-clippy-manual-filter`) was merged to
-   `roadmap/e2e-wdio` (merge commit `d82406a`). It fixed the `clippy::manual_filter`
-   lint in `crates/ris-import/src/csv_reader.rs`. This branch was then synchronized
-   with the updated base via a merge commit. PR #147 introduces no Rust changes of its
-   own — `csv_reader.rs` does not appear in the diff of PR #147 against its base.
+`wdio.conf.ts` timeout bumped from 2 700 000 ms (45 min) to 3 600 000 ms (60 min):
+the entity-updates-work-mode spec creates 5 entities, edits 4, and persists — wall-clock
+~50 min, which exceeded the previous limit on first run.
 
 ## Files changed
 
 | File | Change |
 |---|---|
-| `apps/desktop/e2e-wdio/specs/placement-lifecycle.e2e.ts` | Full RP rewrite: count assertions, 2U range checks, isExisting() modal helpers, $$ no-card checks, device model entity check in Part 5 |
-| `apps/desktop/e2e-wdio/wdio.conf.ts` | Fix overhead comment (remove "~600ms per command") |
-| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Fix MISSING count 14→12, fix date 07-15→07-16, fix explanatory text |
-| `docs/E2E_WDIO_PLAN.md` | Fix ConfirmDialog selector description |
+| `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts` | New spec: 9-part entity-update + work-mode coverage |
+| `apps/desktop/e2e-wdio/wdio.conf.ts` | Bump `mochaOpts.timeout` 2 700 000 → 3 600 000 ms; update comment |
+| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Promote 6 workflows MISSING→COVERED; update summary counts (COVERED 24→30, MISSING 12→6) |
+| `docs/E2E_WDIO_PLAN.md` | Stage 3A → COMPLETED (PR #147, 40f6a12); Stage 3B split into 3B.1 IN REVIEW + 3B.2 PLANNED |
 
 ## Tests
 
-### Isolated spec × 2 (required gate)
-
-```
-Run 9:  1 passed, 1 total  in 00:35:36  (cleanup: /tmp/ris-wdio-jBkKkm)
-Run 10: 1 passed, 1 total  in 00:35:38  (cleanup: /tmp/ris-wdio-50eYNO)
-```
-
-Both runs exercised all 5 parts including new assertions:
-- Part 1: count=1, data-start-u="1", range "U1–U2" in title confirmed
-- Part 2: count=1, data-start-u="5", range "U5–U6" in title confirmed; count at U1=0
-- Part 3: count=1 after reopen, range "U5–U6" persisted, U1 count=0 after reopen
-- Part 4: count=0 after remove (two-phase: waitUntil DOM removal + explicit count check)
-- Part 5: device unplaced, device model verified in list, rack navigable, count=0 in rack
-
-### Full WDIO suite (all 6 specs)
-
-```
-Run 2: 6 passed, 6 total  in 01:26:54  (cleanup: /tmp/ris-wdio-Cjx4Jz)
-```
-
-Run 2 used the RP spec (`13b237b`). All 6 specs passed. No leftover ris-wdio directories
-after run completion.
-
-Full WDIO was not rerun after the base merge because PR #148 changed only the Rust CSV
-filtering implementation and `.ai/cc-report.md`. The previously completed post-RP full
-suite remains the applicable Stage 3A validation.
-
 ### TypeScript
 
 ```
@@ -92,72 +48,66 @@ pnpm exec tsc --noEmit   → clean (0 errors)
 ### Vitest
 
 ```
-51 test files, 844 tests passed
+Test Files  51 passed (51)
+     Tests  844 passed (844)
+  Duration  31.83s
 ```
 
 ### Tauri build
 
-Previous Stage 3A validation (not rerun after base merge — no Tauri code changed):
-```
-pnpm tauri build --no-bundle  → Built application at target/release/rack-inventory-studio-desktop
-Finished release profile in 58.63s
-```
-
-### Playwright
-
-Blocked by missing `libasound2t64` system package — all 21 tests fail with the same
-system-dependency error. This is a pre-existing environment limitation, not a code
-regression. Exact error:
 ```
-║     sudo apt-get install libasound2t64               ║
+pnpm -C apps/desktop tauri build --no-bundle
+Compiling rack-inventory-studio-desktop v0.1.0-beta.2
+Finished `release` profile [optimized] target(s) in 46.53s
+→ clean (0 errors, 0 warnings)
 ```
 
-### Rust workspace (after base merge)
+### Rust workspace
 
 ```
-cargo fmt --all --check          → clean
-cargo test --workspace           → all passed
+cargo fmt --all --check  → clean
+cargo test --workspace   → all passed
 cargo clippy --workspace -- -D warnings  → clean
-cargo check --workspace          → clean
+cargo check --workspace  → clean
 ```
 
-`csv_reader.rs` now uses `.filter(|v| !v.is_empty())` (from merged PR #148 base).
+### Isolated spec × 2 (required gate)
+
+Run 1 — **FAILED** (timeout): spec ran 45:03; hit the old 2 700 000 ms Mocha timeout
+during Part I persistence verification. Root cause: spec creates 5 entities and edits 4,
+which takes ~50 min; previous limit was 45 min.
+Fix: `mochaOpts.timeout` raised to 3 600 000 ms in `wdio.conf.ts`.
 
-## Base synchronization
+Run 2 — **PASSED**: 49:41 · suffix=mrnu0gd2 · run root /tmp/ris-wdio-Iwbjhx (cleaned up).
+All parts A–I complete; all persistence assertions passed.
 
-- PR #148 merged to `roadmap/e2e-wdio` as commit `d82406a`
-- `feature/e2e-wdio-placement-lifecycle` merged with updated base via `--no-ff`
-- `git merge-base --is-ancestor d82406a HEAD` → confirmed ancestor
-- `csv_reader.rs` does not appear in `git diff origin/roadmap/e2e-wdio...HEAD`
-- No Rust changes belong to Stage 3A
+Run 3 — **PASSED**: 49:39 · suffix=mrnvt5ez · run root /tmp/ris-wdio-GjnDP9 (cleaned up).
+All parts A–I complete; all persistence assertions passed.
 
-## Cleanup verification
+### Full WDIO suite (all 7 specs)
 
-- Run 9 cleanup: `[test-environment] cleaned up: /tmp/ris-wdio-jBkKkm` ✓
-- Run 10 cleanup: `[test-environment] cleaned up: /tmp/ris-wdio-50eYNO` ✓
-- Full suite run 2 cleanup: `[test-environment] cleaned up: /tmp/ris-wdio-Cjx4Jz` ✓
-- All three directories confirmed absent from /tmp after run completion
-- Each run uses a unique suffix ensuring zero cross-run contamination
+```
+<to be filled after run>
+```
 
 ## Risks
 
-- Spec takes ~35 min per run due to `@wdio/tauri-service` external driver overhead in
+- Spec takes ~50 min per run due to `@wdio/tauri-service` external driver overhead in
   headless Xvfb — inherent to the current driver configuration.
-- Full WDIO suite (~6 specs) takes ~1 h 27 min total.
-- `browser.execute()` fires synthetic `click` (not full mousedown/mouseup sequence).
-  Production paths (IPC `editPlacement`, `removePlacement`) are still exercised via
-  resulting React state changes, which is the correct assertion.
-- Playwright tests blocked by `libasound2t64` in this environment — separate env issue.
-- Full WDIO not rerun after base merge (PR #148 changed only Rust CSV parser and report).
+- `browser.execute()` fires synthetic `click` (not full mousedown/mouseup sequence) for
+  edit buttons and `<tr>` rows. Production IPC paths are still exercised.
+- Work mode `after()` hook restores planning mode; hook error propagates rather than
+  being swallowed.
+- Playwright tests blocked by `libasound2t64` — pre-existing environment limitation.
 
 ## Not done
 
-- Edit placement via height-u-input (Stage 3B)
-- Remove placement via EditPlacementModal remove button (Stage 3B)
-- PlacementInspectorPanel navigate-to-device / navigate-to-model (Stage 3B)
-- Entity edit and delete flows (Stage 3B)
-- Work mode toggle (Stage 3B)
+- Edit placement height U (Stage 3B.2)
+- Remove placement via EditPlacementModal remove button (Stage 3B.2)
+- PlacementInspectorPanel navigate to device / model (Stage 3B.2)
+- Delete entity flows (Stage 3B.2)
+- ConfirmDialog selector (Stage 3B.2)
 
 ## Suggested next step
 
-Merge PR #147 do roadmap/e2e-wdio. Stage 3B należy zaplanować osobno po merge Stage 3A.
+Merge PR targeting roadmap/e2e-wdio. Plan Stage 3B.2 separately after Stage 3B.1 merge.
diff --git a/apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts b/apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts
new file mode 100644
index 0000000..e9f3b4c
--- /dev/null
+++ b/apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts
@@ -0,0 +1,661 @@
+/**
+ * Entity updates and work mode — Stage 3B.1
+ *
+ * Exercises six MISSING workflows against the real compiled Tauri binary:
+ *
+ *   PART A — Work mode: toggle Planning → On-site → Planning
+ *   PART B — Create one isolated repository with Location, Rack, DeviceModel, Device
+ *   PART C — Edit Device (name, status planned→installed, serial)
+ *   PART D — Edit Device Model (name, height 2→3, SKU); verify Device reflects rename
+ *   PART E — Edit Rack (name, height 14→18, row A→B)
+ *   PART F — Edit Location (name)
+ *   PART G — Immediate aggregate verification of all four updated entities
+ *   PART H — Save, close, reopen (one cycle)
+ *   PART I — Final persistence verification of all four updated entities
+ *
+ * Selector contract (no new selectors added to application source):
+ *   Edit buttons — button[aria-label="Edit <name>"]
+ *   Work mode   — work-mode-toggle, work-mode-planning, work-mode-onsite (aria-pressed)
+ *   Forms       — location-form-submit, rack-form-submit, model-form-submit, device-form-submit
+ *   Fields      — field-name, field-height-u, field-row, field-model-sku, field-status, field-serial
+ *   Rows        — [data-location-code], [data-rack-code], [data-model-code], [data-device-code]
+ */
+import { browser } from "@wdio/globals";
+import {
+  reactSetValue,
+  reactSelectValue,
+  waitForEnabled,
+  expectActiveRepositoryPath,
+  createRepositoryThroughUi,
+} from "../support/repository-ui";
+
+function log(msg: string) {
+  const ts = new Date().toISOString().substring(11, 23);
+  console.log(`[entity-updates ${ts}] ${msg}`);
+}
+
+// ── Helpers ───────────────────────────────────────────────────────────────────
+
+async function clickNav(tab: string): Promise<void> {
+  const el = await browser.$(`[data-testid="nav-${tab}"]`);
+  await el.waitForDisplayed({ timeout: 10_000 });
+  await el.click();
+}
+
+/**
+ * Wait for a form modal to close after submission.
+ * Uses isExisting() for DOM-removal detection.
+ * Surfaces modal footer error text immediately instead of timing out.
+ * Any unexpected WebDriver error propagates and fails the test.
+ */
+async function waitForFormClose(submitTestId: string): Promise<void> {
+  await browser.waitUntil(
+    async () => {
+      const btn = browser.$(`[data-testid="${submitTestId}"]`);
+      if (!(await btn.isExisting())) return true;
+      if (!(await btn.isDisplayed())) return true;
+      const errEl = browser.$(".ft-msg.err");
+      if ((await errEl.isExisting()) && (await errEl.isDisplayed())) {
+        const errText = await errEl.getText();
+        throw new Error(`Form submit failed — modal error: "${errText}"`);
+      }
+      return false;
+    },
+    { timeout: 30_000, timeoutMsg: `Form with submit "[data-testid="${submitTestId}"]" did not close within 30 s` },
+  );
+}
+
+/**
+ * Wait until at least one row with the given selector includes `name` in its text.
+ * Returns the matched element (re-fetched in the same iteration).
+ */
+async function findRowByName(
+  rowSelector: string,
+  name: string,
+  timeout = 15_000,
+): Promise<WebdriverIO.Element> {
+  let found: WebdriverIO.Element | null = null;
+  await browser.waitUntil(
+    async () => {
+      try {
+        const rows = await browser.$$(rowSelector);
+        for (const row of rows) {
+          const text = await row.getText();
+          if (text.includes(name)) {
+            found = row;
+            return true;
+          }
+        }
+        return false;
+      } catch {
+        return false;
+      }
+    },
+    { timeout, timeoutMsg: `Row matching "${name}" via "${rowSelector}" not found within ${timeout} ms` },
+  );
+  return found!;
+}
+
+/**
+ * Assert exactly one row with the given selector contains `name`.
+ * No catch — WebDriver errors propagate and fail the test.
+ */
+async function expectExactlyOneRow(rowSelector: string, name: string): Promise<void> {
+  const rows = await browser.$$(rowSelector);
+  let count = 0;
+  for (const row of rows) {
+    const text = await row.getText();
+    if (text.includes(name)) count++;
+  }
+  if (count !== 1) {
+    throw new Error(`Expected exactly 1 row matching "${name}" via "${rowSelector}", found ${count}`);
+  }
+}
+
+/**
+ * Assert no row with the given selector contains `name`.
+ * No catch — WebDriver errors propagate and fail the test.
+ */
+async function expectNoRow(rowSelector: string, name: string): Promise<void> {
+  const rows = await browser.$$(rowSelector);
+  for (const row of rows) {
+    const text = await row.getText();
+    if (text.includes(name)) {
+      throw new Error(`Unexpected row still present — "${name}" found via "${rowSelector}"`);
+    }
+  }
+}
+
+/**
+ * Click the edit action button for the entity with the given name.
+ * Uses browser.execute() to bypass potential CSS hover-visibility in WebKit.
+ */
+async function clickEditButton(entityName: string): Promise<void> {
+  const btn = await browser.$(`button[aria-label="Edit ${entityName}"]`);
+  await btn.waitForExist({ timeout: 10_000 });
+  await browser.execute((el: HTMLElement) => el.click(), btn as unknown as HTMLElement);
+}
+
+/**
+ * Assert the current value of an input or select with the given testId.
+ */
+async function expectInputValue(testId: string, expected: string): Promise<void> {
+  const el = await browser.$(`[data-testid="${testId}"]`);
+  await el.waitForDisplayed({ timeout: 10_000 });
+  const value = await el.getValue();
+  if (value !== expected) {
+    throw new Error(`Expected [data-testid="${testId}"] value "${expected}", got "${value}"`);
+  }
+}
+
+/**
+ * Assert the aria-pressed attribute of a toggle button with the given testId.
+ */
+async function expectAriaPressed(testId: string, expected: boolean): Promise<void> {
+  const el = await browser.$(`[data-testid="${testId}"]`);
+  await el.waitForExist({ timeout: 10_000 });
+  const pressed = await el.getAttribute("aria-pressed");
+  const actual = pressed === "true";
+  if (actual !== expected) {
+    throw new Error(`Expected [data-testid="${testId}"] aria-pressed=${expected}, got "${pressed}"`);
+  }
+}
+
+// ── Suite ─────────────────────────────────────────────────────────────────────
+
+describe("Rack Inventory Studio — entity updates and work mode", () => {
+  after(async () => {
+    // Restore work mode to planning so subsequent specs see a clean initial state.
+    try {
+      const planningBtn = browser.$('[data-testid="work-mode-planning"]');
+      if (await planningBtn.isExisting()) {
+        const pressed = await planningBtn.getAttribute("aria-pressed");
+        if (pressed !== "true") {
+          await planningBtn.click();
+          await browser.waitUntil(
+            async () => (await planningBtn.getAttribute("aria-pressed")) === "true",
+            { timeout: 5_000, timeoutMsg: "Work mode did not return to planning during cleanup" },
+          );
+          log("after: work mode restored to planning");
+        }
+      }
+    } catch (e) {
+      console.error("[entity-updates cleanup] Work mode restore failed:", e);
+      throw e;
+    }
+  });
+
+  it("edits four entity types, verifies work mode toggle, and confirms persistence", async () => {
+    const repoParent = process.env["RIS_E2E_REPOSITORY_PARENT"] as string;
+    if (!repoParent) {
+      throw new Error(
+        "RIS_E2E_REPOSITORY_PARENT is not set. " +
+          "Run via WDIO with the test-environment initialized in wdio.conf.ts.",
+      );
+    }
+
+    const suffix = Date.now().toString(36);
+    const repoCode = `upd${suffix}`;
+    const repoName = `WDIO Updates ${suffix}`;
+
+    // Initial entity names
+    const locationName     = `E2E Location ${suffix}`;
+    const rackName         = `E2E Rack ${suffix}`;
+    const modelName        = `E2E Model ${suffix}`;
+    const deviceName       = `E2E Device ${suffix}`;
+
+    // Updated names — do not contain initial names as substrings
+    const updatedLocationName = `Updated Location ${suffix}`;
+    const updatedRackName     = `Updated Rack ${suffix}`;
+    const updatedModelName    = `Updated Model ${suffix}`;
+    const updatedDeviceName   = `Updated Device ${suffix}`;
+
+    // Rack values
+    const initialRackHeight = "14";
+    const initialRackRow    = `A-${suffix}`;
+    const updatedRackHeight = "18";
+    const updatedRackRow    = `B-${suffix}`;
+
+    // Device Model values
+    const initialModelHeight = "2";
+    const initialModelSku    = `SKU-OLD-${suffix}`;
+    const updatedModelHeight = "3";
+    const updatedModelSku    = `SKU-NEW-${suffix}`;
+
+    // Device values
+    const initialDeviceSerial = `SER-OLD-${suffix}`;
+    const updatedDeviceSerial = `SER-NEW-${suffix}`;
+
+    log(`suffix=${suffix}  repoCode=${repoCode}`);
+
+    // ── PART A: Work mode ─────────────────────────────────────────────────────
+
+    log("part A: waiting for work mode toggle");
+    await browser.$('[data-testid="work-mode-toggle"]').waitForDisplayed({ timeout: 30_000 });
+
+    log("part A: setting initial planning mode");
+    await browser.$('[data-testid="work-mode-planning"]').click();
+    await browser.waitUntil(
+      async () =>
+        (await browser.$('[data-testid="work-mode-planning"]').getAttribute("aria-pressed")) === "true",
+      { timeout: 5_000, timeoutMsg: "Work mode did not switch to planning" },
+    );
+    await expectAriaPressed("work-mode-planning", true);
+    await expectAriaPressed("work-mode-onsite", false);
+    log("part A: planning mode confirmed");
+
+    log("part A: toggling to on-site mode");
+    await browser.$('[data-testid="work-mode-onsite"]').click();
+    await browser.waitUntil(
+      async () =>
+        (await browser.$('[data-testid="work-mode-onsite"]').getAttribute("aria-pressed")) === "true",
+      { timeout: 5_000, timeoutMsg: "Work mode did not switch to on-site" },
+    );
+    await expectAriaPressed("work-mode-onsite", true);
+    await expectAriaPressed("work-mode-planning", false);
+    log("part A: on-site mode confirmed");
+
+    log("part A: toggling back to planning mode");
+    await browser.$('[data-testid="work-mode-planning"]').click();
+    await browser.waitUntil(
+      async () =>
+        (await browser.$('[data-testid="work-mode-planning"]').getAttribute("aria-pressed")) === "true",
+      { timeout: 5_000, timeoutMsg: "Work mode did not return to planning" },
+    );
+    await expectAriaPressed("work-mode-planning", true);
+    await expectAriaPressed("work-mode-onsite", false);
+    log("part A: planning mode restored — work mode coverage complete");
+
+    // ── PART B: Create repository and fixture entities ────────────────────────
+
+    log("part B: creating repository");
+    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 30_000 });
+    const repoPath = await createRepositoryThroughUi({ repoParent, repoCode, repoName });
+    log(`part B: repository created at ${repoPath}`);
+
+    // Create Location
+    log("part B: creating location");
+    await clickNav("locations");
+    await browser.$('[data-testid="location-add-btn"]').waitForDisplayed({ timeout: 10_000 });
+    await browser.$('[data-testid="location-add-btn"]').click();
+    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+    await reactSetValue("field-name", locationName);
+    await (await waitForEnabled("location-form-submit")).click();
+    await waitForFormClose("location-form-submit");
+    await findRowByName("[data-location-code]", locationName);
+    log(`part B: location "${locationName}" confirmed`);
+
+    // Navigate to Racks via location row click
+    log("part B: clicking location row to navigate to Racks");
+    const locationRowForRack = await findRowByName("[data-location-code]", locationName);
+    await browser.execute(
+      (el: HTMLElement) => el.click(),
+      locationRowForRack as unknown as HTMLElement,
+    );
+    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
+
+    // Create Rack
+    log("part B: creating rack");
+    await browser.$('[data-testid="rack-add-btn"]').click();
+    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+    await reactSetValue("field-name", rackName);
+    await reactSetValue("field-height-u", initialRackHeight);
+    await reactSetValue("field-row", initialRackRow);
+    await (await waitForEnabled("rack-form-submit")).click();
+    await waitForFormClose("rack-form-submit");
+    await findRowByName("[data-rack-code]", rackName);
+    log(`part B: rack "${rackName}" (${initialRackHeight}U, row=${initialRackRow}) confirmed`);
+
+    // Create Device Model
+    log("part B: creating device model");
+    await clickNav("device_models");
+    await browser.$('[data-testid="model-add-btn"]').waitForDisplayed({ timeout: 10_000 });
+    await browser.$('[data-testid="model-add-btn"]').click();
+    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+    await reactSelectValue("field-device-type", "server");
+    await reactSetValue("field-name", modelName);
+    await reactSetValue("field-height-u", initialModelHeight);
+    await reactSetValue("field-model-sku", initialModelSku);
+    await (await waitForEnabled("model-form-submit")).click();
+    await waitForFormClose("model-form-submit");
+    await findRowByName("[data-model-code]", modelName);
+    log(`part B: model "${modelName}" (${initialModelHeight}U, SKU=${initialModelSku}) confirmed`);
+
+    // Create Device
+    log("part B: creating device");
+    await clickNav("devices");
+    await browser.$('[data-testid="device-add-btn"]').waitForDisplayed({ timeout: 10_000 });
+    await browser.$('[data-testid="device-add-btn"]').click();
+    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+    await reactSelectValue("field-device-type", "server");
+    await reactSetValue("field-name", deviceName);
+    // Assign device model via combobox
+    await browser.$('[data-testid="field-device-model-trigger"]').waitForDisplayed({ timeout: 10_000 });
+    await browser.$('[data-testid="field-device-model-trigger"]').click();
+    await browser.$('[data-testid="field-device-model-search"]').waitForDisplayed({ timeout: 10_000 });
+    await browser.$('[data-testid="field-device-model-search"]').addValue(modelName);
+    await browser.waitUntil(
+      async () => {
+        try {
+          const opts = await browser.$$('[role="option"]');
+          for (const opt of opts) {
+            const text = await opt.getText();
+            if (text.includes(modelName)) {
+              await opt.click();
+              return true;
+            }
+          }
+          return false;
+        } catch {
+          return false;
+        }
+      },
+      { timeout: 15_000, timeoutMsg: `Model option "${modelName}" not found in device form dropdown` },
+    );
+    await reactSetValue("field-serial", initialDeviceSerial);
+    await (await waitForEnabled("device-form-submit")).click();
+    await waitForFormClose("device-form-submit");
+    await findRowByName("[data-device-code]", deviceName);
+    log(`part B: device "${deviceName}" (serial=${initialDeviceSerial}) confirmed`);
+
+    // ── PART C: Edit Device ───────────────────────────────────────────────────
+
+    log("part C: editing device");
+    await clickNav("devices");
+    await findRowByName("[data-device-code]", deviceName);
+    await clickEditButton(deviceName);
+    await browser.$('[data-testid="device-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+
+    await expectInputValue("field-name", deviceName);
+    await expectInputValue("field-status", "planned");
+    await expectInputValue("field-serial", initialDeviceSerial);
+    log("part C: initial device values confirmed");
+
+    await reactSetValue("field-name", updatedDeviceName);
+    await reactSelectValue("field-status", "installed");
+    await reactSetValue("field-serial", updatedDeviceSerial);
+
+    await (await waitForEnabled("device-form-submit")).click();
+    await waitForFormClose("device-form-submit");
+    log("part C: device form closed");
+
+    await findRowByName("[data-device-code]", updatedDeviceName);
+    await expectExactlyOneRow("[data-device-code]", updatedDeviceName);
+    await expectNoRow("[data-device-code]", deviceName);
+
+    const updatedDeviceRow = await findRowByName("[data-device-code]", updatedDeviceName);
+    const updatedDeviceText = await updatedDeviceRow.getText();
+    if (!updatedDeviceText.includes("installed")) {
+      throw new Error(`Device row: expected "installed" status, got: "${updatedDeviceText}"`);
+    }
+    if (!updatedDeviceText.includes(updatedDeviceSerial)) {
+      throw new Error(`Device row: expected serial "${updatedDeviceSerial}", got: "${updatedDeviceText}"`);
+    }
+    if (!updatedDeviceText.includes(modelName)) {
+      throw new Error(`Device row: expected model "${modelName}" still referenced, got: "${updatedDeviceText}"`);
+    }
+    log(`part C: device → "${updatedDeviceName}", status=installed, serial=${updatedDeviceSerial}`);
+
+    // ── PART D: Edit Device Model ─────────────────────────────────────────────
+
+    log("part D: editing device model");
+    await clickNav("device_models");
+    await findRowByName("[data-model-code]", modelName);
+    await clickEditButton(modelName);
+    await browser.$('[data-testid="model-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+
+    await expectInputValue("field-name", modelName);
+    await expectInputValue("field-height-u", initialModelHeight);
+    await expectInputValue("field-model-sku", initialModelSku);
+    log("part D: initial model values confirmed");
+
+    await reactSetValue("field-name", updatedModelName);
+    await reactSetValue("field-height-u", updatedModelHeight);
+    await reactSetValue("field-model-sku", updatedModelSku);
+
+    await (await waitForEnabled("model-form-submit")).click();
+    await waitForFormClose("model-form-submit");
+    log("part D: model form closed");
+
+    await findRowByName("[data-model-code]", updatedModelName);
+    await expectExactlyOneRow("[data-model-code]", updatedModelName);
+    await expectNoRow("[data-model-code]", modelName);
+
+    const updatedModelRow = await findRowByName("[data-model-code]", updatedModelName);
+    const updatedModelText = await updatedModelRow.getText();
+    if (!updatedModelText.includes("3U")) {
+      throw new Error(`Model row: expected "3U", got: "${updatedModelText}"`);
+    }
+    if (!updatedModelText.includes(updatedModelSku)) {
+      throw new Error(`Model row: expected SKU "${updatedModelSku}", got: "${updatedModelText}"`);
+    }
+    log(`part D: model → "${updatedModelName}", height=3U, SKU=${updatedModelSku}`);
+
+    // Verify device row reflects updated model name
+    log("part D: verifying device row shows updated model name");
+    await clickNav("devices");
+    const deviceRowAfterModelEdit = await findRowByName("[data-device-code]", updatedDeviceName);
+    const deviceTextAfterModelEdit = await deviceRowAfterModelEdit.getText();
+    if (!deviceTextAfterModelEdit.includes(updatedModelName)) {
+      throw new Error(
+        `Device row: expected updated model name "${updatedModelName}", got: "${deviceTextAfterModelEdit}"`,
+      );
+    }
+    log(`part D: device row references updated model name "${updatedModelName}"`);
+
+    // ── PART E: Edit Rack ─────────────────────────────────────────────────────
+
+    log("part E: navigating to Location → Rack for edit");
+    await clickNav("locations");
+    await findRowByName("[data-location-code]", locationName);
+    const locationRowForRackEdit = await findRowByName("[data-location-code]", locationName);
+    await browser.execute(
+      (el: HTMLElement) => el.click(),
+      locationRowForRackEdit as unknown as HTMLElement,
+    );
+    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
+
+    log("part E: clicking edit button for rack");
+    await findRowByName("[data-rack-code]", rackName);
+    await clickEditButton(rackName);
+    await browser.$('[data-testid="rack-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+
+    await expectInputValue("field-name", rackName);
+    await expectInputValue("field-height-u", initialRackHeight);
+    await expectInputValue("field-row", initialRackRow);
+    log("part E: initial rack values confirmed");
+
+    await reactSetValue("field-name", updatedRackName);
+    await reactSetValue("field-height-u", updatedRackHeight);
+    await reactSetValue("field-row", updatedRackRow);
+
+    await (await waitForEnabled("rack-form-submit")).click();
+    await waitForFormClose("rack-form-submit");
+    log("part E: rack form closed");
+
+    await findRowByName("[data-rack-code]", updatedRackName);
+    await expectExactlyOneRow("[data-rack-code]", updatedRackName);
+    await expectNoRow("[data-rack-code]", rackName);
+
+    const updatedRackRow2 = await findRowByName("[data-rack-code]", updatedRackName);
+    const updatedRackText = await updatedRackRow2.getText();
+    if (!updatedRackText.includes("18U")) {
+      throw new Error(`Rack row: expected "18U", got: "${updatedRackText}"`);
+    }
+    if (!updatedRackText.includes(updatedRackRow)) {
+      throw new Error(`Rack row: expected row "${updatedRackRow}", got: "${updatedRackText}"`);
+    }
+    log(`part E: rack → "${updatedRackName}", height=18U, row=${updatedRackRow}`);
+
+    // ── PART F: Edit Location ─────────────────────────────────────────────────
+
+    log("part F: editing location");
+    await clickNav("locations");
+    await findRowByName("[data-location-code]", locationName);
+    await clickEditButton(locationName);
+    await browser.$('[data-testid="location-form-submit"]').waitForDisplayed({ timeout: 10_000 });
+
+    await expectInputValue("field-name", locationName);
+    log("part F: initial location name confirmed");
+
+    await reactSetValue("field-name", updatedLocationName);
+
+    await (await waitForEnabled("location-form-submit")).click();
+    await waitForFormClose("location-form-submit");
+    log("part F: location form closed");
+
+    await findRowByName("[data-location-code]", updatedLocationName);
+    await expectExactlyOneRow("[data-location-code]", updatedLocationName);
+    await expectNoRow("[data-location-code]", locationName);
+    log(`part F: location → "${updatedLocationName}"`);
+
+    // ── PART G: Immediate aggregate verification ───────────────────────────────
+
+    log("part G: immediate aggregate verification");
+
+    // Location
+    await clickNav("locations");
+    await expectExactlyOneRow("[data-location-code]", updatedLocationName);
+    await expectNoRow("[data-location-code]", locationName);
+    log("part G: location verified");
+
+    // Rack under updated location
+    const locationRowForVerify = await findRowByName("[data-location-code]", updatedLocationName);
+    await browser.execute(
+      (el: HTMLElement) => el.click(),
+      locationRowForVerify as unknown as HTMLElement,
+    );
+    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
+    await expectExactlyOneRow("[data-rack-code]", updatedRackName);
+    await expectNoRow("[data-rack-code]", rackName);
+    const verifyRackRow = await findRowByName("[data-rack-code]", updatedRackName);
+    const verifyRackText = await verifyRackRow.getText();
+    if (!verifyRackText.includes("18U")) {
+      throw new Error(`Aggregate verify rack: expected "18U", got: "${verifyRackText}"`);
+    }
+    if (!verifyRackText.includes(updatedRackRow)) {
+      throw new Error(`Aggregate verify rack: expected row "${updatedRackRow}", got: "${verifyRackText}"`);
+    }
+    log("part G: rack verified");
+
+    // Device Model
+    await clickNav("device_models");
+    await expectExactlyOneRow("[data-model-code]", updatedModelName);
+    await expectNoRow("[data-model-code]", modelName);
+    const verifyModelRow = await findRowByName("[data-model-code]", updatedModelName);
+    const verifyModelText = await verifyModelRow.getText();
+    if (!verifyModelText.includes("3U")) {
+      throw new Error(`Aggregate verify model: expected "3U", got: "${verifyModelText}"`);
+    }
+    if (!verifyModelText.includes(updatedModelSku)) {
+      throw new Error(`Aggregate verify model: expected SKU "${updatedModelSku}", got: "${verifyModelText}"`);
+    }
+    log("part G: device model verified");
+
+    // Device
+    await clickNav("devices");
+    await expectExactlyOneRow("[data-device-code]", updatedDeviceName);
+    await expectNoRow("[data-device-code]", deviceName);
+    const verifyDeviceRow = await findRowByName("[data-device-code]", updatedDeviceName);
+    const verifyDeviceText = await verifyDeviceRow.getText();
+    if (!verifyDeviceText.includes("installed")) {
+      throw new Error(`Aggregate verify device: expected "installed", got: "${verifyDeviceText}"`);
+    }
+    if (!verifyDeviceText.includes(updatedDeviceSerial)) {
+      throw new Error(`Aggregate verify device: expected serial "${updatedDeviceSerial}", got: "${verifyDeviceText}"`);
+    }
+    if (!verifyDeviceText.includes(updatedModelName)) {
+      throw new Error(`Aggregate verify device: expected model "${updatedModelName}", got: "${verifyDeviceText}"`);
+    }
+    if (!verifyDeviceText.toLowerCase().includes("unplaced")) {
+      throw new Error(`Aggregate verify device: expected "unplaced", got: "${verifyDeviceText}"`);
+    }
+    log("part G: device verified");
+    log("part G: all immediate assertions passed");
+
+    // ── PART H: Save, close, and reopen ──────────────────────────────────────
+
+    log("part H: saving and closing repository");
+    await clickNav("repository");
+    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 10_000 });
+    await browser.$('[data-testid="repository-close-action"]').click();
+    await (await waitForEnabled("unsaved-changes-save")).click();
+    await browser.$('[data-testid="repository-landing-title"]').waitForDisplayed({ timeout: 60_000 });
+    await browser
+      .$('[data-testid="repository-active-path"]')
+      .waitForDisplayed({ timeout: 5_000, reverse: true });
+    log("part H: repository closed, landing screen visible");
+
+    log(`part H: reopening repository at ${repoPath}`);
+    await reactSetValue("repository-open-path-input", repoPath);
+    await (await waitForEnabled("repository-open-path-submit")).click();
+    await browser.$('[data-testid="repository-active-root"]').waitForDisplayed({ timeout: 30_000 });
+    await expectActiveRepositoryPath(repoPath);
+    log("part H: repository reopened, active path verified");
+
+    // ── PART I: Final persistence verification ────────────────────────────────
+
+    log("part I: verifying persistence after reopen");
+
+    // Location
+    await clickNav("locations");
+    await expectExactlyOneRow("[data-location-code]", updatedLocationName);
+    await expectNoRow("[data-location-code]", locationName);
+    log("part I: location persisted");
+
+    // Rack under updated location
+    const locationRowAfterReopen = await findRowByName("[data-location-code]", updatedLocationName);
+    await browser.execute(
+      (el: HTMLElement) => el.click(),
+      locationRowAfterReopen as unknown as HTMLElement,
+    );
+    await browser.$('[data-testid="rack-add-btn"]').waitForDisplayed({ timeout: 10_000 });
+    await expectExactlyOneRow("[data-rack-code]", updatedRackName);
+    await expectNoRow("[data-rack-code]", rackName);
+    const persistedRackRow = await findRowByName("[data-rack-code]", updatedRackName);
+    const persistedRackText = await persistedRackRow.getText();
+    if (!persistedRackText.includes("18U")) {
+      throw new Error(`Persisted rack: expected "18U", got: "${persistedRackText}"`);
+    }
+    if (!persistedRackText.includes(updatedRackRow)) {
+      throw new Error(`Persisted rack: expected row "${updatedRackRow}", got: "${persistedRackText}"`);
+    }
+    log("part I: rack persisted");
+
+    // Device Model
+    await clickNav("device_models");
+    await expectExactlyOneRow("[data-model-code]", updatedModelName);
+    await expectNoRow("[data-model-code]", modelName);
+    const persistedModelRow = await findRowByName("[data-model-code]", updatedModelName);
+    const persistedModelText = await persistedModelRow.getText();
+    if (!persistedModelText.includes("3U")) {
+      throw new Error(`Persisted model: expected "3U", got: "${persistedModelText}"`);
+    }
+    if (!persistedModelText.includes(updatedModelSku)) {
+      throw new Error(`Persisted model: expected SKU "${updatedModelSku}", got: "${persistedModelText}"`);
+    }
+    log("part I: device model persisted");
+
+    // Device
+    await clickNav("devices");
+    await expectExactlyOneRow("[data-device-code]", updatedDeviceName);
+    await expectNoRow("[data-device-code]", deviceName);
+    const persistedDeviceRow = await findRowByName("[data-device-code]", updatedDeviceName);
+    const persistedDeviceText = await persistedDeviceRow.getText();
+    if (!persistedDeviceText.includes("installed")) {
+      throw new Error(`Persisted device: expected "installed", got: "${persistedDeviceText}"`);
+    }
+    if (!persistedDeviceText.includes(updatedDeviceSerial)) {
+      throw new Error(`Persisted device: expected serial "${updatedDeviceSerial}", got: "${persistedDeviceText}"`);
+    }
+    if (!persistedDeviceText.includes(updatedModelName)) {
+      throw new Error(`Persisted device: expected model "${updatedModelName}", got: "${persistedDeviceText}"`);
+    }
+    if (!persistedDeviceText.toLowerCase().includes("unplaced")) {
+      throw new Error(`Persisted device: expected "unplaced" (device never placed), got: "${persistedDeviceText}"`);
+    }
+    log("part I: device persisted");
+
+    log("all persistence assertions passed — Stage 3B.1 complete");
+  });
+});
diff --git a/apps/desktop/e2e-wdio/wdio.conf.ts b/apps/desktop/e2e-wdio/wdio.conf.ts
index 6a06a2e..86c435c 100644
--- a/apps/desktop/e2e-wdio/wdio.conf.ts
+++ b/apps/desktop/e2e-wdio/wdio.conf.ts
@@ -73,9 +73,10 @@ export const config: Options.Testrunner = {
     // overhead in headless Xvfb.  Stage 1 (14 steps, 5 entity types, 4 modal cycles)
     // takes ~12 min.  Stage 2 adds placement, save/close/reopen, and persistence
     // verification (~13 min).  Stage 3A adds edit, remove, and two more close/reopen
-    // cycles (~10 min additional).
-    // Total wall-clock: ~35 min confirmed by two isolated runs → 45 min with margin.
-    timeout: 2_700_000,
+    // cycles (~10 min additional); Stage 3B.1 adds 4 more edit cycles plus work mode
+    // toggle across 5 entities (~50 min observed).
+    // Upper bound across all specs: ~50 min → 60 min with margin.
+    timeout: 3_600_000,
   },
 
   services: [
diff --git a/docs/E2E_WDIO_COVERAGE_GAPS.md b/docs/E2E_WDIO_COVERAGE_GAPS.md
index 07e6b0f..85b7516 100644
--- a/docs/E2E_WDIO_COVERAGE_GAPS.md
+++ b/docs/E2E_WDIO_COVERAGE_GAPS.md
@@ -80,7 +80,7 @@ buttons (Init, Validate, Commit, Add remote, Push, Pull).
 | Workflow | Status | Notes |
 |----------|--------|-------|
 | Create location | COVERED | `core-inventory` |
-| Edit location | MISSING | `LocationFormModal` opens in edit mode; `location-form-submit` present |
+| Edit location | COVERED | `entity-updates-work-mode` Stage 3B.1 |
 | Delete location — no racks (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no `data-testid` on confirm button |
 | Delete location — racks exist (constraint error) | NEEDS SELECTOR | Same; backend likely returns an error |
 
@@ -92,7 +92,7 @@ buttons (Init, Validate, Commit, Add remote, Push, Pull).
 |----------|--------|-------|
 | Create rack | COVERED | `core-inventory` |
 | Navigate to rack via location row click | COVERED | `core-inventory` |
-| Edit rack | MISSING | `RackFormModal` edit path; `rack-form-submit` present |
+| Edit rack | COVERED | `entity-updates-work-mode` Stage 3B.1 |
 | Delete rack — no placements (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no `data-testid` on confirm button |
 | Delete rack — placements exist (constraint error) | NEEDS SELECTOR | Same; backend constraint |
 
@@ -103,7 +103,7 @@ buttons (Init, Validate, Commit, Add remote, Push, Pull).
 | Workflow | Status | Notes |
 |----------|--------|-------|
 | Create device model (server, 1U) | COVERED | `core-inventory` |
-| Edit device model | MISSING | `DeviceModelFormModal` edit path; `model-form-submit` present |
+| Edit device model | COVERED | `entity-updates-work-mode` Stage 3B.1 |
 | Delete device model — no devices (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no testid |
 | Delete device model — devices exist (constraint error) | NEEDS SELECTOR | Same; backend constraint |
 
@@ -115,7 +115,7 @@ buttons (Init, Validate, Commit, Add remote, Push, Pull).
 |----------|--------|-------|
 | Create device (with model, planned status) | COVERED | `core-inventory` |
 | Unplaced badge after creation | COVERED | `core-inventory` |
-| Edit device | MISSING | `DeviceFormModal` edit path; `device-form-submit` present |
+| Edit device | COVERED | `entity-updates-work-mode` Stage 3B.1 |
 | Delete device — unplaced (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no testid |
 | Delete placed device — must unplace first | NEEDS SELECTOR | Same; backend guard |
 
@@ -171,8 +171,8 @@ All validation panel action buttons lack `data-testid` attributes.
 
 | Workflow | Status | Notes |
 |----------|--------|-------|
-| Toggle to onsite mode | MISSING | `work-mode-onsite` testid present |
-| Toggle to planning mode | MISSING | `work-mode-planning` testid present |
+| Toggle to onsite mode | COVERED | `entity-updates-work-mode` Stage 3B.1 |
+| Toggle to planning mode | COVERED | `entity-updates-work-mode` Stage 3B.1 |
 | Work mode affects device status defaults | NOT JUSTIFIED | Unit test coverage in `DevicesPanel.test.tsx` |
 
 Work mode toggle is wired but the `work-mode-planning` and `work-mode-onsite`
@@ -306,24 +306,27 @@ Suggested selector additions:
 
 ## Summary counts
 
-Counts updated after Stage 3A (placement lifecycle) — 2026-07-16.
+Counts updated after Stage 3B.1 (entity updates and work mode) — 2026-07-16.
 
 Stage 3A changed three existing MISSING workflows to COVERED:
 edit placement (start U), remove placement via inspector, open edit modal via inspector.
 One new workflow was added as COVERED: removed-placement persistence (previously implicit
 in the "remove" row but now tracked separately as a distinct persistence check).
-
 Net effect: COVERED +4 (three promoted from MISSING + one new row), MISSING −3, total +1.
 
+Stage 3B.1 changed six existing MISSING workflows to COVERED:
+edit location, edit rack, edit device model, edit device, toggle to on-site, toggle to planning.
+Net effect: COVERED +6, MISSING −6, total unchanged.
+
 | Status | Count |
 |--------|-------|
-| COVERED | 24 |
+| COVERED | 30 |
 | PARTIAL | 0 |
-| MISSING | 12 |
+| MISSING | 6 |
 | NEEDS SELECTOR | 15 |
 | DEFERRED | 9 |
 | NOT JUSTIFIED | 7 |
-| **Total workflows inventoried** | **67** (one row added vs. original 66) |
+| **Total workflows inventoried** | **67** |
 
-Current E2E coverage: **24 / 67 workflows** (36%).
-Stage 3B target (entity edits + Tier 1 remainder): estimated **30 / 67** (45%).
+Current E2E coverage: **30 / 67 workflows** (45%).
+Stage 3B.2 target (delete flows): estimated further reduction of MISSING count.
diff --git a/docs/E2E_WDIO_PLAN.md b/docs/E2E_WDIO_PLAN.md
index 4860555..a5bf589 100644
--- a/docs/E2E_WDIO_PLAN.md
+++ b/docs/E2E_WDIO_PLAN.md
@@ -653,11 +653,11 @@ committed tasks and are not listed in priority order:
 
 **Overall status: IN PROGRESS**
 
-Stage 3 is split into two independently reviewable PRs.
+Stage 3 is split into independently reviewable sub-stages.
 
 ### Stage 3A — Placement lifecycle
 
-**Status: IN REVIEW** (PR targeting `roadmap/e2e-wdio`)
+**Status: COMPLETED** (merged as PR #147, merge commit `40f6a12`)
 
 Delivered through `feature/e2e-wdio-placement-lifecycle`.
 
@@ -687,23 +687,55 @@ the inspector button (also labelled "Remove from rack") appears before the porta
 and native `.click()` fires `mousedown` which lands on the backdrop overlay and triggers
 `handleBackdrop` → immediate dialog close before the confirm button can be activated.
 
-### Stage 3B — Representative CRUD and destructive-operation guards
+**Validation (Linux, 2026-07-16):**
+
+| Run | Result | Duration | Exit |
+|-----|--------|----------|------|
+| Isolated run 9 | PASSED 1/1 | 00:35:36 | 0 |
+| Isolated run 10 | PASSED 1/1 | 00:35:38 | 0 |
+| Full suite (6 specs) | PASSED 6/6 | 01:26:54 | 0 |
+| TypeScript | 0 errors | — | 0 |
+| Vitest | 844/844 passed | — | 0 |
+| GitHub checks | All green (CI #29478292711) | — | — |
+
+### Stage 3B.1 — Entity updates and work mode
+
+**Status: IN REVIEW** (PR targeting `roadmap/e2e-wdio`)
+
+Delivered through `feature/e2e-wdio-entity-updates-work-mode`.
+
+**Scope:**
+
+- Work mode toggle: Planning → On-site → Planning (`work-mode-toggle`, `aria-pressed`)
+- Edit device: change name, status, serial number (`device-form-submit`, `field-*`)
+- Edit device model: change name, height, SKU (`model-form-submit`, `field-*`)
+- Edit rack: change name, height, row (`rack-form-submit`, `field-*`)
+- Edit location: change name (`location-form-submit`, `field-name`)
+- Aggregate verification: all four updated entities visible in their panels
+- Persistence: save + close + reopen → all four updates survive
+
+**Spec:** `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts`
+
+**New selectors:** None.  All selectors were already present in application source.
+Edit buttons use existing `aria-label="Edit <name>"` pattern; form field testids
+(`field-name`, `field-height-u`, `field-row`, `field-model-sku`, `field-status`,
+`field-serial`) and submit testids were already present from Stage 1.
+
+### Stage 3B.2 — Delete flows and destructive-operation guards
 
 **Status: PLANNED**
 
 Not yet started.  Scope pending.
 
-Representative scope from the Tier 1 and Tier 2 lists in the gap analysis:
-- Edit device, device model, location, rack (form modals; all testids in place)
-- Work mode toggle
+Representative scope from the Tier 2 list in the gap analysis:
 - Delete entity (requires ConfirmDialog confirm button testid)
 - Delete with relationship constraint
+- Edit placement height U (`height-u-input` in `EditPlacementModal`)
+- Remove placement via `EditPlacementModal` remove button
+- `PlacementInspectorPanel` navigate to device / model
 
 See [`docs/E2E_WDIO_COVERAGE_GAPS.md`](E2E_WDIO_COVERAGE_GAPS.md) for the full matrix.
 
-Do not mark Stage 3B as IN PROGRESS until the Stage 3A PR is merged and scope
-is agreed for Stage 3B.
-
 ## Future stages
 
 Placeholder areas for stages beyond Stage 3. Scope and order will be decided during
diff --git a/.ai/cc-report.md b/.ai/cc-report.md
index 0e39ad7..356cc2e 100644
--- a/.ai/cc-report.md
+++ b/.ai/cc-report.md
@@ -87,7 +87,8 @@ All parts A–I complete; all persistence assertions passed.
 ### Full WDIO suite (all 7 specs)
 
 ```
-<to be filled after run>
+Spec Files:  7 passed, 7 total (100% completed) in 02:16:28
+run root /tmp/ris-wdio-hp5ww2 (cleaned up)
 ```
 
 ## Risks
