# CC Report — feat/hide-technical-code-display-names

## Branch

`feat/hide-technical-code-display-names` — PR E from the BETA1 follow-up plan.

## Summary

Hid technical `code` fields from all user-facing UI and changed device code generation to produce opaque random identifiers (`dev-XXXXXXXX`) instead of sequential predictable ones (`device-01`). CSV device import no longer accepts or uses a `code` column — codes are always auto-generated.

This includes a second pass following reviewer feedback that removed all remaining code fallbacks from UI text, titles, aria-labels, and confirm dialogs across modals, palettes, inspector panels, and the rack diagram.

## Files changed

**Rust backend:**
- `crates/ris-application/src/session.rs` — `generate_device_code()` now produces `dev-XXXXXXXX` (UUID v4-derived 8-char hex); CSV import passes `code: None` to always trigger auto-generation
- `crates/ris-import/src/csv_reader.rs` — removed `"code"` from `KNOWN_COLUMNS`; removed `code` field from `CsvDeviceRowRaw`; CSV with a `code` column now triggers VAL-CSV-002 warning
- `crates/ris-import/src/validator.rs` — removed VAL-CSV-004/005/006 validators (code format/duplicate/exists); removed `dup_codes` computation; removed `CODE_RE` regex
- `crates/ris-import/src/preview.rs` — removed `code: Option<String>` from `CsvDeviceImportPreviewRow`
- `crates/ris-import/Cargo.toml` — removed now-unused `regex = "1"` dependency
- `apps/desktop/src-tauri/src/dto.rs` — removed `code` from `CsvImportPreviewRowDto`
- `apps/desktop/src-tauri/src/commands/repository.rs` — removed `code` from DTO mapping; removed `code` column from `DEVICE_IMPORT_SAMPLE_CSV`; updated column count assertion to 8

**Frontend TypeScript:**
- `apps/desktop/src/api/tauriClient.ts` — removed `code` from `CsvImportPreviewRowDto` interface
- `apps/desktop/src/features/csvImport/csvSample.ts` — removed `code` column from sample CSV
- `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` — removed Code column from preview table; updated schema panel; updated placeholder and help copy
- `apps/desktop/src/features/devices/DevicesPanel.tsx` — removed Code column; Name is now primary bold column with "Unnamed device" fallback; model shown by name
- `apps/desktop/src/features/devices/DeviceFormModal.tsx` — model selector shows `name` only (was `code — name`)
- `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` — removed Code column; Name is now primary
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — removed Code column; Name is now primary
- `apps/desktop/src/features/racks/RacksPanel.tsx` — removed Code column; Name is primary with `"Unnamed rack"` fallback; success/navigation messages use name
- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — device card title/aria-label use name or `"Unnamed device"`; rack object model cards use name or `"Unnamed model"`; removed unused `hiddenCount` variable
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — confirm dialog uses target name or kind-based neutral fallback (`"Unnamed device"` / `"Unnamed object"`)
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — renamed "Code / SN" column to "Serial"; incomplete-row case uses target name or neutral fallback; serial column shows `target_serial`
- `apps/desktop/src/features/racks/rackPlacementLabel.ts` — primary label chain no longer falls back to `target_code`, `model_code`, or `placement.code`; uses `"Unnamed device"` / `"Unnamed object"` instead
- `apps/desktop/src/features/racks/EditPlacementModal.tsx` — subtitle, KV rows, and confirm dialog use target name or neutral fallback; rack shown by name
- `apps/desktop/src/features/racks/PlacePlacementModal.tsx` — subtitle uses rack name; device selector shows device name; rack object selector shows model name
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — subtitle removes rack code and location code; placement inspector desc uses target name or neutral fallback

**Docs:**
- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — marked item 10 / PR E as Implemented

**Tests updated:**
- `crates/ris-import/tests/csv_import_tests.rs` — removed VAL-CSV-004/005/006 tests; added `code_column_triggers_val_csv_002_warning_and_does_not_block_import`
- `crates/ris-application/tests/application_tests.rs` — updated code-prefix assertion; replaced existing-code rejection test; updated VALID_CSV; import tests verify by serial instead of code; formatted by `cargo fmt`
- `crates/ris-application/tests/mvp_smoke_tests.rs` — updated CSV sections; verify imported devices by name/id; formatted by `cargo fmt`
- `apps/desktop/src/features/csvImport/csvSample.test.tsx` — updated EXPECTED_HEADERS; updated column count and index checks
- `apps/desktop/src/features/csvImport/csvImportSummary.test.ts` — removed `code` from test fixture
- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — updated column header test; added code-leakage regression tests
- `apps/desktop/src/features/racks/rackPlacementLabel.test.ts` — updated fallback tests to expect neutral strings instead of codes; added "Unnamed object" test
- `apps/desktop/src/features/racks/PlacementInspectorPanel.test.tsx` — added code-leakage regression describe block (3 tests)
- `apps/desktop/src/features/racks/PlacementPalettePanel.test.tsx` — added code-leakage regression describe block (2 tests)
- `apps/desktop/src/features/racks/RacksPanel.test.tsx` — added code-leakage regression describe block (2 tests)
- `apps/desktop/src/features/racks/EditPlacementModal.test.tsx` — updated subtitle assertion; added code-not-visible assertion
- `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` — updated subtitle assertion to expect rack name not rack code
- `apps/desktop/src/features/devices/DevicesPanel.test.tsx` — **new file**; code-leakage regression tests (4 tests)

## Tests

- `git diff --check` → **clean**
- `node scripts/check-version-consistency.mjs` → **all versions match: 0.1.0-beta.1**
- `node --test scripts/*.test.mjs` → to be run
- `node scripts/check-repo-hygiene.mjs` → **clean** (review context file untracked)
- `cargo fmt --all --check` → **clean**
- `cargo check --workspace` → **clean**
- `cargo test --workspace` → **all passed (144 tests)**
- `cargo clippy --workspace -- -D warnings` → **clean**
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` → **506 passed, 0 failed** (39 files)

## Risks

- Devices created before this PR have sequential `device-XX` codes. Those codes are preserved unchanged (no migration). The new `dev-XXXXXXXX` format applies only to newly created devices.
- Existing CSVs with a `code` column will trigger a VAL-CSV-002 warning; import still proceeds and codes are ignored. This is intentionally non-breaking.
- "Unnamed device" / "Unnamed rack" fallback appears where name is blank. Users previously identified by code will need to assign a name.
- Device selector in PlacePlacementModal now shows name only; if two devices have the same name, they are visually indistinguishable. Names are expected to be unique in practice.

## Not done

- No migration of existing device codes to opaque format (intentional — codes are stable internal identifiers)
- `code` is still present in API DTOs for devices/racks/locations/models — only hidden from display, not removed from the data layer
- GlobalSearch still shows `r.code` in the compact search dropdown — kept as an internal navigation aid

## Suggested next step

Implement PR F (Dirty repository guard) — warn users when closing or switching repos with unsaved changes.
