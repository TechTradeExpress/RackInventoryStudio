## Summary

Fixes two beta.2 release blockers:

1. **NSIS installer/uninstaller false "running" prompt** — Replaced the bundler-supplied
   `CheckIfAppIsRunning` macro with a custom `RisCheckIfRunning` macro in
   `apps/desktop/src-tauri/nsis/main.nsi`. The custom macro calls
   `nsis_tauri_utils::FindProcess` directly and only shows the dialog when the
   process is verifiably running (return value `1`). Fresh installs and
   post-close uninstalls are now silent.

2. **OS X button does not close the app** — Fixed the `onCloseRequested` handler
   in `apps/desktop/src/App.tsx`. The previous code returned early without
   calling `event.preventDefault()` when there were no unsaved changes, relying
   on Tauri's implicit default close — which does not work reliably in all
   Tauri v2 environments. The handler now always calls `event.preventDefault()`
   and explicitly calls `getCurrentWindow().destroy()`. A `closingRef` guard
   prevents re-entrant invocations (e.g., rapid double-click on X).

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src/App.tsx` | Added `closingRef`; rewrote `onCloseRequested` to always `preventDefault` and explicitly call `destroy()` |
| `apps/desktop/src-tauri/nsis/main.nsi` | Added custom `RisCheckIfRunning` macro; replaced both `CheckIfAppIsRunning` calls |
| `apps/desktop/src/App.close.test.tsx` | New test file -- 12 tests for OS X button close path (no unsaved changes, unsaved changes, re-entrancy guard) |
| `docs/BETA1_SMOKE_TEST_EN.md` | Added sections 6.14 (OS X close) and 6.15 (installer prompt); added two rows to blocker table |

## Tests

```
npx pnpm@10.33.4 --filter "@rack-inventory-studio/desktop" exec vitest run
```

Result: **547 tests passed** across 43 test files (12 new in `App.close.test.tsx`).

```
npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit
```

Result: **clean** (no errors).

```
npx pnpm@10.33.4 --filter "@rack-inventory-studio/desktop" exec vite build
```

Result: **success** (303 kB JS, 22 kB CSS, no inline scripts or styles).

```
node --test scripts/*.test.mjs
```

Result: **17 pass**.

## Risks

- **NSIS macro untested locally**: The `RisCheckIfRunning` macro cannot be compiled
  without the Windows NSIS toolchain. The logic is straightforward NSIS using
  the same `nsis_tauri_utils` plugin already bundled by Tauri, but it will only
  be validated when the Windows Installer CI workflow runs.
- **`FindProcess` return value**: The macro assumes `nsis_tauri_utils::FindProcess`
  returns `1` when the process is found and `0` (or negative) otherwise, consistent
  with the Tauri source for `nsis-tauri-utils`. If the plugin version bundled by
  the project uses a different convention, the guard would behave incorrectly.
- **Tauri v2 `destroy()` event loop**: Calling `destroy()` from inside
  `onCloseRequested` should be safe per Tauri v2 docs, but it has not been tested
  with a full Tauri build in this session (only unit-tested with mocks).

## Not done

- Full end-to-end test on a Windows 11 machine with the NSIS installer -- this
  requires the Windows Installer CI workflow and a real Tauri build.
- The `UnsavedChangesDialog` cancel path in the OS-close flow relies on the same
  `unsavedGuardResolveRef` mechanism tested in `App.guard.test.tsx`; no separate
  integration test was added for that path in `App.close.test.tsx` beyond what the
  "Cancel" test already covers.

## Suggested next step

Merge this PR and trigger the Windows Installer workflow on the branch to validate
the NSIS macro change in a real NSIS compile. If the build succeeds and the false
prompt is gone on a manual smoke check, the branch is ready to proceed toward the
beta.2 release gate.
