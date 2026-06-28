## Summary

Added the Clone Repository flow to Rack Inventory Studio. Users can now clone an existing Git repository by providing a Git URL, selecting a parent directory via folder picker, and optionally editing the auto-derived directory name. On success the repository is opened exactly like Create/Open flows.

**Repair (fix commit):** Hardened `git clone` invocation and credential redaction in response to code review blockers:
1. `git clone` now uses `--` before the URL to prevent option injection (a URL starting with `-` or `--` could have been interpreted as a git flag).
2. `redact_git_url()` extended to cover both `http://` and `https://` (previously only `https://`).
3. Added `sanitize_git_error()` which first redacts any embedded HTTP/HTTPS credentials in URLs within arbitrary text (e.g. git's single-quoted stderr messages like `fatal: repository 'https://token@host/repo.git/' not found`), then applies the existing `sanitize_error`. This ensures neither logs nor the UI error message ever contain plain credentials from git stderr.
4. UI flow and frontend unchanged. Version unchanged.

## Files changed

### Rust backend (original)
- `apps/desktop/src-tauri/src/diagnostics.rs` — Added `redact_git_url()` and 5 unit tests.
- `apps/desktop/src-tauri/src/commands/repository.rs` — Added `clone_repository_cmd` Tauri command. `dir_name_from_url()` helper is test-only.
- `apps/desktop/src-tauri/src/commands/mod.rs` — Exported `clone_repository_cmd`.
- `apps/desktop/src-tauri/src/lib.rs` — Registered `clone_repository_cmd`.

### Rust backend (repair)
- `apps/desktop/src-tauri/src/diagnostics.rs` — Extended `redact_git_url()` to cover `http://`; added private `redact_urls_in_text()` helper; added public `sanitize_git_error()`. Added 5 new tests (`redact_git_url_hides_http_plain_token`, `redact_git_url_hides_http_user_pass`, `redact_git_url_leaves_plain_http_unchanged`, `sanitize_git_error_redacts_https_token_in_stderr`, `sanitize_git_error_redacts_http_user_pass_in_stderr`).
- `apps/desktop/src-tauri/src/commands/repository.rs` — `git clone` args changed from `["clone", &url, &destination]` to `["clone", "--", &url, &destination]`. stderr now passed through `sanitize_git_error` instead of `sanitize_error`. Added `sanitize_git_error` and `redact_git_url` to top-level imports.

### TypeScript / React frontend (original, unchanged in repair)
- `apps/desktop/src/api/tauriClient.ts` — Added `cloneRepository(url, destination)` wrapper.
- `apps/desktop/src/features/repository/cloneHelpers.ts` — New: `dirNameFromUrl()`, `validateCloneDirName()`, `computeClonePath()`.
- `apps/desktop/src/features/repository/CloneRepositoryForm.tsx` — New component.
- `apps/desktop/src/features/repository/RepositoryPanel.tsx` — Added Clone panel.
- `apps/desktop/src/App.tsx` — Added `handleCloneSuccess()`.

### Tests (original)
- `apps/desktop/src/features/repository/cloneHelpers.test.ts` — 18 unit tests.
- `apps/desktop/src/features/repository/CloneRepositoryForm.test.tsx` — 15 component tests.
- `apps/desktop/src/features/repository/RepositoryPanel.test.tsx` — 4 new Clone panel tests.

## Tests

```
cargo test --workspace       → 88 Rust unit tests passed (83 original + 5 new for repair)
cargo clippy -- -D warnings  → clean
npx tsc --noEmit             → clean
npx vitest run               → 740 tests passed (48 files), no regressions
git diff --check             → clean
node scripts/check-version-consistency.mjs → all versions match 0.1.0-beta.2
node scripts/check-repo-hygiene.mjs        → all 8 checks passed
node --test scripts/*.test.mjs             → 19 tests passed
```

## Risks

- `git clone` is invoked via `std::process::Command`. If `git` is not on PATH the error is surfaced to the user as "Failed to run git: …". No retry logic.
- Non-RIS repos clone successfully but then fail to open; the cloned directory is NOT automatically cleaned up (by design).
- SSH key pairing relies on the system SSH agent; no additional setup is done here.
- `redact_urls_in_text` scans character-by-character; for very long git output it is O(n) per scheme, which is acceptable.

## Not done

- Credential/token management UI (out of scope).
- Branch selection at clone time (out of scope).
- Shallow clone option (out of scope).
- Progress reporting during clone (out of scope).
- `validate_clone_destination` as a standalone testable helper — left as follow-up; the logic is inlined in `clone_repository_cmd` and is straightforward.

## Suggested next step

Extract `validate_clone_destination(path: &Path) -> Result<(), String>` into a unit-testable helper, covering: non-existent dir → OK, empty dir → OK, non-empty dir → error, existing file → error.
