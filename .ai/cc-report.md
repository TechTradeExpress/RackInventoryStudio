## Summary

PR 6 of beta.3 roadmap. Added a global Planning / On-site work mode toggle to the
application titlebar. The active mode sets the default device status for any newly
created device — "planned" in Planning mode, "installed" in On-site mode. Users can
always override the status manually in the form. Edit flows are unaffected; the
mode only influences the initial value when adding a new device. No backend changes,
no DTO changes, no new dependencies, no version bump.

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1–5)
- Working: `feature/beta3-work-mode-toggle`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/lib/workMode.tsx` | New: `WorkMode` type, `WorkModeProvider`, `useWorkMode()` hook, `WORK_MODE_DEFAULT_STATUS` map |
| `apps/desktop/src/lib/workMode.test.tsx` | New: 11 tests for the hook |
| `apps/desktop/src/main.tsx` | Wrap app with `<WorkModeProvider>` |
| `apps/desktop/src/App.tsx` | Import `useWorkMode`, add Planning / On-site toggle to titlebar |
| `apps/desktop/src/features/devices/DeviceFormModal.tsx` | Add `defaultStatus?: string` prop; use in add-mode init; update `isDirty` baseline |
| `apps/desktop/src/features/devices/DevicesPanel.tsx` | Call `useWorkMode()`, derive `defaultDeviceStatus`, pass to `DeviceFormModal` |
| `apps/desktop/src/features/racks/PlacePlacementModal.tsx` | Add `defaultDeviceStatus?: string` prop; pass to inline create-device `DeviceFormModal` |
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Call `useWorkMode()`, pass `defaultDeviceStatus` to `PlacePlacementModal` |
| `apps/desktop/src/features/devices/DeviceFormModal.test.tsx` | Add 5 tests for `defaultStatus` prop |
| `apps/desktop/src/features/devices/DevicesPanel.test.tsx` | Mock `useWorkMode`; add 3 work-mode integration tests |
| `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` | Add 2 tests for `defaultDeviceStatus` prop |

## Work mode state

- **Type**: `"planning" | "on-site"`
- **Default**: `"planning"`
- **Storage**: `localStorage` with key `"ris.workMode"`. Unknown or missing value falls back to `"planning"`. localStorage errors (security restrictions, private mode) are silently caught — mode stays in React state.
- **Provider**: `WorkModeProvider` wraps the whole app in `main.tsx`. `useWorkMode()` returns a safe no-op fallback when called outside the provider (tests that don't wrap with a provider continue to work).
- **Status mapping**: `WORK_MODE_DEFAULT_STATUS = { planning: "planned", "on-site": "installed" }`
- **Not persisted to repository**: mode is local UI preference only; does not touch any YAML/git data.

## UI switch

The work mode toggle lives in `App.tsx` inside the `.titlebar` div, placed in the
third (auto) grid column so it appears on the right side of the title bar. It uses
the existing `.seg` / `.seg-btn` CSS classes (same as the `Segmented` component).

```
[ Mode ]  [ Planning ]  [ On-site ]
```

- `data-testid="work-mode-toggle"` — wrapper div
- `data-testid="work-mode-planning"` — Planning button
- `data-testid="work-mode-onsite"` — On-site button
- Both buttons carry `aria-pressed` for accessibility

## Work mode → device status mapping

| Mode | Default status for new device |
|---|---|
| Planning | `planned` |
| On-site | `installed` |

## Device creation flows covered

| Flow | Component | How |
|---|---|---|
| Add Device (Devices tab) | `DevicesPanel` → `DeviceFormModal` | `DevicesPanel` reads `useWorkMode()`, passes `defaultStatus` only in add mode |
| Inline Create Device (Placement modal) | `PlacePlacementModal` → `DeviceFormModal` | `RackDetailPanel` reads `useWorkMode()`, passes `defaultDeviceStatus`; `PlacePlacementModal` forwards it |

## Edit mode behaviour

`DeviceFormModal` ignores `defaultStatus` in edit mode — the form is always
initialised from `deviceToForm(editing)`. The `isDirty` baseline for add mode
uses `defaultStatus ?? "planned"` so backdrop-close is not prematurely blocked
when the form opens with a non-"planned" status.

## Flows not covered (intentional)

- **CSV import** — sets status from the CSV file; work mode is irrelevant
- **Edit Device from inspector** (`RackDetailPanel` → `DeviceFormModal` with `editing=...`) — always edit mode, `defaultStatus` not passed
- **Device Model / Rack Object forms** — not devices, have no `status` field

## Tests

```
vitest run src/
  Test Files  46 passed (46)
      Tests  637 passed (637)   (+21 new vs PR 5 baseline of 616)
```

### New tests (21 total)

**`workMode.test.tsx` (11 new)**
- Defaults to "planning" when localStorage is empty
- Switching to "on-site" updates mode
- Switching back to "planning" updates mode
- Persists mode to localStorage on change
- Reads persisted "on-site" / "planning" from localStorage on mount
- Falls back to "planning" for unknown localStorage value
- Returns "planning" fallback outside provider
- setMode is a no-op outside provider
- `WORK_MODE_DEFAULT_STATUS` mappings

**`DeviceFormModal.test.tsx` (5 new)**
- Without `defaultStatus`, status defaults to "planned"
- With `defaultStatus="installed"`, status defaults to "installed"
- Edit mode ignores `defaultStatus` and uses device's own status
- User can manually change status regardless of `defaultStatus`
- `defaultStatus="installed"` is sent in the payload on save

**`DevicesPanel.test.tsx` (3 new)**
- Add Device in planning mode opens form with "planned" status
- Add Device in on-site mode opens form with "installed" status
- Edit Device ignores work mode and uses device's own status

**`PlacePlacementModal.test.tsx` (2 new)**
- Inline Create Device inherits `defaultDeviceStatus="installed"`
- Inline Create Device defaults to "planned" when `defaultDeviceStatus` is not set

## Checks

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — 4 sources |
| `node --test scripts/*.test.mjs` | 19 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `tsc --noEmit` | clean |
| Vitest | 637 pass (46 files) |

Rust checks: skipped — PR is frontend-only.
Vite build: `pnpm` unavailable in this environment; TS + Vitest confirm correctness.

## Risks

- The titlebar currently places the repo-pill in grid column 1 (the rail-width slot) with no brand element present. The mode toggle is placed in column 3 (auto). The visual result is correct but the middle column (1fr) is empty. If a brand/logo is added in the future, layout adjusts naturally.
- `localStorage` is used for persistence. Clearing browser storage resets mode to "planning". This is intentional — the mode is a UI convenience, not critical state.

## Not done

- Work mode indicator in the rail sidebar (requested scope was top bar only)
- Bulk "mark planned as installed" or plan approval — out of scope per requirements
- CSV import status override — out of scope

## Suggested next step

PR 7: Segmented Rack Side view (Front/Rear in the rack unit diagram) or further
accessibility improvements (keyboard nav in SearchableSelect).

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
