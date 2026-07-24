## Summary

Stage 3B.4: E2E WDIO latency optimization — Linux RP (repair pass).

Continuation of the Windows repair pass (PR #154, branch
`feature/e2e-wdio-latency-optimization`). Primary environment is now
**Linux / wdio-plugin binary / external provider**. Actual E2E runs are
not possible in this environment (xvfb-run and WebKitWebDriver are not
installed); all changes are validated by static checks and unit tests only.

This RP delivers:

1. **`scripts/run-wdio-e2e.mjs`** — canonical E2E runner wrapping the
   benchmark script with xvfb-run on Linux, PID-safe cleanup, and the
   wdio-plugin binary path as default. Exports pure functions for testing.
2. **`scripts/run-wdio-e2e.test.mjs`** — 53 node:test tests for all pure
   functions, runs without spawning real processes.
3. **Root `package.json`** — `test:e2e:wdio` script pointing at the runner.
4. **`wdio.conf.ts` header update** — Linux as primary environment, canonical
   `pnpm test:e2e:wdio -- --spec <name>` usage, removed stale
   `tauri-plugin-wdio: NOT required` declaration.
5. **Batch A — shared `waitForFormCloseOrError`**: new helper in
   `spec-interactions.ts` using a single `browser.execute()` per poll
   (vs. 3–5 separate `$()` / `isExisting()` / `isDisplayed()` / `getText()`
   calls). Migrated all 6 specs that had local copies:
   - `entity-deletes-hierarchy.e2e.ts` (2 calls)
   - `entity-deletes-inventory.e2e.ts` (2 calls)
   - `entity-updates-work-mode.e2e.ts` (8 calls)
   - `destructive-guards-hierarchy.e2e.ts` (4 form + 1 placement modal)
   - `destructive-guards-inventory.e2e.ts` (4 form + 1 placement modal)
   - `placement-lifecycle.e2e.ts` (1 call — `waitForEditModalClose`)
   Plus 10 vitest unit tests for the helper.
6. **Section 14 — `clickElementProtocol` comment fix**: removed contradictory
   "bypasses onMouseDown handling" claim (incompatible with "performs the
   WebDriver Element Click algorithm").
7. **Section 15 — plugin-presence probe**: `assertPluginPresenceContract`
   now uses `browser.waitUntil` (5 s, 100 ms) for the `present` case instead
   of a single immediate `execute()`. Tests updated with separate
   `fakeBrowserPresent` / `fakeBrowserAbsent` mocks.
8. **Section 16 — `expectActiveRepositoryPath` cause**: the catch block now
   re-throws with `{ cause }` to distinguish timeout from session failure or
   execute error. One regression test added.

Previous Windows pass results (from the prior session, still valid):

| Spec | Result | Wall time (Windows, wdio-plugin) |
|------|--------|-----------|
| `csv-import` | PASSED | 6s |
| `destructive-guards-hierarchy` | PASSED | 27s |
| `destructive-guards-inventory` | PASSED | 28s |
| `entity-deletes-hierarchy` | PASSED | 13s |
| `entity-deletes-inventory` | PASSED | 15s |
| `entity-updates-work-mode` | PASSED | 23s |
| `placement-lifecycle` | PASSED | 15s |
| `core-inventory` ×2 | PASSED both | 13s, 12s |
| `representative-latency` ×2 | PASSED both | 12,774ms, 12,598ms |

## Files changed

### New files

| File | Change |
|------|--------|
| `scripts/run-wdio-e2e.mjs` | Canonical Linux E2E runner (xvfb-run, wdio-plugin binary, external provider) |
| `scripts/run-wdio-e2e.test.mjs` | 53 node:test unit tests for pure functions |

### Modified files

| File | Change |
|------|--------|
| `package.json` (root) | Added `test:e2e:wdio` script |
| `apps/desktop/e2e-wdio/wdio.conf.ts` | Header: Linux as primary env, canonical usage, removed stale `NOT required` |
| `apps/desktop/e2e-wdio/support/spec-interactions.ts` | Added `waitForFormCloseOrError`; fixed contradictory `clickElementProtocol` comment |
| `apps/desktop/e2e-wdio/support/spec-interactions.test.ts` | 10 new tests for `waitForFormCloseOrError` |
| `apps/desktop/e2e-wdio/support/plugin-presence.ts` | `assertPluginPresenceContract`: `waitUntil` polling for `present` case |
| `apps/desktop/e2e-wdio/support/plugin-presence.test.ts` | Updated tests with `fakeBrowserPresent`/`fakeBrowserAbsent` mocks |
| `apps/desktop/e2e-wdio/support/repository-ui.ts` | `expectActiveRepositoryPath`: `{ cause }` in catch |
| `apps/desktop/e2e-wdio/support/repository-ui.test.ts` | 1 new test verifying cause is preserved |
| `apps/desktop/e2e-wdio/specs/entity-deletes-hierarchy.e2e.ts` | Batch A: migrated 2 waitForFormClose calls |
| `apps/desktop/e2e-wdio/specs/entity-deletes-inventory.e2e.ts` | Batch A: migrated 2 waitForFormClose calls |
| `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts` | Batch A: migrated 8 waitForFormClose calls |
| `apps/desktop/e2e-wdio/specs/destructive-guards-hierarchy.e2e.ts` | Batch A: migrated 5 calls, removed 2 local functions |
| `apps/desktop/e2e-wdio/specs/destructive-guards-inventory.e2e.ts` | Batch A: migrated 5 calls, removed 2 local functions |
| `apps/desktop/e2e-wdio/specs/placement-lifecycle.e2e.ts` | Batch A: migrated waitForEditModalClose → waitForFormCloseOrError("save-btn") |

## Tests

```
node --test scripts/run-wdio-e2e.test.mjs
# 53/53 PASSED

pnpm -C apps/desktop test   (vitest run)
# 906/906 PASSED (up from 895 with new tests)

node scripts/check-repo-hygiene.mjs
# 8/8 PASSED

node scripts/check-version-consistency.mjs
# PASSED — 0.1.0-beta.2 everywhere

cargo fmt --all --check   (from apps/desktop/src-tauri)
# PASSED

cargo check   (from apps/desktop/src-tauri)
# PASSED
```

E2E runs: not possible in this environment (xvfb-run / WebKitWebDriver not
installed; sudo apt-get not permitted). All code changes are static-validated
only. Previous Windows pass E2E results remain valid (see table above).

## Risks

- **No E2E runs on Linux this session**: all Batch A migrations and Section
  14–16 fixes are validated only by unit tests and static checks. The Windows
  pass covered the same specs before this RP's changes, but the final state
  here was not re-run.
- `waitForFormCloseOrError("place-btn", { timeout: 60_000 })` replaces the
  previous `waitForPlacePlacementModalClose()` which had a custom error
  message `"Placement failed — modal error:"`. The new message says
  `"Form submit failed — modal error:"`. No test asserts on this prefix so the
  change is safe, but it slightly degrades diagnostics.
- `support/destructive-ui.ts` still uses `$()` / `getText()` / `isDisplayed()`
  patterns (Batch C), consciously deferred — correctness-critical shared code.
- `placement-lifecycle.e2e.ts`'s `findRowByText` (`$$()` + `getText()` per row
  in poll condition) remains unoptimized (Batch B deferred).

## Not done

- Full 11-spec WDIO suite on Linux — xvfb-run not available in this env.
- Batch B: `findRowByText` in `placement-lifecycle.e2e.ts` (poll-internal
  `$$()+getText()` pattern).
- Batch C: `support/destructive-ui.ts` optimization.
- Batch D specs (`repository-lifecycle`, `safety-recovery`, `app-smoke`,
  `core-inventory`, `csv-import`): assessed — no local `waitForFormClose`
  copies found; no changes needed for this RP.
- Docs updates to `E2E_WDIO_LATENCY_OPTIMIZATION.md` for this Linux RP
  (deferred — no benchmark results to document).
- Stage 3C — out of scope.

## Suggested next step

1. Commit this RP's changes, push, let CI run.
2. Update PR #154 body to reflect the Linux RP additions.
3. Generate a fresh review context against `roadmap/e2e-wdio`.
4. After merge: validate on a Linux machine with xvfb-run + WebKitWebDriver
   to confirm the Batch A spec migrations work end-to-end.
