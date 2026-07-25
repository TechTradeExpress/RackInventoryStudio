## Summary

Stage 3C — Remaining placement workflows — on
`feature/e2e-stage-3c-placement-workflows` → `roadmap/e2e-wdio` (base
`341a44a`, PR #156 merged). **Status: COMPLETE.**

Audited the existing WDIO spec set for consolidation candidates before
adding new coverage, per the task's explicit "review + merge only where it
reduces costly app/session launches without hurting isolation or
diagnosability" instruction. Two pairs were merged:

- `destructive-guards-hierarchy.e2e.ts` + `destructive-guards-inventory
  .e2e.ts` → `destructive-guards.e2e.ts` (identical fixture, independent
  read-only guard checks — no order dependency).
- `entity-deletes-hierarchy.e2e.ts` + `entity-deletes-inventory.e2e.ts` →
  `entity-deletes.e2e.ts` (disjoint fixtures that never interact).

Two other named pairs were explicitly reviewed and left separate:
`core-inventory.e2e.ts` (its `measureStep()` names are pinned by
`REQUIRED_CORE_INVENTORY_STEPS` in the performance benchmark script — an
out-of-scope cross-cutting dependency) + `placement-lifecycle.e2e.ts`
(distinct behavior: happy-path create vs. move/remove semantics); and
`entity-updates-work-mode.e2e.ts` (reviewed alone, no candidate found).
Full reasoning, before/after timing, and setup eliminated are in
`docs/E2E_WDIO_PLAN.md`'s new "E2E spec consolidation" section.

Implemented the four Stage 3C requirements (edit placement height U, remove
placement via `EditPlacementModal`, `PlacementInspectorPanel` navigate to
target device, navigate to target model) plus the previously-untested
rack-object placement workflow they required, in one new spec:
`placement-inspector-workflows.e2e.ts`.

**Real production bug found and fixed** (separate commit from the test
work, per instruction): `PlacementInspectorPanel.tsx` checked
`placement.target_kind === "rack_object"` — a value that never occurs
(`PlacementTargetKind` only has `Device`/`DeviceModel`; rack-object
placements get `target_kind: DeviceModel`) — so
`edit-target-model-btn` could never render for any real placement. Found
because the new spec's positive-path assertion failed against the real
app, not because of a test-only bug. Fixed the one condition, added a
4-case regression suite to `PlacementInspectorPanel.test.tsx`.

**Mid-task scope change:** after the static/unit suite and most E2E
validation was already green, the user interrupted the in-progress
embedded regression check for the new spec with an explicit decision to
abandon the embedded WDIO provider entirely. I stopped the running embedded
task immediately (clean teardown verified — no lingering processes, ports
4444/4445 free) and asked a clarifying question on scope, since "abandon
the provider" is a materially bigger and harder-to-reverse action than
skipping one validation step. The user chose full removal, but as its own
follow-up branch/PR — not folded into this one, per this repo's minimal-
scope workflow rules. This PR therefore: (a) does **not** claim a
pass/fail result for `placement-inspector-workflows` under embedded (the
run was interrupted, not completed — see docs), (b) documents the removal
decision and scopes it as a tracked follow-up, (c) makes no other embedded-
related code changes. External remains the default and only actively
validated provider.

Final HEAD: see `git log -1`. PR to be opened against `roadmap/e2e-wdio`,
not merged. Stage 3D not started.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/specs/destructive-guards.e2e.ts` | New — merges `destructive-guards-hierarchy` + `destructive-guards-inventory` |
| `apps/desktop/e2e-wdio/specs/entity-deletes.e2e.ts` | New — merges `entity-deletes-hierarchy` + `entity-deletes-inventory` |
| `apps/desktop/e2e-wdio/specs/destructive-guards-hierarchy.e2e.ts` | Deleted (merged) |
| `apps/desktop/e2e-wdio/specs/destructive-guards-inventory.e2e.ts` | Deleted (merged) |
| `apps/desktop/e2e-wdio/specs/entity-deletes-hierarchy.e2e.ts` | Deleted (merged) |
| `apps/desktop/e2e-wdio/specs/entity-deletes-inventory.e2e.ts` | Deleted (merged) |
| `apps/desktop/e2e-wdio/specs/placement-inspector-workflows.e2e.ts` | New — Stage 3C: height-U edit, remove-via-modal, inspector navigate-to-device/model, rack-object placement |
| `apps/desktop/e2e-wdio/specs/placement-lifecycle.e2e.ts` | Removed local duplicate `findRowByText`/`navigateToRackDetail`, now imports canonical versions from `destructive-ui.ts` |
| `apps/desktop/e2e-wdio/support/destructive-ui.ts` | Added `clickLocationRowAndEnterRacks()` (state-based nav-racks wait — fixes a real race found during validation), canonical `navigateToRackDetail()`, `placeDeviceAtU()` |
| `apps/desktop/e2e-wdio/support/destructive-ui.test.ts` | New — unit tests for `navigateToRackDetail` |
| `apps/desktop/src/features/racks/PlacementInspectorPanel.tsx` | **Production bug fix**: `target_kind === "rack_object"` → `"device_model"` for `edit-target-model-btn` |
| `apps/desktop/src/features/racks/PlacementInspectorPanel.test.tsx` | Added 4-case regression suite for edit-target button rendering |
| `docs/E2E_WDIO_PLAN.md` | Stage 3C section: PLANNED → COMPLETE with full detail; new "E2E spec consolidation" section; embedded-removal decision documented; "Future stages" gained the removal follow-up |
| `.ai/cc-report.md` | This report |

## Tests

```
pnpm install --frozen-lockfile          PASS
pnpm audit                               PASS
pnpm -C apps/desktop typecheck           PASS
pnpm -C apps/desktop test                923/923 PASS
node --test scripts/*.test.mjs           353/353 PASS
node scripts/check-repo-hygiene.mjs      PASS
node scripts/check-version-consistency.mjs   PASS
cargo fmt --all --check                  PASS
cargo check --workspace                  PASS
cargo clippy --workspace -- -D warnings  PASS
git diff --check                         PASS

External E2E (canonical runner, final HEAD):
  destructive-guards.e2e.ts              CLEAN_PASS, 33-35s (x3 runs), ports free
  entity-deletes.e2e.ts                  CLEAN_PASS, 28-29s, ports free
  placement-inspector-workflows.e2e.ts   CLEAN_PASS, 25-26s (x3 runs), ports free
  placement-lifecycle.e2e.ts             CLEAN_PASS, 21s (re-run after helper refactor), ports free
  app-smoke.e2e.ts                       CLEAN_PASS

Embedded:
  app-smoke.e2e.ts                       CLEAN_PASS, 65s
  placement-inspector-workflows.e2e.ts   INTERRUPTED (not a pass/fail result) —
                                          stopped mid-run per explicit user decision
                                          to abandon the embedded provider; clean
                                          teardown verified (no lingering processes,
                                          ports 4444/4445 free)
  Static check: new spec's interactions use only already-established
  provider-agnostic patterns (selectSearchableOption, browser.execute
  synthetic click for backdrop-obscured ConfirmDialog buttons) — no new
  provider-specific workaround introduced.
```

## Risks

- `placement-inspector-workflows.e2e.ts` has no completed embedded run —
  only external `CLEAN_PASS` x3 plus the static provider-agnostic-pattern
  check. Acceptable because embedded is being fully removed as an
  immediate follow-up, and external is the sole gating provider.
- The consolidated specs' *external* timing is freshly measured this pass;
  their embedded "before" timing is prior-session data (documented as such
  in `docs/E2E_WDIO_PLAN.md`), not re-measured now — moot given the
  embedded-removal decision.
- `clickLocationRowAndEnterRacks()`'s state-based wait fixed one real race
  (a `findRowByExactName` timeout) found during this pass's own validation;
  fixed with an app-state condition (`nav-racks` visibility), not a timeout
  increase — re-verified via 5 subsequent clean runs across the two specs
  that use it.

## Not done

- Embedded provider removal itself — intentionally scoped to a separate
  follow-up branch/PR (tracked as task #27), not this PR, per the user's
  explicit choice and this repo's minimal-scope-per-PR workflow rule.
- Dedicated U-occupancy/collision negative-path spec — not in the Stage 3C
  MISSING list and not requested; noted as a gap, not silently dropped.
- Stage 3D — not started, per explicit instruction.

## Suggested next step

Open the follow-up branch for full embedded-provider removal (task #27)
once this PR is reviewed/merged to `roadmap/e2e-wdio`, so the codebase
stops carrying an abandoned, unvalidated provider path.
