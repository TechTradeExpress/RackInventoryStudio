# Changelog

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
