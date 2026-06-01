# CC Report — PR P: TEST-01 Beta Smoke Gate

## Summary

Adds TEST-01 — a structured, partially-automated smoke gate to be run before
the beta release checklist. Does not change any application logic, data schemas,
Git behaviour, or CI configuration.

Deliverables:
1. `docs/BETA1_SMOKE_TEST_EN.md` — full gate document (automated + manual layers).
2. `scripts/smoke-beta-gate.mjs` — automated gate script (7 fast checks).
3. `"smoke:beta"` npm/pnpm script in root `package.json`.
4. Updated `docs/BETA1_FOLLOWUP_PLAN_EN.md` — TEST-01 marked as gate prepared;
   PR P row added to the grouping table.

## Files changed

| File | Change |
|---|---|
| `docs/BETA1_SMOKE_TEST_EN.md` | New: full beta smoke gate document (automated + manual steps) |
| `scripts/smoke-beta-gate.mjs` | New: semi-automated gate script, 7 checks + manual checklist printout |
| `package.json` | Added `"smoke:beta": "node scripts/smoke-beta-gate.mjs"` |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | TEST-01 status updated; PR P row added to grouping table |
| `.ai/cc-report.md` | This file |

## Tests

```
git diff --check
```
Clean.

```
node scripts/check-version-consistency.mjs
```
Pass — 0.1.0-beta.1 consistent.

```
node --test scripts/*.test.mjs
```
17/17 pass.

```
node scripts/check-repo-hygiene.mjs
```
All 8 checks pass.

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
42 test files, 539 tests — all pass.

```
npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build
```
Production build succeeds. `dist/index.html` verified: no inline scripts, no inline styles.

```
node scripts/smoke-beta-gate.mjs
```
7/7 automated checks passed. Manual checklist printed.

## Risks

- **pnpm not on PATH**: The script auto-detects pnpm. If `pnpm` is not on PATH it
  falls back to `npx pnpm@VERSION` using the version from `packageManager` in
  `package.json`. Both paths produce identical results.
- **Vitest invocation note**: In this environment (Node 18.19.1), `npx vitest run`
  from the workspace root fails due to missing `node:util.styleText` (added in
  Node 20.12). The script uses `pnpm exec vitest run` which invokes vitest correctly
  regardless of global Node.js version.
- **TEST-01 is not automated E2E**: The manual steps require a human on a real dev
  machine with the Tauri WebView. The script covers all checks that can run without
  a live Tauri binary.

## Not done

- Playwright / full Tauri E2E automation — out of scope for this PR.
- GitHub Actions SHA pinning — post-beta.2, tracked in plan.
- Askpass constant-time comparison — post-beta.2, tracked in plan.

## Suggested next step

Run `pnpm smoke:beta` followed by the manual checklist in `docs/BETA1_SMOKE_TEST_EN.md`
on a developer machine before cutting the `release/v0.1.0-beta.1` branch.
