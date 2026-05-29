# CC Report — fix/git-push-use-origin-remote

## Summary

Fixed Git push to use the configured remote name and preserve SSH alias remotes.
Two bugs corrected plus SSH alias test coverage added.

## Observed bug class

A user whose `origin` is configured as an SSH scp-like alias
(`ssh-alias:owner/repo.git`) may see push fail or behave unexpectedly if the
push code constructs or substitutes a URL.  The investigation found no active URL
substitution, but revealed two real gaps:

1. Push always added `-u` (`--set-upstream`) regardless of whether the branch
   already had a tracking branch configured, contrary to the spec.
2. When the named remote does not exist, `list_remotes().unwrap_or_default()`
   silently returned an empty list; `remote_url` became `None`, `is_ssh` became
   `false`, and git ran `push` against an unknown remote — producing a confusing
   Git error instead of a user-facing "remote not configured" message.

## Root cause

**Bug 1 — always -u**:
`push_current_branch_with_env` hardcoded `["push", "-u", remote, branch]`.
There was no call to `branch_has_upstream()` before building the args.

**Bug 2 — swallowed list_remotes error**:
Both Tauri handlers (`push_git_current_branch`, `pull_git_ff_only`) used
`list_remotes(...).unwrap_or_default()`.  If the remote name was absent from the
list, the handlers proceeded as if `is_ssh = false` and let git fail generically.

## Push command behavior before/after

| Scenario | Before | After |
|---|---|---|
| First push (no upstream) | `git push -u origin <branch>` ✓ | `git push -u origin <branch>` ✓ |
| Subsequent push (upstream set) | `git push -u origin <branch>` (redundant -u) | `git push origin <branch>` ✓ |
| Remote does not exist | git fails: "repository 'origin' does not appear to be a git repository" | Clear error: "No remote named "origin" is configured…" |
| SSH alias remote `ssh-alias:repo.git` | URL used only for askpass detect (correct); push uses name (correct) | Same + explicit test coverage added |

## Files changed

| File | Change |
|---|---|
| `crates/ris-git/src/lib.rs` | Added `has_remote()`, `branch_has_upstream()`, `get_current_branch()`, `push_args()`; `push_current_branch_with_env` now calls `branch_has_upstream` and uses `push_args`; new SSH alias + push_args unit tests |
| `apps/desktop/src-tauri/src/commands/git.rs` | Both `push_git_current_branch` and `pull_git_ff_only` now propagate `list_remotes` errors and return a clear user-facing error when the named remote is not found |
| `crates/ris-git/tests/git_remote_tests.rs` | 18 new integration/unit tests |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | Added item 6 (plan commit), then marked IMPLEMENTED (implementation commit) |
| `CHANGELOG.md` | Entry under Fixed |

## How origin remote is detected

`list_remotes()` is called while holding the session lock.  The result is
searched for the remote name passed by the frontend.  If not found, an explicit
error is returned before the lock is released and before any git subprocess is
spawned.

## How no-upstream push sets tracking

`branch_has_upstream()` runs `git rev-parse --abbrev-ref --symbolic-full-name @{u}`.
Exit zero means upstream is configured.  Non-zero (including "no upstream configured")
means `push_args` will include `-u`.  Any IO/parse error in `branch_has_upstream`
defaults to `false` (treat as no upstream) so that tracking is always set on first push.

## How SSH alias remotes are preserved

`is_ssh_url("ssh-alias:owner/repo.git")` returns `true` via the scp-like path in
`lib.rs:762-768` (colon present, nothing after it starts with `//`).  The URL is
used **only** to decide whether to start an askpass session.  The push command
always uses the remote **name** (`origin`), never the URL.

## How askpass is attached to this push path

`push_git_current_branch` calls `ris_git::push_current_branch_with_env` with
`extra_env` (askpass env vars) and `GitSecurityMode::Askpass`.  The function builds
args via `push_args()` (remote name + conditional -u) and prepends security `-c`
overrides.  Askpass is active on the same execution path regardless of whether `-u`
is included.

## Tests added/updated

**Unit tests in `crates/ris-git/src/lib.rs` `ssh_tests` module** (4 new):
- `is_ssh_url_recognises_ssh_config_alias_no_user` — `ssh-alias:owner/repo.git` → true
- `is_ssh_url_recognises_ssh_config_alias_with_hyphen`
- `is_ssh_url_recognises_user_at_custom_host`
- `is_ssh_url_rejects_windows_absolute_path`
- `push_args_no_upstream_includes_set_upstream_flag`
- `push_args_with_upstream_omits_set_upstream_flag`
- `push_args_ssh_alias_remote_uses_remote_name_not_url` — regression assertion
- `push_args_existing_upstream_uses_remote_name_only`

**Integration tests in `crates/ris-git/tests/git_remote_tests.rs`** (10 new):
- `has_remote_returns_true_for_configured_remote`
- `has_remote_returns_false_for_missing_remote`
- `branch_has_upstream_false_before_first_push`
- `branch_has_upstream_true_after_push_with_set_upstream`
- `push_args_ssh_alias_remote_uses_name_not_url`
- `push_args_no_upstream_sets_tracking_flag`
- `push_args_existing_upstream_omits_tracking_flag`
- `push_second_time_omits_set_upstream_flag` — integration: first push sets upstream, second push works without -u
- `push_returns_error_on_detached_head`
- `push_invalid_remote_name_returns_error` — URL passed as remote name rejected by `validate_remote_name`
- `askpass_mode_push_uses_same_remote_name_command` — askpass path verified
- `ssh_alias_remote_url_is_classified_as_ssh`
- `non_ssh_remote_urls_are_not_classified_as_ssh`

## Checks run and results

```
git diff --check                        — OK
node check-version-consistency.mjs      — OK (all 0.1.0-beta.1)
node --test scripts/*.test.mjs          — 17 passed
node check-repo-hygiene.mjs             — 8/8 checks passed
cargo fmt --all --check                 — OK
cargo check --workspace                 — OK
cargo test --workspace                  — all suites pass (0 failures)
cargo clippy --workspace -- -D warnings — OK (0 errors)
tsc --noEmit                            — OK
vitest run                              — 461 passed (35 test files)
playwright test                         — 21 passed
```

actionlint not available locally — CI workflow-lint relied on for workflow validation.

## Manual QA status

Not performed (requires a real SSH alias remote). Checklist is documented below.

## Manual QA checklist

1. Configure a local Git repository with an SSH alias-style origin:
   `git remote add origin ssh-alias:owner/repo.git`
2. Confirm `git remote -v` shows the alias URL unchanged.
3. From terminal, confirm `git push -u origin main` works with that alias (verifies SSH config alias is functional).
4. From RIS, click Push in the Git panel.
5. Confirm RIS uses `origin`, not a constructed `git@github.com:...` URL.
6. If the key requires a passphrase, confirm the RIS askpass modal appears.
7. Correct passphrase → push succeeds.
8. Cancel / wrong passphrase → clear failure message, no crash.
9. Error output must not mention `git@github.com` unless that exact URL is configured or returned by Git stderr.
10. Remove the origin remote (`git remote remove origin`) and retry Push from RIS.
    Expect "No remote named 'origin' is configured" error.
11. Check out a commit directly (`git checkout <hash>`) to detach HEAD.
    Retry Push from RIS. Expect "detached" / "branch" error.

## Risks

- `branch_has_upstream` defaults to `false` on any error (including I/O failure or
  unexpected git output format). This means `-u` will be added on every push when
  the check cannot run. This is safe — Git will update the tracking branch to the
  same value — but adds a round-trip.
- The "no remote" guard runs inside the session lock; if `list_remotes` itself spawns
  a git subprocess that hangs, the lock is held during the hang. This is the same
  risk that existed before (the old `unwrap_or_default()` call also ran inside the
  lock). Not addressed in this PR.

## Not done

- Frontend: dedicated error styling for "no remote" vs SSH authentication errors.
- Dirty repository guard (tracked as follow-up item 7).
- `pull_git_ff_only` upstream detection (currently always pulls without `-u`, which
  is correct for pull; no change needed there).

## Scope confirmation

No version change. No installer workflow change. No rack DnD change. No CSV change.
No height override change. No credential vault. No stored passphrase setting.
