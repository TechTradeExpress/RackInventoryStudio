## Summary

PR 10 of beta.3 roadmap. Auto-fill `device_type` from a selected Device Model when the
user has not manually chosen a type. Controlled by a `deviceTypeTouched` flag that is
`false` in add/create-similar mode and `true` in edit mode (or after the user explicitly
changes the type select).

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1–9)
- Working: `feature/beta3-device-type-autofill`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/features/devices/DeviceFormModal.tsx` | Add `deviceTypeTouched` state, `setDeviceTypeTouched(true)` in `set()` for deviceType changes, `setDeviceTypeTouched(editing !== null)` in useEffect, new `handleModelChange()` function, wire `onChange={handleModelChange}` on the Device Model SearchableSelect |
| `apps/desktop/src/features/devices/DeviceFormModal.test.tsx` | +8 new tests: 7 in new "device type auto-fill from model" describe block, 1 in edit mode block |

## Behaviour

- **Add mode / create-similar mode**: `deviceTypeTouched = false` on open. Selecting a
  Device Model calls `handleModelChange` which reads the model's `device_type` and sets
  `form.deviceType` when `deviceTypeTouched` is false and a model was selected (non-empty value).
- **Edit mode**: `deviceTypeTouched = true` on open (existing type is intentional). Picking
  a different model does not override the type.
- **Manual type change**: Any interaction with the Device Type select sets
  `deviceTypeTouched = true`, locking future model selections from auto-filling the type.
- **Clear model**: Selecting `— none —` passes `val = ""` to `handleModelChange`; the
  `if (!deviceTypeTouched && val)` guard skips auto-fill, so the type is preserved.

## Tests

```
vitest run
  Test Files  46 passed (46)
      Tests  697 passed (697)   (+8 new vs PR 9 baseline of 689)
```

### New tests (8)

**In "DeviceFormModal — edit mode" describe block (1 new):**
- edit mode: changing model does not auto-fill device type (deviceTypeTouched=true on open)

**In "DeviceFormModal — device type auto-fill from model" describe block (7 new):**
- add mode: selecting a model with no device type auto-fills the type
- add mode: selecting a network model auto-fills type to network
- add mode: manual device type change blocks subsequent model auto-fill
- add mode: clearing the model does not clear an auto-filled device type
- edit mode: opening modal initialises type from device, not from model auto-fill
- add mode: auto-filled device type is sent correctly in the save payload
- prefill with deviceModelId: type stays empty on open; re-picking model auto-fills type

## Checks

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — 4 sources |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `tsc --noEmit` | clean |
| Vitest | 697 pass (46 files) |

Rust checks: skipped — PR is frontend-only, no Tauri/Rust files changed.
Vite build: `pnpm` unavailable in this environment; TS + Vitest confirm correctness.

## Manual smoke

Not available in sandbox (no browser). The following paths should be verified manually:

- **Add Device modal**: open, leave Device Type empty, pick a Device Model → type should
  auto-fill to the model's type; confirm the model filter also updates.
- **Add Device modal**: manually set Device Type first, then pick a model → type must NOT
  change (lock is in effect).
- **Edit Device modal**: open an existing device, pick a different same-type model → type
  must not change (edit mode always has lock set).
- **Create similar**: open with prefill containing a model → type field starts empty;
  re-picking the model sets the type.

## Risks

- `deviceTypeTouched` is a closure-captured state variable in `handleModelChange`. Because
  `handleModelChange` is redefined each render it reads the correct value. No stale closure
  risk.
- If a model's `device_type` is absent or unrecognised by the backend, the auto-filled type
  might fail validation. The `DEVICE_TYPES` constant is still the source of truth for the
  select options; any model type not in that list will be auto-filled but the select will
  show an unmatched value (no visible option selected). This is a pre-existing concern with
  model data quality, not introduced by this PR.

## Not done

- Auto-fill when the same model is set via prefill (only triggers on explicit user
  interaction, not on initial form mount). Intentionally left this way to keep behaviour
  predictable — prefill already supports `deviceType`.
- Wrapping/circular navigation in SearchableSelect — out of scope.
- Any backend changes — none required.

## Suggested next step

PR 11 of the beta.3 roadmap (confirm with product what the next item is; likely a UX
polish or additional field in DeviceFormModal or RackDetailPanel based on beta.2 feedback).

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
