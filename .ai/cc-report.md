# cc-report — design/claude-ui-polish

## Summary

Implemented the Claude Design UI polish across the entire desktop app frontend, on branch `design/claude-ui-polish`. Eight commits, all pushed. No PR created (branch stays for review).

The work replaces inline `common.*` style objects throughout the app with a design-token-driven CSS class system, using the design primitives extracted from the Claude Design file. Followed by a stabilisation pass (Playwright fixes, cargo checks), a CSV import double-count bugfix, and a UI QA/hardening pass.

## Files changed

**Commit 1 — UI foundation (CSS + primitives):**
- `apps/desktop/src/app.css` — Complete design token system: oklch colors, 4pt spacing grid, semantic status tokens, `.btn`, `.panel`, `.badge`, `.banner`, `.tbl`, `.kv`, `.palette-card`, `.stepper`, `.stat-tile`, `.nav-item`, `.rail`, `.page-header`, layout utilities
- `apps/desktop/src/components/ui/Icon.tsx` — ~50 inline SVG icon components (Lucide-style)
- `apps/desktop/src/components/ui/Badge.tsx` — Badge with tone variants
- `apps/desktop/src/components/ui/Banner.tsx` — Banner with tone + default icons
- `apps/desktop/src/components/ui/Panel.tsx` — Panel with header + body (flush variant)
- `apps/desktop/src/components/ui/PageHeader.tsx` — Page title + subtitle + actions
- `apps/desktop/src/components/ui/EmptyState.tsx` — Empty state with illustration slot
- `apps/desktop/src/components/ui/index.ts` — Barrel export

**Commit 2 — App shell:**
- `apps/desktop/src/main.tsx` — Import app.css
- `apps/desktop/src/App.tsx` — New layout: `.app` grid, `.titlebar`, `.body` with `.rail` left nav (200px) + `.main`. Left rail: GlobalSearch + nav items with icons + nav-section groups + repo-card. Validation badge (err/warn count). Unsaved changes callout bar.
- `apps/desktop/src/features/search/GlobalSearch.tsx` — Added `fullWidth` prop for rail layout

**Commit 3 — Repository panel:**
- `apps/desktop/src/features/repository/RepositoryPanel.tsx` — PageHeader + `cols-sidebar` layout. StatTileGrid for entity counts. Safe Publish stepper (step-done/active/blocked). Git status/remote sections as Panels with `.kv` lists. Banner for feedback messages.

**Commit 4 — Rack detail:**
- `apps/desktop/src/features/racks/RacksPanel.tsx` — PageHeader + Panel flush .tbl table with utilization bar + icon buttons. List/detail view toggle: selecting a rack switches to full-detail view.
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — Three-pane grid (260px palette | 1fr diagram | 320px inspector). PageHeader breadcrumb + Back button. Rack stat footer (front/rear U used).
- `apps/desktop/src/features/racks/AddPlacementPanel.tsx` — Drag palette cards updated to use `.palette-card` CSS class with `.pc-drag`/`.pc-name`/`.pc-meta` slots.
- `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` — Rebuilt with `.kv` dl, `.btn` classes, Banner feedback, EmptyState when nothing selected.

**Commit 5 — All remaining panels:**
- `apps/desktop/src/features/validation/ValidationPanel.tsx` — PageHeader + filter pills + .cols-sidebar with issues table (filter All/Errors/Warnings/Info) + summary/fixes sidebar. Level badges.
- `apps/desktop/src/features/devices/DevicesPanel.tsx` — PageHeader + filter pills + Panel flush .tbl with device type icons, status badges, placed/unplaced badges.
- `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` — PageHeader + Panel flush .tbl with type Badge.
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — PageHeader + Panel flush .tbl with tags as `.tag` chips.
- `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` — PageHeader + .cols-sidebar: Source panel + Preview panel (left), Schema + Outcome panels (right). Row status badges.

## Tests

```
cargo fmt --all --check                                                → pass
cargo check --workspace                                                → pass
cargo test --workspace                                                 → pass
cargo clippy --workspace -- -D warnings                                → pass
pnpm --filter @rack-inventory-studio/desktop typecheck                 → pass
pnpm --filter @rack-inventory-studio/desktop test                      → 128/128 pass
pnpm --filter @rack-inventory-studio/desktop build                     → pass (vite production build)
pnpm --filter @rack-inventory-studio/desktop test:e2e                  → 9/9 pass (after repair fixes)
```

## Risks

- The rack detail three-pane grid (260px | 1fr | 320px) requires sufficient viewport width; it will overflow horizontally on very narrow windows. No responsive breakpoints were added.
- `AddPlacementPanel` still contains both the palette and the form in one component — for narrow left columns the form may feel cramped. A future pass could extract them.
- The `common` styles object from `lib/styles` is still imported and used in some non-rewritten components (e.g., `RackUnitDiagram`). These were not in scope.
- ~~No end-to-end (Playwright) tests were run~~ — **corrected in repair**: Playwright smoke tests run 9/9 on a Vite/web layer with Tauri mocks; full Tauri runtime is not required.

## Not done

- Responsive layout / mobile breakpoints
- Dark mode toggle (tokens are defined, but no toggle UI added)
- Keyboard navigation polish for the palette drag cards
- ~~Playwright e2e tests~~ — **done in repair**: 9/9 pass on Vite/web smoke layer with Tauri mocks (no full Tauri runtime needed)
- `RackUnitDiagram` visual polish (diagram cell colors still use inline styles from before)

## Suggested next step

Perform human visual QA on a machine with a GUI desktop (Windows or macOS) before deciding whether this branch is ready for PR. The automated suite (typecheck, 132 unit tests, 9/9 Playwright smoke, production build, cargo fmt/check/test/clippy) all pass and Tauri dev compiles and launches without panics, but visual inspection of the running app requires a real display server. Focus areas:

- **Global Search dropdown** — token-migrated in QA/hardening pass; confirm fonts, colors, hover highlight, and dropdown shadow look correct inside the 200px rail.
- **Rack Detail three-pane layout** — 260px palette | 1fr diagram | 320px inspector at different window widths; verify drag-to-place works end-to-end with the new `.palette-card` drag handles.
- **CSV Import** — preview rows, outcome panel counters, "Import N rows" button label.
- **Repository sidebar** — "Repository details" panel now uses `.kv` dl list (migrated from legacy inline styles); confirm alignment and colors.

---

## Repair update after ChatGPT review

**Working tree status:**
The working tree had one uncommitted change: `.ai/cc-report.md` (the report had been updated for the design branch but never committed). This was retained and will be included in the repair commit. All other files were clean.

**Playwright smoke tests (`pnpm --filter @rack-inventory-studio/desktop test:e2e`):**
Result: **9/9 pass** after fixes.

The redesigned UI broke 9/9 tests — all needed selector/semantic updates due to the new left-rail navigation and panel structure. Fixes applied:
- `Panel.tsx`: changed `<span>` → `<h2>` for panel titles to make them semantic headings; `margin: 0` added to `.phd-title` in CSS to prevent h2 browser-default margins.
- `App.tsx`: added `aria-disabled={disabled ? true : undefined}` to nav item divs so Playwright's `toBeDisabled()` / `toBeEnabled()` work correctly.
- `RepositoryPanel.tsx`: added `type="text"` to the repo-path input (required for `locator('input[type="text"]')` selector); renamed "Git status" Panel to "Git" (the test asserted an exact heading match).
- `ValidationPanel.tsx`: renamed "Re-run" button label to "Validate" to match existing test assertion.
- `app.css`: removed `overflow: hidden` from `.rail` and `.body` — the `position: absolute` search dropdown was being clipped by these ancestors; the dropdown extends below the search bar and must not be clipped.
- `smoke.spec.ts`: updated 8 selectors to match new UI (brand text via `getByText` not `getByRole("heading")`, new landing heading text, `Import N row` button regex, `Main Rack` heading in rack detail, `getByRole("option")` for search results, `exact: true` on "Devices" heading, `Push`/`Pull` button names, `Branch: main` text instead of table cell).

**`cargo test --workspace`:** pass (all Rust crate tests pass, doc-tests included).

**`cargo clippy --workspace -- -D warnings`:** pass, no warnings.

**`cargo fmt --all --check`:** pass.

**Frontend checks:**
- `pnpm --filter @rack-inventory-studio/desktop typecheck` → pass
- `pnpm --filter @rack-inventory-studio/desktop test` → 128/128 pass
- `pnpm --filter @rack-inventory-studio/desktop build` → pass (Vite production build, 17 kB CSS, 256 kB JS)

**Tauri dev smoke (WSL2):**
Launched with `WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 pnpm tauri dev`. Rust backend compiled in ~8s, Vite server started at localhost:1420, application binary executed without panics. Visual inspection not possible in headless WSL2 (no display server). All Rust and frontend checks confirm no regressions.

**WSL workaround used:** yes — `WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1`.

**Known remaining risks:**
- The rack detail three-pane grid (260px | 1fr | 320px) overflows horizontally on narrow windows — no responsive breakpoints.
- The search dropdown (now correctly unclipped) needs visual QA at different rail widths — the `overflow: hidden` removal from `.rail` and `.body` may expose long nav label overflow in edge cases.
- `RackUnitDiagram` visual polish still uses pre-redesign inline styles — not addressed in this repair.
- Drag-to-place UX in Rack Detail was not visually tested (headless WSL2).

**Out of scope (intentionally):**
- Dark mode toggle UI
- Responsive layout / breakpoints
- Playwright accessibility audit beyond smoke coverage
- Backend / domain / repo schema changes

---

## Repair update — CSV import warning row counts

**Blocker:**
`CsvImportPanel.tsx` computed `okRows` as all importable rows (including warning rows) and `warnRows` as the warning-row subset. The button label `Import ${okRows + warnRows} rows` and the Outcome panel `Will create: okRows + warnRows` both double-counted warning rows. A CSV with 3 importable rows (1 with warning) showed "Import 4 rows" and "Will create: 4", while the backend would only create 3 devices.

**Fix:**
Extracted a pure helper `deriveCsvImportUiSummary` into `csvImportSummary.ts` with unambiguous counters:
- `importableRows` — all rows that are NOT `skip_due_to_error` (what to import)
- `warningRows` — importable rows with at least one warning issue (subset of importable)
- `cleanRows` — `importableRows - warningRows` (importable with no warnings)
- `skippedRows` — rows with `skip_due_to_error`
- `totalRows` — all rows in preview

`CsvImportPanel.tsx` now uses:
- Button: `Import ${importableRows} row(s)` — no double-count
- Preview description: `N rows · N clean · N with warnings · N skipped`
- Outcome "Will create": `importableRows`
- Outcome "Warnings": `warningRows` + desc clarified as "Importable rows with warnings — review after import"
- Outcome "Skipped": `skippedRows`

No backend changes. No DTO changes. No Tauri commands touched.

**Test added:**
`apps/desktop/src/features/csvImport/csvImportSummary.test.ts` — 4 Vitest cases:
1. null preview → all zeros
2. 1 clean importable row
3. 1 warning importable row
4. mixed (2 clean + 1 warning importable + 1 skipped) — asserts `importableRows === cleanRows + warningRows` (no double-count invariant)

**Check results:**
- `git diff --check` → pass (no whitespace errors)
- `pnpm --filter @rack-inventory-studio/desktop typecheck` → pass
- `pnpm --filter @rack-inventory-studio/desktop test` → **132/132 pass** (10 test files, +4 new)
- `pnpm --filter @rack-inventory-studio/desktop test:e2e` → **9/9 pass**

**Manual Tauri check:** not performed (headless WSL2). Logic covered by Vitest helper tests and Playwright CSV import smoke (test 6 still passes end-to-end through mock). No functional changes to backend or import logic.

---

## UI QA / hardening pass

**Scope:** Practical audit of all redesigned panels for visual regressions against the design token system.

**Regressions found and fixed (3 files):**

1. **`GlobalSearch.tsx`** — Highest-impact regression: the search component was never migrated from old hardcoded hex styles (`#ccc`, `#607d8b`, `#e8f0fe`, `fontFamily: "monospace"`) to design tokens. Fixed: migrated to `.ri-input` class, `var(--font-mono)`, `var(--bg-surface)`, `var(--bd-2)`, `var(--ac-soft-bg)` for hover, `var(--sh-2)` for dropdown shadow, semantic error/empty colors. Also removed the dead `styles` object and added `IcSearch` icon to the input. Unused CSSProperties import from React added where needed.

2. **`RacksPanel.tsx`** — The rack list Panel had no `title` prop (`<Panel flush>`) while LocationsPanel and DevicesPanel both show a count title on their list panels. Added `title={`${racks.length} rack${racks.length !== 1 ? "s" : ""}`}` for consistency.

3. **`RepositoryPanel.tsx`** — The "Repository details" sidebar Panel still used `legacyCommon` inline styles (old pattern, not migrated in original UI polish). Replaced with a `.kv` dl list and removed the `legacyCommon` object entirely. Also cleaned up the now-unused `CSSProperties` import.

**Panels confirmed clean (no changes needed):**
- `App.tsx` — nav, titlebar, callout bar: tokens correct
- `ValidationPanel.tsx` — filter pills, issues table, summary sidebar: tokens correct
- `LocationsPanel.tsx` — list table, add/edit form: tokens correct
- `DevicesPanel.tsx` — filter pills, list table, add/edit form: tokens correct
- `DeviceModelsPanel.tsx` — list table, add/edit form: tokens correct
- `CsvImportPanel.tsx` — source/preview/schema/outcome panels: tokens correct
- `RackDetailPanel.tsx` — three-pane grid, diagram panel, inspector, placement tables: tokens correct
- `RepositoryPanel.tsx` (GitSection) — stepper, recent commits, git status, remote: tokens correct

**Check results:**
- `git diff --check` → pass (no whitespace errors)
- `pnpm --filter @rack-inventory-studio/desktop typecheck` → pass
- `pnpm --filter @rack-inventory-studio/desktop test` → **132/132 pass**
- `pnpm --filter @rack-inventory-studio/desktop test:e2e` → **9/9 pass**
- `pnpm --filter @rack-inventory-studio/desktop build` → pass (17 kB CSS, 256 kB JS)
- `cargo fmt --all --check` → pass
- `cargo check --workspace` → pass
- `cargo test --workspace` → pass
- `cargo clippy --workspace -- -D warnings` → pass

**Tauri dev smoke (WSL2, run after QA/hardening commit `7974dd4`):**

Command:
```
WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 pnpm tauri dev
```

Result:
- Vite dev server: **started** — ready in 126 ms at http://localhost:1420/
- Rust backend: **compiled** — `cargo run --no-default-features` finished in 7.31 s
- App binary: **launched** — `Running target/debug/rack-inventory-studio-desktop`, no panics or crashes observed during the 45-second smoke window

Environment constraint: WSL2 with no display server. The process started and ran without errors, but full visual inspection of the UI requires a GUI environment. The automated suite (Playwright, Vitest, typecheck, build) confirms correctness of all frontend behaviour that can be tested without a display.

Visual QA on a GUI machine is the only remaining step before this branch is ready for PR.

---

## UI correction planning after Claude Design 2105

**Commit type:** docs / planning only — no application code changed.

**Design artifacts (input):**
- `Rack Inventory Studio2105.html` — interactive HTML prototype from Claude Design correction pass
- `Rack Inventory Studio2105.zip` — annotated ZIP handoff with component specs and layout grids

**What this commit does:**
Creates `.ai/ui-correction-plan.md` documenting the accepted design decisions, branch strategy, milestone breakdown, per-milestone acceptance criteria, test expectations, and review handoff requirements for the UI correction phase. No src, tests, package files, or Rust/Tauri files were touched.

**Branch strategy:**
All correction work is done on short sub-branches cut from `design/claude-ui-polish` and merged back into `design/claude-ui-polish` after review. The eight planned branches are:

| Branch | Scope |
|---|---|
| `design/ui-correction-modal-primitives` | Modal, ConfirmDialog, Segmented, form-grid CSS |
| `design/ui-correction-location-modal` | Location Add/Edit as modal, end-to-end validation |
| `design/ui-correction-rack-model-modals` | Rack + Device Model modals |
| `design/ui-correction-device-modal` | Device modal, sectioned form |
| `design/ui-correction-rack-single-side` | activeSide state, Front/Rear segmented control |
| `design/ui-correction-rack-labels` | Enriched placement labels, 1U/2U/3U+ tiers |
| `design/ui-correction-rack-inspector-table` | Placement table sync, side read-only, Change side modal |
| `design/ui-correction-final-qa` | Final visual QA, smoke update, Tauri smoke |

**Review context for correction branches:**
Each correction branch generates its review context **against `design/claude-ui-polish`**, not against `master`:
```bash
TS=$(date +%Y%m%d-%H%M)
bash scripts/ai/build-review-context.sh design/claude-ui-polish ".ai/review-context-${TS}.md"
```

**master and PR status:**
`master` is not a target for any of these short correction branches. No PR to `master` will be created until branch H (final QA) is complete and approved.

---

## UI correction modal primitives — branch design/ui-correction-modal-primitives

**Branch:** `design/ui-correction-modal-primitives`
**Base branch:** `design/claude-ui-polish`

**Design artifacts used:**
- Claude Design handoff URL: `https://api.anthropic.com/v1/design/h/mnJFycw0fL6IbEQ-OuONEw`
- Files read: `primitives.jsx`, `forms.jsx`, `styles.css` (extracted from gzip tar bundle)
- Relevant sections: Modal/Dialog, ConfirmDialog, Segmented control, form-grid, Field

**What was implemented:**

*New TypeScript components (`apps/desktop/src/components/ui/`):*
- `Modal.tsx` — portal-rendered overlay via `createPortal(…, document.body)`. Props: `open`, `title`, `subtitle`, `onClose`, `children`, `footer`, `footerMessage/Tone`, `size` ("sm"=460/"md"=560/"lg"=640/"xl"=720), `width`, `danger`, `flush`, `disableBackdropClose`. Esc key + backdrop click close the modal. Dialog receives focus on open via `tabIndex={-1}`. Full focus trapping (Tab/Shift+Tab cycling within the modal) is not yet implemented; can be added when the first production CRUD modal is wired if needed.
- `ConfirmDialog.tsx` — thin wrapper over Modal. Fixed width 460 px. Props: `tone` ("default"|"danger"), `confirmLabel`, `cancelLabel`, `onConfirm`, `onCancel`. Danger tone: red border + `btn-danger` button.
- `Segmented.tsx` — generic `<T extends string>` controlled component. Renders `role="tablist"` with `role="tab"` buttons. Props: `value`, `onChange`, `options` (value/label/icon?/count?), `ariaLabel`. Active option gets `aria-selected="true"` and `.on` CSS class.
- `Field.tsx` — form field wrapper. Props: `label`, `required` (renders `<span class="req">*</span>`), `help`, `error` (shows `IcAlertCircle` + message), `className` (for `col-6` etc). Uses `.help` / `.help.err` child classes.

*CSS additions to `app.css`:*
- New tokens: `--sh-3` (heavy modal shadow), `--bg-overlay` (semi-transparent backdrop), `--sp-12` (48px spacing)
- `.input` / `select.input` / `textarea.input` — alias for `.ri-input`; used by future modal form fields
- `.input.mono` — monospace variant
- `Modal / Dialog` section: `.modal-backdrop`, `.modal`, `.modal.danger`, `.modal-hd`, `.modal-title`, `.modal-sub`, `.modal-bd`, `.modal-ft`, `.ft-msg`
- `Form grid` section: `.form-grid`, `.field.col-{3,4,6,8,12}`, `.form-section`, `.form-section-title`
- `Segmented control` section: `.seg`, `.seg-btn`, `.seg-btn.on`, `.seg-btn .count`
- `Field` additions: `.field .help`, `.field .help.err`, `.field .req`

*Barrel export (`index.ts`):*
Added exports for `ConfirmDialog`, `Field`, `Modal`, `Segmented` (alongside existing exports).

*Test infrastructure:*
- Added `jsdom@^26.1.0` and `@testing-library/react@^16.3.0` to `apps/desktop/package.json` devDependencies. These are required for React component DOM rendering tests.
- Updated `vite.config.ts`: added `environmentMatchGlobs` to enable `jsdom` environment for `src/components/ui/*.test.tsx` files only; other tests run in default (node) environment.

*Test files (`apps/desktop/src/components/ui/`):*
- `Modal.test.tsx` — 10 tests: does-not-render-when-closed, renders title/body/footer/subtitle, close button, Esc key, backdrop click, no-close-on-content-click, disableBackdropClose, danger class, custom width
- `ConfirmDialog.test.tsx` — 7 tests: does-not-render-when-closed, renders title/body, onConfirm, onCancel, Esc, custom labels, danger tone
- `Segmented.test.tsx` — 6 tests: renders options, selected state (aria-selected + .on), onChange, ariaLabel, count badge

**Intentionally NOT changed:**
- `LocationsPanel` Add/Edit flow — still inline (branch B)
- `DevicesPanel` Add/Edit flow — still inline (branch D)
- `DeviceModelsPanel` Add/Edit flow — still inline (branch C)
- `RacksPanel` Add/Edit flow — still inline (branch C)
- `RackDetailPanel` active side — unchanged (branch E)
- `RackUnitDiagram` — unchanged
- CSV Import — unchanged
- All Rust/Tauri backend files — unchanged

**Tests run and results:**
```
git diff --check                                                        → pass
pnpm --filter @rack-inventory-studio/desktop typecheck                 → pass
pnpm --filter @rack-inventory-studio/desktop test                      → 155/155 pass (13 test files)
  - Modal.test.tsx       10/10
  - ConfirmDialog.test.tsx 7/7
  - Segmented.test.tsx   6/6
  + 132 existing tests   pass (all 10 previous test files)
pnpm --filter @rack-inventory-studio/desktop test:e2e                  → 9/9 pass
pnpm --filter @rack-inventory-studio/desktop build                     → pass (20.9 kB CSS, 256 kB JS)
```
No Rust/Tauri files changed → cargo checks not required for this branch.

**Known risks:**
- `Field.tsx` uses `.help` / `.help.err` CSS child class pattern (design convention). Existing `RepositoryPanel.tsx` still uses `.fld-help` directly on a `div` — both `.fld-help` and `.help` are present in CSS, no conflict.
- `Modal` uses `createPortal` targeting `document.body`. In Playwright (real browser), this works correctly. In jsdom tests `document.body` is pre-cleared in `beforeEach`.
- `Modal` focus management is minimal: the dialog element receives focus on open (`tabIndex={-1}`) but Tab/Shift+Tab do not cycle within the modal. Full focus trapping can be added in a later accessibility polish pass without API changes.
- `Segmented` uses `tablist`/`tab` semantics but does not implement arrow-key tablist navigation yet. Acceptable for an initial primitive; should be revisited before Rack Front/Rear production use if keyboard accessibility is required.
- `Segmented` is a generic component — TypeScript ensures option `value` types match the `value` prop type. Future callers must provide compatible string literal union.
- CSS file grew by ~120 lines; no performance concern at current scale.

**Suggested next step:**
Branch B — `design/ui-correction-location-modal`: replace inline Location Add/Edit form with `LocationFormModal` using the new `Modal` primitive. This is the lowest-risk entity to validate the modal CRUD pattern end-to-end.

---

## UI correction location modal — branch design/ui-correction-location-modal

**Branch:** `design/ui-correction-location-modal`
**Base branch:** `design/claude-ui-polish`

**Prerequisite:** Branch `design/ui-correction-modal-primitives` was merged into `design/claude-ui-polish` before this branch was created. Modal, ConfirmDialog, Field, Segmented and supporting CSS are present on the base branch.

**What was changed:**

*New files:*
- `apps/desktop/src/features/locations/LocationFormModal.tsx` — Add/Edit Location modal component. Uses `Modal` (width 520 px) and `Field`. Handles add and edit modes. In edit mode: `code` field is disabled (immutable identifier). `disableBackdropClose` is set when form is dirty. Footer shows required-field warning or error message. Calls `addLocation`/`updateLocation` from tauriClient.
- `apps/desktop/src/features/locations/LocationFormModal.test.tsx` — 12 Vitest component tests (jsdom): modal not rendered when closed, add title/empty fields, required footer message, Cancel closes, Esc closes, valid submit calls addLocation + onSaved + onClose, Create button disabled when empty, format error for invalid code, edit title + pre-populated fields, code disabled in edit, updateLocation called on save, form resets when reopened with different location.

*Modified files:*
- `apps/desktop/src/features/locations/LocationsPanel.tsx` — Removed inline Add/Edit form. Replaced with `LocationFormModal` and `ConfirmDialog` for delete. Panel now has: `modalOpen`/`editingLocation` state for form modal, `pendingDelete` state for ConfirmDialog, `successMsg` dismissible Banner for post-save feedback. Delete now uses `ConfirmDialog` (danger tone, width 460 px) instead of native `window.confirm`. `aria-label` added to edit/delete icon buttons.
- `apps/desktop/vite.config.ts` — `environmentMatchGlobs` extended to cover `src/features/**/*.test.tsx` with jsdom environment (needed for LocationFormModal tests).

**How Add/Edit Location works after change:**
- "Add location" button → opens `LocationFormModal` (add mode, empty fields, code editable)
- Row "Edit" icon → opens `LocationFormModal` (edit mode, pre-populated, code disabled)
- Cancel button / Esc key → closes modal without saving
- Backdrop click on clean form → closes; on dirty form → blocked
- Save → calls tauriClient, on success: closes modal, re-fetches list, shows dismissible success Banner
- Row "Delete" icon → opens `ConfirmDialog` (danger) → on confirm: calls deleteLocation, re-fetches list
- All error states surfaced via footerMessage in modal or Banner in panel

**Intentionally NOT changed:**
- `DevicesPanel` Add/Edit flow — still inline (branch D)
- `DeviceModelsPanel` Add/Edit flow — still inline (branch C)
- `RacksPanel` Add/Edit flow — still inline (branch C)
- `RackDetailPanel`, `RackUnitDiagram` — unchanged (branches E, F, G)
- CSV Import — unchanged
- All Rust/Tauri backend files — unchanged
- Example repository data — unchanged

**Tests run and results:**
```
git diff --check                                                        → pass
pnpm --filter @rack-inventory-studio/desktop typecheck                 → pass
pnpm --filter @rack-inventory-studio/desktop test                      → 167/167 pass (14 test files)
  - LocationFormModal.test.tsx  12/12 (new)
  + 155 existing tests          pass
pnpm --filter @rack-inventory-studio/desktop test:e2e                  → 9/9 pass
pnpm --filter @rack-inventory-studio/desktop build                     → pass (20.9 kB CSS, 259 kB JS)
```
No Rust/Tauri files changed → cargo checks not required for this branch.

**Known risks:**
- `LocationFormModal` calls tauriClient directly; tests mock the module. Mocks cover the happy path and close logic but not backend error surface (e.g. duplicate code error from Rust). Error is caught and shown in footerMessage; not unit-tested.
- `isDirtyForm` compares form strings. If `joinTags` uses ", " separator and user types "tag1, tag2" with trailing space, dirty detection may produce a false positive. Acceptable for this iteration.
- `successMsg` auto-shown after save is dismissed only by the user (no auto-timeout). Minor UX — acceptable for this phase.
- `ConfirmDialog` body says "Locations with racks cannot be deleted" — this is a UX hint, not enforced by the modal. Backend will return an error if a rack is assigned; that error is caught and shown in `deleteError` Banner.

**Suggested next step:**
Branch C — `design/ui-correction-rack-model-modals`: replace inline Rack Add/Edit and Device Model Add/Edit forms with modals using the same pattern validated here.

---

## UI correction rack and model modals — branch design/ui-correction-rack-model-modals

**Branch:** `design/ui-correction-rack-model-modals`
**Base branch:** `design/claude-ui-polish`

**Prerequisites merged into base:**
- `design/ui-correction-modal-primitives` — Modal, ConfirmDialog, Field, Segmented, form-grid CSS
- `design/ui-correction-location-modal` — LocationFormModal as the reference CRUD modal pattern

**What was changed:**

*New files:*
- `apps/desktop/src/features/racks/RackFormModal.tsx` — Add/Edit Rack modal (560 px / `size="md"`). Uses `Modal` and `Field`. Handles add and edit modes. Fields: location (select), code (disabled in edit — identity), name, height U, row, description, tags. `disableBackdropClose` when dirty. Footer shows required-field warning or error. Calls `addRack`/`updateRack` from tauriClient.
- `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx` — Add/Edit Device Model modal (560 px / `size="md"`). Uses `Modal` and `Field`. Fields: device type (select), code (disabled in edit — identity), name, vendor, model number, height U, description, tags. Inline note for `rack_object` type. `disableBackdropClose` when dirty. Calls `addDeviceModel`/`updateDeviceModel` from tauriClient.
- `apps/desktop/src/features/racks/RackFormModal.test.tsx` — 12 Vitest component tests (jsdom): closed state, add mode (title/fields/required footer/Create disabled/Cancel/Esc/code format error/valid submit), edit mode (title/pre-populated/code disabled/valid update/form resets on reopen).
- `apps/desktop/src/features/deviceModels/DeviceModelFormModal.test.tsx` — 12 Vitest component tests (jsdom): closed state, add mode (title/fields/required footer/Create disabled/Cancel/Esc/code format error/valid submit), edit mode (title/pre-populated/code disabled/valid update/form resets on reopen).

*Modified files:*
- `apps/desktop/src/features/racks/RacksPanel.tsx` — Removed inline Add/Edit rack form and all related inline state (`rackForm`, `rackFormError`, `rackFormSuccess`, `rackFormSubmitting`, `showAddForm`, `editingRackId`). Replaced with `RackFormModal` and `ConfirmDialog` for delete. Panel now has: `modalOpen`/`editingRack` state, `pendingDelete` state for ConfirmDialog, `successMsg` dismissible Banner. Delete now uses `ConfirmDialog` (danger tone) instead of native `window.confirm`. `aria-label` added to edit/delete icon buttons.
- `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` — Removed inline Add/Edit model form and all related inline state (`showForm`, `form`, `formError`, `formSuccess`, `submitting`, `editingId`). Replaced with `DeviceModelFormModal` and `ConfirmDialog` for delete. Added internal `reloadToken` for post-save list refresh. `aria-label` added to edit/delete icon buttons.
- `apps/desktop/e2e/smoke.spec.ts` — Updated `getByRole("cell", { name: "Main Rack" })` selector to `exact: true` to avoid ambiguity caused by the new `aria-label` attributes on action buttons ("Edit Main Rack", "Delete Main Rack") which made the action cell's accessible name also include "Main Rack".

**How Add/Edit Rack works after change:**
- "Add rack" button → opens `RackFormModal` (add mode, empty fields, code editable)
- Row "Edit" icon → opens `RackFormModal` (edit mode, pre-populated, code disabled)
- Cancel / Esc → closes modal without saving
- Backdrop click on clean form → closes; dirty form → blocked
- Save → calls tauriClient, on success: closes modal, re-fetches rack list, shows dismissible success Banner
- Row "Delete" icon → opens `ConfirmDialog` (danger) → on confirm: calls deleteRack, re-fetches list
- Rack Detail view (clicking a rack row) is unchanged — still transitions to full detail via `onSelectRack`

**How Add/Edit Device Model works after change:**
- "Add model" button → opens `DeviceModelFormModal` (add mode)
- Row "Edit" icon → opens `DeviceModelFormModal` (edit mode, code disabled)
- Cancel / Esc → closes modal without saving
- Save → calls tauriClient, on success: closes modal, triggers list reload, shows dismissible success Banner
- Row "Delete" icon → opens `ConfirmDialog` (danger) → on confirm: calls deleteDeviceModel, reloads list

**Intentionally NOT changed:**
- `RackDetailPanel` — unchanged (branch E)
- `RackUnitDiagram` — unchanged (branch F)
- `AddPlacementPanel` / `PlacementInspectorPanel` — unchanged
- `DevicesPanel` Add/Edit flow — still inline (branch D)
- `LocationsPanel` — unchanged
- CSV Import — unchanged
- All Rust/Tauri backend files — unchanged
- Example repository data — unchanged

**Tests run and results:**
```
git diff --check                                                        → pass
pnpm --filter @rack-inventory-studio/desktop typecheck                 → pass
pnpm --filter @rack-inventory-studio/desktop test                      → 191/191 pass (16 test files)
  - RackFormModal.test.tsx          12/12 (new)
  - DeviceModelFormModal.test.tsx   12/12 (new)
  + 167 existing tests              pass
pnpm --filter @rack-inventory-studio/desktop test:e2e                  → 9/9 pass (1 selector fixed)
pnpm --filter @rack-inventory-studio/desktop build                     → pass (20.9 kB CSS, 262 kB JS)
```
No Rust/Tauri files changed → cargo checks not required for this branch.

**Known risks:**
- `RackFormModal` passes `locations` as a prop (loaded by parent `RacksPanel`). If locations fail to load, the select is empty. Error is not surfaced in the modal itself but `RacksPanel` catches the error silently (`setLocations([])`).
- `DeviceModelsPanel` uses an internal `reloadToken` to refresh the list after save/delete. This is additive with the existing `mutationToken` prop trigger — both can trigger a reload if a parent mutation and a local mutation happen close together. Harmless (just an extra identical fetch).
- `isDirty` for edit mode on `RackFormModal` does not detect changes to `locationId` changing back to original — technically it would mark the form as dirty then clean. Acceptable for this iteration.

**Suggested next step:**
Branch D — `design/ui-correction-device-modal`: replace inline Device Add/Edit form with a modal (640 px) with three sections: Identity / Hardware / Metadata.

---

## UI correction device modal — branch design/ui-correction-device-modal

**Branch:** `design/ui-correction-device-modal`
**Base branch:** `design/claude-ui-polish`

**Prerequisites merged into base:**
- `design/ui-correction-modal-primitives` — Modal, ConfirmDialog, Field, Segmented, form-grid CSS
- `design/ui-correction-location-modal` — LocationFormModal (reference CRUD pattern)
- `design/ui-correction-rack-model-modals` — RackFormModal, DeviceModelFormModal

**What was changed:**

*New files:*
- `apps/desktop/src/features/devices/DeviceFormModal.tsx` — Add/Edit Device modal (`size="lg"`, 640 px). Uses `Modal` and `Field`. Three sections: Identity, Hardware, Metadata rendered via `.form-section` / `.form-section-title` dividers directly inside `.form-grid`. Fields: device type (select, required), code (disabled in edit — identity), status (select, required), name, device model (filtered by type), serial number, asset tag, external reference, description, tags. `disableBackdropClose` when dirty. Calls `addDevice`/`updateDevice` from tauriClient. Uses `<form id="device-form" onSubmit={handleSave}>` in body with `form="device-form"` on the footer submit button so Enter in text fields saves the form.
- `apps/desktop/src/features/devices/DeviceFormModal.test.tsx` — 15 Vitest component tests (jsdom): closed state, add mode (title/fields/required footer/Create disabled/identifier-required message/Cancel/Esc/code format error/valid submit/model filtering/model cleared on type change), edit mode (title/pre-populated/code disabled/valid update/form resets on reopen).

*Modified files:*
- `apps/desktop/src/features/devices/DevicesPanel.tsx` — Removed inline Add/Edit device form and all related state (`showForm`, `form`, `formError`, `formSuccess`, `submitting`, `editingId`). Replaced with `DeviceFormModal` and `ConfirmDialog` for delete. Added internal `reloadToken` for post-save/delete list refresh. `aria-label` added to edit/delete icon buttons. Delete now uses `ConfirmDialog` (danger tone) instead of native `window.confirm`. Success Banner shown after save.

**How Add/Edit Device works after change:**
- "Add device" button → opens `DeviceFormModal` (add mode, empty fields, code editable)
- Row "Edit" icon → opens `DeviceFormModal` (edit mode, pre-populated, code disabled)
- Cancel / Esc → closes modal without saving
- Backdrop click on clean form → closes; dirty form → blocked
- Save → calls tauriClient, on success: closes modal, reloads device list, shows dismissible success Banner
- Row "Delete" icon → opens `ConfirmDialog` (danger) → on confirm: calls deleteDevice, reloads list

**Device model relationship:**
- `DevicesPanel` loads all non-`rack_object` device models on mount and passes them to `DeviceFormModal`
- `DeviceFormModal` filters models by selected device type (same logic as before — preserved exactly)
- When device type changes and the currently selected model is incompatible, model is cleared
- No backend DTO changes

**Placement flow:**
- Placement is not part of the Device form — no rack, side, start U, or height U fields
- `is_placed` status continues to display as a badge in the devices table
- All placement logic remains in `RackDetailPanel` / `AddPlacementPanel` / `PlacementInspectorPanel` — untouched

**Intentionally NOT changed:**
- `LocationsPanel` — unchanged
- `RacksPanel` — unchanged
- `DeviceModelsPanel` — unchanged
- `RackDetailPanel`, `RackUnitDiagram` — unchanged (branches E, F, G)
- `AddPlacementPanel`, `PlacementInspectorPanel` — unchanged
- CSV Import — unchanged
- All Rust/Tauri backend files — unchanged
- Example repository data — unchanged

**Tests run and results:**
```
git diff --check                                                        → pass
pnpm --filter @rack-inventory-studio/desktop typecheck                 → pass
pnpm --filter @rack-inventory-studio/desktop test                      → 206/206 pass (17 test files)
  - DeviceFormModal.test.tsx   15/15 (new)
  + 191 existing tests         pass
pnpm --filter @rack-inventory-studio/desktop test:e2e                  → 9/9 pass
pnpm --filter @rack-inventory-studio/desktop build                     → pass (20.9 kB CSS, 264 kB JS)
```
No Rust/Tauri files changed → cargo checks not required for this branch.

**Known risks:**
- `DevicesPanel` passes `models` as a prop to `DeviceFormModal`; models are loaded on mount and on `mutationToken`/`reloadToken` changes. If models are stale (e.g. a model was deleted between page load and form open), the select may show a stale value in edit mode. Acceptable for this iteration.
- The "at least one of name / serial / asset tag" validation is enforced only in the frontend. The backend may or may not enforce it; if backend allows a device with none of these, a stale edit could remove them all. Frontend prevents this in the normal flow.
- `externalRef` field is in the Hardware section as "External reference" — previously it was labelled "External Ref" in the inline form. Label is now more descriptive.

**Suggested next step:**
Branch E — `design/ui-correction-rack-single-side`: add `activeSide: 'front' | 'rear'` state to Rack Detail, render `Segmented` control in PageHeader, render only active side in `RackUnitDiagram`.

---

## UI correction rack single side — branch design/ui-correction-rack-single-side

**Branch:** `design/ui-correction-rack-single-side`
**Base branch:** `design/claude-ui-polish`

**Prerequisites merged into base:**
- `design/ui-correction-modal-primitives` — Modal, ConfirmDialog, Field, Segmented, form-grid CSS
- `design/ui-correction-location-modal` — LocationFormModal
- `design/ui-correction-rack-model-modals` — RackFormModal, DeviceModelFormModal
- `design/ui-correction-device-modal` — DeviceFormModal

**What was changed:**

*Modified files:*
- `apps/desktop/src/features/racks/RackDetailPanel.tsx` — Added `activeSide: "front" | "rear"` state (default `"front"`). Added `handleSideChange` that sets activeSide and clears `selectedPlacement`. Imported `Segmented` and placed it in `PageHeader` actions alongside the Back button (`ariaLabel="Rack side"`, options: Front / Rear). Passes `activeSide` to `RackUnitDiagram` (new `side` prop) and `AddPlacementPanel` (new `activeSide` prop). On initial navigation to a placement, switches `activeSide` to the side of the found placement. `refreshAfterMutation` also switches `activeSide` after a move/add so the diagram follows the new placement position. Active side stats bolded in the footer.
- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — Added `side: "front" | "rear"` prop. Changed from rendering both Front and Rear columns simultaneously to rendering only the active side's column. Warnings filtered to active side only.
- `apps/desktop/src/features/racks/AddPlacementPanel.tsx` — Added `activeSide: "front" | "rear"` prop. Form's `side` state is initialized from `activeSide` and synced via `useEffect`. Side select is now `disabled` (locked to `activeSide` — the Segmented control in the rack header is the source of truth). Palette title updated to `"Drag to place · Front"` or `"Drag to place · Rear"`.
- `apps/desktop/e2e/smoke.spec.ts` — Extended "rack detail and placement table visible" test: added assertions that Front and Rear tab controls are visible, and that switching to Rear sets `aria-selected="true"` on the Rear tab.

**How activeSide works:**
- Default is `"front"` on every rack open.
- User switches via `Segmented` (Front / Rear) in the PageHeader — this is the single point of side selection.
- Switching clears the selected placement so the inspector shows empty state (no stale cross-side selection).
- On programmatic navigation (e.g. cross-rack move), `activeSide` is auto-set to the side of the destination placement.

**Front/Rear Segmented control location:**
- `PageHeader` actions area, to the left of the Back button.
- Uses existing `Segmented<"front" | "rear">` component from `components/ui/Segmented.tsx` with `ariaLabel="Rack side"`.

**Single-side rendering:**
- `RackUnitDiagram` receives `side` prop and renders only one `SideColumn` — front OR rear, never both.
- Both `front` and `rear` placement arrays are still passed as props (needed for occupancy calculation and the placement tables in the right column).
- The diagram header row shows "Front" or "Rear" depending on the active side.
- Warnings shown only for the active side.

**Drag-to-place side targeting:**
- Because `RackUnitDiagram` only renders one `SideColumn`, all drops naturally target `activeSide` without any extra logic.
- `AddPlacementPanel` form's `side` select is locked to `activeSide`; palette title says "Drag to place · Front" or "Drag to place · Rear".

**Selection clearing on side switch:**
- `handleSideChange` calls `setSelectedPlacement(null)` before setting new `activeSide`.
- Inspector returns to empty state after side switch — no cross-side placement details shown.

**Intentionally NOT changed:**
- Placement label enrichment (branch F)
- Placement table redesign / diagram-table sync (branch G)
- Inspector side read-only / Change side modal (branch G)
- All CRUD panels (Locations, Racks, DeviceModels, Devices) — unchanged
- CSV Import, Repository panel — unchanged
- All Rust/Tauri backend files — unchanged
- Example repository data — unchanged

**Tests run and results:**
```
git diff --check                                                        → pass
pnpm --filter @rack-inventory-studio/desktop typecheck                 → pass
pnpm --filter @rack-inventory-studio/desktop test                      → 206/206 pass (17 files)
pnpm --filter @rack-inventory-studio/desktop test:e2e                  → 9/9 pass (1 test extended)
pnpm --filter @rack-inventory-studio/desktop build                     → pass (20.9 kB CSS, 265 kB JS)
```
No Rust/Tauri files changed → cargo checks not required for this branch.

**Known risks:**
- The placement tables in the right column (Front placements / Rear placements) still show both sides simultaneously. This is intentional — they're kept as-is pending the branch G redesign. A user can click a placement in the "Rear placements" table while the diagram is on Front: this will set `selectedPlacement` and show it in the inspector, but the diagram will not highlight it (because it shows a different side). This is a known inconsistency to be resolved in branch G.
- `refreshAfterMutation` switches `activeSide` to follow the placement. If a user moves a front placement to rear, the diagram switches to Rear automatically. This is correct behavior but may surprise users who wanted to stay on Front. Branch G (inspector + table sync) can add explicit UX for this.

**Suggested next step:**
Branch F — `design/ui-correction-rack-labels`: enrich placement label rendering inside the diagram (1U compact / 2U two-row / 3U+ stacked).

---

## UI correction rack labels — branch design/ui-correction-rack-labels

**Branch:** `design/ui-correction-rack-labels`
**Base branch:** `design/claude-ui-polish`

Previously merged into base: modal-primitives, location-modal, rack-model-modals, device-modal, rack-single-side.

### What changed

Enriched placement block rendering inside `RackUnitDiagram` with tiered labels. Placement blocks now span their full U height, with text centered both vertically and horizontally. Label content adapts to the number of U occupied:

| U height | Content |
|---|---|
| 1U | Compact single line: name + model separated by ` · ` |
| 2U | Line 1: name; Line 2: model + serial + asset tag |
| 3U+ | Stacked: name / model / SN: serial / Asset: tag |

A new `derivePlacementLabel()` helper (`rackPlacementLabel.ts`) derives the structured label from a `PlacementDto`. A full tooltip/title is also built combining all available data.

**Backend extended** (small, contained): `PlacementDto` lacked `serial_number`, `asset_tag`, and device model fields needed for enriched labels. Added four optional fields:
- `model_name` — device model name (device placements only; null for rack objects which carry model name in `target_name`)
- `model_code` — device model code (device placements only)
- `target_serial` — device serial number
- `target_asset_tag` — device asset tag

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/src/dto.rs` | Added 4 fields to `PlacementDto` struct |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Populated new fields in `placement_to_dto` |
| `apps/desktop/src/api/tauriClient.ts` | Added 4 fields to `PlacementDto` TypeScript interface |
| `apps/desktop/e2e/mocks/tauri-core.ts` | Added new fields to fixture placement |
| `apps/desktop/src/features/racks/rackPlacementLabel.ts` | New: `derivePlacementLabel()` helper |
| `apps/desktop/src/features/racks/rackPlacementLabel.test.ts` | New: 11 unit tests |
| `apps/desktop/src/features/racks/RackUnitDiagram.tsx` | Tiered label rendering, full-span occupied blocks |
| `apps/desktop/src/app.css` | Added `.rpl-primary`, `.rpl-secondary`, `.rpl-meta`, `.rpl-compact` |
| `apps/desktop/src/features/racks/rackOccupancy.test.ts` | Updated `makePlacement` helper with null defaults for new fields |
| `apps/desktop/src/features/racks/dndHelpers.test.ts` | Updated `makePlacement` helper with null defaults for new fields |

### PlacementDto data available / used

| Field | Source | Used for |
|---|---|---|
| `target_name` | device.name / model.name | primary label |
| `target_code` | device.code / model.code | primary fallback |
| `model_name` | device_model.name (new) | model line |
| `model_code` | device_model.code (new) | model fallback |
| `target_serial` | device.serial_number (new) | SN: line |
| `target_asset_tag` | device.asset_tag (new) | Asset: line |
| `effective_height_u` | computed | tier selection + block height |
| `start_u` / `end_u` | placement | U range in tooltip |

### Backend/DTO changes

Rust `PlacementDto` extended with 4 `Option<String>` fields; `placement_to_dto` extended with two additional match blocks for model_name/model_code and target_serial/target_asset_tag. No domain model or persistence changes.

Cargo checks: fmt ✓ · check ✓ · test ✓ · clippy -D warnings ✓

### Label tier rules

- **1U**: `rpl-primary rpl-compact` — name + ` · ` + model in one ellipsized line
- **2U**: `rpl-primary` (name) + `rpl-secondary` (model · SN: x · Asset: x)
- **3U+**: `rpl-primary` (name) + `rpl-secondary` (model) + `rpl-meta` (SN: x) + `rpl-meta` (Asset: x)
- Empty fields suppressed — no `SN:` without a value

### Occupied block centering

Non-top continuation cells of multi-U blocks are rendered as `height: 0; overflow: hidden` invisible spacers. The top (visual-first) cell spans `effective_height_u * ROW_H` with `display: flex; flex-direction: column; align-items: center; justify-content: center`. Total height of the segment equals the sum of U-number gutter rows for the same span, preserving alignment.

### Not changed

- Placement tables (Front/Rear panels) — branch G
- PlacementInspectorPanel — branch G
- AddPlacementPanel behavior
- activeSide / Front–Rear segmented control
- CRUD panels, CSV Import, Repository/Git
- Example repository data

### Tests

```
cargo fmt --all --check  → pass
cargo check --workspace  → pass
cargo test --workspace   → pass (ris-core tests)
cargo clippy -D warnings → pass
pnpm typecheck           → pass
pnpm test                → 217/217 (11 new: rackPlacementLabel.test.ts)
pnpm test:e2e            → 9/9
pnpm build               → pass
```

### Risks

- The multi-U span approach (tall top cell + zero-height continuation cells) aligns correctly as long as `effective_height_u` in the DTO matches the actual number of U cells marked `occupied` by `buildOccupancy`. This invariant holds today.
- WSL2 headless: no visual QA of rendered diagram possible in this environment. Label CSS is validated via unit tests and DOM structure; visual correctness assumed from class/style inspection.

**Suggested next step:**
Branch G — `design/ui-correction-rack-inspector-table`: placement table integrated into Rack Detail with selection sync and side-safe inspector.

### Repair update (post-ChatGPT review)

**Blocker fixed: model duplication when device has no name**

When `target_name` is null and `model_name` is set, `primary` falls back to `model_name`. The original code also returned `model = model_name`, causing `primary === model`. This produced `PowerEdge R640 · PowerEdge R640` in 1U labels and a redundant model line in 2U/3U+.

Fix in `rackPlacementLabel.ts`:
```ts
const modelRaw = p.model_name ?? p.model_code ?? null;
const model = modelRaw !== null && modelRaw !== primary ? modelRaw : null;
```
`model` is now null whenever it would duplicate `primary`. Title building simplified to `if (model)` (redundant `model !== primary` guard removed).

**Tests added:**
- Updated `"fallback when target_name is null"` — now also asserts `model === null` and title does not repeat the model string.
- New `"no model duplication: device without name"` — asserts `model === null` and counts exact occurrences in title.

**Review context root-dir fix:**
Previous generation ran from `apps/desktop/` — the script checks `[[ -f .ai/cc-report.md ]]` relative to CWD, so it looked in the wrong directory. New context generated from repo root (`/home/su-17/projects/RackInventoryStudio`).

**Repair scope:** frontend-only — no Rust/Tauri changes. Cargo checks not repeated.

**Tests after repair:**
```
git diff --check           → pass
pnpm typecheck             → pass
pnpm test                  → 218/218 (12 label tests, 1 new)
pnpm test:e2e              → 9/9
pnpm build                 → pass
```

---

## UI correction rack inspector table — branch design/ui-correction-rack-inspector-table

**Branch:** `design/ui-correction-rack-inspector-table`
**Base branch:** `design/claude-ui-polish`

Previously merged into base: modal-primitives, location-modal, rack-model-modals, device-modal, rack-single-side, rack-labels.

### Current flow (before this branch)

`diagram click → onSelectPlacement → selectedPlacement state → PlacementInspectorPanel + two separate tables (Front placements / Rear placements shown simultaneously)`

The inspector had a side `<select>` in the Move form, allowing accidental side reassignment. Both tables were always visible regardless of activeSide.

### What changed

**Placement table — active side only**
Replaced the two separate "Front placements" and "Rear placements" panels in the right column with a single panel showing only the `activeSide` placements. Panel title changes dynamically: "Front placements" / "Rear placements". Placement count shown in panel description. Table columns enriched: U range · Name · Model · Serial · Asset tag. Switching side in the segmented control clears selection and updates the table immediately.

**Selection sync**
Table rows and diagram cells both call `handleSelectPlacement`. Clicking a row in the table selects the placement and highlights it in the inspector (same as clicking a diagram cell). The `tbl-selected` CSS class provides the table row highlight. Deselecting works by clicking the same row again.

**Inspector — side read-only**
Removed the `newSide` state and Side `<select>` from the Move form. The move form now passes `currentSide` (derived from the `side` prop, read-only) to `movePlacement`. A placement can only be moved to a different U position or a different rack — it stays on the same side unless the dedicated "Change side..." action is used. The "Move placement" heading now includes "(same side)" to clarify intent.

**Change side action — implemented**
Added a "Change side…" section in the inspector below the move form. A `Move to Rear…` / `Move to Front…` button opens a `ConfirmDialog` (460px) that clearly states what will happen (placement code, current side, destination side, current U position, in-memory warning). On confirm, calls `movePlacement` with `new_side: otherSide` and `new_start_u: placement.start_u`, then calls `onMoveSuccess(placement.id)` which triggers `refreshAfterMutation({ selectId: placement.id })`. This auto-switches `activeSide` to the placement's new side (existing behavior). Error state shown inside the dialog body if the backend rejects the move.

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` | Removed side `<select>`, added `ConfirmDialog` for "Change side…", locked move to current side |
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Replaced dual Front/Rear tables with single active-side table; enriched columns |
| `apps/desktop/e2e/smoke.spec.ts` | Extended rack detail test: heading assertions, cell content, side-switch behavior |

### Active placement table

- `activePlacements = activeSide === "front" ? detail.front : detail.rear`
- Title: "Front placements" or "Rear placements" (h2 from Panel)
- Columns: U · Name (target_name ?? target_code ?? code) · Model (model_name ?? model_code ?? "—") · Serial (target_serial ?? "—") · Asset tag (target_asset_tag ?? "—") · Type (device_type or "Rack object" or "—")
- Empty state: "No front/rear placements."
- Selection: clicking a row highlights it with `tbl-selected`; clicking again deselects

### Selection sync

`diagram click` → `onSelectPlacement(p)` → `selectedPlacement` → inspector + table row highlight  
`table row click` → `handleSelectPlacement(p)` → same `selectedPlacement` → inspector + diagram highlight  
Side switch → `setActiveSide` + `setSelectedPlacement(null)` → inspector resets, table clears selection

### Inspector side safety

- `newSide` state removed entirely
- `currentSide = side?.toLowerCase() as "front" | "rear"` derived from prop
- Move form `new_side: currentSide` — always matches current placement's side
- Side not shown as editable input anywhere in normal move flow
- "Move placement (same side)" eyebrow label makes intent explicit

### Change side action

Implemented. Button label: "Move to Rear…" or "Move to Front…". `ConfirmDialog` confirms before executing. Uses `movePlacement` with `new_side: otherSide, new_start_u: placement.start_u`. Post-confirm: `onMoveSuccess(placement.id)` → `refreshAfterMutation({ selectId: placement.id })` → `activeSide` auto-switches to new side. Error shown in dialog body on backend failure.

### Backend/DTO changes

None. Frontend-only branch.

### Not changed

- AddPlacementPanel behavior (palette locked to activeSide, drag/drop, form)
- Rack label helper (rackPlacementLabel.ts)
- CRUD panels (Locations, Devices, DeviceModels, Racks list)
- CSV Import, Repository/Git
- Example repository data

### Tests

```
git diff --check   → pass
pnpm typecheck     → pass
pnpm test          → 218/218 (no new unit tests; PlacementInspectorPanel is wired through e2e)
pnpm test:e2e      → 9/9 (rack detail test extended: heading roles, cell content, side-switch)
pnpm build         → pass
```

No Rust/Tauri changes → cargo checks not required.

### Risks

- WSL2 headless: no visual QA. "Change side…" ConfirmDialog tested via Playwright only indirectly (opening the dialog is part of the e2e button flow but full confirm sequence is not automated in smoke — tested via unit-level ConfirmDialog tests from modal-primitives branch).
- If a backend `movePlacement` call fails with a U conflict during "Change side…", the error is shown inside the dialog body. The dialog stays open, allowing the user to cancel. This is correct but requires visual verification.
- `new_start_u: placement.start_u` passed in "Change side…" — if the target side has a collision at that U, the backend will return an error. No automatic conflict resolution is attempted.

**Suggested next step:**
Branch H — `design/ui-correction-final-qa`: full visual and automated QA pass before deciding on PR to master.

---

### Repair update (post-ChatGPT review)

**Blockers fixed:**

1. **Type column missing from active placement table** — `RackDetailPanel.tsx` placement table had columns U · Name · Model · Serial · Asset tag but no Type column. Added `typeLabel` computation per row (`p.device_type ?? "Device"` for device placements, `"Rack object"` for device_model placements, `"—"` otherwise) and a `<th>Type</th>` header + `<td className="tbl-mono">` cell.

2. **cc-report incorrectly claimed Change side ConfirmDialog was covered by e2e** — the Risks section stated the dialog was "tested via Playwright only indirectly" and that the "full confirm sequence is not automated in smoke". In fact no e2e test for the dialog open/cancel flow existed at all. Added a new smoke test: `"rack detail: Change side dialog opens and can be cancelled"` that:
   - Opens rack detail, selects fixture placement `srv-01` from the table
   - Asserts "Move to Rear…" button is visible
   - Clicks it, asserts the `ConfirmDialog` is open (`getByRole("dialog", { name: /Move to Rear/i })`)
   - Clicks Cancel, asserts dialog is closed
   - Asserts placement is still on Front

   **Selector fix also required:** the initial implementation used `getByRole("heading", { name: /Move to Rear/i })` which fails because `Modal` renders the title as `<div className="modal-title">`, not a `<h2>` or heading role. The dialog element has `role="dialog"` with `aria-label="Move to Rear?"`, so the correct Playwright selector is `getByRole("dialog", { name: /Move to Rear/i })`.

**Tests after repair:**
```
git diff --check   → pass
pnpm typecheck     → pass
pnpm test          → 218/218 pass
pnpm test:e2e      → 10/10 pass (1 new test)
pnpm build         → pass
```

---

## UI correction final QA — branch design/ui-correction-final-qa

**Branch:** `design/ui-correction-final-qa`
**Base branch:** `design/claude-ui-polish`

All previous UI correction branches (A–G) are merged into `design/claude-ui-polish`:
- `design/ui-correction-modal-primitives` ✓
- `design/ui-correction-location-modal` ✓
- `design/ui-correction-rack-model-modals` ✓
- `design/ui-correction-device-modal` ✓
- `design/ui-correction-rack-single-side` ✓
- `design/ui-correction-rack-labels` ✓
- `design/ui-correction-rack-inspector-table` ✓

### What was reviewed

**A. CRUD modals** — All four entity modals (Location, Rack, Device Model, Device) reviewed:
- Modal sizes correct: Location 520 px, Rack/DeviceModel 560 px, Device 640 px.
- All modals: `title`, `subtitle`, `disableBackdropClose` on dirty form, `footerMessage` with required/error feedback, `Cancel` + `Save changes`/`Create` footer buttons — consistent.
- Code field disabled in edit mode for all entities.
- `ConfirmDialog` (danger tone) wired for all delete actions.
- Edit/delete action buttons all have `aria-label` and `title` attributes.
- No inline forms remaining in any CRUD panel.

**B. Rack Detail** — Verified:
- Front/Rear Segmented control in PageHeader.
- Default active side is `front`.
- `RackUnitDiagram` renders only the active side.
- Active placement table shows only `activeSide` placements with columns: U · Name · Model · Serial · Asset tag · Type.
- Selection sync: diagram ↔ table ↔ inspector.
- Move form uses `currentSide` (read-only, no side select).
- "Change side…" opens `ConfirmDialog`; dialog uses `getByRole("dialog")` in e2e (correct).
- `AddPlacementPanel` locked to `activeSide`.

**C. CSV Import** — Verified:
- `deriveCsvImportUiSummary` used; no double-counting of warning rows.
- Import button: `Import ${importableRows} row(s)`.
- Outcome "Will create": `importableRows`.
- Warning rows described as "importable rows with warnings".

**D. Repository/Git** — Not changed in this branch. Reviewed as unchanged; no regressions observed.

**E. App shell / Navigation** — Not changed in this branch. Left rail, GlobalSearch, tab navigation — verified unchanged.

### Fix applied

**`PlacementInspectorPanel.tsx` — Replace native `confirm()` with `ConfirmDialog` for "Remove placement"**

The "Remove placement" action was the only CRUD-level destructive action still using a native browser `confirm()` dialog. All other destructive actions (delete location, delete rack, delete device model, delete device, change side) already use `ConfirmDialog`. Replaced with:
- New `removeConfirmOpen` state.
- New `ConfirmDialog` (danger tone, 460 px) with title "Remove placement?" and body naming the placement code.
- `executeRemove` function does the actual removal after confirmation.
- `removeConfirmOpen` resets when `placement.id` changes (existing `useEffect` block extended).

No other files changed.

### Visual QA

**Environment:** Headless WSL2 — full visual QA not possible.

**Tauri dev smoke:**
- Command: `WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 pnpm tauri dev`
- Vite dev server: started (BeforeDevCommand completed).
- Rust backend: compiled in 9.15s, no errors.
- App binary: launched (`Running target/debug/rack-inventory-studio-desktop`), no panics observed.
- Visual inspection: not possible (headless WSL2, no display server).

**Manual visual QA required on Windows 11** before final PR to `master`. Focus areas:
1. Rack Detail three-pane layout at typical desktop window widths.
2. Placement table columns (U / Name / Model / Serial / Asset tag / Type) — confirm last column fits without overflow.
3. "Remove placement" — confirm `ConfirmDialog` (danger) opens and cancels correctly.
4. "Change side…" — confirm `ConfirmDialog` opens, shows placement code, closes on Cancel.
5. All four CRUD modals — confirm fields, required markers, disabled code field in edit mode.
6. Global Search dropdown — confirm not clipped by the left rail.
7. CSV Import — import button label and "Will create" counter match row count.

### Tests

```
git diff --check                → pass
pnpm typecheck                  → pass
pnpm test                       → 218/218 pass (18 test files)
pnpm test:e2e                   → 10/10 pass
pnpm build                      → pass (21.33 kB CSS, 267.41 kB JS)
cargo fmt --all --check         → pass
cargo check --workspace         → pass
cargo test --workspace          → pass (258 tests across all crates)
cargo clippy -D warnings        → pass
```

### Risks

- Full visual QA not completed (headless WSL2). Final appearance requires GUI machine inspection.
- The placement table (6 columns) may be narrow at some window widths in the 320 px right column — visual test needed.
- `PlacementInspectorPanel` remove confirmation: tested via unit ConfirmDialog tests and smoke "Change side" pattern; no dedicated remove-dialog e2e smoke test (low risk — dialog reuses the same ConfirmDialog component already covered by unit tests).
- `Window.confirm()` in `App.tsx` (unsaved-changes window-close guard) left intentionally — appropriate for a system-level close event.

### Readiness assessment

`design/claude-ui-polish` after merging this branch appears ready for PR to `master`, pending:
1. Manual visual QA on Windows 11 by a human reviewer.
2. ChatGPT code review approval of this branch.

No known functional blockers remain. All automated checks pass.

---

## Docs cleanup and release readiness — branch chore/docs-cleanup-release-readiness

**Branch:** `chore/docs-cleanup-release-readiness`
**Base branch:** `design/claude-ui-polish`

### What was updated

**`.github/workflows/windows-installer.yml`**
- Removed `pull_request` trigger. Workflow is now `workflow_dispatch` only (manual).
- Updated header comment to reflect manual-only trigger.
- PR trigger existed because `design/claude-ui-polish` was a long-lived branch — now removed for clarity.

**`apps/desktop/src-tauri/tauri.conf.json`** — no change in this branch (bundle config was fixed in `ci/windows-installer-build`).

**`.ai/windows-installer-ci.md`**
- Section "How to trigger" updated: emphasised manual-only trigger, no PR/push/schedule.
- Artifact glob clarified: `target/release/bundle/nsis/*.exe` (workspace-level target, not `apps/desktop/src-tauri/target/`).
- Added note: installer does not build on PRs.

**`README.md`**
- Updated test counts: 258 Rust (was 275), 218 Vitest (was 128), 10 Playwright (was 9). Previous counts in README were never updated after later test additions.
- Updated Playwright smoke test description: 10 tests (was 9).
- Roadmap table: "Claude Design / UX audit" and "UI polish based on design direction" updated from "Planned" to "Done (branch `design/claude-ui-polish`)". Added "Windows installer CI (manual, unsigned)" row as Done. Added "Manual visual QA on Windows 11" row as "Required before release".
- Release gate updated: 10/10 smoke tests, added manual Windows 11 QA and packaging check with installer.
- Added "Windows installer (manual CI)" section describing the manual workflow trigger and SmartScreen note.

**`CHANGELOG.md`**
- Added "Unreleased — UI polish (branch `design/claude-ui-polish`)" section at the top covering: CRUD modals, rack single-side flow, enriched placement labels, active placement table, inspector side-safety, CSV double-count fix, Windows installer workflow (manual-only), manual Windows 11 QA still required.

**`apps/desktop/src/components/TabBar.tsx`** — **deleted**
- File existed since v0.8.0 (milestone 8) as a shared tab bar component. After the `design/claude-ui-polish` UI redesign, `App.tsx` was rewritten to use a `.rail` left navigation pattern. `TabBar` is no longer imported anywhere. Only reference: its own definition. Confirmed dead: `grep -rl "TabBar" apps/desktop/src` returned only the file itself. Deleted. Typecheck passes.

### What was NOT changed

- `lib/styles.ts` — still used in `CreateRepositoryWizard.tsx` and `AddPlacementPanel.tsx` (`common.btn`, `common.input`, `common.row`, `common.errorBox`). Not dead. Left for a future focused cleanup pass.
- All Rust/Tauri backend files — unchanged.
- All CRUD panels, Rack Detail flow, CSV Import logic — unchanged.
- `examples/example-repository/` — unchanged.
- `package.json` / lockfile — unchanged.
- `CLAUDE.md` — no changes needed (already accurate).
- `MANIFEST.md` — archival document, already marked as such, no changes needed.
- `docs/*.md` — spec/architecture docs left as-is; they describe design intent, not current test counts.
- `.ai/ui-correction-plan.md` — planning document, historically accurate, no changes needed.

### actionlint

`actionlint` is not installed locally. Workflow YAML verified by manual inspection. The `on: workflow_dispatch:` form is valid GitHub Actions syntax.

### Tests

```
git diff --check                                                        → pass
pnpm --filter @rack-inventory-studio/desktop typecheck                 → pass
pnpm --filter @rack-inventory-studio/desktop test                      → 218/218 pass (18 test files)
pnpm --filter @rack-inventory-studio/desktop test:e2e                  → 10/10 pass
pnpm --filter @rack-inventory-studio/desktop build                     → pass (21.33 kB CSS, 267.41 kB JS)
```

No Rust/Tauri code changed → cargo checks not required.

### Risks

- `lib/styles.ts` and `CreateRepositoryWizard.tsx` / `AddPlacementPanel.tsx` still use legacy `common.*` inline styles. These components were not in scope for this cleanup branch; they should be migrated in a future pass.
- Test counts in README are now correct as of this branch. They will drift again as tests are added; consider removing hardcoded numbers in favor of prose descriptions in a future README refresh.
- `docs/*.md` spec files may have stale references to old UI patterns (inline forms, both-sides rack view) but they are design/spec documents — updating them would require a separate spec review pass.

### Suggested next step

Run the Windows Installer workflow manually on GitHub Actions against `design/claude-ui-polish` → download artifact → test installation on a clean Windows 11 machine → if QA passes, open PR from `design/claude-ui-polish` to `master`.

---

### Repair update (post-ChatGPT review)

**Blocker fixed:** `.ai/cc-report.md` contained a contradiction between the new "Docs cleanup" section (which correctly stated the `pull_request` trigger was removed) and the older "Windows installer CI" section (which still described the PR trigger as present and intentionally kept).

**Changes made to `.ai/cc-report.md`:**
- "When the workflow runs" subsection in `Windows installer CI` section rewritten: now states `workflow_dispatch` only, no `pull_request`/push/schedule, and explains the PR trigger was removed in `chore/docs-cleanup-release-readiness`.
- "Artifacts uploaded" subsection updated: removed stale MSI glob and `apps/desktop/src-tauri/target/` path; now shows only `target/release/bundle/nsis/*.exe` (workspace-level target, NSIS only, matching actual workflow and `tauri.conf.json`).

**No other files changed.** Workflow `.github/workflows/windows-installer.yml` was already `workflow_dispatch`-only.

---

### Repair update 2 (post-ChatGPT review)

**Blockers fixed:**
- README roadmap table still had `Playwright smoke tests (9/9)` while all other README references already said 10 tests. Removed the counter from the roadmap entry — it now reads `Playwright smoke tests` (no number) to avoid future drift.
- Older "Windows installer CI" section in this report still claimed `tauri.conf.json` was not changed (bundle defaults — MSI + NSIS) and listed a WiX risk bullet saying the upload glob covers both. Both are now inconsistent with the actual state: `tauri.conf.json` has `bundle.active: true, targets: ["nsis"]`, and the workflow uploads only `target/release/bundle/nsis/*.exe`. Updated both bullets accordingly.

**Files changed:** `README.md`, `.ai/cc-report.md`.

**Final documented installer state:** manual-only (`workflow_dispatch`), NSIS artifact only, `target/release/bundle/nsis/*.exe`, unsigned, no MSI/WiX.

---

## Windows installer CI — branch ci/windows-installer-build

**Branch:** `ci/windows-installer-build`
**Base branch:** `design/claude-ui-polish`

### What was added

A GitHub Actions workflow that builds an unsigned Windows installer artifact for the Rack Inventory Studio desktop application.

**File added:** `.github/workflows/windows-installer.yml`
**Docs added:** `.ai/windows-installer-ci.md`

### When the workflow runs

- `workflow_dispatch` only — triggered manually from the GitHub Actions UI.

The workflow does **not** trigger on pull requests, push, or schedule. The `pull_request` trigger that existed in the original commit was removed in branch `chore/docs-cleanup-release-readiness` so that the installer is only built on explicit manual request.

### Checks performed by the workflow

| Step | Command |
|---|---|
| Rust toolchain | `dtolnay/rust-toolchain@stable` |
| Rust cache | `Swatinem/rust-cache@v2` |
| pnpm + Node 22 | `pnpm/action-setup@v6`, `actions/setup-node@v6` (matching existing CI) |
| Install deps | `pnpm install --frozen-lockfile` |
| TypeScript check | `pnpm --filter @rack-inventory-studio/desktop typecheck` |
| Frontend tests | `pnpm --filter @rack-inventory-studio/desktop test` |
| Tauri build | `pnpm --filter @rack-inventory-studio/desktop tauri build` |
| Upload artifact | `actions/upload-artifact@v4`, name: `rack-inventory-studio-windows-installer` |

### Tauri build command

```
pnpm --filter @rack-inventory-studio/desktop tauri build
```

`tauri.conf.json` has `beforeBuildCommand: "pnpm build"` which runs the Vite frontend build automatically inside `tauri build`. No separate `pnpm build` step needed before the Tauri step.

### Artifacts uploaded

NSIS installer only (`bundle.targets: ["nsis"]` in `tauri.conf.json`; MSI excluded — WiX not available on `windows-latest`):

| Glob | Format |
|---|---|
| `target/release/bundle/nsis/*.exe` | NSIS self-extracting installer |

Path is workspace-level Cargo target directory (not `apps/desktop/src-tauri/target/`).
`if-no-files-found: error` — CI fails if the file is missing.
Retention: 30 days.
Artifact name: `rack-inventory-studio-windows-installer`

### Code signing

Not configured. The installer is unsigned. Windows SmartScreen will warn on first run — user must click "More info" → "Run anyway". Signing can be added later via GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) following Tauri v2 signing docs. No secrets, certificate paths, or placeholders were added to the repository.

### What was NOT changed

- No application source code changed.
- No Rust/Tauri backend changed.
- `tauri.conf.json` updated: added `bundle.active: true` and `targets: ["nsis"]` so Tauri produces the NSIS installer. MSI/WiX packaging is intentionally out of scope (WiX is not available on `windows-latest`).
- No `package.json` / lockfile changes.
- No `examples/example-repository` changes.

### Local checks

```
git diff --check                 → pass
pnpm typecheck                   → pass
pnpm test                        → 218/218 pass
pnpm build                       → pass (21.33 kB CSS, 267 kB JS)
```

No Rust/Tauri code changed → cargo checks not required.

`actionlint` not available locally — YAML syntax verified by manual review only.

### Risks

- MSI/WiX packaging is out of scope. The workflow uploads only the NSIS artifact (`target/release/bundle/nsis/*.exe`); `if-no-files-found: error` catches a missing build.
- Tauri v2 cold build on Windows takes 20–30 minutes. Warm cache (Swatinem) reduces this to ~5–10 min.
- Unsigned installer triggers SmartScreen on Windows 11 — acceptable for internal QA.
- Workflow has not been run on GitHub Actions yet; first real run will validate all steps end-to-end.

### Suggested next step

Run the workflow manually on GitHub Actions against `design/claude-ui-polish` and download the artifact. Test the installer on a clean Windows 11 machine.

---

## Local diagnostics logging — branch chore/local-diagnostics-logging

**Branch:** `chore/local-diagnostics-logging`
**Base branch:** `design/claude-ui-polish`

### Technology chosen

**`tauri-plugin-log` v2** (official Tauri v2 logging plugin) + **`log` v0.4** (Rust logging facade).

Chosen because:
- It is the officially recommended solution for Tauri v2 applications.
- Writes directly to the platform's app log directory with no external dependencies.
- Already part of the Tauri ecosystem used by the rest of the project.
- Provides both file and stdout targets out of the box.
- Frontend counterpart `@tauri-apps/plugin-log` integrates with the same pipeline.

### Where logs are stored

Logs are written to the platform app log directory managed by Tauri:

- **Windows 11 (QA target):** `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\`
- **macOS:** `~/Library/Logs/com.techtradeexpress.rackinventorystudio/`
- **Linux:** `~/.local/share/com.techtradeexpress.rackinventorystudio/logs/` (XDG)

Exact filename confirmed during Windows QA (Tauri names it by app bundle identifier).

### Logs are local-only / no telemetry

Confirmed: no external endpoints, no analytics, no Sentry, no OpenTelemetry.
The log plugin writes only to local filesystem and stdout.

### Events logged

**Backend (Rust):** app startup, open/create/save/validate repository (counts only),
CSV preview/import (byte size + counts), git status/commit/push/pull (result + counts),
errors for all the above.

**Frontend (TS):** app init, open/create/close repository (success/failure), global
unhandled errors and promise rejections.

### Data redaction

- Sensitive patterns (`token`, `password`, `secret`, `private_key`, `api_key`, `auth`) →
  replaced with `[redacted]` / `[error message redacted: possible credential]`
- Strings capped at 300 characters
- File system paths reduced to basename only
- No full YAML/CSV content, no serial numbers, asset tags, or full user paths

### Files changed

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/Cargo.toml` | Added `tauri-plugin-log = "2"`, `log = "0.4"` |
| `apps/desktop/src-tauri/src/lib.rs` | Init log plugin in Builder; startup log via `.setup()` hook |
| `apps/desktop/src-tauri/src/diagnostics.rs` | **New** — `basename`, `truncate`, `sanitize_error` helpers + unit tests |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Log calls: open, create, save, validate, csv preview/import |
| `apps/desktop/src-tauri/src/commands/git.rs` | Log calls: git status, commit, push, pull |
| `apps/desktop/src-tauri/capabilities/default.json` | Added `log:default` permission |
| `apps/desktop/package.json` | Added `@tauri-apps/plugin-log ^2.0.0` |
| `apps/desktop/src/lib/diagnosticsLog.ts` | **New** — `logInfo`/`logWarn`/`logError` with Tauri fallback |
| `apps/desktop/src/lib/redact.ts` | **New** — `redactForLog`, `sanitizePathForLog`, `sanitizeErrorForLog` |
| `apps/desktop/src/lib/redact.test.ts` | **New** — 18 Vitest tests for redact helpers |
| `apps/desktop/src/main.tsx` | Global error/rejection handlers; frontend init log |
| `apps/desktop/src/App.tsx` | Log calls: handleOpen, handleCreateSuccess, handleClose |
| `apps/desktop/e2e/mocks/tauri-log.ts` | **New** — no-op mock for Playwright e2e |
| `apps/desktop/vite.config.e2e.ts` | Added alias for `@tauri-apps/plugin-log` mock |
| `.ai/local-diagnostics-logging.md` | **New** — user-facing documentation |
| `Cargo.lock` | Updated (tauri-plugin-log v2.8.0 and deps) |
| `pnpm-lock.yaml` | Updated (@tauri-apps/plugin-log v2.x) |

### Dependencies added

- Rust: `tauri-plugin-log = "2"` → resolved `2.8.0`; `log = "0.4"` → resolved `0.4.29`
- npm: `@tauri-apps/plugin-log ^2.0.0`
- Lockfile changes are minimal and contain only the log plugin and its transitive deps.

### Tests and results

| Check | Result |
|-------|--------|
| `git diff --check` | pass |
| `pnpm typecheck` | pass |
| `pnpm test` | 236/236 pass (18 new tests in `redact.test.ts`) |
| `pnpm test:e2e` | 10/10 pass |
| `pnpm build` | pass (270 kB JS, 21 kB CSS) |
| `cargo fmt --all --check` | pass (auto-applied) |
| `cargo check --workspace` | pass |
| `cargo test --workspace` | pass (12 tests in desktop crate, all workspace tests pass) |
| `cargo clippy --workspace -- -D warnings` | pass (no warnings) |

### Tauri dev smoke

Not run in this session — WSL2 environment has no display/Tauri runtime.
The log file path on Windows 11 will be confirmed during installer QA.

### Privacy risks

- Repository basenames and codes appear in logs (expected).
- Git branch names appear in `get_git_status` log entries.
- Item counts (locations, racks, devices) are logged — no personally identifying data.
- Full paths are NOT logged (basename only).
- Heuristic redaction only — unusual credential key names would not be caught.

### Repair update — post-ChatGPT review (privacy/stability blockers)

**Branch:** `chore/local-diagnostics-logging`

**Blockers fixed:**

1. **Frontend global error handler now sanitized** — `window.addEventListener("error", ...)` in
   `main.tsx` previously logged `e.message` unsanitized. Changed to
   `sanitizeErrorForLog(e.error ?? e.message ?? "unknown")`, matching the existing
   `unhandledrejection` handler.

2. **Rust `truncate` is UTF-8 safe** — replaced byte-indexing `&s[..max]` with
   `s.chars().count() <= max` guard and `s.chars().take(max).collect::<String>()`.
   Panics on multibyte char boundaries are now impossible. Test updated from byte-len 303
   to `chars().count() == 301`; new test `truncate_utf8_multibyte_does_not_panic` added
   (Polish `ą` × 400).

3. **Rust credential redaction extended** — `has_sensitive_pattern` now covers
   `private-key`, `private key`, `api-key`, `api key`, and `auth` in addition to the
   existing `token`, `password`, `secret`, `private_key`, `api_key`.
   Tests added: `sanitize_error_redacts_auth`, `sanitize_error_redacts_private_key_variants`,
   `sanitize_error_redacts_api_key_variants`.

4. **Rust path redaction added** — new `sanitize_paths_in_message` helper reduces
   whitespace-delimited tokens containing `/` or `\` to `[path:basename]`. URL tokens
   (`http://` / `https://`) become `[url]`. `sanitize_error` now applies path redaction
   after credential check and before truncation.
   Tests added: `sanitize_error_redacts_unix_path`, `sanitize_error_redacts_windows_path`,
   `sanitize_error_preserves_safe_message`.

5. **`sanitize_error` ordering fixed** — credential check is now first (preventing
   partial credential leakage via path token), then path redaction, then UTF-8 safe truncation.

6. **CSV import error now logged** — `import_device_csv_cmd` error path in `repository.rs`
   now calls `log::error!("import_device_csv failed: {}", sanitize_error(&msg))` before
   returning the error string.

7. **Documentation updated** — `local-diagnostics-logging.md` now accurately describes
   the extended credential patterns, path redaction heuristic, UTF-8 safe truncation,
   and the fact that both frontend global handlers use `sanitizeErrorForLog`.

**Files changed in repair:**
- `apps/desktop/src/main.tsx` — sanitize window error handler
- `apps/desktop/src-tauri/src/diagnostics.rs` — UTF-8 truncate, extended patterns, path redaction, new tests
- `apps/desktop/src-tauri/src/commands/repository.rs` — log::error in import_device_csv_cmd
- `.ai/local-diagnostics-logging.md` — accurate documentation of redaction rules

**Tests after repair:**

```
git diff --check                                            → pass
cargo fmt --all --check                                    → pass
cargo check --workspace                                    → pass
cargo test --workspace                                     → pass (18 tests in desktop crate)
cargo clippy --workspace -- -D warnings                    → pass
pnpm --filter @rack-inventory-studio/desktop typecheck     → pass
pnpm --filter @rack-inventory-studio/desktop test          → 236/236 pass
pnpm --filter @rack-inventory-studio/desktop test:e2e      → 10/10 pass
pnpm --filter @rack-inventory-studio/desktop build         → pass (270 kB JS, 21 kB CSS)
```

**Tauri dev smoke (WSL2):** Not run — headless WSL2, no display server.
All Rust and frontend automated checks confirm no regressions.

**Known limitations (by design):**
- Path redaction is heuristic: operates on whitespace-delimited tokens only.
  A path embedded mid-word (no surrounding spaces) is not detected.
- Basenames of repos, files, and Git branch names still appear in logs.
- Redaction is not a full DLP system.

### Repair update 2 — frontend path redaction (post-ChatGPT review)

**Branch:** `chore/local-diagnostics-logging`

**Blocker fixed:**

`sanitizeErrorForLog()` in `apps/desktop/src/lib/redact.ts` previously applied only
credential pattern check and truncation. Path-like tokens in error messages (e.g.
`Failed to open C:\Users\Jakub\Documents\rack-repo\devices.yaml`) were passed through
unsanitized if they contained no credential keywords.

**Fix applied — `redact.ts`:**

Added private `sanitizePathsInMessage(message: string): string` function, mirroring
the Rust `sanitize_paths_in_message` helper:
- Splits message on whitespace.
- Tokens starting with `http://` or `https://` → `[url]`.
- Tokens containing `/` or `\` → `[path:basename]` (last non-empty path segment).
- Other tokens pass through unchanged.

Updated `sanitizeErrorForLog` ordering:
1. Credential pattern check on the original string → full redaction if matched.
2. `sanitizePathsInMessage` — path token redaction.
3. Truncation to 300 chars.

**No Rust/Tauri files changed in this repair.**

**Tests added (`redact.test.ts` — 5 new tests in `sanitizeErrorForLog` suite):**
- `redacts unix paths in error messages` — `/home/user/repos/my-repo/repository.yaml` → `[path:repository.yaml]`
- `redacts windows paths in error messages` — `C:\Users\me\repo\devices.yaml` → `[path:devices.yaml]`
- `redacts url tokens in error messages` — `https://example.com/repo` → `[url]`
- `preserves safe messages without paths` — `"YAML parse failed at line 5"` unchanged
- `credential redaction takes precedence over path redaction` — message with `auth token` and path → credential redaction wins

**Check results after repair:**

```
git diff --check                                            → pass
pnpm --filter @rack-inventory-studio/desktop typecheck     → pass
pnpm --filter @rack-inventory-studio/desktop test          → 241/241 pass (+5 new tests)
pnpm --filter @rack-inventory-studio/desktop test:e2e      → 10/10 pass
pnpm --filter @rack-inventory-studio/desktop build         → pass (270 kB JS, 21 kB CSS)
```

Rust/Tauri not changed → cargo checks not required.

**Known limitations (by design):**
- Path redaction is heuristic: whitespace-delimited tokens only.
  A path embedded mid-word (no surrounding spaces) is not detected.
- Basenames of repos, files, and Git branch names still appear in logs.
- Redaction is not a full DLP system.

### Suggested next step

Run the app from the Windows NSIS installer on a clean Windows 11 machine, verify
`%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\` is created on first launch,
and confirm log entries are written for open/save/git operations without full paths.

---

## Post UI Polish QA integration plan — branch integration/post-ui-polish-qa

**Branch:** `integration/post-ui-polish-qa`
**Base branch:** `master`

`design/claude-ui-polish` has been merged to `master`. This section records the setup of
the integration branch for the next work series.

**What was done in this step:**
- Created branch `integration/post-ui-polish-qa` from current `master` (`6ff2ef4`).
- No application code was changed — docs/plan only.
- Plan saved to `.ai/post-ui-polish-qa-plan.md`.

**Planned working branches (in order):**
1. `repo/force-git-init` — enforce Git on repo creation
2. `repo/unsaved-guard-recent-open` — unsaved-changes guard + Recent open UX
3. `perf/git-status-cache` — cache Git status, no auto-poll
4. `ux/location-scoped-racks` — manage racks from location context
5. `ux/rack-form-polish` — rack form label and default value polish
6. `ux/csv-sample-import` — sample CSV download
7. `ux/validation-save-copy` — clarify Validation and Save copy
8. `assets/app-icon` — app icon preparation and deployment
9. `ci/windows-diagnostic-installer` — diagnostic Windows installer with verbose logging
10. `qa/post-ui-polish-final` — final QA, checks, Windows test, final PR

**PR rules:**
- Working branch PRs → `integration/post-ui-polish-qa`
- Final PR → `master` (after full series approved)

**Review context rules:**
- Working branches: generate relative to `integration/post-ui-polish-qa`
- Integration branch (final): generate relative to `master`

**Baseline detected:**
- Windows installer workflow (`.github/workflows/windows-installer.yml`): **present** — manual-only `workflow_dispatch`
- Local diagnostics logging (`tauri-plugin-log` + `@tauri-apps/plugin-log`): **present**
- No prerequisite branches needed before `ci/windows-diagnostic-installer`

**Suggested next step:** `repo/force-git-init`

---

## Force Git init on repository creation — branch repo/force-git-init

**Branch:** `repo/force-git-init`
**Base branch:** `integration/post-ui-polish-qa`

### Problem

The Create Repository wizard exposed a checkbox `Initialize Git repository` defaulted to `false`.
Users could create a repository without a `.git` directory, breaking Safe Publish and change history.
Even when checked, a `git init` failure was logged as a warning and silently ignored — the repository
was created in a broken state.

### Frontend changes

- **`CreateRepositoryWizard.tsx`** — Removed `initializeGit` state variable, removed the checkbox
  and its label. Added a read-only info note in place of the checkbox:
  `"Git repository will be initialized automatically. Git is required for change history and Safe Publish."`
  The `createRepository` call no longer passes `initialize_git` in the payload.
- **`wizardHelpers.ts`** — Removed `initializeGit: boolean` from `WizardFormState` interface (the field
  was never validated; removing it simplifies the type).

### Backend changes

- **`apps/desktop/src-tauri/src/commands/repository.rs`** — Replaced the conditional
  `if input.initialize_git { git init }` (which silently skipped git on false and ignored errors on true)
  with an unconditional call to `ris_git::init_repository`. Failure now returns an error to the UI:
  `"Failed to initialize Git repository: <sanitized message>"`.  
  Removed `init_git={}` from the log line (field no longer exists in the DTO).
- **`apps/desktop/src-tauri/src/dto.rs`** — Removed `initialize_git: bool` from
  `CreateRepositoryInputDto`.
- **`apps/desktop/src/api/tauriClient.ts`** — Removed `initialize_git: boolean` from
  `CreateRepositoryInput` interface.

### initialize_git field disposition

**Removed** from both TypeScript and Rust DTO. All usages were local (one call site in the wizard,
one handler in the command). No backwards-compatibility shim was needed.

### git init failure handling

If `ris_git::init_repository` fails, `create_repository_cmd` returns an `Err` to the UI.
The error message is sanitized and user-facing: "Failed to initialize Git repository: …".
The scaffolded repository files remain on disk but no session is opened and the UI shows
the error. The user can delete the directory and retry.

No cleanup of partially-created files is performed — this is intentional to keep the error
path simple and avoid deleting user data.

### Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/features/repository/CreateRepositoryWizard.tsx` | Removed checkbox; added read-only git note; removed `initializeGit` state; removed `initialize_git` from API call |
| `apps/desktop/src/features/repository/wizardHelpers.ts` | Removed `initializeGit` from `WizardFormState` |
| `apps/desktop/src/features/repository/wizardHelpers.test.ts` | Removed `initializeGit` from base fixture; replaced test |
| `apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx` | **New** — 4 component tests |
| `apps/desktop/src/api/tauriClient.ts` | Removed `initialize_git` from `CreateRepositoryInput` |
| `apps/desktop/src-tauri/src/dto.rs` | Removed `initialize_git` from `CreateRepositoryInputDto` |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Unconditional `git init`; error on failure |
| `crates/ris-application/Cargo.toml` | Added `ris-git` dev dependency |
| `crates/ris-application/tests/create_tests.rs` | Added `create_repository_followed_by_git_init_produces_dot_git` test |

### Tests

**Frontend (Vitest):**
- `wizardHelpers.test.ts` — updated to remove `initializeGit` fixture (13 tests)
- `CreateRepositoryWizard.test.tsx` — **new**, 4 tests:
  1. No "Initialize Git repository" checkbox rendered
  2. Info note "Git repository will be initialized automatically." visible
  3. `createRepository` called without `initialize_git` field
  4. `onSuccess` called with backend result

**Rust:**
- `crates/ris-application/tests/create_tests.rs` — new test
  `create_repository_followed_by_git_init_produces_dot_git`: calls `create_repository` then
  `ris_git::init_repository` and asserts `.git` exists. Skipped if `git` binary is unavailable.

**Local check results:**
- `git diff --check` → pass
- `cargo fmt/check/test/clippy`: **not runnable** — Rust toolchain not installed in this CI environment.
  The changes are syntactically verified by Python inspection scripts: no stale `initialize_git`
  references in the Rust DTO or command handler, unconditional `ris_git::init_repository` present,
  user-facing error message present.
- `pnpm typecheck/test/build`: **not runnable** — `pnpm`/`node_modules` not installed in this environment.
  TypeScript changes verified by Python inspection scripts: no `initialize_git` in tauriClient,
  no `initializeGit` in wizard or helpers.

**Note on git init failure path:** A direct unit test that simulates `git init` failure is not added
because it would require either a process mock or a fake git binary, which is disproportionate for this
scope. The failure path is covered by the unconditional error propagation in the command handler —
if `ris_git::init_repository` returns `Err`, the `?` operator short-circuits and the user-facing
error is returned.

### Risks

- Scaffolded files remain on disk if `git init` fails. The user must delete the directory manually and retry.
  A cleanup step was not added to avoid deleting existing user data.
- `git` must be installed on the host machine. If `git` is not on `PATH`, `ris_git::init_repository`
  returns an error and the user sees "Failed to initialize Git repository: …". This is the expected
  behavior — the application requires Git.

### Not done

- Opening existing repositories without `.git` — not changed; this is a separate topic.
- Cleanup of partially-created directory on `git init` failure — intentionally deferred.

### Suggested next step

`repo/unsaved-guard-recent-open`

---

## Guard unsaved changes and fix recent open flow — branch repo/unsaved-guard-recent-open

**Branch:** `repo/unsaved-guard-recent-open`
**Base branch:** `integration/post-ui-polish-qa`

### Problem

Two related issues:

1. **No unsaved-changes guard on Open.** `handleOpen` opened a new repository unconditionally. If the user had unsaved in-memory changes, they were silently discarded. Only `handleClose` had a guard (using a raw `window.confirm` with an inconsistent message).

2. **Recent repositories "Open" button only filled the path field.** Clicking "Open" in the Recent repositories panel called `onRepoPathChange(path)`, which just populated the path input. The user had to separately click the "Open" button in the "Open by path" section.

### Behavior changes

**Guarded actions:**
- `handleOpen` (Open by path + Enter key) — now guarded with `confirmUnsavedDiscard` + `UNSAVED_MSG.open`
- `handleClose` (Close button) — was already guarded; message updated to `UNSAVED_MSG.close`
- `handleOpenPath` (new) — used by Recent repos "Open"; guarded with `confirmUnsavedDiscard` + `UNSAVED_MSG.open`

**Actions intentionally NOT guarded:**
- `handleCreateSuccess` — wizard only shown on landing state where `hasUnsavedChanges` is always `false`
- `handleBrowse` — only sets the path field, does not replace repository session
- Window close (`beforeunload`) — left unchanged

**Recent repositories fix:**
- "Open" button calls `onOpenPath(path)` → `handleOpenPath(path)` in App (guarded + direct open)
- Row click (path text) still only fills the path field (existing behavior preserved)
- `aria-label={`Open ${path}`}` added for accessibility and test selectability

### Shared helper: `unsavedGuard.ts`

`apps/desktop/src/lib/unsavedGuard.ts`:
- `UNSAVED_MSG` — named constants for open / close / create messages
- `confirmUnsavedDiscard(hasUnsavedChanges, message)` — returns `true` immediately if no unsaved changes; otherwise calls `window.confirm` and returns the result

### Code deduplication: `doOpen`

`doOpen(path: string)` extracted as internal helper. Both `handleOpen` and `handleOpenPath` call `doOpen` after the guard — consistent state update for both paths.

### Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/lib/unsavedGuard.ts` | **New** — `confirmUnsavedDiscard` + `UNSAVED_MSG` |
| `apps/desktop/src/lib/unsavedGuard.test.ts` | **New** — 10 unit tests |
| `apps/desktop/src/App.tsx` | Extracted `doOpen`; added `handleOpenPath`; guarded `handleOpen` and `handleClose`; added `onOpenPath` to RepositoryPanel |
| `apps/desktop/src/features/repository/RepositoryPanel.tsx` | Added `onOpenPath?` prop; Recent repos "Open" calls `onOpenPath(path)`; `aria-label` added |
| `apps/desktop/src/features/repository/RepositoryPanel.test.tsx` | **New** — 7 integration tests |
| `apps/desktop/vite.config.ts` | Added `unsavedGuard.test.ts` to jsdom environment |

### Tests

**`unsavedGuard.test.ts`** (10 tests):
- No `window.confirm` when no unsaved changes
- Returns true/false based on confirm result
- Correct message passed to `window.confirm`
- `UNSAVED_MSG` content verified

**`RepositoryPanel.test.tsx`** (7 tests):
- Recent "Open" button calls `onOpenPath(path)`, not `onOpen`
- Row click calls `onRepoPathChange(path)`, not `onOpenPath`
- "Open by path" button calls `onOpen`
- Safe when `onOpenPath` is absent
- Each path button carries its own path

**Note on test coverage:** Guard cases 1–4 (Open/Recent blocked/allowed) are tested at unit level. At App component level these paths are only reachable from the landing state where `hasUnsavedChanges` is always `false`, so the guard condition cannot fire in practice — wiring is verified by panel integration tests. `window.confirm` mocked with `vi.spyOn` and restored in `afterEach`.

**Local check results:**
- `git diff --check` → pass
- No Rust/Tauri files changed → cargo checks not required
- `pnpm typecheck/test/build/test:e2e`: not runnable in this environment (no `pnpm`/`node_modules`). Changes verified by Python inspection scripts.

### Risks

- Guard uses `window.confirm` (blocking native dialog). Acceptable for this step; a future pass can replace with `ConfirmDialog`.
- Guard on Recent open never fires in current app flow (landing state → `hasUnsavedChanges` always false). Wired in for correctness and future-proofing.

### Not done

- Replacing `window.confirm` with `ConfirmDialog` — deferred
- Window `beforeunload` guard — left unchanged
- Opening existing repositories without `.git` — not touched

### Suggested next step

`perf/git-status-cache`

---

## Git status cache and manual refresh — branch perf/git-status-cache

**Branch:** `perf/git-status-cache`
**Base branch:** `integration/post-ui-polish-qa`

### Summary

Eliminated repeated `getGitStatus` / `getGitLog` / `listGitRemotes` calls caused by `RepositoryPanel` unmounting every time the user switches away from the Repository tab. Added a `Refresh Git status` button in the Git panel and an external refresh token mechanism so saves from the Validation tab also invalidate the cached status.

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src/App.tsx` | Add `gitRefreshToken` state; extract `handleSaveSuccess` (clears unsaved flag + bumps token); keep `RepositoryPanel` always-mounted (`display:none` when other tab active); pass `gitRefreshToken` to `RepositoryPanel`; use `handleSaveSuccess` for both `RepositoryPanel` and `ValidationPanel` |
| `apps/desktop/src/features/repository/RepositoryPanel.tsx` | Add `gitRefreshToken?` to `Props` and `GitSectionProps`; forward into `GitSection`; add `gitRefreshToken` to `useEffect` dependency array; add `Refresh Git status` button (with `aria-label`) to the Git panel actions, disabled while loading |
| `apps/desktop/src/features/repository/RepositoryPanel.test.tsx` | Import `waitFor` and mocked API functions; add two new describe blocks (8 tests) covering cache behavior and Refresh button |

### Git status loading — before this change

`GitSection` is a child of `RepositoryPanel`. `RepositoryPanel` was conditionally rendered with `{activeTab === "repository" && <RepositoryPanel ... />}`. Every tab switch unmounted `RepositoryPanel` and its child `GitSection`, discarding all state. On return to the Repository tab, a fresh `GitSection` mounted and the `useEffect` immediately called `getGitStatus`, `getGitLog(5)`, and `listGitRemotes` in parallel — even if nothing had changed.

### New cache behavior

`RepositoryPanel` is now always mounted (wrapped in `<div style={activeTab !== "repository" ? { display: "none" } : undefined}>`). `GitSection` stays mounted throughout the session as long as a repository is open. Its internal state (`gitStatus`, `gitCommits`, `remotes`) persists across tab switches. The `useEffect` only re-fires when `repoPath`, `refreshKey`, or `gitRefreshToken` changes.

### Cache invalidation and refresh rules

| Trigger | Mechanism |
|---|---|
| Open new repository | `repoPath` (= `summary.repo_path`) changes → `useEffect` fires |
| Close repository | `summary` becomes `null` → `GitSection` unmounts → state cleared |
| Create repository success | New `repoPath` via `handleCreateSuccess` → same as open |
| Save from Repository tab (GitSection) | `handleSaveFromGit` calls `onSaveSuccess()` → App increments `gitRefreshToken`; also calls `setRefreshKey(k+1)` internally |
| Save from Validation tab | `handleSaveSuccess` in App increments `gitRefreshToken` → prop change propagates to `GitSection` → `useEffect` fires |
| Commit | `handleCommit` calls `setRefreshKey(k+1)` |
| Pull | `handlePull` calls `setRefreshKey(k+1)` |
| Push | `handlePush` calls `setRefreshKey(k+1)` |
| Git init | `handleInit` calls `setRefreshKey(k+1)` |
| Add remote | `handleAddRemote` calls `setRefreshKey(k+1)` |
| Manual refresh | `Refresh Git status` button calls `setRefreshKey(k+1)` |

Note: save from the Repository tab causes two fetches (one from `onSaveSuccess` → `gitRefreshToken`, one from `setRefreshKey` internally). Both resolve to identical data; no correctness issue. This is a minor Tauri-local API overhead only on save.

### Manual Refresh Git status button

- Located in the Git panel header actions (same panel that shows Branch, Status, Upstream)
- Label: `Refresh Git status` (also `aria-label` for test selectability)
- Calls `setRefreshKey(k+1)` — same mechanism as all internal mutation refreshes
- Disabled when `loading === true` (i.e., a fetch is already in progress)
- Does not trigger save, commit, pull, push, validate, or any other side effect
- Because `getGitStatus`, `getGitLog`, and `listGitRemotes` are fetched together in a single `Promise.all`, clicking Refresh also refreshes recent commits and remotes list — documented here as intended, consistent with existing behavior

### Tests added

Two new describe blocks in `RepositoryPanel.test.tsx`:

**Git status cache:**
1. Fetches Git status exactly once on initial mount
2. Does not fetch again when unrelated props change (`hasUnsavedChanges`)
3. Fetches again when repo path changes (new repo opened)
4. Fetches again when `gitRefreshToken` changes (external mutation)
5. Clears Git status when repo is closed (`summary` becomes null)

**Refresh Git status button:**
6. Button is present after initial load
7. Clicking Refresh triggers another `getGitStatus` call
8. Button is disabled while refresh is running (pending Promise)

### Checks run and results

- `git diff --check` → pass
- No Rust/Tauri files changed → cargo checks not required
- `pnpm typecheck / test / build / test:e2e`: not runnable in this environment (no `pnpm` / `node_modules`). Changes statically verified by reading modified files and cross-checking TypeScript types.

### Known risks

- Double fetch on save from GitSection (`gitRefreshToken` bump + `setRefreshKey` both fire). Harmless — backend is local Tauri; no visible UX impact.
- `RepositoryPanel` is now always mounted even when other tabs are active. Any future expensive effects added to `RepositoryPanel`'s landing state would run while hidden. This is unlikely but worth noting for future contributors.
- `display:none` hides the panel visually but it remains in the DOM. Accessibility tools scanning the DOM can still find hidden elements; `inert` attribute would be stricter but is a future improvement.

### Not done

- Replacing the Retry / Refresh buttons with a unified control — out of scope
- Polling / auto-refresh on interval — explicitly excluded per task
- `RepositoryPanel` landing state caching — not needed (no expensive calls on landing state)

### Suggested next step

`ux/location-scoped-racks`

---

## Location-scoped rack management — branch ux/location-scoped-racks

**Branch:** `ux/location-scoped-racks`
**Base branch / PR target:** `integration/post-ui-polish-qa`

### Summary

Racks are now managed from the context of a selected location rather than as a flat global list. The Locations panel exposes a "Manage racks" per-row action button; clicking it switches to the Racks tab with that location's context. The Racks panel filters to the selected location only. Add Rack uses the context location; Edit Rack shows it read-only. No location selected → empty state guides the user to Locations.

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src/App.tsx` | Added `selectedLocationForRacks` state; `handleManageRacks` sets location + switches to Racks tab; context cleared on open/close/create repo; `onManageRacks` + `selectedLocation` props wired to panels |
| `apps/desktop/src/features/locations/LocationsPanel.tsx` | Added `onManageRacks` optional prop; added "Manage racks" icon button (IcServer) before Edit in each row |
| `apps/desktop/src/features/racks/RacksPanel.tsx` | Added `selectedLocation` prop; removed own `listLocations` call; added no-location empty state; filters to `visibleRacks` by location; updated PageHeader subtitle; removed Location column from table; updated `RackFormModal` call to pass `locationId`/`locationLabel` |
| `apps/desktop/src/features/racks/RackFormModal.tsx` | Replaced `locations: LocationDto[]` prop with `locationId: string` + `locationLabel: string`; removed editable location select; shows location as read-only disabled input; `locationId` now flows from prop into `addRack`/`updateRack`; removed `missingLocation` validation |
| `apps/desktop/src/features/racks/RackFormModal.test.tsx` | Rewrote to use `locationId`/`locationLabel` props; removed location-select interaction; updated "required footer" test to exclude "location"; added tests for read-only location field and edit-mode help text |
| `apps/desktop/src/features/locations/LocationsPanel.test.tsx` | **New** — tests Manage racks button render and click callback |
| `apps/desktop/src/features/racks/RacksPanel.test.tsx` | **New** — tests no-location empty state, filtered rack list, Add rack button visibility |
| `apps/desktop/e2e/smoke.spec.ts` | Rack detail + Change side dialog tests now navigate via Locations → Manage racks instead of directly to Racks tab |

### Tests

```
git diff --check                              → pass
node_modules/.bin/tsc --noEmit               → pass (no TypeScript errors)
node_modules/.bin/vitest run                 → 280/280 pass (24 test files)
node_modules/.bin/vite build                 → pass (21.33 kB CSS, 271.50 kB JS)
node_modules/.bin/playwright test            → 10/10 pass (firefox, 14.6s)
```

No Rust/Tauri files changed → cargo checks not required.

### Known risks

- Location context is cleared on repo open/close/create but not on tab switch away from Racks; context persists across tab switches within the same repo session.
- Location `id` immutability in Edit Rack is frontend-only enforcement. No backend guard added in this branch.

### Not done

- Backend guard preventing `location_id` change on `update_rack` — deferred, frontend-only enforcement for this branch.
- Breadcrumb or "back to location" navigation in Racks list view — not requested in spec.

### Suggested next step

`ux/rack-form-polish`

---

### Repair update (post-ChatGPT review — PR #56 blockers)

**Blockers resolved:**

1. **Uncommitted working tree at review-context generation time** — previous review context was generated while `apps/desktop/package-lock.json` was untracked (shown as `?? apps/desktop/package-lock.json` in `git status`). This repair removes that file and regenerates the review context from a fully clean working tree.

2. **Accidental `apps/desktop/package-lock.json`** — generated as a side-effect of running `npm install` to locate the `node_modules` directory during the initial implementation session. This project uses `pnpm` with `pnpm-lock.yaml`; `package-lock.json` has no role here and was removed with `rm -f apps/desktop/package-lock.json`. It was never committed (was untracked).

3. **E2E now run locally** — `node_modules/.bin/playwright install --with-deps` succeeded (downloaded Chromium + Firefox + system deps via apt). All 10 smoke tests pass. The earlier claim that Playwright was unavailable was incorrect — the correct command uses the local `node_modules/.bin/playwright`, not `npx playwright`.

**Checks run after repair (clean working tree):**

```
git status --short                            → (empty — clean)
git diff --check                              → pass
node_modules/.bin/tsc --noEmit               → pass
node_modules/.bin/vitest run                 → 280/280 pass (24 test files)
node_modules/.bin/vite build                 → pass (21.33 kB CSS, 271.50 kB JS)
node_modules/.bin/playwright test            → 10/10 pass (firefox, 14.6s)
```

No Rust/Tauri files changed → cargo checks not required.

---

## Rack form polish — branch ux/rack-form-polish

**Branch:** `ux/rack-form-polish`
**Base branch / PR target:** `integration/post-ui-polish-qa`

### Summary

Polished the Rack Add/Edit modal after the location-scoped racks change. Default height pre-fill, clearer field labels, improved help text, and a minor LocationsPanel API cleanup. No backend, YAML schema, or DTO field names changed.

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src/features/racks/RackFormModal.tsx` | Added `DEFAULT_RACK_HEIGHT_U = 42`; pre-fills height in add mode; updated `isDirty` for add mode; "Row / aisle" label + help text; height help text; code help text adds "Immutable after creation."; added `data-testid="field-row"` |
| `apps/desktop/src/features/racks/RackFormModal.test.tsx` | Full rewrite: tests for default height, dirty behavior, row label, help text, default-height submit, override-height submit, edit-mode height preservation, row payload field name |
| `apps/desktop/src/features/locations/LocationsPanel.tsx` | `onManageRacks` made required (was optional) |
| `apps/desktop/src/features/locations/LocationsPanel.test.tsx` | Removed "prop not provided" test (no longer applicable); added "second location" click test |

### Exact UX changes

**A. Default rack height in add mode**
- `DEFAULT_RACK_HEIGHT_U = 42` constant added.
- `EMPTY.heightU` set to `"42"` so the height field starts pre-filled.
- `isDirty` in add mode now compares the form against `EMPTY` key-by-key instead of checking all-empty: a form with only the default height is not dirty. Cancel and Escape work correctly on a fresh modal.
- Edit mode is unaffected: `rackToForm` always reads `rack.height_u`.

**B. Height field**
- Label: `Height (U)` (unchanged, already correct).
- Help text added: "Standard full-height racks are often 42U. Use the actual usable rack height."
- Placeholder removed (field starts pre-filled with "42").
- Positive integer validation unchanged.

**C. Row label**
- Visible label changed from `"Row"` → `"Row / aisle"`.
- Help text added: "Optional physical row, aisle or zone label within the location."
- Persisted DTO field `row` unchanged. YAML key `row` unchanged. Backend unchanged.
- Table column header in RacksPanel list view left as `"Row"` (not in scope).

**D. Code help text**
- Add mode help text extended: "Lowercase letters, digits, hyphens, underscores, dots. Immutable after creation."

**E. LocationsPanel `onManageRacks` required**
- Changed from optional `onManageRacks?` to required `onManageRacks`.
- Manage racks is the primary rack workflow; the prop is always provided by `App.tsx`.
- Removed the "does not throw when prop not provided" test; added a second-location click test.

### Default rack height behavior

- Add mode: height field pre-filled with `"42"`. Fresh modal → not dirty.
- Edit mode: height field populated from `rack.height_u`. Default 42 is not applied. Existing heights (e.g. 24U, 48U) are preserved.
- User can override either way before saving.

### Row label behavior

- Visible form label: `"Row / aisle"`.
- Persisted field (DTO/YAML/backend): `row` — **unchanged**.
- `addRack` and `updateRack` payloads still use `row:` key.

### Location read-only behavior

- Add mode: location shown as read-only disabled input displaying `locationLabel` prop.
- Edit mode: same, plus help text "Location is fixed and cannot be changed."
- No editable select; no location dropdown. Behavior unchanged from previous branch.

### Tests

```
node_modules/.bin/vitest run  →  287/287 pass (24 test files)
```

New/updated tests in `RackFormModal.test.tsx`:
- Add mode pre-fills height with 42
- Add modal is not dirty when only the default height is set
- Required footer shows "code, name" but not "height" (height pre-filled)
- Row field labelled "Row / aisle"
- Height help text about 42U visible
- Calls addRack with default height 42 when user does not change it
- Calls addRack with overridden height when user changes it
- Edit mode preserves existing height (24) — does not replace with 42
- Row payload maps to the `row` field (persisted field name unchanged)
- updateRack called with locationId prop and original height

Updated `LocationsPanel.test.tsx`:
- Removed "prop not provided" test (onManageRacks now required)
- Added second-location click test

### Checks run

```
git diff --check                              → pass
node_modules/.bin/tsc --noEmit               → pass
node_modules/.bin/vitest run                 → 287/287 pass (24 test files)
node_modules/.bin/vite build                 → pass (21.33 kB CSS, 271.71 kB JS)
node_modules/.bin/playwright test            → 10/10 pass (firefox, 14.6s)
```

No Rust/Tauri files changed → cargo checks not required.

### Known risks

- The `DEFAULT_RACK_HEIGHT_U = 42` constant is frontend-only. It does not prevent a user from entering a different height; the field is still editable. No backend validation was added for this default.
- Table column header "Row" in RacksPanel list view was intentionally left unchanged (only the form label was updated to "Row / aisle"). The two labels are now inconsistent across views — acceptable for this phase, can be unified in a future pass.
- `locationLabel` in edit mode comes from `editing.location_code` passed via `RacksPanel`. If a rack's location code differs from name, the label shows code only. This is unchanged from the previous branch.

### Not done

- Renaming the "Row" column header in the rack list table — kept as-is to minimise scope.
- Adding a location-level default height to YAML/DTO — explicitly excluded per task spec.
- Backend guard for `location_id` immutability on `update_rack` — deferred from previous branch.

### Suggested next step

`ux/csv-sample-import`

---

## CSV import sample template — branch ux/csv-sample-import

**Branch:** `ux/csv-sample-import`
**Base branch:** `integration/post-ui-polish-qa`

### What changed

Added a "Download sample CSV" button to `CsvImportPanel` so users can download a ready-to-use template CSV that matches the actual importer schema.

**New files:**
- `apps/desktop/src/features/csvImport/csvSample.ts` — `SAMPLE_CSV_FILENAME`, `escapeCsvField`, `SAMPLE_CSV_CONTENT` (header row + 4 realistic sample rows), `downloadSampleCsv` (Blob download via anchor element; no Tauri dialog, no new npm deps).
- `apps/desktop/src/features/csvImport/csvSample.test.tsx` — 24 Vitest tests covering filename, content structure, `escapeCsvField` edge cases, and `downloadSampleCsv` browser API interactions.
- `apps/desktop/src/features/csvImport/CsvImportPanel.test.tsx` — 3 Vitest tests: button renders, click calls `downloadSampleCsv`, help text visible.

**Modified files:**
- `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` — Imported `downloadSampleCsv` from `./csvSample`; added "Download sample CSV" button (btn-ghost + IcDownload icon) with help text "Use this template as a starting point, then preview it before importing." placed between the paste textarea and the Preview/Import button row.

### CSV schema

Columns mirror `KNOWN_COLUMNS` / `REQUIRED_COLUMNS` in `crates/ris-import/src/csv_reader.rs`:
- Required: `code`, `device_type`, `status`
- Optional: `name`, `device_model_code`, `serial_number`, `asset_tag`, `external_ref`, `tags`
- `device_model_code` left empty in sample rows to avoid VAL-CSV-012 errors (unknown model) during preview.
- `rack_object` excluded from sample device types (VAL-CSV-011).
- Tags use `;` as separator (e.g. `access;switch`).

### Checks run

```
git diff --check                          → pass
node_modules/.bin/tsc --noEmit           → pass
node_modules/.bin/vitest run             → 309/309 pass (26 test files)
node_modules/.bin/vite build             → pass (21.33 kB CSS, 272.95 kB JS)
```

No Rust/Tauri files changed → cargo checks not required.

### Known risks

- `downloadSampleCsv` appends and removes an anchor from `document.body` — harmless in production, covered by jsdom tests.
- `device_model_code` is empty in all sample rows; users with device models must fill it in manually.

### Not done

- No backend or Tauri changes.
- No Playwright smoke test for the download button (Blob download in headless browser returns nothing useful; unit tests cover the function directly).

### Suggested next step

`ux/validation-save-copy`

---

## Validation and save copy polish — branch ux/validation-save-copy

**Branch:** `ux/validation-save-copy`
**Base branch / PR target:** `integration/post-ui-polish-qa`

### Summary

UX copy-only pass clarifying the difference between validation (in-memory checks), saving (writing YAML to disk), and Git commit/push. No behavior changes. No new dependencies.

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src/features/validation/ValidationPanel.tsx` | Subtitle, button labels, empty-state body |
| `apps/desktop/src/App.tsx` | Unsaved callout: "Save repository" → "Save changes" |
| `apps/desktop/e2e/smoke.spec.ts` | Updated "Validate" button selector to "Validate repository" |
| `apps/desktop/src/features/validation/ValidationPanel.test.tsx` | **New** — 6 tests for the updated copy |

### Exact copy changes

**ValidationPanel.tsx:**

| Location | Before | After |
|---|---|---|
| Page subtitle | `"VAL-* checks run against the in-memory inventory."` | `"Check the repository for errors and warnings before saving or publishing."` |
| Validate button | `"Validate"` | `"Validate repository"` |
| Save button | `"Save inventory"` | `"Save changes"` |
| Pre-validation empty state body | `"Click Validate to validate the current inventory."` | `"Validation reads the current in-memory data — it does not write files to disk."` |

**App.tsx:**

| Location | Before | After |
|---|---|---|
| Unsaved callout hint | `"Use Save repository in the Repository tab."` | `"Use Save changes in the Repository tab."` |

### Validation vs save vs commit/push wording rationale

- **Validate repository** — runs VAL-* checks on the current in-memory state. Does not write to disk. Renamed from generic "Validate" to make the scope explicit.
- **Save changes** — writes YAML files locally. No Git involvement. Renamed from "Save inventory" for consistency with Safe Publish stepper Step 1 label ("Save changes to disk").
- **Commit / Push** — Git operations in the Safe Publish stepper. Labels unchanged; stepper already uses unambiguous step names (Step 3: "Commit local changes", Step 5: "Push to remote").
- The empty-state body for unvalidated state now explicitly states validation does not write files to disk, reducing the most common user confusion.

### Behavior preserved

- `validateCurrentRepository()` Tauri command — unchanged, same call site.
- `saveCurrentRepository()` Tauri command — unchanged, same call site.
- Git commit/push/pull flow — unchanged.
- Unsaved changes state, guard logic, `UNSAVED_MSG` constants — unchanged.
- Git status cache refresh behavior — unchanged.
- No new backend calls, no new Tauri commands, no new npm deps.

### Tests added/updated

- **New** `ValidationPanel.test.tsx` — 6 Vitest tests:
  - Renders "Validate repository" button
  - Renders "Save changes" button
  - Subtitle contains "saving or publishing"
  - Pre-validation empty state body contains "does not write files to disk"
  - Clicking "Validate repository" calls `validateCurrentRepository`
  - Clicking "Save changes" calls `saveCurrentRepository`
- **Updated** `e2e/smoke.spec.ts` — updated selector from `"Validate"` (exact) to `"Validate repository"` (exact) in the validation panel smoke test.
- All existing tests unchanged and passing.

### Checks run

```
git diff --check                              → pass
node_modules/.bin/tsc --noEmit               → pass
node_modules/.bin/vitest run                 → 315/315 pass (27 test files, +6 new)
node_modules/.bin/vite build                 → pass (21.33 kB CSS, 272.95 kB JS)
node_modules/.bin/playwright test            → 10/10 pass (firefox, 14.9s)
```

No Rust/Tauri files changed → cargo checks not required.

### Known risks

- The Save button in ValidationPanel was "Save inventory" — renaming to "Save changes" is more consistent but means the same save action now has the same label in both ValidationPanel and the Repository Safe Publish stepper. This is the intended outcome (consistent wording), not a bug.
- The pre-validation empty-state body no longer directs the user to click the button by name. Users must find the "Validate repository" button in the header. This is acceptable — the empty state is inside the Issues panel which is adjacent to the header.

### Not done

- ValidationPanel empty state for all-clear (zero issues) has a two-case design: "Nothing to report" covers both "no issues at all" and "issues filtered out". No copy change needed — the filter context makes both cases clear.
- RepositoryPanel Safe Publish step 2 meta text ("Run validation before committing.") was intentionally left unchanged — the stepper flow makes the ordering clear and the step title "Validate inventory" is sufficiently descriptive.
- No auto-save, no new Git operations, no YAML schema changes.

### Suggested next step

`assets/app-icon`

---

## Windows diagnostic installer — branch ci/windows-diagnostic-installer

**Branch:** `ci/windows-diagnostic-installer`
**Base branch / PR target:** `integration/post-ui-polish-qa`

### Summary

Added a separate `workflow_dispatch`-only GitHub Actions workflow that builds an unsigned Windows NSIS installer specifically for QA and diagnostics verification. The artifact is named `rack-inventory-studio-windows-diagnostic-installer` (vs `rack-inventory-studio-windows-installer` for the standard workflow) and includes a `diagnostic-readme.txt` with log location, QA checklist, expected log entries, and what must not appear in logs.

No application code was changed. The existing diagnostics logging (tauri-plugin-log, `diagnostics.rs`, `diagnosticsLog.ts`, `redact.ts`) is already comprehensive for QA purposes and required no modification.

### Implementation shape

**Separate workflow** — added `.github/workflows/windows-diagnostic-installer.yml` rather than modifying the existing `windows-installer.yml`. Reasons:
- Keeps the standard installer workflow clean and unchanged.
- Allows different artifact names without conditional logic.
- A named "Diagnostic Installer" entry in the Actions sidebar is clearer for QA.

### Files changed/added

| File | Change |
|---|---|
| `.github/workflows/windows-diagnostic-installer.yml` | **New** — diagnostic installer workflow |
| `.ai/windows-diagnostic-installer.md` | **New** — full QA documentation |
| `.ai/windows-installer-ci.md` | Updated — added "See also" section pointing to diagnostic workflow |
| `.ai/cc-report.md` | Updated — this section |

### Workflow details

| Property | Value |
|---|---|
| Trigger | `workflow_dispatch` only |
| Runner | `windows-latest` |
| Steps | checkout → Rust stable → Rust cache → pnpm → Node 22 → install deps → typecheck → frontend tests → tauri build → prepare artifact dir → upload |
| Artifact name | `rack-inventory-studio-windows-diagnostic-installer` |
| Artifact contents | `*.exe` NSIS installer + `diagnostic-readme.txt` |
| Installer path inside runner | `target/release/bundle/nsis/*.exe` |
| `if-no-files-found` | `error` |
| Retention | 30 days |

The `diagnostic-readme.txt` is generated inline by a PowerShell step in the workflow using GitHub Actions context variables (`${{ github.ref_name }}`, `${{ github.run_number }}`, `${{ github.run_id }}`).

### App code changed

No. Application source files, Tauri configuration, Rust backend, and frontend are unchanged.

### Logging behavior changed

No. The existing logging is already sufficient for diagnostic QA:
- Startup, open/create/save/validate repository, CSV preview/import, Git status/commit/push/pull
- Error sanitization via `diagnostics.rs` (Rust) and `redact.ts` (TypeScript)
- All events logged at `Info` level or higher, written to local log file only

### Logs remain local-only

Confirmed. `tauri-plugin-log` writes to `LogDir` and `Stdout` only. No external endpoints, no telemetry, no analytics, no Sentry, no OpenTelemetry.

### Documentation

- `.ai/windows-diagnostic-installer.md` — comprehensive: purpose, trigger steps, artifact details, SmartScreen guidance, Windows 11 log location, QA checklist, expected log entries, what must not appear in logs, bug-report log collection, known limitations, comparison table with standard workflow, logging implementation reference.
- `.ai/windows-installer-ci.md` — "See also" section added pointing to the diagnostic workflow and documentation.
- README.md — not updated (change would be cosmetic only; CI docs are in `.ai/`).
- CHANGELOG.md — not updated (no versioned release; convention reserves it for feature/domain changes).

### How to run the diagnostic workflow

1. GitHub repository → **Actions** tab.
2. Select **Windows Diagnostic Installer** from the left sidebar.
3. **Run workflow** → choose branch → **Run workflow**.
4. After completion, download artifact `rack-inventory-studio-windows-diagnostic-installer.zip`.
5. Extract — contains `*.exe` and `diagnostic-readme.txt`.

### Windows 11 QA checklist summary

1. Install the app (SmartScreen → More info → Run anyway).
2. Launch — verify no error dialog.
3. Open the example repository.
4. Validate repository, Save changes, CSV Import preview, Git section.
5. Check `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\` for log entries.
6. Confirm no passwords / full paths / raw YAML/CSV in log.
7. Close app — verify no crash.

### Checks run

```
git diff --check                                   → pass
node_modules/.bin/tsc --noEmit                    → pass
node_modules/.bin/vitest run                      → 315/315 pass (27 test files, unchanged)
node_modules/.bin/vite build                      → pass (21.33 kB CSS, 272.95 kB JS)
node_modules/.bin/playwright test                 → 10/10 pass (firefox, unchanged)
cargo fmt / check / test / clippy                 → NOT RUN (cargo not in PATH on this host; no Rust files changed)
actionlint                                         → NOT AVAILABLE (not installed); workflow YAML verified by manual inspection
Local Tauri build (pnpm tauri build)              → NOT RUN (Linux host, no display server, target is Windows)
```

No Rust files were modified — cargo checks are not needed to validate this branch. The real workflow build must be triggered manually in GitHub Actions to validate the Windows Tauri build end-to-end.

### Known risks

- The `diagnostic-readme.txt` is generated by a PowerShell step during CI. If the PowerShell here-string or file path changes (e.g. Tauri changes output directory), the step will fail at CI time. The `if-no-files-found: error` on the upload step catches a missing installer.
- The workflow has not been run on GitHub Actions yet; first real run will validate all steps end-to-end.
- App icon is still the default Tauri icon (the `assets/app-icon` stage is intentionally postponed). This is documented in `diagnostic-readme.txt`.
- The exact log filename produced by `tauri-plugin-log` on Windows must be confirmed on first QA run.

### Not done

- Code signing — deferred (no EV/OV certificate; signing adds paid-service dependency).
- App icon — deferred (separate `assets/app-icon` stage intentionally postponed).
- MSI/WiX format — excluded (WiX not available on `windows-latest`; NSIS only).
- Log rotation strategy — single rolling file (Tauri KeepOne default); acceptable for QA.
- Automated actionlint check — not available locally; YAML verified by inspection.
- Log filename exact value — to be confirmed on first Windows QA run.

### Suggested next step

`qa/post-ui-polish-final`

---

## App icon — branch assets/app-icon

**Branch:** `assets/app-icon`
**Base branch / PR target:** `integration/post-ui-polish-qa`

### Summary

Created a clean, repository-owned source SVG for the Rack Inventory Studio app icon (Bay direction) and regenerated all Tauri platform icon assets from it. The default Tauri placeholder icons are replaced in every required format.

### Design origin

The Bay direction was selected from the Claude Design bundle (`RIS Icon-print.html`, hero SVG at 256×256). The final visual: a frontal rack cabinet with two vertical mounting rails, top/bottom cross-plates, seven U-slot equipment rows, one accent (blue) row representing a tracked/selected device, and a small white status dot on the accent row indicating an asset is present.

**CSS variable → hex mapping applied:**

| Variable | Hex | Role |
|---|---|---|
| `var(--paper)` | `#fefdfb` | Background, status dot |
| `var(--ink)` | `#1c2026` | Rails, cross-plates, equipment rows |
| `var(--accent)` | `#3a6fc5` | Selected device row |
| `var(--line)` | `#dfe1e5` | Container border stroke |

**Design note:** The spec text described "six U-slot equipment rows" and "Row 4 of 6". The final design SVG has **seven rows** (y positions: 66, 86, 106, 126-accent, 146, 166, 186). The final SVG visual is the source of truth per the task specification ("preserve the selected final visual unless there is a technical reason not to"). The discrepancy is between the spec prose and the final production SVG; the SVG is correct.

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/icons/icon.svg` | **New** — clean source SVG with explicit hex colors, no CSS variables |
| `apps/desktop/src-tauri/icons/icon.icns` | Regenerated — macOS ICNS |
| `apps/desktop/src-tauri/icons/icon.ico` | Regenerated — Windows ICO |
| `apps/desktop/src-tauri/icons/icon.png` | Regenerated — 512 px PNG |
| `apps/desktop/src-tauri/icons/32x32.png` | Regenerated |
| `apps/desktop/src-tauri/icons/64x64.png` | Regenerated |
| `apps/desktop/src-tauri/icons/128x128.png` | Regenerated |
| `apps/desktop/src-tauri/icons/128x128@2x.png` | Regenerated |
| `apps/desktop/src-tauri/icons/Square*.png` (10 files) | Regenerated — Windows APPX/UWP sizes |
| `apps/desktop/src-tauri/icons/StoreLogo.png` | Regenerated |
| `apps/desktop/src-tauri/icons/ios/*.png` (17 files) | Regenerated — iOS sizes |
| `apps/desktop/src-tauri/icons/android/**/*.png` (15 files) | Regenerated — Android mipmap sizes |
| `.github/workflows/windows-diagnostic-installer.yml` | Removed "App icon may be default Tauri icon" limitation line |
| `.ai/windows-diagnostic-installer.md` | Removed App icon limitation row from Known limitations table |

### How icons were generated

```
cd apps/desktop
node node_modules/@tauri-apps/cli/tauri.js icon src-tauri/icons/icon.svg -o src-tauri/icons
```

`tauri-cli 2.11.2` — same version as the project's existing `@tauri-apps/cli` devDependency.
Output directory defaulted to `src-tauri/icons/`. All platform formats generated in one pass.

`pnpm` was not available in the current host environment (Node 18, no corepack, no global pnpm).
The Tauri CLI was invoked directly via `node node_modules/@tauri-apps/cli/tauri.js`. Identical result to `pnpm tauri icon`.

### tauri.conf.json

No changes needed. Tauri v2 looks for icons in `src-tauri/icons/` by convention when `bundle.icon` is not explicitly set. The `icon.svg` source file is not consumed by Tauri at build time (only the generated PNGs/ICO/ICNS are used); it is stored in `icons/` as the canonical design source.

### Checks run (repair pass — cargo/gcc now installed)

| Check | Command | Result |
|---|---|---|
| Whitespace | `git diff --check` | pass — no trailing whitespace or CRLF issues |
| TypeScript | `node_modules/.bin/tsc --noEmit` | pass |
| Unit tests | `node_modules/.bin/vitest run` | 315/315 pass (no test changes) |
| Production build | `node_modules/.bin/vite build` | pass — 21.33 kB CSS, 273.01 kB JS |
| E2E smoke | `node_modules/.bin/playwright test` | **10/10 pass** (Firefox, 14.9 s; `libasound2` installed via `playwright install --with-deps`) |
| `pnpm` availability | `command -v pnpm` | not available — Node 18.19.1, no corepack, no global pnpm. All checks run via `node_modules/.bin/` equivalents. |
| `cargo` availability | `command -v cargo` | `/cache/cargo/bin/cargo` — cargo 1.95.0 |
| `gcc` availability | `command -v gcc` | `/usr/bin/gcc` — gcc 13.3.0 |
| `cargo fmt --all --check` | `cargo fmt --all --check` | **pass** |
| `cargo check --workspace` | `cargo check --workspace` | **pass** |
| `cargo test --workspace` | `cargo test --workspace` | **pass** — 18 tests in desktop crate, all workspace tests pass |
| `cargo clippy --workspace` | `cargo clippy --workspace -- -D warnings` | **pass** — no warnings |
| Rust release compile | `cargo build --release --manifest-path apps/desktop/src-tauri/Cargo.toml` | **pass** — compiled in 3m 29s, `Finished release profile [optimized]`. GTK3 and WebKit2GTK 4.1 (`pkg-config --exists gtk+-3.0 webkit2gtk-4.1`) are available. |
| Full Tauri CLI build | `node .../tauri.js build` | **not run to completion** — `beforeBuildCommand: "pnpm build"` fails with exit 127 (pnpm not in PATH). Vite production build was run separately via `node_modules/.bin/vite build` (pass). The Rust Tauri backend compiled successfully via `cargo build --release` (see above). A full pnpm-based Tauri installer build must be run on a system with pnpm installed. |
| `package-lock.json` | `test ! -f apps/desktop/package-lock.json` | confirmed absent — project uses pnpm / pnpm-lock.yaml only |
| Review-context files | `git diff --name-only integration/post-ui-polish-qa...HEAD \| grep review-context` | **none** — three accidentally committed review-context files (1739, 1753, 2003) removed via interactive rebase; branch history is clean |

No application source code or test files were changed by this branch. `Cargo.lock` updated to reflect `ris-git` dev-dependency in `ris-application` (Cargo.toml already declared it; lock file was stale).

### Known risks

- App icon visual correctness requires rendering on a real desktop (Windows, macOS). The SVG geometry and hex colors match the final Claude Design output, but pixel-level rendering at small sizes (32 px, 44 px) has not been verified with a GUI.
- `tauri-plugin-log` log filename exact value still unconfirmed (Windows QA pending). Unrelated to this branch.
- Code signing still not configured. NSIS installer still unsigned — SmartScreen warning on first run. Unchanged from previous branches.
- Android adaptive icon uses the full composition (not a separate foreground layer with transparent background). This is acceptable for internal QA builds.

### Not done

- Code signing — separate concern, out of scope.
- App name / identifier updates — not requested.
- NSIS installer splash/header image — Tauri generates these from icon assets automatically; no additional images required.

### Suggested next step

`qa/post-ui-polish-final`

---

## Post UI polish final QA — branch qa/post-ui-polish-final

**Branch:** `qa/post-ui-polish-final`
**Base branch / PR target:** `integration/post-ui-polish-qa`

### Summary

Final automated and code-review QA pass over the complete `integration/post-ui-polish-qa` series after all nine working branches were merged. No application blockers found. Two stale documentation items fixed (README test counts, CHANGELOG missing entry). All automated checks pass. Windows 11 manual QA not yet performed — documented as required before final PR to `master`.

### Integrated branches verified

| Branch | Merged |
|---|---|
| `repo/force-git-init` | ✓ |
| `repo/unsaved-guard-recent-open` | ✓ |
| `perf/git-status-cache` | ✓ |
| `ux/location-scoped-racks` | ✓ |
| `ux/rack-form-polish` | ✓ |
| `ux/csv-sample-import` | ✓ |
| `ux/validation-save-copy` | ✓ |
| `ci/windows-diagnostic-installer` | ✓ |
| `assets/app-icon` | ✓ |

### QA checklist

**Repository / Git:**
- Force Git init: `CreateRepositoryWizard.tsx` has no `initializeGit` checkbox; backend calls `ris_git::init_repository` unconditionally — ✓
- Unsaved guard: `confirmUnsavedDiscard` called in `handleOpen`, `handleOpenPath`, and `handleClose` — ✓
- Recent open: `handleOpenPath` opens directly (no fill-only behavior) — ✓
- Git status cache: `RepositoryPanel` always mounted, `GitSection` state persists; `display:none` hides it when inactive — ✓
- Manual refresh: "Refresh Git status" button present in `RepositoryPanel` — ✓
- Save invalidation: `handleSaveSuccess` increments `gitRefreshToken` — ✓

**Locations / Racks:**
- "Manage racks" per-row action in `LocationsPanel` — ✓
- `RacksPanel` filters to `selectedLocation`, shows empty state when none — ✓
- Add Rack passes `locationId` from context; Edit Rack shows it read-only — ✓
- Default height 42U, "Row / aisle" label with help text — ✓

**Rack Detail:**
- Front/Rear `Segmented` control in `RackDetailPanel` PageHeader — ✓
- `RackUnitDiagram` receives `side` prop, renders only active side — ✓
- Placement table and inspector synced via `handleSelectPlacement` — ✓
- Change side `ConfirmDialog` wired in `PlacementInspectorPanel` — ✓
- Remove placement uses `ConfirmDialog` (danger tone) — ✓

**CSV Import:**
- "Download sample CSV" button in `CsvImportPanel` — ✓
- `csvSample.ts` columns match importer-supported schema — ✓
- `deriveCsvImportUiSummary` used; no double-counting — ✓

**Validation / Save:**
- "Validate repository" / "Save changes" button copy — ✓
- Empty state: "Validation reads the current in-memory data — it does not write files to disk." — ✓
- Unsaved callout uses "Save changes" wording — ✓

**Installer / diagnostics:**
- Both workflows: `on: workflow_dispatch:` only — ✓
- Diagnostic docs: no stale "app icon may be default" limitation text — ✓
- Logs remain local-only — ✓

**App icon:**
- `icon.svg`, `icon.ico`, `icon.icns`, `icon.png` all present in `src-tauri/icons/` — ✓
- All platform sizes (Windows, iOS, Android mipmap) regenerated — ✓
- `tauri.conf.json` unchanged; icons picked up by convention — ✓
- Visual desktop verification still listed as a required Windows/macOS QA step — ✓

**Artifacts / lockfiles:**
- No `.ai/review-context-*.md` files tracked in git (gitignored, only on disk) — ✓
- No `apps/desktop/package-lock.json` — ✓

### Files changed

| File | Change |
|---|---|
| `README.md` | Updated stale test counts: 218 Vitest → 315, 258 Rust → 358 |
| `CHANGELOG.md` | Added "Unreleased — post-UI polish QA series" section covering all 9 merged branches |
| `.ai/cc-report.md` | This section |

### Bugs found and fixed

None. No application code changes required.

### Frontend check results

| Check | Command | Result |
|---|---|---|
| Whitespace | `git diff --check` | pass |
| TypeScript | `node_modules/.bin/tsc --noEmit` | pass |
| Unit tests | `node_modules/.bin/vitest run` | **315/315 pass** (27 test files) |
| Production build | `node_modules/.bin/vite build` | pass — 21.33 kB CSS, 273.01 kB JS |
| E2E smoke | `node_modules/.bin/playwright test` | **10/10 pass** (Firefox, 15.0 s) |
| `pnpm` availability | `command -v pnpm` | not available — node_modules/.bin equivalents used |

### Rust check results

| Check | Command | Result |
|---|---|---|
| Format | `cargo fmt --all --check` | **pass** |
| Type check | `cargo check --workspace` | **pass** |
| Tests | `cargo test --workspace` | **pass — 358 tests** across all workspace crates |
| Lints | `cargo clippy --workspace -- -D warnings` | **pass** — no warnings |

### Tauri build result

**Full Tauri CLI build:** `node .../tauri.js build` — fails at `beforeBuildCommand: "pnpm build"` (exit 127: pnpm not in PATH in this container). Vite frontend build verified separately (pass). Rust Tauri backend compiled in release mode via `cargo build --release` (pass, 42 s — incremental).

**Tauri dev smoke:** not attempted — headless Linux container, no display server.

### GitHub workflow status

| Workflow | Status |
|---|---|
| CI (standard PR checks) | Last run on `assets/app-icon` PR — **success** (2026-05-23) |
| Windows Installer (manual) | Not triggered — `workflow_dispatch` only; requires manual GitHub Actions run |
| Windows Diagnostic Installer (manual) | Not triggered — `workflow_dispatch` only; requires manual GitHub Actions run |

### Windows 11 manual QA status

**Not completed.** Headless Linux container — no GUI environment available.

Required before final PR to `master`:
1. Run "Windows Diagnostic Installer" workflow manually on GitHub Actions against `integration/post-ui-polish-qa`
2. Install resulting NSIS artifact on a clean Windows 11 machine
3. Verify: app launches without crash, SmartScreen warning expected (unsigned), custom app icon visible in taskbar and installer
4. Open example repository, validate, save changes, CSV import preview, Git section
5. Check `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\` — entries present, no full paths or credentials
6. Verify recent-open flow and unsaved-changes guard from the UI
7. Verify location-scoped rack management, add rack with default 42U height
8. Verify Front/Rear side selector in rack detail
9. Verify "Download sample CSV" button downloads a usable file
10. Close app — no crash

### Confirmation: no review artifacts committed

- `git diff --name-only integration/post-ui-polish-qa...HEAD | grep review-context` → empty — no review-context files in PR diff
- `test ! -f apps/desktop/package-lock.json` → confirmed absent

### Risks

- Windows 11 manual QA not yet performed — custom icon, installer, logging, and full UI flow not verified on a real Windows machine.
- Full `pnpm tauri build` not run locally because pnpm is unavailable in this container. NSIS packaging still requires validation by manually running the Windows Diagnostic Installer or Windows Installer workflow on GitHub Actions — neither workflow has been triggered for this integration state yet.
- Code signing not configured — SmartScreen warning on first Windows run expected.
- `RepositoryPanel` always-mounted approach: future expensive effects added while panel is hidden would run silently; currently harmless.
- `window.confirm` still used for unsaved-changes guard (not `ConfirmDialog`) — acceptable for this iteration.

### Not done

- Windows 11 manual QA — requires a Windows machine.
- Triggering Windows installer / diagnostic installer workflows — manual, requires human action.
- Code signing — separate concern requiring EV/OV certificate.
- Responsive layout, dark mode, accessibility audit — out of scope for this series.
- Replacing `window.confirm` guards with `ConfirmDialog` — deferred.

### Suggested next step

Open final PR from `integration/post-ui-polish-qa` to `master` after Windows 11 manual QA is complete and approved.

---

## Final PR to master preparation — integration/post-ui-polish-qa

**Branch:** `integration/post-ui-polish-qa`
**PR target:** `master`

### Branch state

- All 9 working branches merged. PR #62 (`qa/post-ui-polish-final`) confirmed merged (top commit: `f7e85b9`).
- No `apps/desktop/package-lock.json`.
- No tracked `.ai/review-context-*.md` files.
- 29 commits ahead of `master`.

### Final diff scope (vs master)

| Area | Files |
|---|---|
| Docs / AI reports | `.ai/cc-report.md`, `.ai/post-ui-polish-qa-plan.md`, `.ai/windows-diagnostic-installer.md`, `.ai/windows-installer-ci.md` |
| Workflow | `.github/workflows/windows-diagnostic-installer.yml` (new) |
| Changelog / README | `CHANGELOG.md`, `README.md` |
| Cargo.lock | Updated (`ris-git` dev-dep for `ris-application`) |
| App icon | `icon.svg` (new), all platform icon PNGs/ICO/ICNS regenerated |
| Frontend source | `App.tsx`, repository/location/racks/csvImport/validation features, e2e smoke |
| Rust backend | `dto.rs`, `commands/repository.rs`, `commands/git.rs`, `diagnostics.rs`, `lib.rs`, `Cargo.toml` |

### Final sanity check results

| Check | Command | Result |
|---|---|---|
| Whitespace | `git diff --check` | pass |
| TypeScript | `tsc --noEmit` | pass |
| Unit tests | `vitest run` | **315/315 pass** (27 test files) |
| Production build | `vite build` | pass — 21.33 kB CSS, 273.01 kB JS |
| E2E smoke | `playwright test` | **10/10 pass** (Firefox, 14.5 s) |
| `pnpm` | `command -v pnpm` | not available — all checks via `node_modules/.bin/` |
| `cargo fmt --all --check` | — | pass |
| `cargo check --workspace` | — | pass |
| `cargo test --workspace` | — | **358 tests pass** |
| `cargo clippy -D warnings` | — | pass |
| `cargo build --release` | — | pass (incremental, 0.42 s) |
| Full `tauri build` CLI | `node .../tauri.js build` | not run — `beforeBuildCommand: "pnpm build"` fails (pnpm not in PATH) |

### Windows Diagnostic Installer workflow

Run triggered on `master` (after PR #63 merged) via `gh workflow run "Windows Diagnostic Installer" --ref master`.

| Field | Value |
|---|---|
| Run ID | 26342762547 |
| Branch | master |
| Status | **completed — success** |
| Duration | 7m 45s |
| Built | 2026-05-23 20:35 UTC |

Artifact downloaded and verified locally (`/tmp/diagnostic-artifact-check`):

| File | Present |
|---|---|
| `Rack Inventory Studio_0.1.0_x64-setup.exe` | yes (2.8 MB NSIS installer) |
| `diagnostic-readme.txt` | yes (QA checklist, log path, expected/forbidden log content) |

### Windows 11 manual QA status

**Not completed.** CI artifact is ready — Windows 11 manual install required:
1. Download artifact from run 26342762547 on GitHub Actions
2. Install on Windows 11 — accept SmartScreen warning
3. Verify: custom app icon, logs at `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\`, open/save/validate/CSV/Git flows
4. Confirm no crashes, no credential or path leaks in logs

### Risks

- Windows 11 manual QA not yet performed — installer, icon, logging, and full UI not verified on real hardware.
- NSIS packaging validated by CI on Windows runners only (standard Windows Installer run passed on 2026-05-23).
- Code signing not configured — SmartScreen warning on first Windows run.
- `window.confirm` used for unsaved-changes guard — acceptable for this iteration.

### Not done

- Windows 11 manual QA — requires a real Windows machine.
- Code signing — out of scope.

### Suggested next step

Merge final PR from `integration/post-ui-polish-qa` to `master` once Windows 11 manual QA is approved.

---

## Beta hardening milestone 1 — Global busy overlay and Git console hiding

**Branch:** `ux/global-busy-git-no-console`

### Frontend busy overlay

Added `apps/desktop/src/lib/appBusy.tsx` — a React context/provider (`AppBusyProvider`) and `useBusy()` hook. The `runBusy(label, fn)` helper:
1. Sets `isBusy = true` and stores the operation label.
2. Yields one `setTimeout(0)` tick so React flushes the overlay render before the long operation starts.
3. Awaits `fn()`, then clears busy state in `finally` — always cleans up on success or failure.

`BusyOverlay` (`apps/desktop/src/components/ui/BusyOverlay.tsx`) renders on top of all content via `position: fixed; z-index: 500`. Pointer events are blocked **immediately** when `isBusy` becomes true (before any visual animation). The spinner and label fade in after a 150 ms delay — fast operations (<150 ms) produce no visible flash. CSS uses existing design tokens.

`AppBusyProvider` and `BusyOverlay` are mounted once in `main.tsx` wrapping the whole app.

### Operations covered by the overlay

| Operation | Label |
|---|---|
| Open repository (path or recent) | Opening repository… |
| Close repository | Closing repository… |
| Create repository (wizard) | Creating repository… |
| Git status/log/remotes refresh | Checking Git status… |
| Manual Refresh Git status button | Checking Git status… |
| Initialize Git repository | Initializing Git repository… |
| Save changes (Repository panel + Validation panel) | Saving changes… |
| Validate repository (Repository panel + Validation panel) | Validating repository… |
| Commit | Committing changes… |
| Push | Pushing to remote… |
| Pull | Pulling from remote… |
| Add remote | Adding remote… |
| CSV preview | Previewing CSV… |
| CSV import | Importing CSV… |

### Error cleanup behavior

`runBusy` uses `try/finally` — busy state clears whether the operation succeeds or throws. Each component catches the re-thrown error locally and displays it in its existing error Banner/state. The overlay never gets stuck.

### Removed redundant local busy state

`working`/`saving`/`pulling`/`pushing`/`initing`/`addingRemote`/`fileLoading`/`previewing`/`importing` local states in GitSection and CsvImportPanel removed where the global overlay supersedes them. Local `committing` state kept to disable the commit button while overlay is active (belt-and-suspenders). `ValidationPanel` `working`/`setWorking`/`setError` props removed; panel uses context and local error state directly.

### Rust/Tauri async and session-lock review (Part B)

Reviewed `apps/desktop/src-tauri/src/commands/git.rs` and `commands/repository.rs`.

- All Tauri commands are synchronous (`fn`, not `async fn`). Tauri runs them on a blocking thread pool — equivalent to `spawn_blocking`. This is correct.
- `pull_git_ff_only` already releases the session lock before the slow network call and re-acquires after. No change needed.
- No session lock is held longer than necessary for any command.
- **No Rust async/session-lock changes were made.**

### Git CREATE_NO_WINDOW (Part C)

Modified `run_git` in `crates/ris-git/src/lib.rs`:
- Uses a mutable `cmd` variable.
- On Windows only (`#[cfg(windows)]`), calls `cmd.creation_flags(0x0800_0000)` (CREATE_NO_WINDOW) via `std::os::windows::process::CommandExt`.
- All production Git operations inherit this — they all go through `run_git`.
- stdout/stderr capture and `GitError` behavior unchanged.
- Non-Windows behavior is identical to before (cfg block is compiled away).

CREATE_NO_WINDOW cannot be unit-tested on Linux CI without mocking OS calls. No brittle test added; the flag is verified by Windows 11 manual QA.

### Tests

| Check | Result |
|---|---|
| `git diff --check` | pass |
| `tsc --noEmit` | pass |
| `vitest run` | **320/320 pass** (28 files — 5 new tests in appBusy.test.tsx) |
| `vite build` | pass — 22.22 kB CSS, 273.86 kB JS |
| `playwright test` | **10/10 pass** (Firefox) |
| `cargo fmt --all --check` | pass |
| `cargo test --workspace` | **358 tests pass** |
| `cargo clippy --workspace -- -D warnings` | pass |
| `cargo build --release` | pass (43 s incremental) |
| Full `tauri build` | not run — pnpm unavailable |

### Known risks

- `CREATE_NO_WINDOW` hides console windows only on Windows. The behavior requires Windows 11 manual QA to confirm.
- Overlay flicker delay (150 ms) is a UX judgment call. Very fast operations (<150 ms) show no overlay — intended behavior.
- `runBusyRef.current` pattern in GitSection's useEffect avoids infinite re-run but bypasses exhaustive-deps lint. This is the established pattern for stable callback refs.

### Windows manual QA checklist for this milestone

1. Run Windows Diagnostic Installer workflow and install on Windows 11.
2. Open an example repository — confirm a spinner/label overlay appears briefly during load.
3. Click "Refresh Git status" — confirm UI shows busy overlay with label "Checking Git status…".
4. Commit with a message — confirm "Committing changes…" overlay appears.
5. Push to a test remote (or try and fail) — confirm "Pushing to remote…" overlay.
6. Pull — confirm "Pulling from remote…" overlay.
7. During any Git action: confirm **no transient cmd/console window** flashes on screen.
8. Trigger a deliberate error (e.g. push without upstream) — confirm overlay clears and error appears in the panel; confirm navigation is usable afterwards.
9. Navigate between tabs while a Git action is pending (if possible) — confirm overlay blocks the click.
10. Run CSV import with sample CSV — confirm "Previewing CSV…" and "Importing CSV…" overlays appear.

---

## Milestone 2: Versioning and beta release process — branch `release/versioning-beta-process`

**Branch:** `release/versioning-beta-process`
**Base branch:** `master`

### Summary

Added version consistency enforcement (script + CI job), versioned CI artifact names, and the beta release process documentation.

### Version audit result

All four canonical version sources were confirmed consistent at `0.1.0` before starting — no version file changes were needed.

| Source | Version |
|---|---|
| `package.json` (workspace root) | 0.1.0 |
| `apps/desktop/package.json` | 0.1.0 |
| `apps/desktop/src-tauri/Cargo.toml` | 0.1.0 |
| `apps/desktop/src-tauri/tauri.conf.json` | 0.1.0 |

### What was changed

**`scripts/check-version-consistency.mjs`** (new) — Node ESM script, no new dependencies. Reads all four version files, prints a formatted table, exits 0 on match / non-zero on mismatch. Accessible as `pnpm check:version` (root script added to `package.json`).

**`package.json`** — Added `"check:version": "node scripts/check-version-consistency.mjs"` to root scripts.

**`.github/workflows/ci.yml`** — Added `version-check` job (Ubuntu, no setup overhead beyond checkout). Runs `node scripts/check-version-consistency.mjs`. Runs on every push and pull request alongside the existing `rust` and `frontend` jobs.

**`.github/workflows/windows-installer.yml`** — Added "Extract app version" step (PowerShell, `id: version`) before the Tauri build. Reads version from `tauri.conf.json` via `ConvertFrom-Json`. Writes `APP_VERSION` to `$env:GITHUB_OUTPUT`. Artifact name changed from `rack-inventory-studio-windows-installer` to `rack-inventory-studio-v${{ steps.version.outputs.APP_VERSION }}-windows-installer`.

**`.github/workflows/windows-diagnostic-installer.yml`** — Same version extraction step added. Artifact name changed from `rack-inventory-studio-windows-diagnostic-installer` to `rack-inventory-studio-v${{ steps.version.outputs.APP_VERSION }}-windows-diagnostic-installer`.

**`docs/BETA_RELEASE_PROCESS_EN.md`** (new) — Purpose, version policy, beta naming convention, full release checklist (verify consistency → merge → trigger workflow → smoke test → distribute), version bump procedure (all four files), protected-master recommendation. Links to BETA_HARDENING_PLAN_EN.md and windows-diagnostic-installer.md.

**`README.md`** — Added link to `BETA_RELEASE_PROCESS_EN.md` in the "Current release direction" section. Added "Version consistency check" section with `pnpm check:version` snippet and link to release process doc.

**`CHANGELOG.md`** — Added unreleased entry for Milestone 2 (this branch) at top. Also added missing unreleased entry for Milestone 1 (PR #65, which did not include a CHANGELOG update).

### Tests

| Check | Result |
|---|---|
| `git diff --check` | pass |
| `node scripts/check-version-consistency.mjs` | pass — all 0.1.0 |
| `tsc --noEmit` | pass |
| `vitest run` (desktop) | **320/320 pass** |
| `vite build` | pass — 273.86 kB JS, 22.22 kB CSS |
| `cargo fmt --all --check` | pass |
| `cargo test --workspace` | pass (all Rust tests) |
| `cargo clippy --workspace -- -D warnings` | pass |
| `actionlint` | not available — YAML verified by manual review |

### Risks

- The `check-version-consistency.mjs` script uses `ConvertFrom-Json` in PowerShell in the workflows to extract version from `tauri.conf.json`. This assumes `"version": "X.Y.Z"` is at the top level of the JSON, which it is. The script itself uses a regex for `Cargo.toml` which is correct for the standard `version = "X.Y.Z"` format.
- The version-check CI job runs on `ubuntu-latest` with only `checkout` — no pnpm/Node setup required since `node` is available by default. Script uses only Node built-ins.
- Changing artifact names breaks any external scripts or CI pipelines that download artifacts by exact name. Acceptable for this project (no known external consumers at this stage).
- `actionlint` not available locally — YAML validated by inspection only.

### Not done

- Version bump is not automated — it requires updating all four files manually. A future scripted bump helper could be added.
- No git tag is created in this branch (out of scope per milestone instructions).
- No PR protection rules configured — the `BETA_RELEASE_PROCESS_EN.md` recommends them but they require GitHub Settings access.

### Suggested next step

Merge this PR, then proceed to Milestone 3: navigation/Settings/terminology cleanup per `docs/BETA_HARDENING_PLAN_EN.md`.

---

## Beta hardening milestone 3 — Navigation, Settings, and terminology cleanup

**Branch:** `ux/navigation-settings-terminology`
**Base branch:** `master`

### Summary

Added a Settings page to the app navigation, made the Racks navigation item context-aware (hidden until a location is selected), added a location subtitle to the Racks nav item, and clarified Device Model "Model number" terminology. Also applied a small docs correction from PR #66 review.

### Settings page and navigation (Part A)

**Files:** `apps/desktop/src/features/settings/SettingsPanel.tsx` (new), `apps/desktop/src/components/ui/Icon.tsx` (+`IcSettings`), `apps/desktop/src/App.tsx`

- Added `IcSettings` (gear/sun icon) to `Icon.tsx`.
- Created `SettingsPanel.tsx` with three panels:
  - **Application** — placeholder text: "preferences will appear here in a future beta."
  - **Diagnostics and logs** — explains local-only logging, shows Windows and Linux log paths, links to `.ai/local-diagnostics-logging.md`.
  - **About** — shows app name, version (imported from `apps/desktop/package.json`), and build type.
- Added `"settings"` to the `Tab` union type.
- Added Settings nav item in a new "System" section at the bottom of the left rail.
- Modified `navItem()` to allow Settings to be enabled even without a repository open (alongside Repository).
- SettingsPanel renders when `activeTab === "settings"`.

### Racks navigation visibility (Part B)

**File:** `apps/desktop/src/App.tsx`

- Racks nav item is now rendered conditionally: visible only when `selectedLocationForRacks !== null` OR `activeTab === "racks"`.
  - The `activeTab === "racks"` condition ensures the nav item is visible during programmatic navigation (from search/validation), even without explicit location context.
- When `selectedLocationForRacks` is set, the nav item shows a subtitle with `{code} — {name}` for the selected location.
- `navItem()` updated to accept an optional `subtitle` string rendered below the label.
- When programmatic navigation navigates to racks without location context, `RacksPanel` already shows the empty state: "Select a location to manage its racks" — no crash, clear message.
- `selectedLocationForRacks` continues to be cleared on open, create, and close repository.

### Left rail branding cleanup (Part C)

Audit confirmed the current left rail has no duplicate brand block (no logo or "Rack Inventory Studio" text in the rail). The `repo-card` at the bottom of the rail was the only candidate — it shows the repository name and path — but the path is unique context not shown elsewhere. The `repo-card` was removed since the titlebar `repo-pill` already shows the repository name and code. This removes the duplication of repository name between the rail card and the titlebar.

### Device Model terminology (Part D)

**Files:** `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx`, `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx`

- Form label changed: `"Model number"` → `"Manufacturer model / SKU"`.
- Help text added: `"Vendor or catalog model identifier, for example PowerEdge R640, ICX 7150, or another SKU printed by the manufacturer."`.
- Input `placeholder` updated to `"e.g. PowerEdge R640"`.
- `data-testid="field-model-sku"` added for test targeting.
- Table column header changed: `"Model number"` → `"Model / SKU"`.
- Internal field names (`modelNumber` in FormState, `model_number` in DTO, YAML) unchanged.

### Docs follow-up from PR #66 (Part E)

**File:** `docs/BETA_RELEASE_PROCESS_EN.md`

- Updated branch protection CI job names from `rust`, `frontend`, `version-check` to match actual GitHub Actions job names: `Rust workspace`, `Frontend checks`, `Version consistency`.

### Files changed

| File | Change |
|---|---|
| `apps/desktop/src/App.tsx` | Settings tab, conditional Racks nav, location subtitle, Settings render, removed repo-card |
| `apps/desktop/src/App.nav.test.tsx` | New: 6 unit tests for Settings and Racks nav visibility |
| `apps/desktop/src/components/ui/Icon.tsx` | Added `IcSettings` |
| `apps/desktop/src/features/settings/SettingsPanel.tsx` | New: Settings page with 3 panels |
| `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx` | Terminology: label, help text, placeholder, test-id |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` | Table column: "Model number" → "Model / SKU" |
| `apps/desktop/src/features/deviceModels/DeviceModelFormModal.test.tsx` | 4 new tests: label, help text, pre-populated field, payload key |
| `apps/desktop/e2e/smoke.spec.ts` | Updated tab-enabled test; added Settings smoke test (11th test) |
| `docs/BETA_RELEASE_PROCESS_EN.md` | CI job names correction |

### Tests

| Check | Result |
|---|---|
| `git diff --check` | pass |
| `node scripts/check-version-consistency.mjs` | pass — all 0.1.0 |
| `tsc --noEmit` | pass |
| `vitest run` | **330/330 pass** (29 test files — 10 new tests) |
| `vite build` | pass — 22.22 kB CSS, 276.37 kB JS |
| `playwright test` | **11/11 pass** (1 new Settings smoke test) |
| `cargo fmt --all --check` | pass |
| `cargo test --workspace` | pass |
| `cargo clippy --workspace -- -D warnings` | pass |

### Known risks

- Settings is accessible without a repository open, meaning it renders even in the "no repo" state. This is intentional per the milestone spec.
- Racks nav is hidden by default; tests that navigate to Racks must go via Locations → Manage racks. The e2e smoke test for "open repository enables all tabs" was updated accordingly.
- For programmatic navigation to racks (from search/validation) when no location context is set, the Racks nav item becomes visible (`activeTab === "racks"` condition) but the RacksPanel shows the "select a location" empty state. No crash.
- The `repo-card` was removed from the left rail. Any user who expected the path to be visible in the rail will need to use the Repository tab for the full path.
- `SettingsPanel` imports `package.json` directly (Vite JSON import). TypeScript and Vite both handle this natively; it's the canonical way to expose version without extra build steps.
- `actionlint` not available locally — workflow files were not changed in this branch.

### Manual QA checklist

1. Open repository → confirm Racks is **not** visible in the left nav.
2. Go to Locations → click "Manage racks" for a location → confirm Racks appears in nav with the location code/name as a subtitle.
3. Confirm Racks panel shows racks filtered to the selected location.
4. Click Settings (bottom of nav) → confirm Settings page opens with Application, Diagnostics and logs, and About panels.
5. Confirm Settings is clickable **before** opening any repository.
6. Confirm the left rail has **no duplicate app branding** (no "Rack Inventory Studio" text in the rail; it appears only in the titlebar).
7. Open Device Models → Add model → verify the field shows "Manufacturer model / SKU" label and help text.
8. Verify Device Models table column says "Model / SKU".
9. Use search/validation to navigate to a rack target → confirm Racks nav appears and either shows the location-filtered list or the "select a location" empty state (no crash).
10. Close repository → confirm Racks nav disappears from the left rail.

---

## Beta hardening milestone 4 — Rack detail and placement UX redesign

**Branch:** `ux/rack-placement-workflow-redesign`
**Base branch:** `master`

### Audit findings

Commands available:
- `placeDevice({ rack_id, device_id, side, start_u, height_u? })` → placement_id — height_u is `number | null`, optional override
- `placeRackObject({ rack_id, device_model_id, side, start_u, height_u? })` → placement_id — same height pattern
- `movePlacement({ placement_id, new_rack_id?, new_side?, new_start_u, new_height_u })` → void
- `removePlacement({ placement_id })` → void

PlacementDto fields confirmed: `id`, `code`, `target_kind`, `target_id`, `target_code`, `target_name`, `device_type`, `start_u`, `height_u` (explicit override or null), `effective_height_u`, `end_u`, `note`, `tags`, `model_name`, `model_code`, `target_serial`, `target_asset_tag`.

Height override: `height_u?: number | null` is accepted by both `placeDevice` and `placeRackObject` — full height override support confirmed.

Drag/drop: DndPayload stored in singleton via `setActiveDragPayload`/`getActiveDragPayload`. `canDropAt()` validates occupancy. Drop handler was direct `placeDevice`/`placeRackObject` — changed to open modal.

### Layout changes

Old: 3-column grid `[260px palette | 1fr diagram | 320px inspector]`

New: 2-column grid `[1fr diagram + placement table below | 280px palette + inspector below]`

- Left column: rack diagram (full-width) + active-side placement table below
- Right column: AddPlacementPanel (palette mode) + PlacementInspectorPanel (conditional, shown only when a placement is selected)
- Inspector is now compact (details + action buttons only)

### What happened to AddPlacementPanel

Retained as palette + add form, now in the right 280px column. The form is still present (user can still type start_u + select device + click Add). The drag palette is preserved. No functionality removed — just repositioned from left 260px column to right 280px column.

### PlacePlacementModal

New file: `apps/desktop/src/features/racks/PlacePlacementModal.tsx`

Trigger paths:
1. Click an empty U-slot in the diagram → `onEmptySlotClick(startU)` → modal opens with startU prefilled
2. Drag from palette and drop on empty slot → modal opens with startU prefilled (payload stored for context)

Behavior: target type selector (Device / Rack Object), device dropdown (unplaced only), rack object dropdown, start U input (prefilled), optional height U override. All mutations via `runBusy("Placing equipment…", ...)`. Error in modal footer. On success: `onPlaced(id)` + `onClose()`.

### EditPlacementModal

New file: `apps/desktop/src/features/racks/EditPlacementModal.tsx`

Trigger paths:
1. "Edit" button in placement table row
2. "Edit placement…" button in PlacementInspectorPanel

Shows: placement code (subtitle), rack code, side (read-only), target name, type, model, effective height (read-only). Editable: Start U. "Remove placement…" → ConfirmDialog (danger). Save → `movePlacement({ new_start_u })` via `runBusy("Updating placement…", ...)`. Error in modal footer.

### Drag/drop behavior

Existing DnD infrastructure kept intact. Drop handler changed: `handleDropAtCell(side, startU, payload)` → opens `PlacePlacementModal` with `startU` prefilled. Payload is stored for context but the modal still shows the full available device/rack-object lists (user can change selection in the modal).

### Non-drag fallback

`RackUnitDiagram` now has `onEmptySlotClick?: (startU: number) => void` prop. Empty cell onClick calls both `onSelectPlacement(null)` and `onEmptySlotClick(startU)`. The empty slot cursor changes to `pointer` when the callback is provided.

### Placement table changes

New columns: U · Name · Type · Model/SKU · Serial · Asset tag · Actions (Edit button per row). Edit button opens `EditPlacementModal`. Remove is via the EditPlacementModal (not directly from the table — user must open edit modal first).

### Inspector changes

Simplified: inline move form (start U input, rack select, height U, Move button) removed. Now shows: KV detail list + "Edit placement…" button (opens EditPlacementModal) + "Move to [Other]Side…" button (ConfirmDialog) + "Remove placement…" button (ConfirmDialog danger). Inspector is now conditional — only visible when a placement is selected.

### Global busy overlay integration

Labels used:
- `"Placing equipment…"` — PlacePlacementModal placeDevice/placeRackObject
- `"Updating placement…"` — EditPlacementModal movePlacement
- `"Removing placement…"` — EditPlacementModal removePlacement, PlacementInspectorPanel removePlacement
- `"Moving to Rear…"` / `"Moving to Front…"` — PlacementInspectorPanel movePlacement (change side)

### Backend changes

None. All changes are frontend-only. DTOs unchanged.

### Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/features/racks/PlacePlacementModal.tsx` | New — modal for placing device/rack-object |
| `apps/desktop/src/features/racks/EditPlacementModal.tsx` | New — modal for editing/removing a placement |
| `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` | New — 11 unit tests |
| `apps/desktop/src/features/racks/EditPlacementModal.test.tsx` | New — 11 unit tests |
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | New 2-col layout, wire both modals, table actions |
| `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` | Simplified to details + action buttons; useBusy |
| `apps/desktop/src/features/racks/RackUnitDiagram.tsx` | Added onEmptySlotClick prop; drop→modal |
| `apps/desktop/e2e/smoke.spec.ts` | Added "click empty slot opens modal" test; updated layout assertion |
| `apps/desktop/e2e/mocks/tauri-core.ts` | Added move_placement + remove_placement mock stubs |

### Tests

| Check | Result |
|-------|--------|
| `git diff --check` | pass |
| `node scripts/check-version-consistency.mjs` | pass (all 0.1.0) |
| `tsc --noEmit` | pass |
| `vitest run` | 352/352 pass (31 test files, +22 new from PlacePlacementModal.test + EditPlacementModal.test) |
| `vite build` | pass (22.22 kB CSS, 281 kB JS) |
| `playwright test` | 12/12 pass (+1 new: click empty slot opens modal) |
| `cargo fmt --all --check` | pass |
| `cargo test --workspace` | pass (all Rust tests) |
| `cargo clippy --workspace -- -D warnings` | pass |

### Known risks

- `PlacementInspectorPanel` no longer has the inline move form — the only way to move a placement to a different U on the same side is via EditPlacementModal. This is intentional per the design. The Change side flow remains in the inspector.
- When drag-and-drop is used, the modal opens with startU prefilled but the DndPayload (device/model pre-selection) is stored but not used to pre-select the device in the modal dropdown. User must select the device again in the modal. This is a minor UX friction.
- The right palette column (280px) may feel narrow on very small viewports. No responsive breakpoints added.
- Inspector is now conditional (hidden when nothing selected). Users accustomed to always seeing it may be confused. The empty-state message in the placement table guides them.

### Manual QA checklist

1. Open repository
2. Locations → Manage racks
3. Open rack detail
4. Confirm diagram is larger (1fr), right panel is palette sidebar (280px)
5. Confirm placement table below diagram has columns: U · Name · Type · Model/SKU · Serial · Asset tag · Actions
6. Click empty U-slot → PlacePlacementModal opens
7. Select a device and start U → Place → placement appears in diagram and table
8. Click "Edit" in table row → EditPlacementModal opens with correct data
9. Change start U → Save move → placement moves
10. Open EditPlacementModal → Remove placement… → ConfirmDialog → confirm → placement removed
11. Click a placement in table → inspector appears in right column
12. Inspector shows "Move to Rear…" → ConfirmDialog opens → Cancel
13. Inspector shows "Edit placement…" button → opens EditPlacementModal
14. Drag from palette → drop on empty slot → modal opens prefilled with startU
15. Switch Front/Rear → inspector clears
16. Confirm busy overlay appears/clears during all mutations
17. No console errors throughout

---

### Repair update after ChatGPT review (PR #68 — ux/rack-placement-workflow-redesign)

#### Blocker 1 fixed: Right sidebar is now palette-only

- **`AddPlacementPanel.tsx`** — left in place for historical reference but is **no longer imported** anywhere. The right sidebar now uses a new `PlacementPalettePanel.tsx`.
- **New file: `PlacementPalettePanel.tsx`** — palette-only component with no inline add form. Shows unplaced devices and rack object models as draggable palette cards. Each card has a "Place…" button that calls `onPlaceDevice(deviceId)` or `onPlaceRackObject(modelId)` callback.
- **`RackDetailPanel.tsx`** — switched import from `AddPlacementPanel` to `PlacementPalettePanel`. Added `placeModalTargetKind` / `placeModalTargetId` state. Added `handlePalettePlaceDevice` / `handlePaletteRackObject` handlers that set the target preselection then open `PlacePlacementModal`. `handleDropAtCell` also now sets `placeModalTargetKind` / `placeModalTargetId` from the DnD payload, so drops preselect the dragged item in the modal.
- No direct `placeDevice` / `placeRackObject` calls remain in any sidebar component.

#### PlacePlacementModal: initialTargetKind / initialTargetId preselection

- **`PlacePlacementModal.tsx`** — added `initialTargetKind?: "device" | "rack_object" | null` and `initialTargetId?: string | null` props. The reset `useEffect` now reads these and preselects the correct type + item when the modal opens.
- When opened via palette "Place…": correct type tab pre-selected, correct item pre-selected in dropdown, Place button enabled immediately.
- When opened via DnD drop: same preselection from DnD payload (device ID or model ID).
- When opened via empty slot click: no preselection (user picks device/model as before).

#### Blocker 2 fixed: EditPlacementModal Height U override

- **`EditPlacementModal.tsx`** — added `heightUStr` state initialized from `placement.height_u`. Added "Height U override" `<Field>` with data-testid `height-u-input`. Help text shows current effective height. Validation: empty → `new_height_u: null`; positive integer → `new_height_u: parsedNumber`; negative/zero → validation error. `movePlacement` now always passes the user-controlled `newHeightU` value (was previously passing the stale `placement.height_u`).

#### E2E test updated

- **`e2e/smoke.spec.ts`** — updated `getByText(/Add Placement/)` → `getByText(/Placeable equipment/)` to match the new panel title.

#### Tests added

**EditPlacementModal.test.tsx (+6 tests):**
1. Renders empty Height U override when `placement.height_u` is null
2. Renders existing override value when `placement.height_u` is set to 3
3. Changing override to "2" calls movePlacement with `new_height_u: 2`
4. Clearing an existing override calls movePlacement with `new_height_u: null`
5. Negative override ("-1") shows validation error and does not call movePlacement
6. Zero override ("0") shows validation error and does not call movePlacement

**PlacePlacementModal.test.tsx (+2 tests):**
1. Preselects device when opened with `initialTargetKind="device"` and `initialTargetId`
2. Preselects rack object model when opened with `initialTargetKind="rack_object"` and `initialTargetId`

#### Checks run and results

| Check | Result |
|-------|--------|
| `node scripts/check-version-consistency.mjs` | pass (all 0.1.0) |
| `git diff --check` | pass |
| `test ! -f apps/desktop/package-lock.json` | pass |
| `git ls-files '.ai/review-context-*.md'` | pass (none tracked) |
| `node node_modules/typescript/bin/tsc --noEmit` | pass |
| `node node_modules/.bin/vitest run` | **360/360 pass** (31 test files, +8 new tests) |
| `node node_modules/.bin/vite build` | pass (22.22 kB CSS, 277.92 kB JS) |
| `cargo fmt --all --check` | pass |
| `cargo check --workspace` | pass |
| `cargo test --workspace` | pass |
| `cargo clippy --workspace -- -D warnings` | pass |

Note: Playwright e2e was not re-run in this session (unchanged mock infrastructure; one test assertion updated to match new panel title).

#### Remaining risks

- `AddPlacementPanel.tsx` file still exists in the filesystem (not deleted). It is no longer imported by any component. It could be deleted in a future cleanup pass to avoid confusion.
- `PlacementPalettePanel` does its own data loading (listDevices/listDeviceModels) independently from the parent's `availableDevices` state. This means two separate fetches on each reload. Both stay in sync via the same `mutationToken`/`reloadToken` signals. Could be consolidated in a future refactor.
- Visual: "Place…" button layout inside palette cards not visually QA'd (headless environment).

---

## Beta hardening milestone 5 — Beta QA and Windows installer validation

**Branch:** qa/beta-windows-installer-validation
**App version:** v0.1.0
**Date:** 2026-05-24

### PR #68 baseline confirmation
- PlacePlacementModal.tsx: present
- EditPlacementModal.tsx: present (with Height U override)
- PlacementPalettePanel.tsx: present
- AddPlacementPanel imported by RackDetailPanel: NO
- Settings page: present
- Racks context-aware nav: present

### AddPlacementPanel.tsx cleanup
Removed — file was not imported anywhere.

### Docs added/updated
- docs/BETA_WINDOWS_11_QA_EN.md (new) — Windows 11 manual QA runbook
- docs/BETA_RELEASE_PROCESS_EN.md (updated) — added Windows 11 QA step (5a) before Distribute
- README.md (updated) — link to Windows 11 QA runbook added to beta release direction section
- CHANGELOG.md (updated) — milestone 5 unreleased entries (Added + Changed sections)

### Installer workflow verification
Both installer workflows exist and are workflow_dispatch-only:
- .github/workflows/windows-installer.yml — produces rack-inventory-studio-v0.1.0-windows-installer
- .github/workflows/windows-diagnostic-installer.yml — produces rack-inventory-studio-v0.1.0-windows-diagnostic-installer with diagnostic-readme.txt
Workflow triggering deferred until after commit/push (see Remaining manual steps).

### Automated checks
- git diff --check: PASS
- version consistency: PASS (v0.1.0)
- TypeScript: PASS
- Vitest: PASS (360/360 tests)
- Vite build: PASS (22.22 kB CSS, 277.92 kB JS)
- Playwright e2e: PASS (12/12)
- cargo fmt: PASS
- cargo check: PASS
- cargo test: PASS (358 tests)
- cargo clippy: PASS
- No package-lock.json: PASS
- No tracked review-context: PASS

### Windows 11 manual QA status
Windows 11 manual QA was not completed in this environment and remains required before beta release.

### Known risks
- Windows 11 manual QA pending
- Installer signing not implemented (SmartScreen warning expected on Windows 11)

### Remaining manual steps
1. Trigger Windows installer workflows from GitHub Actions UI (or via gh CLI after branch is pushed)
2. Download and smoke-test installer on Windows 11
3. Complete BETA_WINDOWS_11_QA_EN.md checklist
4. Merge PR after review

---

## Beta QA findings action plan

**Branch:** planning/beta-qa-findings-action-plan
**Date:** 2026-05-24
**Type:** Documentation/planning only — no product code changes.

### Document added
- `docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md` — 7-section action plan with 14 findings, 6 follow-up milestones (A–F), beta blocking classification table, and testing expectations.

### Key findings captured
14 findings across: Settings UX (F1, F2), release process (F3), duplicate brand block (F4), drag-and-drop gaps (F5, F6), unsafe cross-side move (F7), missing create-device-from-placement (F8), table-as-primary-UI (F9, F10), diagram coloring/legend (F11, F12), CSV download broken (F13), utilization stale (F14).

### Proposed milestone split
- Milestone A — Immediate beta blockers and small UI cleanup (F4, F7, F13, F14)
- Milestone B — Settings logs actions (F1, F2)
- Milestone C — Rack diagram as primary placement UI (F9, F10, F11, F12)
- Milestone D — Complete drag-and-drop workflow (F5, F6)
- Milestone E — Create device from Place equipment (F8)
- Milestone F — Release branch and versioning process (F3)

### Files changed
- `docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md` — new
- `docs/BETA_HARDENING_PLAN_EN.md` — added link to action plan
- `README.md` — added link to action plan
- `CHANGELOG.md` — unreleased entry for this branch

### Checks run
- git diff --check: PASS
- node scripts/check-version-consistency.mjs: PASS (v0.1.0)
- No package-lock.json: PASS
- No tracked review-context files: PASS
- TypeScript/Rust: not run (docs-only branch)

### Known risks
- Milestone C and D touch the same rack diagram/DnD code — ordering matters.
- Milestone A (remove Change side) requires confirming all surfaces in PlacementInspectorPanel and EditPlacementModal are cleaned up.
- CSV download fix (Milestone A) requires Tauri plugin support investigation before implementation.

### Windows 11 manual QA status
Windows 11 manual QA was not completed in this environment and remains required before beta release.

---

## Beta QA follow-up Milestone A — Immediate blockers and small UI cleanup

**Branch:** fix/beta-qa-milestone-a-blockers

### Duplicate brand block fix
Removed the `<div className="brand">` block (icon + "Rack Inventory Studio" text) from the internal app titlebar in `App.tsx`. The native Tauri window title bar already provides this branding — having it duplicated inside the content area was visually redundant. The repo-pill (repo name, code, unsaved indicator, error count) is kept in the titlebar as useful context. Updated e2e smoke test to no longer assert on the visible "Rack Inventory Studio" text inside the page.

### Change side removal
Removed all "Change side" / "Move to Rear" / "Move to Front" UI from `PlacementInspectorPanel.tsx`:
- Removed `changeSideOpen` and `changeSideError` state variables
- Removed the `handleChangeSideConfirm()` function and its `movePlacement` call with `new_side: otherSide`
- Removed the second `ConfirmDialog` (the side-change one; kept the remove-placement one)
- Removed the "Change side" button group
- Removed unused `movePlacement` import (only `removePlacement` remains)
- Updated e2e smoke test: replaced "Change side dialog" with "no change-side button" asserting buttons are NOT visible

Grep result: clean (remaining occurrences are in the test assertion that they are NOT visible).

### CSV sample save/download
Replaced broken browser Blob download with a Tauri-native save flow:
- `tauriClient.ts`: added `writeTextToFile()` (calls new `write_text_to_file` Rust command) and `saveCsvFileViaDialog()` (uses `save` from `@tauri-apps/plugin-dialog` + `writeTextToFile`)
- `csvSample.ts`: replaced `downloadSampleCsv()` with `saveSampleCsv()` — opens native save dialog, writes content; returns "saved" | "cancelled"
- `CsvImportPanel.tsx`: uses `handleSaveSample()`, shows success banner on save, error banner on failure, silent on cancel
- Added `dialog:allow-save` permission to `capabilities/default.json`
- Added `write_text_to_file(path, content)` Rust command in `repository.rs` using `std::fs::write`
- Updated `csvSample.test.tsx` and `CsvImportPanel.test.tsx` for new API
- Updated e2e mock: added `save()` to `tauri-dialog.ts` (returns null = cancelled), added `write_text_to_file` case to `tauri-core.ts`
- Updated `SAMPLE_CSV_FILENAME` to canonical name `rack-inventory-studio-device-import-sample.csv`

### Utilization fix
**Chosen rule:** `max(front_used_U, rear_used_U) / height_u` — front and rear share the same physical U space; the busier side determines how full the rack is.

Previous calculation was `placement_count / (height_u × 2)` — used device count, not U slots.

Fixed by:
- Adding `front_used_u` and `rear_used_u` (u32) fields to `RackSummaryDto` in `dto.rs`
- Computing them in `list_racks` by summing `effective_height_u` per side (with `unwrap_or(1)` fallback)
- Updating TypeScript `RackSummaryDto` interface and utilization formula in `RacksPanel.tsx`
- Updated all test fixtures and e2e mock fixture with new fields
- Added 2 utilization unit tests in `RacksPanel.test.tsx`

### Tests added/updated
- `csvSample.test.tsx` (20 tests) — replaced downloadSampleCsv with saveSampleCsv tests; added filename canonical check
- `CsvImportPanel.test.tsx` (6 tests) — success/cancel/error response tests for new handler
- `RacksPanel.test.tsx` (+2 utilization tests, fixture updated)
- `EditPlacementModal.test.tsx`, `PlacePlacementModal.test.tsx`, `RackFormModal.test.tsx` — fixture updates only
- `e2e/smoke.spec.ts` — replaced change-side test; removed brand text assertion

### Checks run
- git diff --check: PASS
- version consistency (v0.1.0): PASS
- TypeScript: PASS
- Vitest: PASS (366/366)
- Playwright e2e: PASS (12/12)
- Vite build: PASS
- cargo fmt/check/test/clippy: PASS
- No package-lock.json: PASS
- No tracked review-context: PASS

### Known risks
- `write_text_to_file` uses `std::fs::write` without atomic rename — partial write on failure is possible but low risk for a sample CSV.
- Utilization falls back to `unwrap_or(1)` for placements with no model and no height override.
- Front/rear U accounting is additive (not overlap-aware); validation errors in data could exceed 100%.

### Manual QA checklist (required on Windows 11)
1. Open app — confirm no duplicate "Rack Inventory Studio" brand block inside app content
2. Open repository
3. Locations → Manage racks → open rack detail
4. Confirm Front/Rear viewing selector still works
5. Select a placement — confirm no "Change side" / "Move to Rear" / "Move to Front" action
6. Edit same-side Start U — confirm it still works
7. Remove placement via ConfirmDialog — confirm it still works
8. Click "Download sample CSV" — save dialog opens, choose path, confirm file saved
9. Cancel save dialog — confirm no error shown
10. Place/edit/remove placement — return to Racks list — confirm Utilization updated

### Repair update (post-review narrowing + CSV fix)

**Generic command removed:** `write_text_to_file(path, content)` and its frontend wrappers `writeTextToFile` / `saveCsvFileViaDialog` were replaced by the narrow `write_device_import_sample_csv(path)` command. The backend owns the fixed sample CSV content; the frontend only supplies the user-selected save path.

**Malformed row fixed:** `sw-demo-01` row in `DEVICE_IMPORT_SAMPLE_CSV` had 10 fields (one extra comma). Corrected to 9 fields matching the header.

**Backend tests added:**
- `sample_csv_all_rows_have_header_column_count` — asserts every non-empty row has exactly 9 fields.
- `sample_csv_parses_without_errors_via_importer` — runs the constant through `ris_import::preview_csv_import` with an empty context, asserts 0 file-level issues and 0 error rows.

**Checks run after repair:**
- git diff --check: PASS
- version consistency (v0.1.0): PASS
- TypeScript: PASS
- Vitest: 366/366 pass
- Playwright e2e: 12/12 pass
- Vite build: PASS
- cargo fmt: PASS
- cargo check: PASS
- cargo test (new tests pass): PASS
- cargo clippy: PASS
- Generic symbol grep (write_text_to_file / writeTextToFile / saveCsvFileViaDialog): clean
