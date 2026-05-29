# CC Report — feat/rack-unplaced-devices-ux

## Branch

`feat/rack-unplaced-devices-ux` — PR D from the BETA1 follow-up plan.

### Review blocker fix (commit 2)

**Blocker**: The inspector "Remove from rack" path called `onRemoveSuccess()` with no
arguments. `RackDetailPanel.handleRemoveSuccess()` received no placement ID and could
not update `recentlyUnplacedDeviceIds`, so the removed device was not prioritized in
the palette.

**Fix**: `onRemoveSuccess` signature changed to `(placementId: string) => void`.
`PlacementInspectorPanel.executeRemove` passes `placement.id`. `handleRemoveSuccess` in
`RackDetailPanel` looks up the placement in `detail`, appends the device ID to
`recentlyUnplacedDeviceIds` if `target_kind === "device"`, then calls
`refreshAfterMutation` — identical logic to the DnD path.

---

## Summary

Implemented rack diagram unplaced devices UX improvements (Plan item 11):

1. **Persistent unplace drop target** — a dedicated `unplace-drop-zone` element is always
   rendered in the palette panel with a visible dashed border and "↩ Drop here to remove
   from rack" copy. Available even when the unplaced list is empty.

2. **Non-DnD unplace action** — "Remove placement…" in `PlacementInspectorPanel` renamed to
   "Remove from rack" with neutral (non-danger) button styling. Confirm dialog copy updated
   to clarify the device is not deleted — it returns to the unplaced list.

3. **Palette cap (max 6)** — `PlacementPalettePanel` shows at most 6 unplaced devices.
   When there are more, an overflow indicator shows "Showing 6 of N unplaced devices"
   with a "Show all" button. Rack object models are not capped.

4. **Session recency ordering** — `RackDetailPanel` maintains a `recentlyUnplacedDeviceIds`
   list (appended on each unplace, reset on rack navigation). Passed to the palette to sort
   the most recently unplaced device first in the visible 6.

---

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` | Persistent drop zone, 6-item cap, Show all, recency sort |
| `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` | Rename "Remove placement" → "Remove from rack", neutral styling, updated confirm copy; `onRemoveSuccess` now passes `placementId` |
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Track `recentlyUnplacedDeviceIds`; both DnD and inspector unplace paths now update it via `handleRemoveSuccess(placementId)` |
| `apps/desktop/src/features/racks/PlacementPalettePanel.test.tsx` | Fully rewritten: 19 tests (persistent zone, drop, cap, Show all, recency, DnD) |
| `apps/desktop/src/features/racks/PlacementInspectorPanel.test.tsx` | New: 6 tests including assertion that `onRemoveSuccess` is called with the placement ID |
| `apps/desktop/src/features/racks/RackDetailPanel.test.tsx` | New: 2 integration tests — inspector unplace updates recency; rack_object removal does not pollute device recency |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | Item 11 marked implemented; PR table updated |

---

## Recency ordering decision

**Implemented via frontend session state.** `DeviceDto` has no timestamp fields, so
backend ordering cannot determine recency. `RackDetailPanel` tracks a
`recentlyUnplacedDeviceIds: string[]` state (most recently unplaced = last element).
When a device placement is removed, the device's `target_id` is looked up in the current
`detail` state and appended. The list is reset on rack navigation. The palette sorts
recently unplaced devices to the front of the visible 6. Devices with no recency signal
retain stable backend order. No schema changes were made.

---

## Tests

```
cargo fmt --all --check              — OK
cargo check --workspace              — OK (0 warnings)
cargo test --workspace               — all Rust tests passed
cargo clippy --workspace -D warnings — 0 errors, 0 warnings
tsc --noEmit                         — OK (0 errors)
vitest run                           — 493 passed (38 test files, +3 new/updated)
git diff --check                     — OK
node check-version-consistency.mjs   — OK (all 0.1.0-beta.1)
node --test scripts/*.test.mjs       — 17 passed, 0 failed
node check-repo-hygiene.mjs          — 8 checks passed
```

New test files:
- `PlacementInspectorPanel.test.tsx` (6 tests; asserts `onRemoveSuccess` called with ID)
- `RackDetailPanel.test.tsx` (2 integration tests: inspector unplace → recency; rack_object does not affect device recency)

Updated: `PlacementPalettePanel.test.tsx` (19 tests; drop tests migrated to `unplace-drop-zone`).

---

## Manual QA checklist

1. Open a repository with a rack and at least one placed device.
2. Open the rack detail view.
3. **Confirm unplace drop zone is always visible** — even with zero unplaced devices,
   the dashed "↩ Drop here to remove from rack" box should appear in the palette panel.
4. Drag a placed device card to the drop zone.
5. Confirm the device is removed from the rack diagram and appears in the unplaced list.
6. Repeat with only one or two unplaced devices — confirm the drop zone stays large and
   easy to target.
7. Click a placed device to select it (blue → inspector opens on the right).
8. Click "Remove from rack" in the inspector panel.
9. Confirm a dialog appears saying the device returns to the unplaced list.
10. Confirm the action and verify the device is removed from the rack but not deleted
    (it should appear in the unplaced list, not be gone entirely).
11. Add more than 6 unplaced devices (place, then unplace several).
12. Confirm the palette shows exactly 6 and the overflow indicator "Showing 6 of N" appears.
13. Click "Show all" and confirm all devices are visible.
14. Drag a device from the palette into a rack slot — confirm normal placement still works.
15. Unplace a device and confirm it appears first in the visible 6 (recency ordering).

---

## Risks

- Recency is session-only. If the user navigates away and returns, recently unplaced
  devices will revert to stable backend order. This is intentional and documented.
- "Show all" has no collapse mechanism. If the user clicks "Show all" and the list grows
  very long, the panel may become tall. A future improvement could add "Show less".
- The "Remove from rack" inspector button has a confirm dialog. The DnD path does not.
  This is an intentional design difference: DnD is an explicit drag gesture;
  clicking a button is more easily accidental.

---

## Not done

- Custom NSIS template for exact vendor-prefixed install path (PR G).
- Hide technical `code` from UI (PR E).
- Dirty repository guard (PR F).
- "Show less" collapse for the expanded palette list.

---

## Suggested next step

Merge PR D and implement PR E (Hide technical `code` from UI; device/model display names).
