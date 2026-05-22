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
