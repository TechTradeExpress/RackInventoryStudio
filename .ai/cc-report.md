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
