# cc-report — design/claude-ui-polish

## Summary

Implemented the Claude Design UI polish across the entire desktop app frontend, on branch `design/claude-ui-polish`. Five commits, all pushed. No PR created (branch stays for review).

The work replaces inline `common.*` style objects throughout the app with a design-token-driven CSS class system, using the design primitives extracted from the Claude Design file.

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
- No end-to-end (Playwright) tests were run — the dev server requires Tauri and a real OS environment.

## Not done

- Responsive layout / mobile breakpoints
- Dark mode toggle (tokens are defined, but no toggle UI added)
- Keyboard navigation polish for the palette drag cards
- Playwright e2e tests (require full Tauri runtime)
- `RackUnitDiagram` visual polish (diagram cell colors still use inline styles from before)

## Suggested next step

Run the Tauri dev build (`pnpm tauri dev`) and do a visual QA pass against the Claude Design HTML, especially checking the rack three-pane layout at different window sizes and verifying the drag-to-place flow works correctly with the new `.palette-card` drag handles.

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
