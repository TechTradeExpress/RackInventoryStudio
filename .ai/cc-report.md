# cc-report — milestone/drag-and-drop-placement

## Branch

`milestone/drag-and-drop-placement`

---

## Summary

Added HTML Drag and Drop API placement to RackDetailPanel. Users can drag unplaced
device cards or rack object model cards from the Add Placement palette and drop them
onto empty rack unit cells in the Rack Diagram to create placements directly — no
form fill required. The existing form-based workflow is preserved and unchanged.

---

## Files Changed

| File | Change |
|---|---|
| `src/features/racks/dndTypes.ts` | New — DND_DATA_TYPE constant and DndPayload union type |
| `src/features/racks/dndHelpers.ts` | New — encodeDndPayload, decodeDndPayload, getDragPayload |
| `src/features/racks/dndHelpers.test.ts` | New — 7 Vitest tests for encode/decode round-trips and error cases |
| `src/features/racks/AddPlacementPanel.tsx` | Added drag palette section: draggable cards for unplaced devices and rack object models |
| `src/features/racks/RackUnitDiagram.tsx` | Added onDropAtCell prop; SideColumn now handles dragover/dragleave/drop on empty cells; green dashed outline on drag-over; data-testid on empty cells |
| `src/features/racks/RackDetailPanel.tsx` | Added dndError state, handleDropAtCell handler, placeDevice/placeRackObject imports, dndError error box below diagram |
| `e2e/mocks/tauri-core.ts` | Added place_device and place_rack_object mock handlers with input validation |

---

## Implementation Notes

### Payload format
`DndPayload` is a JSON-serialised discriminated union (`kind: "device" | "rack_object"`)
stored in `dataTransfer` under MIME type `application/ris-placement`.

### Drop target U-number calculation
`SideColumn` renders `[...units].reverse()`. Row at visual index `idx` corresponds to
`U(units.length - idx)` — this is how `startU` is derived on drop.

### Drag-over highlight
Only empty cells light up (`background: #c8e6c0, outline: 2px dashed #4a7c3f`).
Occupied and incomplete cells ignore drag events (no onDragOver/onDrop handlers).

### Error handling
Backend errors on drop are caught and displayed in a red error box below the diagram
(`dndError` state). Does not crash the panel.

### Playwright DnD test — deferred
`page.dragAndDrop()` in Playwright with Firefox requires the element to be in viewport
and the HTML DnD API behavior is not fully simulated in headless mode. A DnD Playwright
smoke test was evaluated and deferred — Playwright's `dragAndDrop` simulates pointer
events but HTML DnD `dataTransfer.getData()` returns empty string in the simulated
environment. The existing 7 smoke tests continue to pass.

---

## Tests

| Command | Result |
|---|---|
| `cargo fmt --all --check` | PASS |
| `cargo check --workspace` | PASS |
| `cargo test --workspace` | PASS — all tests pass |
| `cargo clippy --workspace -- -D warnings` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` (Vitest) | PASS — 70 tests, 7 files (7 new dndHelpers tests) |
| `pnpm build` | PASS — 57 modules, 234 kB bundle |
| `pnpm test:e2e` (Playwright) | PASS — 7/7, Firefox |

---

## Risks

- Playwright HTML DnD simulation gap: real drag-and-drop UX is not covered by automated tests.
- Mock `get_rack_detail` returns a static fixture after drop — no live state update in E2E tests.
- `dataTransfer` MIME type `application/ris-placement` may be filtered by some browser security
  policies in iframes, but this is a desktop app (Tauri WebView) so not a concern in production.

---

## Not Done

- Playwright DnD smoke test (deferred — see implementation notes above).
- Drag-and-drop touch support (not needed for desktop).
- Keyboard alternative for drag-and-drop (not in milestone scope).

---

## Suggested Next Step

Add a Playwright smoke test for drag-and-drop once a reliable approach is confirmed
(e.g. using `page.dispatchEvent` to fire synthetic dragstart/dragover/drop events
with a mocked dataTransfer, or upgrading to Chromium when WSL2 system libs are available).
