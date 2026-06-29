## Summary

PR #133: feat(import): add Device Model CSV import — and repair of success banner bug.

Adds a full Device Model CSV import workflow parallel to the existing Device
CSV import: preview → validate → apply. The feature includes a new validator
in the `ris-import` crate, application layer methods, three Tauri commands, and
a type-selector toggle in `CsvImportPanel` so users can switch between Device
and Device Model import.

**Repair (fix commit c6a7ede):** The success banner after a successful import
was being cleared immediately because `handleImport()` called the old
`resetState()` which wiped `importSuccess`. Fixed by splitting into
`resetPreviewState()` (clears preview/error only) and `resetAllState()` (also
clears success). Import success now uses `resetPreviewState()`.

## Files changed

| File | Change |
|---|---|
| `crates/ris-import/src/csv_reader.rs` | Added `CsvDeviceModelRowRaw`, `ParsedDeviceModelCsv`, `DEVICE_MODEL_KNOWN_COLUMNS`, `DEVICE_MODEL_REQUIRED_COLUMNS`, `parse_device_model_csv()` |
| `crates/ris-import/src/preview.rs` | Added `CsvDeviceModelImportPreviewRow`, `CsvDeviceModelImportPreview` |
| `crates/ris-import/src/validator_device_model.rs` | New: pure validator implementing VAL-DM-001 through VAL-DM-009 |
| `crates/ris-import/src/lib.rs` | Exported new module, types, and `preview_device_model_csv_import` |
| `crates/ris-import/tests/csv_import_device_model_tests.rs` | New: 43 Rust integration tests (+ rustfmt fix) |
| `crates/ris-application/src/session.rs` | Added `DeviceModelCsvImportResult`, `preview_device_models_csv()`, `import_device_models_csv()` |
| `crates/ris-application/src/lib.rs` | Exported `DeviceModelCsvImportResult` |
| `apps/desktop/src-tauri/src/dto.rs` | Added `CsvDeviceModelImportPreviewRowDto`, `CsvDeviceModelImportPreviewDto` |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Added `preview_device_model_csv_import_cmd`, `import_device_model_csv_cmd`, `write_device_model_import_sample_csv`, `DEVICE_MODEL_IMPORT_SAMPLE_CSV` |
| `apps/desktop/src-tauri/src/commands/mod.rs` | Exported new commands |
| `apps/desktop/src-tauri/src/lib.rs` | Registered 3 new Tauri commands |
| `apps/desktop/src/api/tauriClient.ts` | Added `CsvDeviceModelImportPreviewRowDto`, `CsvDeviceModelImportPreviewDto`, `previewDeviceModelCsvImport()`, `importDeviceModelCsv()`, `saveDeviceModelSampleCsvViaDialog()` |
| `apps/desktop/src/features/csvImport/csvSample.ts` | Added device model sample CSV rows and `saveDeviceModelSampleCsv()` |
| `apps/desktop/src/features/csvImport/csvImportSummary.ts` | Changed parameter to structural typing (`PreviewLike`) so function works with both preview types |
| `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` | Added `importType` state, type selector buttons, conditional schema sidebar and preview table, **success banner fix** (splitresetState) |
| `apps/desktop/src/features/csvImport/CsvImportPanel.test.tsx` | Rewritten mocks; 17 tests including new Devices and Device Models import success regression tests |
| `docs/BETA3_QA_RUNBOOK.md` | Added section 12 (Device Model CSV import, 16 test cases); renumbered old 12 → 13 |

## Validation codes (VAL-DM-xxx)

| Code | Level | Trigger |
|---|---|---|
| VAL-DM-001 | Error | Missing required header (`device_type` or `name`) |
| VAL-DM-002 | Warning | Unknown column (ignored) |
| VAL-DM-003 | Error | Duplicate code within the CSV |
| VAL-DM-004 | Error | Code already exists in repository |
| VAL-DM-005 | Error | `name` is blank |
| VAL-DM-006 | Error | `device_type` is blank |
| VAL-DM-007 | Error | `device_type` is not a known value |
| VAL-DM-008 | Error | `height_u` is not a positive integer |
| VAL-DM-009 | Warning | Tags contain empty segments |

Key difference from device import: `rack_object` IS a valid `device_type` for
device models. No `status` column — device models have no status.

## Tests

```
node scripts/check-version-consistency.mjs   → 0.1.0-beta.2, all match
node scripts/check-repo-hygiene.mjs          → 8/8 checks passed
pnpm -C apps/desktop exec tsc --noEmit       → 0 errors
pnpm -C apps/desktop exec vitest run         → 800 passed, 0 failed (was 789)
vite build                                   → success
cargo fmt --all --check                      → clean
cargo clippy --workspace -- -D warnings      → clean
cargo check (ris-import + ris-application)   → Finished, 0 errors
cargo check (desktop/src-tauri)              → Finished, 0 errors
cargo test -p ris-import                     → 76 passed, 0 failed (33 device + 43 device model)
cargo test (desktop/src-tauri)               → 116 passed, 0 failed
```

## Risks

- Device model `code` uniqueness check uses the same `CsvImportContext` (via
  `get_device_model_by_code` with normalized key). If the index key format ever
  changes, the lookup silently fails. Covered by test `dm_code_conflict_case_insensitive_reports_val_dm_004`.
- The UI is not tested end-to-end in a running Tauri window (manual QA runbook
  section 12 covers this).

## Not done

- PDF export (out of scope for beta.3).
- Import of Device Models with explicit UUIDs (not needed; IDs are always auto-generated).

## Suggested next step

Run manual QA from `docs/BETA3_QA_RUNBOOK.md` section 12 (Device Model CSV
import), confirm all 16 test cases pass, then prepare the beta.3 release PR
(version bump from `0.1.0-beta.2` → `0.1.0-beta.3`, CHANGELOG entry, release
notes).
