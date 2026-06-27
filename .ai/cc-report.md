## Summary

PR 4 of beta.3 roadmap. Applied the existing `SearchableSelect` component to the
`PlacePlacementModal` — the two native `<select>` elements for choosing an unplaced
device and a rack-object model have been replaced. The placement flow UX is now
consistent with the Device Model picker added in PR 3. No backend changes, no data
model changes, no new dependencies, no version bump.

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1 scroll + PR 2 search/sort + PR 3 SearchableSelect)
- Working: `feature/beta3-placement-searchable-selects`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/features/racks/PlacePlacementModal.tsx` | Replace device and rack-object `<select>` with `SearchableSelect`; add import |
| `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` | Rewrite all tests that interacted with native `<select>`; add 7 new search tests |

## Select audit — PlacePlacementModal

### Selects found and changed

| Field | Options count | Changed |
|---|---|---|
| Device selector (unplaced devices) | Unbounded | **Yes** |
| Rack object model selector | Unbounded | **Yes** |

### Inline sub-modal selects — NOT changed

| Component | Field | Note |
|---|---|---|
| `DeviceFormModal` (Create new device) | Device type (~6), Status (~7), Device Model | Device Model already SearchableSelect (PR 3) |
| `DeviceModelFormModal` (Create rack object) | Device type (~6) | Small fixed list — native select is fine |

No unbounded selects remain in this modal.

## SearchableSelect in placement flow

### Device selector

- Options from `localDevices` (refreshed after inline creation)
- `label`: `d.name || "Unnamed device"`
- `keywords`: `device_type + status + serial_number + asset_tag + external_ref + device_model_code`
- `meta`: `device_type · status · S/N: xxx · AT: yyy` (non-null fields only)
- `placeholder`: "— select device —"
- `data-testid`: `"device-select"` / `"device-select-trigger"` / `"device-select-search"`
- `onChange`: `setDeviceId(val); setError(null)` — identical semantics to prior native select

### Rack object selector

- Options from `localRackObjects` (refreshed after inline creation)
- `label`: `m.name || "Unnamed model"`
- `keywords`: `vendor + model_number + device_type`
- `meta`: `vendor · model_number · heightU`
- `placeholder`: "— select rack object —"
- `data-testid`: `"rack-object-select"` / `"rack-object-select-trigger"` / `"rack-object-select-search"`
- `onChange`: `setDeviceModelId(val); setError(null)`

### Inline flows preserved

After inline device/rack-object creation, the new item is preselected in the SearchableSelect
trigger automatically (component reads `value` prop; `setDeviceId` / `setDeviceModelId` is
called with the new ID, which is in the refreshed options list).

## Tests

```
vitest run src/
  Test Files  45 passed (45)
      Tests  611 passed (611)   (+7 new vs PR 3 baseline of 604)
```

### New tests (7)

- Device search: by name, by serial number, case-insensitive, no-results
- Rack object search: by name, by vendor, no-results

### Existing tests updated (18)

All tests that used `fireEvent.change` on a native select or read `.value as HTMLSelectElement`
were converted to use `selectDevice(label)` / `selectRackObject(label)` helpers and
`trigger.textContent` / `trigger.querySelector(".ss-placeholder")` assertions.

Module-level helper pair `selectDevice` / `selectRackObject` queries
`.ss-dropdown .ss-option` via `document.querySelectorAll` to avoid false-positive
text matches between the trigger button and dropdown options.

## Checks

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — 4 sources |
| `node --test scripts/*.test.mjs` | 19 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `node scripts/smoke-beta-gate.mjs` | automated layer PASS |
| `tsc --noEmit` | clean |
| Vitest | 611 pass (45 files) |

Rust checks: skipped — PR is frontend-only.
Vite build: `pnpm` unavailable in this environment; TS + Vitest confirm correctness.

## Risks

- DnD preselection (`initialTargetId`) relies on the SearchableSelect finding the matching
  option in `localDevices`/`localRackObjects`. If a DnD-dropped ID is not in the local list,
  the trigger shows the placeholder — same behavior as the prior native select for unknown values.
- Escape key in SearchableSelect uses capture-phase listener, closing only the dropdown
  while keeping the placement modal open. Verified in `SearchableSelect.test.tsx`.

## Not done

- Device type selects (~6 options) in DeviceFormModal / DeviceModelFormModal — native select fine
- Status select (~7 options) in DeviceFormModal — native select fine
- Git remote selector in RepositoryPanel (1–2 options) — native select fine
- Keyboard navigation (arrow-up/down) in SearchableSelect — accessibility follow-up

## Suggested next step

PR 5: Contextual Rack Object inline form with pre-locked `device_type = rack_object`
(removes the type select from the inline creation flow in PlacePlacementModal).

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
