## Summary

PR 13: Improved daily log file rotation, log retention cleanup, and enhanced diagnostics for the Settings panel.

- **Daily log files**: tauri-plugin-log is now configured with `file_name: Some(daily_log_filename())` producing `ris-YYYY-MM-DD.log` instead of a single unbounded file. Each app session that starts on a new day writes to a fresh file.
- **Log retention**: On startup, `cleanup_old_log_files()` deletes `ris-YYYY-MM-DD.log` files older than 30 days from the active log directory. Non-RIS files are never touched.
- **Enhanced diagnostics**: `LogSettingsDto` gained four new fields — `dir_exists`, `dir_writable`, `current_log_filename`, `retention_days` — surfaced in the Settings panel.
- **No new crate dependencies**: date math is implemented with a pure Rust stdlib algorithm (Gregorian civil calendar), no chrono or time crate required.

## Files changed

| File | Change |
|---|---|
| `src-tauri/src/app_config.rs` | Added `LOG_RETENTION_DAYS`, `LOG_FILE_PREFIX` constants; `unix_secs_to_ymd`, `ymd_to_unix_secs`, `daily_log_filename`, `cleanup_old_log_files`, `parse_ris_log_date_secs` helpers; 13 new unit tests |
| `src-tauri/src/commands/log_settings.rs` | Added `dir_exists`, `dir_writable`, `current_log_filename`, `retention_days` to `LogSettingsDto`; `build_dto` now populates them |
| `src-tauri/src/lib.rs` | Calls `cleanup_old_log_files` at startup; passes `Some(daily_log_filename())` to Folder target |
| `src/api/tauriClient.ts` | Added four new fields to `LogSettingsDto` interface |
| `src/features/settings/SettingsPanel.tsx` | Displays dir status (exists/writable), current log filename, retention days |
| `src/features/settings/SettingsPanel.test.tsx` | Updated fixture with new fields; 5 new tests for dir status variants, log filename, retention days |

## Tests

```
cargo test          → 104 passed, 0 failed
npx tsc --noEmit    → 0 errors
npx vitest run      → 789 passed, 0 failed
npx vite build      → success
cargo clippy        → 0 warnings
cargo fmt --check   → clean
```

## Risks

- Daily log filename uses UTC date. A session that spans midnight UTC will write all logs to the file named for the day the session started — this is by design and consistent.
- Log cleanup runs at startup before the Tauri logger is open. Any errors in cleanup are emitted via `log::warn!` which goes only to stdout on that first message (logger not yet attached). This is acceptable for a non-critical housekeeping step.
- `cleanup_old_log_files` uses midnight-UTC date comparison. Files from exactly 30 days ago survive; deletion starts at 31 days.

## Not done

- Configurable retention period (the 30-day constant is hardcoded; the DTO exposes it read-only for now).
- Mid-session log rotation (if the app runs past midnight, the date-stamped filename does not change until next restart).

## Suggested next step

Add an editable retention field in Settings to let users adjust the window (persisted in `AppConfig`, plumbed through `cleanup_old_log_files`).
