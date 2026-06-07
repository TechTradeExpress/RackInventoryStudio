## Summary

Fixes two beta.2 release blockers on branch `bugfix/beta2-installer-close-blockers` (PR #115):

1. **NSIS installer/uninstaller false "running" prompt** — Replaced the bundler-supplied
   `CheckIfAppIsRunning` macro with a custom `RisCheckIfRunning` macro in
   `apps/desktop/src-tauri/nsis/main.nsi`. The custom macro calls
   `nsis_tauri_utils::FindProcess` directly and only shows the dialog when the
   process is verifiably running (return value `1`). Fresh installs and
   post-close uninstalls are now silent.

2. **OS window close button does not close the app** — Fixed the `onCloseRequested`
   handler in `apps/desktop/src/App.tsx`. The previous code returned early without
   calling `event.preventDefault()` when there were no unsaved changes, relying on
   Tauri's implicit default close — which does not work reliably in all Tauri v2
   environments. The handler now always calls `event.preventDefault()` and explicitly
   calls `getCurrentWindow().destroy()`. A `closingRef` guard prevents re-entrant
   invocations (e.g., rapid double-click on the system title-bar X button).

The branch was 1 commit behind `origin/master` (commit `1402c2d chore(release): bump
version to 0.1.0-beta.2`). The branch was updated via `git merge origin/master`
(no conflicts). `Cargo.lock` was updated to reflect the new version.

## PR

https://github.com/TechTradeExpress/RackInventoryStudio/pull/115

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/App.tsx` | Added `closingRef`; rewrote `onCloseRequested` to always `preventDefault` and explicitly call `destroy()` |
| `apps/desktop/src-tauri/nsis/main.nsi` | Added custom `RisCheckIfRunning` macro; replaced both `CheckIfAppIsRunning` calls |
| `apps/desktop/src/App.close.test.tsx` | New test file -- 12 tests for OS window close path |
| `docs/BETA1_SMOKE_TEST_EN.md` | Added sections 6.14 (OS window close) and 6.15 (installer prompt); fixed duplicate separator; fixed blocker table wording |
| `Cargo.lock` | Version updated from 0.1.0-beta.1 to 0.1.0-beta.2 (via merge of beta.2 bump) |

## Branch alignment

- Branch was **1 commit behind** `origin/master`: `1402c2d chore(release): bump version to 0.1.0-beta.2 (#114)`
- Merged via `git merge origin/master` -- no conflicts
- After merge: version is `0.1.0-beta.2` in all 4 canonical sources

## Version consistency

```
node scripts/check-version-consistency.mjs
```

```
  package.json (workspace root)           0.1.0-beta.2
  apps/desktop/package.json               0.1.0-beta.2
  apps/desktop/src-tauri/Cargo.toml       0.1.0-beta.2
  apps/desktop/src-tauri/tauri.conf.json  0.1.0-beta.2

All versions match: 0.1.0-beta.2
```

## Checks

All checks passed on local environment (Linux, Node 18, Rust 1.95.0):

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | 0.1.0-beta.2 -- all 4 sources |
| `node --test scripts/*.test.mjs` | 17 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `pnpm smoke:beta` | 7/7 pass |
| `cargo fmt --all -- --check` | clean |
| `cargo check --workspace` | clean |
| `cargo test --workspace` | 0 failures |
| `cargo clippy --workspace -- -D warnings` | clean |
| `npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit` | clean |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vitest run` | 547 pass (43 files) |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build` | success -- no inline scripts or styles |

## Windows Installer CI

Triggered on branch `bugfix/beta2-installer-close-blockers`:
https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/27099613236

Status at time of report: **in progress**. The run validates that:
- The NSIS `RisCheckIfRunning` macro compiles with the Windows NSIS toolchain
- The Tauri Windows build succeeds with the updated version `0.1.0-beta.2`

## Risks

- **`FindProcess` return value convention**: The macro assumes `nsis_tauri_utils::FindProcess`
  returns `1` when found, `0` (or negative) when not found -- consistent with the
  Tauri `nsis-tauri-utils` source. Will be confirmed by the Windows Installer CI run.
- **Tauri v2 `destroy()` from within `onCloseRequested`**: Only unit-tested with mocks
  locally. Full validation requires a Tauri dev-mode build on Windows 11.

## Manual QA after Windows installer build

1. Fresh install -- verify no "running" prompt appears.
2. Close app, run installer again (update) -- verify no prompt.
3. Launch app, run installer without closing -- verify prompt appears; click OK; verify installer proceeds.
4. Launch app in dev mode; click system title-bar X with no unsaved changes -- verify app closes immediately.
5. Open repo, add a location (do not save), click X -- verify guard dialog; Cancel keeps app open; X + Continue closes app.

## Suggested next step

Wait for Windows Installer CI run
https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/27099613236
to complete. If green, run manual QA steps 1-5 above on the built installer, then
merge PR #115 and proceed with the beta.2 release gate.
