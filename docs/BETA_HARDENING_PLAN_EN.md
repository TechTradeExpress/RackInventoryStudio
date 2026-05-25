# Rack Inventory Studio — Beta Hardening Plan

## Release direction

**V1 is intentionally on hold.**

The next release target is a beta hardening release — referred to here as **Beta 0.2.x** (the maintainer may choose a different exact version number before tagging). This is not a feature-expansion release. The goal is to harden the existing application — UX stability, operational reliability, consistent versioning, installer naming, and rack placement workflow — before a future V1 release.

The MVP core is functionally complete. What remains before V1 is a set of UX, operational, and release-process gaps that this beta hardening track closes.

## Current baseline

| Area | State |
|---|---|
| Application stack | Tauri 2 + React 18 + TypeScript 5 (desktop); Rust workspace crates (domain/backend) |
| Data model | YAML repository files in a local Git repository |
| Git integration | init, status, commit, log, push (`git push -u`), pull (fast-forward); safe publish checklist in UI |
| Windows Installer workflow | Manual `workflow_dispatch`; unsigned NSIS installer on `windows-latest` |
| Diagnostics logging | Local log file in `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\`; no telemetry; accessible via Settings → Diagnostics and logs |
| Location-scoped rack management | Racks are managed from Location context via "Manage racks"; Add Rack uses context location |
| Rack detail | Front/Rear segmented control; rack diagram (drag/drop placement); placement table; placement inspector; needs UX redesign |
| Test coverage | 358 Rust workspace tests · 315 Vitest frontend tests · 10 Playwright smoke tests |

## Milestone 1 — Global busy overlay and Git UX blockers

### Goal

Users should always see a clear busy state while long-running operations execute. Navigation and content areas must not silently ignore clicks mid-operation. On Windows, no transient cmd/console window should flash when Git commands run.

### Tasks

**Global application busy overlay**

- Add a full-screen overlay with a spinner that renders above all page content when any long-running operation is in progress.
- The overlay must block navigation rail clicks and content-area interactions until the operation completes.
- Use a short delay (e.g. 150–200 ms) before showing the overlay to avoid flicker on fast operations.
- Ensure the overlay is rendered and visible before the long operation starts — not after it returns.
- Operation labels to display in the overlay:
  - Opening repository…
  - Creating repository…
  - Checking Git status…
  - Saving changes…
  - Validating repository…
  - Committing changes…
  - Pushing to remote…
  - Pulling from remote…
  - Previewing CSV…
  - Importing CSV…

**Backend — async and lock hygiene**

- Investigate whether slow Git/Tauri commands should use `async` with `spawn_blocking` to avoid blocking the async runtime on long I/O.
- Avoid holding session locks longer than necessary; release locks before returning to the frontend so the overlay can clear promptly.

**Windows — hide Git console windows**

- Apply `CREATE_NO_WINDOW` (Windows-only) in the central `ris-git` command helper so no transient cmd/console window appears when Git commands execute on Windows.
- Continue using `std::process::Command::new("git")` with individual argument passing. Do not switch to `cmd /C` or shell-string execution.
- The `CREATE_NO_WINDOW` flag must be applied only on Windows (conditional compilation or runtime platform check).

### Acceptance criteria

- User sees a labeled busy overlay during every long Git/app operation.
- Navigation clicks during a busy operation are blocked, not silently ignored.
- No transient cmd/console window appears during Git actions on Windows.
- All existing Rust workspace tests and Vitest frontend tests pass.
- Windows 11 manual QA confirms overlay and console-window behavior.

## Milestone 2 — Versioning and beta release process

### Goal

Version numbers must be consistent across all files in the repository. Installer artifacts must carry the actual app version in their names. The maintainer must have a clear, repeatable beta release checklist.

### Tasks

**Version consistency**

- Version must be consistent across all four locations:
  - `package.json` (root)
  - `apps/desktop/package.json`
  - `apps/desktop/src-tauri/Cargo.toml` (`[package] version`)
  - `apps/desktop/src-tauri/tauri.conf.json` (`version` field)
- Add a version consistency check: either a script (`scripts/check-version.sh` or similar) that reads all four locations and exits non-zero if they differ, or a single source of truth approach (e.g. a `VERSION` file that a script syncs into all four).
- Decide on the approach (script-driven sync vs. check-only) before implementing; document the decision.

**Installer artifact naming**

- Installer artifact names must include the actual app version:
  - `rack-inventory-studio-vX.Y.Z-windows-installer`
- The NSIS installer filename (the `.exe`) should also carry the actual version rather than a placeholder.
- The Windows Installer workflow derives the artifact name from the version field in `tauri.conf.json`.

**Beta release checklist**

Add a release checklist to `docs/` or inline in this document. The beta release checklist must cover:

1. Bump version in all four locations (or run `node scripts/bump-version.mjs X.Y.Z`).
2. Update `CHANGELOG.md` — move Unreleased entries to the new version section.
3. Run standard checks: `cargo fmt --all --check`, `cargo clippy --workspace -- -D warnings`, `cargo test --workspace`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
4. Run Windows Installer workflow (`workflow_dispatch`) on the release branch.
5. Windows 11 manual QA (see Milestone 5 checklist).
6. Tag the beta release (`git tag vX.Y.Z-beta.N`).
7. Publish GitHub Release with the NSIS installer artifact attached.

**Protected master — recommended settings**

Branch protection settings to document (GitHub repository settings → Branches → `master`):

| Setting | Recommendation |
|---|---|
| Require a pull request before merging | Yes |
| Require approvals | 1 (or 0 for solo maintainer — at minimum require PR) |
| Block direct pushes | Yes |
| Require status checks to pass | Yes |
| Required checks | Frontend checks CI · Rust workspace CI |
| Require linear history | Optional — recommended for clean `git log` |
| Playwright smoke in CI | Not yet required (Playwright not in CI); add when smoke tests are stable in CI |

### Acceptance criteria

- Version drift across the four locations can be detected (check script exists and works).
- Installer artifacts carry the real version in their names.
- Maintainer has a written, step-by-step beta release checklist.
- Master branch protection settings are documented.

## Milestone 3 — Navigation, Settings, and terminology cleanup

### Goal

The navigation rail should reflect the actual location-scoped workflow. A Settings page should exist. App branding should not be duplicated in the left rail. Device model terminology should be clearer to non-technical users.

### Tasks

**Settings navigation item**

- Add a Settings entry to the navigation rail.
- Initial Settings page can contain placeholder sections (content does not need to be functional at first):
  - Application settings
  - Diagnostics / log location
  - About / build information

**Location-scoped Racks navigation**

- Hide the Racks navigation item until a location is selected.
- After clicking "Manage racks" from a location row, show Racks with the selected location as context in the header.
- Programmatic navigation from validation issue drill-down and global search must still navigate correctly to rack/device pages regardless of location filter state.

**Left rail branding cleanup**

- Remove any duplicated app icon or app name from the left navigation rail.
- The top titlebar remains the authoritative app brand area (icon + name).
- The left rail should start with search input, repository context, and navigation items — not a duplicate icon/name block.

**Device model terminology**

- Rename the visible "Model number" label on the Device Model form and table to **"Model / SKU"** or **"Manufacturer model / SKU"**.
- Add brief help text explaining this is the vendor/catalog model identifier (e.g. "The manufacturer's part number or SKU, as shown on the vendor's datasheet or order confirmation.").
- Do not rename the internal DTO field `model_number` or the YAML key — keep them as-is unless a YAML schema migration is explicitly planned and approved as a separate task.

### Acceptance criteria

- Navigation rail matches the location-scoped rack management workflow.
- Settings page exists and is reachable from the nav rail.
- No duplicated app branding in the left navigation rail.
- Device model "Model / SKU" label and help text are visible in the form and table.
- Existing Vitest unit tests and Playwright smoke tests pass (update tests where UI labels change).

## Milestone 4 — Rack detail and placement UX redesign

### Goal

The rack diagram and placement workflow should be usable without drag and drop. The placement table should be readable at normal desktop widths. Placing and editing placements should use modal dialogs with pre-filled context.

### Tasks

**Layout**

- The rack diagram should occupy a larger portion of the window than it does today.
- The placement table should have enough horizontal space to show useful data without truncation at normal desktop widths.

**Placement table columns**

Suggested columns for the active-side placement table:

| Column | Content |
|---|---|
| U range | Start U – end U |
| Name / code | Placement name or device code |
| Type | Device type or rack object type |
| Model | Device model / SKU if available |
| Serial number | Serial number if available |
| Asset tag | Asset tag if available |
| Status / notes | Device status or placement note |
| Actions | Edit / remove icon buttons |

**Right panel**

- The right panel should primarily contain the list of available devices and rack objects that can be placed.
- Remove the always-visible placement form from the right panel.

**Place device modal**

- Clicking an empty U-slot in the diagram, or a dedicated "+" / "Place device" action, opens a Place device modal dialog.
- The modal pre-fills:
  - Rack (current rack)
  - Side (current active side)
  - Start U (selected U-slot, if applicable)
- The modal allows the user to:
  - Select the device or rack object to place
  - Override the height in U if needed
  - Add a note or tags if the existing placement DTOs support these fields
- Dropping a device via drag and drop onto a free U-slot may open the same Place modal with target rack, side, and U pre-filled — drag and drop remains an optional shortcut, not the only path.

**Edit placement modal**

- Clicking an existing placement block in the diagram, or the edit icon in the placement table, opens an Edit placement modal.
- The modal allows:
  - Changing start U
  - Overriding height in U
  - Editing note/tags if supported by existing DTOs
  - Removing the placement via a `ConfirmDialog` (danger tone)
- Side changes must remain explicit and safe, preferably through a dedicated "Change side…" confirmation action rather than an inline dropdown to avoid accidental moves.

### Acceptance criteria

- A user can place a device entirely without drag and drop (modal fallback path).
- Drag and drop still works where the browser and Tauri support it.
- Rack placement workflow is usable on Windows/Tauri (verified in manual QA).
- Placement table is readable on normal desktop widths without horizontal scrolling.
- Playwright smoke tests cover at minimum:
  - Add a placement through the modal (non-drag-and-drop path)
  - Edit a placement through the modal
  - Side selector / "Change side" confirm still works
  - Drag and drop (if reliably stable in a headless browser — skip or mark as flaky if not)
- Windows 11 manual QA covers the full rack placement workflow.

## Milestone 5 — Beta QA and installer validation

### Goal

Confirm that the NSIS installer and the full application UX work correctly on a real Windows 11 machine before tagging the beta release.

### Checklist

**CI step — Windows Installer workflow**

1. Trigger the "Windows Installer" `workflow_dispatch` workflow on the release branch.
2. Download the artifact: `rack-inventory-studio-vX.Y.Z-windows-installer`.
3. Verify the artifact contains `Rack Inventory Studio_X.Y.Z_x64-setup.exe`.

**Windows 11 manual install and QA**

4. Install on a clean Windows 11 machine. Accept SmartScreen warning ("More info → Run anyway" — expected for unsigned installer).
5. Verify:
   - Application launches without an error dialog.
   - Custom app icon is visible in taskbar and window title.
   - Global busy overlay appears during: opening a repository, validating, saving, Git status fetch, commit, push, pull.
   - No transient cmd/console window flashes during any Git action.
   - Open or create a repository (use the example repository or the new-repository wizard).
   - Validate repository — results panel shows correctly.
   - Save changes — success/no-change message appears.
   - CSV Import — paste sample CSV, preview, confirm no error.
   - Git section — status displays; commit with a test message; push to a test remote if available; verify pull error behavior on a clean/behind/diverged branch.
   - Rack placement workflow — place a device via modal (non-drag path); edit a placement; remove a placement via ConfirmDialog.
   - Close application — no crash or Windows error dialog.
6. Verify logs:
   - Log file created at `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\`.
   - Expected entries present: startup, open_repository, save_repository, validate_repository, csv_preview, git_status.
   - Must not appear in logs: full file system paths, passwords, tokens, private keys, raw YAML or CSV content, serial numbers, asset tag values.
7. Record QA result (pass/fail per step) before tagging the beta release.

## Non-goals for this beta hardening track

The following are explicitly out of scope for this beta hardening release:

- V1 release
- Code signing (unless separately approved and scheduled)
- Dark mode
- Responsive or mobile layout overhaul
- YAML schema migration (unless a specific accepted task requires it)
- Large new domain features outside rack placement UX improvements listed above
- Plugin system, CMDB/NetBox/Nautobot/Zabbix integrations, advanced Git conflict resolution UI, advanced PDF/export formats

## Suggested implementation order

1. **Milestone 1** — busy overlay and Git console window hiding (immediate UX + Windows quality win)
2. **Milestone 2** — versioning, artifact naming, release process (needed before tagging anything)
3. **Milestone 3** — navigation, Settings, terminology (UX cleanup)
4. **Milestone 4** — rack placement UX redesign (largest UX scope)
5. **Milestone 5** — beta QA and installer validation (gate before beta tag)

## Review workflow

**Branch strategy**

- Each implementation milestone uses a short branch cut from `master` (e.g. `feat/busy-overlay`, `feat/version-check`).
- If multiple milestones are in progress simultaneously, a dedicated integration branch (e.g. `integration/beta-hardening`) may be created. Working PRs then target the integration branch; the final beta PR targets `master`.
- If no integration branch is used, each milestone PR targets `master` directly and is merged sequentially.

**PR and review**

- Open a pull request for each milestone branch before merging.
- Generate review context after PR creation:
  ```bash
  TS=$(date +%Y%m%d-%H%M)
  bash scripts/ai/build-review-context.sh master ".ai/review-context-${TS}.md"
  ```
- Attach or paste the review context to the code review session before approving.
- Do not commit generated `.ai/review-context-*.md` files.

## Follow-up action plan

After milestones 1–5, beta QA identified additional issues.
See [`docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md`](BETA_QA_FINDINGS_ACTION_PLAN_EN.md) for the findings, proposed follow-up milestones (A–F), and beta blocking classification.
