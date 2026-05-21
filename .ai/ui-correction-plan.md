# RackInventoryStudio UI Correction Plan

## 1. Context

After manual visual QA of the `design/claude-ui-polish` branch, two major UX regressions were identified:

1. **Add/Edit forms are inline** — all CRUD forms appear inline beneath their respective tables. They should use a shared modal/dialog pattern.
2. **Rack Detail layout is incorrect** — the current implementation shows both Front and Rear simultaneously, uses a simple select to move placements between sides, and lacks enriched placement label rendering.

Claude Design prepared a correction pass (2105) with an HTML prototype and ZIP handoff that defines the target UX precisely. This document records the decisions accepted from that pass and breaks down implementation into reviewable branches.

---

## 2. Source Design Artifacts

| Artifact | Description |
|---|---|
| `Rack Inventory Studio2105.html` | HTML prototype — full interactive mock of corrected UI |
| `Rack Inventory Studio2105.zip` | ZIP handoff — annotated design, component specs, layout grids |

These files are external to the repo. They define the canonical target for all correction branches.

---

## 3. Decisions Accepted from Claude Design

### Modal / Dialog pattern

- All Add/Edit CRUD forms use a modal dialog, not a native window and not inline forms.
- Modal chrome: header (title), optional subtitle, scrollable body, footer (actions), close button (×).
- Dismissal: Esc key and backdrop click both close the modal (unless form is dirty — TBD per branch).
- Form layout inside modal: 12-column `form-grid` with labelled sections.

**Suggested modal widths:**

| Use case | Width |
|---|---|
| Confirm / Delete / Side-change | 460 px |
| Location Add/Edit | 520 px |
| Rack Add/Edit, Device Model Add/Edit | 560 px |
| Device Add/Edit | 640 px |

### Rack Detail layout

- Diagram: **360 px** fixed width.
- Placement table: **1fr** (fills remaining horizontal space).
- Inspector + palette: **340 px** fixed right column.
- Front/Rear **segmented control** in the PageHeader (not a dropdown, not inline buttons).
- Diagram renders only the **active side** — never front and rear simultaneously.
- Switching the active side **clears the current selection**.
- Drag-to-place targets the active side only.
- Palette panel title: `Palette · drops on {side}`.

### Side change flow

- `side` is **read-only** in the normal inspector / move flow.
- Side reassignment happens via a dedicated **"Change side…"** action.
- That action opens a **confirmation modal** (460 px) before executing.
- There is no simple select input for side in any normal form.

### Placement label tiers

| U height | Label content |
|---|---|
| 1U | Compact single row: name + model + U range |
| 2U | Two rows: row 1 — name / U range; row 2 — model / serial / asset tag |
| 3U+ | Vertically centered stacked label with richer details (name, model, serial, asset tag, U range) |

- Placement block occupies the **full U span** (no gap at top or bottom within the block).
- Text is **centered both vertically and horizontally** within the block.

### Placement table

- Placement table is **part of Rack Detail**, not a separate panel.
- Table and diagram selection are **synchronized** — selecting a row highlights the diagram block and vice versa.

---

## 4. Branch Strategy

All implementation branches are cut from `design/claude-ui-polish` and merged back into `design/claude-ui-polish` after review. **No branch targets `master` at this stage.**

```
master  (untouched)
  └─ design/claude-ui-polish  (long UI polish branch — base for all correction branches)
       ├─ design/ui-correction-modal-primitives   → merge back to design/claude-ui-polish
       ├─ design/ui-correction-location-modal     → merge back to design/claude-ui-polish
       ├─ design/ui-correction-rack-model-modals  → merge back to design/claude-ui-polish
       ├─ design/ui-correction-device-modal       → merge back to design/claude-ui-polish
       ├─ design/ui-correction-rack-single-side   → merge back to design/claude-ui-polish
       ├─ design/ui-correction-rack-labels        → merge back to design/claude-ui-polish
       ├─ design/ui-correction-rack-inspector-table → merge back to design/claude-ui-polish
       └─ design/ui-correction-final-qa           → merge back to design/claude-ui-polish
```

Review context for each correction branch must be generated **against `design/claude-ui-polish`**, not against `master`.

---

## 5. Milestone Breakdown

### A — `design/ui-correction-modal-primitives`

**Goal:** Shared modal infrastructure used by all subsequent branches.

- `Modal` component — portal-rendered overlay, focus trap, Esc/backdrop dismissal
- `ConfirmDialog` — thin wrapper around Modal for yes/no confirmations (460 px default)
- `Segmented` control component — used in Rack Detail PageHeader
- `form-grid` CSS — 12-column layout utilities for sectioned modal forms
- Barrel exports via `components/ui/index.ts`
- Minimal unit tests for Modal (open/close/Esc/backdrop) and Segmented (value switching)

---

### B — `design/ui-correction-location-modal`

**Goal:** Validate the modal pattern end-to-end with the simplest entity.

- Replace inline Location Add/Edit form with `Modal` (520 px)
- `LocationFormModal` component — fields: name, code (slug), tags, notes
- Delete confirmation via `ConfirmDialog`
- Remove inline form markup from `LocationsPanel`
- Update LocationsPanel tests + Playwright smoke if selectors changed

---

### C — `design/ui-correction-rack-model-modals`

**Goal:** Apply modal pattern to Rack and Device Model entities.

- Replace inline Rack Add/Edit form with `Modal` (560 px)
- Replace inline Device Model Add/Edit form with `Modal` (560 px)
- Consistent field validation and edit-mode behavior across both modals
- Optional `DeleteConfirmModal` if the risk is low (reuse `ConfirmDialog`)
- Update affected panel tests and Playwright smoke selectors

---

### D — `design/ui-correction-device-modal`

**Goal:** Sectioned long form for Device entity.

- Replace inline Device Add/Edit form with `Modal` (640 px)
- Three sections inside the modal: **Identity** / **Hardware** / **Metadata**
- Device Model dropdown filtered by device type
- **No placement fields** in this modal (placement is managed via Rack Detail only)
- Update DevicesPanel tests and Playwright smoke selectors

---

### E — `design/ui-correction-rack-single-side`

**Goal:** Rack Detail renders one side at a time, controlled by a segmented control.

- Add `activeSide: 'front' | 'rear'` state to Rack Detail
- Render `Segmented` control (`Front` / `Rear`) in Rack Detail PageHeader
- `RackUnitDiagram` renders placements for `activeSide` only
- Switching side clears current selection
- Drag-to-place targets active side only
- `AddPlacementPanel` palette title: `Palette · drops on {side}`
- Update RackDetailPanel + diagram tests

---

### F — `design/ui-correction-rack-labels`

**Goal:** Enriched placement label rendering inside the diagram.

- Enrich placement data type to include: `name`, `model`, `serial`, `asset_tag`, `height_u`
- Implement label tier logic:
  - 1U → compact single row
  - 2U → two rows
  - 3U+ → vertically centered stacked block
- Placement block occupies full U span (no internal padding gap)
- Label text centered vertically and horizontally
- Add unit tests for label tier selection logic

---

### G — `design/ui-correction-rack-inspector-table`

**Goal:** Placement table integrated into Rack Detail with selection sync and side-safe inspector.

- Move placement table into Rack Detail (360 px diagram | 1fr table | 340 px right panel)
- Table ↔ diagram selection sync (click row → highlight block, click block → highlight row)
- Inspector: `side` field is read-only
- Remove `side` selector from normal move form
- Add **"Change side…"** action button in inspector
- `ConfirmDialog` (460 px) for side-change confirmation
- Update RackDetailPanel tests and Playwright smoke

---

### H — `design/ui-correction-final-qa`

**Goal:** Full visual and automated QA before deciding on PR.

- Final visual QA pass (GUI machine required)
- Copy consistency check across all modals and panels
- Update Playwright smoke selectors for any final regressions
- Tauri dev smoke (WSL2 headless check)
- All checks must pass (see §7)
- Prepare branch for PR decision to `master`

---

## 6. Per-Milestone Acceptance Criteria

### A — Modal primitives

- [ ] `Modal` renders in a portal, traps focus, closes on Esc and backdrop click
- [ ] `Modal` does not close on content click
- [ ] `ConfirmDialog` renders confirm/cancel buttons, resolves correct value
- [ ] `Segmented` switches active value on click, passes correct value to `onChange`
- [ ] `form-grid` two-column layout works at 460 / 520 / 560 / 640 px widths
- [ ] All new components exported from `components/ui/index.ts`
- [ ] All existing tests still pass

### B — Location modal

- [ ] "Add location" opens `LocationFormModal` (520 px), not inline form
- [ ] "Edit" row action opens pre-populated `LocationFormModal`
- [ ] Delete shows `ConfirmDialog` before executing
- [ ] Esc / backdrop closes modal without saving
- [ ] Saving closes modal and table refreshes
- [ ] No inline form visible in `LocationsPanel`
- [ ] All tests pass

### C — Rack + Device Model modals

- [ ] "Add rack" opens Rack modal (560 px)
- [ ] "Edit" opens pre-populated Rack modal
- [ ] "Add device model" opens Device Model modal (560 px)
- [ ] "Edit" opens pre-populated Device Model modal
- [ ] Delete (both entities) uses `ConfirmDialog`
- [ ] Esc / backdrop closes without saving
- [ ] No inline forms visible in either panel
- [ ] All tests pass

### D — Device modal

- [ ] "Add device" opens Device modal (640 px) with three visible sections
- [ ] "Edit" opens pre-populated Device modal
- [ ] Device Model dropdown is filtered by selected device type
- [ ] No placement fields present in the modal
- [ ] Delete uses `ConfirmDialog`
- [ ] Esc / backdrop closes without saving
- [ ] All tests pass

### E — Rack single-side

- [ ] `Segmented` control visible in Rack Detail PageHeader with `Front` and `Rear` options
- [ ] Default active side is `front`
- [ ] Switching side clears selection (no stale highlight)
- [ ] Diagram shows only placements for active side
- [ ] Dropped placement is assigned to active side
- [ ] Palette title shows `Palette · drops on Front` / `Palette · drops on Rear`
- [ ] All tests pass

### F — Rack labels

- [ ] 1U placement shows: name + model + U range in one row
- [ ] 2U placement shows: row 1 — name / U range; row 2 — model / serial / asset tag
- [ ] 3U+ placement shows: vertically centered stacked block with full details
- [ ] Placement block fills the full U span (no gap)
- [ ] Text is centered vertically and horizontally
- [ ] All tests pass

### G — Rack inspector + table

- [ ] Placement table visible next to diagram in Rack Detail
- [ ] Clicking a table row highlights the corresponding diagram block
- [ ] Clicking a diagram block highlights the corresponding table row
- [ ] Inspector `side` field is read-only (display only, not editable)
- [ ] No `side` select input in the move/edit form
- [ ] "Change side…" button visible in inspector
- [ ] "Change side…" opens `ConfirmDialog` (460 px) before executing
- [ ] All tests pass

### H — Final QA

- [ ] All panels visually match the CD 2105 prototype
- [ ] Copy consistent across all modals (button labels, headings, empty states)
- [ ] All Playwright smoke tests pass
- [ ] Tauri dev smoke: no panics, app launches
- [ ] All automated checks pass (see §7)
- [ ] Branch ready for PR decision

---

## 7. Test Expectations

Run these checks at the end of **every implementation branch** before committing:

```bash
git diff --check
pnpm --filter @rack-inventory-studio/desktop typecheck
pnpm --filter @rack-inventory-studio/desktop test
pnpm --filter @rack-inventory-studio/desktop test:e2e
pnpm --filter @rack-inventory-studio/desktop build
```

Run these additionally if any Rust / Tauri backend files are touched:

```bash
cargo fmt --all --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

For **report-only / planning branches** (no code changes):

```bash
git diff --check
```

---

## 8. Merge Flow Back into `design/claude-ui-polish`

Each correction branch follows this flow:

1. Cut branch from `design/claude-ui-polish`
2. Implement changes
3. Run all checks (§7)
4. Update `.ai/cc-report.md`
5. Commit and push correction branch
6. Generate review context **against `design/claude-ui-polish`**:
   ```bash
   TS=$(date +%Y%m%d-%H%M)
   bash scripts/ai/build-review-context.sh design/claude-ui-polish ".ai/review-context-${TS}.md"
   ```
7. Submit review context to ChatGPT for approval
8. After approval: merge correction branch back into `design/claude-ui-polish`
9. Delete correction branch after merge

**Do not open a PR to `master` until branch H (final QA) is complete and approved.**

---

## 9. Out of Scope

The following are explicitly out of scope for this correction phase:

- Dark mode toggle UI (tokens are defined; toggle not planned for this phase)
- Responsive layout / breakpoints
- Keyboard navigation polish beyond what the modal focus trap requires
- `RackUnitDiagram` color/style changes beyond label rendering (branch F)
- Backend / domain / repository schema changes
- CSV Import panel changes
- Repository panel changes
- Validation panel changes
- Any change to `master` branch

---

## 10. Review Handoff Requirements

Every implementation branch must, before review:

1. Pass all checks in §7.
2. Update `.ai/cc-report.md` with a new section summarizing the branch changes.
3. Commit and push the branch.
4. Generate a timestamped review context against `design/claude-ui-polish`:
   ```bash
   TS=$(date +%Y%m%d-%H%M)
   bash scripts/ai/build-review-context.sh design/claude-ui-polish ".ai/review-context-${TS}.md"
   ```
5. Attach the generated `.ai/review-context-YYYYMMDD-HHMM.md` to ChatGPT for code review before the branch is merged.

**Note:** Review context base is `design/claude-ui-polish`, not `master`, for all correction branches. These are reviewed as incremental deltas against the long UI polish branch.
