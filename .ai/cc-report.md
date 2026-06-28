## Summary

Added the Clone Repository flow to Rack Inventory Studio. Users can now clone an existing Git repository by providing a Git URL, selecting a parent directory via folder picker, and optionally editing the auto-derived directory name. On success the repository is opened exactly like Create/Open flows.

## Files changed

### Rust backend
- `apps/desktop/src-tauri/src/diagnostics.rs` — Added `redact_git_url()` to strip HTTPS userinfo (tokens/passwords) before logging. 5 unit tests added.
- `apps/desktop/src-tauri/src/commands/repository.rs` — Added `clone_repository_cmd` Tauri command: validates inputs, rejects non-empty destination, calls `git clone`, then opens the result as a RIS repository. `dir_name_from_url()` helper is test-only (frontend handles derivation). 6 unit tests for `dir_name_from_url`.
- `apps/desktop/src-tauri/src/commands/mod.rs` — Exported `clone_repository_cmd`.
- `apps/desktop/src-tauri/src/lib.rs` — Registered `clone_repository_cmd` in `use` import and `generate_handler!`.

### TypeScript / React frontend
- `apps/desktop/src/api/tauriClient.ts` — Added `cloneRepository(url, destination)` wrapper.
- `apps/desktop/src/features/repository/cloneHelpers.ts` — New file: `dirNameFromUrl()`, `validateCloneDirName()`, `computeClonePath()` pure helpers.
- `apps/desktop/src/features/repository/CloneRepositoryForm.tsx` — New component: Git URL input with auto-derived dir name, parent directory field + Browse button, editable dir name field (auto-fill locks after user edits), path preview, submit, error banner.
- `apps/desktop/src/features/repository/RepositoryPanel.tsx` — Added Clone panel (shown only when no repo is open), wired `onCloneSuccess` prop.
- `apps/desktop/src/App.tsx` — Added `handleCloneSuccess()` and `onCloneSuccess` prop to `<RepositoryPanel>`.

### Tests
- `apps/desktop/src/features/repository/cloneHelpers.test.ts` — New: 18 unit tests for the three helper functions.
- `apps/desktop/src/features/repository/CloneRepositoryForm.test.tsx` — New: 15 component tests (visibility, URL auto-derive, validation, path preview, successful clone, error handling, Browse button).
- `apps/desktop/src/features/repository/RepositoryPanel.test.tsx` — Updated: added `CloneRepositoryForm` mock, `onCloneSuccess` in BASE_PROPS, 4 new tests for Clone panel integration.

## Tests

```
cargo test --workspace       → 83 Rust unit tests passed
cargo clippy -- -D warnings  → clean
npx tsc --noEmit             → clean
npx vitest run               → 740 tests passed (48 files)
git diff --check             → clean
node scripts/check-version-consistency.mjs → all versions match 0.1.0-beta.2
node scripts/check-repo-hygiene.mjs        → all 8 checks passed
node --test scripts/*.test.mjs             → 19 tests passed
```

## Risks

- `git clone` is invoked via `std::process::Command`. If `git` is not on PATH the error is surfaced to the user as "Failed to run git: …". No retry logic.
- Non-RIS repos clone successfully but then fail to open; the cloned directory is NOT automatically cleaned up (by design: the user may want to inspect it).
- HTTPS credentials entered in the URL are redacted in logs but still pass through to git's credential helper chain. No credential storage is added.
- SSH key pairing relies on the system SSH agent; no additional setup is done here.

## Not done

- Credential/token management UI (out of scope by spec).
- Branch selection at clone time (out of scope).
- Shallow clone option (out of scope).
- Progress reporting during clone (git does not expose structured progress via stdout).

## Suggested next step

Add an SSH key diagnostics check for clone (similar to `get_ssh_diagnostics`) so users can verify their SSH agent is reachable before attempting to clone over SSH.
