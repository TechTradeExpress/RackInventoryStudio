## Summary

PR 7 of beta.3 roadmap. Added "Create similar" actions for Device Models and Devices.
Clicking the action opens the standard add-mode form with fields pre-filled from the
source record — the user must still fill in required gaps and press Save. Nothing is
saved automatically. No backend changes, no DTO changes, no new dependencies, no
version bump.

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1–6)
- Working: `feature/beta3-create-similar`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/components/ui/Icon.tsx` | Add `IcCopy` icon (two overlapping rects, Feather-style) |
| `apps/desktop/src/features/deviceModels/DeviceModelFormModal.tsx` | Export `DeviceModelPrefill` type; add `prefill?` prop; change `isDirty` to compare against full initial state stored in `initialFormRef`; init form from prefill in add mode |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` | Import `IcCopy`, `joinTags`, `DeviceModelPrefill`; add `prefillModel` state; add `openSimilar()`; add Create similar button per row; pass `prefill` to modal |
| `apps/desktop/src/features/devices/DeviceFormModal.tsx` | Export `DevicePrefill` type; add `prefill?` prop; change `isDirty` to compare against full initial state in `initialFormRef`; init form from prefill in add mode (prefill.status overrides defaultStatus) |
| `apps/desktop/src/features/devices/DevicesPanel.tsx` | Import `IcCopy`, `joinTags`, `DevicePrefill`; add `prefillDevice` state; add `openSimilar()`; add Create similar button per row; pass `prefill` to modal |
| `apps/desktop/src/features/deviceModels/DeviceModelFormModal.test.tsx` | Add 5 tests for prefill prop |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.test.tsx` | Add `addDeviceModel` mock; add 4 Create similar integration tests |
| `apps/desktop/src/features/devices/DeviceFormModal.test.tsx` | Add 7 tests for prefill prop |
| `apps/desktop/src/features/devices/DevicesPanel.test.tsx` | Add 4 Create similar integration tests |

## Create similar — Device Models

Button with `IcCopy` icon placed before Edit/Delete in each model row.
`aria-label="Create similar to <model name>"`.

Opens `DeviceModelFormModal` in add mode with `prefill` set.

### Fields copied from source model

| Field | Copied | Notes |
|---|---|---|
| `device_type` | ✓ | |
| `name` | ✓ (modified) | Set to `"Copy of <name>"` |
| `vendor` | ✓ | |
| `model_number` | ✓ | Vendor SKU — not unique per instance |
| `default_height_u` | ✓ | |
| `description` | ✓ | |
| `tags` | ✓ | |
| `id` | ✗ | Never copied |
| `code` | ✗ | Never copied — backend generates new code |

## Create similar — Devices

Button with `IcCopy` icon placed before Edit/Delete in each device row.
`aria-label="Create similar to <device name>"`.

Opens `DeviceFormModal` in add mode with `prefill` set.

### Fields copied from source device

| Field | Copied | Notes |
|---|---|---|
| `device_type` | ✓ | |
| `name` | ✓ (modified) | Set to `"Copy of <name>"` |
| `status` | ✓ | Source device's status (see work mode note below) |
| `device_model_id` | ✓ | |
| `description` | ✓ | |
| `tags` | ✓ | |
| `id` | ✗ | Never copied |
| `code` | ✗ | Never copied |
| `serial_number` | ✗ | Unique hardware identifier |
| `asset_tag` | ✗ | Unique organizational identifier |
| `external_ref` | ✗ | External system ID (CMDB, etc.) |
| `is_placed` | ✗ | New device is always unplaced |
| placement | ✗ | No rack position copied |

## Work mode and Create similar status

For regular "Add Device", `defaultStatus` from the active work mode (planning → "planned",
on-site → "installed") is used.

For "Create similar", `prefill.status` (source device's status) takes priority over
`defaultStatus` because the form initializer spreads prefill last:
`{ ...EMPTY, status: defaultStatus, ...prefill }`. This is intentional — "Create similar"
means the new device will likely have the same operational state as the original.

## Dirty baseline for prefill (backdrop close guard)

`isDirty` previously compared the form against hardcoded empty strings.
With prefill, the initial state differs from empty. The fix: both modals now store the
full initial `FormState` in `initialFormRef.current` (set in the `useEffect` when `open`
transitions to true) and compare against that ref. This means opening a form via Create
similar does not immediately trigger the dirty guard — the form is only dirty when the
user actually changes a field beyond the pre-filled values.

## Tests

```
vitest run src/
  Test Files  46 passed (46)
      Tests  657 passed (657)   (+20 new vs PR 6 baseline of 637)
```

### New tests (20 total)

**`DeviceModelFormModal.test.tsx` (5 new)**
- prefill shows prefilled name and height
- prefill shows vendor and model SKU
- edit mode ignores prefill
- opening with prefill is not immediately dirty
- prefill payload included in create call (no id/code)

**`DeviceModelsPanel.test.tsx` (4 new)**
- Create similar opens modal with "Copy of ..."
- Create similar prefills device type and height
- Create similar save calls addDeviceModel without id/code
- Edit model still works after Create similar was used

**`DeviceFormModal.test.tsx` (7 new)**
- prefill shows name, type, status
- prefill status overrides defaultStatus
- serial and asset tag are empty with prefill
- edit mode ignores prefill
- opening with prefill is not immediately dirty
- prefill sent to addDevice (no id/code/serial/asset)
- without prefill, defaultStatus still works

**`DevicesPanel.test.tsx` (4 new)**
- Create similar opens modal with "Copy of ..."
- Create similar copies source device's status
- Serial and asset tag are empty
- Regular Add Device still respects work mode after Create similar was used

## Checks

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — 4 sources |
| `node --test scripts/*.test.mjs` | 19 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `tsc --noEmit` | clean |
| Vitest | 657 pass (46 files) |

Rust checks: skipped — PR is frontend-only.
Vite build: `pnpm` unavailable in this environment; TS + Vitest confirm correctness.

## Risks

- `model_number` (vendor SKU) is copied because it represents the manufacturer's model
  identifier shared by all instances of the same hardware. If a future backend validation
  enforces uniqueness on `model_number`, the user will get a backend error on save —
  acceptable UX for this feature.
- `name` collision: if a "Copy of X" already exists in the repo, the backend may reject
  with a name-conflict error. Automatic de-duplication ("Copy 2", "Copy 3") is out of
  scope per requirements.
- `external_ref` intentionally not copied — it is treated as an external system ID
  (CMDB, ticket, URL) unique to each physical device.

## Not done

- Bulk duplicate (multiple records at once) — out of scope
- Auto-save of the copy — intentionally not done; user must press Save
- Rack placement copy — out of scope
- Automatic name conflict resolution ("Copy 2", "Copy 3") — out of scope
- Create similar from inline Placement flow — not requested

## Suggested next step

PR 8: Segmented Rack Side view (Front/Rear in the rack unit diagram) or keyboard
navigation improvements in SearchableSelect.

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
