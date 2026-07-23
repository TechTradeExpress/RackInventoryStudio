## Summary

Stage 3B.2: four WDIO specs covering delete flows and relationship-guard rejections.
Promotes 8 workflows from NEEDS SELECTOR → COVERED (total: 30 → 38 COVERED, 15 → 7 NEEDS SELECTOR).

Branch: `feature/e2e-wdio-destructive-guards` → direct base: `roadmap/e2e-wdio`

Four final specs (each with its own isolated repository):

- **`entity-deletes-inventory.e2e.ts`** — Device model + device successful deletes, cancel assertion, persistence
- **`entity-deletes-hierarchy.e2e.ts`** — Rack + location successful deletes, relational counts, persistence
- **`destructive-guards-inventory.e2e.ts`** — Device model guard + device guard, full 7-part A–G graph assertions
- **`destructive-guards-hierarchy.e2e.ts`** — Location guard + rack guard, full 7-part A–G graph assertions

Eight workflows promoted NEEDS SELECTOR → COVERED: delete location (no racks), delete location (guard),
delete rack (no placements), delete rack (guard), delete device model (unreferenced), delete device model
(guard), delete device (unplaced), delete placed device (guard).

Final Mocha timeout: 5,400,000 ms (90 min). Guard specs run ~70 min each.

## Final files

| File | Change |
|---|---|
| `.ai/cc-report.md` | This report |
| `apps/desktop/e2e-wdio/specs/entity-deletes-inventory.e2e.ts` | New: device model + device successful deletes (Parts A–G) |
| `apps/desktop/e2e-wdio/specs/entity-deletes-hierarchy.e2e.ts` | New: rack + location successful deletes (Parts A–G) |
| `apps/desktop/e2e-wdio/specs/destructive-guards-inventory.e2e.ts` | New: inventory-layer guard spec (Parts A–G, 7-part graph assertions) |
| `apps/desktop/e2e-wdio/specs/destructive-guards-hierarchy.e2e.ts` | New: hierarchy-layer guard spec (Parts A–G, 7-part graph assertions) |
| `apps/desktop/e2e-wdio/support/destructive-ui.ts` | Helpers: ConfirmDialog, row finders, error banners, waitForRackListOrDetail, ensureRackListView, relational count helpers |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Mocha timeout 3,600,000 → 5,400,000 ms |
| `apps/desktop/src/components/ui/ConfirmDialog.tsx` | Add `data-testid="confirm-dialog-confirm"` and `data-testid="confirm-dialog-cancel"` |
| `apps/desktop/src/components/ui/ConfirmDialog.test.tsx` | 6 tests covering new testids |
| `apps/desktop/src/features/locations/LocationsPanel.tsx` | `<div data-testid="location-delete-error">` wrapper |
| `apps/desktop/src/features/racks/RacksPanel.tsx` | `<div data-testid="rack-delete-error">` wrapper |
| `apps/desktop/src/features/deviceModels/DeviceModelsPanel.tsx` | `<div data-testid="device-model-delete-error">` wrapper |
| `apps/desktop/src/features/devices/DevicesPanel.tsx` | `<div data-testid="device-delete-error">` wrapper |
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Add `data-testid="rack-detail-back-btn"` |
| `apps/desktop/src/features/racks/RackDetailPanel.test.tsx` | 3 tests covering new testid |
| `docs/E2E_WDIO_PLAN.md` | Stage 3B.2 scope, RP hardening, full validation matrix |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Updated spec names, existing specs table, summary counts |

## Static and component validation

```
TypeScript (npx tsc --noEmit)             PASS (0 errors)   — prior validation + CI
Vitest (pnpm -C apps/desktop test:unit)   PASS (850/850)    — prior validation + CI
Hygiene (node scripts/check-repo-hygiene) PASS (8/8)        — this RP
Tauri build (--no-bundle, no beforeCmd)   PASS (47 s)       — this RP, 2026-07-23
Rust workspace                            PASS              — CI run 29996330471
```

Playwright: BLOCKED — environment dependency: `libasound2t64`
- Error: `browserType.launch: Host system is missing dependencies to run browsers`
- All 21 tests fail at launch with 0 ms runtime (never execute)
- Pre-existing condition; no dependency or configuration changes made

## Final Stage 3B.2 isolated WDIO matrix

Run command: `cd apps/desktop && DISPLAY=:77 node_modules/.bin/wdio run e2e-wdio/wdio.conf.ts --spec e2e-wdio/specs/<spec>.e2e.ts`

| Spec | Run | Result | Duration | Suffix | Run root | Cleanup |
|------|-----|--------|----------|--------|----------|---------|
| `entity-deletes-inventory` | run 1 | PASSED | 00:38:15 | mrx6g0hp | /tmp/ris-wdio-9QIW69 | REMOVED ✓ |
| `entity-deletes-inventory` | run 2 | PASSED | 00:38:32 | mrx7tq4h | /tmp/ris-wdio-PVsanb | REMOVED ✓ |
| `entity-deletes-hierarchy` | run 1 | PASSED | 00:31:12 | mrx97py8 | /tmp/ris-wdio-ogECM9 | REMOVED ✓ |
| `entity-deletes-hierarchy` | run 2 | PASSED | 00:31:12 | mrxacamw | /tmp/ris-wdio-Lnfwj8 | REMOVED ✓ |
| `destructive-guards-inventory` | run 1 | PASSED | ~01:09 | mrw3stks | /tmp/ris-wdio-9PVj1i | REMOVED ✓ |
| `destructive-guards-inventory` | run 2 | PASSED | ~01:09 | — | — | REMOVED ✓ |
| `destructive-guards-hierarchy` | run 1 | PASSED | ~01:05 | — | — | REMOVED ✓ |
| `destructive-guards-hierarchy` | run 2 | PASSED | ~01:08 | — | — | REMOVED ✓ |

## Full WDIO suite

```
cd apps/desktop && DISPLAY=:77 node_modules/.bin/wdio run e2e-wdio/wdio.conf.ts
→ PASSED 11/11 specs (2026-07-22)
```

Specs: app-smoke, core-inventory, csv-import, destructive-guards-hierarchy, destructive-guards-inventory,
entity-deletes-hierarchy, entity-deletes-inventory, entity-updates-work-mode, placement-lifecycle,
repository-lifecycle, safety-recovery.

## Playwright

BLOCKED — environment dependency: `libasound2t64`
Command: `cd apps/desktop && node_modules/.bin/playwright test`
Exit code: 1. Pre-existing condition; unrelated to Stage 3B.2.

## GitHub Actions

Final CI (HEAD fb13fb8e7273c84a2bc4d3d837809de0c36a7d82):
- Run ID: 29996330471 | Run number: 366 | Conclusion: success
- Frontend checks: success
- Rust workspace: success
- Script and hygiene checks: success
- Version consistency: success
- Workflow lint: success

## Working tree and cleanup

| Run root | Status |
|----------|--------|
| /tmp/ris-wdio-9QIW69 (del-inv run 1) | REMOVED ✓ |
| /tmp/ris-wdio-PVsanb (del-inv run 2) | REMOVED ✓ |
| /tmp/ris-wdio-ogECM9 (del-hier run 1) | REMOVED ✓ |
| /tmp/ris-wdio-Lnfwj8 (del-hier run 2) | REMOVED ✓ |

Uncommitted changes present: no
Working tree: clean

## Suggested next step

PR #152 is ready for final review. Windows WDIO validation remains a separate follow-up stage.
