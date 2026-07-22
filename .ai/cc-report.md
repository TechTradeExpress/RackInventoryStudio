## Summary

Stage 3B.2 repair pass (PR #152): split `destructive-guards.e2e.ts` into two independent
specs and harden navigation helpers against observed timing races.

Branch: `feature/e2e-wdio-destructive-guards` → base: `roadmap/e2e-wdio`

**Repair-pass changes (on top of Stage 1 repair already committed as e9aeb58):**

Split `destructive-guards.e2e.ts` into:
- `destructive-guards-inventory.e2e.ts` — device model guard + device guard (inventory layer)
- `destructive-guards-hierarchy.e2e.ts` — location guard + rack guard (hierarchy layer)

Hardened `destructive-ui.ts`:
- `waitForRackListOrDetail`: require BOTH `palette-drop-zone` AND `rack-detail-back-btn` for
  "detail" state — prevents false positives from transient residual DOM during navigation.
- `ensureRackListView`: use direct `.click()` on `rack-detail-back-btn` instead of
  `browser.execute()` — avoids `ChainablePromiseElement` serialization error.
- `findRowByExactName` for rack rows immediately after `ensureRackListView()` now uses 30 s
  timeout (was 15 s) — `rack-add-btn` can appear before `listRacks()` resolves.

Mocha timeout increased from 3,600,000 ms to 5,400,000 ms — guard specs run ~70 min.

Eight NEEDS SELECTOR workflows promoted to COVERED by the four Stage 3B.2 specs:

1. Delete location (no racks) — `entity-deletes-hierarchy`
2. Delete location (guard: rack exists) — `destructive-guards-hierarchy`
3. Delete rack (no placements) — `entity-deletes-hierarchy`
4. Delete rack (guard: placement exists) — `destructive-guards-hierarchy`
5. Delete device model (unreferenced) — `entity-deletes-inventory`
6. Delete device model (guard: device references it) — `destructive-guards-inventory`
7. Delete device (unplaced) — `entity-deletes-inventory`
8. Delete placed device (guard) — `destructive-guards-inventory`

## Files changed

| File | Change |
|---|---|
| `.ai/cc-report.md` | This report |
| `apps/desktop/e2e-wdio/specs/destructive-guards.e2e.ts` | Deleted (replaced by two split specs) |
| `apps/desktop/e2e-wdio/specs/destructive-guards-inventory.e2e.ts` | New: inventory-layer guard spec (device model + device guards, 7-part A–G) |
| `apps/desktop/e2e-wdio/specs/destructive-guards-hierarchy.e2e.ts` | New: hierarchy-layer guard spec (location + rack guards, 7-part A–G) |
| `apps/desktop/e2e-wdio/support/destructive-ui.ts` | `waitForRackListOrDetail` requires both elements; `ensureRackListView` uses direct `.click()`; 30s rack-row timeout comment |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Mocha timeout 3,600,000 → 5,400,000 ms (90 min) |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.2: update scope to 4 specs; update architecture note; add RP hardening and validation results |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Update spec file names (entity-deletes → split; destructive-guards → split); update existing specs table to list all 11; update summary |

_(Stage 1 repair commit e9aeb58 also changed: `entity-deletes.e2e.ts` split into
`entity-deletes-inventory.e2e.ts` + `entity-deletes-hierarchy.e2e.ts`;
`RackDetailPanel.tsx` + `RackDetailPanel.test.tsx`; `destructive-ui.ts` helpers added.)_

## Tests

### TypeScript

```
npx tsc --noEmit   → PASS (0 errors)
```

### WDIO isolated runs (repair pass, 2026-07-22)

```
destructive-guards-inventory  run 1  PASSED  ~01:09
destructive-guards-inventory  run 2  PASSED  ~01:09
destructive-guards-hierarchy  run 1  PASSED  ~01:05
destructive-guards-hierarchy  run 2  PASSED  ~01:08
```

### Full WDIO suite

```
DISPLAY=:77 npx wdio run e2e-wdio/wdio.conf.ts   → PASSED 11/11 specs
```

## Risks

- Guard specs run ~70 min each; the 90-min Mocha timeout gives ~20 min margin.
  Any regression adding significantly to `navigateToRackDetail` time could approach the limit.
- `rack-add-btn` appears before `listRacks()` resolves — 30 s row timeout mitigates this;
  if the data load were to take longer than 30 s the spec would still fail.
- `waitForRackListOrDetail` requires both `palette-drop-zone` AND `rack-detail-back-btn` —
  if either selector is renamed in application source, the helper will time out.
- Guard error messages must exactly match the `.includes()` substrings in the specs.
  Verified against application source; backend text changes would cause assertion failures.

## Not done

- Edit placement height U (Stage 3C)
- Remove placement via EditPlacementModal remove button (Stage 3C)
- PlacementInspectorPanel navigate to device / model (Stage 3C)
- WDIO CI enforcement (future CI stage)
- Windows validation

## Suggested next step

Push `feature/e2e-wdio-destructive-guards`, update PR #152 body with RP results and the
4-spec structure, then generate the review context against `roadmap/e2e-wdio`.
