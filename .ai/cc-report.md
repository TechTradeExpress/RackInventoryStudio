## Summary

Milestone H QA round — Settings logs directory fixes + Locations row navigation.

Four issues diagnosed and fixed on the `settings/log-directory-ux` branch (PR #83):

1. **"Open logs folder" on WSL (exit 2 error):** `xdg-open` is not available on WSL. The fix detects WSL via `WSL_DISTRO_NAME` env var and `/proc/sys/kernel/osrelease`, converts the Linux path with `wslpath -w`, and opens it with `explorer.exe`. On native Linux without `xdg-open`, a friendly error with the folder path is returned instead of the raw OS error.

2. **`tauri dev` exit 101 after reset:** Root cause — the log plugin was initialised with `TargetKind::LogDir` (lazy path resolution). On WSL, the plugin's internal `app_log_dir()` resolution or directory creation could panic if the XDG data dir was inaccessible. Fix: `lib.rs` now computes the default log directory early (via `resolve_default_log_dir_early()` in `app_config.rs`), pre-creates it, and always uses `TargetKind::Folder` with the pre-computed path. This avoids the lazy resolution that can fail on WSL.

3. **Reset to default always showing restart message:** The success banner always said "Changes will apply after restarting the app." even when the running process was already using the default directory (no restart needed). Fix: `SettingsPanel.tsx` now checks `updated.restart_required` and shows the restart notice only when true.

4. **Locations row navigation:** Previously only the location name text was clickable. Per requirement, the whole row should navigate like a rack row. Fix: `<tr>` now has `role="button"`, `tabIndex={0}`, `aria-label="Open racks for {name}"`, `onClick`, and `onKeyDown` (Enter/Space). The actions cell (`td.tbl-actions`) calls `e.stopPropagation()` so Edit/Delete do not trigger row navigation.

## Files changed

### Rust / Tauri backend
- `apps/desktop/src-tauri/src/app_config.rs` — new `resolve_default_log_dir_early()`: computes default log dir (XDG_DATA_HOME / LOCALAPPDATA / ~/Library/Logs) before AppHandle is available.
- `apps/desktop/src-tauri/src/lib.rs` — uses `resolve_default_log_dir_early()` + pre-creation + `Folder` target instead of `LogDir` at startup.
- `apps/desktop/src-tauri/src/commands/log_settings.rs` — added `is_wsl()`, `wslpath_to_windows()` helpers; updated `open_path_in_file_manager` Linux branch to use explorer.exe on WSL with friendly fallback; uses `ErrorKind::NotFound` for friendly xdg-open missing message.

### Frontend
- `apps/desktop/src/features/settings/SettingsPanel.tsx` — reset success message conditional on `updated.restart_required`.
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — `<tr role="button" tabIndex={0} aria-label="Open racks for {name}" onClick onKeyDown>`; plain name text in Name cell; `stopPropagation` on actions cell.

### Tests
- `apps/desktop/src/features/settings/SettingsPanel.test.tsx` — reset test updated; added "reset shows no restart message when process was already on default" test.
- `apps/desktop/src/features/locations/LocationsPanel.test.tsx` — describe block updated; added "clicking action buttons does not trigger row navigation" test.

### Documentation
- `CHANGELOG.md` — QA round fixes entry.
- `.ai/cc-report.md` — this file.

## Tests

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 442 pass, 34 files (+2 new tests)
playwright test (apps/desktop)                  → 21 pass
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → 34 pass (app_config + repository + other Rust crates)
cargo clippy --workspace -- -D warnings         → clean
```

`pnpm tauri dev` — could not run in this automation environment (pnpm not on PATH). `cargo check --workspace` confirms the Rust code compiles without errors. The startup `LogDir → Folder` change is the primary mitigation for exit 101 on WSL.

## Risks

- **WSL `explorer.exe` availability:** `explorer.exe` is available in WSL 2 (in `$PATH` via `/mnt/c/Windows/System32/`). On WSL 1 or unusual configurations, it may not be available; the error fallback message includes the Linux path so the user can still find the folder.
- **`wslpath` availability:** Present in all mainstream WSL 2 distributions. If absent, the fallback returns a friendly message with the Linux path.
- **`Folder` vs `LogDir` target:** `resolve_default_log_dir_early()` mirrors `tauri-plugin-log`'s own `LogDir` resolution. If Tauri's internal path calculation diverges on an unusual platform, logs would go to `resolve_default_log_dir_early()`'s path; the DTO's `active_log_dir` (from `app.path().app_log_dir()`) would still show the correct expected path. This is the same risk that existed before — now it's explicit and the directory is guaranteed to exist.

## Not done

- Cross-platform integration test for `is_wsl()` (requires WSL environment; pure logic tests cover the edge cases).
- `tauri dev` full startup verification in automation (pnpm not available in this environment; Rust compilation verified via `cargo check`).
- Version bump (excluded per constraints).
- Windows installer workflow changes (excluded per constraints).
- Rack placement logic was not changed.

## Suggested next step

Push to `settings/log-directory-ux`, update PR #83, run CI. Monitor Rust startup on WSL to confirm exit 101 is resolved.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
