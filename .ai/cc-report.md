## Summary

Stage 3A of the Desktop E2E WDIO Program: placement lifecycle spec.

Branch: `feature/e2e-wdio-placement-lifecycle` → base: `roadmap/e2e-wdio`

Adds `placement-lifecycle.e2e.ts`, a 5-part WDIO spec covering the full
placement round-trip against the real compiled Tauri binary with no mocks:

1. Create isolated inventory → place device at U1 → verify placed card
2. Edit placement: U1 → U5 via PlacementInspectorPanel → EditPlacementModal
3. Persist moved placement: save + close + reopen → verify U5
4. Remove placement via PlacementInspectorPanel → ConfirmDialog
5. Persist removal: save + close + reopen → device unplaced, rack empty

Also increases Mocha timeout from 30 min to 45 min (Stage 3A takes ~35 min),
and updates coverage docs (COVERED count: 20 → 24, total: 66 → 67 workflows).

## Files changed

| File | Change |
|---|---|
| `apps/desktop/e2e-wdio/specs/placement-lifecycle.e2e.ts` | New spec (Stage 3A) |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Mocha timeout 1,800,000 → 2,700,000 ms |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Update coverage matrix and summary counts |
| `docs/E2E_WDIO_PLAN.md` | Stage 3 section: 3A IN REVIEW, 3B PLANNED |

## Tests

Isolated spec run × 2 (required gate):

```
Run 7: Spec Files: 1 passed, 1 total (100% completed) in 00:35:21
Run 8: Spec Files: 1 passed, 1 total (100% completed) in 00:35:22
```

Full WDIO suite (all 6 specs):

```
Run 1: Spec Files: 6 passed, 6 total (100% completed) in 01:26:37
  PASSED  app-smoke.e2e.ts
  PASSED  core-inventory.e2e.ts
  PASSED  csv-import.e2e.ts
  PASSED  placement-lifecycle.e2e.ts
  PASSED  repository-lifecycle.e2e.ts
  PASSED  safety-recovery.e2e.ts
```

## Key implementation notes

- **WebKit beforeCommand overhead**: `@wdio/tauri-service` adds ~6 s per WebDriver
  command (18 s between `findElement` and `click`). Native `.click()` on the
  PlacementInspectorPanel remove button fired a `mousedown` sequence; after the
  ConfirmDialog portal inserted its backdrop (position:fixed, z-index:600), the
  delayed `mousedown` landed on the backdrop → `handleBackdrop` closed the dialog.
  Fix: `browser.execute(() => el.click())` fires only a synthetic `click` event.

- **DOM order ambiguity**: Both the inspector's `remove-from-rack-btn` and the
  ConfirmDialog's confirm button share the text "Remove from rack". Since `#root`
  precedes portal content in DOM order, `$("button=Remove from rack")` always
  matched the inspector button. Selector for the confirm button is scoped via
  `document.querySelector('[data-testid="modal-backdrop"]').querySelector("button.btn-danger")`
  inside `browser.execute()` — synchronous, no staleness risk.

- **Post-placement auto-selection**: After placing a device, RackDetailPanel
  auto-selects the new placement → inspector is already open. Part 2 checks
  `open-edit-modal-btn.isDisplayed()` before attempting a card click to avoid a
  toggle that would deselect.

## Risks

- Spec takes ~35 min due to `beforeCommand` hook overhead. This is inherent to
  `@wdio/tauri-service` v1.2.0 with `driverProvider: "external"`. No workaround
  without switching to the embedded driver (requires `tauri-plugin-wdio-webdriver`).
- `browser.execute()` for interactive clicks bypasses native event sequences. The
  production code paths (IPC `editPlacement`, `removePlacement`) are exercised via
  the resulting React state changes and commit calls, which is the correct assertion.

## Not done

- Edit placement via height-u-input (Stage 3B)
- Remove placement via EditPlacementModal remove button (Stage 3B)
- PlacementInspectorPanel navigate-to-device / navigate-to-model (Stage 3B)
- Entity edit flows (Stage 3B)
- Work mode toggle (Stage 3B)

## Suggested next step

Stage 3B: entity edits (device, model, location, rack) + work mode toggle.
All selectors are already present; spec work only, no application source changes.
