# Rack Inventory Studio — Beta 3 Roadmap

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

## Remaining before beta.3 release

1. **Run full manual QA** using `docs/BETA3_QA_RUNBOOK.md`.
2. **Fix any blockers** found during manual QA.
3. **Prepare release PR**: version bump, CHANGELOG entry, release notes.

Do not tag or publish beta.3 before manual QA is complete.

---

## Out of scope for beta.3

- PDF rack report export (planned for a later milestone).
- Configurable log retention window.
- Full localization (UI remains in English).
- No installer changes beyond what is already present.
- No GitHub Release until manual QA is signed off.

---

## Post-beta.3: E2E testing roadmap

Desktop E2E work (WebdriverIO + `@wdio/tauri-service`) is tracked separately on branch
`roadmap/e2e-wdio`. See `docs/E2E_WDIO_PLAN.md` for the staged implementation plan.
