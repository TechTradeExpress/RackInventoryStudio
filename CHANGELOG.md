# Changelog

## Unreleased — Post-beta 1 follow-up

### Added

- **Auto-generated internal `code` fields**: The `code` field for Location,
  Rack, Device Model, and Device is now generated automatically by the backend
  when not supplied. Generation uses a deterministic incrementing suffix pattern
  (`location-01`, `rack-01`, `device-01`, `model-server-01`, etc.) and is
  unique at creation time. Codes are immutable after creation.
- **`code` removed from Add/Edit forms**: All four entity forms (Location, Rack,
  Device Model, Device) no longer show a `code` input. User-facing identity is
  name, serial number, asset tag, and external reference.
- **`external_ref` uniqueness enforced**: Duplicate `external_ref` values are
  now rejected both in direct add/update operations and in CSV import
  (VAL-CSV-020 for in-CSV duplicates, VAL-CSV-021 for repo conflicts).
- **CSV `code` column is optional**: The `code` column in device CSV import is
  no longer required. When present, explicit codes are validated and preserved;
  when absent or blank, a code is generated at import time.
- **Search deprioritises `code`**: Name/label now scores higher than `code` in
  search results (name = primary match, code = secondary, other fields =
  tertiary).

### Fixed

- **Create repository now uses selected folder as parent directory**: The "Create
  repository" wizard now asks for a **parent directory** instead of the final
  repository directory. The repository is created inside
  `<parent>/<code>` — e.g. selecting `D:\RIS` with code `test-lab` creates
  `D:\RIS\test-lab`. If the target directory already exists the operation is
  rejected with a clear error message.
- **Fixed false Windows installer "app is currently running" prompt**: Restored
  Tauri's canonical `CheckIfAppIsRunning` NSIS macro. The custom `RisCheckIfRunning`
  macro introduced in beta.2 had inverted `nsis_tauri_utils::FindProcess` return value
  logic (`FindProcess` returns `0` when found, not `1`), causing the prompt to appear
  on every fresh install or update when the app was not running.
- **Windows window close button now works**: Added `core:window:allow-close` and
  `core:window:allow-destroy` to `capabilities/default.json`. Without these entries
  Tauri v2's IPC permission system silently rejected `destroy()` calls, preventing
  the system title-bar X button from closing the app. The `onCloseRequested` handler
  now also logs any future `destroy()` failures via the diagnostics log instead of
  swallowing them silently.
- Windows rack placement drag-and-drop compatibility: `dragDropEnabled: false` in
  Tauri window config prevents WebView2 from intercepting HTML5 DnD events; payload
  now written to both custom MIME type and `text/plain` fallback.
- **Clear height override now works**: Setting a per-placement height back to "model
  default" (sending `height_u: null`) previously had no effect because
  `move_placement` and `move_placement_within_side` fell back to the existing stored
  override when `new_height_u` was `None`. The fallback is removed; `None` now
  directly clears the stored override so the effective height reverts to the model
  default.
- **CSV import warning-row count is now accurate**: `CsvImportSummary.warning_rows`
  (formerly `warning_count`) now counts *rows* with at least one warning issue,
  not individual issues. File-level/header warnings are excluded. Rows that have
  both errors and warnings are counted once in `warning_rows`. The frontend
  `deriveCsvImportUiSummary` helper was updated with consistent semantics and the
  import panel copy updated to "Rows with at least one warning".
- **Git push uses configured remote name and preserves SSH aliases**: Push and pull
  operations now use the remote **name** (`origin`) throughout — the configured URL
  is read only to decide whether to enable askpass, not as a push target. This means
  SSH alias remotes (`ssh-alias:owner/repo.git`) defined in `~/.ssh/config` are
  preserved end-to-end: RIS never rewrites or substitutes them with a constructed
  `git@github.com:...` URL. First push to a branch without a configured upstream
  uses `git push -u origin <branch>` to set tracking; subsequent pushes omit `-u`.
  If the named remote does not exist RIS now returns a clear error instead of a
  confusing Git failure.

### Added

- Post-beta follow-up plan (`docs/BETA1_FOLLOWUP_PLAN_EN.md`) covering six
  identified issues and their planned resolutions.
- **SSH passphrase prompting**: When a push or pull requires a key passphrase
  and no ssh-agent has the key loaded, a one-time modal prompts the user. The
  passphrase is passed directly to SSH via a short-lived localhost TCP session;
  it is never stored in config, logs, environment variables, or files.
- **SSH diagnostics**: `get_ssh_diagnostics` command surfaces `ssh-add -l`
  status, `SSH_AUTH_SOCK`, detected SSH executable and version,
  `core.sshCommand`, and user-facing guidance for common agent/configuration
  issues.
- **SSH error classification**: Common SSH stderr messages (permission denied,
  agent failure, bad passphrase, host key failure) are mapped to user-friendly
  guidance rather than raw error strings.

### Security

- SSH private-key passphrases are never stored: not in settings, localStorage,
  config files, environment variables, logs, or command-line arguments.

---

## v0.1.0-beta.1 — 2026-05-27 — First Windows beta

**Beta release — Windows x64 only. Unsigned installer.**

### Highlights

- **Location inventory** — Create and manage physical site locations. Each location
  holds an arbitrary number of racks.
- **Rack placement diagram** — Visual rack unit diagram as the primary placement
  surface. Drag equipment from the palette to any open U slot. Drag an occupied
  block to move it; drag it to the palette to unplace it. Multi-U height-aware
  drop-target preview (green/red). Inspector panel shows selected placement details
  and provides Edit/Remove actions.
- **Device and model management** — Full CRUD for devices and device models.
  CSV device import with preview validation. "Create new device" flow inline
  inside the Place equipment modal.
- **Repository workflow** — Create or open a local Git-backed repository. Git
  status, commit, and push/pull actions without leaving the app.
- **Settings → Diagnostics and logs** — View the active and default log directory;
  open it in the OS file manager; choose a custom directory or reset to the
  platform default. Log-directory changes take effect after restart.
- **Windows installer** — Unsigned NSIS x64 installer built via GitHub Actions
  (`Actions → Windows Installer → Run workflow`). SmartScreen warning expected on
  first run ("More info → Run anyway").

### Known beta limitations

- Windows x64 only. Linux and macOS packages are not provided in this beta.
- Installer is unsigned. A Windows SmartScreen warning will appear.
- No auto-update; reinstall from the new installer to upgrade.
- No code-signing or EV certificate in this release.

---

## v0.1.0-beta.1 — Development history (QA round repair)

### Fixed
- `apps/desktop/src-tauri/src/app_config.rs` / `lib.rs`: startup log dir is now validated for writability via a probe-file write before being passed to `tauri-plugin-log`. Introduced `is_dir_writable`, `prepare_log_dir_candidate`, and `resolve_startup_log_dir` helpers that cascade through custom dir → platform default → OS temp dir. Passing an unwritable directory to the plugin previously caused a panic (`PluginInitialization("log", "Permission denied (os error 13)")`).
- `apps/desktop/src/features/locations/LocationsPanel.tsx`: pressing Enter/Space while focused on an action button (Edit, Delete) no longer bubbles to the row `onKeyDown` and triggers navigation. The guard checks `e.target !== e.currentTarget` before testing whether the event originated from an interactive child element.

## v0.1.0-beta.1 — Settings logs directory fixes (QA round)

### Fixed
- `apps/desktop/src-tauri/src/commands/log_settings.rs`: "Open logs folder" on WSL now detects the WSL environment (via `WSL_DISTRO_NAME` env var and `/proc/sys/kernel/osrelease`), converts the Linux path with `wslpath -w`, and opens it with `explorer.exe`. Native Linux without `xdg-open` returns a friendly message with the folder path rather than exposing the raw OS error.
- `apps/desktop/src-tauri/src/app_config.rs` / `lib.rs`: startup log plugin now always uses a `Folder` target with the path pre-created (instead of `LogDir`), eliminating a potential startup panic on WSL where lazy `LogDir` path resolution could fail.
- `apps/desktop/src/features/settings/SettingsPanel.tsx`: "Reset to default" success banner now shows "Changes will apply after restarting the app." only when `restart_required` is true. When the active directory was already the default (e.g. user set a custom dir in this session but never restarted), the banner simply says "Log directory reset to default."
- `apps/desktop/src/features/locations/LocationsPanel.tsx`: the entire location row is now a clickable navigation target (matching the rack-row pattern). The `<tr>` has `role="button"`, `aria-label="Open racks for {name}"`, and keyboard support (Enter/Space). Action buttons (Edit, Delete) stop event propagation so they do not trigger row navigation.

## v0.1.0-beta.1 — Settings logs directory controls (Milestone H)

### Added
- `apps/desktop/src/features/settings/SettingsPanel.tsx`: "Diagnostics and logs" panel shows the active and default log directory paths; buttons to open the folder in the OS file manager, choose a custom folder, and reset to the platform default.
- `apps/desktop/src-tauri/src/commands/log_settings.rs`: four Tauri commands — `get_log_settings`, `open_logs_directory`, `set_logs_directory`, `reset_logs_directory` — handling path resolution, directory creation, config persistence, and restart-required signalling.
- `apps/desktop/src-tauri/src/app_config.rs`: `AppConfig` struct with JSON persistence (`app_config.json`); `ActiveLogState` managed state recording the log directory used by the current process; startup resolution of custom log dir before Tauri builder runs.
- `apps/desktop/src/api/tauriClient.ts`: `LogSettingsDto` interface and wrappers for all four log-settings commands, plus `selectDirectory()` for the native folder picker.
- `apps/desktop/e2e/mocks/tauri-core.ts`: E2E mock responses for all four log-settings commands.

### Changed
- `apps/desktop/lib.rs`: log plugin is initialised at startup with the custom dir (if persisted and valid) via `tauri_plugin_log::TargetKind::Folder`; falls back to `LogDir` if the custom path is unusable.

### Tests
- `apps/desktop/src/features/settings/SettingsPanel.test.tsx`: 11 unit tests covering section rendering, button presence, open logs folder, choose folder cancel/success/error, set-directory error, reset to default, active path display, and restart warning.
- `apps/desktop/src-tauri/src/app_config.rs`: 13 Rust unit tests covering load/save round-trip, malformed JSON fallback, reset, startup dir resolution (valid dir, missing dir created, relative path rejected, file path rejected, uncreatable path), and `restart_required` logic.
- `apps/desktop/e2e/smoke.spec.ts`: two E2E tests — settings accessible without a repo; logs directory actions visible and active path displayed.

## v0.1.0-beta.1 — UX copy and navigation cleanup

### Changed
- `LocationsPanel.tsx`: location name is now a clickable link-button that opens the rack view directly (replaces the separate "Manage racks" icon button, which has been removed).
- `PlacementInspectorPanel.tsx`: KV labels renamed: "Target kind" → "Target type", "Height U" → "Height", "Eff. height U" → "Effective height".
- `EditPlacementModal.tsx` / `PlacePlacementModal.tsx`: field label "Height U override" → "Height override"; matching validation error message updated.
- `rackOccupancy.ts`: occupancy warning strings are now sentence-cased and use human-readable names (e.g. "Start U is less than 1", "Height unknown — shown at start U only", "End U (n) exceeds rack height h — clamped") instead of raw field names.

## v0.1.0-beta.1 — Complete rack placement editing workflow

### Added
- `apps/desktop/src/features/racks/dndTypes.ts`: new `"placement"` DnD payload kind carrying `placementId`, `startU`, `heightU`, `side` — enables drag-to-move of already-placed equipment.
- `apps/desktop/src/features/racks/dndHelpers.ts`: `canDropAt` now accepts optional `excludePlacementId` so a dragged block's own cells are treated as empty during validation. `getPayloadHeight` and `decodeDndPayload` updated for the `"placement"` kind.
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx`: five-column grid: U · Name · Model · Code / SN · Asset tag. U column is a dedicated gutter rendered as independent per-rack-unit cells (not merged ranges); placement content cards span their full U height in the content area. Selection ring and drag handle live on the placed equipment card only — the U gutter is always neutral. Placed item cards drag as colored palette-card–style drag images (occupied blue, ⠿ icon + label + U count) using a custom drag image set via `setDragImage`. Drag-to-move and drag-to-unrack both originate from `data-testid="placed-${side}-${p.id}"` on the content card.
- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx`: new `onUnplacePlacement` prop; entire panel wrapped with a drop zone that accepts `"placement"` payload drops — shows "Drop here to unplace from rack" hint during drag; on drop calls `onUnplacePlacement(placementId)`.
- `apps/desktop/src/features/racks/RackDetailPanel.tsx`: `handleUnplacePlacement` calls `removePlacement` and refreshes rack detail + placeable targets; passes `onUnplacePlacement` to palette panel.
- `apps/desktop/src/features/racks/PlacePlacementModal.tsx`: "Create new rack object…" button in Rack Object mode (mirrors "Create new device…"); "Edit device…" and "Edit rack object…" buttons when a target is selected — edit form opens inline, list refreshes, selection is preserved after save.
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx`: "Edit device…" / "Edit rack object…" buttons in the inspector action area based on `target_kind`.
- `apps/desktop/src/features/racks/RackDetailPanel.tsx`: wires `onMovePlacement` to `movePlacement` API call + `refreshAfterMutation`; wires inspector edit-target callbacks to dedicated `DeviceFormModal` / `DeviceModelFormModal` instances; passes `onRackObjectCreated` to `PlacePlacementModal`.
- `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx`: `onSaved` now receives the new model ID (`newModelId?: string`) in add mode, enabling the "Create new rack object" preselection flow.
- `apps/desktop/e2e/mocks/tauri-core.ts`: `move_placement` actually moves the placement in `dynamicRackDetail`; `place_rack_object` adds the placement to `dynamicRackDetail`; added handlers for `add_device_model_cmd`, `update_device_cmd`, `update_device_model_cmd`; `dynamicDeviceModels` factory with reset support.

### Changed
- Rack diagram final column set: U · Name · Model · Code / SN · Asset tag — Type, U range, and St. columns removed.
- U gutter is rack structure: each rack unit always has its own 22 px cell showing `U{n}`. For multi-U placements the U gutter still shows individual cells (U11 / U10, etc.); the merged range string is used only in tooltips.
- Selection ring and occupied background apply to the placed equipment content card only — the U gutter cells are always neutral.
- Placed item cards are the drag source for both drag-to-move and drag-to-unrack; a custom `setDragImage` produces a palette-card–style ghost (occupied blue, ⠿ label).
- Asset tag column shows `target_asset_tag`; falls back to `—` when absent.
- Code / SN column: shows `target_code` or `SN: {serial}`; no longer falls back to asset tag (asset tag has its own column).
- Hint text updated: "Drag card to move · Drag to palette to unplace".
- `apps/desktop/e2e/mocks/tauri-core.ts`: `remove_placement` now also marks the target device as `is_placed: false` so the device re-appears in the palette after unplacement.

### Tests
- 16 new unit tests across `dndHelpers.test.ts` and `PlacePlacementModal.test.tsx` covering: placement-kind encode/decode, `canDropAt` with `excludePlacementId`, create rack object flow, edit device/rack object flows.
- 26 unit tests in `RackUnitDiagram.test.tsx` (updated): column headers U/Name/Model/Code SN/Asset tag present; Type/U range/St. not present; U gutter shows separate per-unit cells for multi-U placements (no merged range); selection ring on content card, not U gutter cell; content card is draggable, U gutter cell is not; Asset tag column shows value or `—`; click-to-select, click-to-place, side switching.
- 6 unit tests in `PlacementPalettePanel.test.tsx`: drop zone accepts placement payload, rejects device/rack_object payloads, no-op without handler, no-op without active payload.
- 4 E2E smoke tests: drag-to-move placed block, create rack object from place modal, inspector edit device button visibility, drag placed equipment to palette to unplace it.
- E2E "diagram is primary surface" test extended: Asset tag column header visible, U gutter cell visible as separate element for placement at U10.
- E2E drag-to-move test extended: U gutter cells at old and new positions confirmed visible after move.
- E2E drag-to-unrack test extended: U gutter cell at U10 confirmed visible after unplace.

## v0.1.0-beta.1 — CI runner pinning and workflow linting

### Changed
- `.github/workflows/ci.yml`: all four Linux CI jobs (`rust`, `version-check`, `scripts`, `frontend`) pinned from `ubuntu-latest` to `ubuntu-24.04` to prevent silent runner image drift.

### Added
- `.github/workflows/ci.yml`: new `workflow-lint` job running `raven-actions/actionlint@v2` on `ubuntu-24.04` — lints all workflow YAML files on every pull request and push, failing CI on syntax or semantic errors.

## v0.1.0-beta.1 — Wire script and hygiene checks into CI

### Added
- `.github/workflows/ci.yml`: new `scripts` job ("Script and hygiene checks") — lightweight, checkout-only, no pnpm install. Runs `node --test scripts/*.test.mjs` (17 tests) and `node scripts/check-repo-hygiene.mjs` (8 checks) on every pull request and push.
- `scripts/check-repo-hygiene.mjs`: two new checks — assert `.github/workflows/windows-diagnostic-installer.yml` is not tracked; assert `.ai/windows-diagnostic-installer.md` is not tracked. CI will now fail if the removed Windows Diagnostic Installer workflow or its CI doc are reintroduced.

## v0.1.0-beta.1 — Test and script hardening

### Added
- `scripts/bump-version.mjs`: `--root <path>` flag (points the script at a fixture directory for isolated testing) and `--dry-run` flag (prints the before/after table without writing files). Added `--root` argument validation, `--dry-run` no-op path, and try/catch error wrapping for all read and write phases.
- `scripts/bump-version.test.mjs`: 17 fixture-based tests using Node built-ins (`node:test`, `node:assert`, `node:child_process`). Covers argument validation, no-op path, stable/prerelease/rc bumps, dry-run behavior, and error paths (missing files, malformed JSON, missing version field).
- `scripts/check-repo-hygiene.mjs`: 6 regression checks — no `package-lock.json`, no `.env` files, no committed `.ai/review-context-*.md`, no `node_modules` in git tree, `pnpm-lock.yaml` present, `CHANGELOG.md` present.
- `pnpm test:scripts` script in root `package.json` — runs `node --test scripts/*.test.mjs`.
- `pnpm check:hygiene` script in root `package.json` — runs `check-repo-hygiene.mjs`.
- `apps/desktop/e2e/mocks/tauri-core.ts`: `createInitialDevices()`, `createInitialRackDetail()` factory functions and exported `resetE2eMockState()` — called by `open_repository_cmd` as defense-in-depth so consecutive `openFixtureRepo()` calls within a single test also start from the fixture baseline.
- `apps/desktop/e2e/smoke.spec.ts`: state isolation regression test — places a device via DnD+modal, confirms the new placement appears, reloads the page, re-opens the repo, and asserts the mutation is gone.

### Changed
- `scripts/bump-version.mjs`: fixed "atomically" wording in script header (no real FS transaction); rewritten to `--root`/`--dry-run` aware version with consistent error output.

## v0.1.0-beta.1 — Code dead-code and naming cleanup after Beta QA Milestones A–F

### Removed
- `RackDetailPanel.tsx`: removed dead `placeModalDndPayload` state (written but never consumed — `PlacePlacementModal` uses `initialTargetKind`/`initialTargetId` instead; 6 setter call-sites also removed).
- `src/lib/styles.ts`: removed 8 unused properties from `common` (`section`, `h2`, `h3`, `hint`, `table`, `th`, `td`, `working`) — left over from the removed placement panel components.

### Changed
- `RepositoryPanel.tsx`: removed stale "Temporarily render the legacy summary table / will be separated into sidebar in a follow-up" comment.
- No application behavior changes. No version bump.

## v0.1.0-beta.1 — Docs cleanup: align with current beta state (Milestones A–F)

### Changed
- `README.md`: updated test counts (374 Rust / 388 Vitest / 16 E2E), current desktop UI capabilities (diagram-first placement, inline device creation, Settings → Diagnostics and logs), roadmap table (Beta QA Milestones A–F all marked Done), v1.0.0 release gate (references BETA_WINDOWS_11_QA_EN.md and BETA_RELEASE_PROCESS_EN.md).
- `docs/BETA_HARDENING_PLAN_EN.md`: added archival banner; updated current baseline table (rack detail row reflects diagram-first UI, test counts updated).
- `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md`: added archival banner (references pre-hardening UI including placement table and Add Placement form).
- `docs/UX_AUDIT_PREP_EN.md`: added archival banner (pre-audit brief describing pre-hardening state).
- `docs/UI_SCREENS_SPEC_EN.md`: added archival banner (MVP screen spec with pre-hardening placement UI).
- `docs/USER_WORKFLOWS_EN.md`: added archival banner (MVP workflows with pre-hardening placement flows).

## v0.1.0-beta.1 — Beta QA follow-up Milestone F: Release/versioning/installer process

### Added
- `scripts/bump-version.mjs` — Node ESM helper to update all four canonical version sources atomically (`package.json`, `apps/desktop/package.json`, `Cargo.toml`, `tauri.conf.json`). Usage: `node scripts/bump-version.mjs 0.1.1` or `node scripts/bump-version.mjs 0.2.0-beta.1`. Validates SemVer format, prints a before/after table, does not auto-commit.
- `pnpm bump:version` script in root `package.json` (alias for the above).
- `docs/BETA_RELEASE_PROCESS_EN.md` now documents: SemVer policy (PATCH/MINOR/MAJOR), pre-release tag convention (`vX.Y.Z-beta.N`), release branch naming (`release/vX.Y.Z`), version bump helper, and a concrete step-by-step release workflow (A: prepare branch, B: validate, C: build installer, D: Windows 11 QA, E: tag and GitHub Release).

### Changed
- `docs/BETA_RELEASE_PROCESS_EN.md` rewritten to reflect the finalized release/versioning/installer process.
- `docs/BETA_WINDOWS_11_QA_EN.md` updated to reference only the standard Windows Installer workflow; rack placement checks updated for current UX (diagram as primary surface, create-device flow).
- `docs/BETA_HARDENING_PLAN_EN.md` updated: removed diagnostic installer references; updated artifact naming and release checklist.
- `.ai/windows-installer-ci.md` updated: removed cross-reference to diagnostic workflow; added links to release process and QA docs.
- `README.md` updated: Windows installer section clarified (one workflow, manual-only, unsigned, versioned artifact); diagnostics described as an app feature.

### Removed
- `.github/workflows/windows-diagnostic-installer.yml` — Windows Diagnostic Installer workflow removed. Diagnostics logging remains a full app feature accessible via Settings → Diagnostics and logs.
- `.ai/windows-diagnostic-installer.md` — diagnostic installer CI reference doc removed.

## v0.1.0-beta.1 — Beta QA follow-up Milestone E: Create device from Place equipment flow

### Added
- `PlacePlacementModal`: "Create new device…" button opens `DeviceFormModal` as a layered modal directly within the Place equipment flow, so users never need to leave the placement workflow to create a missing device.
- After a device is successfully created inline, the Place equipment modal returns with the new device preselected and the original Start U / side / height fields preserved.
- `DeviceFormModal` now passes the newly created device ID back via `onSaved(newDeviceId)` in add mode (edit mode still calls `onSaved()` with no argument — fully backward-compatible).
- Global busy overlay (`useBusy`) is used inside `DeviceFormModal` for "Creating device…" and "Saving device…" operations.
- `onDeviceCreated` callback on `PlacePlacementModal` lets `RackDetailPanel` refresh its palette/device list after an inline creation.
- Unit tests: expanded `PlacePlacementModal` test suite with 7 new tests covering the full inline create-device flow (button visibility, modal open/cancel, device preselection, field preservation, Place button enablement).
- E2E smoke test: full create-and-place flow — open rack detail → click empty U slot → create device via inline form → confirm preselection and Start U preserved → click Place → new placement block visible in diagram.

## v0.1.0-beta.1 — Beta QA follow-up Milestone D: Complete drag-and-drop workflow

### Changed
- Rack diagram drop targets now show a **height-aware hover preview**: when dragging an item with a known U-height, all cells in the drop range highlight green (valid) or red (blocked), not just the single hovered cell.
- `getDragPayload` now falls back to the in-memory `_activeDragPayload` cache when `dataTransfer.getData()` returns an empty string (programmatic DnD events, Playwright E2E simulations).
- `setActiveDragPayload` is now called before `dataTransfer.setData` in palette drag handlers, ensuring the cache is always populated regardless of browser restrictions on custom MIME types in synthetic events.
- Occupied and incomplete placement blocks in the drop range show a red dashed outline when the overall drop is invalid, giving visual feedback on which cells are blocking.

### Added
- E2E fixture: added unplaced device (`srv-unplaced-01`, `is_placed: false`) so the Placeable equipment palette exercises the device DnD path in tests.
- Smoke tests: two new Playwright DnD tests — drag a rack_object and a device from the palette to empty U slots; assert the Place equipment modal opens with `startU` and target preselected.
- Unit tests: `getPayloadHeight` (device with/without height, rack_object), `getDragPayload` fallback (prefers `dataTransfer`, falls back to `_activeDragPayload`, returns null when both empty).
- Component tests: two new `PlacePlacementModal` tests covering DnD drop prefill for `device` and `rack_object` kinds with `startU` + target id → Place button enabled.

## v0.1.0-beta.1 — Beta QA follow-up Milestone C: Rack diagram as primary placement surface

### Changed
- Removed the active-side placement table (Front placements / Rear placements) from Rack Detail. All placement discovery, selection, and interaction now happens directly in the rack diagram.
- Rack diagram is now the sole placement surface: click an empty slot to place equipment (start U prefilled); click an occupied block to select it and open the inspector.
- Placement inspector is always visible in the right sidebar; shows a helpful empty state ("Select a placement in the diagram") when nothing is selected.
- Updated diagram legend to cover all visual states: Available, Occupied, Selected, Warning/incomplete, Drop target (drag).
- Updated inspector empty state copy to direct users to the diagram instead of the removed table.
- Added `data-testid="placed-{side}-{id}"` to occupied placement blocks in the diagram for E2E testability.
- Edit and Remove placement actions remain in the contextual inspector / EditPlacementModal.

## v0.1.0-beta.1 — Beta QA follow-up Milestone B: Settings logs actions

### Added
- Settings: "Open logs folder" button opens the active logs directory in the OS file manager.
- Settings: "Choose logs folder…" directory picker to configure a custom log directory.
- Settings: "Reset to default" to remove the custom log directory override.
- Settings: Shows default, active, and custom log directory paths.
- Persisted app config layer (`app_config.json`) for storing the custom log directory override.
- Changes to the log directory apply after app restart (noted in UI).

## v0.1.0-beta.1 — Beta QA follow-up Milestone A: immediate blockers and small UI cleanup

### Fixed
- Removed duplicate internal "Rack Inventory Studio" brand block from app header/chrome (native window title already shows it).
- Removed unsafe "Change side" / "Move to Rear" / "Move to Front" placement actions — moving a placement between front/rear in one step skips overlap checks.
- Fixed "Download sample CSV" to use Tauri save-file dialog + `write_text_to_file` command instead of broken browser Blob download (browser `<a download>` does not work in Tauri runtime).
- Fixed Racks list Utilization calculation: now uses `max(front_used_U, rear_used_U) / height_u` (U-slot based) instead of the incorrect `placement_count / (height_u × 2)` (device-count based).

## v0.1.0-beta.1 — beta QA findings action plan (branch `planning/beta-qa-findings-action-plan`)

### Added

- Beta QA findings action plan (`docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md`) capturing 14 findings from manual inspection after milestone 5 and defining follow-up milestones A–F with beta blocking classification.

### Changed

- `docs/BETA_HARDENING_PLAN_EN.md` — added link to findings action plan.
- `README.md` — added link to findings action plan in beta hardening section.

## v0.1.0-beta.1 — beta hardening milestone 5: Beta QA and Windows installer validation (branch `qa/beta-windows-installer-validation`)

### Added

- Windows 11 beta QA runbook (`docs/BETA_WINDOWS_11_QA_EN.md`) with complete manual QA checklist.
- Validated beta hardening release process against current master.

### Changed

- Removed unused `AddPlacementPanel.tsx` (replaced by `PlacementPalettePanel.tsx` in milestone 4).

## v0.1.0-beta.1 — beta hardening milestone 2: versioning and release process (branch `release/versioning-beta-process`)

- **Version consistency check script** (`scripts/check-version-consistency.mjs`) — Node ESM script that reads the app version from all four canonical sources (`package.json`, `apps/desktop/package.json`, `Cargo.toml`, `tauri.conf.json`), prints a formatted table, and exits non-zero on mismatch. Available as `pnpm check:version`.
- **CI: version-check job** (`.github/workflows/ci.yml`) — new lightweight job that runs the consistency check on every push and pull request; catches version drift before it reaches a build.
- **Versioned artifact names** — the Windows Installer workflow extracts the version from `tauri.conf.json` (PowerShell `ConvertFrom-Json` step) and embeds it in the artifact name: `rack-inventory-studio-vX.Y.Z-windows-installer`. Artifact names are unambiguous across builds.
- **Beta release process documentation** (`docs/BETA_RELEASE_PROCESS_EN.md`) — version policy, beta naming convention, full release checklist (verify consistency → merge → trigger workflow → smoke test → distribute), version bump procedure, and protected-master recommendation.

## v0.1.0-beta.1 — beta hardening milestone 1: global busy overlay and Windows Git console hiding (branch `ux/global-busy-git-no-console`, PR #65)

- **Global application busy overlay** — `AppBusyProvider` / `useBusy` / `runBusy` React context pattern wraps all async operations (open repository, close, save, validate, CSV preview/import, all Git operations). `BusyOverlay` component fades in after 150 ms with a spinner and operation label; pointer events are blocked immediately. Local loading/working state variables removed from all feature panels.
- **Windows Git console window hiding** — `run_git` helper in `crates/ris-git/src/lib.rs` sets `CREATE_NO_WINDOW` (`0x0800_0000`) via `CommandExt::creation_flags` on Windows-only `#[cfg(windows)]` block; eliminates the flashing console window on every Git operation.
- **5 Vitest tests** in `apps/desktop/src/lib/appBusy.test.tsx` covering: default state, sets label while running, clears after success, clears after error, re-throws for callers.

## v0.1.0-beta.1 — beta hardening planning (branch `planning/beta-hardening-plan`)

V1 release paused. Next target is a beta hardening release (Beta 0.2.x).

- **Beta hardening plan** (`docs/BETA_HARDENING_PLAN_EN.md`) — Documents five milestones: global busy overlay + Git console window hiding, versioning and release process, navigation/Settings/terminology cleanup, rack placement UX redesign, and beta QA checklist. Docs-only change, no application code modified.

## v0.1.0-beta.1 — post-UI polish QA series (integration branch `integration/post-ui-polish-qa`)

Nine working branches merged into `integration/post-ui-polish-qa`. Full automated QA passes. Windows 11 manual QA required before final PR to `master`.

- **Force Git init on repository creation** (`repo/force-git-init`) — `Initialize Git repository` checkbox removed; `git init` is now unconditional and hard-failure on error; repository creation blocks if Git is unavailable.
- **Unsaved-changes guard + Recent open fix** (`repo/unsaved-guard-recent-open`) — `handleOpen` and `handleClose` both guarded via `confirmUnsavedDiscard`; Recent repositories "Open" button now opens immediately (was: fill-path only).
- **Git status cache + manual refresh** (`perf/git-status-cache`) — `RepositoryPanel` always mounted (`display:none` when hidden); `GitSection` state persists across tab switches; explicit "Refresh Git status" button added; save invalidates cache via `gitRefreshToken`.
- **Location-scoped rack management** (`ux/location-scoped-racks`) — Racks managed from Location context via "Manage racks" per-row action; Racks panel filters to selected location; Add Rack uses context location.
- **Rack form polish** (`ux/rack-form-polish`) — Default rack height pre-filled to 42U; field label "Row / aisle" with help text; code field help text notes immutability.
- **CSV sample template download** (`ux/csv-sample-import`) — "Download sample CSV" button in CSV Import panel; template matches importer-supported columns; no double-counting of warning rows.
- **Validation and save copy** (`ux/validation-save-copy`) — Button copy: "Validate repository", "Save changes"; empty state explains validation does not write to disk.
- **Windows diagnostic installer** (removed in Milestone F) — A separate manual-only `workflow_dispatch` workflow was added at this point to bundle the installer with a `diagnostic-readme.txt`. It was removed in Milestone F; diagnostics logging remains an app feature accessible from Settings.
- **App icon** (`assets/app-icon`) — Bay-direction rack cabinet SVG (`icon.svg`) added; all Tauri platform icon formats regenerated (Windows ICO, macOS ICNS, PNG set, Windows APPX, iOS, Android); default Tauri placeholder icons replaced.

**Test totals after integration:** 358 Rust workspace tests · 315 Vitest frontend tests · 10 Playwright smoke tests.

## v0.1.0-beta.1 — UI polish (branch `design/claude-ui-polish`)

UI polish and design correction work completed on `design/claude-ui-polish`. Not yet merged to `master`. Manual visual QA on Windows 11 required before release.

- **CRUD forms migrated to modals** — all Add/Edit forms for Locations, Racks, Device Models, and Devices replaced with portal-rendered modal dialogs (460–640 px) with dirty-state backdrop protection and `ConfirmDialog` for destructive actions. No inline forms remain in any catalog panel.
- **Rack Detail single-side flow** — Front/Rear segmented control in PageHeader; diagram renders only the active side; switching side clears selection; drag-to-place targets active side only.
- **Enriched placement labels** — tiered label rendering in the rack diagram: 1U compact (name · model), 2U two-row (name / model · serial · asset tag), 3U+ stacked (name / model / SN / Asset). Placement blocks span their full U height, text centered vertically and horizontally.
- **Active placement table** — single table synced to active side with columns: U · Name · Model · Serial · Asset tag · Type. Table and diagram selection are synchronized.
- **Inspector side-safety** — side is read-only in the move form; a dedicated "Change side…" action with ConfirmDialog handles side reassignment. "Remove placement" also uses ConfirmDialog (danger tone).
- **CSV import double-count fix** — `deriveCsvImportUiSummary` helper; import button and "Will create" counter no longer double-count warning rows.
- **Windows installer workflow** — manual-only GitHub Actions workflow (`workflow_dispatch`) builds unsigned NSIS installer on `windows-latest`; artifact retained 30 days. No code signing. See `.ai/windows-installer-ci.md`.
- **Manual Windows 11 visual QA still required** before PR to `master`.

## v0.45.0 — Safe publish / Git UX polish (PR #39)

- `gitStatusHelpers.ts`: pure helpers `deriveGitStatusLabel`, `deriveGitActionHints`, `derivePublishChecklist`, `getPushDisabledReason`, `getPullDisabledReason`.
- Semantic status label (colour-coded by severity) replaces raw "Clean"/"Dirty — X/Y/Z" in RepositoryPanel.
- Contextual action hints panel; 5-step publish checklist (Save → Validate → Commit → Pull → Push).
- Push/Pull gating split: behind-only blocks Push (Pull stays enabled); diverged blocks both.
- Button `title` attribute carries specific disabled reason.
- "Pull --ff-only" label → "Pull latest" (underlying command unchanged).
- Unsaved changes banner notes app-vs-Git distinction explicitly.
- E2E mock updated: `is_repository: true`, `branch: "main"`, `upstream: "origin/main"`, `ahead: 1`.
- Playwright test 8: Git UX smoke — semantic label, action hint, branch cell, Push/Pull state.
- 44 Vitest tests in `gitStatusHelpers.test.ts`; 128 total Vitest tests.
- Docs: `UI_SCREENS_SPEC_EN.md` Push/Pull gating table; `USER_WORKFLOWS_EN.md` workflow 22 expanded.

## v0.44.0 — Repository flow polish (PR #38)

- Landing page redesigned: hero section, prominent Open and Create repository actions, recent repositories list.
- Recent repositories stored in localStorage; clicking an entry fills the path input.
- `CreateRepositoryWizard` integrated into landing state (no separate tab).
- Global search bar always visible in app header when repository is open.
- Tab bar disabled state styling and tooltips for tabs unavailable without open repo.
- Playwright test 2: landing state shows open and create actions (9 total smoke tests).

## v0.43.0 — Drag-and-drop placement (PR #37)

- `AddPlacementPanel` exposes draggable device and rack-object cards.
- `RackUnitDiagram` handles `dragover`/`drop` events on U-row cells.
- Module-level `_activeDragPayload` singleton avoids `dataTransfer.getData()` restriction during `dragover`.
- Backend height validation unchanged; collision detection unchanged.
- DnD target validation: device height checked against available U-range at drop time.
- DnD-placed items immediately appear in the rack diagram without page reload.

## v0.42.0 — Playwright smoke test foundation (PR #36)

- Playwright configured with `vite.config.e2e.ts`; tests run against Vite dev server (port 1421).
- `@tauri-apps/api/core` and `@tauri-apps/plugin-dialog` replaced with static fixture mocks via Vite alias.
- 7 initial smoke tests covering: app shell, open repository, global search navigation, validation navigation, CSV import flow, rack detail, search edge cases.
- Browser: Firefox (Chromium requires system libs unavailable in WSL2 dev environment).
- `scripts/ai/build-review-context.sh` helper for generating review context files.

## v0.41.0 — Search navigation polish (PR #35)

- Search result clicks navigate to the target entity and apply row-level highlight.
- Highlight CSS selector escaping fixed for codes containing special characters.
- All four entity types highlight correctly after navigation from search.

## v0.40.0 — Minimal global search (PR #34)

- `GlobalSearch` component: text input covering devices, racks, locations, device models.
- Dropdown shows matching results with entity type badges; short queries (< 2 chars) suppressed.
- Clicking a result fires `SearchNavigationEvent` and switches to the relevant tab.
- Unplaced device placements included in search results.
- "No results" state shown when query matches nothing.

## v0.39.0 — Native CSV file picker (PR #33)

- CSV Import panel: "Browse…" button opens native OS file picker (`@tauri-apps/plugin-dialog`).
- Selected file is read from disk and loaded into the preview pipeline; textarea removed.
- Error shown if file cannot be read.

## v0.38.0 — Create new repository wizard (PR #32)

- `CreateRepositoryWizard` component: directory path, code, name, optional Git init.
- Backend: `create_repository_cmd` scaffolds YAML directory structure and optionally runs `git init`.
- Repository metadata serialised to `repository.yaml` on creation.
- Error feedback on name/code validation failure; success opens the new repository automatically.

## v0.37.0 — Safe publish flow foundation (PR #31)

- RepositoryPanel: safe publish section with Save, Validate, Commit steps.
- Commit requires: no unsaved app changes + validation passed without errors + non-empty message.
- Git status auto-refreshes after Save in publish flow.
- Push/pull button disabled when unsaved changes exist (later extended in PR #39).

## v0.36.0 — Edit/delete UI for entity types (milestone 35)

- Added `update_location`, `delete_location`, `update_rack`, `delete_rack`, `update_device_model`, `delete_device_model`, `update_device`, `delete_device` to `ris-application::RepositorySession`.
- New input types: `UpdateLocationInput`, `UpdateRackInput`, `UpdateDeviceModelInput`, `UpdateDeviceInput`.
- Referential integrity guards: location delete blocked if racks reference it; rack delete blocked if placements exist (also removes placement file); device model delete/type-change blocked if devices or rack-object placements reference it; device delete blocked if placed; device type change blocked if placed.
- Height reduction guard: `update_rack` rejects new `height_u` if any existing placement's `end_u` would exceed it.
- 22 new Rust tests in `crates/ris-application/tests/application_tests.rs` covering update/delete success and all guard conditions.
- New Tauri commands: `update_location_cmd`, `delete_location_cmd`, `update_rack_cmd`, `delete_rack_cmd`, `update_device_model_cmd`, `delete_device_model_cmd`, `update_device_cmd`, `delete_device_cmd`.
- `RackSummaryDto` extended with `description` and `tags`; `DeviceDto` extended with `device_model_id` and `tags`; `DeviceModelDto` extended with `tags`.
- New update DTOs: `UpdateLocationInputDto`, `UpdateRackInputDto`, `UpdateDeviceModelInputDto`, `UpdateDeviceInputDto`.
- New TypeScript API functions: `updateLocation`, `deleteLocation`, `updateRack`, `deleteRack`, `updateDeviceModel`, `deleteDeviceModel`, `updateDevice`, `deleteDevice`.
- New `joinTags(tags: string[]): string` utility in `src/lib/tags.ts`.
- All four catalog panels updated with Actions column (Edit / Delete); Edit pre-populates form inline; Delete uses `confirm()`.
- `RacksPanel.tsx`: delete deselects deleted rack; action buttons stop row-click propagation.
- All quality checks pass: 275 Rust workspace tests, 38 Vitest tests, TypeScript typecheck, Clippy, Vite build.

## v0.35.0 — Git remote sync foundation (milestone 34)

- Extended `ris-git` crate with remote sync: `list_remotes`, `add_remote`, `push_current_branch`, `pull_ff_only`.
- New `GitError` variants: `InvalidInput(String)` (name/URL validation), `DirtyWorkingTree` (pull blocked on dirty tree).
- `GitStatusSummary` extended: `upstream: Option<String>`, `ahead: Option<u32>`, `behind: Option<u32>`.
- `parse_branch_line` helper parses `## branch...upstream [ahead N, behind M]` format from `git status --porcelain=v1 --branch`.
- Remote name validation allows only ASCII letters, digits, `.`, `_`, `-` (defense-in-depth).
- `pull_ff_only` checks for dirty working tree before pulling; rejects with `DirtyWorkingTree` error.
- `push_current_branch` uses `-u` flag to set upstream tracking, calls `git push -u <remote> <branch>`.
- 11 new Rust integration tests in `crates/ris-git/tests/git_remote_tests.rs` using local bare repos (no network required).
- New Tauri commands: `list_git_remotes`, `add_git_remote`, `push_git_current_branch`, `pull_git_ff_only`.
- `pull_git_ff_only` drops session lock before the slow network operation; reloads `RepositorySession` from disk after success; returns updated `RepositorySummaryDto`.
- `build_summary` in `commands/repository.rs` changed to `pub(crate)` visibility for reuse from `commands/git.rs`.
- New DTOs: `GitRemoteDto`; `GitStatusDto` extended with `upstream`, `ahead`, `behind`.
- New TypeScript API: `GitRemoteDto`, `listGitRemotes()`, `addGitRemote()`, `pushGitCurrentBranch()`, `pullGitFfOnly()`.
- `RepositoryPanel.tsx` Git section extended:
  - Status table now shows Upstream and Sync (ahead/behind) rows when upstream is set.
  - **Configured remotes** table lists all remotes with name and URL.
  - **Add remote** form with name (default "origin") and URL inputs; validates blank fields; shows error/success.
  - **Push / Pull** section with remote selector, "Push current branch" and "Pull --ff-only" buttons.
  - Push and pull are disabled when `hasUnsavedChanges` is true; warning shown: "Save and commit local changes before syncing."
  - After add remote / push / pull: status, log, and remotes refresh automatically.
  - After successful pull: `onPullSuccess` callback fires to update `App.tsx` summary state.
- `App.tsx` passes `onPullSuccess={(s) => setSummary(s)}` to `RepositoryPanel`.
- Local checks: 30 ris-git tests pass (7 parser unit + 11 remote integration + 12 original), all 186 Rust tests pass, 38 Vitest tests pass, typecheck/clippy/build clean.
- Limitations (intentionally out of scope): no SSH/HTTPS auth configuration, no OAuth/token storage, no merge/rebase UI, no conflict resolution, no auto-commit/auto-push/auto-pull.

## v0.34.0 — Git workflow foundation (milestone 33)

- Implemented `ris-git` crate (was a stub): `is_git_repository`, `init_repository`, `status`, `recent_commits`, `commit_all` — all using `std::process::Command::new("git")` with args passed individually (no shell interpolation).
- `GitError` enum with variants: `GitNotFound`, `NothingToCommit`, `EmptyCommitMessage`, `CommandFailed`, `Io`.
- `status` parses `git status --porcelain=v1 --branch` output: branch name, staged/unstaged/untracked counts, is_clean flag, "No commits yet" note.
- `recent_commits` uses `--pretty=tformat:%H%x1f%h%x1f%s%x1f%an%x1f%ai` with `\x1f` field separator; handles empty repo (no commits) gracefully.
- `commit_all`: rejects blank message; runs `git add -A`; checks `git diff --cached --quiet` to detect nothing-to-commit before committing; returns the created commit.
- 12 new Rust integration tests in `crates/ris-git/tests/git_tests.rs` using `tempfile::TempDir` and local git identity configured per-repo.
- New Tauri commands: `get_git_status`, `init_git_repository`, `get_git_log`, `commit_repository_changes` in `commands/git.rs`.
- New DTOs: `GitStatusDto`, `GitCommitDto` in `dto.rs`.
- New TypeScript API: `GitStatusDto`, `GitCommitDto`, `getGitStatus()`, `initGitRepository()`, `getGitLog()`, `commitRepositoryChanges()` in `tauriClient.ts`.
- `RepositoryPanel.tsx` updated with a **Git** section shown when a repository is open:
  - Not a Git repo: "Not initialized" message + "Initialize Git repository" button.
  - Is a Git repo: branch, status (clean/dirty + counts), "Refresh Git status" button, recent commits table (max 5), commit message input + "Commit" button.
  - Commit button is disabled and a warning banner shown when there are unsaved in-memory changes.
  - Commit rejects blank message (frontend + backend).
  - After init or commit, status/log refreshes automatically.
- `App.tsx` passes `hasUnsavedChanges` to `RepositoryPanel`.
- Updated `docs/MVP_READINESS_REPORT_EN.md`: Git foundation marked as implemented; remaining blocker updated to remote sync.
- Updated README: test count (245 → 257), Git gap updated, limitations section updated.
- Local checks: 257 Rust tests pass (245 existing + 12 new), 38 Vitest tests pass, typecheck/build clean, Clippy clean.

## v0.33.0 — MVP smoke-test automation + readiness report (milestone 32)

- Added automated Rust integration smoke test (`crates/ris-application/tests/mvp_smoke_tests.rs`) covering the full non-Git inventory workflow end-to-end: open repository → add location, rack, device models, device → CSV preview (no mutation) → CSV import (2 devices) → 3 placements (device, CSV device, rack object) → move placement → remove placement → validate (no errors for smoke objects) → save → reload + verify persistence.
- Two additional negative smoke tests: invalid CSV preview yields `SkipDueToError`; import of `rack_object` device type is rejected and session is not mutated.
- Documented behavioral detail: CSV-imported devices without a `device_model_code` require an explicit `height_u` override at placement time.
- Added `docs/MVP_READINESS_REPORT_EN.md` — automated coverage table, current MVP-capable workflow, remaining blockers (Git workflow critical; 7 usability gaps acceptable for MVP), recommended next step.
- `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` reviewed and confirmed accurate; no wording changes required.
- Updated README: test count, "Remaining MVP gaps" table corrected to reflect current state.
- Local checks: 245 Rust tests pass (242 existing + 3 new smoke tests), 38 Vitest tests pass, typecheck/build clean, Clippy clean.

## v0.32.0 — Validation navigation drill-down (milestone 31)

- Added **Navigate** column to the validation issues table; each navigable issue shows a button ("Open Rack", "Open Device", "Open Location", "Open Device Model").
- Clicking a navigable issue switches the active tab and highlights/selects the relevant object.
- Rack issues: switch to Racks tab, auto-select the rack and open Rack Detail.
- Placement issues: switch to Racks tab, auto-select the rack and pass placement ID for highlight in Rack Detail; requires `rack_id` metadata.
- Device issues: switch to Devices tab, highlight the matching device row (yellow background).
- Device Model issues: switch to Device Models tab, highlight the matching model row.
- Location issues: switch to Locations tab, highlight the matching location row.
- Non-navigable issues (csv_file, csv_row, no object_type): show a dash in the Navigate column.
- Added `rack_id: Option<String>` to `ValidationIssue` (ris-core) and `ValidationIssueDto` (Tauri DTO).
- Added `issue_for_placement_f` helper in ris-validation that carries `rack_id`; placement validator updated to use it — all 15 per-placement issue calls now include the parent rack id.
- Navigation highlights are cleared when a new repository is opened or the current one is closed.
- New pure helper `apps/desktop/src/features/validation/navigation.ts` with `issueToNavigationTarget` and `navigationTargetLabel`.
- 14 new Vitest tests for the navigation helper covering all object types, placement with/without rack_id, unknown types, and label formatting.
- Updated `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` with step 16: Validation navigation drill-down.
- Local checks: 242 Rust tests pass, 38 Vitest tests pass (24 existing + 14 new), typecheck/build clean, Clippy clean.

## v0.31.0 — MVP smoke-test readiness + refresh coordination hardening (milestone 30)

- Introduced `repositoryMutationToken` (integer state) in `App.tsx`; incremented on every repository mutation.
- `handleRepositoryMutated()` in App: sets dirty state, increments token, and refreshes Repository Summary by calling `getRepositorySummary()` — counts in the Repository tab now update live after any mutation.
- All `onRepositoryMutated` callbacks that were inline `() => setHasUnsavedChanges(true)` now point to the shared `handleRepositoryMutated`.
- `DevicesPanel` and `DeviceModelsPanel` accept `mutationToken` and include it in their data-load `useEffect` deps — both panels now auto-refresh when devices or models are added from another tab (e.g. CSV Import).
- `RacksPanel` → `RackDetailPanel` → `AddPlacementPanel` token propagation: global `mutationToken` threaded through all three components so `AddPlacementPanel` reloads its target lists (unplaced devices + rack_object models) whenever any mutation happens in the session.
- Added `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` — 15-step end-to-end checklist covering open, create location/rack/device model/device, CSV import, placement, move, remove, validate, save, reload, and close-with-dirty-state.
- No changes to Rust backend or Tauri commands.
- Local checks: 242 Rust tests pass, 24 Vitest tests pass, typecheck/build clean, Clippy clean.

## v0.30.0 — CSV import preview + confirm/write flow (milestone 29)

- Added **CSV Import** tab with textarea paste, Preview, and Import buttons.
- Preview runs full server-side validation via `preview_devices_csv` (backed by existing `ris-import` crate) and returns per-row actions (create / skip_due_to_error).
- Preview shows summary (total, valid, error rows, warnings), file-level issues, row table with action/issues columns, and expandable row issue details.
- Import is blocked and button is disabled when preview has any ERROR; blocked banner shown.
- Confirm/write (`import_devices_csv`) re-runs full validation server-side before writing; refuses if any ERROR remains.
- Valid `Create` rows are written as new Device records via the existing `add_device` path; index is rebuilt.
- Import does not create placements, device models, rack_object devices, or update existing devices.
- `device_model_code` is resolved to `device_model_id` in the preview; import uses the resolved ID.
- New application-layer method `RepositorySession::import_devices_csv` with `DeviceCsvImportResult`.
- New Tauri commands `preview_device_csv_import_cmd` and `import_device_csv_cmd`.
- New TypeScript interfaces and wrappers: `previewDeviceCsvImport`, `importDeviceCsv`.
- CSV columns: code, device_type, name, device_model_code, serial_number, asset_tag, external_ref, status, tags (semicolon-separated).
- Required CSV columns: code, device_type, status.
- Successful import sets global dirty state; existing Save flow persists imported devices.
- 6 new Rust tests for `import_devices_csv`: valid create, save+reload persistence, missing header rejection, error row rejection, existing code rejection, rack_object rejection.
- Local checks: 242 Rust tests pass (236 existing + 6 new), 24 Vitest tests pass, typecheck/build clean, Clippy clean.

## v0.29.0 — Add Device UI foundation (milestone 28)

- Added **Add Device** form to the Devices tab (device_type, code, name, device model selector, serial number, asset tag, external ref, status, description, tags).
- Device type select includes only concrete device types: server, network, storage, ups, appliance, other. `rack_object` is excluded.
- Device model selector loads from `list_device_models`, excludes `rack_object` models, and filters to the selected device_type; clearing device_type resets the selector.
- If user changes device_type after selecting a model, the model is cleared if it no longer matches.
- Status select includes all allowed values: planned, in_stock, installed, to_remove, removed, disposed, unknown. Default is `planned`.
- Inline validation: device_type required, code required, status required, at least one of name/serial_number/asset_tag required.
- New Tauri command `add_device_cmd` wraps the existing application-layer `add_device` method. `device_type` and `status` strings are parsed via `from_str` in the command layer; backend handles all domain validation (duplicate code, model type mismatch, rack_object rejection, etc.).
- New TypeScript API wrapper `addDevice` / `AddDeviceInput` in `tauriClient.ts`.
- Successful add refreshes devices list, sets global dirty state, shows unsaved changes banner.
- After successful add, selected device_type and status are kept for batch-entry convenience.
- `DevicesPanel` adopts `prevRepoPathRef` cleanup pattern for repository switch (consistent with other panels).
- Existing save flow persists newly added devices.
- Local checks: 236 Rust tests pass (application-layer `add_device` already has comprehensive tests), 24 Vitest tests pass, typecheck/build clean, Clippy clean.

## v0.28.0 — Add Device Model UI foundation (milestone 27)

- Added **Add Device Model** form to the Device Models tab (device_type, code, name, vendor, model number, height U, description, tags).
- Device type select includes all allowed values: server, network, storage, ups, appliance, rack_object, other.
- When `rack_object` is selected, a contextual hint explains that rack objects can be placed directly in racks without creating a Device.
- New Tauri command `add_device_model_cmd` exposes the existing application-layer `add_device_model` method.
- `DeviceType` string is parsed in the command layer via `DeviceType::from_str`; backend remains source of truth for validation.
- New TypeScript API wrapper `addDeviceModel` / `AddDeviceModelInput` in `tauriClient.ts`.
- `default_height_u` uses the existing `parsePositiveInt` helper; tags use the existing `parseTags` helper.
- Successful add sets global unsaved-changes dirty state, shows the unsaved banner, and refreshes the device model list immediately.
- After successful add, selected device type is kept in the form for convenience when adding multiple models of the same type.
- Existing save flow persists newly added device models.
- `DeviceModelsPanel` adopts `prevRepoPathRef` cleanup pattern (same as LocationsPanel / RacksPanel) so stale state is cleared on repository switch.
- Local checks: 236 Rust tests pass (application-layer `add_device_model` already has comprehensive tests), 24 Vitest tests pass, typecheck/build clean, Clippy clean.

## v0.27.0 — Add Location/Rack UI foundation (milestone 26)

- Added **Add Location** form to the Locations tab (code, name, description, address, tags).
- Added **Add Rack** form to the Racks tab (location selector, code, name, height U, row, description, tags).
- New Tauri commands `add_location_cmd` and `add_rack_cmd` expose the existing application-layer `add_location` / `add_rack` methods.
- New TypeScript API wrappers `addLocation` / `addRack` in `tauriClient.ts`.
- Added `parseTags` helper in `src/lib/tags.ts` with 6 Vitest tests.
- Successful add sets global unsaved-changes dirty state and shows the unsaved changes banner.
- New location appears immediately in the Locations list; new rack appears immediately in the Racks list with 0/0/0 counts.
- Existing save flow persists new locations and racks.
- Local checks: 236 Rust tests pass (no new tests needed — application-layer add_location/add_rack already have good coverage), 24 Vitest tests pass (18 existing + 6 new), typecheck/build clean, Clippy clean.

## v0.26.0 — roadmap realignment after rack workflow milestones

- Roadmap updated to reflect the real state after milestones 15–25: core backend complete, rack placement workflow usable via forms (add, move, remove, cross-rack, cross-side).
- Drag and drop moved from MVP blocker to post-MVP UX enhancement. Form-based placement operations are sufficient for MVP.
- Remaining MVP blockers clarified: Add/Edit UI for locations, racks, device models, and devices; CSV import confirm/write flow; validation navigation/drill-down; Git workflow (status, pull, publish, conflict branch); MVP smoke-test readiness.
- README, IMPLEMENTATION_PLAN_EN, UI_SCREENS_SPEC_EN, USER_WORKFLOWS_EN, and SPEC_EN updated.

## v0.25.0 — rack placement counts (milestone 25)

- Added `front_placement_count` and `rear_placement_count` to `RackSummaryDto` (Rust + TypeScript) alongside the existing `placement_count` total.
- Updated `list_racks` Tauri command to compute per-side counts from `placement_files`.
- Updated `RacksPanel` table: "Placements" column replaced by three columns — Front, Rear, Total.
- `RacksPanel` now reloads the rack list after every mutation (add/move/remove) so counts stay current without a page refresh.
- Added 6 Rust tests covering count behavior: initial fixture, place front, remove, same-side move (unchanged), cross-side move, cross-rack move.
- Local checks: 236 Rust tests pass, 18 Vitest tests pass, typecheck/build clean, Clippy clean.

## v0.24.0 — pnpm toolchain refresh (milestone 24)

- Updated root `package.json` `packageManager` from `pnpm@9.0.0` to `pnpm@10.33.4` (current stable pnpm 10 series, compatible with Node 22 LTS).
- `pnpm-lock.yaml` unchanged: pnpm 10 uses the same `lockfileVersion: '9.0'` schema; running `pnpm install` with the new version reported "Lockfile is up to date" with zero diff.
- CI unchanged: `pnpm/action-setup@v6` reads `packageManager` from `package.json` automatically; no explicit version input needed in the workflow.
- No dependency upgrades; no application code, Rust logic, or frontend behavior changed.
- Local checks: 160 Rust tests pass, 18 Vitest tests pass, typecheck/build clean, `pnpm install --frozen-lockfile` passes.

## v0.23.0 — CI Node 22 compatibility cleanup (milestone 23)

- Updated GitHub Actions CI workflow: `node-version: 20` → `node-version: 22` (Node.js 22 LTS, current stable LTS since October 2024). Project/frontend commands run on Node 22 LTS.
- Upgraded `pnpm/action-setup@v4` → `pnpm/action-setup@v6`: `action.yml` now declares `runs: using: node24`, eliminating the Node.js 20 action-runtime deprecation warning for that action.
- Upgraded `actions/setup-node@v4` → `actions/setup-node@v6`: `action.yml` now declares `runs: using: node24`, eliminating the Node.js 20 action-runtime deprecation warning for that action. `cache: pnpm` remains supported in v6.
- `actions/checkout@v5` remains unchanged; it already uses the Node.js 24 runtime natively.
- `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env var removed; native node24 action versions make it unnecessary.
- No application code, Rust logic, or frontend behavior changed.
- Local checks: 160 Rust tests pass, 18 Vitest tests pass, typecheck/build clean.

## v0.22.0 — Destination navigation polish (milestone 22)

- `pendingNavigation` in `RacksPanel` is now cleared after `RackDetailPanel` consumes `initialNavigation` — whether the placement was found, missing, or the detail load failed — via a new `onNavigationConsumed` callback. Previously it remained set until the next manual rack row click.
- Destination rack row in the racks table is highlighted with a soft green tint (`#d5ebd5`) after automatic cross-rack navigation. The highlight is cleared when the user manually clicks any rack row, another cross-rack navigation occurs, or the repository changes.
- No Rust changes; no new Tauri commands; no CSV import UI; no Git workflow; no drag and drop.
- Rust checks pass (160 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (18 passing), and Vite build pass (177 KB bundle).

## v0.21.0 — Cross-rack move navigation UX (milestone 21)

- After a successful cross-rack placement move, the app automatically navigates to the destination rack: the destination rack becomes selected, its detail loads, and the moved placement is selected in the diagram, table, and inspector when found.
- Success message on destination rack reads: "Moved to rack <CODE> in memory. Use Save to persist changes."
- If the destination rack is not in the current racks list (not found), navigation does not occur; the previous fallback message ("Moved to another rack in memory…") is shown on the current rack instead.
- If the destination rack loads but the moved placement is not found in its detail, selection is cleared and a non-blocking message is shown.
- Same-rack and cross-side same-rack moves are unchanged: current rack detail refreshes, placement stays selected when possible.
- Callback chain: `PlacementInspectorPanel` passes `destRackId` to `RackDetailPanel`; `RackDetailPanel` calls `onNavigateToRackPlacement` on `RacksPanel`; `RacksPanel` sets `pendingNavigation` (placement ID + message) and calls `onSelectRack(destRack)` on App; the new `RackDetailPanel` for the destination rack consumes `initialNavigation` after its detail loads.
- Global unsaved changes banner appears immediately after cross-rack move (before navigation render completes).
- No new Tauri commands; no Rust changes; no CSV import UI; no Git workflow; no drag and drop.
- Rust checks pass (160 tests, clippy clean, fmt clean, check clean).
- TypeScript typecheck, Vitest (18 passing), and Vite build pass (177 KB bundle).

## v0.20.0 — Side/rack move foundation (milestone 20)

- Added `MovePlacementToTargetInput` struct and `move_placement` application method to `RepositorySession`. Supports changing rack, side, start U, and optional height override in a single operation. Keeps the existing `move_placement_within_side` / `MovePlacementInput` unchanged so all existing application tests continue to pass unmodified.
- The Tauri `move_placement` command now delegates to `session.move_placement(...)` instead of `session.move_placement_within_side(...)`. The `MovePlacementInputDto` gains two optional fields: `new_rack_id` and `new_side`; missing/null values default to the placement's current rack and side (backward-compatible with serde).
- `PlacementInspectorPanel`: move form extended with a Rack selector (populated via `listRacks()`) and a Side selector. Defaults to the current rack and current side when a placement is selected. The form can now express same-rack same-side, same-rack cross-side, and cross-rack moves without switching racks.
- `PlacementInspectorPanel` accepts a new `currentRack: RackSummaryDto` prop; `RackDetailPanel` passes `rack` for this prop.
- `PlacementInspectorPanel` loads the rack list once on mount; shows a loading indicator while loading and an error if the load fails; Move button is disabled while racks are loading.
- Success message distinguishes same-rack ("Moved in memory…") from cross-rack ("Moved to another rack in memory…") moves.
- After a successful cross-rack move, `RackDetailPanel.refreshAfterMutation` finds the placement absent from the refreshed rack detail and clears the selection automatically.
- Stale response protection (`cancelled` flag in `AddPlacementPanel`) is unaffected.
- `AddPlacementPanel` Retry UX is unaffected.
- Added 8 new Rust application-layer tests for `move_placement` covering: same-rack/same-side, same-rack front→rear, rack-to-rack, overlap rejection, missing-placement rejection, missing-destination-rack rejection, out-of-bounds rejection, and save/reload persistence.
- No new Tauri commands; no CSV import UI; no Git workflow; no drag and drop.
- All Rust checks pass (160 tests, clippy clean, fmt clean, check clean).
- TypeScript typecheck, Vitest (18 passing), and Vite build pass (176 KB bundle).

## v0.19.0 — Target-load Retry UX (milestone 19)

- `AddPlacementPanel`: added a `manualRetryToken` state (integer counter); when the user clicks "Retry" on a `targetLoadError`, `manualRetryToken` is incremented and triggers the existing target-load effect.
- The existing `useEffect` for loading targets now depends on `[rack.id, reloadToken, manualRetryToken]`; the effect already clears `targetLoadError` and sets `targetsLoading` at the start, so Retry re-uses all existing loading and error state machinery without duplication.
- Stale async response protection (`cancelled` flag) remains fully effective: incrementing `manualRetryToken` triggers a new effect run whose cleanup cancels any in-flight response from the previous attempt.
- Retry does not reset form inputs (start U, height U, side, device/model selection) or clear the Add success message; those are only cleared on rack switch, as before.
- `submitError` remains separate from `targetLoadError`; Retry has no effect on `submitError`.
- Target dropdowns and Add button remain disabled while retry is in progress (`targetsLoading === true`).
- No new Tauri commands; no new mutation types; no Rust changes.
- All Rust checks pass (222 tests, clippy clean, fmt clean, check clean).
- TypeScript typecheck, Vitest (18 passing), and Vite build pass (174 KB bundle).

## v0.18.0 — AddPlacementPanel UX hardening (milestone 18)

- `AddPlacementPanel`: added `targetsLoading` state; target dropdowns and Add button are disabled while the list loads; a "Loading available targets…" inline message is shown during load.
- `AddPlacementPanel`: separated `targetLoadError` (shown on failed target-list fetch) from `submitError` (shown on validation failure or add-mutation failure); a successful target reload clears `targetLoadError` without touching an active `submitError` or success message.
- `AddPlacementPanel`: load effect now uses a `cancelled` flag to discard stale responses; rapidly switching racks or triggering reloadToken changes can no longer let an older `listDevices`/`listDeviceModels` response overwrite a newer target list.
- `AddPlacementPanel`: success message survives target-list reloads (unchanged from v0.17.0); clearing rules unchanged — rack switch clears it, mode/target/U field edits clear it.
- Extracted `parsePositiveInt` to `apps/desktop/src/features/racks/positiveInt.ts`; removed the duplicated inline copy from both `AddPlacementPanel` and `PlacementInspectorPanel`.
- Added 9 Vitest unit tests for `parsePositiveInt` in `positiveInt.test.ts` covering empty, whitespace, valid integers with surrounding whitespace, zero, negative, decimal, non-numeric, and leading-zero inputs.
- No Rust changes; no new Tauri commands; no new mutation types.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (18 passing), and Vite build pass (174 KB bundle).

## v0.17.0 — Mutation refresh coordination (milestone 17)

- `RackDetailPanel`: replaced three separate post-mutation refresh paths (`refreshAndSelect`, `handleRemoveSuccess` inline fetch) with a single `refreshAfterMutation({ selectId?, bumpTargets? })` helper. All three handlers (move, add, remove) now call this helper.
- `AddPlacementPanel`: added `reloadToken: number` prop. Split the single combined `useEffect` into two: one that resets form state on `rack.id` change, and one that reloads target lists on `rack.id` or `reloadToken` change. Extracted a `loadTargets()` local function used by the load effect.
- After removing a device placement, `RackDetailPanel` bumps `targetReloadToken`; `AddPlacementPanel` reloads its device list so the freed device reappears immediately without switching rack away/back.
- After adding a device placement, `targetReloadToken` is also bumped; the device list reloads and confirms the placed device is gone.
- Add success message survives target-list reloads (only cleared on rack switch, not on reload).
- Selection behavior: add selects new placement, move keeps moved placement selected, remove clears selection. All rely on the same helper.
- No Rust changes; no new Tauri commands.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (9 passing), and Vite build pass (174 KB bundle).

## v0.16.0 — Remove placement UI (milestone 16)

- Added `remove_placement` Tauri command: accepts `placement_id`; delegates to `RepositorySession::remove_placement`; requires an open repository; does not auto-save; returns `()` on success.
- Added `RemovePlacementInputDto` Rust DTO in `dto.rs`.
- Extended `tauriClient.ts` with `RemovePlacementInput` and `removePlacement()`.
- `PlacementInspectorPanel` now shows a "Remove placement" section when a placement is selected: a red "Remove placement" button, a `window.confirm` dialog with the placement code before mutating, inline error on failure, button disabled while working.
- Confirmation message: `Remove placement <CODE> from this rack? This change is in memory until Save is used.`
- After successful remove: `onRemoveSuccess` is called, which triggers `onRepositoryMutated` (global unsaved banner appears), clears selected placement, and refreshes rack detail; diagram and placement tables update immediately.
- `AddPlacementPanel` reloads unplaced devices and rack object models when the rack changes; after a remove the panel continues to work correctly; devices become available again after switching rack away and back (or after re-opening the panel).
- Existing add, move, save, and close-with-dirty workflows are unaffected.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (9 passing), and Vite build pass (174 KB bundle).

## v0.15.0 — Add placement UI foundation (milestone 15)

- Added `place_device` Tauri command: accepts `rack_id`, `device_id`, `side` ("front"/"rear"), `start_u`, optional `height_u`; delegates to `RepositorySession::place_device`; requires an open repository; does not auto-save; returns the new placement ID.
- Added `place_rack_object` Tauri command: accepts `rack_id`, `device_model_id`, `side`, `start_u`, optional `height_u`; delegates to `RepositorySession::place_rack_object`; requires an open repository; does not auto-save; returns the new placement ID. Only `rack_object` type models are valid targets.
- Added `PlaceDeviceInputDto` and `PlaceRackObjectInputDto` Rust DTOs in `dto.rs`.
- Extended `tauriClient.ts` with `PlaceDeviceInput`, `PlaceRackObjectInput`, `placeDevice()`, `placeRackObject()`.
- Added `AddPlacementPanel` component in rack detail area: mode selector (Device / Rack Object), side selector, target dropdown (unplaced devices or rack_object models), start U, optional height U override, inline error/success.
- Unplaced devices list is derived from `listDevices()` filtered by `is_placed === false`; rack object models from `listDeviceModels()` filtered by `device_type === "rack_object"`.
- After successful add: rack detail refreshes, newly added placement is selected, global unsaved changes banner appears.
- `RackDetailPanel` refactored: `refreshAndSelect` helper shared between move and add success paths.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (9 passing), and Vite build pass (173 KB bundle).

## v0.14.0 — Project state and save UX cleanup (milestone 14)

- **README refresh** — rewrote README to accurately describe v0.13.0 state: lists all supported UI features (rack diagram, placement inspector, move form, global unsaved banner, close confirmation), replaces stale claims ("no rack visualization", "M8 is current", "only Locations and Racks"), and updates limitations section.
- **MANIFEST.md archival** — marked MANIFEST.md as an archival starter-pack document; points readers to README and CHANGELOG for current status.
- **AI script: default base branch** — `build-review-context.sh` now defaults to `master` instead of `main`.
- **AI script: pnpm-lock.yaml visible** — `build-review-context.sh` no longer excludes untracked `pnpm-lock.yaml` from review context; CI uses `--frozen-lockfile` so a changed lockfile is important review context.
- **AI script: build-fix-prompt.sh removed** — the fix-prompt script has been removed. The review workflow now goes directly from `build-review-context.sh` to ChatGPT, which provides a corrective prompt to paste into Claude Code.
- **CLAUDE.md** — branch rule updated to say "master/main"; `master` noted as the standard base branch for this repo.
- **Global unsaved changes banner** — `App` now owns `hasUnsavedChanges` state; a yellow banner is shown at the top regardless of which tab is active; banner clears on successful save, on open, and on close.
- **Close confirmation when dirty** — if there are unsaved changes and the user clicks Close, a `confirm()` dialog warns that in-memory changes will be lost; cancelling aborts the close.
- **Dirty state clears after save** — `ValidationPanel` accepts an `onSaveSuccess` callback; `App` clears `hasUnsavedChanges` only after `save_current_repository` succeeds.
- **Move success message** — `PlacementInspectorPanel` now shows "Moved in memory. Use Save to persist changes." instead of the misleading "Refreshing rack…" which persisted after the refresh completed.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (9 passing), and Vite build pass (168 KB bundle).

## v0.13.0 — Placement move action foundation (milestone 13)

- Added `move_placement` Tauri command: accepts `placement_id`, `new_start_u`, and optional `new_height_u`; delegates to `RepositorySession::move_placement_within_side`; requires an open repository; does not auto-save.
- Added `MovePlacementInputDto` in Rust and `MovePlacementInput` + `movePlacement()` in TypeScript API wrapper.
- `PlacementInspectorPanel` now contains a "Move placement (same side)" form: inputs default to the selected placement's current `start_u` and `height_u`; frontend validates positive integer inputs before calling the command; shows inline error on failure.
- After a successful move, `RackDetailPanel` automatically re-fetches rack detail from the backend, restoring the moved placement as the selected item (or clearing selection if it can no longer be found).
- The diagram, front table, and rear table all update immediately to reflect the new placement position.
- A yellow "unsaved changes" banner appears after any successful move, reminding users to Save via the Validation tab to persist changes to disk. The banner resets when a different rack is selected.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest (9 passing), and Vite build pass (168 KB bundle).

## v0.12.0 — Read-only placement inspector (milestone 12)

- Placement cells in `RackUnitDiagram` are now clickable: occupied and incomplete cells select the placement; clicking an empty cell clears the selection.
- Selected placement is visually highlighted in the diagram with a gold ring and a darker background; all U-rows of a multi-U placement show selected state simultaneously.
- Placement table rows in `RackDetailPanel` are now clickable; clicking the selected row again deselects it.
- Selection is shared between the diagram and both placement tables — a click in any one reflects in all.
- Added `PlacementInspectorPanel`: shows an empty-state hint when nothing is selected; when a placement is selected displays all `PlacementDto` fields (code, side, target kind/code/name/ID, device type, start U, end U, explicit/effective height, note, tags) with `—` for null/empty fields.
- `RackDetailPanel` owns `selectedPlacement` state; selection resets when a different rack is selected, when a repository is opened or closed, and when rack detail reloads.
- Side (Front / Rear) is derived in `RackDetailPanel` from the placement's presence in `detail.front` / `detail.rear` — no backend changes required.
- No Rust backend changes; all new logic is pure TypeScript frontend.
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck, Vitest tests (9 passing), and Vite build pass (165 KB bundle).

## v0.11.0 — UX hardening and occupancy tests (milestone 11)

- Added Vitest v2 as the frontend test framework; `pnpm test` runs `vitest run`.
- Added 9 unit tests for `rackOccupancy.ts` covering: empty rack, single-U placement, multi-U grouping with `isTop`, `end_u` derived from `effective_height_u`, incomplete placement (no height, no model), out-of-bounds `start_u` (below/above rack), clamped `end_u`, and overlapping placements.
- `buildOccupancy` now detects overlapping placements and emits a warning naming both placement codes and the conflicting U slot.
- All list panels (`LocationsPanel`, `DevicesPanel`, `DeviceModelsPanel`, `RacksPanel`) clear their data array before each async fetch, eliminating stale rows on repository switch.
- `App.tsx` resets `selectedRack` on successful repository open (previously only reset on close).
- `RackUnitDiagram` diagram grid wrapped in a scroll container (`maxHeight: 60vh`, `overflowY: auto`) so tall racks remain usable without scrolling the whole page.
- Added a Frontend tests step to the CI `frontend` job (runs between TypeScript check and Vite build).
- All Rust checks pass (222 tests, clippy clean, fmt clean).
- TypeScript typecheck and Vite build pass (162 KB bundle).

## v0.10.0 — Read-only rack unit diagram (milestone 10)

- Added `RackUnitDiagram` component — visual column diagram showing front and rear sides, U numbers top to bottom.
- Added `rackOccupancy.ts` helper — derives per-U occupancy from `PlacementDto` data; handles missing `end_u`, clamping out-of-bounds placements, and incomplete height with warnings.
- Occupied U ranges are visually grouped: top cell rendered in a darker shade, label shown at the top cell only.
- Empty, occupied, and incomplete-height slots are colour-coded with a legend.
- Placement cells show `target_code` (or fallback to `target_name`/`code`) and have a tooltip with the full placement code.
- Out-of-bounds or incomplete placements surface warnings beneath the diagram — do not crash the UI.
- `RackDetailPanel` now renders: metadata table → rack diagram → front/rear placement detail tables.
- No Rust backend changes — all new logic is pure TypeScript frontend.
- All Rust checks pass (222 tests, clippy clean).
- TypeScript typecheck and Vite build pass (161 KB bundle).

## v0.9.0 — Read-only navigation and rack detail (milestone 9)

- Added `DevicesPanel` — lists all devices with code, type, name, status, serial, asset tag, model, placed flag.
- Added `DeviceModelsPanel` — lists all device models with code, type, name, vendor, model number, height.
- Added `Devices` and `Device Models` tabs to the main tab bar (disabled when no repo open).
- Added rack row selection to `RacksPanel`: click a row to select, click again to deselect.
- Added `RackDetailPanel` — shows rack metadata and front/rear placement tables with resolved target info.
- Added `get_rack_detail` Tauri command returning `RackDetailDto` with resolved placements.
- Added `PlacementDto` and `RackDetailDto` backend DTOs; placement target names and codes are resolved from device/device-model indexes.
- Placements sorted by `start_u` ascending within each side.
- Extended `tauriClient.ts` with `PlacementDto`, `RackDetailDto`, and `getRackDetail`.
- Closing a repository resets selected rack state.
- All Rust checks (`cargo fmt`, `cargo clippy -D warnings`, `cargo test`) pass (222 tests green).
- TypeScript typecheck and Vite build pass.

## v0.8.0 — Frontend foundation cleanup (milestone 8)

- Rewrote README to reflect real project state, architecture, and capabilities.
- Added CHANGELOG (this file).
- Updated CI to trigger on both `main` and `master` branches.
- Added frontend CI job: pnpm install, TypeScript check, Vite build.
- Added `typecheck` script to desktop package.json.
- Added four read-only Tauri commands: `list_locations`, `list_racks`, `list_devices`, `list_device_models`.
- Added corresponding DTOs: `LocationDto`, `RackSummaryDto`, `DeviceDto`, `DeviceModelDto`.
- Extended TypeScript API layer (`tauriClient.ts`) with new types and invoke wrappers.
- Refactored monolithic `App.tsx` into tab-based layout with dedicated feature panels:
  - `RepositoryPanel` — open/close/summary
  - `ValidationPanel` — validate/save/issues
  - `LocationsPanel` — locations list
  - `RacksPanel` — racks list
- Added shared `TabBar` component and common styles module.
- Updated `build-review-context.sh` to default to a timestamped output filename.
- Updated `CLAUDE.md` AI instructions to document timestamped review-context handoff.
- Repomix output now saved to `repomix/` directory with timestamped filename.

## v0.7.0 — Minimal Tauri shell (milestone 7)

- Native repository folder picker via `tauri-plugin-dialog`.
- Tauri commands: open, save, validate, close repository.
- React UI: repository summary, validation panel, save/close controls.

## v0.6.0 — Application layer (milestones 6A + 6B)

- `ris-application`: `RepositorySession` — open, save, validate.
- Add location, rack, device model, device mutations with full validation.
- Global cross-entity duplicate ID enforcement.
- Placement use cases: place_device, place_rack_object, move_placement_within_side, remove_placement.
- Collision detection (same-side only), bounds checking, effective height resolution.
- `no-placement-files-repository` test fixture.

## v0.5.0 — YAML writer (milestone 5)

- `ris-repository`: `write_repository` preserving original file paths via `RepositoryLayout`.
- Idempotent writes: Created / Updated / Unchanged per file.
- Write-back safety tests with non-canonical fixture.

## v0.4.0 — CSV import preview (milestone 4)

- `ris-import`: `preview_csv_import` — read-only, never writes.
- VAL-CSV-001 through VAL-CSV-019 validators.

## v0.3.0 — Validation engine (milestone 3)

- `ris-validation`: `ValidationEngine` with 36 VAL-* rules.
- Tolerant `load_raw` in `ris-repository` — never fails, collects issues.

## v0.2.0 — YAML loader + index (milestone 2)

- `ris-repository`: strict `load`, `RepositoryIndex` with by-id and by-code lookups.

## v0.1.0 — Core domain (milestone 1)

- `ris-core`: Device, DeviceModel, DeviceType, DeviceStatus, Location, Rack, Placement, PlacementFile, PlacementRange, PlacementSide, ValidationIssue, RepositoryMetadata.

## v0.1.0-planning

- Initial project documentation.
- Data model v0.1.
- Validation and CSV specification.
- User workflows, UI screen specification, architecture specification, technology stack decision, implementation plan.
- Coding starter structure.
