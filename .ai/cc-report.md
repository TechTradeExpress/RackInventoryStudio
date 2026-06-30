## Summary

PR: harden(git): route clone through ris-git with transport allowlist

Branch: `harden/beta3-clone-transport-safety` → base: `roadmap/beta3`

Audit finding F1: `clone_repository_cmd` shelled out directly to `git clone`
bypassing ris-git's transport safety and URL validation. Unsafe transports
(`ext::`, `fd::`, `file://`) were not blocked before process spawn.

Fix: route clone through `ris_git::clone()` which calls `validate_remote_url`
before spawning any process, and includes `TRANSPORT_SAFETY` flags
(`-c protocol.ext.allow=never -c protocol.fd.allow=never`) in the git
invocation. Frontend adds matching defense-in-depth validation.

No version bump. No tags. No GitHub Release.

## Files changed

| File | Change |
|---|---|
| `crates/ris-git/src/lib.rs` | Added `run_git_global` (no-cwd runner), `build_clone_args` (pure, testable arg builder), `clone` (public entry point with URL validation + TRANSPORT_SAFETY) |
| `crates/ris-git/tests/git_remote_tests.rs` | Added 8 new tests: URL rejection for ext/fd/file/http/blank, build_clone_args structure checks, TRANSPORT_SAFETY ordering assertion |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Replaced raw `std::process::Command::new("git")` clone with `ris_git::clone(&url, &destination)` |
| `apps/desktop/src-tauri/src/diagnostics.rs` | Removed `redact_urls_in_text` and `sanitize_git_error` (both now dead code; ris_git::GitError::Display handles redaction) and their 2 tests |
| `apps/desktop/src/features/repository/cloneHelpers.ts` | Added `validateCloneUrl` — mirrors backend logic, rejects `::`, `file://`, unsupported schemes |
| `apps/desktop/src/features/repository/CloneRepositoryForm.tsx` | Wires `validateCloneUrl` into `urlError`; shows inline error for non-empty invalid URLs |
| `apps/desktop/src/features/repository/cloneHelpers.test.ts` | Added 12 new `validateCloneUrl` tests |
| `apps/desktop/src/features/repository/CloneRepositoryForm.test.tsx` | Added 6 new form-level tests for unsafe URL rejection |
| `docs/BETA3_QA_RUNBOOK.md` | Added cases 1.10–1.12: unsafe transport rejection (ext::, fd::, file://) |
| `CHANGELOG.md` | Added Security section entry under Unreleased |

## Audit finding F1

`clone_repository_cmd` previously ran:
```rust
std::process::Command::new("git")
    .args(["clone", "--", &url, &destination])
    .output()
```
The `--` separator prevents option injection but does NOT block `ext::`,
`fd::`, or `file://` transports which can execute arbitrary commands.

## What changed in ris-git

- `validate_remote_url` (existing): rejects `::`, `file://`, all non-SSH/HTTPS `://` schemes, local paths. Already used by `add_remote`.
- `TRANSPORT_SAFETY` (existing): `["-c", "protocol.ext.allow=never", "-c", "protocol.fd.allow=never"]`
- `build_clone_args(url, dest)` (new): returns `[TRANSPORT_SAFETY..., "clone", "--", url, dest]`
- `run_git_global(args)` (new): like `run_git_impl` but without `current_dir` (clone has no repo yet)
- `clone(url, dest)` (new): validates URL first, then calls `run_git_global` with hardened args

## What changed in Tauri command

`clone_repository_cmd` in `repository.rs`:
- Removed: direct `std::process::Command::new("git")` invocation
- Added: `ris_git::clone(&url, &destination).map_err(|e| { ... })?`
- Pre-clone destination validation (non-empty dir check) unchanged
- Log redaction unchanged (`redact_git_url`, `sanitize_error`)
- Post-clone open/validate behavior unchanged

## Frontend validation

`validateCloneUrl(url: string): string | null` in `cloneHelpers.ts`:
- Blank → error
- Contains `::` → error ("Unsupported Git URL. Use HTTPS or SSH clone URLs.")
- `https://` or `ssh://` → ok
- Any other `://` (file://, http://, git://) → error
- SCP-like with `:` (git@github.com:org/repo.git) → ok

Wired into `CloneRepositoryForm.tsx`:
- `urlError` now uses `validateCloneUrl(url)` instead of blank check
- Submit button disabled when `urlError != null`
- Error message shown inline when URL is non-empty but invalid

## Blocked URL schemes

- `ext::sh -c '...'` — rejected by both backend and frontend
- `fd::4` — rejected by both
- `file:///any/path` — rejected by both
- `http://...` — rejected by both
- `git://...` — rejected by both

## Allowed clone URL examples

- `https://github.com/org/repo.git`
- `ssh://git@github.com/org/repo.git`
- `git@github.com:org/repo.git`
- `github-alias:org/repo.git`

## Tests added

| Location | Count | Type |
|---|---|---|
| `crates/ris-git/tests/git_remote_tests.rs` | +8 | Rust (clone rejection, build_clone_args structure) |
| `cloneHelpers.test.ts` | +12 | Vitest (validateCloneUrl unit) |
| `CloneRepositoryForm.test.tsx` | +6 | Vitest (form-level unsafe URL block) |

## Manual QA required

- HTTPS clone from a safe test repo (happy path)
- Type `ext::sh -c 'echo blocked'` in URL field → submit disabled, error shown
- Type `fd::4` in URL field → submit disabled
- Type `file:///tmp/repo.git` in URL field → submit disabled
- Non-empty destination still rejected before clone starts
- Clone of non-RIS repo surfaces validation error, no deletion of clone
- See `docs/BETA3_QA_RUNBOOK.md` cases 1.10–1.12

## Tests

```
cargo fmt --all --check                       → clean
cargo clippy --workspace -- -D warnings       → clean
cargo check --workspace                       → clean
cargo test -p ris-git                         → 139 passed (82 lib + 45 remote + 12 git_tests)
cargo test -p ris-import                      → 76 passed
cargo test --manifest-path src-tauri/Cargo.toml → 114 passed
vitest run (apps/desktop)                     → 817 passed, 0 failed
tsc --noEmit                                  → 0 errors
vite build                                    → success
node scripts/check-version-consistency.mjs    → 0.1.0-beta.2, all match
node --test scripts/*.test.mjs                → 19 passed
node scripts/check-repo-hygiene.mjs           → 8/8 checks passed
```

## Risks

- `run_git_global` does not set `current_dir`. Git resolves the destination
  path from the process working directory, which is safe because the caller
  always passes an absolute path (constructed by the frontend from `parentPath
  + dirName`). If a future caller passes a relative path, this could behave
  unexpectedly.
- `sanitize_git_error` / `redact_urls_in_text` removed from `diagnostics.rs`.
  Error messages for clone failures now rely on `ris_git::GitError::Display`
  for redaction (which uses `redact_git_error`). This redacts HTTPS credentials
  but does NOT replace local path tokens. For the clone path this is acceptable:
  if clone fails, the destination path was chosen by the user (not secret), and
  the URL is redacted via `ris_git`'s own redaction.

## Not done

- Tauri command unit tests for `clone_repository_cmd` — state setup overhead
  is high; ris-git tests + frontend validation tests provide adequate coverage.
  Documented above.
- SSH passphrase flow for clone (separate issue, separate PR).

## Confirmation

- No version bump ✓
- No tags created ✓
- No GitHub Release created ✓
- No `.ai/review-context-*.md` committed ✓

## Suggested next step

Manual QA of cases 1.10–1.12 in `docs/BETA3_QA_RUNBOOK.md` (unsafe transport
rejection), then prepare beta.3 release PR (version bump `0.1.0-beta.2` →
`0.1.0-beta.3`, CHANGELOG finalization, release notes).
