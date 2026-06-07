## Summary

Fixes two beta.2 release blockers:

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

Also fixed two documentation issues in `docs/BETA1_SMOKE_TEST_EN.md`:
- Removed a duplicate `---` separator between sections 6.16 and 7.
- Changed "OS X button" to "OS window close button" in the blockers table.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/App.tsx` | Added `closingRef`; rewrote `onCloseRequested` to always `preventDefault` and explicitly call `destroy()` |
| `apps/desktop/src-tauri/nsis/main.nsi` | Added custom `RisCheckIfRunning` macro; replaced both `CheckIfAppIsRunning` calls |
| `apps/desktop/src/App.close.test.tsx` | New test file -- 12 tests for OS window close path (no unsaved changes, unsaved changes, re-entrancy guard) |
| `docs/BETA1_SMOKE_TEST_EN.md` | Added sections 6.14 (OS window close) and 6.15 (installer prompt); fixed duplicate separator; fixed blocker table wording |

## PR

https://github.com/TechTradeExpress/RackInventoryStudio/pull/115

## Git status before push

```
On branch bugfix/beta2-installer-close-blockers
Changes to be committed:
  modified:   .ai/cc-report.md
  modified:   docs/BETA1_SMOKE_TEST_EN.md
```

## Tests

All checks passed on the local environment (Linux, Node 18, Rust 1.95.0).

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | 0.1.0-beta.1 across all 4 sources |
| `node --test scripts/*.test.mjs` | 17 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `cargo fmt --all -- --check` | clean |
| `cargo check --workspace` | clean |
| `cargo test --workspace` | 0 failures |
| `cargo clippy --workspace -- -D warnings` | clean |
| `npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit` | clean |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vitest run` | 547 pass (43 files) |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build` | 303 kB JS, 22 kB CSS -- no inline scripts or styles |

## Windows NSIS build

**Not possible locally.** The NSIS toolchain and `nsis_tauri_utils.dll` are only
available in the Windows Installer CI workflow. The `RisCheckIfRunning` macro
logic is straightforward NSIS using the same plugin already bundled by Tauri, but
the macro must be validated by triggering the Windows Installer workflow on this
branch after the PR is merged.

## Risks

- **`FindProcess` return value convention**: The macro assumes `nsis_tauri_utils::FindProcess`
  returns `1` when found, `0` (or negative) when not found -- consistent with the
  Tauri `nsis-tauri-utils` source. If the bundled plugin version uses a different
  convention, the guard logic would be inverted.
- **Tauri v2 `destroy()` from within `onCloseRequested`**: Confirmed safe by Tauri v2
  docs, but only unit-tested with mocks in this session. Full validation requires a
  Tauri dev-mode build on Windows.

## Manual QA steps after Windows installer build

1. Fresh install on Windows 11 -- verify no "running" prompt appears.
2. Close app, run installer again (update) -- verify no prompt.
3. Launch app, run installer without closing -- verify prompt appears; click OK; verify installer proceeds.
4. Launch app in dev mode (`pnpm dev`); click system title-bar X with no unsaved changes -- verify app closes immediately.
5. Open repo, add a location (do not save), click X -- verify guard dialog appears; Cancel keeps app open; X again + "Continue without saving" closes app.

## Suggested next step

Merge PR #115, trigger the Windows Installer CI workflow, and run the manual QA
steps above. If the NSIS build and installer smoke pass, the branch is clear for
the beta.2 release gate.
