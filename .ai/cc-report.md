## Summary

Implemented safe SSH passphrase handling for push/pull operations (post-beta 1 follow-up item 2). When a Git operation requires a key passphrase and no ssh-agent has the key loaded, OpenSSH invokes the app binary in askpass helper mode. The app intercepts this via a short-lived localhost TCP session, prompts the user once via a frontend modal, and forwards the passphrase only to SSH via stdout. The passphrase is never stored, logged, or passed through environment variables or CLI arguments.

Also updated the post-beta follow-up plan document to reflect the correct implementation direction (removing incorrect "stored passphrase field" approach).

## Files changed

### Rust (backend)

- `crates/ris-git/src/lib.rs` — Added `push_current_branch_with_env`, `pull_ff_only_with_env` (with `extra_env: &[(&str, &str)]`), kept original functions as wrappers. Added `is_ssh_url()` and `classify_git_ssh_error()`. Added 14 unit tests.
- `apps/desktop/src-tauri/src/ssh_askpass.rs` — New module. Contains `AskpassState` (Tauri managed state), TCP server loop, `run_as_askpass()` (askpass helper mode entry point), SSH diagnostics (`probe_ssh_add`, `find_ssh_executable`, `get_ssh_version`, `get_core_ssh_command`, `ssh_agent_guidance`), `build_askpass_env_pairs()`, and unit/integration tests including TCP roundtrip tests.
- `apps/desktop/src-tauri/src/commands/git.rs` — Updated `push_git_current_branch` and `pull_git_ff_only` to accept `State<AskpassState>` and `AppHandle`, detect SSH remotes, and start/clear askpass sessions. Added `respond_ssh_passphrase` and `get_ssh_diagnostics` commands.
- `apps/desktop/src-tauri/src/commands/mod.rs` — Re-exported `respond_ssh_passphrase` and `get_ssh_diagnostics`.
- `apps/desktop/src-tauri/src/dto.rs` — Added `SshDiagnosticsDto`.
- `apps/desktop/src-tauri/src/lib.rs` — Added `mod ssh_askpass`, `pub use ssh_askpass::run_as_askpass`, managed `AskpassState`, registered new commands.
- `apps/desktop/src-tauri/src/main.rs` — Detects `RIS_ASKPASS_MODE=1` and runs `run_as_askpass()` before the GUI starts.

### TypeScript / React (frontend)

- `apps/desktop/src/api/tauriClient.ts` — Added `SshDiagnosticsDto` interface, `respondSshPassphrase()`, `getSshDiagnostics()` functions.
- `apps/desktop/src/features/repository/SshPassphraseModal.tsx` — New modal component: shows OpenSSH prompt, password input, Continue/Cancel buttons, ssh-add guidance. Calls `respondSshPassphrase` on submit or cancel. Clears input after each use.
- `apps/desktop/src/App.tsx` — Added `useEffect` with `listen("ssh-passphrase-requested", ...)` and renders `<SshPassphraseModal>`.
- `apps/desktop/src/App.nav.test.tsx` — Added mocks for `@tauri-apps/api/event` and `SshPassphraseModal` to prevent test breakage.

### Docs

- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — Section 2 updated: removed incorrect "stored passphrase field" direction; documented correct ssh-agent primary / SSH_ASKPASS secondary / diagnostics approach.
- `CHANGELOG.md` — Added SSH passphrase prompting, SSH diagnostics, SSH error classification, and security note to Unreleased section.

### Tests

- `apps/desktop/src/features/repository/SshPassphraseModal.test.tsx` — New test file: 8 tests covering modal appearance, submit, cancel, Enter key, input clearing, guidance text.

## Security model

- **Passphrase lifetime**: Entered once in the frontend modal → sent via `respondSshPassphrase` Tauri command → forwarded via `mpsc::SyncSender` to TCP thread → written to TCP stream → read from stdout by OpenSSH. Never touches disk, logs, env vars, or CLI args.
- **Token**: Per-operation random token prevents other processes from connecting to the short-lived TCP server.
- **IPC binding**: `127.0.0.1` only, random OS-assigned port, lifetime ≤ 300s TCP accept + 60s user response.
- **Attempt limit**: MAX_ASKPASS_ATTEMPTS=3 prevents infinite passphrase prompt loops.
- **Cancellation**: If the user cancels or the session times out, `CANCEL\n` is sent to the helper, SSH receives exit code 1 and fails cleanly.

## Tests

```
cargo fmt --all --check          — clean
cargo check -p rack-inventory-studio-desktop — clean (0 warnings)
cargo clippy -p rack-inventory-studio-desktop -p ris-git -- -D warnings — clean
cargo test -p rack-inventory-studio-desktop -p ris-git — all pass
node scripts/check-version-consistency.mjs — all 0.1.0-beta.1
node scripts/check-repo-hygiene.mjs        — 8/8 checks
tsc --noEmit (apps/desktop)                — clean
vitest run                                  — 470 passed, 0 errors
```

## Risks

- `run_as_askpass()` requires the binary to be invocable as a subprocess of SSH. On Windows, the binary path may contain spaces — handled via `current_exe()` which returns the full path; SSH_ASKPASS uses the full path. Spaces in paths should be safe as OpenSSH exec's the path directly.
- The TCP token is not cryptographically strong (timestamp XOR nanos + PID). Sufficient for the threat model (short-lived local socket, no sensitive data besides passphrase lifetime), but not CSPRNG-quality.
- SSH diagnostics (`probe_ssh_add`, `find_ssh_executable`) spawn subprocesses with 3-second timeouts. On slow machines these could briefly block the Tauri command thread. These are diagnostic-only and not on the push/pull hot path.
- `classify_git_ssh_error` is implemented in `ris-git` but not yet surfaced to the frontend via the error DTOs from push/pull — it's available for future use.

## Not done

- Persistent credential vault / HTTPS token management.
- Surfacing `classify_git_ssh_error` output in push/pull error messages displayed to the user (function exists, wiring to frontend deferred).
- SSH diagnostics UI panel in the app (data available via `get_ssh_diagnostics` command but no panel was built in this PR).
- Linux/macOS packaging changes.
- App version bump (intentionally left to a release milestone).

## Suggested next step

Wire `classify_git_ssh_error` into the push/pull error DTOs returned to the frontend so users see "Permission denied (publickey). No identities found in SSH agent." instead of raw git stderr. Also build a minimal SSH diagnostics section in the Repository panel that shows agent status and guidance when a push/pull fails.
