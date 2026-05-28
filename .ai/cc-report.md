# CC Report — fix/beta1-height-override-import-summary

## Summary

Two beta QA bugs fixed:

1. **Clear height override** (`height_u: null` had no effect): Both `move_placement_within_side` and `move_placement` in `session.rs` silently ignored a `None` for `new_height_u` by falling back to the existing stored value. The fallback is removed. `None` now directly clears the stored override; the model default is used only for the bounds-check, not for persistence.

2. **CSV import summary warning-row count** (`warning_count` counted issues, not rows, and included file-level warnings): Renamed field to `warning_rows` throughout the stack (Rust struct, DTO, TypeScript). Computation changed to count *rows* with ≥1 warning issue (not individual issues); file-level warnings excluded. Frontend `deriveCsvImportUiSummary` updated with consistent semantics; UI copy updated to "Rows with at least one warning".

## Files changed

| File | Change |
|---|---|
| `crates/ris-application/src/session.rs` | Removed `or(existing_height_u)` fallback in both move functions; `p.height_u = input.new_height_u` |
| `crates/ris-application/tests/application_tests.rs` | 4 new tests: clear via `move_placement_within_side`, persists to disk, fails without model, clear via `move_placement` |
| `crates/ris-import/src/preview.rs` | `warning_count` → `warning_rows`; doc comment updated |
| `crates/ris-import/src/validator.rs` | Summary computation uses `filter(any warning).count()` over rows; early-exit paths set `warning_rows: 0` |
| `crates/ris-import/tests/csv_import_tests.rs` | 5 new summary tests covering counts, row-vs-issue distinction, file-level exclusion, early exit |
| `apps/desktop/src-tauri/src/dto.rs` | `CsvImportSummaryDto.warning_count` → `warning_rows` |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Updated field mapping in `preview_csv_import` |
| `apps/desktop/src/api/tauriClient.ts` | `CsvImportSummaryDto.warning_count` → `warning_rows` |
| `apps/desktop/src/features/csvImport/csvImportSummary.ts` | `warningRows` = all rows with ≥1 warning; `cleanRows` = importable rows with no warning |
| `apps/desktop/src/features/csvImport/csvImportSummary.test.ts` | Updated/added 5 tests for new semantics |
| `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` | UI copy: "Rows with at least one warning (may overlap with Skipped)" |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | Items 4 and 5 marked IMPLEMENTED |
| `CHANGELOG.md` | Two entries under Unreleased - Fixed |

## Tests

```
cargo fmt --all --check     — OK
cargo check --workspace     — OK
cargo test --workspace      — all pass (0 failures)
cargo clippy --workspace -- -D warnings  — OK (0 errors)
tsc --noEmit                — OK
vitest run                  — 461 passed (35 test files)
playwright test             — 21 passed
```

## Risks

- **`EffectiveHeightMissing` now reachable via clear**: If a placement was placed using its own override and the model has no `default_height_u`, calling `move_placement` with `new_height_u: None` will return `EffectiveHeightMissing`. This is correct behaviour (you cannot clear an override if there is no model default to fall back to), but the frontend should handle this error gracefully. Current frontend does not surface a specific message for this case.
- **`warning_rows` vs `warning_count` rename**: All callers have been updated. If any external tooling read the old `warning_count` key from the DTO, it would silently receive `undefined`. No such callers exist today.

## Not done

- Persistent credential vault or HTTPS token management (out of scope, tracked separately).
- Frontend: dedicated error message for `EffectiveHeightMissing` when the user tries to clear an override on a model-less placement.
- BETA1_FOLLOWUP_PLAN items 6 (dirty repository guard) and 2 (SSH passphrase) are unrelated and tracked on their own branches.

## Suggested next step

Add a user-friendly frontend error handler for `EffectiveHeightMissing` in the placement inspector so that clearing an override on a model-less placement shows a guided message instead of a generic toast.

## Manual QA checklist

**Height override clear:**
1. Open a project with at least one rack that has a device placement.
2. In the placement inspector, set a height override (e.g. 3U).
3. Verify the rack slot updates to 3U.
4. Click "Reset to model default" (or equivalent).
5. Verify the rack slot reverts to the model default height.
6. Close and reopen the project. Confirm the cleared override persisted (model default still shown, no stored override).

**CSV import summary:**
1. Import a CSV file with: 2 valid rows, 1 row with a malformed tags value (VAL-CSV-019 warning), 1 row with a missing identity field (error).
2. In the preview panel verify: Total = 4, Will create = 3, Warnings = 1, Skipped = 1.
3. Confirm "Warnings" label reads "Rows with at least one warning (may overlap with Skipped)".
4. Import a CSV with an unknown column header (VAL-CSV-002 file warning) and a single clean row. Confirm warningRows = 0.
