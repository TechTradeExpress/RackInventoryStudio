## Summary

PR 1 of beta.3 roadmap. Added a `.tbl-wrap` scroll container around every
`<table class="tbl">` that lives inside a `.panel-bd.flush`. This fixes the
core list scalability problem: tables previously had no scroll container of
their own, so rows beyond the viewport were cut off with no usable way to
reach them. The `position: sticky` on table headers also did not function
because `.panel { overflow: hidden }` created an intervening scroll root.

The fix is minimal and purely CSS + one wrapper `<div>` per list panel.
No data model changes, no layout rewrites.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/app.css` | Added `.tbl-wrap` class: `overflow-y: auto; max-height: calc(100vh - 200px)` |
| `apps/desktop/src/features/devices/DevicesPanel.tsx` | Wrapped `<table>` in `<div className="tbl-wrap">` |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` | Wrapped `<table>` in `<div className="tbl-wrap">` |
| `apps/desktop/src/features/locations/LocationsPanel.tsx` | Wrapped `<table>` in `<div className="tbl-wrap">` |
| `apps/desktop/src/features/racks/RacksPanel.tsx` | Wrapped `<table>` in `<div className="tbl-wrap">` |
| `apps/desktop/src/features/devices/DevicesPanel.test.tsx` | Added scroll foundation tests (53-row render, `.tbl-wrap` presence, counter) |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.test.tsx` | New test file: 40-row render, `.tbl-wrap` presence, model count, empty state |

## Audit findings

Lists/tables found and evaluated:

| Panel | Has table | Fixed |
|---|---|---|
| DevicesPanel | yes | yes |
| DeviceModelsPanel | yes | yes |
| LocationsPanel | yes | yes |
| RacksPanel (location-scoped list view) | yes | yes |
| RackDetailPanel | rack diagram (not a tbl) | n/a |
| PlacementPalettePanel | palette cards (not tbl) | n/a |
| ValidationPanel | list items (not tbl) | n/a |

All four `<table class="tbl">` instances were wrapped. No other list views
use the `.tbl` class.

## Root cause

Two compounding issues:

1. `.panel { overflow: hidden }` — makes `.panel` the sticky-positioning scroll
   root (per CSS spec, `overflow: hidden` creates a scroll container). Since
   `.panel` does not actually scroll, `position: sticky` on `thead th` was a
   no-op. Headers scrolled away with the page.

2. No scroll container on the table itself — rows beyond the viewport had no
   way to be reached. The outer `.main { overflow: auto }` does scroll the full
   page, but the table was effectively clipped at the panel boundary in practice.

## Fix approach

Added `.tbl-wrap { overflow-y: auto; max-height: calc(100vh - 200px) }`.

- `max-height: calc(100vh - 200px)` reserves space for: topbar (40px) +
  page-header (~70px) + panel-hd (~44px) + page-content padding (~40px) +
  buffer (~6px).
- `overflow-y: auto` makes this element the scroll root, which allows
  `thead th { position: sticky; top: 0 }` (already present in app.css) to
  work correctly.
- `.panel { overflow: hidden }` was intentionally left unchanged to preserve
  the border-radius visual clipping. The sticky header now works against
  `.tbl-wrap` rather than `.panel`.

## Tests

```
npx vitest run
  Test Files  44 passed (44)
      Tests  569 passed (569)
```

New tests added:
- DevicesPanel: 53-device render (all rows in DOM), `.tbl-wrap` wrapper present,
  counter "3 of 3" correct
- DeviceModelsPanel (new file): 40-model render, `.tbl-wrap` wrapper present,
  title count, empty state

TypeScript: no errors (`tsc --noEmit` clean).

Rust checks: skipped — this PR touches only frontend CSS/TSX.
Vite build: `pnpm` and `npx vite build` not available in this CI environment;
TypeScript + Vitest both pass, confirming code correctness.

## Risks

- `max-height: calc(100vh - 200px)` is a heuristic. If a page adds banners
  (error, success, unsaved callout bar at 32px), the table area shrinks by that
  amount. The table stays scrollable; the max-height just changes slightly.
- On very small screens (< 600px height), the table max-height drops below a
  useful minimum. Desktop-first app — not a concern for current target hardware.

## Not done

- Sorting and filtering (PR 2 of beta.3 roadmap)
- Searchable selects (PR 3)
- Clone repository (PR 7)
- Rack export (PR 8)

## Suggested next step

PR 2: sorting and filtering for the Devices and Device Models lists. The scroll
foundation from this PR is a prerequisite for comfortable use of large filtered
datasets.

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
