# CC Report -- PR P (rev 2): TEST-01 Beta Smoke Gate

## Summary

Adds TEST-01 -- a structured, partially-automated smoke gate to be run before
the beta release checklist. Does not change any application logic, data schemas,
Git behaviour, or CI configuration.

Rev 2 fixes four issues identified in review:
1. **Blocker 1**: `vitest < 4.1.0` critical vulnerability (GHSA-5xrq-8626-4rwp)
   fixed by upgrading vitest to 4.1.8. `environmentMatchGlobs` (removed in
   vitest 4.x) replaced with per-file `// @vitest-environment jsdom` annotations.
2. **Blocker 2**: Smoke test checklist now uses a disposable copy of
   `examples/example-repository` for all mutating steps. Tracked fixture is
   never modified. Project repo cleanliness check added at the end.
3. **Blocker 3**: "Manage racks" button reference removed. Checklist now correctly
   says to click the location row.
4. **Cleanup 1**: Script tests now discover all `scripts/*.test.mjs` files
   dynamically instead of hardcoding one filename.
5. **Cleanup 2**: All non-ASCII / decorative Unicode removed from
   `scripts/smoke-beta-gate.mjs`. Output uses plain ASCII only.

## Files changed

| File | Change |
|---|---|
| `docs/BETA1_SMOKE_TEST_EN.md` | Rewritten: disposable copy pattern, correct Locations UX (click row), ASCII-only, project cleanliness check added |
| `scripts/smoke-beta-gate.mjs` | Fixed: ASCII-only output, dynamic script test discovery |
| `apps/desktop/package.json` | `vitest` `^3.2.4` -> `^4.1.8` (fixes GHSA-5xrq-8626-4rwp) |
| `apps/desktop/vite.config.ts` | Removed `environmentMatchGlobs` (removed in vitest 4.x) |
| `apps/desktop/pnpm-lock.yaml` | Updated for vitest 4.1.8 |
| `apps/desktop/src/components/ui/ConfirmDialog.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/components/ui/UnsavedChangesDialog.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/components/ui/Segmented.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/components/ui/Modal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/csvImport/CsvImportPanel.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/devices/DeviceFormModal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/deviceModels/DeviceModelFormModal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/devices/DevicesPanel.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/locations/LocationFormModal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/locations/LocationsPanel.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/racks/EditPlacementModal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/racks/PlacePlacementModal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/racks/RackFormModal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/racks/PlacementPalettePanel.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/repository/RepositoryPanel.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/repository/SshPassphraseModal.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/racks/RacksPanel.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/features/validation/ValidationPanel.test.tsx` | Added `// @vitest-environment jsdom` |
| `apps/desktop/src/lib/unsavedGuard.test.ts` | Added `// @vitest-environment jsdom` |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | TEST-01 marked as gate prepared; PR P row added (from rev 1) |
| `package.json` | Added `smoke:beta` pnpm script (from rev 1) |
| `.ai/cc-report.md` | This file |

## Tests

```
git diff --check
```
Clean.

```
node scripts/check-version-consistency.mjs
```
Pass -- 0.1.0-beta.1 consistent.

```
node --test scripts/*.test.mjs
```
17/17 pass.

```
node scripts/check-repo-hygiene.mjs
```
All 8 hygiene checks pass.

```
cargo fmt --all --check
```
Clean (no Rust changes).

```
cargo check --workspace
```
Pass.

```
cargo test --workspace
```
All pass, 0 failures.

```
cargo clippy --workspace -- -D warnings
```
Clean (no Rust changes).

```
npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit
```
No type errors.

```
npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vitest run
```
42 test files, 539 tests -- all pass (vitest 4.1.8).

```
npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build
```
Production build succeeds. `dist/index.html` verified: no inline scripts, no inline styles.

```
node scripts/smoke-beta-gate.mjs
```
7/7 automated checks passed. Manual checklist printed.

## GitHub checks status (after push)

| Check | Status |
|---|---|
| Frontend dependency audit | Pending (was: FAIL -- vitest < 4.1.0; fixed by upgrade) |
| Rust dependency audit | Expected: pass |
| Frontend checks | Expected: pass |
| Rust workspace | Expected: pass |
| Script and hygiene | Expected: pass |
| Version consistency | Expected: pass |
| Workflow lint | Expected: pass |

## Risks

- **vitest 4.x migration**: `environmentMatchGlobs` was removed in vitest 4.x.
  The fix (per-file `// @vitest-environment jsdom` annotations) touches 21 test
  files but is the canonical vitest 4.x approach. All 539 tests pass.
- **GHSA-5xrq-8626-4rwp scope**: The vulnerability only triggers when the Vitest
  UI server is running (`vitest --ui`). This project never uses the UI server.
  The upgrade to 4.1.8 is the correct fix regardless.
- **pnpm not on PATH**: The script auto-detects pnpm. Falls back to
  `npx pnpm@VERSION` when pnpm is not on PATH.

## Not done

- Playwright / full Tauri E2E automation -- out of scope.
- GitHub Actions SHA pinning -- post-beta.2, tracked in plan.
- Askpass constant-time comparison -- post-beta.2, tracked in plan.

## Suggested next step

Wait for CI to confirm all checks green on PR #112, then sign off and merge.
Then run `pnpm smoke:beta` followed by `docs/BETA1_SMOKE_TEST_EN.md` on a
developer machine before cutting the release branch.
