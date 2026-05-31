# CC Report — PR I: Git transport hardening (SEC-01)

## Summary

PR I — Git transport hardening (SEC-01).

Two commits on `harden/git-transport-protocols`:

1. **Commit 1** (`docs`): Updated `docs/BETA1_FOLLOWUP_PLAN_EN.md` with a
   pre-beta.2 hardening plan. Added SEC-01 entry documenting the threat and fix,
   added PR I to the PR grouping table, and added a prioritised backlog covering
   SEC-01 (implemented), DATA-01 (open), and lower-priority items.

2. **Commit 2** (`harden`): Implemented SEC-01 in `crates/ris-git`:
   - `TRANSPORT_SAFETY` constant with `-c protocol.ext.allow=never` and
     `-c protocol.fd.allow=never`, prepended to every `git push` and `git pull`
     invocation.
   - `validate_remote_url` (public) rejects `ext::`, `fd::`, `ssh+git://`,
     and all other dangerous or unsupported schemes. Accepted allowlist:
     `https://`, `ssh://`, SCP-like SSH (including SSH config host aliases).
   - `add_remote` now calls `validate_remote_url`.
   - `is_ssh_url` fixed: double-colon transport helpers (`ext::`, `fd::`) no
     longer misclassify as SCP-like SSH remotes.
   - 13 integration-test call sites updated to use `add_remote_for_test` helper
     (bypasses URL validation for test-only local repos, which are intentionally
     rejected by the public API).
   - 22 new unit tests + 11 new integration tests.

**Review fix commit** (`fix(git): keep remote URL scheme allowlist minimal`):
   - Removed `ssh+git://` from `validate_remote_url` accepted schemes —
     not required for beta.2 and not covered by askpass handling.
   - Updated `validate_url_accepts_ssh_git_scheme` → `validate_url_rejects_ssh_git_scheme`.
   - Updated doc comments in `lib.rs` and `docs/BETA1_FOLLOWUP_PLAN_EN.md`.

## Files changed

| File | Change |
|---|---|
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | SEC-01 entry, PR I in table, pre-beta.2 backlog section |
| `crates/ris-git/src/lib.rs` | `TRANSPORT_SAFETY`, `validate_remote_url`, `add_remote` update, `is_ssh_url` fix, push/pull transport flag injection, new unit tests |
| `crates/ris-git/tests/git_remote_tests.rs` | `add_remote_for_test` helper, 13 call-site updates, new integration tests for URL validation and transport safety |

## Tests

```
cargo test -p ris-git
```

- 68 unit tests in `lib.rs` — all pass (includes 22 new)
- 37 integration tests in `git_remote_tests.rs` — all pass (includes 11 new)
- 12 integration tests in `git_tests.rs` — all pass (no change)

```
cargo test --workspace
```

All workspace tests pass; 0 failures.

```
cargo clippy --workspace -- -D warnings
```

No warnings or errors.

## Risks

- **`validate_remote_url` rejects `file://` and local paths**: This is intentional.
  Any test that previously called `ris_git::add_remote` with a local bare-repo
  path now uses `add_remote_for_test`, which calls `git remote add` directly.
  The production code path (Tauri commands) only ever receives URLs the user
  types into the Git panel, so no real-world regression.
- **`TRANSPORT_SAFETY` on local pulls**: `protocol.ext.allow=never` does not
  affect the `file://` or local-path transports; verified by the new
  `pull_with_transport_safety_succeeds_on_local_repo` test.

## Not done

- DATA-01 (atomic YAML writes) — separate item, not in scope.
- SEC-02 (writer containment), SEC-03 (diagnostics redaction) — separate items.
- No changes to the Tauri commands layer — transport flags flow through
  `push_current_branch_with_env` and `pull_ff_only_with_env` which the Tauri
  layer already calls; no Tauri-level changes needed.

## Suggested next step

Open a PR for this branch against `master` and attach the review context to
ChatGPT for sign-off before merging.
