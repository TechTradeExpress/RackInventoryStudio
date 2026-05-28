## Summary

Hardened the SSH askpass session handling from PR #86 with two rounds of security fixes.

**Round 1 (A–E) — original fixes:**

**A — Hook inheritance prevention**: Git push/pull invoked with askpass env vars now runs with `git -c core.hooksPath=<empty-unique-dir>` so no repository-controlled pre-push or commit-msg hook can inherit `RIS_ASKPASS_PORT`/`RIS_ASKPASS_TOKEN` and connect to the local IPC server.

**B — Session lifecycle safety**: Added `session_id: u64` (CSPRNG) to `AskpassInner` and `AskpassEnv`. `clear_session(session_id)` compares the id before clearing so a stale background thread cannot wipe a newer session. The `cancelled: Arc<AtomicBool>` flag signals the accept-loop to exit without waiting the full 300 s TCP timeout.

**C — Cryptographically-strong token**: Replaced timestamp-XOR-PID token with 256 bits of OS CSPRNG randomness via `getrandom 0.2`. Session IDs use 64-bit CSPRNG.

**D — Friendly SSH errors**: `ssh_error_message()` helper classifies raw git stderr and returns user-friendly text plus `ssh_agent_guidance()` hints for SSH remotes; unmatched errors fall back to the raw string.

**E — scp-like URL detection**: `is_ssh_url()` now recognises `[user@]host:path` URLs where the colon is not followed by `//`. Windows absolute paths (`C:\…`) and local paths (`/`, `~/`, `./`) are explicitly rejected.

**Round 2 — fail-closed hardening:**

**F — Secure unique temp hooks directory (fail-closed)**: Replaced the deterministic `ris_nohooks_{pid}` path and `create_dir_all` (which accepts pre-existing directories) with `tempfile::Builder::new().prefix("ris-nohooks-").tempdir()`. `TempHooksDir::create()` now returns `Result<Self, GitError>`. If creation fails the error propagates immediately — Git is never spawned with askpass env vars active. Cleanup is handled by the `TempDir` drop impl; no manual `fs::remove_dir_all` needed.

**G — SSH wrapper env hardening**: Added `ASKPASS_ENV_REMOVALS: &[&str] = &["GIT_SSH", "GIT_SSH_COMMAND"]`. When `GitSecurityMode::Askpass` is active, both variables are removed from the git subprocess environment so an inherited SSH wrapper configured in the user's shell cannot intercept askpass secrets. `core.sshCommand` is overridden per-command with `-c core.sshCommand=<ssh_path>` (not a permanent config change) to pin the SSH binary.

**H — Testable command construction**: Introduced `GitSecurityMode { Normal | Askpass { ssh_command } }` enum and extracted `prepare_askpass_hardening(ssh_command) -> Result<(TempHooksDir, Vec<String>), GitError>`. Tests can assert presence/absence of `-c core.hooksPath=` and `-c core.sshCommand=` without spawning git.

## Security model

- **Fail-closed**: If `TempHooksDir::create()` fails, `push_current_branch_with_env` / `pull_ff_only_with_env` return `Err` immediately. Git is never spawned when we cannot guarantee hook isolation.
- **No hook inheritance**: `git -c core.hooksPath=<unique-temp-dir>` overrides hooks for the duration of push/pull. The temp dir is newly-created, empty, and unique per operation.
- **No SSH wrapper inheritance**: `GIT_SSH` and `GIT_SSH_COMMAND` are removed from the subprocess env. `core.sshCommand` is set to the located OpenSSH binary for the duration of the command only.
- **CSPRNG token**: 256-bit (64 hex chars) random token from OS CSPRNG prevents practical guessing within the local TCP socket lifetime.
- **Session-id lifecycle**: Stale background threads cannot clear newer sessions.
- **Passphrase lifetime**: Never stored, logged, or passed via env/CLI.

## Files changed

### Rust (backend)

- `crates/ris-git/Cargo.toml` — Moved `tempfile = "3"` from `[dev-dependencies]` to `[dependencies]` (needed in production code for `TempHooksDir`).
- `crates/ris-git/src/lib.rs`
  - `run_git_impl`: added `remove_env: &[&str]` parameter; each key is removed from subprocess env.
  - `TempHooksDir`: replaced `PathBuf`-based deterministic impl with `tempfile::TempDir`; `create()` returns `Result<Self, GitError>` (fail-closed).
  - `GitSecurityMode`: new public enum `Normal | Askpass { ssh_command: String }`.
  - `ASKPASS_ENV_REMOVALS`: `&["GIT_SSH", "GIT_SSH_COMMAND"]`.
  - `prepare_askpass_hardening`: internal function returning `(TempHooksDir, Vec<String>)` with `-c core.hooksPath=<dir>` and `-c core.sshCommand=<ssh>` args.
  - `push_current_branch_with_env` / `pull_ff_only_with_env`: accept `GitSecurityMode`; propagate `prepare_askpass_hardening` errors before spawning git.
  - `is_ssh_url()`: rewrote to handle scp-like URLs with arbitrary usernames; rejects local paths and `git://`/`file://` schemes.
  - New unit tests: `temp_hooks_dir_creates_unique_empty_dirs`, `temp_hooks_dir_does_not_use_deterministic_pid_suffix`, `temp_hooks_dir_is_removed_on_drop`, `prepare_askpass_hardening_produces_correct_args`, `prepare_askpass_hardening_dirs_are_unique`, `askpass_env_removals_include_git_ssh_vars`, `askpass_mode_has_ssh_command_override`, `normal_mode_build_produces_no_security_args`.
- `crates/ris-git/tests/git_remote_tests.rs` — Added integration tests: `askpass_mode_push_to_local_remote_succeeds`, `askpass_mode_pull_from_local_remote_succeeds`, `normal_mode_push_unaffected_by_security_refactor`.
- `apps/desktop/src-tauri/Cargo.toml` — Added `getrandom = "0.2"`.
- `apps/desktop/src-tauri/src/ssh_askpass.rs`
  - `AskpassInner`: added `session_id: u64`, `cancelled: Arc<AtomicBool>`.
  - `AskpassEnv`: added `session_id: u64`.
  - `generate_token()`: 256-bit CSPRNG via `getrandom`.
  - `generate_session_id()`: 64-bit CSPRNG (new).
  - `start_session()`: cancels existing session before creating new one.
  - `clear_session(session_id)`: guards on session_id match; signals `cancelled`.
  - `run_askpass_server()`: checks `cancelled` in accept loop.
- `apps/desktop/src-tauri/src/commands/git.rs`
  - `ssh_error_message()`: friendly SSH error helper.
  - `push_git_current_branch` / `pull_git_ff_only`: use `GitSecurityMode::Askpass { ssh_command }`, clear by `session_id`.

## Tests

```
cargo fmt --all --check                     — clean
cargo check --workspace                     — clean (0 warnings)
cargo clippy --workspace -- -D warnings     — clean
cargo test -p rack-inventory-studio-desktop — 53 passed, 0 failed
cargo test -p ris-git                       — 61 passed, 0 failed (36 unit + 25 integration)
node scripts/check-version-consistency.mjs  — all 0.1.0-beta.1
npx tsc --noEmit (apps/desktop)             — clean
npx vitest run (apps/desktop)               — 462 passed, 0 errors
git diff --check                            — clean
```

Manual QA of SSH passphrase flow against a live remote has not been performed in this automated session and remains required before merging.

## Risks

- `try_send(None)` when cancelling a session may silently fail if the channel buffer is already full (the user already responded). The passphrase is still delivered correctly; the cancel is effectively a no-op — the safe outcome.
- `core.sshCommand` override assumes the located `ssh` binary is OpenSSH-compatible. If `find_ssh_executable()` returns a non-standard SSH wrapper the override may break SSH authentication. Mitigated by `find_ssh_executable` preferring known-good paths.

## Not done

- Manual QA of SSH passphrase flow against a real remote.
- Persistent credential vault / HTTPS token management.
- SSH diagnostics UI panel (data is available via `get_ssh_diagnostics` Tauri command).
- Linux/macOS packaging changes.
- App version bump (intentionally deferred to release milestone).
- `TempHooksDir` random suffix (now moot — `tempfile::tempdir()` already provides uniqueness).

## Suggested next step

Build a minimal "SSH Agent Status" section in the Repository panel that calls `get_ssh_diagnostics` when a push/pull fails with an SSH error and displays the guidance strings inline, so users see actionable steps without opening a terminal.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
