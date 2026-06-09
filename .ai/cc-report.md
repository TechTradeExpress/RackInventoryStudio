## Summary

Fixes two beta.2 release blockers on branch `bugfix/beta2-installer-close-blockers` (PR #115).

### Blocker 1 — NSIS installer false "running" prompt (root cause confirmed, reverted)

**Root cause verified** by fetching the canonical Tauri bundler source
(`crates/tauri-bundler/src/bundle/windows/nsis/utils.nsh` via GitHub API):

`nsis_tauri_utils::FindProcess` returns `0` when the process IS found (running),
and non-zero when the process is NOT found. The canonical macro checks `${If} $R0 = 0`
to detect a running process.

The custom `RisCheckIfRunning` macro introduced in commit `9bf25e5` had this inverted:
it checked `IntCmp $R0 1 ris_running...` — triggering the prompt and kill path when
`$R0 = 1`, i.e., when the process was NOT running. This caused the false prompt on
every fresh install or reinstall after the app was closed.

**Fix:** Removed `RisCheckIfRunning` entirely. Both call sites (Section Install and
Section Uninstall) now use the canonical bundler macro:
```
!insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
```
`utils.nsh` is provided by the Tauri bundler at build time and handles all edge cases:
correct `FindProcess` convention, currentUser install mode, silent/passive mode,
localized strings, kill success/failure flow.

### Blocker 2 — OS window close button (capability fix preserved, unchanged)

`core:window:allow-close` and `core:window:allow-destroy` remain in
`apps/desktop/src-tauri/capabilities/default.json`. The `onCloseRequested` handler
in `App.tsx` logs `destroy()` failures via `logError` instead of swallowing them.
No changes to this fix in this revision.

## PR

https://github.com/TechTradeExpress/RackInventoryStudio/pull/115

## Files changed in this revision

| File | Change |
|---|---|
| `apps/desktop/src-tauri/nsis/main.nsi` | Removed `RisCheckIfRunning` macro; restored `CheckIfAppIsRunning` at both call sites |
| `CHANGELOG.md` | Added Fixed entry for installer false running prompt |
| `.ai/cc-report.md` | Updated with root cause, revert description, full check results |

## Files preserved from previous revisions (unchanged here)

| File | Status |
|---|---|
| `apps/desktop/src-tauri/capabilities/default.json` | `core:window:allow-close` + `core:window:allow-destroy` present |
| `apps/desktop/src/App.tsx` | `catch (error)` with `logError` + `closingRef` reset |
| `apps/desktop/src/App.close.test.tsx` | 549 tests pass including rejection/retry |
| `scripts/check-capabilities.test.mjs` | Guard test for capability permissions |
| `docs/BETA1_SMOKE_TEST_EN.md` | Sections 6.14/6.15 for manual OS close + installer |

## Version consistency

```
  package.json (workspace root)           0.1.0-beta.2
  apps/desktop/package.json               0.1.0-beta.2
  apps/desktop/src-tauri/Cargo.toml       0.1.0-beta.2
  apps/desktop/src-tauri/tauri.conf.json  0.1.0-beta.2
  All versions match: 0.1.0-beta.2
```

## Checks

All checks passed (Linux, Node 18, Rust 1.95.0):

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | 0.1.0-beta.2 -- all 4 sources |
| `node --test scripts/*.test.mjs` | 19 pass (17 bump-version + 2 capabilities guard) |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `pnpm smoke:beta` | 7/7 pass |
| `cargo fmt --all -- --check` | clean |
| `cargo check --workspace` | clean |
| `cargo test --workspace` | 0 failures |
| `cargo clippy --workspace -- -D warnings` | clean |
| `npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit` | clean |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vitest run` | 549 pass (43 files) |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build` | success -- no inline scripts or styles |

## Windows Installer CI

Workflow triggered on branch `bugfix/beta2-installer-close-blockers` after push.
Previous run (capability fix only):
https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/27161492074

A new run must be triggered after this push. Manual trigger at:
https://github.com/TechTradeExpress/RackInventoryStudio/actions/workflows/windows-installer.yml

Select branch: `bugfix/beta2-installer-close-blockers`

**The NSIS revert is the critical fix for the false running prompt** and must be
validated by a Windows build.

## Manual QA required after Windows installer build

1. RIS not running: install proceeds without "is currently running" prompt.
2. RIS not running: uninstall proceeds without "is currently running" prompt.
3. RIS running: installer shows prompt.
4. RIS running: click OK — RIS closes, install/uninstall continues.
5. RIS running: click Cancel — install/uninstall aborts cleanly.
6. Dev mode on Windows: system X button with no unsaved changes — app closes immediately.
7. Dev mode on Windows: system X button with unsaved changes — 3-button guard dialog appears.
8. Guard: "Save and continue" — saves and closes.
9. Guard: "Continue without saving" — closes without saving.
10. Guard: "Cancel" — app remains open.

## Risks

- **NSIS can only be compiled on Windows**: The revert to `CheckIfAppIsRunning` is
  correct by source inspection but must be confirmed by the Windows Installer CI run.
- **Capability fix unverified locally**: `core:window:allow-destroy` enforcement is
  a Windows-only Tauri IPC check; confirmed by source analysis, validated by Windows
  build + manual smoke.

## Suggested next step

Trigger Windows Installer CI on branch `bugfix/beta2-installer-close-blockers`, then
run manual QA steps 1-10 above. If installer smoke passes and the system X button
closes the app correctly, merge PR #115 and proceed with the beta.2 release gate.
