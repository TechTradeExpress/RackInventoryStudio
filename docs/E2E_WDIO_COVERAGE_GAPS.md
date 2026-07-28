# Desktop E2E Coverage Gap Analysis

Generated: 2026-07-22 (Stage 3B.2, PR #152); fully re-verified and rewritten
2026-07-25 against actual HEAD (post Stage 3C / embedded-provider-removal,
`roadmap/e2e-wdio` @ `db6752d`) — see "Maintenance pass (2026-07-25)" below
for what changed and why. Updated again same-day after Stage 3D
(`placement-validation.e2e.ts` delivered; rack export analyzed and
reclassified to NEEDS APPLICATION CHANGE), after Stage 3E (5 new specs
closing every low-risk NEEDS SELECTOR workflow), after the Stage 3F.0
audit (git workflow section re-verified against current backend/UI/test
source; one previously-untracked workflow found — SSH passphrase prompt;
two Clone rows' reasons refined; no tests or selectors added — audit only),
after Stage 3F.1A/3F.1B (git detection/init, validate/commit/add-remote,
and local push/pull error paths delivered), after Stage 3F.2 (2026-07-27
— successful push/pull round-trips over a real local-sshd-served SSH
remote, upstream tracking, and SSH key-based authentication all COVERED by
`git-remote-workflows.e2e.ts`; one new testid, `git-upstream-value`), and
after Stage 3F.3 (2026-07-28 — successful clone over the same SSH remote
COVERED by `git-clone-workflows.e2e.ts`, reusing Stage 3F.2's fixture
infrastructure unmodified; zero new selectors — `CloneRepositoryForm.tsx`
already had full coverage), and after Stage 3F.4 (2026-07-28 — `--ff-only`
diverged-pull failure and safe recovery COVERED by
`git-diverged-pull.e2e.ts`, reusing Stage 3F.2's fixture infrastructure
unmodified; one new helper, `isAncestor()` in `support/local-git.ts`;
zero new selectors).

Branch: `feature/e2e-stage-3f2-remote-ssh` (targeting `roadmap/e2e-wdio`) —
Stages 3F.3 and 3F.4 both continue on the same branch, uncommitted as of
this writing; Stage 3F.2 was approved but not yet merged, so later stages
build directly on its working-tree state rather than a separate branch
off an unmerged commit.

## Purpose

This document inventories the application's user-facing workflows against existing
WDIO E2E specs to identify gaps that inform Stage 3F.1/3F.2 and later stage planning.

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
| Clone repository — network: HTTPS happy path | DEFERRED | Requires network; no local mock. **Selectors already fully present** (`CloneRepositoryForm.tsx` has 11 testids — `clone-form`, `clone-url`, `clone-parent`, `clone-browse`, `clone-dirname`, `clone-submit`, `clone-preview`, plus 4 error-message testids); the only blocker is the network dependency itself (Stage 3F.0 audit, 2026-07-25). Unchanged by Stage 3F.3, which only covers SSH. |
| Clone repository — SSH, passphrase-less key (successful) | COVERED | `git-clone-workflows` (Stage 3F.3, 2026-07-28) — scaffold-only clone and multi-commit clone over a real local-sshd-served SSH remote (reusing Stage 3F.2's fixture, `support/git-remote.ts`), verified via helpers (HEAD, commit count, clean working tree, upstream tracking, remote URL) and via the UI (`git-branch-value`, `git-upstream-value`). No new selectors were needed — `CloneRepositoryForm.tsx` already had full coverage. |
| Clone repository — network: SSH + passphrase | DEFERRED | **A genuine product gap, not just a testing gap**: `clone_repository_cmd` calls the plain `ris_git::clone()`, not the askpass-hardened path push/pull use — SSH clone of a passphrase-protected key has no in-app passphrase prompt at all (Stage 3F.0 audit, 2026-07-25; see the Git Workflow section in `docs/E2E_WDIO_PLAN.md`). Still not fixed — Stage 3F.2 and Stage 3F.3 (2026-07-28) both explicitly excluded the passphrase workflow from their own scope; 3F.3 covered only the passphrase-less-key variant of SSH clone (row above). |
| Clone repository — close/reopen persistence | COVERED | `git-clone-workflows` (Stage 3F.3, 2026-07-28) — clones a repository, closes it, reopens it by path; verifies detection, branch, upstream, and remote configuration all survive via the UI and via helpers (`.git/config`, `git remote -v`) |
| Open recovery — path does not exist | COVERED | `safety-recovery` |
| Open recovery — non-RIS directory | COVERED | `safety-recovery` |

**Git workflow (RepositoryPanel)**

Re-audited against current HEAD 2026-07-25 (Stage 3F.0) — see
`docs/E2E_WDIO_PLAN.md`'s "Git Workflow — foundation audit" section for the
full backend/UI/test inventory this table summarizes. As of Stage 3F.2
(2026-07-27), 12 `data-testid`s exist covering detection/init (Stage
3F.1A: `git-not-initialized`, `git-init-btn`, `git-branch-value`),
validate/commit/add-remote/push-pull-error-paths (Stage 3F.1B:
`git-validate-btn`, `git-commit-message-input`, `git-commit-btn`,
`git-remote-name-input`, `git-remote-url-input`, `git-remote-add-btn`,
`git-remote-add-success`, `git-stepper-push-btn`, `git-stepper-pull-btn`,
`git-push-error`, `git-pull-error`), and upstream display (Stage 3F.2:
`git-upstream-value` — the "Upstream" `<dd>` had no testid before this
stage; added to prove Scenario 3's redetection-after-reopen at the UI
level, not just via `.git/config`).
One nuance found in Stage 3F.0's audit and resolved in Stage 3F.1B:
**Push and Pull each render as two separate, functionally-identical
button pairs simultaneously** once a remote is configured — one inline in
the "Safe publish" stepper (Steps 4/5, always acts on the branch's
tracked remote), one in the "Remote" panel next to a remote-selector
dropdown (`selectedRemote`). Both call the exact same
`handlePush`/`handlePull`. Stage 3F.1B selectorized only the stepper's
pair (`git-stepper-push-btn` / `git-stepper-pull-btn`, disambiguated by
name) — the Remote panel's identical pair remains deliberately
unselectorized, so no selector in this codebase matches more than one
element.

| Workflow | Status | Notes |
|----------|--------|-------|
| Git init (convert non-git directory) | COVERED | `git-detection-init` — covers detection of a repository with no `.git`, the init action, status refresh, detection persisting across close/reopen, and idempotent detection for a repository that already has Git (Stage 3F.1A, 2026-07-27) |
| Validate for publish | COVERED | `git-local-workflows` — triggering Validate from the "Safe publish" stepper (distinct UI path from `ValidationPanel`'s own already-covered Validate button, same backend call) and confirming it unblocks Commit (Stage 3F.1B, 2026-07-27) |
| Commit with message | COVERED | `git-local-workflows` — commit message entry, commit action, working tree becomes clean, HEAD changes, commit count increments (all cross-checked via `local-git.ts` helpers). Always full-tree (`git add -A` then commit) — there is no selective-staging/staged-files-list UI to test (Stage 3F.1B, 2026-07-27) |
| Add remote | COVERED | `git-local-workflows` — adds a fake HTTPS URL through the UI, confirms the success banner, cross-checks `.git/config` via `getRemoteUrl()`; the remote is never contacted (Stage 3F.1B, 2026-07-27) |
| Push to remote | COVERED | Local error-path COVERED by `git-local-workflows` (Stage 3F.1B). **Successful round-trip over a real SSH remote** COVERED by `git-remote-workflows` (Stage 3F.2, 2026-07-27) — pushes a commit to a local-sshd-served bare repo, verifies via helpers (remote HEAD, remote commit count) and via the UI (`git-branch-value`, new `git-upstream-value`) that upstream tracking is configured. Still selectorized on the stepper's button only (`git-stepper-push-btn`); the Remote panel's identical button remains deliberately unselectorized (see duplication note above). |
| Pull from remote | COVERED | Local error-path COVERED by `git-local-workflows` (Stage 3F.1B). **Successful fast-forward round-trip** COVERED by `git-remote-workflows` (Stage 3F.2, 2026-07-27) — simulates a teammate's commit landing on the remote, pulls it, verifies HEAD/commit-count/clean-working-tree via helpers. |
| Pull — diverged history (`--ff-only` failure and recovery) | COVERED | `git-diverged-pull` (Stage 3F.4, 2026-07-28) — constructs a genuine diverged history (local-only commit B, remote-only commit C, both children of a common pushed commit A; divergence confirmed via `git merge-base --is-ancestor` in both directions, not inferred from error text), clicks Pull, verifies `git-pull-error` renders and that both HEADs, commit counts, working tree, branch, upstream, and remote URL all survive — including after closing and reopening the repository. The application does not implement merge/rebase; this only proves the existing `--ff-only` rejection is safe. |
| Upstream tracking persistence (close/reopen) | COVERED | `git-remote-workflows` — pushes to establish upstream, closes the repository, reopens it, confirms the UI redisplays branch + upstream and `.git/config`/`git remote -v` still report tracking correctly (Stage 3F.2, 2026-07-27) |
| SSH authentication (key-based, no passphrase) | COVERED | `git-remote-workflows` — every push/pull in this spec authenticates over a real SSH connection (local sshd, ephemeral ed25519 key, no passphrase) via the app's own askpass-hardened `GitSecurityMode::Askpass` path, exercised end to end (Stage 3F.2, 2026-07-27) |
| SSH passphrase prompt | NEEDS SELECTOR | Partially selectorized: `SshPassphraseModal.tsx` already has `ssh-passphrase-input` on the text field; Submit and Cancel buttons have no testid. **Explicitly out of scope for Stage 3F.2** (its own NSP excludes the passphrase workflow) — the fixture's key intentionally has no passphrase |

**Confirmed not implemented anywhere in the application** (Stage 3F.0
audit — not a testing gap, nothing to select or test): branch
creation/switching/checkout, merge (beyond the automatic `--ff-only` pull),
rebase, stash, tags, a standalone fetch (only combined pull), a
staged-files list or selective staging, `user.name`/`user.email`
configuration (the app never sets or reads it — commits rely entirely on
the system git's own global config), and HTTPS credential management (no
in-app prompt/storage — relies entirely on the system git credential
helper). See `docs/E2E_WDIO_PLAN.md` for the full audit detail and why
these are product-scope boundaries, not gaps to close with tests.

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

Updated after Stage 3F.4 (2026-07-28). Counted programmatically —
`grep -cE '^\| .+ \| STATUS \|' docs/E2E_WDIO_COVERAGE_GAPS.md` per status
tag, one status tag per workflow row — not estimated.

| Status | Count |
|--------|-------|
| COVERED | 72 |
| PARTIAL | 0 |
| MISSING | 0 |
| NEEDS SELECTOR | 1 |
| NEEDS APPLICATION CHANGE | 2 |
| DEFERRED | 4 |
| NOT JUSTIFIED | 5 |
| **Total workflows inventoried** | **84** |

Current E2E coverage: **72 / 84 workflows (86%)** (COVERED only).

Since the Stage 3F.1B snapshot (79 total, 65 COVERED, 82%): **Push to
remote** and **Pull from remote** moved PARTIAL → COVERED (a successful
round-trip over a real local-sshd-served SSH remote is now exercised by
`git-remote-workflows.e2e.ts`, alongside their pre-existing local
error-path coverage from `git-local-workflows.e2e.ts`), and 2 new rows
were added and immediately COVERED — **Upstream tracking persistence
(close/reopen)** and **SSH authentication (key-based, no passphrase)** —
all Stage 3F.2, 2026-07-27. Since Stage 3F.2: 2 new rows added and
COVERED — **Clone repository — SSH, passphrase-less key (successful)**
and **Clone repository — close/reopen persistence**, both Stage 3F.3,
2026-07-28, reusing Stage 3F.2's fixture infrastructure unmodified. Since
Stage 3F.3: 1 new row added and COVERED — **Pull — diverged history
(`--ff-only` failure and recovery)**, Stage 3F.4, 2026-07-28, also reusing
Stage 3F.2's fixture infrastructure unmodified. Only **SSH passphrase
prompt** remains NEEDS SELECTOR — 3F.2, 3F.3, and 3F.4 all explicitly
excluded it (the fixture's key has no passphrase by design).

---

## Recommended next scope

See `docs/E2E_WDIO_PLAN.md` → "Git Workflow — foundation audit" and Stage
3F's own sections for the full breakdown. Remaining gaps:
- **NEEDS SELECTOR (1)** — SSH passphrase prompt (`SshPassphraseModal.tsx`'s
  Submit/Cancel buttons have no testid). Deliberately left for a future
  stage: Stages 3F.2, 3F.3, and 3F.4's NSPs all excluded the passphrase
  workflow by design (the fixture's SSH key has none), and the
  pre-existing product gap in `clone_repository_cmd` (no askpass wiring at
  all — see the Clone rows above) would need fixing first if a future
  stage wants to exercise this against a passphrase-protected key.
- **DEFERRED — HTTPS clone** — network-dependent, no local mock; unrelated
  to the SSH fixture, unaffected by Stages 3F.2/3F.3/3F.4.
- **DEFERRED — Passphrase-protected SSH clone** — blocked on the
  `clone_repository_cmd` askpass gap (a product fix, not a testing gap).
  Successful clone with a passphrase-less key is now COVERED (Stage 3F.3).
- **NEEDS APPLICATION CHANGE (2)** — rack export SVG/PNG. Not a
  testing-stage candidate until a product decision is made about adding a
  non-dialog export path.

No further directly-testable gap remains in the push/pull/clone/diverge
surface as scoped by the Stage 3F.0 audit (`--ff-only` diverged pull is
now COVERED — Stage 3F.4). Any future Git-workflow stage would need its
own NSP to scope genuinely new ground: the SSH passphrase prompt, or a
workflow not yet present in the application at all (merge, rebase, stash,
tags — none of which this program has ever proposed adding, since none
exist in the product).

Each Git workflow stage gets its own NSP before implementation, per the
program's working model, given git operations mutate real repository
state (commits, branches) and warrant a dedicated risk review.
