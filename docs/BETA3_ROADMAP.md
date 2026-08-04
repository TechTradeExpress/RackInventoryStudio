# Rack Inventory Studio — Beta 3 Roadmap

> **Superseded (2026-08-04).** `v0.1.0-beta.3` is no longer the target
> release. `release/v0.1.0-beta.3` (PR #168) has been integrated back into
> `development` instead of being forced through to `master` — see
> `docs/releases/v0.1.0-beta.3.md` for the decision record. The next public
> release is planned as **`v0.1.0-beta.4`**, shipping Windows-complete: the
> WDIO release gate's remote-SSH specs (`git-remote-workflows`,
> `git-clone-workflows`, `git-diverged-pull`) have never actually passed on
> Windows, blocked first by a fixture identity-serialization bug (fixed
> 2026-08-04) and now by a Windows-only remote-shell compatibility defect
> (audited, repair planned — see `docs/E2E_WDIO_PLAN.md`'s Stage 3F.5).
> Remaining Windows SSH fixture work continues on `development` via
> `feature/windows-ssh-fixture`, not on the release branch. Everything else
> in this document (the completed PR sequence, remaining beta.3 QA/release
> steps) still describes real, still-relevant work — it now lands as part
> of beta.4 rather than a beta.3 tag.

## Purpose

Beta 3 focuses on making Rack Inventory Studio comfortable with larger real-world datasets and improving core onboarding and documentation workflows after the beta.2 hardening release.

Beta 3 should not be treated as a rewrite. Changes should be split into small, reviewable PRs.

## Context from beta.2

Beta 2 closed the main release blockers around:

- Windows installer reliability,
- system window close behavior,
- safer create repository flow,
- backend validation for repository code,
- Windows 11 manual QA.

Post-beta.2 observations identified several non-blocking but important usability issues and feature gaps.

## Guiding principles

- Prefer small PRs.
- Do not mix infrastructure, UX, and data model changes unless necessary.
- Fix list scalability before adding more workflows that rely on large lists.
- Reuse shared components instead of patching each screen separately.
- Backend validation remains authoritative.
- UI defaults should help users but not block manual override.
- Features that touch Git/SSH must reuse the existing Git/SSH handling.

## PR sequence — completed

### PR 1 — List views foundation: scroll and pagination correctness ✅

Fixed scroll containers and layout constraints for all major list views.
Fixed displayed counters. Devices and Device Models prioritized.

---

### PR 2 — Sorting, filtering, and search for list views ✅

Added search, sort, and filter to Devices and Device Models.
Applied the same pattern to other lists where useful.

---

### PR 3 — Searchable selects / comboboxes ✅

Introduced a shared `SearchableSelect` component with:
- text input,
- scrollable results,
- keyboard navigation (ArrowDown/Up/Home/End/Enter/Escape),
- no-results state.

Applied to Add/Edit Device model selection.

---

### PR 4 — Searchable selects applied to placement flow ✅

Applied `SearchableSelect` to the placement modal device picker and rack object
model picker.

---

### PR 5 — Contextual Rack Object form ✅

When adding a placement and selecting "Rack object", a "Create new" action opens
a form with Device Type locked to `rack_object`. After save, the new object is
preselected in the placement modal.

---

### PR 6 — Planning / On-site work mode ✅

Added a mode toggle in the top bar:
- **Planning** — new devices default to "planned" status.
- **On-site** — new devices default to "installed" status.

Mode is local UI state and does not affect repository data. Users can override
status manually at any time.

---

### PR 7 — Create similar for Devices and Device Models ✅

Added "Create similar" action on Device and Device Model list rows.
Opens the Add form pre-filled with non-unique fields.
Unique fields (serial, asset tag, IDs, codes) are not copied.

---

### PR 8 — Front/rear rack side view testability ✅

Added `data-testid` attributes and component test coverage for the front/rear
rack side toggle. The toggle was already functional; this PR made it reliably
testable.

---

### PR 9 — Searchable select keyboard navigation and ARIA ✅

Added full ARIA roles (`combobox`, `listbox`, `option`) and keyboard navigation
coverage for `SearchableSelect`. Improved `aria-label` pass-through.

---

### PR 10 — Auto-fill Device Type from selected Device Model ✅

When a Device Model is selected in the Add/Edit Device form, Device Type
auto-fills from the model's type — unless the user has already set the type
manually.

---

### PR 11 — Clone repository flow ✅

Added "Clone repository" to the repository panel:
- user enters a Git URL and selects a parent directory,
- app derives directory name from URL (editable),
- app clones, validates the repository as a valid RIS repo, and opens it,
- credentials and SSH passphrase prompt reuse existing infrastructure,
- clear errors for: invalid URL, auth failure, non-empty target, non-RIS repo.

Security: `--` separator prevents URL option injection; credentials redacted
from logs before writing.

---

### PR 12 — Rack view export: SVG and PNG ✅

Added export buttons to the rack detail view header:
- **Export SVG** — vector export from rack data (not a DOM screenshot).
- **Export PNG** — canvas rasterization at 2× scale.

Both use native save dialogs. Front and rear sides are exported separately.
Filenames include rack name and side. XML/filename sanitization applied.

---

### PR 13 — Daily logs and diagnostics ✅

- Log files now use the filename stem `ris-YYYY-MM-DD`, producing a separate
  log file per calendar day (UTC). tauri-plugin-log appends `.log`.
- On startup, log files older than 30 days matching the `ris-YYYY-MM-DD.log`
  pattern are deleted. Non-RIS files in the log directory are never touched.
- `LogSettingsDto` extended with: `dir_exists`, `dir_writable`,
  `current_log_filename`, `retention_days`.
- Settings panel shows active directory health, current log filename, and
  retention window.
- `open_logs_directory` error messages improved: `NotFound` errors map to a
  user-readable message that always includes the directory path.
- `ActiveLogState` stores the log filename computed at startup so
  `current_log_filename` reflects the actual open file, not the clock.

---

### PR 14 — QA runbook and wording cleanup ✅

- Added `docs/BETA3_QA_RUNBOOK.md`: a practical manual QA checklist covering
  all beta.3 features.
- Updated this roadmap to reflect completed PRs and remaining release steps.
- Minor wording cleanup in Settings diagnostics UI.

---

### PR 15 — Device Model CSV import ✅

Added a full Device Model CSV import workflow (preview → validate → apply),
parallel to the existing Device CSV import. New `VAL-DM-001`–`VAL-DM-009`
validation codes; CSV import panel gained a Devices / Device Models type
selector. (Not present when this roadmap's PR sequence was first written up
through PR 14; added here as a correction found during BRSP Stage B4's audit.)

---

### PR 16 — Harden repository clone transport safety ✅

Routes clone through `ris-git`'s `validate_remote_url`, rejecting unsafe
transports (`ext::`, `fd::`, `file://`, unsupported schemes) before any
process is spawned. Frontend adds matching defense-in-depth validation.

---

### PR 17 — Restrict rack export writes to SVG/PNG ✅

The export backend now rejects any target path whose extension is not
`.svg`/`.png` (case-insensitive), for both the SVG and PNG export commands.

---

## Remaining before beta.3 release

1. **Run full manual QA** using `docs/BETA3_QA_RUNBOOK.md`. *(Status as of
   BRSP Stage B5A: not confirmed complete — no record of an executed QA pass
   exists in this repository. Must be run and confirmed before tagging.)*
2. **Fix any blockers** found during manual QA.
3. **Run the WDIO release gate** — `app-smoke`, representative specs, then
   the full matrix — against the exact release commit. See
   `docs/BETA_RELEASE_PROCESS_EN.md`'s "WDIO release gate" section. Not yet
   possible as of BRSP Stage B5A (`wdio-e2e.yml` cannot be dispatched until
   it exists on `master`).
4. **Prepare release PR**: version bump (not yet done — see
   `docs/BETA_RELEASE_PROCESS_EN.md`), finalize the already-prepared
   CHANGELOG `v0.1.0-beta.3` section's date, and the already-drafted
   `docs/releases/v0.1.0-beta.3.md` release notes.

Do not tag or publish beta.3 before manual QA and the WDIO release gate are
both complete.

---

## Out of scope for beta.3

- PDF rack report export (planned for a later milestone).
- Configurable log retention window.
- Full localization (UI remains in English).
- No installer changes beyond what is already present.
- No GitHub Release until manual QA is signed off.

---

## Post-beta.3: E2E testing roadmap

Desktop E2E work (WebdriverIO + `@wdio/tauri-service`) was tracked separately on
`roadmap/e2e-wdio` and has since been merged into `development` (BRSP Stage B3).
See `docs/E2E_WDIO_PLAN.md` for the full stage history and current program status.
