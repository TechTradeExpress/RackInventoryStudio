# UX Audit Prep — Rack Inventory Studio

**Date:** 2026-05-20
**Status:** Pre-audit brief — describes current state, not target design.
**Next step:** Claude Design / UX audit based on this document.

---

## 1. Purpose

This document prepares the project for the Claude Design / UX audit phase (M42).

It is **not** a design specification. It describes:
- the current product stage and what is implemented,
- the main UI screens and their current state of polish,
- key user workflows that need auditing,
- known friction points without implementing fixes,
- constraints that must be respected during design,
- proposed audit deliverables,
- open questions before design work begins.

---

## 2. Current product stage

**MVP Core is functionally complete.**
All core inventory management workflows — open, manage catalog, import via CSV, place in racks, validate, save — are implemented and tested.

**MVP+ feature milestones are complete.**
The following improvements have been shipped:
- Create new repository wizard
- Native CSV file picker
- Minimal global search
- Playwright smoke tests (9/9)
- Drag-and-drop placement
- Repository flow polish (landing, open, close, recent repos)
- Safe publish / Git UX polish (semantic status labels, publish checklist, push/pull gating)

**Current phase: UX audit and UI polish before v1.0.0.**
The application is functionally solid. It is now entering the UX audit phase to identify friction, establish design direction, and drive incremental UI polish toward a user-facing release.

**v1.0.0 goal:** a new user can pick up the app and complete the full workflow (open repo → manage inventory → validate → commit → push) without developer guidance.

---

## 3. Current implemented UI screens

### App shell / header / tab bar

**Purpose:** global container, navigation, search access point.

**Current actions:**
- Tab bar: Repository, Validation, Locations, Racks, Devices, Device Models, CSV Import (all disabled until repo is open).
- Global search bar appears in header when repo is open.
- Global unsaved-changes amber banner spans the full width when dirty.

**Polish state:** functional. Uses `fontFamily: "monospace"` throughout. No shared typography or spacing system. Tabs are plain `<button>` elements with inline styles.

**Audit questions:**
- Is monospace appropriate as the primary UI font, or only for codes/paths?
- Should the header be more prominent (app name, repo name, branch)?
- Where should the unsaved-changes banner live to be noticeable but not intrusive?

---

### Repository tab — landing state

**Purpose:** entry point when no repository is open.

**Current actions:**
- Open existing repository: path input + Browse… + Open button.
- Recent repositories: list of paths, click-to-fill path input, × to remove.
- Create new repository: wizard form (directory, code, name, optional Git init).

**Polish state:** functional. Hero section added in PR #38. Layout is a single column with sections separated by headings.

**Audit questions:**
- Is the two-action layout (Open / Create) clear for a first-time user?
- Should recent repos be more visually prominent?
- How should the Create wizard feel relative to the Open form?

---

### Repository tab — open state / summary

**Purpose:** shows repository metadata and entity counts after opening.

**Current actions:**
- View path, code, name, entity counts, validation summary from last open.
- Close repository (with unsaved-changes confirmation).

**Polish state:** summary table. Validation errors/warnings shown as raw counts; stale note shown if validation has not been re-run.

**Audit questions:**
- Should the summary use cards or a table?
- Is the stale validation note visible enough?
- Should the summary be collapsible to give more space to the Git section?

---

### Git / safe publish section (within Repository tab)

**Purpose:** shows Git status, guides through safe publish path (Save → Validate → Commit → Pull → Push).

**Current actions:**
- Display semantic status label (clean / uncommitted / ahead / behind / diverged), colour-coded.
- Display action hints (contextual, empty when nothing to do).
- Display 5-step publish checklist with live ✓/·/○ state.
- Refresh Git status.
- View recent commits log.
- Validate (requires open session).
- Commit with user-provided message (requires: saved, validated without errors, non-empty message).
- Push / Pull with per-state gating.
- Add remote; select remote.

**Polish state:** functional, well-structured. `RepositoryPanel.tsx` is 1,187 lines — the largest component. Contains many sub-sections inline.

**Audit questions:**
- Is the safe publish flow linear enough, or does the section feel like a wall of controls?
- Should Validate/Commit/Push/Pull be a wizard-style stepper rather than a vertical list?
- Should Git status and publish flow be separated into sub-tabs or collapsible sections?
- Is the checklist ✓/·/○ pattern clear to a non-developer user?

---

### Locations panel

**Purpose:** list and manage repository locations (physical sites).

**Current actions:** list locations, add location, edit location (inline form), delete location (with referential integrity guard).

**Polish state:** table with action column. Standard inline-styles layout.

**Audit questions:** empty state messaging; whether "Add location" form should be modal or inline.

---

### Racks panel

**Purpose:** list racks across all locations; entry point to rack detail.

**Current actions:** list racks with Front/Rear/Total placement counts, filter by location, add rack, edit rack, delete rack, click row to open Rack Detail.

**Polish state:** table with counts updated live after mutations.

**Audit questions:** row click target vs. action buttons (accidental navigations?); rack selection highlight; should counts be sparklines or badges?

---

### Rack detail

**Purpose:** the primary working screen — view rack diagram, manage placements.

**Current actions:**
- View rack metadata.
- View graphical rack unit diagram (front and rear sides) with colour-coded placements.
- Select a placement to inspect it.
- Add placement: form-based (side, device/rack_object selector, start U, optional height override) or drag-and-drop from AddPlacementPanel.
- Move placement (same-rack, cross-side, cross-rack) via inspector form.
- Remove placement via confirmation button.

**Polish state:** functional and most complex screen. `RackDetailPanel.tsx` (389 lines), `RackUnitDiagram.tsx` (408 lines), `AddPlacementPanel.tsx` (481 lines), `PlacementInspectorPanel.tsx` (438 lines). DnD works; affordances are minimal (no drag handle icons, no drop zone highlight animation).

**Audit questions:**
- Should rack diagram be the dominant element with Add/Inspect in a sidebar?
- Are front/rear tabs intuitive or confusing?
- DnD affordances: drag handles? animated drop zones? invalid-drop feedback?
- Is the inspector panel placement (below diagram) optimal?
- Does the AddPlacementPanel duplicate information from the inspector?

---

### Add placement panel (DnD palette)

**Purpose:** source of draggable device and rack-object cards; also contains form-based add.

**Current actions:** select mode (Device / Rack Object), view unplaced items as draggable cards, or fill form (side, target, start U, height override).

**Polish state:** functional. DnD cards are plain text buttons; no device icons or visual hierarchy.

**Audit questions:**
- Should unplaced devices be a scrollable card grid or a list?
- Should device type be shown with an icon badge?
- Is the form-based path still needed alongside DnD, or is DnD now the primary interaction?

---

### Placement inspector panel

**Purpose:** view and modify a selected placement.

**Current actions:** view all placement fields (device/rack object details, side, start U, height, notes), move placement (form with rack/side/U selectors), remove placement.

**Polish state:** functional. Fields shown as a table; move form is inline.

**Audit questions:**
- Should move and remove be behind a confirmation step or a dedicated mode?
- Is the inline move form too dense?

---

### Devices panel

**Purpose:** list and manage concrete devices.

**Current actions:** list devices (type, code, name, status, model, tags), add device, edit device, delete device (blocked if placed).

**Polish state:** standard table layout. No visual distinction between device types.

**Audit questions:**
- Highlighted device after validation navigation: auto-scroll not implemented (known gap).
- Should device type have an icon or badge?

---

### Device models panel

**Purpose:** list and manage device model definitions (server, network, storage, ups, appliance, other, rack_object).

**Current actions:** list models, add model (with type/height/width selectors), edit, delete (blocked if referenced).

**Polish state:** standard table. rack_object type has a hint shown below the form.

**Audit questions:** no known major friction; audit for consistency with other list panels.

---

### CSV import panel

**Purpose:** import devices from a CSV file.

**Current actions:**
- Browse for CSV file (native OS file picker).
- Preview with row-level validation results (action, status, errors per row).
- Import confirmed rows; skip/error rows excluded.
- Clear and start over.

**Polish state:** functional. Preview table uses inline styles for row status colouring.

**Audit questions:**
- Is the preview table colour scheme (green/yellow/red rows) clear?
- Should error rows show expandable detail?
- Should the import result summary be more prominent?

---

### Validation panel

**Purpose:** run VAL-* rules, view results, navigate to problem entities.

**Current actions:**
- Run validation.
- View issue list (level, code, message, object).
- Navigate to rack/device/location/device model from an issue row.
- Save inventory from this panel.

**Polish state:** functional. Navigation drill-down works. No scrollIntoView for highlighted rows (known gap).

**Audit questions:**
- Should validation be run automatically on open, or remain on-demand?
- Should error/warning/info rows be colour-coded more distinctly?
- Save button placement (in Validation panel): is this the right home for it?

---

### Global search

**Purpose:** single input to find any entity by name or code.

**Current actions:**
- Type 2+ characters to see dropdown results.
- Results grouped by type (device, rack, location, device model).
- Click result to navigate to the entity's tab and highlight the row.
- Short queries (< 2 chars) suppress dropdown; no-match query shows "No results".

**Polish state:** functional. Dropdown is a plain `<div>` with inline styles; no keyboard navigation.

**Audit questions:**
- Should keyboard navigation (↑↓ arrows, Enter) be supported?
- Should search results include placement counts or other metadata?
- Is the "No results" state prominent enough?

---

## 4. Key user workflows to audit

### W1 — First launch: create repository

**Entry point:** landing state with no repository open.
**Goal:** scaffold a new rack inventory repository, open it, and start adding entities.
**Friction points:** wizard is embedded in the landing page — may feel like a form, not a wizard; success message may not make next steps obvious.
**Screens:** landing state → create wizard → repository summary.

---

### W2 — First launch: open existing repository

**Entry point:** landing state with no repository open.
**Goal:** open an existing YAML-based inventory directory.
**Friction points:** path input requires knowing the filesystem path; Browse… dialog must work correctly.
**Screens:** landing state → path input → open → repository summary.

---

### W3 — Understand repository summary and next action

**Entry point:** repository open, summary visible.
**Goal:** user understands current state (entity counts, validation status, Git status) and knows what to do next.
**Friction points:** validation result is from last open, may be stale; Git section is far down in the panel; action hints are contextual but may not be prominent enough.
**Screens:** repository summary, Git status section.

---

### W4 — Add and import devices

**Entry point:** open repository.
**Goal:** add devices manually or via CSV, ready for placement.
**Friction points:** CSV import requires knowing column schema; manual add has no template.
**Screens:** Devices panel, CSV Import panel.

---

### W5 — Place device or rack object in rack

**Entry point:** Racks panel → Rack Detail.
**Goal:** place an unplaced device or rack object in a specific rack position.
**Friction points:** DnD affordances minimal; form-based add and DnD coexist (which is primary?); height override required for CSV-imported devices without model.
**Screens:** Racks panel, Rack Detail, Add Placement panel.

---

### W6 — Validate and navigate to a problem

**Entry point:** Validation panel.
**Goal:** identify validation issues and navigate to the problem entity.
**Friction points:** no scrollIntoView after navigation; validation is on-demand (easy to forget after mutations).
**Screens:** Validation panel → target entity panel.

---

### W7 — Save inventory changes

**Entry point:** any panel with unsaved changes banner visible.
**Goal:** persist in-memory changes to YAML files on disk.
**Friction points:** banner does not indicate how many changes exist; save is in Repository tab but also accessible from Validation tab.
**Screens:** unsaved banner → Repository tab or Validation tab.

---

### W8 — Commit and publish through Git

**Entry point:** Repository tab, Git section.
**Goal:** commit saved changes, push to remote.
**Friction points:** safe publish checklist is functional but linear — user must complete steps in order; commit requires validation to pass first.
**Screens:** Repository tab Git section (validate → commit → push).

---

### W9 — Close or switch repository

**Entry point:** any state when repo is open.
**Goal:** safely close the current repository (with or without unsaved changes).
**Friction points:** unsaved changes confirmation is a browser `confirm()` dialog; no option to save-then-close in one action.
**Screens:** Repository tab → Close button → confirmation.

---

### W10 — Recover from common errors

**Entry point:** error state after a failed operation (save, commit, push, CSV import).
**Goal:** understand what went wrong and take corrective action.
**Friction points:** error boxes use inline red styles with raw error strings from the backend; no suggested recovery action.
**Screens:** any panel showing an errorBox.

---

## 5. Known UX friction points

These are issues to address during UX audit and UI polish — not to implement before the audit.

**Visual hierarchy and layout:**
- UI is functional but has limited visual hierarchy. All sections look equally weighted.
- `RepositoryPanel.tsx` is 1,187 lines and contains open/summary/Git/publish/remotes in one scrollable column.
- No design system or shared component library; layout relies on inline styles and `lib/styles.ts` common primitives.
- Monospace font used throughout — appropriate for codes and paths but creates a utilitarian feel for prose/labels.

**Color and status patterns:**
- Status colors are defined locally per component (e.g., `SEVERITY_COLOR` in `gitStatusHelpers.ts`, hardcoded `#b00`/`#2a7a2a` in rack detail, `#fff0f0` error boxes in `lib/styles.ts`).
- No central palette or token system.
- Git status label colors and rack diagram colors are not coordinated.

**Empty states:**
- Empty tables show no message (e.g., Locations list when no locations exist).
- Empty rack diagram shows no visual placeholder.

**Error states:**
- Raw backend error strings surfaced directly to users (e.g., Git push failure with SSH error).
- No recovery suggestion or contextual help in error boxes.

**Forms:**
- All forms are inline within their panel; no modal or flyout pattern.
- No form-level validation feedback beyond submit error.

**DnD affordances:**
- Device cards in AddPlacementPanel are plain text buttons; no drag handle or visual drag-affordance.
- No animated drop zone highlight on hover.
- Invalid drop (e.g., wrong height) shows an alert — no visual in-diagram feedback.

**Rack detail layout:**
- Rack unit diagram, add-placement panel, and inspector are stacked vertically — requires significant scrolling on smaller screens.
- Front/rear tabs are minimal text labels; may not communicate "these are sides of the rack."

**Safe publish flow:**
- The publish checklist is compact but the full section (validate + commit + remote + push/pull) is tall and dense.
- A user unfamiliar with Git may not understand the distinction between commit and push.

**Validation:**
- No scrollIntoView after row highlight on navigation.
- Devices tab does not auto-scroll to highlighted device.

**Copy/labels:**
- Some labels are developer-facing (e.g., "rack_object", "VAL-P03").
- No user-facing explanations for device types or validation codes.

---

## 6. Constraints for design phase

- **Do not mix design polish with backend/domain logic changes.** Redesign PRs must not touch Rust crates.
- **No big-bang redesign.** Each design milestone is a small, reviewable PR.
- **Playwright smoke tests must remain green** after every milestone.
- **Rust and frontend test suites must remain green** after every milestone.
- **No conflict resolver or Git auth prompts before v1.0.0** unless explicitly reprioritized by the user.
- **No full Tauri E2E** in design polish milestones (Playwright web layer is sufficient).
- **Preserve existing workflows.** No removing features, only polish and restructuring.
- **Prefer shared primitives.** Extract `Button`, `Section`, `EmptyState`, `ErrorBox` before applying them across panels — rather than patching individual panels.
- **No autosave, no tags UI, no update-existing CSV import** before v1.0.0.

---

## 7. Proposed design audit deliverables

After reviewing this brief, Claude Design should produce:

1. **Screen-by-screen UX audit** — for each screen: what works, what is confusing, what is missing.
2. **Top 10 usability issues** — ranked by user impact.
3. **App shell and navigation direction** — tab bar, header, search, banner placement.
4. **Typography direction** — when to use monospace vs. system font; type scale.
5. **Spacing and layout direction** — consistent padding, section rhythm, responsive breakpoints if relevant.
6. **Visual hierarchy direction** — how to distinguish primary, secondary, and tertiary content.
7. **Status, badge, and error pattern direction** — centralized color palette, status components.
8. **Form and table pattern direction** — inline vs. modal, field validation, table column widths.
9. **Rack detail layout recommendation** — diagram vs. inspector vs. add-placement layout.
10. **Safe publish flow recommendation** — stepper, accordion, or current vertical layout.
11. **Incremental implementation milestones** — ordered list of small PRs, each testable and reviewable.

---

## 8. Screenshot checklist

Screenshots should be taken with `examples/example-repository` open unless a specific state requires a different fixture.

- [ ] Landing state — no repository open
- [ ] Landing state — recent repositories visible
- [ ] Create repository wizard — empty state
- [ ] Create repository wizard — with validation error
- [ ] Repository summary — open, clean Git state
- [ ] Repository summary — with unsaved changes banner
- [ ] Git status label: "Ahead of remote by 1 commit" (use E2E mock or real repo)
- [ ] Git status label: "Local changes not committed"
- [ ] Git safe publish checklist — step 1 pending
- [ ] Locations list — with entries
- [ ] Locations list — empty state
- [ ] Racks list — with placement counts
- [ ] Rack detail — with front and rear placements
- [ ] Rack detail — with DnD palette open
- [ ] Rack detail — drag in progress (if feasible)
- [ ] Rack detail — invalid DnD drop feedback
- [ ] Placement inspector — device selected
- [ ] Devices list — with entries
- [ ] Device models list — with entries
- [ ] CSV import — before file selection
- [ ] CSV import — preview with warnings/errors
- [ ] Validation panel — with errors, warnings, info
- [ ] Validation navigation — row highlighted in Devices tab
- [ ] Global search — results dropdown
- [ ] Global search — "No results" state
- [ ] Error box — example push failure

---

## 9. Proposed next milestones after audit

Order is a suggestion; the audit may reorder priorities.

1. **UX audit with Claude Design** — this document as input; output: audit report + design direction.
2. **UI foundation** — extract shared primitives (`Button`, `Section`, `EmptyState`, `ErrorBox`); establish type scale, spacing scale, color tokens.
3. **Repository / Git / Validation flow polish** — apply design direction to `RepositoryPanel`, `ValidationPanel`.
4. **Rack Detail / Placement UI polish** — diagram layout, DnD affordances, inspector redesign.
5. **CSV Import / list panels polish** — preview table, empty states, list consistency.
6. **Release hardening** — dependency audit, error message review, known-limitation documentation.
7. **Packaging check** — app bundles and launches from clean install on target OS.
8. **User-facing release documentation** — workflow guide, Git auth assumptions, known limitations.
9. **v1.0.0 release candidate** — all gates pass, version tag.

---

## 10. Open questions for ChatGPT / design session

Resolve these before or during the design audit:

1. **Target OS for v1.0.0?** Linux (WSL2 / native)? Windows? macOS? Affects window chrome and file picker styling.
2. **Expected screen size?** Minimum window width — 1280 px? 1440 px? Affects layout breakpoints.
3. **Single-user local tool or team Git workflow?** Affects how much emphasis Git UX deserves vs. catalog management.
4. **Utilitarian admin tool vs. polished product?** Affects design ambition — developer-friendly monospace admin panel or consumer-grade clean design.
5. **Which workflow is most important for first demo?** Placement workflow? Git publish flow? Import flow?
6. **v1.0.0 installer or build artifact?** Packaged `.deb`/`.AppImage`/`.msi` or just `pnpm tauri build` output?
7. **English-only documentation or Polish too?** For user-facing release notes and help text.
8. **Should app name / branding be finalised before design?** "Rack Inventory Studio" vs. something shorter?
