## Summary

PR 5 of beta.3 roadmap. `DeviceModelFormModal` gained two optional props —
`forcedDeviceType` and `lockDeviceType` — that enable a contextual add mode
where the device type is pre-set and hidden from the user. `PlacePlacementModal`
uses this new mode when opening the inline "Create rack object" form: the modal
title is "Create rack object", the device-type select is replaced by a read-only
display, and the save payload is guaranteed to carry `device_type: "rack_object"`.
No backend changes, no DTO changes, no new dependencies, no version bump.

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1–4)
- Working: `feature/beta3-contextual-rack-object-form`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx` | Add `forcedDeviceType?` and `lockDeviceType?` props; conditional type field; contextual title/submit label; `isDirty` accounts for initial forced type |
| `apps/desktop/src/features/deviceModels/DeviceModelFormModal.test.tsx` | Add 4 new tests for locked rack object mode |
| `apps/desktop/src/features/racks/PlacePlacementModal.tsx` | Pass `forcedDeviceType="rack_object" lockDeviceType` to inline create rack object modal |
| `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` | Update 4 tests that referenced old "Add device model" title/button; adjust form interaction (type no longer needs to be set manually); add 2 new tests for type lock and contextual title |

## Problem

Previously, "Create new rack object…" in `PlacePlacementModal` opened the generic
`DeviceModelFormModal` with the title "Add device model" and a fully editable
device-type selector. Users could accidentally submit a non-`rack_object` type,
which is semantically wrong in the rack placement context.

## New contextual / locked mode

`DeviceModelFormModal` now accepts:

- `forcedDeviceType?: string` — initialises `form.deviceType` to this value on
  open (add mode only). `isDirty` uses this as the baseline so backdrop-close
  is not prematurely locked.
- `lockDeviceType?: boolean` — when `true`, replaces the `<select>` with a
  read-only `<div data-testid="field-device-type-locked">`. The type value lives
  in React state (not the DOM), so the payload is never affected by the locked
  display.

When `lockDeviceType && !editing && forcedDeviceType === "rack_object"`:

- Modal title → "Create rack object"
- Submit label → "Create rack object" / "Creating…"
- Device type select → hidden; locked display shows "rack_object"
- Info paragraph "Rack objects can be placed directly…" is always visible

All other form fields (name, vendor, model number, height, description, tags)
remain fully editable.

## Integration in PlacePlacementModal

The inline create rack object `DeviceModelFormModal` call now passes
`forcedDeviceType="rack_object" lockDeviceType`. The edit rack object modal
(opened from "Edit rack object…") is unchanged — it still uses the standard
edit mode with full type visibility.

## Tests

```
vitest run src/
  Test Files  45 passed (45)
      Tests  616 passed (616)   (+5 new vs PR 4 baseline of 611)
```

### New tests (5 total)

**DeviceModelFormModal — locked rack object mode (4)**

- shows "Create rack object" as title and submit label
- hides device type select and shows locked type display
- payload contains `device_type: "rack_object"` on valid submit
- normal add mode still shows editable device type select (regression guard)

**PlacePlacementModal (net +2 from 4 updated, 2 renamed)**

- "clicking 'Create new rack object…' opens the form with contextual title"
- "rack object creation form locks device type to rack_object"
- "canceling rack object creation form returns to unchanged Place equipment modal" (updated)
- "successful rack object creation sends rack_object type and preselects new model" (updated)

### Existing tests updated (4)

Tests that referenced "Add device model" title and "Create model" button were
updated to match the new contextual title/button. The creation test no longer
manually fires a change on `field-device-type` (which no longer exists in locked
mode); it directly fills name + height and clicks the button by role.

## Checks

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — 4 sources |
| `node --test scripts/*.test.mjs` | 19 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `tsc --noEmit` | clean |
| Vitest | 616 pass (45 files) |

Rust checks: skipped — PR is frontend-only.
Vite build: `pnpm` unavailable in this environment; TS + Vitest confirm correctness.

## Risks

- `forcedDeviceType` is typed as `string`, not as the `DeviceType` union, to avoid
  importing an extra type. The caller is responsible for passing a valid value.
  In practice only `"rack_object"` is ever passed.
- The locked display (`<div>`) uses `pointerEvents: none` + `userSelect: none`
  but is not `aria-disabled`. This is acceptable for an informational display;
  the form context makes the restriction obvious.

## Not done

- Edit mode with locked type — not needed; rack object edits from placement modal
  use the standard edit form where type is already fixed and read-only by design.
- Keyboard navigation (arrow-up/down) in SearchableSelect — accessibility follow-up.

## Suggested next step

PR 6: Planning / On-site mode toggle — or — extract a shared `LockedField`
component if more "readonly display" patterns emerge.

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
