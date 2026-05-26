## Summary

Milestone G — Complete rack placement editing workflow, including three QA correction rounds. Four functional areas added: (A) drag-to-move for already placed equipment in the rack diagram, (B) rack diagram multi-column grid layout, (C) "Create new rack object" from the Place equipment modal, (D) "Edit device" / "Edit rack object" from both the Place equipment modal and the placement inspector panel. (E) drag-to-unrack by dropping a placed item onto the Placeable equipment panel.

**QA round 1 corrections:** Replaced single "Front"-labelled column with multi-column grid (U · Name · Model · Code/SN).

**QA round 2 corrections:**
- Removed Type, U range, and St. columns.
- U column shows full U range for multi-U placements (e.g. "U10–U12"); 1U shows "U10".
- All cells center-aligned. Drag handle moved to Name cell only.
- Drag-to-unrack implemented: drop placed item on Placeable equipment panel.

**QA round 3 corrections (this session):**
- **U column as separate rack-unit cells:** The U column is now a dedicated gutter rendered independently of placement content. Each rack unit always has its own 22 px cell showing `U{n}`. For multi-U placements the gutter shows individual cells (U11, U10, …) — no merged range text. The merged range string is used only in tooltips via `label.uRange`.
- **Selection does not include U gutter:** Selection ring (`box-shadow: inset 0 0 0 2px #ffd700`) and occupied background apply only to the placed equipment content card. The U gutter cells are always neutral (`#f0f0f0` / `#888`).
- **Placed item drag source is the content card:** The entire placed equipment card (Name / Model / Code SN / Asset tag) is the draggable element with `data-testid="placed-${side}-${p.id}"`. The U gutter cell has no `draggable` attribute and is excluded from the drag source.
- **Custom drag image:** On drag-start, a palette-card–style element is created off-screen (`position: absolute; left: -9999px`), set via `e.dataTransfer.setDragImage()`, then removed via `requestAnimationFrame`. The image shows occupied blue background, ⠿ icon, label, and U count — analogous to placeable palette cards.
- **Asset tag column added:** Fifth content column "Asset tag" shows `p.target_asset_tag ?? "—"`. Code/SN column no longer falls back to asset tag (it has its own column).
- **Layout:** Two-section layout: fixed-width U gutter (60 px) on the left; flex content area (Name flex-2 / Model flex-1 / Code SN flex-1 / Asset tag flex-1) on the right. Both sections share the same scroll container. Occupied placement cards in the content area span `effectiveHeightU × 22 px` height; the U gutter always shows one 22 px cell per rack unit — heights align by construction.

## Files changed

- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — complete rewrite: two-section layout (U gutter + content area); U gutter with `data-testid="u-cell-${side}-${startU}"` cells; content card with `data-testid="placed-${side}-${p.id}"` is the draggable element; selection only on content card; custom drag image; Asset tag column; Code/SN no longer falls back to asset tag.
- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — 26 tests (updated): U gutter separate cells, no merged range, selection not on U gutter, content card is draggable, U gutter is not, Asset tag column, column header assertions.
- `apps/desktop/e2e/smoke.spec.ts` — "diagram is primary surface" extended with Asset tag and U gutter cell assertions; drag-to-move extended with U gutter cell assertions; drag-to-unrack extended with U gutter cell assertion.
- `apps/desktop/src/features/racks/dndTypes.ts` — `"placement"` kind (from QA round 2).
- `apps/desktop/src/features/racks/dndHelpers.ts` — `canDropAt` with `excludePlacementId`; `getPayloadHeight` and `decodeDndPayload` for placement kind (from QA round 2).
- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — `onUnplacePlacement` prop; palette drop zone wrapper (from QA round 2).
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — `handleUnplacePlacement` wired to `removePlacement` (from QA round 2).
- `apps/desktop/src/features/racks/PlacePlacementModal.tsx` — "Create new rack object…", "Edit device…", "Edit rack object…" buttons.
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — "Edit device…" / "Edit rack object…" buttons.
- `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx` — `onSaved: (newModelId?: string) => void`.
- `apps/desktop/e2e/mocks/tauri-core.ts` — `remove_placement` marks device `is_placed: false`; `move_placement` moves in-place; `place_rack_object` adds to dynamic detail; `add_device_model_cmd`, `update_device_cmd`, `update_device_model_cmd` handlers.
- `apps/desktop/src/features/racks/dndHelpers.test.ts` — 7 new tests.
- `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` — 9 new tests.
- `apps/desktop/src/features/racks/PlacementPalettePanel.test.tsx` — 6 tests for palette drop zone.
- `CHANGELOG.md` — updated Milestone G entry.

## Tests

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 436 pass, 34 files
playwright test (apps/desktop)                  → 21 pass
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → clean
cargo clippy --workspace -- -D warnings         → clean
actionlint                                      → not available locally; CI workflow-lint job validates
```

Hygiene confirmations:
- no `apps/desktop/package-lock.json` tracked
- no `.ai/review-context-*.md` tracked (gitignored)
- no `.github/workflows/windows-diagnostic-installer.yml`
- no `.ai/windows-diagnostic-installer.md`

## Risks

- **Custom drag image in test environments:** `e.dataTransfer.setDragImage()` and `document.body.appendChild()` are wrapped in `try/catch`. In jsdom, `setDragImage` is a no-op; the off-screen element is still appended to `document.body` but is removed via `requestAnimationFrame`. Tests that fire `dragstart` will hit this path; `requestAnimationFrame` in jsdom runs synchronously in some setups — verified that tests still pass.
- **U gutter / content area height alignment:** Heights align by construction: an N-U placement contributes N×22 px to the U gutter (N individual 22 px cells) and N×22 px to the content area (one card with `height: N × 22`). No explicit CSS synchronization is needed.
- **Drag-to-unrack relies on `_activeDragPayload` singleton** (same as prior rounds). Real browser uses `dataTransfer.getData()`; E2E tests use `setActiveDragPayload` via programmatic drag events.
- **`isInRange` for occupied rows** checks only the top U of the placement — a pre-existing limitation for detecting partial overlaps of dragged payloads. Not changed.

## Not done

- Cross-rack drag-to-move (not required per spec).
- Drag-to-move across front/rear sides (out of scope per spec).
- Version bump (excluded per constraints).
- Windows installer workflow changes (excluded per constraints).
- Settings logs folder fix (Milestone H).

## Suggested next step

Push to `ux/rack-placement-editing-workflow` (PR #82) and run CI. Monitor the `workflow-lint` actionlint job.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
