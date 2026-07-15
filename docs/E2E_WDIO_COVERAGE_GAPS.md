# Desktop E2E Coverage Gap Analysis

Generated: 2026-07-15
Branch: `feature/e2e-wdio-coverage-gap-review`
Base: `roadmap/e2e-wdio` at `9514cae`

## Purpose

This document inventories the application's user-facing workflows against existing
WDIO E2E specs to identify gaps that inform Stage 3 and later stage planning.

Coverage is assessed against the real compiled Tauri binary only.  Playwright
browser-mode and Vitest/Rust unit tests are separate layers not considered here.

---

## Coverage key

| Status | Meaning |
|--------|---------|
| COVERED | Fully exercised in an existing WDIO spec |
| PARTIAL | Some sub-flows covered; others not |
| MISSING | No WDIO coverage; stable selectors already present |
| NEEDS SELECTOR | No WDIO coverage; no stable `data-testid` yet |
| DEFERRED | Intentionally out of scope (network, native dialogs, etc.) |
| NOT JUSTIFIED | Low E2E value; already covered by unit tests or trivial UI |

---

## Existing specs (as of Stage 2)

| Spec file | What it covers |
|-----------|----------------|
| `app-smoke.e2e.ts` | App launch; landing screen sections visible |
| `repository-lifecycle.e2e.ts` | Create → close → reopen; scaffold on disk |
| `core-inventory.e2e.ts` | Location + Rack + Model + Device create; place at U1; persist after close/reopen |
| `safety-recovery.e2e.ts` | Clone URL safety (3 unsafe + 1 control); open-path recovery (2 cases) |
| `csv-import.e2e.ts` | Device CSV preview + import + persist; negative: missing required column |

---

## Coverage matrix

### Repository management

| Workflow | Status | Notes |
|----------|--------|-------|
| App launch / landing screen | COVERED | `app-smoke` |
| Create repository | COVERED | `repository-lifecycle`, `core-inventory`, `csv-import` |
| Open repository by path (happy path) | COVERED | `repository-lifecycle`, `core-inventory` |
| Close repository — no unsaved changes | COVERED | `repository-lifecycle` |
| Close repository — unsaved → Save and continue | COVERED | `core-inventory`, `csv-import` |
| Close repository — unsaved → Discard | MISSING | `unsaved-changes-discard` selector absent |
| Recent repositories — list and click | NEEDS SELECTOR | `RepositoryPanel` recent repos panel; no testids |
| Clone repository — URL safety (unsafe patterns) | COVERED | `safety-recovery` |
| Clone repository — URL safety (HTTPS control) | COVERED | `safety-recovery` |
| Clone repository — network: HTTPS happy path | DEFERRED | Requires network; no local mock |
| Clone repository — network: SSH + passphrase | DEFERRED | Requires network + SSH credentials |
| Open recovery — path does not exist | COVERED | `safety-recovery` |
| Open recovery — non-RIS directory | COVERED | `safety-recovery` |

**Git workflow (RepositoryPanel)**

The RepositoryPanel git section has no `data-testid` attributes on its action
buttons (Init, Validate, Commit, Add remote, Push, Pull).

| Workflow | Status | Notes |
|----------|--------|-------|
| Git init (convert non-git directory) | NEEDS SELECTOR | No testid; requires repo with no `.git` |
| Validate for publish | NEEDS SELECTOR | No testid on validate button |
| Commit with message | NEEDS SELECTOR | No testid on commit input or commit button |
| Add remote | NEEDS SELECTOR | No testid on remote URL input or add-remote button |
| Push to remote | NEEDS SELECTOR | No testid; network-dependent |
| Pull from remote | NEEDS SELECTOR | No testid; network-dependent + ff-only |

---

### Location management

| Workflow | Status | Notes |
|----------|--------|-------|
| Create location | COVERED | `core-inventory` |
| Edit location | MISSING | `LocationFormModal` opens in edit mode; `location-form-submit` present |
| Delete location — no racks (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no `data-testid` on confirm button |
| Delete location — racks exist (constraint error) | NEEDS SELECTOR | Same; backend likely returns an error |

---

### Rack management

| Workflow | Status | Notes |
|----------|--------|-------|
| Create rack | COVERED | `core-inventory` |
| Navigate to rack via location row click | COVERED | `core-inventory` |
| Edit rack | MISSING | `RackFormModal` edit path; `rack-form-submit` present |
| Delete rack — no placements (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no `data-testid` on confirm button |
| Delete rack — placements exist (constraint error) | NEEDS SELECTOR | Same; backend constraint |

---

### Device model management

| Workflow | Status | Notes |
|----------|--------|-------|
| Create device model (server, 1U) | COVERED | `core-inventory` |
| Edit device model | MISSING | `DeviceModelFormModal` edit path; `model-form-submit` present |
| Delete device model — no devices (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no testid |
| Delete device model — devices exist (constraint error) | NEEDS SELECTOR | Same; backend constraint |

---

### Device management

| Workflow | Status | Notes |
|----------|--------|-------|
| Create device (with model, planned status) | COVERED | `core-inventory` |
| Unplaced badge after creation | COVERED | `core-inventory` |
| Edit device | MISSING | `DeviceFormModal` edit path; `device-form-submit` present |
| Delete device — unplaced (confirm dialog) | NEEDS SELECTOR | `ConfirmDialog` has no testid |
| Delete placed device — must unplace first | NEEDS SELECTOR | Same; backend guard |

---

### Rack placement

| Workflow | Status | Notes |
|----------|--------|-------|
| Place device at U1 (PlacePlacementModal) | COVERED | `core-inventory` |
| Placed card visible in rack diagram | COVERED | `core-inventory` |
| Placed card title contains model name | COVERED | `core-inventory` |
| Placement persists after close + reopen | COVERED | `core-inventory` |
| Edit placement — change start U | MISSING | `EditPlacementModal`; selectors present (`start-u-input`, `height-u-input`, `save-btn`) |
| Edit placement — change height U | MISSING | Same; `height-u-input` present |
| Remove placement — via PlacementInspectorPanel | MISSING | `remove-from-rack-btn` present |
| Remove placement — via EditPlacementModal remove | MISSING | `remove-btn` present in `EditPlacementModal` |
| PlacementInspectorPanel: open edit modal | MISSING | `open-edit-modal-btn` present |
| PlacementInspectorPanel: navigate to device | MISSING | `edit-target-device-btn` present |
| PlacementInspectorPanel: navigate to model | MISSING | `edit-target-model-btn` present |
| Rack export — SVG | MISSING | `export-svg-btn` present; may require native file dialog on save |
| Rack export — PNG | MISSING | `export-png-btn` present; same native dialog concern |

---

### CSV import

| Workflow | Status | Notes |
|----------|--------|-------|
| Device CSV — paste → preview → import → persist | COVERED | `csv-import` |
| Device CSV — negative: missing required column | COVERED | `csv-import` |
| Device Model CSV — paste → preview → import | MISSING | `import-type-device-models` present; `DeviceModelPreviewTable` has no testid |
| Device Model CSV — negative validation | MISSING | Same |
| CSV sample download | NOT JUSTIFIED | `btn-download-sample` present; triggers Tauri native save dialog |

---

### Validation panel

All validation panel action buttons lack `data-testid` attributes.

| Workflow | Status | Notes |
|----------|--------|-------|
| Run validation — see issue list | NEEDS SELECTOR | No testid on validate button |
| Filter issues by level | NEEDS SELECTOR | No testid on level filter buttons |
| Navigate from issue to entity | NEEDS SELECTOR | No testid on issue rows |
| Save from validation panel | NEEDS SELECTOR | No testid on save button |

---

### Work mode toggle

| Workflow | Status | Notes |
|----------|--------|-------|
| Toggle to onsite mode | MISSING | `work-mode-onsite` testid present |
| Toggle to planning mode | MISSING | `work-mode-planning` testid present |
| Work mode affects device status defaults | NOT JUSTIFIED | Unit test coverage in `DevicesPanel.test.tsx` |

Work mode toggle is wired but the `work-mode-planning` and `work-mode-onsite`
testids are already in place — only the spec is missing.

---

### Global search

`GlobalSearch` component has no `data-testid` attributes.

| Workflow | Status | Notes |
|----------|--------|-------|
| Search for entity by name | NEEDS SELECTOR | No testid on search input or result items |
| Navigate to entity from search result | NEEDS SELECTOR | Same |

---

### Settings panel

| Workflow | Status | Notes |
|----------|--------|-------|
| View current log directory | NOT JUSTIFIED | No testid; read-only display |
| Open logs folder (system call) | NOT JUSTIFIED | Opens OS file manager; not assertable in E2E |
| Choose custom log directory | DEFERRED | Requires native directory picker dialog |
| Reset log directory | NOT JUSTIFIED | No testid; side effect outside app UI |

---

## Selector readiness summary

Workflows by how much selector work is needed before a spec can be written:

### Ready (selectors already present)

These workflows have `data-testid` on all interactive elements.  A spec can be
written without touching application source.

| Workflow | Key selectors |
|----------|--------------|
| Edit location | `location-form-submit`, `field-name` |
| Edit rack | `rack-form-submit`, `field-name`, `field-height-u` |
| Edit device model | `model-form-submit`, `field-name`, `field-height-u` |
| Edit device | `device-form-submit`, `field-name`, `field-device-type` |
| Edit placement (start U) | `open-edit-modal-btn`, `start-u-input`, `save-btn` |
| Edit placement (height U) | `open-edit-modal-btn`, `height-u-input`, `save-btn` |
| Remove placement (inspector) | `remove-from-rack-btn` |
| Remove placement (edit modal) | `open-edit-modal-btn`, `remove-btn` |
| PlacementInspector → device | `edit-target-device-btn` |
| PlacementInspector → model | `edit-target-model-btn` |
| Work mode toggle | `work-mode-planning`, `work-mode-onsite` |

### Needs one or more selectors

These workflows need `data-testid` added to application source before a spec
can use stable selectors.

| Workflow | What needs a testid |
|----------|---------------------|
| Delete location / rack / model / device | `ConfirmDialog` confirm button; delete trigger buttons in each panel |
| Delete with relationship constraint | Same confirm button; also error banner in each panel |
| Device Model CSV preview | `DeviceModelPreviewTable` needs a testid (like `csv-device-model-preview-table`) |
| Global search | Search input, result items, or result container |
| Validation panel actions | Validate button, save button, issue rows |
| Git workflow actions | All RepositoryPanel git buttons |
| Recent repositories | Repository list items and remove buttons |
| Unsaved changes — discard | `unsaved-changes-discard` on the discard button |

### Deferred (out of scope for near-term stages)

| Workflow | Reason |
|----------|--------|
| Clone via HTTPS / SSH | Network-dependent; no local mock |
| SSH passphrase entry | SSH key + network required |
| Push / pull | Network-dependent |
| Rack export (SVG / PNG) | Tauri `dialog::save` prevents automation without test-mode bypass |
| CSV sample download | Same native save dialog |
| Log directory change | Native directory picker dialog |

---

## Recommended Stage 3 scope

Based on selector readiness and testing value, the following scope has the best
cost/value ratio for Stage 3.

### Tier 1 — No new selectors required

These can proceed immediately as spec-only work on the existing binary.

1. **Edit placement** — `open-edit-modal-btn` → `EditPlacementModal` → change start U →
   `save-btn` → verify moved card.  Tests a unique IPC path not covered by create.
2. **Remove placement** — click placed card → `PlacementInspectorPanel` →
   `remove-from-rack-btn` → verify card gone; unplaced badge back on device in list.
3. **Edit device** — re-open device form, change name, verify update in list.
4. **Edit device model** — change height_u, verify update in model list.
5. **Edit location / rack** — name change, verify in list.  Low value individually
   but confirms the update IPC path works.
6. **Work mode toggle** — switch to `work-mode-onsite`, verify `work-mode-onsite`
   aria-pressed, switch back.  Very small but MISSING with testids in place.

### Tier 2 — One selector per entity type needed

Delete workflows.  The `ConfirmDialog` confirm button needs a testid; each panel
needs a delete trigger button testid.  This is one selector addition per entity type.

Suggested selector additions:
- `ConfirmDialog`: add `data-testid="confirm-dialog-confirm"` to the confirm button
- Each panel delete trigger: `location-delete-btn-{code}` or a simpler pattern
  (alternative: use `data-action="delete"` on the row action button)

7. **Delete device (unplaced)** — highest value; common destructive operation.
8. **Delete location** — tests relationship load: a location with racks should be
   blocked or warn before deleting.

### Tier 3 — Multiple new selectors needed

9. **Device Model CSV import** — add `csv-device-model-preview-table` testid.
   Completes the CSV import coverage to both entity types.
10. **Validation panel** — add testids to validate/save buttons; cover run → issue
    list → navigate to entity.

### Recommended not-yet (Stage 4+)

- Global search (no testids; scope uncertain for E2E vs unit)
- Git workflow (no testids; network-dependent sub-flows)
- Rack export (native dialog blocks automation)
- Windows / CI validation (separate infrastructure stage)

---

## Summary counts

| Status | Count |
|--------|-------|
| COVERED | 20 |
| PARTIAL | 0 |
| MISSING | 15 |
| NEEDS SELECTOR | 15 |
| DEFERRED | 9 |
| NOT JUSTIFIED | 7 |
| **Total workflows inventoried** | **66** |

Current E2E coverage: **20 / 66 workflows** (30%).
With Stage 3 Tier 1 complete: estimated **26 / 66** (39%).
With Stage 3 Tier 1 + 2 complete: estimated **30 / 66** (45%).
