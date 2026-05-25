# Milestone E — Create devices from Place equipment flow

## Summary

Users can now create a new device directly from the "Place equipment" modal without leaving the placement workflow. Clicking "Create new device…" opens `DeviceFormModal` as a layered modal; after the device is saved, the Place equipment modal returns with the new device preselected and all position fields (Start U, side, height) preserved. The newly created device is immediately available for placement.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/features/devices/DeviceFormModal.tsx` | Added `useBusy` integration; changed `onSaved` signature to `(newDeviceId?: string) => void`; passes new device ID in add mode, no arg in edit mode. |
| `apps/desktop/src/features/racks/PlacePlacementModal.tsx` | Added inline device creation: `localDevices` state, `createDeviceOpen` state, `handleOpenCreateDevice`, `handleDeviceSaved`; "Create new device…" button; layered `DeviceFormModal`; `onClose` blocked while device form is open. |
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Added `onDeviceCreated` callback on `PlacePlacementModal` to bump `targetReloadToken` when a device is created inline. |
| `apps/desktop/src/features/devices/DeviceFormModal.test.tsx` | Added `useBusy` mock; updated `onSaved` assertion in add-mode test; updated edit-mode test name and assertion. |
| `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` | Expanded mock to include `addDevice`, `listDevices`, `listDeviceModels`; added 7 tests for the create-device flow. |
| `apps/desktop/e2e/mocks/tauri-core.ts` | Exported `FIXTURE_NEW_DEVICE_ID`; added mutable `dynamicDevices` and `dynamicRackDetail` state; added `add_device_cmd` handler; updated `place_device` to mutate `dynamicRackDetail.front`; routed `list_devices` and `get_rack_detail` to dynamic state. |
| `apps/desktop/e2e/smoke.spec.ts` | Added `FIXTURE_NEW_PLACEMENT_ID` constant; added E2E test: full create-and-place flow. |
| `CHANGELOG.md` | Added Milestone E unreleased entry. |
| `docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md` | Added status line to Milestone E section. |

## Tests

```
# Unit tests (vitest)
node ./node_modules/.bin/vitest run
→ 388 passed (32 test files)

# Type check
node ./node_modules/.bin/tsc --noEmit
→ clean

# Vite build
node ./node_modules/.bin/vite build
→ built in 1.70s, no errors

# Playwright E2E
node ./node_modules/.bin/playwright test
→ 16 passed (22.8s) — includes new E2E test

# Rust checks
cargo fmt --all --check → clean
cargo check --workspace → Finished dev profile
cargo test --workspace → 0 failed
cargo clippy --workspace -- -D warnings → clean
```

## Manual QA checklist

- [ ] Open rack detail → click empty U slot → Place equipment modal opens with startU prefilled
- [ ] In Device mode, "Create new device…" button is visible
- [ ] Clicking "Create new device…" opens Add device form on top of place modal
- [ ] Place equipment modal is visually underneath (not interactive)
- [ ] Escape key closes the device form, not the place modal
- [ ] Cancel on device form returns to place modal unchanged
- [ ] X button on place modal is disabled while device form is open
- [ ] Cancel button on place modal is disabled while device form is open
- [ ] Incomplete device form (missing required fields) → Create device button disabled
- [ ] Invalid code format → validation message shown
- [ ] Valid device form → Create device enabled, click creates device
- [ ] After creation: device form closes, place modal visible, new device preselected in selector
- [ ] Start U value preserved after device creation
- [ ] Side (front/rear) preserved after device creation
- [ ] Height U override preserved (if entered before opening device form)
- [ ] Place button enabled immediately after device creation (no extra click needed)
- [ ] Click Place → placement appears in rack diagram
- [ ] New device appears in Placeable equipment palette for other racks
- [ ] In Rack Object mode, "Create new device…" button is NOT shown
- [ ] Global busy overlay ("Creating device…") appears during device creation
- [ ] No placement table appears anywhere in rack detail

## Risks

- The layered modal approach (two `createPortal` backdrops) depends on CSS stacking. Tested in Firefox (E2E). No issues observed but other browsers may behave differently.
- `dynamicDevices` and `dynamicRackDetail` are module-level in the E2E mock; Playwright's per-test page isolation resets them correctly. If tests ever run in a shared browser context, state could leak between tests.

## Not done

- No visual "stacked modal" indicator to make the layering obvious to the user (considered unnecessary for beta).
- Keyboard focus is not explicitly trapped in the upper device form modal (underlying `Modal` component handles Escape; full focus-trap is a future accessibility enhancement).

## Suggested next step

Milestone F — Release branch and versioning process: define `release/vX.Y.Z` branch strategy, version bump rules, and installer artifact CI configuration before the first official beta tag.
