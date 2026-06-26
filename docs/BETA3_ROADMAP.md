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

## Planned PR sequence

### PR 1 — List views foundation: scroll and pagination correctness

**Problem:**
Pagination/scroll behavior does not work correctly on the devices list and likely other lists. The UI can show text like "displaying 53 of 53", while only the rows that fit on screen are visible and there is no usable scroll or pagination.

**Scope:**

- Audit all list/table views.
- Fix scroll containers and layout constraints.
- Fix displayed counters so they reflect actual visible/paginated data.
- Decide whether each list should use scroll, pagination, or both.
- Prioritize Devices and Device Models.
- Avoid adding search/filter in this PR unless required by the layout foundation.

**Expected outcome:**
All major list views can display datasets larger than the viewport without hiding rows.

---

### PR 2 — Sorting, filtering and search for list views

**Problem:**
Devices and Device Models will quickly become hard to use with real data.

**Scope:**

- Add sorting to key columns.
- Add search/filter to Devices and Device Models first.
- Consider filters such as:
  - device name,
  - manufacturer,
  - model/SKU,
  - device type,
  - status,
  - location/rack,
  - placed/unplaced.
- Apply the same pattern to other lists where useful.

**Expected outcome:**
Users can quickly narrow and sort large lists.

---

### PR 3 — Searchable selects / comboboxes

**Problem:**
Plain selects do not scale when there are many models, devices, racks or locations. For example, selecting a model while creating a device should support typing and scrolling.

**Scope:**

- Introduce a shared SearchableSelect/Combobox component.
- Support:
  - text input,
  - scrollable results,
  - max dropdown height,
  - keyboard navigation where practical,
  - no-results state.
- Apply first to Add/Edit Device model selection.
- Then apply to placement and relation selectors where useful.

**Expected outcome:**
Selecting related records remains usable with dozens or hundreds of options.

---

### PR 4 — Smarter contextual forms

**Problem:**
Forms should understand the context from which they were opened.

**Scope:**

- When creating a device and selecting a model, auto-fill the device type from the selected model if the type field is still empty or auto-managed.
- Do not overwrite a type that the user manually selected.
- When adding a placement and the user selects "Rack object", the "create new" action should open a contextual Rack Object form.
- In that flow:
  - type is set to "Rack object",
  - type is locked or hidden,
  - title/wording says "Create rack object",
  - after save, return to placement modal with the new rack object preselected.

**Expected outcome:**
Less repeated data entry and fewer semantically wrong objects.

---

### PR 5 — Planning / On-site work mode

**Problem:**
RIS has two natural modes of work: planning future rack state and recording physical on-site state.

**Scope:**

- Add a visible mode switch in the top bar:
  - Planning,
  - On-site.
- In Planning mode, newly created devices default to status "planned".
- In On-site mode, newly created devices default to status "installed".
- The mode sets defaults only; users can still manually override status.
- Store mode as local UI preference/session state, not repository data.
- Device status remains normal repository data.

**Expected outcome:**
Users can work naturally in planning or inventory mode without manually changing status on every new device.

---

### PR 6 — Duplicate / create similar

**Problem:**
Users often create many similar models or devices.

**Scope:**

- Add "Duplicate model" or "Create similar model".
- Add "Create similar device".
- Open the normal Add form with selected fields prefilled.
- Do not save immediately.
- Do not copy unique fields such as:
  - serial number,
  - asset tag,
  - inventory number,
  - hostname,
  - MAC/IP,
  - placement,
  - IDs/metadata.
- For models, do not copy IDs/metadata.

**Expected outcome:**
Faster data entry without accidental duplicate unique identifiers.

---

### PR 7 — Clone existing repository

**Problem:**
Users can create a new repository and open a local repository, but there is no first-class flow to clone an existing Git repository.

**Scope:**

- Add "Clone repository" onboarding flow.
- User enters Git URL.
- User selects parent directory.
- App derives or asks for target folder.
- App clones into the selected parent directory.
- App validates that the cloned repository is a valid RIS repository.
- App opens the cloned repository automatically.
- Reuse existing Git/SSH credential and askpass behavior.
- Show clear errors for:
  - invalid URL,
  - auth failure,
  - existing target directory,
  - clone failure,
  - non-RIS repository,
  - missing Git.

**Expected outcome:**
A new user can onboard from an existing remote repository without using the terminal.

---

### PR 8 — Rack view export

**Problem:**
Users need to share rack views outside the app for documentation, tickets, audits and planning.

**Suggested staged scope:**

- First milestone: export current rack view as PNG or SVG.
- Later milestone: export rack report as PDF.

PDF/report should eventually include:

- location name,
- rack name,
- front/rear indicator,
- rack diagram,
- optional device/placement summary,
- export date,
- app version.

**Expected outcome:**
Rack state can be shared or archived outside RIS.

---

### PR 9 — Daily logs and diagnostics polish

**Problem:**
Logging should be easier to inspect and manage.

**Scope:**

- Split logs by day.
- Use filenames containing dates, for example `ris-YYYY-MM-DD.log`.
- Consider retention cleanup.
- Make the actual log folder clear in Settings or diagnostics.
- Ensure "Open logs folder" works on supported platforms.
- Preserve existing redaction rules:
  - no full user paths,
  - no passwords/tokens/secrets,
  - no raw YAML,
  - no raw CSV.

**Expected outcome:**
Diagnostics are easier to use without growing into one large log file.

---

### PR 10 — QA runbook and wording cleanup

**Problem:**
Some QA expectations and UI wording are inconsistent.

**Scope:**

- Decide and apply final wording for:
  - "Validate repository",
  - "Save changes".
- Update beta QA runbook for beta.3.
- Remove stale beta.1/beta.2 assumptions from runbooks.
- Add a clearer manual test for `model_number` read/write compatibility:
  - create model,
  - save,
  - reopen repo,
  - verify YAML/UI,
  - edit,
  - save again.

**Expected outcome:**
QA documents and UI wording are aligned before beta.3 release.

---

## Priority recommendation

Recommended order:

1. List views foundation.
2. Sorting/filtering/search.
3. Searchable selects.
4. Smarter contextual forms.
5. Planning / On-site mode.
6. Duplicate / create similar.
7. Clone existing repository.
8. Rack export.
9. Daily logs.
10. QA/runbook/wording cleanup.

## Out of scope for beta.3 roadmap branch

- No implementation work.
- No version bump.
- No release/tag work.
- No installer changes.
- No GitHub Release changes.
