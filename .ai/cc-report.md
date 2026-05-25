## Summary

Milestone G — Complete rack placement editing workflow, including QA corrections. Four functional areas added: (A) drag-to-move for already placed equipment in the rack diagram, (B) rack diagram multi-column grid layout (QA-corrected from initial implementation), (C) "Create new rack object" from the Place equipment modal, (D) "Edit device" / "Edit rack object" from both the Place equipment modal and the placement inspector panel. (E) drag-to-unrack by dropping a placed item onto the Placeable equipment panel.

**Layout correction (post-initial-review, QA round 1):** First implementation stretched a single "Front"-labelled column. Corrected to a multi-column grid (U · Name · Type · Model · Code/SN · U range · St.).

**QA round 2 corrections:**
- Removed Type, U range, and St. columns — diagram grid is now U · Name · Model · Code/SN.
- U column shows full U range for multi-U placements (e.g. "U10–U12"); single U for 1U.
- All cells center-aligned (vertically and horizontally).
- Drag handle moved from full row to Name cell only — U cell is static and excluded from drag ghost.
- Drag-to-unrack implemented: drag an existing placement from the rack diagram and drop it onto the Placeable equipment panel to remove the placement.

## Files changed

- `apps/desktop/src/features/racks/dndTypes.ts` — added `"placement"` kind to `DndPayload`.
- `apps/desktop/src/features/racks/dndHelpers.ts` — `canDropAt` accepts optional `excludePlacementId`; `getPayloadHeight` and `decodeDndPayload` handle `"placement"` kind.
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — complete rewrite: four-column grid (U · Name · Model · Code/SN); U column shows `label.uRange` for placed rows (full range for multi-U) and `U${n}` for empty rows; drag handle on Name cell (testid `placed-${side}-${p.id}`) only — outer row has `placed-row-${side}-${p.id}` and is not draggable; cells center-aligned; `padding` shorthand replaced with longhand to avoid React Firefox warning.
- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — new `onUnplacePlacement` prop; outer div wraps Panel as a drop zone with `data-testid="palette-drop-zone"`, accepts `"placement"` payload drops, shows "Drop here to unplace" hint, calls `onUnplacePlacement(placementId)` on drop.
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — imports `removePlacement`; adds `handleUnplacePlacement(placementId)` that calls `removePlacement`, clears selection if removed placement was selected, then `refreshAfterMutation({ selectId: null, bumpTargets: true })`; passes `onUnplacePlacement` to `PlacementPalettePanel`.
- `apps/desktop/src/features/racks/PlacePlacementModal.tsx` — "Create new rack object…", "Edit device…", "Edit rack object…" buttons; `onRackObjectCreated` prop.
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — "Edit device…" / "Edit rack object…" buttons.
- `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx` — `onSaved: (newModelId?: string) => void`.
- `apps/desktop/e2e/mocks/tauri-core.ts` — `remove_placement` now marks the removed device as `is_placed: false` in `dynamicDevices` so it re-appears in palette; `move_placement` moves in-place; `place_rack_object` adds to dynamic detail; handlers for `add_device_model_cmd`, `update_device_cmd`, `update_device_model_cmd`; `dynamicDeviceModels` factory + reset; `FIXTURE_NEW_MODEL_ID` exported.
- `apps/desktop/src/features/racks/dndHelpers.test.ts` — 7 new tests.
- `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` — 9 new tests.
- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — 21 tests (updated): column layout, U range, drag handle on Name cell / U cell not draggable, click handlers, side switching.
- `apps/desktop/src/features/racks/PlacementPalettePanel.test.tsx` — new file: 6 tests for drop zone (accepts placement, rejects device/rack_object, no-op cases).
- `apps/desktop/e2e/smoke.spec.ts` — 4 new E2E tests: drag-to-move, create rack object, inspector edit device, drag-to-unrack. "diagram is primary surface" test extended; palette heading selector updated to `getByRole` to avoid ambiguity with hint text.
- `CHANGELOG.md` — updated Milestone G entry.

## Tests

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 431 pass, 34 files
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

- Drag handle on Name cell: `data-testid="placed-${side}-${p.id}"` is on the Name cell (a child of the outer row). Click events bubble up to the row's `onClick`. E2E and unit tests verified. The outer row has `data-testid="placed-row-${side}-${p.id}"` if needed for future tests.
- Drag-to-unrack in E2E relies on `_activeDragPayload` singleton (same pattern as drag-to-move and palette-to-diagram drag). In the real browser, `dataTransfer.getData()` is the primary path; `getActiveDragPayload()` is the fallback used in all E2E tests.
- After unplace, `PlacementPalettePanel` refreshes via `reloadToken` bump. The mock correctly sets `is_placed: false` for device placements; rack_object removals have no device to update.
- U column width increased from 36px to 60px to accommodate "U42–U42" range text.

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
