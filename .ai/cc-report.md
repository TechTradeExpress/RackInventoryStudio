## Summary

Fixes two beta.2 release blockers on branch `bugfix/beta2-installer-close-blockers` (PR #115).

### Blocker 1 — NSIS installer false "running" prompt

Replaced the bundler-supplied `CheckIfAppIsRunning` macro with a custom `RisCheckIfRunning`
macro in `apps/desktop/src-tauri/nsis/main.nsi`. The macro calls
`nsis_tauri_utils::FindProcess` directly and only shows the dialog when the process is
verifiably running. Fresh installs and post-close uninstalls are silent.

### Blocker 2 — OS window close button does not close the app (root cause confirmed)

Root cause verified via `apps/desktop/src-tauri/gen/schemas/acl-manifests.json`:

`core:window:default` (included transitively via `core:default`) grants only read-only
getter permissions — it does **not** include `allow-destroy` or `allow-close`.

In Tauri v2 the `getCurrentWindow().destroy()` call issues IPC command
`plugin:window|destroy`, which is gated by `core:window:allow-destroy`. Without this
permission Tauri silently rejects the call. The previous `catch {}` swallowed the
rejection, making the bug invisible in logs.

**Fix applied:**
1. Added `core:window:allow-close` and `core:window:allow-destroy` to
   `apps/desktop/src-tauri/capabilities/default.json` — minimal allow-list, no wildcards.
2. Replaced empty `catch {}` with `catch (error)` that calls
   `logError(\`window close failed: ${sanitizeErrorForLog(error)}\`)` and resets
   `closingRef.current = false` so a retry is possible.

## PR

https://github.com/TechTradeExpress/RackInventoryStudio/pull/115

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/capabilities/default.json` | Added `core:window:allow-close` and `core:window:allow-destroy` |
| `apps/desktop/src/App.tsx` | `catch {}` → `catch (error)` with `logError` + `closingRef` reset |
| `apps/desktop/src/App.close.test.tsx` | Added destroy-rejection tests; `mockLogError` captured in `vi.hoisted`; added NOTE comment about mock limitations |
| `apps/desktop/src-tauri/nsis/main.nsi` | Custom `RisCheckIfRunning` macro (from previous commit) |
| `scripts/check-capabilities.test.mjs` | New guard test: asserts `core:window:allow-destroy` and `core:window:allow-close` are present in capabilities |
| `CHANGELOG.md` | Added Fixed entry for window close button |
| `docs/BETA1_SMOKE_TEST_EN.md` | Sections 6.14/6.15 for manual OS close + installer verification |
| `Cargo.lock` | Version updated to 0.1.0-beta.2 (via master merge) |

## Branch alignment

Branch was 1 commit behind `origin/master` (beta.2 version bump `1402c2d`). Merged
cleanly via `git merge origin/master`. Version is `0.1.0-beta.2` across all 4 sources.

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
| `pnpm smoke:beta` | 7/7 pass (script unit tests now reports 2 files) |
| `cargo fmt --all -- --check` | clean |
| `cargo check --workspace` | clean |
| `cargo test --workspace` | 0 failures |
| `cargo clippy --workspace -- -D warnings` | clean |
| `npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit` | clean |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vitest run` | 549 pass (43 files, +2 rejection tests) |
| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build` | success -- no inline scripts or styles |

## Unit test limitations

`App.close.test.tsx` mocks `getCurrentWindow().destroy()` as a resolved/rejected Promise.
These tests do NOT validate real Tauri IPC permission checks. The capability fix in
`default.json` can only be confirmed by a Windows Tauri build and manual smoke test.

## Windows Installer CI

Workflow triggered on branch `bugfix/beta2-installer-close-blockers` (previous run):
https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/27099613236

A new run will be triggered after this push by CI (if configured on push), or must be
manually triggered by the user at:
https://github.com/TechTradeExpress/RackInventoryStudio/actions/workflows/windows-installer.yml

**The capability permission change (`default.json`) is the critical fix.** It must be
validated by a Windows build before tagging beta.2.

## Manual QA required after Windows installer build

1. Fresh install -- no false "running" prompt.
2. Close app, reinstall -- no prompt.
3. Install with app running -- prompt appears; OK closes app; installer continues.
4. Dev mode on Windows: click system title-bar X with no unsaved changes -- app closes immediately.
5. Dev mode on Windows: unsaved changes + X -- 3-button guard dialog appears.
6. Guard: "Save and continue" -- saves and closes.
7. Guard: "Continue without saving" -- closes without saving.
8. Guard: "Cancel" -- app remains open.

## Risks

- **Capability fix unverified locally**: `default.json` change is structural JSON; the
  actual IPC enforcement can only be confirmed on a Windows Tauri build.
- **`nsis_tauri_utils::FindProcess` return value**: Assumes `1` = found, `0` = not found.
  Confirmed by Tauri source; will be validated by Windows Installer CI run.

## Suggested next step

Trigger Windows Installer CI on branch `bugfix/beta2-installer-close-blockers`, then
run manual QA steps 1-8. If the system X button closes the app without errors and the
installer smoke passes, merge PR #115 and proceed with the beta.2 release gate.
