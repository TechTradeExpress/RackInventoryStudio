## Summary

PR 2 of beta.3 roadmap. Added client-side search, sorting and a filter-aware
counter to the Devices and Device Models list views. Builds on the `.tbl-wrap`
scroll foundation from PR 1. No backend changes, no data model changes, no new
dependencies, no version bump.

**Repair (post-review):** Fixed ineffective sort-direction test, changed
sortable header cursor from `default` to `pointer`, committed previously
unstaged `cc-report.md`.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/lib/listHelpers.ts` | New shared helpers: `matchesSearch`, `cmpStr`, `cmpNum`, `toggleDir`, `SortDir` |
| `apps/desktop/src/app.css` | Sort header + panel search bar styles; `cursor: pointer` on `.tbl-th-sort` |
| `apps/desktop/src/features/devices/DevicesPanel.tsx` | Search input, sort by Name/Type/Status/Placed, updated counter |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` | Search input, sort by Name/Type/Vendor/SKU/Height, updated counter |
| `apps/desktop/src/features/devices/DevicesPanel.test.tsx` | +8 tests (search 6, sort 2); sort-desc test now verifies actual row order |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.test.tsx` | +7 tests (search 5, sort 2) |

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1 scroll foundation)
- Working: `feature/beta3-list-search-sort-filter`

## Devices list — search, sort, filter

**Search:**
- Input inside the panel body above the table (`.panel-filter` bar)
- Searches: `name`, `device_type`, `status`, `serial_number`, `asset_tag`,
  `external_ref`, and resolved model name
- Case-insensitive, trims whitespace, safe on null/undefined
- Works together with existing tab filter (All / Placed / Unplaced / Installed / Unknown)
- Counter: "5 of 53" when search is active
- Empty state distinguishes "no devices yet" from "no match"

**Sort:**
- Sortable columns: Name, Type, Status, Placed — `cursor: pointer`
- Click header → asc; click again → desc; ↑/↓ indicator on active column
- Default: Name ascending

**Filter pipeline:** tab filter → search → sort

## Device Models list — search, sort

**Search:** searches `name`, `device_type`, `vendor`, `model_number`
**Title:** "40 models" → "8 of 40 models" when searching
**Sort:** Name, Type, Vendor, SKU, Height (numeric via `cmpNum`)

## Shared pattern

`listHelpers.ts`: `matchesSearch`, `cmpStr`, `cmpNum`, `toggleDir`, `SortDir`
CSS: `.tbl-th-sort` (pointer, hover), `.sort-ic`, `.panel-filter`, `.pf-input-wrap`

## Tests

```
vitest run (src/ — excludes pre-existing e2e/scripts issues)
  Test Files  44 passed (44)
      Tests  584 passed (584)   (+15 new vs PR 1 baseline)
```

Post-repair: sort-desc test verifies actual row text order (Zebra before Alpha),
plus round-trip back to asc. Previously the test only checked `toBeDefined()`.

TypeScript: no errors. Rust checks: skipped (frontend-only). Vite build: `pnpm`
not available in this environment; TS + Vitest confirm correctness.

## Repair checklist

- [x] `cursor: pointer` on `.tbl-th-sort` (was `cursor: default`)
- [x] Sort-desc test now asserts actual row order, not just `toBeDefined()`
- [x] `.ai/cc-report.md` committed — working tree clean
- [x] No review-context files committed

## Risks

- Client-side search/sort is fine for typical inventories. Very large datasets
  (thousands) may need debounced search in a future PR.

## Not done

- Sortable Locations and Racks lists (lower priority)
- Searchable selects / comboboxes (PR 3 of roadmap)

## Suggested next step

PR 3: Searchable selects / comboboxes for model selection in Add/Edit Device.

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
