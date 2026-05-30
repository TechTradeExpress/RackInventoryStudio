# CC Report — PR F: Dirty repository guard

## Summary

Replaced the synchronous `window.confirm()` unsaved-changes guard with an async
3-button modal dialog ("Save and continue" / "Continue without saving" / "Cancel").
Added a Tauri `onCloseRequested` window-close guard so closing the app with unsaved
changes also triggers the dialog. The existing callout bar and titlebar "unsaved"
indicator (already in App.tsx) are unchanged.

## Files changed

| File | Change |
|------|--------|
| `src/components/ui/UnsavedChangesDialog.tsx` | New — 3-button modal component |
| `src/components/ui/UnsavedChangesDialog.test.tsx` | New — 9 component-level tests |
| `src/App.guard.test.tsx` | New — 8 integration tests for the guard in App |
| `src/App.tsx` | Replaced 3 `confirmUnsavedDiscard()` calls with async `guardUnsaved()`; added `openGuardDialog` / `resolveGuard` / `handleGuardSave`; added Tauri `onCloseRequested` effect; rendered `<UnsavedChangesDialog>`; imported `saveCurrentRepository`, `getCurrentWindow`, `isTauri` |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | Marked PR F as Implemented in status table |

## Tests

```
npx vitest run          # 534 tests — 42 files — all passed
npx tsc --noEmit        # clean
cargo fmt --all --check # clean
cargo clippy --all      # no errors
git diff --check        # no whitespace issues
```

## Risks

- The Tauri `onCloseRequested` guard is only registered when `isTauri()` is true
  (no-op in the test harness / browser). In Tauri it subscribes once on mount with
  a stable `openGuardDialog` callback and reads `hasUnsavedChanges` via ref — no
  stale-closure risk.
- If the user clicks "Save and continue" and the save fails, the dialog stays open
  (error shown in the global error bar). The window/action is NOT proceeded. This
  matches the safer UX: user must explicitly choose "Continue without saving" or
  "Cancel" after a failed save.
- The Tauri close guard calls `getCurrentWindow().destroy()` after the user
  consents. If destroy fails, the window will not close; this is the safe failure
  mode.

## Not done

- The `UNSAVED_MSG` constants and `confirmUnsavedDiscard` in `unsavedGuard.ts` are
  kept (they have their own tests); they are no longer used by `App.tsx` but remain
  as utility functions. They can be removed in a future cleanup pass.
- No custom dialog body text per action — the default "Unsaved changes" title is
  shown for open/close/window-close. Context-specific body text could be added to
  `UnsavedChangesDialog` callers if desired.

## Suggested next step

PR G — release/signing/versioning hardening (custom NSIS path, code signing) as
listed in the follow-up plan.
