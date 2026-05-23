# Post UI Polish QA — Integration Plan

## Integration branch

**Branch:** `integration/post-ui-polish-qa`
**Base branch:** `master`
**Created from:** `master` after merge of `design/claude-ui-polish`

## Branch workflow

- All working branches are cut from `integration/post-ui-polish-qa`.
- All working branch PRs target `integration/post-ui-polish-qa`, **not** `master`.
- The final PR from `integration/post-ui-polish-qa` → `master` is opened only after the full series is complete and approved.

## Review context rules

- **Working branch review context:** generated relative to `integration/post-ui-polish-qa`
  ```bash
  TS=$(date +%Y%m%d-%H%M)
  bash scripts/ai/build-review-context.sh integration/post-ui-polish-qa ".ai/review-context-${TS}.md"
  ```
- **Final integration branch review context:** generated relative to `master`
  ```bash
  TS=$(date +%Y%m%d-%H%M)
  bash scripts/ai/build-review-context.sh master ".ai/review-context-${TS}.md"
  ```

## Baseline checks (detected on branch creation, 2026-05-22)

| Item | Status |
|---|---|
| `.github/workflows/windows-installer.yml` | **EXISTS** — manual-only `workflow_dispatch` |
| `.ai/windows-installer-ci.md` | **EXISTS** |
| `.ai/local-diagnostics-logging.md` | **EXISTS** |
| `tauri-plugin-log` in `Cargo.toml` | **PRESENT** |
| `@tauri-apps/plugin-log` in `package.json` | **PRESENT** |
| `scripts/ai/build-review-context.sh` | **EXISTS** |
| `.ai/cc-report.md` | **EXISTS** |

**Consequences:**
- `ci/windows-diagnostic-installer` can build on the existing manual workflow and existing `tauri-plugin-log` — no prerequisite branch needed.
- No separate `chore/local-diagnostics-logging` prerequisite is required.

## Working branch order

### 1. `repo/force-git-init`
Force Git on new repository creation.
- Remove or replace `Initialize Git repository` checkbox with a read-only note.
- Tauri backend must enforce `git init`; failure blocks repository creation.
- Error from `git init` surfaces as a blocking UI error.

### 2. `repo/unsaved-guard-recent-open`
Unsaved-changes guard before destructive navigation.
- Show `ConfirmDialog` before close / open / create / exit when there are unsaved changes.
- `Open` in Recent repositories opens the repo immediately (no extra confirm if no unsaved changes).
- Clicking outside the `Open` button in Recent still only fills the path field, not opens.

### 3. `perf/git-status-cache`
Cache Git status; remove automatic polling.
- No automatic `get_git_status` call on every Repository panel visit.
- Add manual `Refresh Git status` button.
- Auto-refresh only after save / commit / pull / push / open / create.
- Loading indicator scoped to the Git section only.

### 4. `ux/location-scoped-racks`
Manage racks in the context of a selected location.
- Navigate from Locations → `Racks in <location>`.
- Add Rack automatically assigns the current location.
- Edit Rack does not allow changing the location field.
- Backend blocks `location_id` update via the update command.
- No rack-move-between-locations flow.

### 5. `ux/rack-form-polish`
Minor polish to the Rack form.
- Rename `Row` label to `Rack row / aisle`.
- Improve placeholder text and help text.
- Default `Height (U)` based on existing racks in the same location.
- Do not override manually entered values.

### 6. `ux/csv-sample-import`
Add sample CSV download.
- `Download sample CSV` button (and optionally `Use sample`).
- Sample is consistent with the current import schema.
- `device_model_code` empty in the sample so it works in a fresh repo.
- Unit test for the CSV sample generator helper.

### 7. `ux/validation-save-copy`
Clarify Validation and Save copy.
- Explain Errors / Warnings / Info categories in Validation panel.
- Add a simple validation status indicator.
- Clarify `created / updated / unchanged` numbers in Save inventory outcome.
- No changes to validation logic or save logic.

### 8. `assets/app-icon`
App icon implementation.
- Prepare and deploy application icon.
- If a Claude Design pass is needed, document it as a design step before implementation.
- Add icon assets to Tauri.
- Verify icon appears in the app and in the Windows installer.

### 9. `ci/windows-diagnostic-installer`
Diagnostic Windows installer with verbose logging.
- Manual-only `workflow_dispatch` workflow (extend existing workflow or add a separate one).
- Artifact serves as a diagnostic / QA installer.
- Debug-level logging for diagnostic builds.
- Logs remain file-only (existing `tauri-plugin-log` behavior).
- Investigate Windows console log output: if feasible and safe, add it; if risky, mark as deferred.
- Final production installer is a separate future step.

### 10. `qa/post-ui-polish-final`
Final QA and integration gate.
- Final automated checks across the integration branch.
- Tidy up `.ai/` reports.
- Manual trigger of Windows Installer workflow.
- Test on clean Windows 11.
- Verify log file creation and log content.
- Generate final review context of `integration/post-ui-polish-qa` relative to `master`.
- Open final PR to `master`.
