## Summary

Hardened the SSH askpass session handling from PR #86 by fixing five blocking issues raised in code review:

**A — Hook inheritance prevention**: Git push/pull invoked with askpass env vars now runs with `git -c core.hooksPath=<empty-temp-dir>` so no repository-controlled pre-push or commit-msg hook can inherit `RIS_ASKPASS_PORT`/`RIS_ASKPASS_TOKEN` and connect to the local IPC server. A `TempHooksDir` RAII guard creates and removes the empty directory automatically.

**B — Session lifecycle safety**: Added a `session_id: u64` (CSPRNG) to each `AskpassInner` and `AskpassEnv`. `clear_session(session_id)` compares the id before clearing, so an old timed-out TCP server thread cannot inadvertently clear a newer session. The `cancelled: Arc<AtomicBool>` flag lets `clear_session` / `start_session` signal the background accept-loop to exit without waiting for the full 300 s TCP timeout.

**C — Cryptographically-strong token**: Replaced the timestamp-XOR-PID token with 256 bits of OS CSPRNG randomness via the `getrandom 0.2` crate. Session IDs use 64 bits of CSPRNG. Added `getrandom = "0.2"` to `apps/desktop/src-tauri/Cargo.toml`.

**D — Friendly SSH errors**: Added `ssh_error_message()` helper in `commands/git.rs`. For SSH remotes, it calls `ris_git::classify_git_ssh_error()` on the raw stderr. A match returns a user-friendly message plus `ssh_agent_guidance()` hints; unmatched errors fall back to the raw error string. The raw error is still logged (sanitised).

**E — scp-like URL detection**: `is_ssh_url()` in `ris-git` now recognises any `[user@]host:path` URL where the colon is not followed by `//` (which would indicate a scheme like `git://`). Windows absolute paths (`C:\…`) and local paths (`/`, `~/`, `./`) are explicitly rejected.

## Files changed

### Rust (backend)

- `crates/ris-git/src/lib.rs` — Rewrote `is_ssh_url()` to handle scp-like URLs with arbitrary usernames (not just `git@`). Added 8 new test cases covering scp with/without user, local paths, tilde, relative paths, `git://`, `file://`, unknown schemes.
- `apps/desktop/src-tauri/Cargo.toml` — Added `getrandom = "0.2"`.
- `apps/desktop/src-tauri/src/ssh_askpass.rs`
  - Imports: removed `SystemTime`/`UNIX_EPOCH`; added `AtomicBool`/`Ordering`.
  - `AskpassInner`: added `session_id: u64` and `cancelled: Arc<AtomicBool>`.
  - `AskpassEnv`: added `session_id: u64`.
  - `generate_token()`: 256-bit CSPRNG via `getrandom`.
  - `generate_session_id()`: 64-bit CSPRNG via `getrandom` (new).
  - `start_session()`: cancels any existing session before creating new one; passes `session_id` and `cancelled` to the server thread.
  - `clear_session(session_id)`: guards on session_id match before clearing; signals `cancelled` and wakes blocked `recv_timeout`.
  - `run_askpass_server()`: checks `cancelled` flag in accept loop; only clears its own session by id at exit.
  - Tests: updated `askpass_session_lifecycle_create_and_clear` to pass a session_id; added `generate_token_is_64_hex_chars`, `generate_token_is_unique` (updated), `clear_session_with_wrong_id_does_not_clear`.
- `apps/desktop/src-tauri/src/commands/git.rs`
  - Added `AskpassEnv` to imports.
  - Added `ssh_error_message(&GitError, is_ssh: bool) -> String` helper.
  - `push_git_current_branch`: stores `Option<AskpassEnv>`, passes `is_ssh` as `no_hooks`, clears by `session_id`, uses `ssh_error_message`.
  - `pull_git_ff_only`: same changes.

## Security model

- **No hook inheritance**: `git -c core.hooksPath=<empty-temp-dir>` is set for every push/pull that carries askpass env vars. The empty directory is created fresh for each operation and removed on drop. Repository hooks cannot see `RIS_ASKPASS_PORT`, `RIS_ASKPASS_TOKEN`, or `SSH_ASKPASS` during their execution.
- **CSPRNG token**: 256-bit (64 hex chars) random token from OS CSPRNG. Prevents practical guessing or collision within the local TCP socket lifetime.
- **Session-id lifecycle**: A stale background thread that times out after the user completes an operation cannot clear a newer session started for a subsequent operation.
- **Passphrase lifetime**: unchanged — never stored, logged, or passed via env/CLI.

## Tests

```
cargo fmt --all --check                     — clean
cargo check --workspace                     — clean (0 warnings)
cargo clippy --workspace -- -D warnings     — clean
cargo test -p rack-inventory-studio-desktop — 53 passed, 0 failed
cargo test -p ris-git                       — 50 passed, 0 failed (28 unit + 22 integration)
node scripts/check-version-consistency.mjs  — all 0.1.0-beta.1
node scripts/check-repo-hygiene.mjs         — 8/8 checks
npx tsc --noEmit (apps/desktop)             — clean
npx vitest run                              — 462 passed, 0 errors
git diff --check                            — clean
```

## Risks

- The `TempHooksDir` temp directory path is deterministic (`ris_nohooks_{pid}`). On a multi-user system a malicious user could pre-create it. Mitigated: `create_dir_all` fails silently and the guard becomes `None` (no hooks suppression, but also no credential exposure); adding a random suffix would be a small future improvement.
- `try_send(None)` when cancelling a session may silently fail if the channel buffer is already full (i.e., the user already responded). In practice the passphrase will still be delivered correctly; the cancel is effectively a no-op, which is the safe outcome.

## Not done

- Persistent credential vault / HTTPS token management.
- SSH diagnostics UI panel (data is available via `get_ssh_diagnostics` Tauri command).
- Linux/macOS packaging changes.
- App version bump (intentionally deferred to release milestone).
- `TempHooksDir` with random suffix (low-priority hardening).

## Suggested next step

Build a minimal "SSH Agent Status" section in the Repository panel that calls `get_ssh_diagnostics` when a push/pull fails with an SSH error and displays the guidance strings inline, so users see actionable steps without opening a terminal.
