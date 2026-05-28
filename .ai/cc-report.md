## Summary

Hardened the SSH askpass session handling (PR #86) across two rounds of fixes.

**Round 1 (A–E) — original hardening:**
CSPRNG tokens, session-id lifecycle, scp URL detection, friendly SSH errors, TempHooksDir via tempfile.

**Round 2 (F–H) — fail-closed and env-var hardening:**
Unique TempHooksDir, GIT_SSH/GIT_SSH_COMMAND removal, core.sshCommand override, GitSecurityMode enum.

**Round 3 — restore working SSH configuration after Windows QA failure:**

*Root cause:* Windows manual QA showed push/pull failing with "Could not read from remote repository" while terminal `git push` succeeded. The app was overriding `core.sshCommand` with the first `ssh` found in PATH and removing `GIT_SSH`/`GIT_SSH_COMMAND` from the subprocess env. This silently replaced the user's working SSH configuration (identity file, agent, custom wrapper) with a different binary or no binary, causing SSH to be unable to reach the remote at all.

**A — Preserve user SSH configuration**:
- `GIT_SSH` and `GIT_SSH_COMMAND` are user-controlled env vars; they are no longer removed from the git subprocess in askpass mode. Removing them was breaking the user's terminal SSH configuration.
- `core.sshCommand` is no longer blindly overridden for every askpass operation. It is overridden **only** when the repository has a repo-local `core.sshCommand` in `.git/config` (detectable as a relative path in `git config --show-origin` output), which could be untrusted code that inherits askpass secrets.
- `core.hooksPath` override remains always applied (fail-closed) to prevent hook inheritance.

**B — Askpass invocation tracing**:
- `start_session()`: logs session_id and port (not token).
- `run_askpass_server()`: logs when helper connects, when cancelled, or when timed out (with hint to check SSH_ASKPASS_REQUIRE support).
- `handle_askpass_connection()`: logs token accepted, prompt text (sanitized), event emission, passphrase received/cancelled.
- `run_as_askpass()` (helper binary): uses `eprintln!` to write non-secret traces to stderr so they appear in git's captured stderr, making it visible whether SSH actually invoked the askpass binary.

**C — Guidance accuracy (Part D)**:
- `HasIdentities` hint no longer says "push/pull should work" — this was misleading because ssh-agent having *some* identities doesn't guarantee the *required* key is loaded. Changed to diagnostic fact: "N key(s) loaded; if it still fails, the required key may not be among them."

**D — Stale UI state (Part E)**:
- `handlePush` and `handlePull` now clear all network-operation error/success state (both push and pull) when a new operation starts, so a stale success banner from a prior operation cannot coexist with a fresh error from the current one.

**E — Error detail**:
- SSH error messages now append the raw git output (including `[ris-askpass]` stderr traces) after the friendly message and guidance, so users can see exactly what SSH/askpass did.

## Files changed

### Rust (backend)

- `crates/ris-git/src/lib.rs`
  - `is_core_ssh_command_repo_local()`: new internal function; detects repo-local `core.sshCommand` via `git config --show-origin` (relative path = repo-local, absolute = global/user/system).
  - `ASKPASS_ENV_REMOVALS`: changed from `&["GIT_SSH", "GIT_SSH_COMMAND"]` to `&[]`; these are user-controlled vars that must not be removed.
  - `prepare_askpass_hardening()`: parameter changed from `ssh_command: &str` to `ssh_command_override: Option<&str>`; only adds `-c core.sshCommand=...` when `Some`.
  - `push_current_branch_with_env`, `pull_ff_only_with_env`: check `is_core_ssh_command_repo_local()` before passing override; preserve global SSH config.
  - Unit tests updated and added: `askpass_env_removals_does_not_strip_user_ssh_vars`, `prepare_askpass_hardening_without_override_omits_ssh_command`, `askpass_mode_has_ssh_command_override_when_explicitly_set`, `is_core_ssh_command_repo_local_returns_false_for_fresh_repo`, `is_core_ssh_command_repo_local_returns_true_when_set_in_git_config`.

- `apps/desktop/src-tauri/src/ssh_askpass.rs`
  - `start_session()`: added `log::info!` for session start (port, session_id, not token).
  - `run_askpass_server()`: added logging for helper connection, cancellation, timeout.
  - `handle_askpass_connection()`: added logging for token validation, prompt, event emission, response.
  - `run_as_askpass()`: added `eprintln!` traces for each step (invoked, port, connection, result); does NOT log token or passphrase.
  - `ssh_agent_guidance()`: `HasIdentities` case no longer says "should work"; now diagnostic-only with guidance for still-failing auth.
  - New test: `ssh_agent_guidance_has_identities_does_not_claim_should_work`.

- `apps/desktop/src-tauri/src/commands/git.rs`
  - `ssh_error_message()`: appends raw git stderr (including `[ris-askpass]` traces) after friendly message so users see the full output.
  - `push_git_current_branch`, `pull_git_ff_only`: log `is_ssh` and `askpass_active` before spawning git.

### Frontend (TypeScript/React)

- `apps/desktop/src/features/repository/RepositoryPanel.tsx`
  - `handlePush()`: clears `pullError`/`pullSuccess` on start (not just push state).
  - `handlePull()`: clears `pushError`/`pushSuccess` on start (not just pull state).

- `apps/desktop/src/features/repository/RepositoryPanel.test.tsx`
  - Added import for `pullGitFfOnly`, `pushGitCurrentBranch`.
  - New test suite `RepositoryPanel — Push/Pull state isolation` with 2 tests: stale push error is cleared when pull starts, stale pull error is cleared when push starts.

## Tests

```
cargo fmt --all --check                     — clean
cargo check --workspace                     — clean (0 warnings)
cargo clippy --workspace -- -D warnings     — clean
cargo test -p ris-git                       — 64 passed, 0 failed (39 unit + 25 integration)
cargo test -p rack-inventory-studio-desktop — 54 passed, 0 failed
node scripts/check-version-consistency.mjs  — all 0.1.0-beta.1
node --test scripts/*.test.mjs              — 17 passed
node scripts/check-repo-hygiene.mjs         — 8/8 checks passed
npx tsc --noEmit (apps/desktop)             — clean
npx vitest run (apps/desktop)               — 464 passed, 0 errors
npx playwright test (apps/desktop)          — 21 passed
git diff --check                            — clean
```

Manual QA of the SSH passphrase modal flow against a live remote has NOT been performed in this automated session. Required before merge:

1. Ensure key is NOT loaded in agent.
2. Run terminal `git push` and confirm it asks for passphrase and succeeds.
3. Run app push and confirm modal appears.
4. Enter passphrase and confirm push succeeds.
5. Cancel modal and confirm clean failure.
6. Wrong passphrase — confirm retry/limit or clean failure.

## Security model

- **Fail-closed**: `TempHooksDir::create()` fail → `GitError` returned, git not spawned.
- **Hook suppression**: `core.hooksPath=<unique-temp-dir>` always applied in askpass mode.
- **SSH config preserved**: `GIT_SSH`/`GIT_SSH_COMMAND` not removed; global/user `core.sshCommand` not overridden.
- **Repo-local SSH command**: overridden with safe SSH binary only when detected in `.git/config`.
- **CSPRNG token**: 256-bit (64 hex chars).
- **Session-id lifecycle**: stale threads cannot clear newer sessions.
- **Passphrase lifetime**: never stored, logged, or passed via env/CLI.

## Risks

- On Windows, if Git-for-Windows bundled SSH does not support `SSH_ASKPASS_REQUIRE=force` (added in OpenSSH 8.4), the modal may not appear even though the helper is correctly configured. The `[ris-askpass] helper invoked` stderr trace will confirm whether SSH called the helper. If it did not, the user needs to configure Windows OpenSSH via `git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"`.
- `is_core_ssh_command_repo_local` uses the relative-vs-absolute path heuristic from `git config --show-origin`. If a future git version changes this output format, the detection could silently fail (returning false = conservative, safe, but no override applied). Tested against current git behavior.

## Not done

- Manual QA of SSH passphrase flow against a real Windows remote.
- Persistent credential vault / HTTPS token management.
- SSH diagnostics UI panel (data available via `get_ssh_diagnostics` Tauri command).
- App version bump (deferred to release milestone).

## Suggested next step

Run the Windows manual QA checklist above. If the `[ris-askpass] helper invoked` trace does NOT appear in the error output, add guidance in the UI to configure `core.sshCommand` to Windows OpenSSH when the detected SSH binary does not support `SSH_ASKPASS_REQUIRE=force`.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
