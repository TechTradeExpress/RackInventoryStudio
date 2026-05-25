## Summary

Milestone G — Complete rack placement editing workflow. Four functional areas added: (A) drag-to-move for already placed equipment in the rack diagram, (B) rack diagram replaced with a multi-column grid layout (U · Name · Type · Model · Code / SN · U range · St.), (C) "Create new rack object" from the Place equipment modal, (D) "Edit device" / "Edit rack object" from both the Place equipment modal and the placement inspector panel.

**Layout correction (post-initial-review):** The first implementation of Goal B stretched a single "Front"-labelled column to fill width. This was insufficient — the diagram now renders a proper multi-column grid. "Front"/"Rear" is side context shown in hint text above the grid, not a data-column header. The `SideColumn` and `PlacementLabelContent` components were removed entirely. All DnD, click-to-place, and click-to-inspect interactions are preserved in the new row-based layout.

## Files changed

- `apps/desktop/src/features/racks/dndTypes.ts` — added `"placement"` kind to `DndPayload` carrying `placementId`, `startU`, `heightU`, `side`.
- `apps/desktop/src/features/racks/dndHelpers.ts` — `canDropAt` accepts optional `excludePlacementId`; `getPayloadHeight` and `decodeDndPayload` handle `"placement"` kind.
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — complete rewrite: removed `SideColumn`/`PlacementLabelContent` components; new multi-column row-based grid (U · Name · Type · Model · Code/SN · U range · St.); occupied top cells are `draggable`, have `data-testid="placed-${side}-${p.id}"`, show label.primary in Name column and metadata in remaining columns; empty rows have all DnD handlers and `data-testid="drop-cell-${side}-${startU}"`; hint text shows side context; `padding` shorthand replaced with longhand properties to avoid React rerender warning.
- `apps/desktop/src/features/racks/PlacePlacementModal.tsx` — added "Create new rack object…" button and `DeviceModelFormModal` in add mode; "Edit device…" button (opens `DeviceFormModal` in edit mode inline); "Edit rack object…" button (opens `DeviceModelFormModal` in edit mode inline); `localRackObjects` state; `onRackObjectCreated` prop.
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — added `onEditTargetDevice` and `onEditTargetModel` props; "Edit device…" / "Edit rack object…" buttons in action area.
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — imports `movePlacement`, `DeviceFormModal`, `DeviceModelFormModal`; wires `onMovePlacement` handler (`handleDiagramMovePlacement`); wires `onEditTargetDevice` / `onEditTargetModel` with dedicated modal state; passes `onRackObjectCreated` to `PlacePlacementModal`.
- `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx` — `onSaved: () => void` changed to `onSaved: (newModelId?: string) => void`; add-mode path passes the returned ID to `onSaved(newModelId)`.
- `apps/desktop/e2e/mocks/tauri-core.ts` — `move_placement` now moves placement within `dynamicRackDetail`; `place_rack_object` now adds to `dynamicRackDetail`; `add_device_model_cmd`, `update_device_cmd`, `update_device_model_cmd` handlers added; `dynamicDeviceModels` factory + reset; `FIXTURE_NEW_MODEL_ID` constant exported; `list_device_models` now served from `dynamicDeviceModels`.
- `apps/desktop/src/features/racks/dndHelpers.test.ts` — 7 new tests: placement payload round-trip, invalid side decode, `canDropAt` with `excludePlacementId` (4 scenarios), `getPayloadHeight` for placement kind.
- `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` — 9 new tests: create rack object flow (3), edit device button (3), edit rack object button (2), mock setup for `addDeviceModel`.
- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — new file: 16 tests covering column headers (Name present, Front/Rear not present as column headers, additional metadata columns), occupied row (name in Name column, draggable flag, click-to-select), empty row (drop-cell testids, click-to-place, clear selection), side switching.
- `apps/desktop/e2e/smoke.spec.ts` — 3 new E2E tests: drag-to-move placed block, create rack object from place modal, inspector edit device button visibility. "diagram is primary surface" test extended: asserts Name column header visible and placed item renders its label.
- `CHANGELOG.md` — new `## Unreleased — Complete rack placement editing workflow` section.

## Tests

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 420 pass, 33 files (was 404)
playwright test (apps/desktop)                  → 20 pass (was 17)
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → clean
cargo clippy --workspace -- -D warnings         → clean
```

## Risks

- `RackUnitDiagram` is a full rewrite. All direct consumers (`RackDetailPanel`) were checked — the component API (props) is unchanged.
- `DeviceModelFormModal.onSaved` signature change (`newModelId?: string`) is backward-compatible — `DeviceModelsPanel.handleSaved()` takes no args and TypeScript allows calling `onSaved` without an argument when the param is optional.
- The `move_placement` E2E mock updates `end_u` to equal `new_start_u` for simplicity; in real backend the `end_u` is derived from height. This is fine for the E2E assertions which only check placement visibility by ID.
- Multi-column grid layout requires horizontal scroll (`overflowX: auto`) on very narrow panels. Acceptable at standard window sizes.

## Not done

- Cross-rack drag-to-move (not required per spec; cross-rack is explicitly out of scope).
- Drag-to-move across front/rear sides (same-side move is implemented; cross-side is a user risk decision not required per spec).
- Version bump (intentionally excluded per constraints).
- Windows installer workflow changes (excluded per constraints).
- Settings logs folder fix (Milestone H).

## Suggested next step

Create the PR from `ux/rack-placement-editing-workflow` → `master` and run CI. Monitor for any actionlint findings from the existing `workflow-lint` job.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
