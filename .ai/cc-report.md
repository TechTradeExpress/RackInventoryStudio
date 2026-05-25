# Code dead-code and naming cleanup after Beta QA Milestones A–F

## Summary

Focused dead-code cleanup pass following Beta QA Milestones A–F and Docs Cleanup PR #77. No application behavior changed. Three targeted removals:

1. **Dead state in `RackDetailPanel.tsx`** — `placeModalDndPayload` was written to on every placement-modal trigger path but never read as a value. `PlacePlacementModal` receives `initialTargetKind`/`initialTargetId` instead; the full `DndPayload` state was a vestige of an earlier API. Removed the state declaration and all 6 setter call-sites.

2. **Unused `common` style properties in `lib/styles.ts`** — 8 CSS-in-JS properties (`section`, `h2`, `h3`, `hint`, `table`, `th`, `td`, `working`) were defined in the shared `common` object but referenced nowhere. Only `btn`, `input`, `row`, and `errorBox` are actually imported (in `CreateRepositoryWizard.tsx`). These 8 properties were placements-panel leftovers.

3. **Stale comment in `RepositoryPanel.tsx`** — Removed the comment block that said "Temporarily render the legacy summary table here — will be separated into sidebar in a follow-up." The code is no longer temporary and the comment added noise.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/features/racks/RackDetailPanel.tsx` | Removed dead `placeModalDndPayload` state and all 6 setter calls |
| `apps/desktop/src/lib/styles.ts` | Removed 8 unused properties from `common` |
| `apps/desktop/src/features/repository/RepositoryPanel.tsx` | Removed stale "legacy / temporary / follow-up" comment |
| `CHANGELOG.md` | Added Unreleased entry |

## Audit commands run

```
rg "AddPlacementPanel|Add Placement|inline add form" apps/desktop/src apps/desktop/e2e crates docs README.md .ai
# → only archival docs and valid BETA_WINDOWS_11_QA_EN.md QA row (absence check)

rg "placement table|Front placements|Rear placements" apps/desktop/src README.md
# → NONE

rg "Windows Diagnostic Installer|windows-diagnostic-installer" .github apps/desktop/src docs README.md .ai
# → NONE

rg "TODO|FIXME|deprecated|legacy" apps/desktop/src crates
# → one "legacy" hit in RepositoryPanel.tsx comment — removed in this PR

rg "common\." apps/desktop/src
# → only CreateRepositoryWizard.tsx; confirmed 8 properties unreferenced → removed

rg "placeModalDndPayload|setPlaceModalDndPayload" apps/desktop/src
# → 7 lines all in RackDetailPanel.tsx; confirmed never READ as a value → removed
```

## What is confirmed still intentionally present

| Item | Location | Why kept |
|------|----------|----------|
| `Front placements`/`Rear placements` absence assertions | `smoke.spec.ts` | Valid E2E tests confirming placement table does NOT exist |
| `AddPlacement` terms | Archival docs (archival banner at top) | Historical context, marked archival |
| `placement table` reference | `BETA_QA_FINDINGS_ACTION_PLAN_EN.md` | Problem-statement context (describes what was removed), not instructions |
| `FIXTURE_NEW_DEVICE_ID` export | `e2e/mocks/tauri-core.ts` | Exported for potential test use; not removed |
| `DndPayload` type import | `RackDetailPanel.tsx` | Still needed for `handleDropAtCell` parameter type |
| `dndTypes.ts`, `dndHelpers.ts` | `apps/desktop/src/features/racks/` | Still used by palette DnD |

## Tests/checks run

```
git diff --check                           → clean
node scripts/check-version-consistency.mjs → 0.1.0 consistent
tsc --noEmit                               → clean
vitest run                                 → 388 passed (32 files)
vite build                                 → clean
playwright test                            → 16 passed
cargo fmt --all --check                    → clean
cargo check --workspace                    → clean
cargo test --workspace                     → 374 passed
cargo clippy --workspace -- -D warnings    → clean
test ! -f apps/desktop/package-lock.json  → OK
no tracked .ai/review-context-*.md        → OK
```

## Known risks

- None. All changes are strictly dead-code removal with no behavior impact.
- `styles.ts` still exports `common`; the remaining 4 properties (`btn`, `input`, `row`, `errorBox`) are still actively used by `CreateRepositoryWizard.tsx`.

## Not done

- `bump-version.mjs` script hardening (belongs to Cleanup PR 3 per task instructions).
- Deeper E2E mock-state hardening (belongs to Cleanup PR 3 per task instructions).
- `FIXTURE_UNPLACED_DEVICE_ID` / `FIXTURE_NEW_DEVICE_ID` export cleanup in `tauri-core.ts` (exports unused externally but kept for future test extensibility).

## Suggested next step

Cleanup PR 3: harden `scripts/bump-version.mjs` (SemVer validation, dry-run flag, error handling) and the E2E mock stateful layer.
