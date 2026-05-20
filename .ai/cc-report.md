# cc-report — milestone/drag-and-drop-placement

## Branch

`milestone/drag-and-drop-placement`

**PR:** https://github.com/TechTradeExpress/RackInventoryStudio/pull/37

---

## Summary

Added HTML Drag and Drop API placement to RackDetailPanel (initial commit), then fixed
the blocking review issue: drop target validation now checks item height before showing
a valid-drop highlight (repair commit).

---

## Blocking Issue Fixed (repair for PR #37)

**Problem:** All empty rack unit cells showed a green valid-drop highlight regardless of
item height. A 2U or 4U rack object dragged near the top of the rack could highlight
cells where the full range would exceed the rack height or overlap an existing placement.
The backend would reject these drops, but the UI should not indicate they are valid.

**Fix:** Added `canDropAt(units, startU, heightU)` which checks that the entire U-range
fits within the rack and all cells in that range are empty. The `SideColumn` component
now runs this check on every `dragover` event using the active payload cached in a
module-level singleton (required because `dataTransfer.getData()` is blocked by the
browser during `dragover`). Green highlight → valid; red dashed highlight → invalid;
drop is silently ignored for invalid targets.

---

## Files Changed

| File | Change |
|---|---|
| `src/features/racks/dndTypes.ts` | New — DND_DATA_TYPE and DndPayload union type |
| `src/features/racks/dndHelpers.ts` | New — encode/decode, active-drag singleton, `getPayloadHeight`, `canDropAt` |
| `src/features/racks/dndHelpers.test.ts` | New — 15 tests: 7 encode/decode, 8 canDropAt scenarios |
| `src/features/racks/AddPlacementPanel.tsx` | Drag palette; `allDeviceModels` state for height lookup; `setActiveDragPayload` on dragstart/dragend |
| `src/features/racks/RackUnitDiagram.tsx` | Drop targets in `SideColumn`; `{ idx, valid }` hover state; green/red highlight based on `canDropAt`; drop guard |
| `src/features/racks/RackDetailPanel.tsx` | `handleDropAtCell`; `dndError` state; `placeDevice`/`placeRackObject` imports |
| `e2e/mocks/tauri-core.ts` | `place_device` and `place_rack_object` mock handlers |

---

## Implementation Notes

### canDropAt semantics
`units[0]` = U1 (bottom), `units[n-1]` = top — same convention as `buildOccupancy`.
A placement from `startU` to `startU + heightU - 1` must:
- have `heightU ≥ 1` (positive integer),
- have `startU ≥ 1`,
- have `startU + heightU - 1 ≤ units.length` (fits in rack),
- have all cells in range as `empty` (not `occupied` or `incomplete`).

### Active drag singleton
HTML DnD API restricts `dataTransfer.getData()` to `dragstart` and `drop` events only.
During `dragover` the data is not readable. A module-level variable `_activeDragPayload`
is set on `dragstart` and cleared on `dragend`, allowing `SideColumn` to validate
during `dragover` without lifting state through multiple component layers.

### Height for device vs rack_object
- `rack_object`: `payload.defaultHeightU` is always a concrete number → used directly.
- `device`: `payload.defaultHeightU` is looked up from `allDeviceModels` (full model list
  stored in `AddPlacementPanel` state). Falls back to `null` when device has no model,
  and `getPayloadHeight` returns `1` for `null`. This means a device without a model is
  validated as 1U — acceptable because the backend sets default height to 1U in that case.

### Limitation
Devices with a model have their height correctly resolved in the drag card.
The height is baked into the payload at drag start, so if a model's height changes
between page load and drop, the stale height is used for UI validation
(backend remains the source of truth).

---

## Tests

| Command | Result |
|---|---|
| `cargo fmt --all --check` | PASS |
| `cargo check --workspace` | PASS |
| `cargo test --workspace` | PASS — all 344 Rust tests pass |
| `cargo clippy --workspace -- -D warnings` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` (Vitest) | PASS — 78 tests, 7 files (15 new dndHelpers tests) |
| `pnpm build` | PASS — 57 modules, 234 kB bundle |
| `pnpm test:e2e` (Playwright) | PASS — 7/7, Firefox |

---

## Manual Check

Performed against Vite dev server (port 1420) in WSL2 environment (no browser available
for interactive UI; functional correctness verified via unit tests and Playwright smoke layer).

- `canDropAt` unit tests cover all valid/invalid scenarios including out-of-bounds,
  overlap with occupied and incomplete cells, and multi-U range validation.
- Playwright smoke tests confirm rack detail loads, placements are visible, and
  the global console error guard detects any runtime errors.
- Form-based placement workflow unchanged and verified via existing code paths.

---

## Risks

- Playwright DnD smoke test deferred — Firefox headless does not populate
  `dataTransfer.getData()` in synthetic drag events (unchanged from initial commit).
- Active drag singleton is module-level state: if multiple rack diagrams are rendered
  simultaneously, the last dragstart wins. This is acceptable for the current single-
  rack-detail layout but would require a Context-based approach if multiple diagrams
  were visible at once.
- Device height baked into payload at drag start — stale if model changes mid-session.
  Backend validation is the final guard.

---

## Not Done

- Playwright DnD smoke test (deferred — unchanged).
- Drag-and-drop touch support (not in scope).
- Keyboard alternative for drag-and-drop (not in scope).

---

## Suggested Next Step

Add a Playwright smoke test for drag-and-drop using synthetic `dispatchEvent` calls
with a mocked `dataTransfer` object once a reliable cross-browser approach is confirmed.
