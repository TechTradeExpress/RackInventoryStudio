# CC Report — feat/hide-technical-code-display-names

## Branch

`feat/hide-technical-code-display-names` — PR E from the BETA1 follow-up plan.

## Summary

Hid technical `code` fields from all user-facing UI and changed device code generation to produce opaque random identifiers (`dev-XXXXXXXX`) instead of sequential predictable ones (`device-01`). CSV device import no longer accepts or uses a `code` column — codes are always auto-generated.

## Files changed

**Rust backend:**
- `crates/ris-application/src/session.rs` — `generate_device_code()` now produces `dev-XXXXXXXX` (UUID v4-derived 8-char hex); CSV import passes `code: None` to always trigger auto-generation
- `crates/ris-import/src/csv_reader.rs` — removed `"code"` from `KNOWN_COLUMNS`; removed `code` field from `CsvDeviceRowRaw`; CSV with a `code` column now triggers VAL-CSV-002 warning
- `crates/ris-import/src/validator.rs` — removed VAL-CSV-004/005/006 validators (code format/duplicate/exists); removed `dup_codes` computation; removed `CODE_RE` regex
- `crates/ris-import/src/preview.rs` — removed `code: Option<String>` from `CsvDeviceImportPreviewRow`
- `crates/ris-import/Cargo.toml` — removed now-unused `regex = "1"` dependency
- `apps/desktop/src-tauri/src/dto.rs` — removed `code` from `CsvImportPreviewRowDto`
- `apps/desktop/src-tauri/src/commands/repository.rs` — removed `code` from DTO mapping; removed `code` column from `DEVICE_IMPORT_SAMPLE_CSV`

**Frontend TypeScript:**
- `apps/desktop/src/api/tauriClient.ts` — removed `code` from `CsvImportPreviewRowDto` interface
- `apps/desktop/src/features/csvImport/csvSample.ts` — removed `code` column from sample CSV
- `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` — removed Code column from preview table; updated schema panel; updated placeholder and help copy
- `apps/desktop/src/features/devices/DevicesPanel.tsx` — removed Code column; Name is now primary bold column with "Unnamed device" fallback; model shown by name
- `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` — removed Code column; Name is now primary
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — removed Code column; Name is now primary
- `apps/desktop/src/features/racks/RacksPanel.tsx` — removed Code column; Name is now primary; location subtitle uses name only
- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — palette card shows `name ?? "Unnamed device"` instead of `code`
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — renamed "Code / SN" column to "Serial"; column now shows only serial number
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — removed "Code" and "Target code" KV rows; confirm dialog uses target name

**Docs:**
- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — marked item 10 / PR E as Implemented

**Tests updated:**
- `crates/ris-import/tests/csv_import_tests.rs` — removed VAL-CSV-004/005/006 tests; added `code_column_triggers_val_csv_002_warning_and_does_not_block_import`; fixed tests using bad code format to use invalid device_type instead
- `crates/ris-application/tests/application_tests.rs` — updated code-prefix assertion; replaced existing-code rejection test; updated VALID_CSV; import tests verify by serial instead of code
- `crates/ris-application/tests/mvp_smoke_tests.rs` — updated CSV sections; verify imported devices by name/id
- `apps/desktop/src/features/csvImport/csvSample.test.tsx` — updated EXPECTED_HEADERS; updated column count and index checks
- `apps/desktop/src/features/csvImport/csvImportSummary.test.ts` — removed `code` from test fixture
- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — updated column header test to expect "Serial"

## Tests

- `cargo test -p ris-import` → **43 passed, 0 failed**
- `cargo test -p ris-application` → **175+ passed across all test suites, 0 failed**
- `cargo build` (Tauri) → **clean**
- `npx vitest run` → **493 passed, 0 failed** (38 files)
- `npx tsc --noEmit` → **0 errors**

## Risks

- Devices created before this PR have sequential `device-XX` codes. Those codes are preserved unchanged (no migration). The new `dev-XXXXXXXX` format applies only to newly created devices.
- Existing CSVs with a `code` column will trigger a VAL-CSV-002 warning; import still proceeds and codes are ignored. This is intentionally non-breaking.
- "Unnamed device" fallback appears where name is blank. Users previously identified by code will need to assign a name.

## Not done

- No migration of existing device codes to opaque format (intentional — codes are stable internal identifiers)
- `code` is still present in API DTOs for devices/racks/locations/models — only hidden from display, not removed from the data layer

## Suggested next step

Implement PR F (Dirty repository guard) — warn users when closing or switching repos with unsaved changes.
