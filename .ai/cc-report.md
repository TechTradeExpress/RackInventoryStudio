## Summary

Milestone H QA repair (second round) — WSL startup permission panic + Locations keyboard propagation.

Two issues diagnosed and fixed on the `settings/log-directory-ux` branch (PR #83):

1. **WSL startup panic `PluginInitialization("log", "Permission denied (os error 13)")`:** The previous fix switched from `TargetKind::LogDir` to `TargetKind::Folder` with a pre-created path, but `create_dir_all` errors were silently discarded (`let _ = ...`). If the resolved directory existed but was unwritable, `tauri-plugin-log` would throw a `PluginInitialization` error caught by `.expect(...)` and panic. Fix: three new helpers in `app_config.rs` — `is_dir_writable` (probe-file write), `prepare_log_dir_candidate` (create + verify writable), and `resolve_startup_log_dir` (cascades: custom dir → platform default → OS temp dir). `lib.rs` now calls `resolve_startup_log_dir` and passes the validated directory. `ActiveLogState.dir` is now a plain `PathBuf` (not `Option`) since the startup path is always fully resolved.

2. **Locations row keyboard propagation:** Pressing Enter/Space while focused on an action button (Edit, Delete) bubbled the `keydown` event to the `<tr>` `onKeyDown` handler and triggered `onManageRacks`. Fix: guard added — `e.target !== e.currentTarget` check ensures the filter only applies to bubbled events from child elements, then `target.closest('button, a, input, ..., [role="button"]')` catches interactive children. Pressing Enter/Space directly on the row still navigates correctly.

## Files changed

### Rust / Tauri backend
- `apps/desktop/src-tauri/src/app_config.rs` — added `is_dir_writable`, `prepare_log_dir_candidate`, `resolve_startup_log_dir`; changed `ActiveLogState.dir` from `Option<PathBuf>` to `PathBuf`; updated `get_active_logs_dir()` to unconditionally return `state.dir.clone()`; removed superseded `resolve_startup_custom_log_dir` and its 7 tests (replaced by 10 more thorough tests for the new helpers).
- `apps/desktop/src-tauri/src/lib.rs` — replaced startup log dir computation with `resolve_startup_log_dir` call; removed `create_dir_all` silent discard; updated `ActiveLogState` construction; cleaned unused imports.

### Frontend
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — `onKeyDown` guard: `e.target !== e.currentTarget && target.closest(interactive_selectors)` prevents action-button keyboard events from triggering row navigation.

### Tests
- `apps/desktop/src-tauri/src/app_config.rs` — 10 new Rust tests: `writable_temp_dir_returns_true`, `file_path_as_dir_returns_false`, `prepare_existing_writable_dir_is_ok`, `prepare_creates_missing_directory`, `prepare_rejects_existing_file`, `prepare_rejects_uncreatable_path`, `startup_log_dir_uses_valid_custom_dir`, `startup_log_dir_skips_invalid_custom_and_falls_back`, `startup_log_dir_without_config_returns_a_writable_dir`.
- `apps/desktop/src/features/locations/LocationsPanel.test.tsx` — 4 new keyboard tests: Enter on row navigates, Space on row navigates, Enter on action button does not navigate, Space on action button does not navigate.

### Documentation
- `CHANGELOG.md` — repair-round entry added above the QA-round entry.
- `.ai/cc-report.md` — this file.

## Tests

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 446 pass, 34 files (+4 new keyboard tests)
playwright test (apps/desktop)                  → 21 pass
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → 36 pass in desktop crate (+3 net: removed 7 old, added 10 new)
cargo clippy --workspace -- -D warnings         → clean
```

`pnpm tauri dev` — could not run in this automation environment (pnpm not on PATH). `cargo check --workspace` confirms the Rust code compiles without errors. The writability probe prevents handing an unwritable path to `tauri-plugin-log`.

## Risks

- **Probe file cleanup:** `is_dir_writable` removes the probe file on success; on failure the file does not exist (write failed). No leftover files.
- **Temp dir fallback:** If both the custom dir and the platform default are unwritable (very unusual), `tauri-plugin-log` receives the temp dir path. The log plugin may still fail if the temp dir itself is unwritable; in that case the plugin will emit its own diagnostic error rather than the app panicking with a generic startup error.
- **`resolve_startup_custom_log_dir` removal:** That function was only used in `lib.rs` (now replaced). Its behavior is a subset of `prepare_log_dir_candidate`; the new tests cover all its scenarios.

## Not done

- Cross-platform integration test for `is_wsl()` (requires WSL environment).
- `tauri dev` full startup verification in automation (pnpm not available).
- Version bump (excluded per constraints).
- Windows installer workflow changes (excluded per constraints).
- Rack placement logic was not changed.

## Suggested next step

Push to `settings/log-directory-ux`, update PR #83, run CI. Monitor Rust startup on WSL to confirm the `PluginInitialization("log", "Permission denied")` panic is resolved.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
