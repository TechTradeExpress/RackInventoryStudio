# CC Report — fix/git-push-use-origin-remote

## Summary

Two separate fixes on this branch:

1. **Git push remote fix** — Push now uses the configured remote name and never
   adds a redundant `-u` when an upstream is already set.  Missing remote returns
   a clear user-facing error instead of a confusing git message.

2. **SSH askpass modal regression fix** — The passphrase modal was hidden behind
   the busy overlay on Windows and the session expired before the user could
   interact.  Fixed by:
   - Raising modal z-index above the busy overlay
   - Adding `session_id` correlation so stale responses are rejected with a
     friendly message instead of a raw error
   - Emitting a `ssh-passphrase-session-ended` event so the frontend can mark
     an open modal as expired without the user entering a passphrase into a dead
     session
   - Increasing the user timeout from 60 s to 120 s

---

## Part 1 — Git push remote fix

### Observed bug class

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

### Files changed (Part 1)

| File | Change |
|---|---|
| `crates/ris-git/src/lib.rs` | Added `has_remote()`, `branch_has_upstream()`, `get_current_branch()`, `push_args()`; `push_current_branch_with_env` now calls `branch_has_upstream` and uses `push_args`; new SSH alias + push_args unit tests |
| `apps/desktop/src-tauri/src/commands/git.rs` | Both `push_git_current_branch` and `pull_git_ff_only` now propagate `list_remotes` errors and return a clear user-facing error when the named remote is not found |
| `crates/ris-git/tests/git_remote_tests.rs` | 18 new integration/unit tests |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | Added item 6, marked IMPLEMENTED |
| `CHANGELOG.md` | Entry under Fixed |

---

## Part 2 — SSH askpass modal regression fix

### Root cause

`.modal-backdrop` had `z-index: 200` while `.busy-overlay` had `z-index: 500`.
During a push, the busy overlay was rendered on top of the passphrase modal.
The user could not see or interact with the modal.  The 60-second backend
timeout fired, the session was cleared, the overlay disappeared, and the stale
modal became visible.  When the user entered the passphrase, the backend
responded "No active SSH passphrase session".

Secondary issue: no `session_id` correlation existed between the event payload
and the command, so even if the modal appeared it could not distinguish between
a fresh session and a stale one.

### Root cause fixes

| Issue | Fix |
|---|---|
| Modal hidden behind overlay | `app.css`: `.modal-backdrop` z-index 200 → 600 |
| No session_id correlation | `SshPassphraseRequestedPayload { session_id, prompt }` emitted; `respond_ssh_passphrase` command validates `session_id` match |
| Session expiry not signalled to frontend | `ssh-passphrase-session-ended` event emitted by `clear_session` and on timeout |
| Short timeout on slow machines | `USER_TIMEOUT_SECS`: 60 → 120 |

### Files changed (Part 2)

| File | Change |
|---|---|
| `apps/desktop/src/app.css` | `.modal-backdrop` z-index 200 → 600 |
| `apps/desktop/src-tauri/src/ssh_askpass.rs` | Timeout 60→120 s; `SshPassphraseRequestedPayload` / `SshPassphraseSessionEndedPayload` structs; `respond` validates `session_id`; `clear_session_inner` extracted for testability; `clear_session` emits session-ended event; `handle_askpass_connection` emits session-ended on timeout/cancel; `run_askpass_server` passes `own_session_id` to handler |
| `apps/desktop/src-tauri/src/commands/git.rs` | `respond_ssh_passphrase` command accepts `session_id`; both `start_session` calls use `app.clone()` so `clear_session(&app)` compiles; `clear_session` now takes `&AppHandle` |
| `apps/desktop/src/api/tauriClient.ts` | `SshPassphraseRequestedPayload` / `SshPassphraseSessionEndedPayload` types; `respondSshPassphrase` passes `session_id` |
| `apps/desktop/src/features/repository/SshPassphraseModal.tsx` | New `sessionId` + `expired` props; friendly expiry message in footer; "Close" replaces "Cancel" when expired; no submit button when expired; no passphrase input when expired |
| `apps/desktop/src/App.tsx` | `askpassSession` state shape `{ prompt, sessionId, expired }`; `ssh-passphrase-requested` listener uses structured payload; new `ssh-passphrase-session-ended` listener sets `expired: true` on matching session; `SshPassphraseModal` receives `sessionId` and `expired` |
| `apps/desktop/src/features/repository/SshPassphraseModal.test.tsx` | All tests updated with `sessionId`/`expired` props; 5 new tests for expired session behavior |
| `apps/desktop/src-tauri/src/ssh_askpass.rs` (tests) | Fixed old `respond`/`clear_session` test calls; 4 new session_id correlation tests: `respond_fails_when_no_session`, `respond_fails_with_wrong_session_id`, `respond_succeeds_with_correct_session_id`, `respond_cancel_with_correct_session_id`, `clear_session_inner_wrong_id_does_not_clear` |

### Security properties preserved

- Passphrase is not stored in config, env, logs, files, or CLI args.
- Passphrase is never logged (passphrase value excluded from all log lines).
- IPC bound to 127.0.0.1 only.
- Per-operation random token; expires after one use.
- Attempt limit (3) prevents passphrase-loop attacks.
- Hook suppression and askpass hardening (SSH_ASKPASS_REQUIRE=force) unchanged.
- Push still uses the configured remote name, never a constructed URL.

---

## Tests

```
cargo test (apps/desktop/src-tauri)  — 57 passed, 0 failed
cargo test (crates/ris-git)          — 38 passed, 0 failed
cargo clippy -- -D warnings          — 0 errors, 0 warnings
cargo check                          — OK
tsc --noEmit                         — OK
vitest run                           — 466 passed (35 test files)
```

## Risks

- `branch_has_upstream` defaults to `false` on any error. This means `-u` is
  added on every push when the check cannot run. Safe (Git updates tracking to
  same value) but adds a round-trip.
- The `session_id` guard in `respond` requires the frontend to pass the
  `session_id` from the event payload.  If the frontend re-renders and loses the
  session state before the user submits, the modal will show the expiry message
  on the next attempt.  This is expected behavior; the user can retry Push.
- `clear_session` now emits a Tauri event.  If the app is shutting down during a
  push, the emit may fail silently (`.ok()` discards the error), which is safe.

## Not done

- Frontend: dedicated error styling for "no remote" vs SSH authentication errors.
- Dirty repository guard (tracked as follow-up item 7).
- Playwright test coverage for SSH passphrase flow (requires a real SSH server;
  not feasible in the E2E harness).

## Suggested next step

Trigger the Windows Installer builder on this branch and perform manual QA of
the SSH passphrase flow with a real SSH key that requires a passphrase.  Verify
the modal appears above the busy overlay immediately and that a correct
passphrase succeeds.
