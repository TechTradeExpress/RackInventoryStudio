# CC Report — PR K: Redact credentials in user-facing Git errors (SEC-03)

## Summary

PR K implements SEC-03: credentials that appear in Git error messages are now
redacted before the error text reaches the frontend or appears in the SSH detail
banner.

**Rust layer — `crates/ris-git/src/lib.rs`**:

- `pub fn redact_git_error(msg: &str) -> String` applies four targeted redactions
  in order:
  1. HTTPS URLs with embedded credentials (`user:pass@host` → `[redacted]@host`)
  2. `ghp_XXXX` GitHub token bodies → `[redacted]`
  3. `github_pat_XXXX` PAT bodies → `[redacted]`
  4. `key=VALUE` credential pairs for `access_token`, `token`, `password`,
     `passphrase` (case-insensitive) → `key=[redacted]`

- `GitError::Display::CommandFailed` now routes `stderr` through
  `redact_git_error` before formatting.

- 10 unit tests in `mod redaction_tests` covering all four patterns plus the
  `GitError::Display` path.

**Rust layer — `apps/desktop/src-tauri/src/commands/git.rs`**:

- `ssh_error_message`: the `raw_detail` string (`\n\nGit output:\n{stderr}`) now
  passes `stderr` through `ris_git::redact_git_error` before appending.

**TypeScript layer — `apps/desktop/src/lib/redact.ts`**:

- `export function redactUrlCredentials(msg: string): string` — regex-based
  defence-in-depth redaction of `https://userinfo@host` patterns. Applied at the
  frontend before setting push/pull error state.

**TypeScript layer — `apps/desktop/src/features/repository/RepositoryPanel.tsx`**:

- `setPushError` and `setPullError` now call `redactUrlCredentials(String(e))`
  instead of `String(e)` directly.

**TypeScript tests — `apps/desktop/src/lib/redact.test.ts`**:

- 5 new tests for `redactUrlCredentials` covering: user:password URL, token
  as userinfo, credential-free URL preserved, safe message preserved, multiple
  URLs in one message.

**Docs — `docs/BETA1_FOLLOWUP_PLAN_EN.md`**:

- PR K row added to the PR table (Item 15).
- SEC-03 row in the security backlog marked ✅ Implemented (PR K).
- Section 15 added with threat description and implementation details.

## Files changed

| File | Change |
|---|---|
| `crates/ris-git/src/lib.rs` | `redact_git_error` + 4 helpers; `CommandFailed::Display` updated; 10 unit tests |
| `apps/desktop/src-tauri/src/commands/git.rs` | `ssh_error_message` raw_detail passes through `redact_git_error` |
| `apps/desktop/src/lib/redact.ts` | New `redactUrlCredentials` export |
| `apps/desktop/src/lib/redact.test.ts` | 5 new tests for `redactUrlCredentials` |
| `apps/desktop/src/features/repository/RepositoryPanel.tsx` | `setPushError`/`setPullError` use `redactUrlCredentials` |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | PR K row, SEC-03 ✅, Section 15 |

## Tests

```
cargo fmt --all --check
```
Pass (fmt applied; one minor formatting fixup to `redact_git_error`'s body).

```
cargo check --workspace
```
Pass.

```
cargo test --workspace
```
All pass (0 failures).

```
cargo clippy --workspace -- -D warnings
```
Pass (one clippy fix: trailing `let` binding → direct return).

```
npx tsc --noEmit
```
No type errors.

```
/workspace/project/apps/desktop/node_modules/.bin/vitest run apps/desktop/src/lib/redact.test.ts
```
28/28 pass (all 5 new `redactUrlCredentials` tests pass).

```
node scripts/check-repo-hygiene.mjs
```
All 8 checks pass.

## Risks

- **`e.to_string()` fallback in `ssh_error_message`**: For non-SSH remotes or
  unrecognised SSH errors, `ssh_error_message` returns `e.to_string()`. Since
  `GitError::Display::CommandFailed` now calls `redact_git_error`, this path is
  also covered.
- **Regex vs. parser in TS**: `redactUrlCredentials` uses a regex
  (`https://([^@\s'")\/>]+)@`) rather than a URL parser. This is intentionally
  conservative — it matches any non-whitespace/quote run before `@`, including
  multi-segment `user:pass` and bare tokens. False positives (redacting a
  non-credential `@` in a URL) are safe.
- **Non-HTTPS credential patterns**: `redact_git_error` covers HTTPS embedded
  credentials and token patterns. SSH URLs (`git@host`) do not embed credentials
  in the URL text and are not a concern here.
- **Vitest environment failures**: 23 test files fail with `document is not
  defined` due to Node 18 / jsdom incompatibility in the CI environment. These
  failures are pre-existing (identical count before and after this PR) and are
  unrelated to PR K changes.

## Not done

- SEC-03 logging redaction beyond push/pull (e.g. commit, status errors) —
  `sanitize_error` already covers logs; this PR adds user-facing redaction only.
- Persistent credential vault / HTTPS token management — separate item.
- `serde_yaml` migration — separate item.

## Suggested next step

Generate the review context and attach to ChatGPT for sign-off before merging PR K.
