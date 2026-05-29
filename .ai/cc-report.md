# CC Report — feat/hide-technical-code-display-names

## Branch

`feat/hide-technical-code-display-names` — PR E from the BETA1 follow-up plan.

## Summary

Hid technical `code` fields from all user-facing UI and changed device code generation to produce opaque random identifiers (`dev-XXXXXXXX`) instead of sequential predictable ones (`device-01`). CSV device import no longer accepts or uses a `code` column — codes are always auto-generated.

Two rounds of fixes were applied:
1. First pass: removed Code columns from all panels, changed display name fallbacks to neutral strings (`"Unnamed device"`, `"Unnamed rack"`, etc.), removed code from palette cards and inspector confirm dialogs.
2. Second pass (reviewer feedback): removed remaining `?? *.code` fallbacks across all modals and the rack diagram; fixed `rackPlacementLabel` fallback chain; fixed `GlobalSearch` to show display names instead of `r.code` (both frontend rendering and backend label/detail generation).

## Files changed

**Rust backend:**
- `crates/ris-application/src/session.rs` — `generate_device_code()` now produces `dev-XXXXXXXX` (UUID v4-derived 8-char hex); CSV import passes `code: None` to always trigger auto-generation
- `crates/ris-application/src/search.rs` — `SearchResult` labels now use display names with neutral fallbacks (`"Unnamed device"`, `"Unnamed rack"`, `"Unnamed location"`, `"Unnamed model"`); rack detail uses location name; placement label uses target device/model name; placement detail uses rack name — no codes appear in labels or details
- `crates/ris-import/src/csv_reader.rs` — removed `"code"` from `KNOWN_COLUMNS`; removed `code` field from `CsvDeviceRowRaw`; CSV with a `code` column now triggers VAL-CSV-002 warning
- `crates/ris-import/src/validator.rs` — removed VAL-CSV-004/005/006 validators; removed `dup_codes` computation; removed `CODE_RE` regex
- `crates/ris-import/src/preview.rs` — removed `code: Option<String>` from `CsvDeviceImportPreviewRow`
- `crates/ris-import/Cargo.toml` — removed now-unused `regex = "1"` dependency
- `apps/desktop/src-tauri/src/dto.rs` — removed `code` from `CsvImportPreviewRowDto`
- `apps/desktop/src-tauri/src/commands/repository.rs` — removed `code` from DTO mapping; removed `code` column from `DEVICE_IMPORT_SAMPLE_CSV`; updated column count assertion to 8

**Frontend TypeScript:**
- `apps/desktop/src/api/tauriClient.ts` — removed `code` from `CsvImportPreviewRowDto` interface
- `apps/desktop/src/features/csvImport/csvSample.ts` — removed `code` column from sample CSV
- `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` — removed Code column from preview table; updated schema panel and help text
- `apps/desktop/src/features/devices/DevicesPanel.tsx` — removed Code column; Name is primary with `"Unnamed device"` fallback; model shown by name
- `apps/desktop/src/features/devices/DeviceFormModal.tsx` — model selector shows `name` only (was `code — name`)
- `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` — removed Code column; Name is primary
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — removed Code column; Name is primary
- `apps/desktop/src/features/racks/RacksPanel.tsx` — removed Code column; Name is primary with `"Unnamed rack"` fallback; success/navigation messages use name
- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — device card title/aria-label use name or `"Unnamed device"`; rack object model cards use name or `"Unnamed model"`; removed unused `hiddenCount` variable
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — confirm dialog uses target name or kind-based neutral fallback
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — renamed "Code / SN" column to "Serial"; incomplete-row case uses name fallback; serial column shows `target_serial`
- `apps/desktop/src/features/racks/rackPlacementLabel.ts` — primary label chain no longer falls back to `target_code`, `model_code`, or `placement.code`; uses `"Unnamed device"` / `"Unnamed object"` instead
- `apps/desktop/src/features/racks/EditPlacementModal.tsx` — subtitle, KV rows, and confirm dialog use target name or neutral fallback; rack shown by name
- `apps/desktop/src/features/racks/PlacePlacementModal.tsx` — subtitle uses rack name; device/model selectors show names
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — subtitle removes rack code and location code; placement inspector desc uses target name or neutral fallback
- `apps/desktop/src/features/search/GlobalSearch.tsx` — removed `r.code` span entirely; shows `r.label` (display name) as primary identifier; `r.detail` provides non-technical context

**Docs:**
- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — marked item 10 / PR E as Implemented

**Tests:**
- `crates/ris-import/tests/csv_import_tests.rs` — removed VAL-CSV-004/005/006 tests; added `code_column_triggers_val_csv_002_warning_and_does_not_block_import`
- `crates/ris-application/tests/application_tests.rs` — updated code-prefix assertion; replaced existing-code rejection test; updated VALID_CSV; import tests verify by serial
- `crates/ris-application/tests/mvp_smoke_tests.rs` — updated CSV sections; verify imported devices by name/id
- `crates/ris-application/tests/search_tests.rs` — updated `placement_detail_contains_rack_name_and_side_and_start_u` (was `rack_code`); added `placement_label_is_target_device_name_not_code` and `placement_label_does_not_contain_placement_code`
- `apps/desktop/src/features/csvImport/csvSample.test.tsx` — updated EXPECTED_HEADERS; updated column count checks
- `apps/desktop/src/features/csvImport/csvImportSummary.test.ts` — removed `code` from test fixture
- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — updated column header test; added code-leakage regression tests
- `apps/desktop/src/features/racks/rackPlacementLabel.test.ts` — updated fallback tests to expect neutral strings; added "Unnamed object" test
- `apps/desktop/src/features/racks/PlacementInspectorPanel.test.tsx` — added code-leakage regression describe block (3 tests)
- `apps/desktop/src/features/racks/PlacementPalettePanel.test.tsx` — added code-leakage regression describe block (2 tests)
- `apps/desktop/src/features/racks/RacksPanel.test.tsx` — added code-leakage regression describe block (2 tests)
- `apps/desktop/src/features/racks/EditPlacementModal.test.tsx` — updated subtitle assertion; added code-not-visible assertion
- `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` — updated subtitle assertion to expect rack name not rack code
- `apps/desktop/src/features/devices/DevicesPanel.test.tsx` — **new file**; code-leakage regression tests (4 tests)
- `apps/desktop/src/features/search/GlobalSearch.test.tsx` — **new file**; code-leakage regression tests (8 tests, all major entity kinds)

## Tests

- `git diff --check` → **clean**
- `node scripts/check-version-consistency.mjs` → **✓ all versions match: 0.1.0-beta.1**
- `node --test scripts/*.test.mjs` → **17 passed, 0 failed**
- `node scripts/check-repo-hygiene.mjs` → **8/8 checks passed**
- `cargo fmt --all --check` → **clean**
- `cargo check --workspace` → **clean**
- `cargo test --workspace` → **all passed (151 tests across all crates)**
- `cargo clippy --workspace -- -D warnings` → **clean**
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **517 passed, 0 failed** (40 files)

## Risks

- Devices created before this PR have sequential `device-XX` codes. Those codes are preserved unchanged (no migration). The new `dev-XXXXXXXX` format applies only to newly created devices.
- Existing CSVs with a `code` column will trigger a VAL-CSV-002 warning; import still proceeds and codes are ignored. This is intentionally non-breaking.
- "Unnamed device" / "Unnamed rack" fallback appears where name is blank. Users previously identified by code will need to assign a name.
- Device selector in PlacePlacementModal shows name only; devices with identical names are visually indistinguishable in the dropdown.

## Not done

- No migration of existing device codes to opaque format (intentional — codes are stable internal identifiers)
- `code` is still present in API DTOs for devices/racks/locations/models — only hidden from display, not removed from the data layer

## Suggested next step

Implement PR F (Dirty repository guard) — warn users when closing or switching repos with unsaved changes.
