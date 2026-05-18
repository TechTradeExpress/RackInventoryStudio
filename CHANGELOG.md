# Changelog

## v0.13.0 — Placement move action foundation (milestone 13)

- Added `move_placement` Tauri command: accepts `placement_id`, `new_start_u`, and optional `new_height_u`; delegates to `RepositorySession::move_placement_within_side`; requires an open repository; does not auto-save.
- Added `MovePlacementInputDto` in Rust and `MovePlacementInput` + `movePlacement()` in TypeScript API wrapper.
- `PlacementInspectorPanel` now contains a "Move placement (same side)" form: inputs default to the selected placement's current `start_u` and `height_u`; frontend validates positive integer inputs before calling the command; shows inline error on failure.
- After a successful move, `RackDetailPanel` automatically re-fetches rack detail from the backend, restoring the moved placement as the selected item (or clearing selection if it can no longer be found).
- The diagram, front table, and rear table all update immediately to reflect the new placement position.
- A yellow "unsaved changes" banner appears after any successful move, reminding users to Save via the Validation tab to persist changes to disk. The banner resets when a different rack is selected.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (9 passing), and Vite build pass (168 KB bundle).

## v0.12.0 — Read-only placement inspector (milestone 12)

- Placement cells in `RackUnitDiagram` are now clickable: occupied and incomplete cells select the placement; clicking an empty cell clears the selection.
- Selected placement is visually highlighted in the diagram with a gold ring and a darker background; all U-rows of a multi-U placement show selected state simultaneously.
- Placement table rows in `RackDetailPanel` are now clickable; clicking the selected row again deselects it.
- Selection is shared between the diagram and both placement tables — a click in any one reflects in all.
- Added `PlacementInspectorPanel`: shows an empty-state hint when nothing is selected; when a placement is selected displays all `PlacementDto` fields (code, side, target kind/code/name/ID, device type, start U, end U, explicit/effective height, note, tags) with `—` for null/empty fields.
- `RackDetailPanel` owns `selectedPlacement` state; selection resets when a different rack is selected, when a repository is opened or closed, and when rack detail reloads.
- Side (Front / Rear) is derived in `RackDetailPanel` from the placement's presence in `detail.front` / `detail.rear` — no backend changes required.
- No Rust backend changes; all new logic is pure TypeScript frontend.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest tests (9 passing), and Vite build pass (165 KB bundle).

## v0.11.0 — UX hardening and occupancy tests (milestone 11)

- Added Vitest v2 as the frontend test framework; `pnpm test` runs `vitest run`.
- Added 9 unit tests for `rackOccupancy.ts` covering: empty rack, single-U placement, multi-U grouping with `isTop`, `end_u` derived from `effective_height_u`, incomplete placement (no height, no model), out-of-bounds `start_u` (below/above rack), clamped `end_u`, and overlapping placements.
- `buildOccupancy` now detects overlapping placements and emits a warning naming both placement codes and the conflicting U slot.
- All list panels (`LocationsPanel`, `DevicesPanel`, `DeviceModelsPanel`, `RacksPanel`) clear their data array before each async fetch, eliminating stale rows on repository switch.
- `App.tsx` resets `selectedRack` on successful repository open (previously only reset on close).
- `RackUnitDiagram` diagram grid wrapped in a scroll container (`maxHeight: 60vh`, `overflowY: auto`) so tall racks remain usable without scrolling the whole page.
- Added a Frontend tests step to the CI `frontend` job (runs between TypeScript check and Vite build).
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck and Vite build pass (162 KB bundle).

## v0.10.0 — Read-only rack unit diagram (milestone 10)

- Added `RackUnitDiagram` component — visual column diagram showing front and rear sides, U numbers top to bottom.
- Added `rackOccupancy.ts` helper — derives per-U occupancy from `PlacementDto` data; handles missing `end_u`, clamping out-of-bounds placements, and incomplete height with warnings.
- Occupied U ranges are visually grouped: top cell rendered in a darker shade, label shown at the top cell only.
- Empty, occupied, and incomplete-height slots are colour-coded with a legend.
- Placement cells show `target_code` (or fallback to `target_name`/`code`) and have a tooltip with the full placement code.
- Out-of-bounds or incomplete placements surface warnings beneath the diagram — do not crash the UI.
- `RackDetailPanel` now renders: metadata table → rack diagram → front/rear placement detail tables.
- No Rust backend changes — all new logic is pure TypeScript frontend.
- All Rust checks pass (222 tests, clippy clean).
- TypeScript typecheck and Vite build pass (161 KB bundle).

## v0.9.0 — Read-only navigation and rack detail (milestone 9)

- Added `DevicesPanel` — lists all devices with code, type, name, status, serial, asset tag, model, placed flag.
- Added `DeviceModelsPanel` — lists all device models with code, type, name, vendor, model number, height.
- Added `Devices` and `Device Models` tabs to the main tab bar (disabled when no repo open).
- Added rack row selection to `RacksPanel`: click a row to select, click again to deselect.
- Added `RackDetailPanel` — shows rack metadata and front/rear placement tables with resolved target info.
- Added `get_rack_detail` Tauri command returning `RackDetailDto` with resolved placements.
- Added `PlacementDto` and `RackDetailDto` backend DTOs; placement target names and codes are resolved from device/device-model indexes.
- Placements sorted by `start_u` ascending within each side.
- Extended `tauriClient.ts` with `PlacementDto`, `RackDetailDto`, and `getRackDetail`.
- Closing a repository resets selected rack state.
- All Rust checks (`cargo fmt`, `cargo clippy -D warnings`, `cargo test`) pass (222 tests green).
- TypeScript typecheck and Vite build pass.

## v0.8.0 — Frontend foundation cleanup (milestone 8)

- Rewrote README to reflect real project state, architecture, and capabilities.
- Added CHANGELOG (this file).
- Updated CI to trigger on both `main` and `master` branches.
- Added frontend CI job: pnpm install, TypeScript check, Vite build.
- Added `typecheck` script to desktop package.json.
- Added four read-only Tauri commands: `list_locations`, `list_racks`, `list_devices`, `list_device_models`.
- Added corresponding DTOs: `LocationDto`, `RackSummaryDto`, `DeviceDto`, `DeviceModelDto`.
- Extended TypeScript API layer (`tauriClient.ts`) with new types and invoke wrappers.
- Refactored monolithic `App.tsx` into tab-based layout with dedicated feature panels:
  - `RepositoryPanel` — open/close/summary
  - `ValidationPanel` — validate/save/issues
  - `LocationsPanel` — locations list
  - `RacksPanel` — racks list
- Added shared `TabBar` component and common styles module.
- Updated `build-review-context.sh` to default to a timestamped output filename.
- Updated `CLAUDE.md` AI instructions to document timestamped review-context handoff.
- Repomix output now saved to `repomix/` directory with timestamped filename.

## v0.7.0 — Minimal Tauri shell (milestone 7)

- Native repository folder picker via `tauri-plugin-dialog`.
- Tauri commands: open, save, validate, close repository.
- React UI: repository summary, validation panel, save/close controls.

## v0.6.0 — Application layer (milestones 6A + 6B)

- `ris-application`: `RepositorySession` — open, save, validate.
- Add location, rack, device model, device mutations with full validation.
- Global cross-entity duplicate ID enforcement.
- Placement use cases: place_device, place_rack_object, move_placement_within_side, remove_placement.
- Collision detection (same-side only), bounds checking, effective height resolution.
- `no-placement-files-repository` test fixture.

## v0.5.0 — YAML writer (milestone 5)

- `ris-repository`: `write_repository` preserving original file paths via `RepositoryLayout`.
- Idempotent writes: Created / Updated / Unchanged per file.
- Write-back safety tests with non-canonical fixture.

## v0.4.0 — CSV import preview (milestone 4)

- `ris-import`: `preview_csv_import` — read-only, never writes.
- VAL-CSV-001 through VAL-CSV-019 validators.

## v0.3.0 — Validation engine (milestone 3)

- `ris-validation`: `ValidationEngine` with 36 VAL-* rules.
- Tolerant `load_raw` in `ris-repository` — never fails, collects issues.

## v0.2.0 — YAML loader + index (milestone 2)

- `ris-repository`: strict `load`, `RepositoryIndex` with by-id and by-code lookups.

## v0.1.0 — Core domain (milestone 1)

- `ris-core`: Device, DeviceModel, DeviceType, DeviceStatus, Location, Rack, Placement, PlacementFile, PlacementRange, PlacementSide, ValidationIssue, RepositoryMetadata.

## v0.1.0-planning

- Initial project documentation.
- Data model v0.1.
- Validation and CSV specification.
- User workflows, UI screen specification, architecture specification, technology stack decision, implementation plan.
- Coding starter structure.
