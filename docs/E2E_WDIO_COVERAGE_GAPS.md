# Desktop E2E Coverage Gap Analysis

Generated: 2026-07-22 (Stage 3B.2, PR #152); fully re-verified and rewritten
2026-07-25 against actual HEAD (post Stage 3C / embedded-provider-removal,
`roadmap/e2e-wdio` @ `db6752d`) — see "Maintenance pass (2026-07-25)" below
for what changed and why. Updated again same-day after Stage 3D
(`placement-validation.e2e.ts` delivered; rack export analyzed and
reclassified to NEEDS APPLICATION CHANGE) and again after Stage 3E (5 new
specs closing every low-risk NEEDS SELECTOR workflow — see the coverage
matrix, "Selectors added in Stage 3E", and Summary counts below).

Branch: `feature/e2e-stage-3e-selectors` (targeting `roadmap/e2e-wdio`)

## Purpose

This document inventories the application's user-facing workflows against existing
WDIO E2E specs to identify gaps that inform Stage 3F and later stage planning.

Coverage is assessed against the real compiled Tauri binary only.  Playwright
browser-mode and Vitest/Rust unit tests are separate layers not considered here.

---

## Maintenance pass (2026-07-25)

This pass re-verified every row against the current application source and
spec files rather than trusting the prior version. Changes:

- **4 workflows promoted MISSING → COVERED** (Stage 3C, `placement-inspector-workflows.e2e.ts`):
  edit placement height U, remove placement via `EditPlacementModal`,
  `PlacementInspectorPanel` navigate to device, navigate to model.
- **3 workflows reclassified MISSING → NEEDS SELECTOR.** The 2026-07-22
  version listed these as MISSING even though their own notes already said
  the selector was absent — inconsistent with this document's own Coverage
  key (MISSING requires a selector to already exist). Corrected against a
  fresh read of the source:
  - Close repository — unsaved → Discard (`UnsavedChangesDialog.tsx`'s
    "Continue without saving" button has no `data-testid` — only `onSave`
    does, as `unsaved-changes-save`).
  - Device Model CSV — paste → preview → import (`DeviceModelPreviewTable`
    in `CsvImportPanel.tsx` genuinely has no `data-testid`, unlike the
    device preview table's `csv-device-preview-table`).
  - Device Model CSV — negative validation (same table, same fix).
- **Spec file names updated** for the Stage 3C consolidation: the four
  Stage 3B.2 specs (`entity-deletes-inventory`/`-hierarchy`,
  `destructive-guards-inventory`/`-hierarchy`) were merged into
  `entity-deletes.e2e.ts` and `destructive-guards.e2e.ts` — coverage is
  unchanged, only the file layout.
- **Total/status counts fully recomputed by hand-counting every row** in
  this document, rather than carried forward. The 2026-07-22 version's own
  summary table (COVERED 38, MISSING 6, total 67) did not match the actual
  row count in its own matrix (69 rows; 9 rows tagged MISSING, not 6) — a
  pre-existing arithmetic error, now corrected. See "Summary counts" below.
- Confirmed via `git diff 8f749f8..HEAD -- 'apps/desktop/src/**'` that no
  application-source changes landed between the 2026-07-22 version and now
  outside: `ConfirmDialog`/delete-error-banner/`rack-detail-back-btn`
  selectors (Stage 3B.2, already reflected in the prior version) and the
  `PlacementInspectorPanel` `target_kind` bug fix (Stage 3C — a bug fix,
  not a new selector). Every other row's selector-presence claim was
  spot-checked directly against current source in this pass
  (`RackDetailPanel.tsx`'s `export-svg-btn`/`export-png-btn`,
  `RepositoryPanel.tsx`'s git-action buttons, `GlobalSearch.tsx`) and found
  unchanged from the 2026-07-22 version's claims.

---

## Coverage key

| Status | Meaning |
|--------|---------|
| COVERED | Fully exercised in an existing WDIO spec |
| PARTIAL | Some sub-flows covered; others not |
| MISSING | No WDIO coverage; stable selectors already present |
| NEEDS SELECTOR | No WDIO coverage; no stable `data-testid` yet |
| NEEDS APPLICATION CHANGE | No WDIO coverage; blocked by more than a missing selector — the UI has no testable (non-native-dialog) path at all. Added in Stage 3D. |
| DEFERRED | Intentionally out of scope (network, native dialogs, etc.) |
| NOT JUSTIFIED | Low E2E value; already covered by unit tests or trivial UI |

---

## Existing specs (as of Stage 3D)

| Spec file | What it covers |
|-----------|----------------|
| `app-smoke.e2e.ts` | App launch; landing screen sections visible |
| `repository-lifecycle.e2e.ts` | Create → close → reopen; scaffold on disk |
| `core-inventory.e2e.ts` | Location + Rack + Model + Device create; place at U1; persist after close/reopen |
| `safety-recovery.e2e.ts` | Clone URL safety (3 unsafe + 1 control); open-path recovery (2 cases) |
| `csv-import.e2e.ts` | Device CSV preview + import + persist; negative: missing required column |
| `placement-lifecycle.e2e.ts` | Place at U1; edit → move to U5; persist; remove via inspector; persist removal |
| `entity-updates-work-mode.e2e.ts` | Work mode toggle; edit all four entity types; persist after close/reopen |
| `entity-deletes.e2e.ts` | Delete device model (unreferenced) + device (unplaced) + rack (no placements) + location (no racks); cancel assertion; relational count checks; persist. Consolidated from Stage 3B.2's `entity-deletes-inventory`/`-hierarchy` in Stage 3C. |
| `destructive-guards.e2e.ts` | Guard: location/rack/device-model/device against constrained deletes; full graph assertions. Consolidated from Stage 3B.2's `destructive-guards-inventory`/`-hierarchy` in Stage 3C. |
| `placement-inspector-workflows.e2e.ts` | Edit placement height U; remove placement via `EditPlacementModal`; `PlacementInspectorPanel` navigate to device/model; rack-object placement (Stage 3C) |
| `searchable-select-regression.e2e.ts` | `SearchableSelect` dropdown regression via device-model field (open, search, select, persist) |
| `placement-validation.e2e.ts` | Negative-path placement coverage (Stage 3D): occupied U, partial overlap, full overlap/containment, exceeds rack height, invalid start U, invalid height override — every case verifies rejection, no state change, and persistence of that unchanged state after reopen |
| `unsaved-changes-discard.e2e.ts` | UnsavedChangesDialog "Continue without saving" (Stage 3E): unsaved location is genuinely discarded, not persisted |
| `recent-repositories-workflow.e2e.ts` | Landing screen recent-repositories panel (Stage 3E): row appears after close, path-cell click fills the open field without opening, Open button reopens the exact repository |
| `global-search-workflow.e2e.ts` | GlobalSearch (Stage 3E): typing surfaces a matching result, selecting it navigates to the correct panel and entity |
| `csv-device-model-import.e2e.ts` | Device Model CSV import (Stage 3E): sibling workflow to `csv-import.e2e.ts`'s Device CSV — preview, import, persist, negative validation |
| `validation-panel-workflows.e2e.ts` | ValidationPanel (Stage 3E): validate reflects on-disk state only, save-from-panel, level filter pills, navigate from issue to entity |

`apps/desktop/e2e-wdio/benchmarks/representative-latency.e2e.ts` is a
benchmark-only harness (9 interaction-pattern cases), not part of the
default spec suite and not counted as workflow coverage here.

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
| Close repository — unsaved → Discard | COVERED | `unsaved-changes-discard` (Stage 3E) |
| Recent repositories — list and click | COVERED | `recent-repositories-workflow` (Stage 3E) |
| Clone repository — URL safety (unsafe patterns) | COVERED | `safety-recovery` |
| Clone repository — URL safety (HTTPS control) | COVERED | `safety-recovery` |
| Clone repository — network: HTTPS happy path | DEFERRED | Requires network; no local mock |
| Clone repository — network: SSH + passphrase | DEFERRED | Requires network + SSH credentials |
| Open recovery — path does not exist | COVERED | `safety-recovery` |
| Open recovery — non-RIS directory | COVERED | `safety-recovery` |

**Git workflow (RepositoryPanel)**

The RepositoryPanel git section has no `data-testid` attributes on its action
buttons (Init, Validate, Commit, Add remote, Push, Pull) — confirmed unchanged
in this pass (`grep -c data-testid RepositoryPanel.tsx` → 4, none on the git
action buttons themselves).

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
| Edit location | COVERED | `entity-updates-work-mode` |
| Delete location — no racks (confirm dialog) | COVERED | `entity-deletes` |
| Delete location — racks exist (constraint error) | COVERED | `destructive-guards` |

---

### Rack management

| Workflow | Status | Notes |
|----------|--------|-------|
| Create rack | COVERED | `core-inventory` |
| Navigate to rack via location row click | COVERED | `core-inventory` |
| Edit rack | COVERED | `entity-updates-work-mode` |
| Delete rack — no placements (confirm dialog) | COVERED | `entity-deletes` |
| Delete rack — placements exist (constraint error) | COVERED | `destructive-guards` |

---

### Device model management

| Workflow | Status | Notes |
|----------|--------|-------|
| Create device model (server, 1U) | COVERED | `core-inventory` |
| Edit device model | COVERED | `entity-updates-work-mode` |
| Delete device model — no devices (confirm dialog) | COVERED | `entity-deletes` |
| Delete device model — devices exist (constraint error) | COVERED | `destructive-guards` |

---

### Device management

| Workflow | Status | Notes |
|----------|--------|-------|
| Create device (with model, planned status) | COVERED | `core-inventory` |
| Unplaced badge after creation | COVERED | `core-inventory` |
| Edit device | COVERED | `entity-updates-work-mode` |
| Delete device — unplaced (confirm dialog) | COVERED | `entity-deletes` |
| Delete placed device — must unplace first | COVERED | `destructive-guards` |

---

### Rack placement

| Workflow | Status | Notes |
|----------|--------|-------|
| Place device at U1 (PlacePlacementModal) | COVERED | `core-inventory` |
| Placed card visible in rack diagram | COVERED | `core-inventory` |
| Placed card title contains model name | COVERED | `core-inventory` |
| Placement persists after close + reopen | COVERED | `core-inventory` |
| Edit placement — change start U | COVERED | `placement-lifecycle` |
| Edit placement — change height U | COVERED | `placement-inspector-workflows` (Stage 3C) |
| Remove placement — via PlacementInspectorPanel | COVERED | `placement-lifecycle` |
| Removed placement persists after close + reopen | COVERED | `placement-lifecycle` |
| Remove placement — via EditPlacementModal remove | COVERED | `placement-inspector-workflows` (Stage 3C) |
| PlacementInspectorPanel: open edit modal | COVERED | `placement-lifecycle` |
| PlacementInspectorPanel: navigate to device | COVERED | `placement-inspector-workflows` (Stage 3C) |
| PlacementInspectorPanel: navigate to model | COVERED | `placement-inspector-workflows` (Stage 3C) |
| Place rack object (Device Model, no separate Device record) | COVERED | `placement-inspector-workflows` (Stage 3C) |
| Move placement between racks | DEFERRED | Not supported by the application — `EditPlacementModal` and `RackDetailPanel.handleDiagramMovePlacement` both hardcode the current rack; no UI exposes a target-rack picker. Not a testing gap. |
| Placement rejected — occupied U (exact range match) | COVERED | `placement-validation` (Stage 3D) |
| Placement rejected — partial overlap | COVERED | `placement-validation` (Stage 3D) |
| Placement rejected — full overlap / containment | COVERED | `placement-validation` (Stage 3D) |
| Placement rejected — exceeds rack height | COVERED | `placement-validation` (Stage 3D) |
| Placement rejected — invalid start U (frontend validation) | COVERED | `placement-validation` (Stage 3D) |
| Placement rejected — invalid height override (frontend validation) | COVERED | `placement-validation` (Stage 3D) |
| Rack export — SVG | NEEDS APPLICATION CHANGE | `export-svg-btn` present, but `saveRackViewSvgViaDialog` unconditionally calls a native OS save dialog with no alternative UI path (unlike repository open/create, which has a genuine text-path fallback). Not automatable without either a test-only hook or a product change to add a non-dialog path — both out of scope for an E2E stage. See `docs/E2E_WDIO_PLAN.md`'s Stage 3D section for the full analysis. |
| Rack export — PNG | NEEDS APPLICATION CHANGE | Same as SVG — `saveRackViewPngViaDialog`, same native-dialog blocker |

---

### CSV import

| Workflow | Status | Notes |
|----------|--------|-------|
| Device CSV — paste → preview → import → persist | COVERED | `csv-import` |
| Device CSV — negative: missing required column | COVERED | `csv-import` |
| Device Model CSV — paste → preview → import | COVERED | `csv-device-model-import` (Stage 3E) |
| Device Model CSV — negative validation | COVERED | `csv-device-model-import` (Stage 3E) |
| CSV sample download | NOT JUSTIFIED | `btn-download-sample` present; triggers Tauri native save dialog |

---

### Validation panel

All validation panel action buttons lack `data-testid` attributes.

| Workflow | Status | Notes |
|----------|--------|-------|
| Run validation — see issue list | COVERED | `validation-panel-workflows` (Stage 3E) |
| Filter issues by level | COVERED | `validation-panel-workflows` (Stage 3E) |
| Navigate from issue to entity | COVERED | `validation-panel-workflows` (Stage 3E) |
| Save from validation panel | COVERED | `validation-panel-workflows` (Stage 3E) |

---

### Work mode toggle

| Workflow | Status | Notes |
|----------|--------|-------|
| Toggle to onsite mode | COVERED | `entity-updates-work-mode` |
| Toggle to planning mode | COVERED | `entity-updates-work-mode` |
| Work mode affects device status defaults | NOT JUSTIFIED | Unit test coverage in `DevicesPanel.test.tsx` |

---

### Global search

`GlobalSearch` component has no `data-testid` attributes (confirmed
unchanged: `grep -c data-testid GlobalSearch.tsx` → 0).

| Workflow | Status | Notes |
|----------|--------|-------|
| Search for entity by name | COVERED | `global-search-workflow` (Stage 3E) |
| Navigate to entity from search result | COVERED | `global-search-workflow` (Stage 3E) |

---

### Settings panel

| Workflow | Status | Notes |
|----------|--------|-------|
| View current log directory | NOT JUSTIFIED | No testid; read-only display |
| Open logs folder (system call) | NOT JUSTIFIED | Opens OS file manager; not assertable in E2E |
| Choose custom log directory | DEFERRED | Requires native directory picker dialog |
| Reset log directory | NOT JUSTIFIED | No testid; side effect outside app UI |

---

### SearchableSelect regression

| Workflow | Status | Notes |
|----------|--------|-------|
| Dropdown open/search/select/persist via correct WebDriver event sequence | COVERED | `searchable-select-regression` |

---

## Selector readiness summary

Workflows by how much selector work is needed before a spec can be written:

### Ready (selectors already present)

These workflows have `data-testid` on all interactive elements.  A spec can be
written without touching application source.

None remaining — the last two "Ready" workflows (placement negative-path
validation) were covered in Stage 3D.

### Blocked by more than a selector (NEEDS APPLICATION CHANGE)

| Workflow | Why a selector alone doesn't unblock it |
|----------|------------------------------------------|
| Rack export — SVG | `export-svg-btn` exists, but the save destination is only reachable through a native OS dialog with no in-app alternative path |
| Rack export — PNG | Same |

### Selectors added in Stage 3E

| Selector | Element | Location |
|----------|---------|----------|
| `unsaved-changes-discard` | "Continue without saving" button | `UnsavedChangesDialog.tsx` |
| `csv-device-model-preview-table` | Preview `<table>` | `CsvImportPanel.tsx`'s `DeviceModelPreviewTable` |
| `global-search-input` | Search `<input>` | `GlobalSearch.tsx` |
| `recent-repo-row` / `data-recent-repo-path` | Recent-repos `<tr>` | `RepositoryPanel.tsx` (Open button reuses the existing `aria-label="Open <path>"` convention — no new selector needed for it) |
| `recent-repo-remove-btn` | Remove button, scoped per row | `RepositoryPanel.tsx` |
| `validation-validate-btn` / `validation-save-btn` | Validate / Save action buttons | `ValidationPanel.tsx` |
| `validation-filter-{all,error,warning,info}` | Level filter pills | `ValidationPanel.tsx` |
| `validation-issue-row` / `data-validation-issue-code` | Issue `<tr>` | `ValidationPanel.tsx` |
| `validation-issue-navigate-btn` | Per-row navigate button | `ValidationPanel.tsx` |
| `validation-save-summary` | Wrapper `<div>` around the save-result `Banner` | `ValidationPanel.tsx` |

Global search results (`GlobalSearch.tsx`'s `<li role="option">` items) got
no new selector — they are dynamically generated content with no fixed
identity, matched by content instead of a testid, same as
`SearchableSelect`'s own options. Note: unlike `SearchableSelect`, WebDriver
`getText()` does not reliably return this element's full text (a
driver-level quirk of its `text-overflow: ellipsis` styling — confirmed by
debugging, not assumed); `global-search-workflow.e2e.ts` matches on raw
`textContent` via `browser.execute()` instead.

### Needs one or more selectors

These workflows need `data-testid` added to application source before a spec
can use stable selectors.

| Workflow | What needs a testid |
|----------|---------------------|
| Git workflow actions | All RepositoryPanel git buttons |

### Deferred (out of scope for near-term stages)

| Workflow | Reason |
|----------|--------|
| Clone via HTTPS / SSH | Network-dependent; no local mock |
| SSH passphrase entry | SSH key + network required |
| Push / pull | Network-dependent |
| Move placement between racks | Not supported by the application at all — nothing to test |
| Choose custom log directory | Native directory picker dialog |

### Not justified (near-term)

| Workflow | Reason |
|----------|--------|
| CSV sample download | Native save dialog; low E2E value |
| Work mode affects device defaults | Already unit-tested |
| View / open / reset log directory | Read-only display or OS-level side effect, not assertable in E2E |

---

## Summary counts

Updated after Stage 3E (2026-07-25). Counted programmatically from every
workflow row in this document (one status tag per row).

| Status | Count |
|--------|-------|
| COVERED | 61 |
| PARTIAL | 0 |
| MISSING | 0 |
| NEEDS SELECTOR | 6 |
| NEEDS APPLICATION CHANGE | 2 |
| DEFERRED | 4 |
| NOT JUSTIFIED | 5 |
| **Total workflows inventoried** | **78** |

Current E2E coverage: **61 / 78 workflows (78%)**.

Since the Stage 3D snapshot (78 total, 51 COVERED, 65%): COVERED +10, NEEDS
SELECTOR −10 → 6 (all indicative Stage 3E scope items: unsaved-changes
discard, recent repositories, global search ×2, Device Model CSV ×2,
validation panel ×4). The 6 remaining NEEDS SELECTOR workflows are all git
workflow actions (init/validate/commit/add-remote/push/pull) — explicitly
out of scope for Stage 3E (different risk profile; see
`docs/E2E_WDIO_PLAN.md`'s Stage 3F sketch). NEEDS APPLICATION CHANGE (rack
export, 2) and DEFERRED/NOT JUSTIFIED are unchanged from Stage 3D — no
Stage 3E work touched those areas.

---

## Recommended next scope

See `docs/E2E_WDIO_PLAN.md` → "Future stages" (Stage 3F) for the concrete
next-stage proposal. With Stage 3E closing every low-risk NEEDS SELECTOR
workflow, only two gap categories remain:
- **NEEDS SELECTOR (6)** — all git workflow actions (init, validate,
  commit, add-remote, push, pull). This is now the entire remaining
  selector-addition backlog, matching Stage 3F's already-sketched scope
  (local-only git operations; push/pull stay DEFERRED regardless of
  selectors since they're network-dependent).
- **NEEDS APPLICATION CHANGE (2)** — rack export SVG/PNG. Not a
  testing-stage candidate until a product decision is made about adding a
  non-dialog export path.

Stage 3F should get its own NSP before implementation, per the program's
working model, given git operations mutate real repository state
(commits, branches) and warrant a dedicated risk review.
