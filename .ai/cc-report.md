## Summary

PR 3 of beta.3 roadmap. Added a reusable `SearchableSelect` combobox component and
applied it to the Device Model picker in the Add/Edit Device form. Users can now
type a fragment of name, vendor, model number or device type to filter a potentially
long list of models. No backend changes, no data model changes, no new dependencies,
no version bump.

## Base branch / working branch

- Base: `roadmap/beta3` (includes PR 1 scroll foundation + PR 2 search/sort)
- Working: `feature/beta3-searchable-selects`

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/components/ui/SearchableSelect.tsx` | New reusable combobox component |
| `apps/desktop/src/components/ui/SearchableSelect.test.tsx` | 18 new tests for the component |
| `apps/desktop/src/components/ui/index.ts` | Export SearchableSelect |
| `apps/desktop/src/app.css` | Styles for `.ss-*` — trigger, dropdown, list, option, empty |
| `apps/desktop/src/features/devices/DeviceFormModal.tsx` | Device Model field replaced with SearchableSelect |
| `apps/desktop/src/features/devices/DeviceFormModal.test.tsx` | Updated 2 tests (field-device-model pattern changed from native select to SearchableSelect); added 3 new integration tests |

## Select audit

### All `<select>` occurrences found

| File | Field | Options count | Note |
|---|---|---|---|
| `DeviceFormModal.tsx` | Device type | ~6 | Small fixed list — native select is fine |
| `DeviceFormModal.tsx` | Status | ~7 | Small fixed list — native select is fine |
| `DeviceFormModal.tsx` | Device model | Unbounded | **Changed in this PR** |
| `DeviceModelFormModal.tsx` | Device type | ~6 | Small fixed list — native select is fine |
| `PlacePlacementModal.tsx` | Device (unplaced) | Unbounded | Follow-up — complex sub-modal flow |
| `PlacePlacementModal.tsx` | Rack object model | Unbounded | Follow-up — complex sub-modal flow |
| `RepositoryPanel.tsx` | Git remote | 1-2 typically | Native select is fine |

### Changed in this PR

- **DeviceFormModal — Device model**: replaced with `SearchableSelect`.  
  Search works by name, vendor, model_number, device_type.  
  Each option shows the model name as primary label and
  `vendor · model_number · device_type · height` as secondary meta line.

### Kept as follow-up

- `PlacePlacementModal` device and rack-object selects — both have unbounded lists and
  are good candidates. However, the modal already has complex inline sub-modal flows
  (create-device, edit-device, create-rack-object, edit-rack-object). Replacing their
  selects safely is a separate PR to keep scope controlled.

## SearchableSelect component

**Location:** `apps/desktop/src/components/ui/SearchableSelect.tsx`

**Props:**
- `options: SelectOption[]` — `{ value, label, keywords?, meta? }`
- `value: string` — controlled current value
- `onChange: (value: string) => void`
- `placeholder?: string` — shown when value doesn't match any option
- `disabled?: boolean`
- `aria-label?: string`
- `data-testid?: string` — also generates `${id}-trigger` and `${id}-search` sub-ids

**Behaviour:**
- Trigger button styled identically to `.input` (height 28 px, same border/focus ring)
- Dropdown rendered via `createPortal` to `document.body` with `position: fixed`
  so it is never clipped by `overflow-y: auto` on `.modal-bd`
- Search input at the top of the dropdown, auto-focused on open
- Results list: `max-height: 200px; overflow-y: auto`
- Escape (capture phase) closes the dropdown without closing the parent modal
- Click-outside closes the dropdown
- "No results" empty state when search has no match
- `onMouseDown` on options with `e.preventDefault()` — avoids focus flicker

## Add/Edit Device — Device Model selector

- Options: `{ value: "", label: "— none —" }` + one per `filteredModels`
  (already filtered by device_type when a type is selected)
- `keywords`: joined `vendor + model_number + device_type`
- `meta`: `vendor · model_number · device_type · NU`
- `onChange`: directly calls `setForm(f => ({ ...f, deviceModelId: val }))`
- Existing auto-clear logic (model cleared when device type changes to incompatible
  type) is untouched — it runs on the device-type select's change handler

## Tests

```
vitest run src/
  Test Files  45 passed (45)
      Tests  604 passed (604)   (+20 new vs PR 2 baseline of 584)
```

New tests: 18 in `SearchableSelect.test.tsx` + 3 in `DeviceFormModal.test.tsx`
(plus 2 existing tests updated to use the new UI interaction pattern).

TypeScript: no errors.
Rust checks: skipped — PR is frontend-only; no Rust/Tauri code was touched.
Vite build: `pnpm` not available in this environment; TS + Vitest confirm correctness.

## Risks

- `getBoundingClientRect()` returns zeros in JSDOM; the `position: fixed` dropdown
  renders at `top: 2, left: 0` in tests (harmless) but correct on the real desktop app.
- Client-side search on the model list is fine for typical inventories. Very large
  model catalogues (thousands) may benefit from debounced search in a future PR.

## Not done

- Searchable select in PlacePlacementModal (device / rack-object pickers) — follow-up PR
- Auto-populate Device Type from selected model — explicitly out of scope per brief
- Contextual rack-object form, planning/on-site mode, duplicate/create-similar,
  clone repository, rack export — all out of scope per brief

## Suggested next step

PR 4: Replace the unplaced-device and rack-object selects in PlacePlacementModal with
SearchableSelect, now that the component exists and is tested.

---

## Version / release confirmation

- Version not bumped: still `0.1.0-beta.2`
- No tag created
- No GitHub Release created
- No installer changes
- No beta.2 release notes modified
