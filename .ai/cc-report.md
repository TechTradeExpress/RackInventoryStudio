## Summary

PR 8 of beta.3 roadmap. Added front/rear rack side view toggle with proper test IDs.

The front/rear toggle was already functionally implemented in `RackDetailPanel` (using the
existing `Segmented` component with `activeSide` state). PR 8 adds:
1. `testId` prop to `Segmented` container (data-testid on the outer div)
2. `testId` prop to each `SegmentedOption` (data-testid on each button)
3. Passes `testId="rack-side-toggle"` and per-option testIds `rack-side-front` / `rack-side-rear`
   from `RackDetailPanel`
4. 8 new tests for the side toggle in `RackDetailPanel.test.tsx`

No backend changes. No data migration. No DTO changes. No fake filtering.

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1–7)
- Working: `feature/beta3-rack-side-view`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/components/ui/Segmented.tsx` | Add `testId?: string` to `SegmentedProps`; add `testId?: string` to `SegmentedOption`; wire both to `data-testid` attributes |
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Pass `testId="rack-side-toggle"` and per-option testIds `rack-side-front` / `rack-side-rear` to Segmented |
| `apps/desktop/src/features/racks/RackDetailPanel.test.tsx` | Add `REAR_PLACEMENT` + `DETAIL_BOTH_SIDES` fixtures; add 8-test "front/rear side toggle" describe block |

## Rack side view — existing implementation (audit findings)

`RackDetailPanel` already had:
- `const [activeSide, setActiveSide] = useState<"front" | "rear">("front");`
- `handleSideChange(side)` — sets `activeSide`, clears `selectedPlacement`
- `Segmented` component in `PageHeader` wired to `activeSide`
- `RackDetailDto.front[]` and `RackDetailDto.rear[]` as separate placement arrays
- `RackUnitDiagram` accepting `side`, `front`, `rear` and filtering: `const activePlacements = side === "front" ? front : rear;`

The filtering is real data (separate backend arrays) — no fake filtering was added.

## Test IDs added

| testId | Element |
|---|---|
| `rack-side-toggle` | `<div class="seg">` outer container |
| `rack-side-front` | Front button |
| `rack-side-rear` | Rear button |

## Tests

```
vitest run
  Test Files  46 passed (49 total — 3 pre-existing failures: Playwright spec, 2 script stubs)
      Tests  666 passed (666)   (+9 new vs PR 7 baseline of 657)
```

### New tests (8 in `RackDetailPanel.test.tsx`)

- `rack-side-toggle`, `rack-side-front`, `rack-side-rear` test IDs are present
- Defaults to front side — Front button is aria-selected=true
- Front placement visible, rear placement hidden on load
- Clicking Rear shows rear placements, hides front placements
- Switching back to Front restores front placements
- Rear button becomes aria-selected after clicking
- Selecting placement then switching side deselects it (inspector shows "Select a placement in the diagram")
- Toggle renders correctly when both sides are empty
- Front-only placement does not appear when Rear is selected

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| Vitest | 666 pass (46 files) |
| 3 pre-existing failures | Playwright e2e, bump-version.test.mjs, check-capabilities.test.mjs — unrelated to this PR |

Rust checks: skipped — PR is frontend-only.
Vite build: `pnpm` unavailable in this environment; TS + Vitest confirm correctness.

## Risks

- `Segmented` component now exposes `testId` and `testId` per-option. Both are optional;
  all existing callers of `Segmented` that don't pass testId are unaffected.
- Front/rear filtering is implemented in `RackUnitDiagram` by switching which placement
  array is rendered. No backend query filtering was changed or needed.

## Not done

- Persisting last-used side in localStorage — out of scope per requirements
- Guessing side from device name/type/position — explicitly forbidden
- Backend changes — audit confirmed field already exists as separate arrays in `RackDetailDto`
- Data migration — not needed
- Export or clone side — not requested

## Suggested next step

PR 9: SearchableSelect keyboard navigation improvements, or any remaining beta.3 roadmap items.

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
