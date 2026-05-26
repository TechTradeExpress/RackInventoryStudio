## Summary

Milestone H — Settings logs directory controls.

The Settings panel now surfaces the full log directory story: active path, default path, custom override, and a clear restart-required notice. Users can open the logs folder in the OS file manager, choose a custom folder, or reset to the platform default — all from the "Diagnostics and logs" section.

The core implementation (backend commands, config persistence, startup wiring, frontend UI, and basic tests) was introduced in earlier milestones and was already present on `master`. This PR formally closes Milestone H by:
- Auditing all requirements against the existing implementation.
- Adding the missing unit-test scenarios (error display, active path display, custom-dir restart warning).
- Updating CHANGELOG.md and this report with the full feature description.
- Confirming no rack placement logic was changed and no version/installer changes were made.

## Files changed

### Frontend
- `apps/desktop/src/features/settings/SettingsPanel.tsx` — "Diagnostics and logs" panel: shows active/default/custom log directory paths; "Open logs folder", "Choose logs folder…", and "Reset to default" buttons; success and error banners; restart-required notice.
- `apps/desktop/src/api/tauriClient.ts` — `LogSettingsDto`, `getLogSettings`, `openLogsDirectory`, `setLogsDirectory`, `resetLogsDirectory`, `selectDirectory`.

### Backend (Rust / Tauri)
- `apps/desktop/src-tauri/src/commands/log_settings.rs` — four Tauri commands: get/open/set/reset log directory; `LogSettingsDto`; `build_dto` computes `restart_required`.
- `apps/desktop/src-tauri/src/app_config.rs` — `AppConfig` (JSON persistence), `ActiveLogState` (managed state), `load_app_config`, `save_app_config`, `get_default_logs_dir`, `get_active_logs_dir`, `resolve_startup_custom_log_dir`, `resolve_app_config_dir_early`.
- `apps/desktop/src-tauri/src/lib.rs` — log plugin initialised at startup with custom dir (if valid) or `LogDir`; `ActiveLogState` managed; all four commands registered.

### Tests
- `apps/desktop/src/features/settings/SettingsPanel.test.tsx` — 11 unit tests (4 added this milestone: active path display, open-folder error banner, set-directory error banner, custom-dir restart warning row).
- `apps/desktop/e2e/mocks/tauri-core.ts` — mock responses for all four log-settings commands.
- `apps/desktop/e2e/smoke.spec.ts` — two E2E tests covering Settings accessibility and logs directory action buttons.

### Documentation
- `CHANGELOG.md` — Milestone H unreleased entry.
- `.ai/cc-report.md` — this file.

## Tests

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 440 pass, 34 files (+4 new tests)
playwright test (apps/desktop)                  → 21 pass
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → 34 pass
cargo clippy --workspace -- -D warnings         → clean
```

## Risks

- **Log plugin restart requirement:** The custom log directory is applied only at process startup. The frontend communicates this clearly ("Changes will apply after restarting the app."), and `restart_required` in the DTO is `true` whenever the persisted setting differs from the running process's actual directory. Users are never misled about which directory is active.
- **Startup fallback:** If a persisted custom log path becomes unusable between sessions (network drive gone, permissions revoked), `resolve_startup_custom_log_dir` returns `None` and the app silently falls back to the platform default. The saved config is left intact so the user can see and correct the path in Settings.
- **Platform open-folder commands:** Uses `explorer.exe` / `open` / `xdg-open`. On unusual Linux desktops without XDG tooling, `xdg-open` may fail — this surfaces as a dismissible error banner.

## Not done

- Changing the log directory without a restart (would require reinitialising `tauri-plugin-log` at runtime — not supported by the plugin API).
- Log rotation or size limits (out of scope for this milestone).
- Version bump (excluded per constraints).
- Windows installer workflow changes (excluded per constraints).
- Rack placement logic was not changed.

## Suggested next step

Push to `settings/log-directory-ux`, open PR to `master`, and run CI. Monitor the `workflow-lint` actionlint job.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
