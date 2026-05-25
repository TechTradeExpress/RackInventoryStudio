# Beta QA Findings — Action Plan

## 1. Purpose

This document captures beta QA findings discovered during manual inspection
after the rack placement UX redesign (PR #68) and Windows beta QA planning
(PR #69).

It does not mean beta is ready.
It defines follow-up PRs/milestones that must be completed before beta distribution.

---

## 2. Summary of findings

| # | Finding |
|---|---------|
| F1 | Settings shows log path information but lacks an "Open logs directory" action. |
| F2 | Users want the ability to change where logs are stored, but this may require a technical design because `tauri-plugin-log` may not support runtime path changes easily. |
| F3 | Release/version process needs a clearer release branch strategy (e.g. `release/vX.Y.Z` or `vX.Y.Z` branches). |
| F4 | The app still shows a duplicate internal brand block/icon/title at the top of the content area, even though the native window/titlebar already identifies the app. |
| F5 | Drag-and-drop does not work as a complete user workflow in the desktop build. |
| F6 | Drag-and-drop should also support moving equipment within the same rack side and removing/unracking equipment. |
| F7 | "Change side" / "Move to Rear" / "Move to Front" must be removed completely because moving between sides in one quick action is unsafe (no confirmation, no overlap check). |
| F8 | Place equipment needs a way to create a new device directly from the placement workflow. |
| F9 | The Front placements table should not be the primary rack workflow; placement information should be integrated into the rack diagram. |
| F10 | The Actions column in the placements table should become unnecessary once editing is driven from the diagram. |
| F11 | Device type should be visualized in the rack diagram using colors (server, switch, reserved, unknown, etc.). |
| F12 | The rack diagram currently shows two legends, making the meaning of colors unclear. |
| F13 | Download sample CSV does not work in the desktop app (browser Blob download is not supported in the Tauri runtime). |
| F14 | Racks list Utilization column appears incorrect or stale after placement mutations. |

---

## 3. Proposed milestone split

### Milestone A — Immediate beta blockers and small UI cleanup

> **Status:** Addressed in branch `fix/beta-qa-milestone-a-blockers` (PR #71).

**Scope**

- Remove the duplicate internal app brand block from the top of the app shell.
- Remove the "Change side" / "Move to Rear" / "Move to Front" actions completely from `PlacementInspectorPanel` and any other surfaces where they appear.
- Fix "Download sample CSV" using a Tauri-safe approach (e.g. `tauri-plugin-fs` or `dialog` save-file instead of browser Blob download).
- Investigate and fix Racks list Utilization calculation/refresh so it reflects current placements after add/edit/remove and after navigating back to the list.

**Acceptance criteria**

- No duplicate "Rack Inventory Studio" brand block is visible inside the app content or header area.
- No cross-side placement move action exists anywhere in the UI.
- Sample CSV can be saved/downloaded from within the desktop app.
- Utilization column reflects current placements immediately after changes and after returning to the Racks list from a rack detail view.

---

### Milestone B — Settings logs actions

**Scope**

- Add an "Open logs directory" button in the Settings panel (calls Tauri `shell.open` or `opener.open` on the log directory path).
- Add "Copy logs path to clipboard" if it adds clear value.
- Investigate whether `tauri-plugin-log` supports runtime log directory configuration.
- Do not implement a custom log directory unless it is supported cleanly and safely.

**Acceptance criteria**

- User can open the log directory from Settings with one click.
- If custom log directory is not implemented, the Settings panel documents the log location clearly and a follow-up issue explains the technical constraint.

---

### Milestone C — Rack diagram as primary placement UI

**Scope**

- Make the rack diagram the primary placement interaction surface.
- Reduce or remove the separate Front placements table as the main workflow entry point.
- Remove the Actions column from the placements table.
- Clicking a placed item in the diagram opens the placement details/edit flow (reuses `EditPlacementModal`).
- Color placement blocks by device type/status using a consistent palette.
- Replace the duplicate/confusing legends with one single, unambiguous legend.

**Acceptance criteria**

- Rack diagram displays device name, type indicator, and height U for each placement.
- User can open edit/inspect from the diagram.
- There is exactly one legend; all colors in the diagram are explained.
- Device type coloring is consistent across diagram and any other UI surfaces.

---

### Milestone D — Complete drag-and-drop workflow

**Scope**

- Drag from palette to empty U slot (already partially implemented; must work reliably in real desktop use).
- Drag an existing placement block within the same rack side to change Start U (opens modal with position prefilled, or applies directly with undo).
- Drag an existing placement block to a dedicated "Unrack" drop zone to remove it (with a safe confirm dialog).
- No one-step drag/drop cross-side movement.
- Keep the click/modal fallback fully functional for non-DnD users.

**Acceptance criteria**

- Drag-from-palette to empty slot works in real desktop use.
- Same-side drag-to-move is possible.
- Drag-to-unrack is possible but requires a confirmation step.
- Cross-side placement move is not possible via drag-and-drop.
- Full modal-based click flow remains functional without any drag-and-drop.

---

### Milestone E — Create device from Place equipment

**Scope**

- Add a "Create new device…" action inside `PlacePlacementModal`.
- Reuse `DeviceFormModal` (or equivalent) if available.
- After creating a device in the inline flow, return to `PlacePlacementModal` with the new device preselected.

**Acceptance criteria**

- User can create a new device without leaving the rack placement flow.
- The newly created device is immediately available for placement.
- Validation, error handling, global busy overlay, and tests are all covered.

---

### Milestone F — Release branch and versioning process

**Scope**

- Define a release branch naming strategy (e.g. `release/vX.Y.Z`).
- Define version bump rules:
  - patch — bugfixes
  - minor — feature milestones or beta increments
  - explicit pre-release suffix if used (e.g. `v0.2.0-beta.1`)
- Define which workflows build installer artifacts and from which branch types.
- Define tag creation and beta distribution checklist.

**Acceptance criteria**

- `docs/BETA_RELEASE_PROCESS_EN.md` (updated or supplemented) clearly describes release branches, version bumps, artifacts, tag creation, and installer build source.
- The process is compatible with the existing `scripts/check-version-consistency.mjs` check and the CI `version-check` job.

---

## 4. Recommended order

1. **Milestone A** — Immediate beta blockers and small UI cleanup
2. **Milestone B** — Settings logs actions
3. **Milestone C** — Rack diagram as primary placement UI
4. **Milestone D** — Complete drag-and-drop workflow
5. **Milestone E** — Create device from Place equipment
6. **Milestone F** — Release branch and versioning process

Milestones C and D are intentionally separate. Diagram-as-primary-UI and
drag-and-drop behavior are both regression-prone and touch overlapping code
paths. Keeping them separate reduces review risk and makes rollback easier
if one introduces regressions.

Milestone F (release process) is deferred to last because the process
document can only be finalized once the app is functionally stable. However,
F should be completed before the first official beta tag is created.

---

## 5. Beta blocking classification

| Finding | Blocks beta? | Reason | Proposed milestone |
|---------|-------------|--------|-------------------|
| F13 — Download sample CSV broken | **Blocks beta** | Core import workflow is non-functional on the desktop build | Milestone A |
| F14 — Utilization incorrect/stale | **Blocks beta** | Misleading data in the Racks list | Milestone A |
| F7 — Change side still present | **Blocks beta** | Unsafe one-step cross-side move with no overlap check | Milestone A |
| F4 — Duplicate brand block | Should fix before beta | Looks unpolished; reduces trust in the build | Milestone A |
| F5/F6 — Drag-and-drop incomplete | Blocks beta if advertised as supported; otherwise document the click-only fallback as the primary path | Desktop UX core feature | Milestone D |
| F8 — Create device from placement | Should fix before beta if rack workflow is the primary entry point | Significant workflow gap | Milestone E |
| F12 — Double legend | Should fix before beta | Confusing UX | Milestone C |
| F11 — No device-type color in diagram | Should fix before beta | Reduces rack diagram usefulness | Milestone C |
| F9/F10 — Table as primary UI/Actions column | Should fix before beta | Architectural UX issue | Milestone C |
| F1 — Logs open directory missing | Should fix before beta QA | Testers need to access logs easily | Milestone B |
| F2 — Custom log directory | Does not block beta | Design-only; default path is sufficient for beta | Post-beta follow-up |
| F3 — Release branch process | Blocks beta distribution process (not app functionality) | Must be in place before tagging a release | Milestone F |

---

## 6. Testing expectations

Every implementation milestone must pass the following before merge:

**Always required**

```bash
git diff --check
node scripts/check-version-consistency.mjs
test ! -f apps/desktop/package-lock.json
git ls-files '.ai/review-context-*.md' | grep . && exit 1 || true
```

**Frontend — required for any frontend change**

```bash
# Try pnpm; fall back to direct node invocation if pnpm fails
pnpm --filter @rack-inventory-studio/desktop typecheck
pnpm --filter @rack-inventory-studio/desktop test
pnpm --filter @rack-inventory-studio/desktop build
pnpm --filter @rack-inventory-studio/desktop test:e2e
```

**Rust — required if any Rust or Tauri command code is touched**

```bash
cargo fmt --all --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

Windows 11 manual QA (see `docs/BETA_WINDOWS_11_QA_EN.md`) remains required
before beta distribution, regardless of which milestones have been completed.

---

## 7. Related documents

- [`docs/BETA_HARDENING_PLAN_EN.md`](BETA_HARDENING_PLAN_EN.md) — overall beta hardening milestone list
- [`docs/BETA_RELEASE_PROCESS_EN.md`](BETA_RELEASE_PROCESS_EN.md) — release checklist, version bump procedure
- [`docs/BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) — Windows 11 manual QA runbook
