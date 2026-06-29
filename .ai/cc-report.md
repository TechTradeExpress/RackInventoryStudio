## Summary

PR 13 repair: stabilized log diagnostics state, hardened date validation, improved open-logs error messages.

### Original PR (1d8e61d)
- Daily log files via `ris-YYYY-MM-DD.log` filename stem.
- 30-day retention cleanup on startup.
- Extended `LogSettingsDto` with `dir_exists`, `dir_writable`, `current_log_filename`, `retention_days`.

### Repair commit (this commit)

**1. `current_log_filename` — frozen at startup, not recalculated from the clock**

Problem: `build_dto()` previously called `daily_log_filename()` on every invocation. After midnight UTC, the Settings panel would show tomorrow's filename while the session still writes to the startup file.

Fix: Added `filename: String` to `ActiveLogState`. In `lib.rs`, `daily_log_filename()` is called once at startup; both `file_name: Some(log_filename_stem)` and `ActiveLogState { filename }` use that single computed value. `build_dto()` now reads `current_log_filename` from managed state via `active_log_filename_from_state()`.

**2. `open_logs_directory` — improved error messages**

Extracted `format_open_logs_error(path, io_err)` helper. All IO errors (not just `NotFound`) now include the folder path in the message. `NotFound` maps to a user-readable "system file manager is not available" message instead of the raw OS error string. Directories and macOS/WSL paths unchanged.

**3. Date validation hardening — `is_valid_ymd`**

Added `is_valid_ymd(y, m, d) -> bool` which validates full Gregorian calendar dates including:
- Month bounds (1–12)
- Per-month day counts (31/30/28/29)
- Leap year check for February 29

`parse_ris_log_date_secs` now uses `is_valid_ymd` instead of the previous loose `1..=31` guard. `cleanup_old_log_files` now skips directories even if their name matches the log pattern.

**4. `reset_logs_directory` — verified correct**

Reviewed: reset clears `custom_log_dir` in `AppConfig`, does not touch any log files, and `build_dto()` correctly reflects `restart_required` based on whether the active session dir matches the newly persisted (default) dir. No changes needed.

## Files changed

| File | Change |
|---|---|
| `src-tauri/src/app_config.rs` | `ActiveLogState` gains `filename` field; `is_valid_ymd` helper; `parse_ris_log_date_secs` uses it; `cleanup_old_log_files` skips dirs; 10 new tests |
| `src-tauri/src/commands/log_settings.rs` | `active_log_filename_from_state()` helper; `build_dto` reads from state; `format_open_logs_error` helper; 3 new tests |
| `src-tauri/src/lib.rs` | Computes `log_filename_stem` + `log_filename` once; stores both in `ActiveLogState` |

## Tests

```
cargo test          → 116 passed, 0 failed  (+12 vs original PR)
npx tsc --noEmit    → 0 errors
npx vitest run      → 789 passed, 0 failed
npx vite build      → success
cargo clippy        → 0 warnings
cargo fmt --check   → clean
node scripts/check-version-consistency.mjs → 0.1.0-beta.2, all match
node --test scripts/*.test.mjs             → 19 passed, 0 failed
node scripts/check-repo-hygiene.mjs        → 8/8 checks passed
```

## Risks

- `active_log_filename_from_state` returns `""` if no `ActiveLogState` is registered (fallback for tests without a real Tauri runtime). The UI would show an empty current_log_filename in that edge case.
- Cleanup still runs before the logger is fully open; warn output from cleanup goes to stdout only on that first log.

## Not done

- Configurable retention period (still hardcoded at 30 days; DTO exposes it read-only).
- Mid-session log rotation (app must restart to adopt a new date-stamped filename).

## Suggested next step

Consider a follow-up (PR14a) to let users adjust the retention window from the Settings panel (persist in `AppConfig`, validate min 14 days).

## Version / tag / release

Version unchanged (0.1.0-beta.2). No tags created. No GitHub Release created.
