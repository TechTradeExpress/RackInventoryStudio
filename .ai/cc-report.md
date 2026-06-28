## Summary

PR 9 of beta.3 roadmap. Improved keyboard navigation and ARIA attributes in the existing
`SearchableSelect` component. No new dependencies, no backend changes, no layout changes,
no form logic changes.

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1–8)
- Working: `feature/beta3-searchable-select-keyboard`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/components/ui/SearchableSelect.tsx` | Add keyboard navigation, active-option tracking, improved ARIA, scrollIntoView |
| `apps/desktop/src/components/ui/SearchableSelect.test.tsx` | +23 new tests (keyboard navigation + ARIA describe blocks) |

## Audit — what already worked before this PR

- `aria-haspopup="listbox"` on trigger ✓
- `aria-expanded` on trigger ✓
- `role="listbox"` on dropdown ✓
- `role="option"` on each option ✓
- `aria-selected` for currently selected value ✓
- Escape closes dropdown (capture phase, does not propagate to parent modal) ✓
- Click outside closes ✓
- Click/mousedown selects option ✓
- `disabled` blocks interaction ✓
- Portal rendering ✓
- `data-testid` propagation ✓

## What this PR adds

### Keyboard navigation

| Key | Behaviour |
|---|---|
| `ArrowDown` on closed trigger | Opens dropdown |
| `ArrowDown` when open | Moves active option down; **clamps at last item (no wrap)** |
| `ArrowUp` when open | Moves active option up; **clamps at first item (no wrap)** |
| `Home` | Activates first visible option |
| `End` | Activates last visible option |
| `Enter` | Selects active option, closes dropdown, calls `onChange` |
| `Enter` when no results | No-op — `onChange` not called |
| `Escape` | Unchanged — already handled in capture phase |

No wrapping: decided against circular wrap to match native `<select>` behaviour and to
keep the model predictable. Documented here so reviewers can give feedback if wrap is preferred.

### Active option state

- `activeIdx` state (integer, -1 = no active)
- On open: initialised to the index of the currently selected value; falls back to 0
- On query change (filter): resets to 0 (first visible result) or -1 if no results
- `data-active="true"` on the active option element (testable attribute)
- `ss-active` CSS class on active option (for visual styling)
- `onMouseEnter` syncs `activeIdx` when hovering with mouse (keyboard and mouse stay in sync)

### Scroll active option into view

`useEffect` watching `activeIdx` queries `[data-active='true']` inside the list container
and calls `scrollIntoView?.({ block: "nearest" })` (optional-chained to avoid jsdom error).

### ARIA improvements

| Attribute | Where | Notes |
|---|---|---|
| `id={listboxId}` | listbox `<div>` | Stable ID via `useId()` |
| `id={\`${listboxId}-opt-${o.value}\`}` | each option | Stable option IDs |
| `aria-controls={listboxId}` | trigger (when open) | Points trigger to listbox |
| `aria-controls={listboxId}` | search input | Points input to listbox |
| `aria-activedescendant={activeOptionId}` | search input | Points to keyboard-active option |

`useId()` (React 18+) ensures stable, unique IDs even with multiple instances on the page.

### What was not changed

- No changes to `DeviceFormModal`, `PlacePlacementModal`, or any other caller
- No new props added to `SearchableSelect` public API
- No existing tests modified (only new tests added)
- No CSS variables or layout changes
- No wrapping/circular navigation

## Tests

```
vitest run
  Test Files  46 passed (49 total — 3 pre-existing failures)
      Tests  689 passed (689)   (+23 new vs PR 8 baseline of 666)
```

### New tests (23 in `SearchableSelect.test.tsx`)

**Keyboard navigation (16 new):**
- ArrowDown on closed trigger opens dropdown
- ArrowDown when open moves active option down
- ArrowDown advances index forward through list
- ArrowUp moves active option up
- ArrowDown clamps at last option (no wrap)
- ArrowUp clamps at first option (no wrap)
- Home activates first option
- End activates last option
- Enter selects active option and calls onChange
- Enter closes dropdown after selection
- Enter with no results does not call onChange
- Active option resets to first result after search filter change
- Active option has `data-active='true'` attribute
- Escape closes dropdown without calling onChange
- Escape does not propagate to parent (stopPropagation)
- Opens with currently selected option active

**ARIA (7 new):**
- trigger `aria-haspopup='listbox'`
- trigger `aria-expanded=false` when closed
- trigger `aria-expanded=true` when open
- listbox has `role='listbox'`
- options have `role='option'`
- search input `aria-controls` points to listbox id
- search input `aria-activedescendant` points to active option id

## Checks

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — 4 sources |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `tsc --noEmit` | clean |
| Vitest | 689 pass (46 files) |
| 3 pre-existing failures | Playwright e2e, bump-version.test.mjs, check-capabilities.test.mjs — unrelated to this PR |

Rust checks: skipped — PR is frontend-only, no Tauri/Rust files changed.
Vite build: `pnpm` unavailable in this environment; TS + Vitest confirm correctness.

## Manual smoke

Not available in sandbox (no browser). The following paths should be verified manually:

- **Add/Edit Device → Device Model SearchableSelect**: open, type query, ArrowDown/Up, Enter, Escape (should not close modal)
- **PlacePlacementModal → Device selector**: ArrowDown opens, Enter selects, Escape closes only the dropdown
- **PlacePlacementModal → Rack object selector**: same as above
- Verify `ss-active` class is visible (highlighted option during keyboard navigation)

## Risks / follow-ups

- `aria-activedescendant` is set on the search `<input>`, not on the trigger button.
  Full ARIA combobox pattern (ARIA 1.2) would put it on the combobox input; this is
  consistent with that pattern. Screen readers should announce the active option via this.
- No wrapping on ArrowDown/Up — if wrapping is preferred, change `Math.min`/`Math.max`
  to modulo arithmetic. A follow-up issue can track this.
- `scrollIntoView` is guarded with optional chaining (`?.`) because jsdom does not
  implement it. In the real Tauri WebView, `scrollIntoView` works normally.

## Not done

- Wrapping/circular navigation — out of scope per decision above
- Async search / debouncing — out of scope per requirements
- Multi-select — out of scope
- Auto-fill Device Type after model selection — separate PR per requirements

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
