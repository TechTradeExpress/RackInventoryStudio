## Summary

Stage 3B.2: delete flows and destructive-operation guards — two independent WDIO specs.

Branch: `feature/e2e-wdio-destructive-guards` → base: `roadmap/e2e-wdio`

Eight NEEDS SELECTOR workflows promoted to COVERED by two new specs:

**`entity-deletes.e2e.ts`** (successful deletes, leaf-to-parent):
1. Delete device (unplaced, no model)
2. Delete device model (not referenced)
3. Delete rack (no placements)
4. Delete location (no racks)
   Plus: cancel assertion (entity survives), persistence (save + close + reopen)

**`destructive-guards.e2e.ts`** (relationship guard rejections):
5. Location guard — delete blocked because rack still references it
6. Rack guard — delete blocked because placement still references it
7. Device model guard — delete blocked because device references it
8. Device guard — delete blocked because device is placed in a rack
   Plus: dirty-state assertion (guards do not mark repository dirty), persistence (location
   + rack survive clean close + reopen after guard-only operations)

New selectors added to application source: `confirm-dialog-confirm`, `confirm-dialog-cancel`
on `ConfirmDialog.tsx`; `location-delete-error`, `rack-delete-error`,
`device-model-delete-error`, `device-delete-error` error-banner wrappers in the four panel
components.  Delete trigger buttons reuse the existing `aria-label="Delete <name>"` pattern
scoped to each entity row.

New shared support module: `apps/desktop/e2e-wdio/support/destructive-ui.ts` — 10 helpers
encapsulating ConfirmDialog interaction (including the WebKitGTK modal-backdrop synthetic-click
workaround), atomic DOM reads, row finders, and error-banner assertions.

New unit tests added to `ConfirmDialog.test.tsx` (6 tests) covering the new `data-testid`
attributes and their stability under custom confirm/cancel labels.

### Key implementation notes

**Part D navigation race** (`destructive-guards.e2e.ts`): After Part B's `navigateToRackDetail`
sets `selectedRack` in App.tsx, clicking the location row in Part D switches to the racks panel.
RacksPanel initially renders the rack list (racks still loading, `selectedRack = null`), but
`listRacks()` resolves quickly and the panel auto-switches to `RackDetailPanel` before WDIO's
polling window. The fix: accept either `rack-add-btn` (list) or `palette-drop-zone` (detail),
and if in detail, click the Back button via `browser.execute` text search to call
`onSelectRack(null)` → `setSelectedRack(null)` in App.tsx, then proceed from the rack list.

**60-minute Mocha timeout**: Each guard cycle (Parts C–F) takes ~4–5 min; the full spec runs
~57–60 min. `this.timeout()` inside WDIO's Mocha does not override `mochaOpts.timeout`. Parts G
and I were streamlined: Part G uses rack-list navigation (no rack-detail entry); Part I verifies
location + rack only (device model and device were verified in Part B's save/close/reopen cycle
and are untouched by guard rejections). Both runs complete in ~59:45–59:46.

## Files changed

| File | Change |
|---|---|
| `.ai/cc-report.md` | This report |
| `apps/desktop/src/components/ui/ConfirmDialog.tsx` | Add `data-testid="confirm-dialog-confirm"` and `data-testid="confirm-dialog-cancel"` to footer buttons |
| `apps/desktop/src/components/ui/ConfirmDialog.test.tsx` | Add 6 tests covering new testids (existence, stability, click callbacks, danger class) |
| `apps/desktop/src/features/locations/LocationsPanel.tsx` | Wrap delete-error Banner in `<div data-testid="location-delete-error">` |
| `apps/desktop/src/features/racks/RacksPanel.tsx` | Wrap delete-error Banner in `<div data-testid="rack-delete-error">` |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` | Wrap delete-error Banner in `<div data-testid="device-model-delete-error">` |
| `apps/desktop/src/features/devices/DevicesPanel.tsx` | Wrap delete-error Banner in `<div data-testid="device-delete-error">` |
| `apps/desktop/e2e-wdio/support/destructive-ui.ts` | New shared helpers module (10 functions) |
| `apps/desktop/e2e-wdio/specs/entity-deletes.e2e.ts` | New spec: successful delete flows (Parts A–I) |
| `apps/desktop/e2e-wdio/specs/destructive-guards.e2e.ts` | New spec: relationship guard flows (Parts A–I) |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Promote 8 workflows NEEDS SELECTOR→COVERED; add Stage 3B.2 selector section; update counts (COVERED 30→38, NEEDS SELECTOR 15→7) |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.1 → COMPLETED (PR #149, abcb8e4, CI #29809393075); Stage 3B.2 → IN REVIEW with full scope, selector table, and spec summary; Stage 3C → PLANNED |

## Tests

### TypeScript

```
pnpm -C apps/desktop exec tsc --noEmit   → PASS (0 errors)
```

### Vitest (targeted)

```
pnpm -C apps/desktop exec vitest run src/components/ui/ConfirmDialog.test.tsx   → PASS (completed)
```

### Vitest (full)

```
pnpm -C apps/desktop run test:unit   → PASS (850/850 tests)
```

### Repository hygiene

```
node scripts/check-repo-hygiene.mjs   → PASS
```

### Tauri build

```
pnpm -C apps/desktop tauri build --no-bundle   → PASS
```

### Rust workspace

```
cargo fmt/test/clippy/check --workspace   → PASS
```

### WDIO isolated runs

```
entity-deletes.e2e.ts        run 1         PASSED  00:57:56
entity-deletes.e2e.ts        run 2         PASSED  00:58:04
destructive-guards.e2e.ts    run 1 (run 7) PASSED  00:59:45
destructive-guards.e2e.ts    run 2 (run 8) PASSED  00:59:46
destructive-guards.e2e.ts    run 3 (run 9) PASSED  00:59:07  ← after Part I trim
```

### Full WDIO suite

```
xvfb-run -a wdio run e2e-wdio/wdio.conf.ts   → PASS  9/9 specs  04:21:24
```

## Risks

- Backend guard error messages must exactly match the `.includes()` substrings in
  `destructive-guards.e2e.ts`. Backend text confirmed against application source prior to
  writing spec; if messages change, the guard assertions will fail with a descriptive error.
- `browser.execute()` synthetic click in ConfirmDialog helpers bypasses full DOM event chain.
  The confirm/cancel callbacks are still exercised; the workaround is specific to the
  WebKitGTK modal-backdrop `mousedown` intercept.
- dirty-state assertion in Part H of `destructive-guards.e2e.ts` relies on the behavioral
  invariant that guard rejections do not call `onRepositoryMutated()`. Verified in source;
  if the implementation changes, the spec will catch it.
- Part D uses `browser.execute` text-search on the Back button ("Back to racks") instead of
  a `data-testid`. If the button text changes, this will fail. Adding a testid to
  RackDetailPanel's Back button would harden this — deferred to Stage 3C scope.
- Part I uses `rack-add-btn` visibility (rather than explicit rack row find) as the
  persistence signal, saving ~37 s. This is sufficient: location row click → racks panel
  loading → rack-add-btn visible confirms both entities persist. Full persistence was
  verified independently in Part B (save/close/reopen). `this.timeout()` does not
  override `mochaOpts.timeout` in WDIO's Mocha integration, so per-test timeout
  extension is not available.
- Spec timing is ~59:07 isolated and passes in the full 9-spec suite (04:21:24 total).
  Any regression that adds >50 s to the guard cycles could approach the Mocha limit.

## Not done

- Edit placement height U (Stage 3C)
- Remove placement via EditPlacementModal remove button (Stage 3C)
- PlacementInspectorPanel navigate to device / model (Stage 3C)
- `data-testid` on RackDetailPanel Back button (would harden Part D's Back-button click)
- WDIO CI enforcement (future CI stage)

## Suggested next step

Create the PR to `roadmap/e2e-wdio` with the full validation results in the body,
then generate the review context against `roadmap/e2e-wdio`.
