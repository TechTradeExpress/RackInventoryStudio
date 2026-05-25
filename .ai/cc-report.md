## Summary

CI wiring for script tests and repository hygiene checks (follows PR #79). Added a new lightweight `scripts` CI job that runs `node --test scripts/*.test.mjs` and `node scripts/check-repo-hygiene.mjs` on every pull request and push. Extended `check-repo-hygiene.mjs` with two additional regression checks that prevent the removed Windows Diagnostic Installer workflow from being reintroduced.

No product behavior changes. No frontend UI changes. No Rust/Tauri changes. No version bump. No new dependencies.

## Files changed

- `.github/workflows/ci.yml` — Added new `scripts` job ("Script and hygiene checks"): checkout + `node --test scripts/*.test.mjs` + `node scripts/check-repo-hygiene.mjs`. No pnpm install needed (Node built-ins only).
- `scripts/check-repo-hygiene.mjs` — Added 2 new checks: Windows Diagnostic Installer workflow not tracked (`.github/workflows/windows-diagnostic-installer.yml`), Windows Diagnostic Installer CI doc not tracked (`.ai/windows-diagnostic-installer.md`). Total checks: 8.
- `CHANGELOG.md` — Added `## Unreleased — Wire script and hygiene checks into CI` section.

## CI job/step changes

Before: 3 CI jobs (`rust`, `version-check`, `frontend`)
After: 4 CI jobs (`rust`, `version-check`, `scripts`, `frontend`)

New `scripts` job:
- No system dependencies, no pnpm install — fast checkout-only
- Step 1: `node --test scripts/*.test.mjs` — 17 fixture-based tests for `bump-version.mjs`
- Step 2: `node scripts/check-repo-hygiene.mjs` — 8 hygiene regression checks

Existing jobs unchanged.

## Hygiene checks now enforced in CI (8 total)

| # | Check | Fail condition |
|---|-------|---------------|
| 1 | No `package-lock.json` | If tracked (project uses pnpm) |
| 2 | No `.env` files | If any non-sample `.env` file is tracked |
| 3 | No `.ai/review-context-*.md` | If any review-context file is committed |
| 4 | No `node_modules` in git | If any `node_modules` path is tracked |
| 5 | `pnpm-lock.yaml` tracked | If lockfile is missing or untracked |
| 6 | `CHANGELOG.md` present | If `CHANGELOG.md` is absent |
| 7 | No Windows Diagnostic Installer workflow | If `.github/workflows/windows-diagnostic-installer.yml` is tracked |
| 8 | No Windows Diagnostic Installer CI doc | If `.ai/windows-diagnostic-installer.md` is tracked |

## Checks run locally

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 388 pass, 32 files
playwright test (apps/desktop)                  → 17 pass
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → clean
cargo clippy --workspace -- -D warnings         → clean
no apps/desktop/package-lock.json               → ok
no tracked .ai/review-context-*.md              → ok
actionlint                                      → not available (manual YAML review only)
```

## Known risks

- `actionlint` was not available locally — YAML was manually reviewed and matches the existing job structure.
- The `scripts` job uses the default Node.js version on `ubuntu-latest` (currently Node 20). `node:test` requires Node 18+; this is safe. If the runner's Node version ever drops below 18, the job will fail — but that scenario is not anticipated.
- The two new hygiene checks use exact path matching via `git ls-files`. A file at a different path (e.g., renamed workflow) would not be caught — but the intent is to block exact reintroduction of the removed files.

## Not done

- `actionlint` CI self-check (not a declared requirement; noted for completeness).
- E2E tests not duplicated in `scripts` job (correctly left in `frontend` job only).
- Rust checks not duplicated (correctly left in `rust` job only).

## Suggested next step

Consider pinning `ubuntu-latest` to a specific version (`ubuntu-24.04`) in all CI jobs to prevent runner image drift from breaking the `node:test` step.
