## Summary

Cleanup PR 3 — Test and script hardening. Hardened `scripts/bump-version.mjs` with `--root`/`--dry-run` flags and better error handling, added 17 fixture-based tests using Node built-ins, added a `check-repo-hygiene.mjs` script with 6 regression checks, hardened E2E mock state isolation with factory functions and explicit reset, and added a state-isolation regression E2E test.

No product behavior changes. No version bump. No new runtime or dev dependencies.

## Files changed

- `scripts/bump-version.mjs` — Added `--root <path>` (test isolation), `--dry-run` (no-write preview), argument validation, and try/catch error wrapping. Fixed "atomically" wording in header.
- `scripts/bump-version.test.mjs` *(new)* — 17 fixture-based tests using `node:test`, `node:assert`, `node:child_process`. Covers all argument validation, no-op, bump, dry-run, and error-path cases.
- `scripts/check-repo-hygiene.mjs` *(new)* — 6 hygiene checks: no `package-lock.json`, no `.env` files, no committed `.ai/review-context-*.md`, no `node_modules` in git tree, `pnpm-lock.yaml` tracked, `CHANGELOG.md` present.
- `package.json` (root) — Added `"test:scripts"` and `"check:hygiene"` scripts.
- `apps/desktop/e2e/mocks/tauri-core.ts` — Extracted `createInitialDevices()` / `createInitialRackDetail()` factory functions; added exported `resetE2eMockState()`; changed module-level `const` to `let`; called `resetE2eMockState()` in `open_repository_cmd` path as defense-in-depth.
- `apps/desktop/e2e/smoke.spec.ts` — Added "mock state isolation: dynamic mutations reset on page reload" test (places a device, reloads, asserts mutation gone).
- `CHANGELOG.md` — Added `## Unreleased — Test and script hardening` section.

## Tests

```
# Scripts
node --test scripts/bump-version.test.mjs
→ 17 pass, 0 fail

# Vitest unit tests (apps/desktop)
node node_modules/.bin/vitest run
→ 388 pass, 0 fail (32 test files)

# TypeScript type check (apps/desktop)
node node_modules/.bin/tsc --noEmit
→ 0 errors

# Version consistency
node scripts/check-version-consistency.mjs
→ All versions match: 0.1.0

# Hygiene
node scripts/check-repo-hygiene.mjs
→ All 6 hygiene checks passed

# Playwright E2E
node node_modules/.bin/playwright test
→ 17 pass, 0 fail (24.4s)
```

## Risks

- The `resetE2eMockState()` call inside `open_repository_cmd` resets `dynamicDevices` and `dynamicRackDetail` on every valid `openFixtureRepo()`. Tests that rely on state accumulated across multiple `invoke("open_repository_cmd")` calls within one page session would be affected — but no such test exists now.
- `check-repo-hygiene.mjs` requires `git` in PATH. On a system without git it reports failures for the git-based checks (not a CI concern).

## Not done

- No Cargo tests run (no Rust code touched).
- Additional hygiene checks (trailing whitespace, large files, secret scanning) are intentionally deferred — 6 focused checks are sufficient for regression purposes.

## Suggested next step

Add `pnpm test:scripts` and `pnpm check:hygiene` to the GitHub Actions CI workflow alongside the existing `check:version` step.
