# CC Report — feat/windows-installer-polish-programdata-logs

## Branch

`feat/windows-installer-polish-programdata-logs` — two commits.

---

## Summary

### Commit 1 — `docs(plan): add installer and UI follow-up details`

Updated `docs/BETA1_FOLLOWUP_PLAN_EN.md`:

- **Item 9 refined**: Added implementation approach detail — `perMachine` NSIS
  install mode, ProgramData log path, note that exact vendor-prefixed install
  path (`C:\Program Files\TechTradeExpress\RackInventoryStudio`) requires a
  custom NSIS template deferred to PR G.
- **Item 10 expanded**: Added device/model display names requirement — show model
  `name` not `code` in device tables; `Unnamed model` fallback.
- **Item 11 added**: Rack diagram unplaced devices UX (PR D) — persistent drop
  target, explicit unplace action, 6-item visible cap, recency ordering, Show all.
- **PR grouping table added**: PRs C through G mapped to plan items.

### Commit 2 — `feat(installer): use ProgramData logs and Windows install defaults`

Three files changed; no behavior change on Linux/macOS.

---

## Installer config changes

### `apps/desktop/src-tauri/tauri.conf.json`

| Setting | Before | After |
|---|---|---|
| `bundle.icon` | absent (auto-discovered) | Explicit array: 32x32.png, 128x128.png, 128x128@2x.png, icon.icns, icon.ico |
| `bundle.windows.nsis.installMode` | absent (default: `currentUser`) | `"perMachine"` |

**Effect of `perMachine`**: default install base changes from
`%LOCALAPPDATA%\Rack Inventory Studio` to `C:\Program Files\Rack Inventory Studio`.

**Limitation**: Exact vendor-prefixed path
`C:\Program Files\TechTradeExpress\RackInventoryStudio` requires a custom NSIS
template via `bundle.windows.nsis.template`. This is out of scope for this PR and
is tracked as PR G (Release/signing/versioning hardening).

### Windows default logs path

| | Before | After |
|---|---|---|
| `resolve_default_log_dir_early()` Windows | `%LOCALAPPDATA%\com.techtradeexpress.rackinventorystudio\logs` | `%PROGRAMDATA%\TechTradeExpress\RackInventoryStudio\logs` |
| `get_default_logs_dir()` | called `app.path().app_log_dir()` | calls `resolve_default_log_dir_early()` for consistency |

Both functions now agree on the default path. The new path uses `%PROGRAMDATA%`
(`C:\ProgramData`) which is writable by all Windows users including non-admins,
unlike `Program Files`.

### `app_config.rs` additions

- `windows_log_dir_from_programdata(programdata: &str) -> PathBuf` — constructs
  the ProgramData log path from a root string. Marked
  `#[cfg(any(target_os = "windows", test))]` so it compiles on Linux CI for tests.
- `WINDOWS_VENDOR` / `WINDOWS_APP_DIR` constants (same cfg gate).
- 3 new unit tests (platform-independent — use synthetic base paths):
  - `windows_log_dir_appends_vendor_app_logs_components` — verifies component structure
  - `windows_log_dir_is_deterministic` — same input → same output
  - `windows_log_dir_reflects_programdata_root` — path starts from given root

### Settings UI

`SettingsPanel.tsx` fallback text updated:

| | Before | After |
|---|---|---|
| Windows fallback label | `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\` | `%ProgramData%\TechTradeExpress\RackInventoryStudio\logs` |

New `SettingsPanel.test.tsx` test:
- `loading fallback shows ProgramData Windows path` — keeps `getLogSettings` pending
  so the loading fallback renders; asserts the new path text is visible.

---

## App icon status

Icon assets already existed in `apps/desktop/src-tauri/icons/` (generated in a
prior PR). The `bundle.icon` array was absent, relying on Tauri auto-discovery.
Adding it explicitly ensures the icons are wired into the NSIS installer and
installed executable regardless of Tauri CLI version behavior. The `.ico` file is
used for the Windows executable and Add/Remove Programs entry.

---

## Tests run and results

```
cargo fmt --all --check              — OK
cargo check --workspace              — OK (0 warnings)
cargo test --workspace               — 63 backend + all crate tests passed, 0 failed
cargo clippy --workspace -D warnings — 0 errors, 0 warnings
tsc --noEmit                         — OK (0 errors)
vitest run                           — 472 passed (36 test files, +1 new)
git diff --check                     — OK
node check-version-consistency.mjs   — OK (all 0.1.0-beta.1)
node --test scripts/*.test.mjs       — 17 passed, 0 failed
node check-repo-hygiene.mjs          — 8 checks passed
actionlint                           — not available locally; CI workflow-lint
                                       job validates YAML
```

---

## Manual QA checklist

Build a new Windows installer from this branch after merge:

1. Build installer: trigger Windows Installer workflow on this branch.
2. **Install on Windows**: run the installer as a normal (non-admin) user.
   - Confirm UAC prompt for per-machine install (expected — installs to Program Files).
   - Confirm default install directory is `C:\Program Files\Rack Inventory Studio`
     (vendor-prefixed path deferred to PR G).
3. **App icon**: verify installer and installed `.exe` show the app icon.
   Check Add/Remove Programs for the icon.
4. **Launch app** as a normal non-admin user.
5. **Logs directory**: open Settings → Diagnostics and logs.
   - Confirm "Default logs location" shows
     `C:\ProgramData\TechTradeExpress\RackInventoryStudio\logs`.
   - Confirm "Active logs location" shows the same path (first launch).
6. **Logs written**: check that log files exist in
   `C:\ProgramData\TechTradeExpress\RackInventoryStudio\logs`.
7. **Open logs folder**: click "Open logs folder" — Explorer must open that directory.
8. **Custom path**: click "Choose logs folder…", pick a different directory.
   Confirm Settings shows the custom directory and restart-required notice.
9. **Reset to defaults**: restart the app (for custom path to activate), then
   click "Reset to default". Confirm ProgramData path is restored after another
   restart.
10. **SSH/Git logging**: perform a Push/Pull with SSH key; confirm log entries are
    written to the ProgramData directory.

---

## Risks

- `perMachine` install requires administrator privileges at install time (UAC
  prompt). This is a behaviour change from the previous `currentUser` default.
  Users who cannot elevate cannot install. If this is a concern, `installMode`
  can be changed to `"both"` so the user can choose during setup.
- Existing Windows installations will keep logging to the old `%LOCALAPPDATA%`
  path until the user deletes `app_config.json` or resets the log directory via
  Settings. If the user has a custom log directory configured, that is preserved.
- `get_default_logs_dir()` now calls `resolve_default_log_dir_early()` which
  uses env vars. If `%PROGRAMDATA%` is unset (very unusual), it falls back to
  `app.path().app_log_dir()` (Tauri's resolver), which maps to `%LOCALAPPDATA%`.
  This is safe.

## Not done

- Custom NSIS template for exact vendor-prefixed install path
  `C:\Program Files\TechTradeExpress\RackInventoryStudio` (deferred to PR G).
- Rack diagram unplaced devices UX (PR D — separate PR).
- Hide `code` from UI / device model display names (PR E — separate PR).
- Dirty repository guard (PR F — separate PR).

## Suggested next step

Trigger the Windows Installer workflow on this branch and run through the manual
QA checklist above. Pay particular attention to item 2 (UAC prompt for perMachine
install) and item 6 (logs written to ProgramData, not LOCALAPPDATA).
