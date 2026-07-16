## Summary

Stage 3A RP (review proposal) for PR #147: placement lifecycle spec.

Branch: `feature/e2e-wdio-placement-lifecycle` → base: `roadmap/e2e-wdio`

This RP addresses all blocking issues found during strict Stage 3A review:

1. **Exact single-placement assertions** — spec now proves exactly N cards exist at
   each checkpoint using `[data-testid^="placed-"][data-device-code="${code}"]` scoped
   to rack diagram; bare `[data-device-code]` avoided (also appears in Devices table).
   Checkpoints: count=1 after place, after move, after first reopen; count=0 after remove,
   after second reopen.

2. **Effective 2U height confirmation** — production card `title` attribute now checked
   for the en-dash range `U${start}–U${start+MODEL_HEIGHT-1}` at every position: U1–U2
   after initial placement, U5–U6 after move, U5–U6 after first reopen.

3. **False-positive catches removed** — `waitForEditModalClose()` and the
   `PlacePlacementModal` close helper rewritten with `isExisting()` for DOM-removal
   detection (no exception→success conversion). All "no card" negative assertions now
   use `browser.$$` + length check: no `.catch(() => false)` on negative paths.
   Any unhandled WebDriver error propagates and fails the test immediately.

4. **Entity persistence verification (Part 5)** — after second reopen the spec now
   explicitly verifies: Device unplaced (Devices panel), Device Model exists (Device
   Models list), Rack accessible (navigateToRackDetail succeeds).

5. **Coverage stats corrected** — `docs/E2E_WDIO_COVERAGE_GAPS.md` summary table:
   `MISSING` changed from 14 to 12 so categories sum to 67.
   Correct math: 15 MISSING before − 3 promoted to COVERED = 12. Summary MISSING=14
   was wrong (subtracted only 1 instead of 3). Added explanatory text.

6. **ConfirmDialog selector documented correctly** — `docs/E2E_WDIO_PLAN.md` now
   describes actual mechanism: `button.btn-danger` inside `modal-backdrop` via
   `browser.execute()`. Previous text said `button=Remove from rack` (wrong).

7. **Runtime overhead comment** — `wdio.conf.ts` removed the imprecise "~600ms per
   command" wording. Now says "significant per-command overhead"; total wall-clock
   "~35 min confirmed by two isolated runs".

8. **Rust workspace CI** — PR #148 (`fix/rust-clippy-manual-filter`) was merged to
   `roadmap/e2e-wdio` (merge commit `d82406a`). It fixed the `clippy::manual_filter`
   lint in `crates/ris-import/src/csv_reader.rs`. This branch was then synchronized
   with the updated base via a merge commit. PR #147 introduces no Rust changes of its
   own — `csv_reader.rs` does not appear in the diff of PR #147 against its base.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/e2e-wdio/specs/placement-lifecycle.e2e.ts` | Full RP rewrite: count assertions, 2U range checks, isExisting() modal helpers, $$ no-card checks, device model entity check in Part 5 |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Fix overhead comment (remove "~600ms per command") |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Fix MISSING count 14→12, fix date 07-15→07-16, fix explanatory text |
| `docs/E2E_WDIO_PLAN.md` | Fix ConfirmDialog selector description |

## Tests

### Isolated spec × 2 (required gate)

```
Run 9:  1 passed, 1 total  in 00:35:36  (cleanup: /tmp/ris-wdio-jBkKkm)
Run 10: 1 passed, 1 total  in 00:35:38  (cleanup: /tmp/ris-wdio-50eYNO)
```

Both runs exercised all 5 parts including new assertions:
- Part 1: count=1, data-start-u="1", range "U1–U2" in title confirmed
- Part 2: count=1, data-start-u="5", range "U5–U6" in title confirmed; count at U1=0
- Part 3: count=1 after reopen, range "U5–U6" persisted, U1 count=0 after reopen
- Part 4: count=0 after remove (two-phase: waitUntil DOM removal + explicit count check)
- Part 5: device unplaced, device model verified in list, rack navigable, count=0 in rack

### Full WDIO suite (all 6 specs)

```
Run 2: 6 passed, 6 total  in 01:26:54  (cleanup: /tmp/ris-wdio-Cjx4Jz)
```

Run 2 used the RP spec (`13b237b`). All 6 specs passed. No leftover ris-wdio directories
after run completion.

Full WDIO was not rerun after the base merge because PR #148 changed only the Rust CSV
filtering implementation and `.ai/cc-report.md`. The previously completed post-RP full
suite remains the applicable Stage 3A validation.

### TypeScript

```
pnpm exec tsc --noEmit   → clean (0 errors)
```

### Vitest

```
51 test files, 844 tests passed
```

### Tauri build

Previous Stage 3A validation (not rerun after base merge — no Tauri code changed):
```
pnpm tauri build --no-bundle  → Built application at target/release/rack-inventory-studio-desktop
Finished release profile in 58.63s
```

### Playwright

Blocked by missing `libasound2t64` system package — all 21 tests fail with the same
system-dependency error. This is a pre-existing environment limitation, not a code
regression. Exact error:
```
║     sudo apt-get install libasound2t64               ║
```

### Rust workspace (after base merge)

```
cargo fmt --all --check          → clean
cargo test --workspace           → all passed
cargo clippy --workspace -- -D warnings  → clean
cargo check --workspace          → clean
```

`csv_reader.rs` now uses `.filter(|v| !v.is_empty())` (from merged PR #148 base).

## Base synchronization

- PR #148 merged to `roadmap/e2e-wdio` as commit `d82406a`
- `feature/e2e-wdio-placement-lifecycle` merged with updated base via `--no-ff`
- `git merge-base --is-ancestor d82406a HEAD` → confirmed ancestor
- `csv_reader.rs` does not appear in `git diff origin/roadmap/e2e-wdio...HEAD`
- No Rust changes belong to Stage 3A

## Cleanup verification

- Run 9 cleanup: `[test-environment] cleaned up: /tmp/ris-wdio-jBkKkm` ✓
- Run 10 cleanup: `[test-environment] cleaned up: /tmp/ris-wdio-50eYNO` ✓
- Full suite run 2 cleanup: `[test-environment] cleaned up: /tmp/ris-wdio-Cjx4Jz` ✓
- All three directories confirmed absent from /tmp after run completion
- Each run uses a unique suffix ensuring zero cross-run contamination

## Risks

- Spec takes ~35 min per run due to `@wdio/tauri-service` external driver overhead in
  headless Xvfb — inherent to the current driver configuration.
- Full WDIO suite (~6 specs) takes ~1 h 27 min total.
- `browser.execute()` fires synthetic `click` (not full mousedown/mouseup sequence).
  Production paths (IPC `editPlacement`, `removePlacement`) are still exercised via
  resulting React state changes, which is the correct assertion.
- Playwright tests blocked by `libasound2t64` in this environment — separate env issue.
- Full WDIO not rerun after base merge (PR #148 changed only Rust CSV parser and report).

## Not done

- Edit placement via height-u-input (Stage 3B)
- Remove placement via EditPlacementModal remove button (Stage 3B)
- PlacementInspectorPanel navigate-to-device / navigate-to-model (Stage 3B)
- Entity edit and delete flows (Stage 3B)
- Work mode toggle (Stage 3B)

## Suggested next step

Merge PR #147 do roadmap/e2e-wdio. Stage 3B należy zaplanować osobno po merge Stage 3A.
