# CC Report — Milestone D: Complete rack diagram drag-and-drop workflow

## Summary

Completed drag-and-drop workflow for the rack unit diagram (Beta QA Milestone D).

Key changes:
1. **Height-aware drop preview** — when dragging an item over an empty U slot, all cells in the `[startU, startU+heightU-1]` range highlight green (valid) or red (blocked). Occupied and incomplete cells in a blocked range also show a red dashed outline.
2. **`getDragPayload` fallback** — falls back to the `_activeDragPayload` cache when `dataTransfer.getData()` returns empty (programmatic/Playwright DnD events).
3. **Palette drag handler order** — `setActiveDragPayload` is now called before `dataTransfer.setData` so the cache is always set even if `setData` throws or is a no-op.
4. **E2E fixture** — added unplaced device (`srv-unplaced-01`) to `list_devices` so the palette device path is exercised in tests.
5. **Tests** — new unit tests for `getPayloadHeight`, `getDragPayload` fallback, and `PlacePlacementModal` DnD prefill; two new Playwright DnD smoke tests.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/features/racks/dndHelpers.ts` | `getDragPayload`: fall back to `_activeDragPayload` when `getData` returns "". |
| `apps/desktop/src/features/racks/RackUnitDiagram.tsx` | `SideColumn` hover state → `{startU, heightU, valid}`; height-aware preview for occupied/incomplete/empty cells in range. |
| `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` | Move `setActiveDragPayload` before `setData` in both device and rack_object drag handlers. |
| `apps/desktop/src/features/racks/dndHelpers.test.ts` | Added `getPayloadHeight` tests (3) and `getDragPayload` fallback tests (3). +6 tests. |
| `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` | Added DnD prefill tests for device and rack_object kinds. +2 tests. |
| `apps/desktop/e2e/mocks/tauri-core.ts` | Added unplaced device fixture; exported `FIXTURE_UNPLACED_DEVICE_ID`; updated `unplaced_devices_count` to 1. |
| `apps/desktop/e2e/smoke.spec.ts` | Added 2 DnD smoke tests (rack_object drag to U5, device drag to U8). Added fixture ID consts. |
| `docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md` | Added Milestone D status note pointing to branch/PR. |
| `CHANGELOG.md` | Added Milestone D unreleased entry. |

## Tests

```
# TypeScript
node ./node_modules/.bin/tsc --noEmit  →  0 errors

# Vitest
node ./node_modules/.bin/vitest run  →  381 passed (was 365; +16 new)

# Vite build
node ./node_modules/.bin/vite build  →  built in 1.69s

# Playwright E2E
node ./node_modules/.bin/playwright test  →  15 passed (was 13; +2 new)

# Rust
cargo fmt --all --check  →  OK
cargo check --workspace  →  OK
cargo test --workspace   →  OK
cargo clippy -- -D warnings  →  OK
```

## Risks

- **Playwright DnD simulation** relies on React's event delegation processing programmatic `DragEvent` dispatches. Tested in Playwright Chromium — passes.
- **`_activeDragPayload` global state** is module-level; concurrent drag operations are not possible in a single-window desktop app, so the singleton is safe.
- **Height-aware preview on occupied cells**: `onDragOver` only fires on empty cells. Dragging over an occupied cell shows no preview range — the hover state resets to null on `dragLeave`. This is acceptable UX.

## Not done

- Same-side drag-to-move (reposition existing placement by dragging) — deferred per Milestone D scope.
- Drag-to-unrack (dedicated "remove zone") — deferred per Milestone D scope.
- Cross-side DnD is excluded by design; modal-based flow remains available.

## Suggested next step

Milestone E — Create device from Place equipment: add a "Create new device…" inline action inside `PlacePlacementModal` that opens `DeviceFormModal`, then returns with the new device preselected.
