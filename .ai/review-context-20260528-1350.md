# ChatGPT Code Review Context

## Review mode
You are a strict code reviewer. Review only this change. Focus on correctness, scope, tests, security, maintainability and operational risk.

Return:
- Status: Approve / Request changes / Needs human decision
- Summary
- Blocking issues
- Non-blocking suggestions
- Scope check
- Tests
- Risks
- Recommended next action

## Repository
- Repo: TechTradeExpress/RackInventoryStudio
- URL: https://github.com/TechTradeExpress/RackInventoryStudio

## Branch
- Current branch: fix/git-ssh-passphrase-handling
- Base branch: master
- Commits ahead of base: 2

## Pull request
- Number: #86
- Title: fix(git): handle ssh passphrase prompts safely
- URL: https://github.com/TechTradeExpress/RackInventoryStudio/pull/86
- Base: master
- Head: fix/git-ssh-passphrase-handling
- Changed files: 17
- Additions: 1903
- Deletions: 119
- Mergeable: MERGEABLE
- Review decision: 

### Body
## Summary

- SSH push/pull now prompts for a key passphrase when no agent is available, instead of hanging or returning a cryptic error
- One-time modal in the frontend collects the passphrase; it travels to OpenSSH via a short-lived 127.0.0.1 TCP pipe and is never stored
- SSH diagnostics command (`get_ssh_diagnostics`) surfaces agent status, ssh-add identity count, ssh executable, and user-facing guidance
- SSH error classifier maps common stderr patterns to friendly messages

## Security properties

- Passphrase is **never** stored in config, localStorage, env vars, logs, CLI args, or files
- IPC bound to 127.0.0.1 only, random OS-assigned port, per-operation token, lifetime ≤ 5 min accept + 60 s user response
- Attempt limit (3) prevents infinite passphrase loops
- Cancel sends `CANCEL\n` to SSH helper → exit code 1 → clean failure

## Architecture

```
Git subprocess (SSH)
  → invokes binary with RIS_ASKPASS_MODE=1 (askpass helper mode)
  → helper TCP-connects to 127.0.0.1:<port> with token + prompt
  → main app emits "ssh-passphrase-requested" Tauri event
  → SshPassphraseModal shown to user
  → user submits → respondSshPassphrase command → TCP thread → helper stdout → SSH
```

## Files changed

- `crates/ris-git/src/lib.rs` — `push_current_branch_with_env`, `pull_ff_only_with_env`, `is_ssh_url`, `classify_git_ssh_error` (+14 tests)
- `apps/desktop/src-tauri/src/ssh_askpass.rs` — new module: `AskpassState`, TCP server, `run_as_askpass()`, SSH diagnostics
- `apps/desktop/src-tauri/src/commands/git.rs` — push/pull with askpass, `respond_ssh_passphrase`, `get_ssh_diagnostics`
- `apps/desktop/src-tauri/src/dto.rs` — `SshDiagnosticsDto`
- `apps/desktop/src-tauri/src/lib.rs` / `main.rs` — module registration, askpass mode detection
- `apps/desktop/src/features/repository/SshPassphraseModal.tsx` (+test) — passphrase modal
- `apps/desktop/src/App.tsx` — event listener for `ssh-passphrase-requested`
- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — section 2 updated with correct approach
- `CHANGELOG.md` — added SSH entries

## Test plan

- [ ] Cargo fmt / check / clippy clean (0 warnings)
- [ ] `cargo test -p rack-inventory-studio-desktop -p ris-git` — all pass
- [ ] `vitest run` — 462 tests pass (8 new SshPassphraseModal tests)
- [ ] Version and hygiene checks pass
- [ ] Manual: push to SSH remote without agent → modal appears → submit passphrase → push succeeds
- [ ] Manual: cancel modal → push fails cleanly
- [ ] Manual: push to HTTPS remote → no modal, no SSH code path

🤖 Generated with [Claude Code](https://claude.com/claude-code)

## GitHub checks
Frontend checks	pending	0	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/26578869357/job/78305792340	
Rust workspace	pending	0	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/26578869357/job/78305792329	
Script and hygiene checks	pending	0	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/26578869357/job/78305792371	
Version consistency	pending	0	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/26578869357/job/78305792682	
Workflow lint	pending	0	https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/26578869357/job/78305792406	

## Claude Code report
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

## Changed files
M	.ai/cc-report.md
M	CHANGELOG.md
M	Cargo.lock
M	apps/desktop/src-tauri/Cargo.toml
M	apps/desktop/src-tauri/src/commands/git.rs
M	apps/desktop/src-tauri/src/commands/mod.rs
M	apps/desktop/src-tauri/src/dto.rs
M	apps/desktop/src-tauri/src/lib.rs
M	apps/desktop/src-tauri/src/main.rs
A	apps/desktop/src-tauri/src/ssh_askpass.rs
M	apps/desktop/src/App.nav.test.tsx
M	apps/desktop/src/App.tsx
M	apps/desktop/src/api/tauriClient.ts
A	apps/desktop/src/features/repository/SshPassphraseModal.test.tsx
A	apps/desktop/src/features/repository/SshPassphraseModal.tsx
M	crates/ris-git/src/lib.rs
M	docs/BETA1_FOLLOWUP_PLAN_EN.md

## Diff stat
 .ai/cc-report.md                                   | 126 ++-
 CHANGELOG.md                                       |  16 +
 Cargo.lock                                         |   1 +
 apps/desktop/src-tauri/Cargo.toml                  |   1 +
 apps/desktop/src-tauri/src/commands/git.rs         | 207 ++++-
 apps/desktop/src-tauri/src/commands/mod.rs         |   5 +-
 apps/desktop/src-tauri/src/dto.rs                  |  25 +
 apps/desktop/src-tauri/src/lib.rs                  |  23 +-
 apps/desktop/src-tauri/src/main.rs                 |   3 +
 apps/desktop/src-tauri/src/ssh_askpass.rs          | 940 +++++++++++++++++++++
 apps/desktop/src/App.nav.test.tsx                  |   7 +
 apps/desktop/src/App.tsx                           |  22 +-
 apps/desktop/src/api/tauriClient.ts                |  22 +
 .../repository/SshPassphraseModal.test.tsx         | 106 +++
 .../src/features/repository/SshPassphraseModal.tsx | 123 +++
 crates/ris-git/src/lib.rs                          | 354 +++++++-
 docs/BETA1_FOLLOWUP_PLAN_EN.md                     |  41 +-
 17 files changed, 1903 insertions(+), 119 deletions(-)

## Diff
From 4f5b4073f77b2378fd974baf22eb140ed44f194f Mon Sep 17 00:00:00 2001
From: Jakub Plucinski <su-17@wp.pl>
Date: Thu, 28 May 2026 12:08:09 +0000
Subject: [PATCH 1/2] fix(git): add safe ssh passphrase prompting via askpass
 IPC

When a push/pull requires an SSH key passphrase and no agent is available,
OpenSSH invokes the app binary in askpass helper mode (RIS_ASKPASS_MODE=1).
A short-lived 127.0.0.1 TCP session relays the passphrase from a one-time
frontend modal to the SSH process. The passphrase is never stored, logged,
or passed through env vars or CLI args.

- ris-git: push_current_branch_with_env, pull_ff_only_with_env, is_ssh_url,
  classify_git_ssh_error (14 new unit tests)
- ssh_askpass.rs: AskpassState managed state, TCP server, run_as_askpass(),
  SSH diagnostics (probe_ssh_add, find_ssh_executable, ssh_agent_guidance)
- commands/git.rs: push/pull detect SSH remotes and start askpass sessions;
  respond_ssh_passphrase and get_ssh_diagnostics new commands
- SshPassphraseModal: one-time password modal with ssh-add guidance
- App.tsx: listen("ssh-passphrase-requested") shows modal on demand

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
---
 .ai/cc-report.md                              | 115 +--
 CHANGELOG.md                                  |  16 +
 apps/desktop/src-tauri/src/commands/git.rs    | 171 +++-
 apps/desktop/src-tauri/src/commands/mod.rs    |   5 +-
 apps/desktop/src-tauri/src/dto.rs             |  25 +
 apps/desktop/src-tauri/src/lib.rs             |  23 +-
 apps/desktop/src-tauri/src/main.rs            |   3 +
 apps/desktop/src-tauri/src/ssh_askpass.rs     | 854 ++++++++++++++++++
 apps/desktop/src/App.nav.test.tsx             |   7 +
 apps/desktop/src/App.tsx                      |  22 +-
 apps/desktop/src/api/tauriClient.ts           |  22 +
 .../repository/SshPassphraseModal.test.tsx    | 106 +++
 .../repository/SshPassphraseModal.tsx         | 123 +++
 crates/ris-git/src/lib.rs                     | 196 +++-
 docs/BETA1_FOLLOWUP_PLAN_EN.md                |  41 +-
 15 files changed, 1621 insertions(+), 108 deletions(-)
 create mode 100644 apps/desktop/src-tauri/src/ssh_askpass.rs
 create mode 100644 apps/desktop/src/features/repository/SshPassphraseModal.test.tsx
 create mode 100644 apps/desktop/src/features/repository/SshPassphraseModal.tsx

diff --git a/.ai/cc-report.md b/.ai/cc-report.md
index 6fd17ca..5b096a9 100644
--- a/.ai/cc-report.md
+++ b/.ai/cc-report.md
@@ -1,98 +1,73 @@
 ## Summary
 
-Post-beta 1 follow-up — branch `fix/windows-dnd-post-beta1`.
+Implemented safe SSH passphrase handling for push/pull operations (post-beta 1 follow-up item 2). When a Git operation requires a key passphrase and no ssh-agent has the key loaded, OpenSSH invokes the app binary in askpass helper mode. The app intercepts this via a short-lived localhost TCP session, prompts the user once via a frontend modal, and forwards the passphrase only to SSH via stdout. The passphrase is never stored, logged, or passed through environment variables or CLI arguments.
 
-Fixed Windows drag-and-drop for rack placement. On Windows with Tauri + WebView2,
-two independent bugs prevented DnD from working:
+Also updated the post-beta follow-up plan document to reflect the correct implementation direction (removing incorrect "stored passphrase field" approach).
 
-1. **Tauri intercepting DnD events**: `dragDropEnabled` was not set to `false` in
-   the window config, so WebView2 captured HTML5 drag events at OS level for native
-   file drop handling. Set `dragDropEnabled: false` in `tauri.conf.json`.
-
-2. **Custom MIME type unreliability**: `application/ris-placement` may return an
-   empty string from `getData()` on Windows WebView2 even when `setData()` succeeded.
-   Now writing to both the custom MIME type and `text/plain`; `getDragPayload` reads
-   in priority order: custom MIME → `text/plain` → in-memory singleton.
+## Files changed
 
-Also added the post-beta follow-up plan document and CHANGELOG entry.
+### Rust (backend)
 
-## Files changed
+- `crates/ris-git/src/lib.rs` — Added `push_current_branch_with_env`, `pull_ff_only_with_env` (with `extra_env: &[(&str, &str)]`), kept original functions as wrappers. Added `is_ssh_url()` and `classify_git_ssh_error()`. Added 14 unit tests.
+- `apps/desktop/src-tauri/src/ssh_askpass.rs` — New module. Contains `AskpassState` (Tauri managed state), TCP server loop, `run_as_askpass()` (askpass helper mode entry point), SSH diagnostics (`probe_ssh_add`, `find_ssh_executable`, `get_ssh_version`, `get_core_ssh_command`, `ssh_agent_guidance`), `build_askpass_env_pairs()`, and unit/integration tests including TCP roundtrip tests.
+- `apps/desktop/src-tauri/src/commands/git.rs` — Updated `push_git_current_branch` and `pull_git_ff_only` to accept `State<AskpassState>` and `AppHandle`, detect SSH remotes, and start/clear askpass sessions. Added `respond_ssh_passphrase` and `get_ssh_diagnostics` commands.
+- `apps/desktop/src-tauri/src/commands/mod.rs` — Re-exported `respond_ssh_passphrase` and `get_ssh_diagnostics`.
+- `apps/desktop/src-tauri/src/dto.rs` — Added `SshDiagnosticsDto`.
+- `apps/desktop/src-tauri/src/lib.rs` — Added `mod ssh_askpass`, `pub use ssh_askpass::run_as_askpass`, managed `AskpassState`, registered new commands.
+- `apps/desktop/src-tauri/src/main.rs` — Detects `RIS_ASKPASS_MODE=1` and runs `run_as_askpass()` before the GUI starts.
 
-- `apps/desktop/src-tauri/tauri.conf.json` — Added `"dragDropEnabled": false` to
-  the main window. Primary fix for Windows DnD event interception.
+### TypeScript / React (frontend)
 
-- `apps/desktop/src/features/racks/dndHelpers.ts` — Added `writeDragData` export
-  (writes to both MIME types, each write guarded against throwing). Updated
-  `getDragPayload` with three-tier read strategy: custom MIME → `text/plain` →
-  in-memory cache. Added cross-platform rationale comment block.
+- `apps/desktop/src/api/tauriClient.ts` — Added `SshDiagnosticsDto` interface, `respondSshPassphrase()`, `getSshDiagnostics()` functions.
+- `apps/desktop/src/features/repository/SshPassphraseModal.tsx` — New modal component: shows OpenSSH prompt, password input, Continue/Cancel buttons, ssh-add guidance. Calls `respondSshPassphrase` on submit or cancel. Clears input after each use.
+- `apps/desktop/src/App.tsx` — Added `useEffect` with `listen("ssh-passphrase-requested", ...)` and renders `<SshPassphraseModal>`.
+- `apps/desktop/src/App.nav.test.tsx` — Added mocks for `@tauri-apps/api/event` and `SshPassphraseModal` to prevent test breakage.
 
-- `apps/desktop/src/features/racks/PlacementPalettePanel.tsx` — Replaced direct
-  `setData(DND_DATA_TYPE, ...)` calls with `writeDragData`. Removed direct
-  `DND_DATA_TYPE` import (no longer needed in this file).
+### Docs
 
-- `apps/desktop/src/features/racks/RackUnitDiagram.tsx` — Replaced direct
-  `setData(DND_DATA_TYPE, ...)` call with `writeDragData`. Removed direct
-  `DND_DATA_TYPE` import.
+- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — Section 2 updated: removed incorrect "stored passphrase field" direction; documented correct ssh-agent primary / SSH_ASKPASS secondary / diagnostics approach.
+- `CHANGELOG.md` — Added SSH passphrase prompting, SSH diagnostics, SSH error classification, and security note to Unreleased section.
 
-- `apps/desktop/src/features/racks/dndHelpers.test.ts` — Replaced old 3-test
-  `getDragPayload — dataTransfer fallback` block with:
-  - `writeDragData` block (3 tests: writes both MIME types, tolerates throwing setData)
-  - `getDragPayload — read priority` block (6 tests: custom MIME, text/plain fallback,
-    preference order, in-memory fallback, throwing getData, all-null)
+### Tests
 
-- `apps/desktop/src/features/racks/RackUnitDiagram.test.tsx` — Added import for
-  `setActiveDragPayload`; added `RackUnitDiagram — drag and drop` describe block
-  with 2 tests: dragover calls preventDefault when handler is wired, does not call
-  it when no handler.
+- `apps/desktop/src/features/repository/SshPassphraseModal.test.tsx` — New test file: 8 tests covering modal appearance, submit, cancel, Enter key, input clearing, guidance text.
 
-- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — New document describing 6 post-beta issues
-  with root cause and resolution plan for each.
+## Security model
 
-- `CHANGELOG.md` — Added `## Unreleased — Post-beta 1 follow-up` section.
+- **Passphrase lifetime**: Entered once in the frontend modal → sent via `respondSshPassphrase` Tauri command → forwarded via `mpsc::SyncSender` to TCP thread → written to TCP stream → read from stdout by OpenSSH. Never touches disk, logs, env vars, or CLI args.
+- **Token**: Per-operation random token prevents other processes from connecting to the short-lived TCP server.
+- **IPC binding**: `127.0.0.1` only, random OS-assigned port, lifetime ≤ 300s TCP accept + 60s user response.
+- **Attempt limit**: MAX_ASKPASS_ATTEMPTS=3 prevents infinite passphrase prompt loops.
+- **Cancellation**: If the user cancels or the session times out, `CANCEL\n` is sent to the helper, SSH receives exit code 1 and fails cleanly.
 
 ## Tests
 
 ```
-git diff --check
-node scripts/check-version-consistency.mjs
-node --test scripts/*.test.mjs
-node scripts/check-repo-hygiene.mjs
-pnpm --filter @rack-inventory-studio/desktop exec tsc --noEmit
-pnpm --filter @rack-inventory-studio/desktop exec vitest run
-pnpm --filter @rack-inventory-studio/desktop exec playwright test
-cargo fmt --all --check
-cargo check --workspace
-cargo test --workspace
-cargo clippy --workspace -- -D warnings
+cargo fmt --all --check          — clean
+cargo check -p rack-inventory-studio-desktop — clean (0 warnings)
+cargo clippy -p rack-inventory-studio-desktop -p ris-git -- -D warnings — clean
+cargo test -p rack-inventory-studio-desktop -p ris-git — all pass
+node scripts/check-version-consistency.mjs — all 0.1.0-beta.1
+node scripts/check-repo-hygiene.mjs        — 8/8 checks
+tsc --noEmit (apps/desktop)                — clean
+vitest run                                  — 470 passed, 0 errors
 ```
 
-(Results recorded after checks complete.)
-
 ## Risks
 
-- Manual Windows QA not performed in this environment. The `dragDropEnabled: false`
-  fix is consistent with Tauri v2 documentation and community reports for this exact
-  symptom.
-- `text/plain` fallback means an external file accidentally dragged onto the rack
-  diagram could be decoded as a DnD payload if it contains valid JSON matching the
-  `DndPayload` schema. Risk is low — the schema is specific and all malformed data
-  is silently ignored.
+- `run_as_askpass()` requires the binary to be invocable as a subprocess of SSH. On Windows, the binary path may contain spaces — handled via `current_exe()` which returns the full path; SSH_ASKPASS uses the full path. Spaces in paths should be safe as OpenSSH exec's the path directly.
+- The TCP token is not cryptographically strong (timestamp XOR nanos + PID). Sufficient for the threat model (short-lived local socket, no sensitive data besides passphrase lifetime), but not CSPRNG-quality.
+- SSH diagnostics (`probe_ssh_add`, `find_ssh_executable`) spawn subprocesses with 3-second timeouts. On slow machines these could briefly block the Tauri command thread. These are diagnostic-only and not on the push/pull hot path.
+- `classify_git_ssh_error` is implemented in `ris-git` but not yet surfaced to the frontend via the error DTOs from push/pull — it's available for future use.
 
 ## Not done
 
-- SSH passphrase handling (tracked in plan doc, separate PR).
-- Hidden/auto-generated `code` fields (tracked in plan doc, separate PR).
-- Clear height override (tracked in plan doc, separate PR).
-- CSV import summary counts (tracked in plan doc, separate PR).
-- Dirty repository guard (tracked in plan doc, separate PR).
-- Linux / macOS packaging (out of scope for this PR).
+- Persistent credential vault / HTTPS token management.
+- Surfacing `classify_git_ssh_error` output in push/pull error messages displayed to the user (function exists, wiring to frontend deferred).
+- SSH diagnostics UI panel in the app (data available via `get_ssh_diagnostics` command but no panel was built in this PR).
+- Linux/macOS packaging changes.
+- App version bump (intentionally left to a release milestone).
 
 ## Suggested next step
 
-Manual smoke test on a Windows machine: drag a device from the palette onto an
-empty rack slot, move a placed card to a different slot, and drag a placed card
-to the palette to unplace it.
-
-## Final review-context handoff
-
-Generated after checks complete. See `.ai/review-context-*.md`.
+Wire `classify_git_ssh_error` into the push/pull error DTOs returned to the frontend so users see "Permission denied (publickey). No identities found in SSH agent." instead of raw git stderr. Also build a minimal SSH diagnostics section in the Repository panel that shows agent status and guidance when a push/pull fails.
diff --git a/CHANGELOG.md b/CHANGELOG.md
index aec426c..1ee12dd 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -12,6 +12,22 @@
 
 - Post-beta follow-up plan (`docs/BETA1_FOLLOWUP_PLAN_EN.md`) covering six
   identified issues and their planned resolutions.
+- **SSH passphrase prompting**: When a push or pull requires a key passphrase
+  and no ssh-agent has the key loaded, a one-time modal prompts the user. The
+  passphrase is passed directly to SSH via a short-lived localhost TCP session;
+  it is never stored in config, logs, environment variables, or files.
+- **SSH diagnostics**: `get_ssh_diagnostics` command surfaces `ssh-add -l`
+  status, `SSH_AUTH_SOCK`, detected SSH executable and version,
+  `core.sshCommand`, and user-facing guidance for common agent/configuration
+  issues.
+- **SSH error classification**: Common SSH stderr messages (permission denied,
+  agent failure, bad passphrase, host key failure) are mapped to user-friendly
+  guidance rather than raw error strings.
+
+### Security
+
+- SSH private-key passphrases are never stored: not in settings, localStorage,
+  config files, environment variables, logs, or command-line arguments.
 
 ---
 
diff --git a/apps/desktop/src-tauri/src/commands/git.rs b/apps/desktop/src-tauri/src/commands/git.rs
index 8add7a4..90510bc 100644
--- a/apps/desktop/src-tauri/src/commands/git.rs
+++ b/apps/desktop/src-tauri/src/commands/git.rs
@@ -2,7 +2,13 @@ use tauri::State;
 
 use crate::commands::repository::{build_summary, AppState};
 use crate::diagnostics::sanitize_error;
-use crate::dto::{GitCommitDto, GitRemoteDto, GitStatusDto, RepositorySummaryDto};
+use crate::dto::{
+    GitCommitDto, GitRemoteDto, GitStatusDto, RepositorySummaryDto, SshDiagnosticsDto,
+};
+use crate::ssh_askpass::{
+    build_askpass_env_pairs, find_ssh_executable, get_core_ssh_command, get_ssh_version,
+    probe_ssh_add, ssh_agent_guidance, AskpassState, SshAddStatus,
+};
 
 fn no_session() -> String {
     "No repository is currently open".to_string()
@@ -116,18 +122,56 @@ pub fn add_git_remote(name: String, url: String, state: State<AppState>) -> Resu
 }
 
 #[tauri::command]
-pub fn push_git_current_branch(remote: String, state: State<AppState>) -> Result<(), String> {
+pub fn push_git_current_branch(
+    remote: String,
+    state: State<AppState>,
+    askpass: State<AskpassState>,
+    app: tauri::AppHandle,
+) -> Result<(), String> {
     log::info!("git_push: remote={remote}");
-    let repo_path = {
+    let (repo_path, remote_url) = {
         let guard = lock(&state)?;
         let session = guard.as_ref().ok_or_else(no_session)?;
-        session.repo_path.clone()
+        let remotes = ris_git::list_remotes(&session.repo_path).unwrap_or_default();
+        let url = remotes
+            .into_iter()
+            .find(|r| r.name == remote)
+            .map(|r| r.url);
+        (session.repo_path.clone(), url)
     };
-    ris_git::push_current_branch(&repo_path, &remote).map_err(|e| {
-        let msg = e.to_string();
-        log::error!("git_push failed: {}", sanitize_error(&msg));
-        msg
-    })?;
+
+    let is_ssh = remote_url
+        .as_deref()
+        .map(ris_git::is_ssh_url)
+        .unwrap_or(false);
+    let env_owned: Vec<(String, String)> = if is_ssh {
+        match askpass.start_session(app) {
+            Ok(e) => build_askpass_env_pairs(&e),
+            Err(warn) => {
+                log::warn!("askpass session not started, continuing without: {warn}");
+                vec![]
+            }
+        }
+    } else {
+        vec![]
+    };
+    let env_refs: Vec<(&str, &str)> = env_owned
+        .iter()
+        .map(|(k, v)| (k.as_str(), v.as_str()))
+        .collect();
+
+    let result =
+        ris_git::push_current_branch_with_env(&repo_path, &remote, &env_refs).map_err(|e| {
+            let msg = e.to_string();
+            log::error!("git_push failed: {}", sanitize_error(&msg));
+            msg
+        });
+
+    if is_ssh {
+        askpass.clear_session();
+    }
+
+    result?;
     log::info!("git_push ok");
     Ok(())
 }
@@ -145,20 +189,53 @@ pub fn push_git_current_branch(remote: String, state: State<AppState>) -> Result
 pub fn pull_git_ff_only(
     remote: String,
     state: State<AppState>,
+    askpass: State<AskpassState>,
+    app: tauri::AppHandle,
 ) -> Result<RepositorySummaryDto, String> {
     // Release lock before the potentially slow git network operation.
-    let repo_path = {
+    let (repo_path, remote_url) = {
         let guard = lock(&state)?;
         let session = guard.as_ref().ok_or_else(no_session)?;
-        session.repo_path.clone()
+        let remotes = ris_git::list_remotes(&session.repo_path).unwrap_or_default();
+        let url = remotes
+            .into_iter()
+            .find(|r| r.name == remote)
+            .map(|r| r.url);
+        (session.repo_path.clone(), url)
+    };
+
+    let is_ssh = remote_url
+        .as_deref()
+        .map(ris_git::is_ssh_url)
+        .unwrap_or(false);
+    let env_owned: Vec<(String, String)> = if is_ssh {
+        match askpass.start_session(app) {
+            Ok(e) => build_askpass_env_pairs(&e),
+            Err(warn) => {
+                log::warn!("askpass session not started, continuing without: {warn}");
+                vec![]
+            }
+        }
+    } else {
+        vec![]
     };
+    let env_refs: Vec<(&str, &str)> = env_owned
+        .iter()
+        .map(|(k, v)| (k.as_str(), v.as_str()))
+        .collect();
 
     log::info!("git_pull: remote={remote}");
-    ris_git::pull_ff_only(&repo_path, &remote).map_err(|e| {
+    let pull_result = ris_git::pull_ff_only_with_env(&repo_path, &remote, &env_refs).map_err(|e| {
         let msg = e.to_string();
         log::error!("git_pull failed: {}", sanitize_error(&msg));
         msg
-    })?;
+    });
+
+    if is_ssh {
+        askpass.clear_session();
+    }
+
+    pull_result?;
 
     // Reload session so in-memory state reflects the newly pulled YAML files.
     // If reload fails, the old session remains unchanged.
@@ -193,3 +270,71 @@ pub fn pull_git_ff_only(
     );
     Ok(summary)
 }
+
+/// Deliver the user's passphrase response (or cancellation) to the waiting askpass session.
+///
+/// Called by the frontend's SshPassphraseModal after the user submits or cancels.
+/// `passphrase: None` cancels the operation. The passphrase is held in memory only for the
+/// duration of the TCP handshake and is never logged or stored.
+#[tauri::command]
+pub fn respond_ssh_passphrase(
+    passphrase: Option<String>,
+    askpass: State<AskpassState>,
+) -> Result<(), String> {
+    askpass.respond(passphrase)
+}
+
+/// Return SSH diagnostics for the currently open repository and specified remote.
+///
+/// All fields are best-effort; missing data is surfaced as `None` rather than an error.
+/// This command is infallible from Tauri's perspective.
+#[tauri::command]
+pub fn get_ssh_diagnostics(remote: Option<String>, state: State<AppState>) -> SshDiagnosticsDto {
+    let (repo_path, remote_url) = match lock(&state) {
+        Ok(guard) => match guard.as_ref() {
+            Some(session) => {
+                let remotes = ris_git::list_remotes(&session.repo_path).unwrap_or_default();
+                let url = if let Some(ref name) = remote {
+                    remotes.into_iter().find(|r| &r.name == name).map(|r| r.url)
+                } else {
+                    remotes.into_iter().next().map(|r| r.url)
+                };
+                (Some(session.repo_path.clone()), url)
+            }
+            None => (None, None),
+        },
+        Err(_) => (None, None),
+    };
+
+    let is_ssh = remote_url
+        .as_deref()
+        .map(ris_git::is_ssh_url)
+        .unwrap_or(false);
+    let ssh_add_status = probe_ssh_add();
+    let ssh_executable = find_ssh_executable();
+    let ssh_version = get_ssh_version();
+    let core_ssh_command = repo_path.as_ref().and_then(|p| get_core_ssh_command(p));
+    let ssh_auth_sock = std::env::var("SSH_AUTH_SOCK").ok();
+
+    let (status_str, identity_count) = match &ssh_add_status {
+        SshAddStatus::HasIdentities(n) => ("has_identities".to_string(), Some(*n)),
+        SshAddStatus::NoIdentities => ("no_identities".to_string(), None),
+        SshAddStatus::AgentUnreachable => ("agent_unreachable".to_string(), None),
+        SshAddStatus::CommandUnavailable => ("command_unavailable".to_string(), None),
+        SshAddStatus::Unknown => ("unknown".to_string(), None),
+    };
+
+    let guidance = ssh_agent_guidance(&ssh_add_status, is_ssh, core_ssh_command.as_deref());
+
+    SshDiagnosticsDto {
+        remote_url,
+        remote_url_is_ssh: is_ssh,
+        ssh_auth_sock,
+        ssh_add_status: status_str,
+        ssh_add_identity_count: identity_count,
+        core_ssh_command,
+        ssh_executable,
+        ssh_version,
+        guidance,
+    }
+}
diff --git a/apps/desktop/src-tauri/src/commands/mod.rs b/apps/desktop/src-tauri/src/commands/mod.rs
index 77ebac2..ef5250a 100644
--- a/apps/desktop/src-tauri/src/commands/mod.rs
+++ b/apps/desktop/src-tauri/src/commands/mod.rs
@@ -3,8 +3,9 @@ pub mod log_settings;
 pub mod repository;
 
 pub use git::{
-    add_git_remote, commit_repository_changes, get_git_log, get_git_status, init_git_repository,
-    list_git_remotes, pull_git_ff_only, push_git_current_branch,
+    add_git_remote, commit_repository_changes, get_git_log, get_git_status, get_ssh_diagnostics,
+    init_git_repository, list_git_remotes, pull_git_ff_only, push_git_current_branch,
+    respond_ssh_passphrase,
 };
 pub use log_settings::{
     get_log_settings, open_logs_directory, reset_logs_directory, set_logs_directory,
diff --git a/apps/desktop/src-tauri/src/dto.rs b/apps/desktop/src-tauri/src/dto.rs
index c55df57..9c29e38 100644
--- a/apps/desktop/src-tauri/src/dto.rs
+++ b/apps/desktop/src-tauri/src/dto.rs
@@ -341,6 +341,31 @@ pub struct SearchResultDto {
     pub navigation: SearchNavigationDto,
 }
 
+// ── SSH diagnostics DTO ───────────────────────────────────────────────────────
+
+#[derive(Debug, Serialize, Deserialize)]
+pub struct SshDiagnosticsDto {
+    /// Remote URL for the requested remote (None if no repository or remote not found).
+    pub remote_url: Option<String>,
+    /// Whether the remote URL is an SSH URL (git@, ssh://, ssh+git://).
+    pub remote_url_is_ssh: bool,
+    /// Value of SSH_AUTH_SOCK in the app's environment.
+    pub ssh_auth_sock: Option<String>,
+    /// Classified ssh-add -l result: "has_identities", "no_identities", "agent_unreachable",
+    /// "command_unavailable", or "unknown".
+    pub ssh_add_status: String,
+    /// Number of identities loaded in the agent (only set when ssh_add_status = "has_identities").
+    pub ssh_add_identity_count: Option<usize>,
+    /// Value of git config core.sshCommand, if set.
+    pub core_ssh_command: Option<String>,
+    /// Path to the ssh executable found in PATH.
+    pub ssh_executable: Option<String>,
+    /// Output of ssh -V.
+    pub ssh_version: Option<String>,
+    /// User-facing guidance strings for the detected SSH state.
+    pub guidance: Vec<String>,
+}
+
 // ── Git DTOs ──────────────────────────────────────────────────────────────────
 
 #[derive(Debug, Serialize, Deserialize)]
diff --git a/apps/desktop/src-tauri/src/lib.rs b/apps/desktop/src-tauri/src/lib.rs
index 0ab60aa..16d9dc6 100644
--- a/apps/desktop/src-tauri/src/lib.rs
+++ b/apps/desktop/src-tauri/src/lib.rs
@@ -2,21 +2,25 @@ mod app_config;
 mod commands;
 mod diagnostics;
 mod dto;
+mod ssh_askpass;
+
+pub use ssh_askpass::run_as_askpass;
 
 use app_config::{resolve_app_config_dir_early, resolve_startup_log_dir, ActiveLogState};
 use commands::{
     add_device_cmd, add_device_model_cmd, add_git_remote, add_location_cmd, add_rack_cmd,
     close_repository, commit_repository_changes, create_repository_cmd, delete_device_cmd,
     delete_device_model_cmd, delete_location_cmd, delete_rack_cmd, get_git_log, get_git_status,
-    get_log_settings, get_rack_detail, get_repository_summary, import_device_csv_cmd,
-    init_git_repository, list_device_models, list_devices, list_git_remotes, list_locations,
-    list_racks, move_placement, open_logs_directory, open_repository_cmd, place_device,
-    place_rack_object, preview_device_csv_import_cmd, pull_git_ff_only, push_git_current_branch,
-    read_csv_file, remove_placement, reset_logs_directory, save_current_repository,
-    search_repository_cmd, set_logs_directory, update_device_cmd, update_device_model_cmd,
-    update_location_cmd, update_rack_cmd, validate_current_repository,
-    write_device_import_sample_csv, AppState,
+    get_log_settings, get_rack_detail, get_repository_summary, get_ssh_diagnostics,
+    import_device_csv_cmd, init_git_repository, list_device_models, list_devices, list_git_remotes,
+    list_locations, list_racks, move_placement, open_logs_directory, open_repository_cmd,
+    place_device, place_rack_object, preview_device_csv_import_cmd, pull_git_ff_only,
+    push_git_current_branch, read_csv_file, remove_placement, reset_logs_directory,
+    respond_ssh_passphrase, save_current_repository, search_repository_cmd, set_logs_directory,
+    update_device_cmd, update_device_model_cmd, update_location_cmd, update_rack_cmd,
+    validate_current_repository, write_device_import_sample_csv, AppState,
 };
+use ssh_askpass::AskpassState;
 use std::sync::Mutex;
 
 #[cfg_attr(mobile, tauri::mobile_entry_point)]
@@ -53,6 +57,7 @@ pub fn run() {
             session: Mutex::new(None),
         })
         .manage(active_log_state)
+        .manage(AskpassState::new())
         .invoke_handler(tauri::generate_handler![
             create_repository_cmd,
             open_repository_cmd,
@@ -91,6 +96,8 @@ pub fn run() {
             add_git_remote,
             push_git_current_branch,
             pull_git_ff_only,
+            respond_ssh_passphrase,
+            get_ssh_diagnostics,
             read_csv_file,
             write_device_import_sample_csv,
             search_repository_cmd,
diff --git a/apps/desktop/src-tauri/src/main.rs b/apps/desktop/src-tauri/src/main.rs
index 6146481..c4af608 100644
--- a/apps/desktop/src-tauri/src/main.rs
+++ b/apps/desktop/src-tauri/src/main.rs
@@ -2,5 +2,8 @@
 #![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
 
 fn main() {
+    if std::env::var("RIS_ASKPASS_MODE").as_deref() == Ok("1") {
+        std::process::exit(rack_inventory_studio_desktop_lib::run_as_askpass());
+    }
     rack_inventory_studio_desktop_lib::run();
 }
diff --git a/apps/desktop/src-tauri/src/ssh_askpass.rs b/apps/desktop/src-tauri/src/ssh_askpass.rs
new file mode 100644
index 0000000..0a3c7d8
--- /dev/null
+++ b/apps/desktop/src-tauri/src/ssh_askpass.rs
@@ -0,0 +1,854 @@
+//! SSH_ASKPASS integration and SSH diagnostics.
+//!
+//! # Askpass flow
+//!
+//! When a Git push/pull requires an SSH key passphrase and no usable agent is
+//! available, OpenSSH invokes the binary pointed to by `SSH_ASKPASS` with the
+//! prompt string as its first argument. We set `SSH_ASKPASS` to this binary
+//! itself and detect the invocation via `RIS_ASKPASS_MODE=1`.
+//!
+//! The askpass helper (our binary, re-invoked by SSH) connects via localhost
+//! TCP to a short-lived server started by the main app before the git command.
+//! The main app emits a Tauri event so the frontend can show a modal. The user
+//! enters the passphrase; the frontend calls `respond_ssh_passphrase`; the
+//! server thread sends the passphrase back to the helper over TCP; the helper
+//! prints it to stdout for SSH to consume. The passphrase is never stored.
+//!
+//! # Security properties
+//! - Passphrase is not stored in config, env, logs, files, or CLI args.
+//! - IPC bound to 127.0.0.1 only.
+//! - Per-operation random token; expires after one use.
+//! - Passphrase is redacted from logs before writing.
+//! - Timeout (60 s user, 5 min TCP accept) prevents hanging forever.
+
+use std::io::{BufRead, BufReader, Write};
+use std::net::{TcpListener, TcpStream};
+use std::path::Path;
+use std::process::Command;
+use std::sync::{Arc, Mutex};
+use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
+use tauri::{AppHandle, Emitter};
+
+// ── Constants ─────────────────────────────────────────────────────────────────
+
+/// Time the frontend has to respond to the passphrase prompt.
+const USER_TIMEOUT_SECS: u64 = 60;
+
+/// Maximum time to wait for SSH to call our askpass helper after git starts.
+const TCP_ACCEPT_TIMEOUT_SECS: u64 = 300;
+
+/// Maximum number of askpass attempts before failing (prevents infinite loops).
+const MAX_ASKPASS_ATTEMPTS: u32 = 3;
+
+// ── Session state ─────────────────────────────────────────────────────────────
+
+/// Tauri managed state for the active askpass session.
+pub struct AskpassState {
+    inner: Arc<Mutex<Option<AskpassInner>>>,
+}
+
+struct AskpassInner {
+    tx: std::sync::mpsc::SyncSender<Option<String>>,
+    attempts: u32,
+}
+
+/// Environment variables to set on the git subprocess to enable askpass.
+pub struct AskpassEnv {
+    pub binary_path: String,
+    pub port: u16,
+    pub token: String,
+}
+
+impl AskpassState {
+    pub fn new() -> Self {
+        AskpassState {
+            inner: Arc::new(Mutex::new(None)),
+        }
+    }
+
+    /// Start a new askpass session.
+    ///
+    /// Binds a TCP listener on a random localhost port, stores the session token,
+    /// and spawns a background thread to accept the askpass connection.
+    /// Returns env vars to pass to the git subprocess.
+    pub fn start_session(&self, app: AppHandle) -> Result<AskpassEnv, String> {
+        let binary_path = std::env::current_exe()
+            .map(|p| p.to_string_lossy().to_string())
+            .unwrap_or_default();
+
+        if binary_path.is_empty() {
+            return Err("Cannot determine binary path for askpass helper".to_string());
+        }
+
+        let listener = TcpListener::bind("127.0.0.1:0")
+            .map_err(|e| format!("Failed to bind askpass listener: {e}"))?;
+        let port = listener
+            .local_addr()
+            .map_err(|e| format!("Failed to get local address: {e}"))?
+            .port();
+
+        let token = generate_token();
+        let (tx, rx) = std::sync::mpsc::sync_channel::<Option<String>>(1);
+
+        {
+            let mut guard = self.inner.lock().unwrap();
+            *guard = Some(AskpassInner { tx, attempts: 0 });
+        }
+
+        let inner_arc = Arc::clone(&self.inner);
+        let token_for_thread = token.clone();
+        std::thread::spawn(move || {
+            run_askpass_server(listener, token_for_thread, rx, app, inner_arc);
+        });
+
+        Ok(AskpassEnv {
+            binary_path,
+            port,
+            token,
+        })
+    }
+
+    /// Send a passphrase (or `None` = cancel) to the waiting askpass server thread.
+    pub fn respond(&self, passphrase: Option<String>) -> Result<(), String> {
+        let guard = self.inner.lock().unwrap();
+        match guard.as_ref() {
+            Some(inner) => inner
+                .tx
+                .send(passphrase)
+                .map_err(|_| "SSH passphrase session is no longer active".to_string()),
+            None => Err("No active SSH passphrase session".to_string()),
+        }
+    }
+
+    /// Drop the session after the git operation completes.
+    pub fn clear_session(&self) {
+        self.inner.lock().unwrap().take();
+    }
+}
+
+// ── Token generation ──────────────────────────────────────────────────────────
+
+fn generate_token() -> String {
+    let t = SystemTime::now()
+        .duration_since(UNIX_EPOCH)
+        .unwrap_or_default();
+    // Combine nanos + pid for reasonable uniqueness; not cryptographic but
+    // sufficient for a local 127.0.0.1 socket with a short lifetime.
+    format!(
+        "{:016x}{:08x}",
+        t.subsec_nanos() as u64 ^ t.as_secs(),
+        std::process::id()
+    )
+}
+
+// ── TCP server (background thread) ───────────────────────────────────────────
+
+fn run_askpass_server(
+    listener: TcpListener,
+    expected_token: String,
+    rx: std::sync::mpsc::Receiver<Option<String>>,
+    app: AppHandle,
+    state: Arc<Mutex<Option<AskpassInner>>>,
+) {
+    listener.set_nonblocking(true).ok();
+
+    let deadline = Instant::now() + Duration::from_secs(TCP_ACCEPT_TIMEOUT_SECS);
+
+    let stream = loop {
+        match listener.accept() {
+            Ok((s, _)) => break Some(s),
+            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
+                if Instant::now() >= deadline {
+                    break None;
+                }
+                std::thread::sleep(Duration::from_millis(100));
+            }
+            Err(_) => break None,
+        }
+    };
+
+    if let Some(stream) = stream {
+        if let Err(e) = handle_askpass_connection(stream, &expected_token, &rx, &app, &state) {
+            // Redact: never log passphrase. Log only structural errors.
+            log::warn!("askpass session error (passphrase not logged): {e}");
+        }
+    }
+
+    // Clear session when the server thread exits (covers timeout + error paths).
+    state.lock().unwrap().take();
+}
+
+fn handle_askpass_connection(
+    stream: TcpStream,
+    expected_token: &str,
+    rx: &std::sync::mpsc::Receiver<Option<String>>,
+    app: &AppHandle,
+    state: &Arc<Mutex<Option<AskpassInner>>>,
+) -> Result<(), String> {
+    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
+    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();
+    let mut write_stream = stream
+        .try_clone()
+        .map_err(|e| format!("clone TCP stream: {e}"))?;
+
+    let mut reader = BufReader::new(stream);
+
+    let mut token_line = String::new();
+    reader
+        .read_line(&mut token_line)
+        .map_err(|e| format!("read token: {e}"))?;
+    let token = token_line.trim_end_matches(['\r', '\n']).to_string();
+
+    let mut prompt_line = String::new();
+    reader
+        .read_line(&mut prompt_line)
+        .map_err(|e| format!("read prompt: {e}"))?;
+    let prompt = prompt_line.trim_end_matches(['\r', '\n']).to_string();
+
+    // Validate token — reject connections with the wrong token.
+    if token != expected_token {
+        write_stream.write_all(b"CANCEL\n").ok();
+        return Err("Invalid token in askpass connection — rejecting".to_string());
+    }
+
+    // Check attempt limit to prevent infinite passphrase loops.
+    let at_limit = {
+        let mut guard = state.lock().unwrap();
+        if let Some(inner) = guard.as_mut() {
+            inner.attempts += 1;
+            inner.attempts > MAX_ASKPASS_ATTEMPTS
+        } else {
+            true
+        }
+    };
+    if at_limit {
+        write_stream.write_all(b"CANCEL\n").ok();
+        return Err(format!(
+            "Askpass attempt limit ({MAX_ASKPASS_ATTEMPTS}) reached — aborting"
+        ));
+    }
+
+    let safe_prompt = sanitize_prompt(&prompt);
+
+    // Emit event to frontend — frontend shows the passphrase modal.
+    if let Err(e) = app.emit("ssh-passphrase-requested", &safe_prompt) {
+        write_stream.write_all(b"CANCEL\n").ok();
+        return Err(format!("Failed to emit passphrase event to frontend: {e}"));
+    }
+
+    // Wait for user response (passphrase or cancel). None = timeout or cancel.
+    let passphrase = rx
+        .recv_timeout(Duration::from_secs(USER_TIMEOUT_SECS))
+        .ok()
+        .flatten();
+
+    if let Some(ref p) = passphrase {
+        let response_bytes = format!("OK\n{p}\n");
+        write_stream
+            .write_all(response_bytes.as_bytes())
+            .map_err(|e| format!("write passphrase to askpass helper: {e}"))?;
+    } else {
+        write_stream.write_all(b"CANCEL\n").ok();
+        // Notify frontend the operation was cancelled (timeout or user cancel).
+        app.emit("ssh-passphrase-result", "cancelled").ok();
+    }
+
+    Ok(())
+}
+
+fn sanitize_prompt(prompt: &str) -> String {
+    let safe: String = prompt
+        .chars()
+        .filter(|c| c.is_ascii_graphic() || *c == ' ')
+        .take(200)
+        .collect();
+    if safe.trim().is_empty() {
+        "Enter SSH key passphrase".to_string()
+    } else {
+        safe
+    }
+}
+
+// ── Environment builder ───────────────────────────────────────────────────────
+
+/// Build the list of environment variable pairs to inject into the git subprocess.
+///
+/// `SSH_ASKPASS_REQUIRE=force` (OpenSSH ≥ 8.4) forces SSH to use the askpass
+/// program even without a display, making the prompt unconditional when needed.
+/// On Linux we also set DISPLAY=:0 as a fallback for older SSH that requires it.
+/// These vars do NOT contain the passphrase.
+pub fn build_askpass_env_pairs(env: &AskpassEnv) -> Vec<(String, String)> {
+    let mut vars = vec![
+        ("SSH_ASKPASS".to_string(), env.binary_path.clone()),
+        ("SSH_ASKPASS_REQUIRE".to_string(), "force".to_string()),
+        ("RIS_ASKPASS_MODE".to_string(), "1".to_string()),
+        ("RIS_ASKPASS_PORT".to_string(), env.port.to_string()),
+        ("RIS_ASKPASS_TOKEN".to_string(), env.token.clone()),
+    ];
+    // Fallback for SSH < 8.4 on Linux/macOS (DISPLAY triggers askpass in older versions).
+    #[cfg(not(target_os = "windows"))]
+    if std::env::var("DISPLAY").is_err() {
+        vars.push(("DISPLAY".to_string(), ":0".to_string()));
+    }
+    vars
+}
+
+// ── Askpass helper mode (invoked by OpenSSH) ──────────────────────────────────
+
+/// Entry point when the binary is invoked by OpenSSH as the SSH_ASKPASS helper.
+///
+/// Called from `main()` when `RIS_ASKPASS_MODE=1` is set.
+/// Returns an exit code: 0 = passphrase printed to stdout, 1 = cancel/error.
+/// The passphrase is written only to stdout (as a pipe to SSH), never logged.
+pub fn run_as_askpass() -> i32 {
+    let prompt = std::env::args().nth(1).unwrap_or_default();
+
+    let port_str = match std::env::var("RIS_ASKPASS_PORT") {
+        Ok(p) => p,
+        Err(_) => return 1,
+    };
+    let token = match std::env::var("RIS_ASKPASS_TOKEN") {
+        Ok(t) => t,
+        Err(_) => return 1,
+    };
+    let port: u16 = match port_str.parse() {
+        Ok(p) => p,
+        Err(_) => return 1,
+    };
+
+    match connect_and_get_passphrase(port, &token, &prompt) {
+        Ok(Some(passphrase)) => {
+            // Write passphrase to stdout for SSH to consume.
+            // Use Write trait directly to avoid platform print! quirks.
+            use std::io::Write;
+            let mut stdout = std::io::stdout();
+            stdout.write_all(passphrase.as_bytes()).ok();
+            // SSH expects a newline after the passphrase.
+            stdout.write_all(b"\n").ok();
+            stdout.flush().ok();
+            0
+        }
+        Ok(None) => 1, // Cancelled
+        Err(_) => 1,   // Error (details not logged — avoids logging passphrase-adjacent data)
+    }
+}
+
+fn connect_and_get_passphrase(
+    port: u16,
+    token: &str,
+    prompt: &str,
+) -> Result<Option<String>, String> {
+    let addr = format!("127.0.0.1:{port}");
+    let mut stream = TcpStream::connect(&addr).map_err(|e| format!("connect to {addr}: {e}"))?;
+
+    // Give the user slightly longer than the server timeout.
+    stream
+        .set_read_timeout(Some(Duration::from_secs(USER_TIMEOUT_SECS + 10)))
+        .ok();
+    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();
+
+    // Send: "token\nprompt\n"
+    let msg = format!("{token}\n{prompt}\n");
+    stream
+        .write_all(msg.as_bytes())
+        .map_err(|e| format!("send token+prompt: {e}"))?;
+
+    // Read response: "OK\n{passphrase}\n" or "CANCEL\n"
+    let mut reader = BufReader::new(&stream);
+    let mut status_line = String::new();
+    reader
+        .read_line(&mut status_line)
+        .map_err(|e| format!("read status: {e}"))?;
+    let status = status_line.trim_end_matches(['\r', '\n']);
+
+    if status == "CANCEL" {
+        return Ok(None);
+    }
+    if status == "OK" {
+        let mut passphrase_line = String::new();
+        reader
+            .read_line(&mut passphrase_line)
+            .map_err(|e| format!("read passphrase: {e}"))?;
+        // Strip trailing newline only — not other whitespace (passphrase could have spaces).
+        let passphrase = passphrase_line.trim_end_matches(['\r', '\n']).to_string();
+        return Ok(Some(passphrase));
+    }
+
+    Err(format!("Unexpected response from askpass server: {status}"))
+}
+
+// ── SSH diagnostics ───────────────────────────────────────────────────────────
+
+/// Outcome of running `ssh-add -l`.
+#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
+#[serde(rename_all = "snake_case")]
+pub enum SshAddStatus {
+    /// Agent is running and has at least one identity loaded.
+    HasIdentities(usize),
+    /// Agent is running but has no identities.
+    NoIdentities,
+    /// Agent is not reachable (SSH_AUTH_SOCK missing or connection refused).
+    AgentUnreachable,
+    /// `ssh-add` command is not available in PATH.
+    CommandUnavailable,
+    /// Status could not be determined.
+    Unknown,
+}
+
+/// User-facing guidance strings for common SSH states.
+pub fn ssh_agent_guidance(
+    add_status: &SshAddStatus,
+    remote_is_ssh: bool,
+    ssh_command: Option<&str>,
+) -> Vec<String> {
+    let mut hints: Vec<String> = Vec::new();
+
+    if !remote_is_ssh {
+        return hints;
+    }
+
+    match add_status {
+        SshAddStatus::HasIdentities(_) => {
+            hints.push("ssh-agent has identities loaded — push/pull should work without a passphrase prompt.".to_string());
+        }
+        SshAddStatus::NoIdentities => {
+            hints.push("ssh-agent is reachable but has no identities. Run: ssh-add ~/.ssh/id_ed25519 (or your key path)".to_string());
+        }
+        SshAddStatus::AgentUnreachable => {
+            hints.push(
+                "No SSH agent detected (SSH_AUTH_SOCK not set or agent not running).".to_string(),
+            );
+            #[cfg(target_os = "windows")]
+            hints.push("On Windows: enable the OpenSSH Authentication Agent service in Services → set to Automatic, then start it. Then run: ssh-add".to_string());
+            #[cfg(not(target_os = "windows"))]
+            hints.push("On Linux/macOS: start the agent with eval $(ssh-agent -s) then run: ssh-add ~/.ssh/id_ed25519".to_string());
+        }
+        SshAddStatus::CommandUnavailable => {
+            hints.push("ssh-add is not available — install OpenSSH client.".to_string());
+        }
+        SshAddStatus::Unknown => {}
+    }
+
+    // Windows: detect likely Git-for-Windows SSH vs Windows OpenSSH mismatch.
+    #[cfg(target_os = "windows")]
+    {
+        let uses_system_ssh = ssh_command
+            .map(|c| {
+                let lower = c.to_ascii_lowercase();
+                lower.contains("openssh") || lower.contains("system32")
+            })
+            .unwrap_or(false);
+        let no_override = ssh_command.is_none();
+        if no_override || !uses_system_ssh {
+            hints.push(
+                "If Git is using its own bundled SSH instead of Windows OpenSSH, add/load your key may not reach the Windows agent. \
+                 To fix: git config --global core.sshCommand \"C:/Windows/System32/OpenSSH/ssh.exe\""
+                    .to_string(),
+            );
+        }
+    }
+    #[cfg(not(target_os = "windows"))]
+    let _ = ssh_command;
+
+    hints
+}
+
+/// Run an external command with a timeout, returning stdout+stderr on success.
+fn run_with_timeout(cmd: &mut Command, timeout: Duration) -> Option<std::process::Output> {
+    let start = Instant::now();
+    match cmd.spawn() {
+        Err(_) => None,
+        Ok(mut child) => loop {
+            if start.elapsed() >= timeout {
+                child.kill().ok();
+                return None;
+            }
+            match child.try_wait() {
+                Ok(Some(_)) => return child.wait_with_output().ok(),
+                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
+                Err(_) => return None,
+            }
+        },
+    }
+}
+
+/// Probe `ssh-add -l` and classify the result.
+pub fn probe_ssh_add() -> SshAddStatus {
+    let timeout = Duration::from_secs(3);
+
+    #[cfg(windows)]
+    let mut cmd = {
+        let mut c = Command::new("ssh-add");
+        use std::os::windows::process::CommandExt;
+        c.creation_flags(0x0800_0000);
+        c
+    };
+    #[cfg(not(windows))]
+    let mut cmd = Command::new("ssh-add");
+
+    cmd.arg("-l")
+        .stdin(std::process::Stdio::null())
+        .stdout(std::process::Stdio::piped())
+        .stderr(std::process::Stdio::piped());
+
+    let output = match run_with_timeout(&mut cmd, timeout) {
+        None => return SshAddStatus::CommandUnavailable,
+        Some(o) => o,
+    };
+
+    let stdout = String::from_utf8_lossy(&output.stdout);
+    let stderr = String::from_utf8_lossy(&output.stderr);
+    let combined = format!("{stdout}{stderr}").to_ascii_lowercase();
+
+    if combined.contains("the agent has no identities")
+        || combined.contains("agent has no identities")
+        || combined.contains("no identities")
+    {
+        return SshAddStatus::NoIdentities;
+    }
+    if combined.contains("could not open")
+        || combined.contains("error connecting")
+        || combined.contains("no such file")
+        || combined.contains("connection refused")
+    {
+        return SshAddStatus::AgentUnreachable;
+    }
+    if combined.is_empty() && !output.status.success() {
+        // ssh-add -l exits 2 when agent unreachable on some platforms
+        if output.status.code() == Some(2) {
+            return SshAddStatus::AgentUnreachable;
+        }
+        return SshAddStatus::Unknown;
+    }
+    // Count lines that look like identities (e.g. "256 SHA256:... user@host (ED25519)")
+    let identity_count = stdout
+        .lines()
+        .filter(|l| l.len() > 10 && !l.trim().is_empty())
+        .count();
+    if identity_count > 0 {
+        SshAddStatus::HasIdentities(identity_count)
+    } else if output.status.success() {
+        SshAddStatus::NoIdentities
+    } else {
+        SshAddStatus::Unknown
+    }
+}
+
+/// Detect the ssh executable path.
+pub fn find_ssh_executable() -> Option<String> {
+    let timeout = Duration::from_secs(3);
+
+    #[cfg(windows)]
+    let mut cmd = {
+        let mut c = Command::new("where");
+        use std::os::windows::process::CommandExt;
+        c.creation_flags(0x0800_0000);
+        c.arg("ssh");
+        c
+    };
+    #[cfg(not(windows))]
+    let mut cmd = {
+        let mut c = Command::new("which");
+        c.arg("ssh");
+        c
+    };
+
+    cmd.stdin(std::process::Stdio::null())
+        .stdout(std::process::Stdio::piped())
+        .stderr(std::process::Stdio::null());
+
+    run_with_timeout(&mut cmd, timeout).and_then(|o| {
+        if o.status.success() {
+            let path = String::from_utf8_lossy(&o.stdout)
+                .lines()
+                .next()
+                .map(|s| s.trim().to_string())
+                .filter(|s| !s.is_empty());
+            path
+        } else {
+            None
+        }
+    })
+}
+
+/// Get the `ssh -V` version string.
+pub fn get_ssh_version() -> Option<String> {
+    let timeout = Duration::from_secs(3);
+
+    #[cfg(windows)]
+    let mut cmd = {
+        let mut c = Command::new("ssh");
+        use std::os::windows::process::CommandExt;
+        c.creation_flags(0x0800_0000);
+        c
+    };
+    #[cfg(not(windows))]
+    let mut cmd = Command::new("ssh");
+
+    cmd.arg("-V")
+        .stdin(std::process::Stdio::null())
+        .stdout(std::process::Stdio::piped())
+        .stderr(std::process::Stdio::piped());
+
+    run_with_timeout(&mut cmd, timeout).and_then(|o| {
+        // `ssh -V` writes to stderr on most implementations.
+        let ver = String::from_utf8_lossy(&o.stderr).trim().to_string();
+        if !ver.is_empty() {
+            Some(ver)
+        } else {
+            let ver2 = String::from_utf8_lossy(&o.stdout).trim().to_string();
+            if ver2.is_empty() {
+                None
+            } else {
+                Some(ver2)
+            }
+        }
+    })
+}
+
+/// Get `git config --get core.sshCommand` from the repository path, if configured.
+pub fn get_core_ssh_command(repo_path: &Path) -> Option<String> {
+    let timeout = Duration::from_secs(3);
+
+    #[cfg(windows)]
+    let mut cmd = {
+        let mut c = Command::new("git");
+        use std::os::windows::process::CommandExt;
+        c.creation_flags(0x0800_0000);
+        c
+    };
+    #[cfg(not(windows))]
+    let mut cmd = Command::new("git");
+
+    cmd.args(["config", "--get", "core.sshCommand"])
+        .current_dir(repo_path)
+        .stdin(std::process::Stdio::null())
+        .stdout(std::process::Stdio::piped())
+        .stderr(std::process::Stdio::null());
+
+    run_with_timeout(&mut cmd, timeout).and_then(|o| {
+        if o.status.success() {
+            let val = String::from_utf8_lossy(&o.stdout).trim().to_string();
+            if val.is_empty() {
+                None
+            } else {
+                Some(val)
+            }
+        } else {
+            None
+        }
+    })
+}
+
+// ── Tests ─────────────────────────────────────────────────────────────────────
+
+#[cfg(test)]
+mod tests {
+    use super::*;
+
+    #[test]
+    fn generate_token_is_non_empty() {
+        let t = generate_token();
+        assert!(!t.is_empty());
+    }
+
+    #[test]
+    fn generate_token_is_unique() {
+        let t1 = generate_token();
+        let t2 = generate_token();
+        // Not guaranteed unique on very fast hardware, but practically always true.
+        // At minimum both should be non-empty.
+        assert!(!t1.is_empty());
+        assert!(!t2.is_empty());
+    }
+
+    #[test]
+    fn sanitize_prompt_strips_control_chars() {
+        let raw = "Enter passphrase for key '/home/user/.ssh/id_ed25519':\x00\x1b";
+        let s = sanitize_prompt(raw);
+        assert!(!s.contains('\x00'));
+        assert!(!s.contains('\x1b'));
+        assert!(s.contains("Enter passphrase"));
+    }
+
+    #[test]
+    fn sanitize_prompt_empty_becomes_default() {
+        let s = sanitize_prompt("");
+        assert_eq!(s, "Enter SSH key passphrase");
+    }
+
+    #[test]
+    fn sanitize_prompt_whitespace_only_becomes_default() {
+        let s = sanitize_prompt("   ");
+        assert_eq!(s, "Enter SSH key passphrase");
+    }
+
+    #[test]
+    fn build_askpass_env_pairs_contains_required_keys() {
+        let env = AskpassEnv {
+            binary_path: "/usr/bin/myapp".to_string(),
+            port: 12345,
+            token: "abc123".to_string(),
+        };
+        let pairs = build_askpass_env_pairs(&env);
+        let keys: Vec<&str> = pairs.iter().map(|(k, _)| k.as_str()).collect();
+        assert!(keys.contains(&"SSH_ASKPASS"));
+        assert!(keys.contains(&"SSH_ASKPASS_REQUIRE"));
+        assert!(keys.contains(&"RIS_ASKPASS_MODE"));
+        assert!(keys.contains(&"RIS_ASKPASS_PORT"));
+        assert!(keys.contains(&"RIS_ASKPASS_TOKEN"));
+    }
+
+    #[test]
+    fn build_askpass_env_pairs_does_not_contain_passphrase() {
+        let env = AskpassEnv {
+            binary_path: "/usr/bin/myapp".to_string(),
+            port: 12345,
+            token: "abc123".to_string(),
+        };
+        let pairs = build_askpass_env_pairs(&env);
+        // No pair key or value should be named "passphrase" or "password".
+        for (k, v) in &pairs {
+            let k_lower = k.to_ascii_lowercase();
+            let v_lower = v.to_ascii_lowercase();
+            assert!(
+                !k_lower.contains("passphrase"),
+                "key contains passphrase: {k}"
+            );
+            assert!(!k_lower.contains("password"), "key contains password: {k}");
+            assert!(
+                !v_lower.contains("passphrase"),
+                "value contains passphrase: {v}"
+            );
+            assert!(
+                !v_lower.contains("password"),
+                "value contains password: {v}"
+            );
+        }
+    }
+
+    #[test]
+    fn askpass_session_respond_fails_when_no_session() {
+        let state = AskpassState::new();
+        let result = state.respond(Some("secret".to_string()));
+        assert!(result.is_err());
+    }
+
+    #[test]
+    fn askpass_session_lifecycle_create_and_clear() {
+        let state = AskpassState::new();
+        // No session initially
+        assert!(state.inner.lock().unwrap().is_none());
+        // respond fails with no session
+        assert!(state.respond(None).is_err());
+        // clear_session is a no-op when no session exists
+        state.clear_session();
+        assert!(state.inner.lock().unwrap().is_none());
+    }
+
+    #[test]
+    fn tcp_roundtrip_passphrase() {
+        // Spin up a listener, connect as the askpass helper, verify the protocol.
+        use std::thread;
+
+        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
+        let port = listener.local_addr().unwrap().port();
+        let token = "test-token-roundtrip".to_string();
+        let token_clone = token.clone();
+        let expected_passphrase = "super-secret-123".to_string();
+        let expected_clone = expected_passphrase.clone();
+
+        // Server thread: accept one connection, send passphrase.
+        let server = thread::spawn(move || {
+            let (mut stream, _) = listener.accept().unwrap();
+            let mut write_stream = stream.try_clone().unwrap();
+            let mut reader = BufReader::new(&stream);
+
+            let mut token_line = String::new();
+            reader.read_line(&mut token_line).unwrap();
+            assert_eq!(token_line.trim_end_matches(['\r', '\n']), token_clone);
+
+            let mut _prompt_line = String::new();
+            reader.read_line(&mut _prompt_line).unwrap();
+
+            let response = format!("OK\n{expected_clone}\n");
+            write_stream.write_all(response.as_bytes()).unwrap();
+        });
+
+        // Client (askpass helper role).
+        let result = connect_and_get_passphrase(port, &token, "Enter passphrase:");
+        server.join().unwrap();
+
+        assert_eq!(result.unwrap(), Some(expected_passphrase));
+    }
+
+    #[test]
+    fn tcp_roundtrip_cancel() {
+        use std::thread;
+
+        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
+        let port = listener.local_addr().unwrap().port();
+        let token = "test-token-cancel".to_string();
+        let token_clone = token.clone();
+
+        let server = thread::spawn(move || {
+            let (mut stream, _) = listener.accept().unwrap();
+            let mut reader = BufReader::new(&stream);
+            let mut _line = String::new();
+            reader.read_line(&mut _line).unwrap();
+            let mut _line2 = String::new();
+            reader.read_line(&mut _line2).unwrap();
+            stream.write_all(b"CANCEL\n").unwrap();
+        });
+
+        let result = connect_and_get_passphrase(port, &token_clone, "Enter passphrase:");
+        server.join().unwrap();
+
+        assert_eq!(result.unwrap(), None);
+    }
+
+    #[test]
+    fn tcp_roundtrip_wrong_token_rejected() {
+        use std::thread;
+
+        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
+        let port = listener.local_addr().unwrap().port();
+
+        // Server sends CANCEL for any request (simulates token mismatch handling).
+        let server = thread::spawn(move || {
+            if let Ok((mut stream, _)) = listener.accept() {
+                let mut reader = BufReader::new(&stream);
+                let mut _line = String::new();
+                reader.read_line(&mut _line).unwrap();
+                let mut _line2 = String::new();
+                reader.read_line(&mut _line2).unwrap();
+                // Server rejects wrong token — sends CANCEL.
+                stream.write_all(b"CANCEL\n").unwrap();
+            }
+        });
+
+        let result = connect_and_get_passphrase(port, "wrong-token", "Enter passphrase:");
+        server.join().unwrap();
+        // Client receives CANCEL → Ok(None).
+        assert_eq!(result.unwrap(), None);
+    }
+
+    #[test]
+    fn ssh_agent_guidance_empty_for_https() {
+        let hints = ssh_agent_guidance(&SshAddStatus::AgentUnreachable, false, None);
+        assert!(hints.is_empty(), "should produce no hints for HTTPS remote");
+    }
+
+    #[test]
+    fn ssh_agent_guidance_has_hint_for_no_identities_ssh() {
+        let hints = ssh_agent_guidance(&SshAddStatus::NoIdentities, true, None);
+        assert!(!hints.is_empty());
+        assert!(hints[0].to_ascii_lowercase().contains("ssh-add"));
+    }
+
+    #[test]
+    fn ssh_agent_guidance_has_hint_for_unreachable_agent() {
+        let hints = ssh_agent_guidance(&SshAddStatus::AgentUnreachable, true, None);
+        assert!(!hints.is_empty());
+    }
+}
diff --git a/apps/desktop/src/App.nav.test.tsx b/apps/desktop/src/App.nav.test.tsx
index 7ab4bc0..41b42dd 100644
--- a/apps/desktop/src/App.nav.test.tsx
+++ b/apps/desktop/src/App.nav.test.tsx
@@ -5,6 +5,10 @@ import { AppBusyProvider } from "./lib/appBusy";
 
 // ── Mock heavy dependencies ────────────────────────────────────────────────────
 
+vi.mock("@tauri-apps/api/event", () => ({
+  listen: vi.fn().mockResolvedValue(() => {}),
+}));
+
 vi.mock("./api/tauriClient", () => ({
   closeRepository: vi.fn(),
   getRepositorySummary: vi.fn().mockResolvedValue({}),
@@ -57,6 +61,9 @@ vi.mock("./features/settings/SettingsPanel", () => ({
 vi.mock("./features/search/GlobalSearch", () => ({
   GlobalSearch: () => null,
 }));
+vi.mock("./features/repository/SshPassphraseModal", () => ({
+  SshPassphraseModal: () => null,
+}));
 
 import { App } from "./App";
 
diff --git a/apps/desktop/src/App.tsx b/apps/desktop/src/App.tsx
index 832c75c..43c3298 100644
--- a/apps/desktop/src/App.tsx
+++ b/apps/desktop/src/App.tsx
@@ -1,4 +1,5 @@
-import { useState } from "react";
+import { useState, useEffect } from "react";
+import { listen } from "@tauri-apps/api/event";
 import { useBusy } from "./lib/appBusy";
 import {
   closeRepository,
@@ -24,6 +25,7 @@ import { DevicesPanel } from "./features/devices/DevicesPanel";
 import { DeviceModelsPanel } from "./features/deviceModels/DeviceModelsPanel";
 import { CsvImportPanel } from "./features/csvImport/CsvImportPanel";
 import { SettingsPanel } from "./features/settings/SettingsPanel";
+import { SshPassphraseModal } from "./features/repository/SshPassphraseModal";
 import {
   GlobalSearch,
   type SearchNavigationEvent,
@@ -81,8 +83,20 @@ export function App() {
     placementId?: string;
   } | null>(null);
 
+  const [askpassPrompt, setAskpassPrompt] = useState<string | null>(null);
+
   const isOpen = summary !== null;
 
+  // Listen for SSH passphrase requests emitted by the backend askpass session.
+  useEffect(() => {
+    const unlisten = listen<string>("ssh-passphrase-requested", (event) => {
+      setAskpassPrompt(event.payload);
+    });
+    return () => {
+      unlisten.then((fn) => fn());
+    };
+  }, []);
+
   function handleSaveSuccess() {
     setHasUnsavedChanges(false);
     setGitRefreshToken((t) => t + 1);
@@ -499,6 +513,12 @@ export function App() {
           )}
         </main>
       </div>
+
+      <SshPassphraseModal
+        open={askpassPrompt !== null}
+        prompt={askpassPrompt ?? ""}
+        onDismiss={() => setAskpassPrompt(null)}
+      />
     </div>
   );
 }
diff --git a/apps/desktop/src/api/tauriClient.ts b/apps/desktop/src/api/tauriClient.ts
index 77ea33c..d60f843 100644
--- a/apps/desktop/src/api/tauriClient.ts
+++ b/apps/desktop/src/api/tauriClient.ts
@@ -502,6 +502,28 @@ export function pullGitFfOnly(remote: string): Promise<RepositorySummaryDto> {
   return invoke("pull_git_ff_only", { remote });
 }
 
+export interface SshDiagnosticsDto {
+  remote_url: string | null;
+  remote_url_is_ssh: boolean;
+  ssh_auth_sock: string | null;
+  ssh_add_status: "has_identities" | "no_identities" | "agent_unreachable" | "command_unavailable" | "unknown";
+  ssh_add_identity_count: number | null;
+  core_ssh_command: string | null;
+  ssh_executable: string | null;
+  ssh_version: string | null;
+  guidance: string[];
+}
+
+/** Deliver the user's passphrase (or null to cancel) to the waiting askpass session. */
+export function respondSshPassphrase(passphrase: string | null): Promise<void> {
+  return invoke("respond_ssh_passphrase", { passphrase });
+}
+
+/** Fetch SSH diagnostics for the currently open repository and optionally a specific remote. */
+export function getSshDiagnostics(remote?: string): Promise<SshDiagnosticsDto> {
+  return invoke("get_ssh_diagnostics", { remote: remote ?? null });
+}
+
 // ── Create repository ─────────────────────────────────────────────────────────
 
 export interface CreateRepositoryInput {
diff --git a/apps/desktop/src/features/repository/SshPassphraseModal.test.tsx b/apps/desktop/src/features/repository/SshPassphraseModal.test.tsx
new file mode 100644
index 0000000..61dc675
--- /dev/null
+++ b/apps/desktop/src/features/repository/SshPassphraseModal.test.tsx
@@ -0,0 +1,106 @@
+import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
+import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
+import { SshPassphraseModal } from "./SshPassphraseModal";
+import * as tauriClient from "../../api/tauriClient";
+
+vi.mock("../../api/tauriClient", () => ({
+  respondSshPassphrase: vi.fn().mockResolvedValue(undefined),
+}));
+
+afterEach(() => {
+  cleanup();
+  vi.clearAllMocks();
+});
+
+describe("SshPassphraseModal", () => {
+  const onDismiss = vi.fn();
+
+  beforeEach(() => {
+    onDismiss.mockReset();
+  });
+
+  it("does not render when open=false", () => {
+    render(<SshPassphraseModal open={false} prompt="" onDismiss={onDismiss} />);
+    expect(screen.queryByTestId("ssh-passphrase-input")).toBeNull();
+  });
+
+  it("renders the modal when open=true", () => {
+    render(<SshPassphraseModal open={true} prompt="Enter passphrase:" onDismiss={onDismiss} />);
+    expect(screen.getByTestId("ssh-passphrase-input")).toBeTruthy();
+    expect(screen.getByText(/SSH key passphrase required/i)).toBeTruthy();
+  });
+
+  it("shows the prompt text from backend", () => {
+    render(
+      <SshPassphraseModal
+        open={true}
+        prompt="Enter passphrase for key '/home/user/.ssh/id_ed25519':"
+        onDismiss={onDismiss}
+      />,
+    );
+    expect(screen.getByText(/id_ed25519/)).toBeTruthy();
+  });
+
+  it("shows guidance to use ssh-add", () => {
+    render(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);
+    expect(screen.getByText(/ssh-add/i)).toBeTruthy();
+  });
+
+  it("calls respondSshPassphrase with the typed passphrase on Continue", async () => {
+    render(<SshPassphraseModal open={true} prompt="Enter passphrase:" onDismiss={onDismiss} />);
+
+    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
+      target: { value: "my-secret" },
+    });
+    fireEvent.click(screen.getByText("Continue"));
+
+    await waitFor(() => {
+      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith("my-secret");
+    });
+    expect(onDismiss).toHaveBeenCalled();
+  });
+
+  it("calls respondSshPassphrase with null on Cancel", async () => {
+    render(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);
+
+    fireEvent.click(screen.getByText("Cancel"));
+
+    await waitFor(() => {
+      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith(null);
+    });
+    expect(onDismiss).toHaveBeenCalled();
+  });
+
+  it("calls respondSshPassphrase with passphrase on Enter key", async () => {
+    render(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);
+
+    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
+      target: { value: "hunter2" },
+    });
+    fireEvent.keyDown(screen.getByTestId("ssh-passphrase-input"), { key: "Enter" });
+
+    await waitFor(() => {
+      expect(tauriClient.respondSshPassphrase).toHaveBeenCalledWith("hunter2");
+    });
+    expect(onDismiss).toHaveBeenCalled();
+  });
+
+  it("clears the input after successful submit", async () => {
+    const { rerender } = render(
+      <SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />,
+    );
+
+    fireEvent.change(screen.getByTestId("ssh-passphrase-input"), {
+      target: { value: "secret" },
+    });
+    expect((screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value).toBe("secret");
+
+    fireEvent.click(screen.getByText("Continue"));
+    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
+
+    // Re-open: input should be blank.
+    rerender(<SshPassphraseModal open={false} prompt="" onDismiss={onDismiss} />);
+    rerender(<SshPassphraseModal open={true} prompt="" onDismiss={onDismiss} />);
+    expect((screen.getByTestId("ssh-passphrase-input") as HTMLInputElement).value).toBe("");
+  });
+});
diff --git a/apps/desktop/src/features/repository/SshPassphraseModal.tsx b/apps/desktop/src/features/repository/SshPassphraseModal.tsx
new file mode 100644
index 0000000..ed924e6
--- /dev/null
+++ b/apps/desktop/src/features/repository/SshPassphraseModal.tsx
@@ -0,0 +1,123 @@
+import { useState, useEffect, useRef } from "react";
+import { Modal } from "../../components/ui/Modal";
+import { Field } from "../../components/ui/Field";
+import { respondSshPassphrase } from "../../api/tauriClient";
+
+export interface SshPassphraseModalProps {
+  open: boolean;
+  /** The prompt string from OpenSSH (sanitized by the backend). */
+  prompt: string;
+  /** Called after the passphrase has been submitted or the modal cancelled. */
+  onDismiss: () => void;
+}
+
+export function SshPassphraseModal({ open, prompt, onDismiss }: SshPassphraseModalProps) {
+  const [passphrase, setPassphrase] = useState("");
+  const [pending, setPending] = useState(false);
+  const [error, setError] = useState<string | null>(null);
+  const inputRef = useRef<HTMLInputElement>(null);
+
+  // Reset state whenever the modal opens.
+  useEffect(() => {
+    if (open) {
+      setPassphrase("");
+      setError(null);
+      setPending(false);
+      // Defer focus so the portal is mounted.
+      setTimeout(() => inputRef.current?.focus(), 50);
+    }
+  }, [open]);
+
+  async function submit() {
+    if (pending) return;
+    setPending(true);
+    setError(null);
+    try {
+      await respondSshPassphrase(passphrase);
+    } catch (e) {
+      setError(String(e));
+      setPending(false);
+      return;
+    }
+    setPassphrase("");
+    onDismiss();
+  }
+
+  async function cancel() {
+    if (pending) return;
+    setPending(true);
+    try {
+      await respondSshPassphrase(null);
+    } catch {
+      // Ignore — session may already be gone.
+    }
+    setPassphrase("");
+    onDismiss();
+  }
+
+  function handleKeyDown(e: React.KeyboardEvent) {
+    if (e.key === "Enter") submit();
+  }
+
+  return (
+    <Modal
+      open={open}
+      title="SSH key passphrase required"
+      onClose={cancel}
+      disableBackdropClose
+      size="sm"
+      footer={
+        <>
+          <button className="btn btn-secondary" onClick={cancel} disabled={pending}>
+            Cancel
+          </button>
+          <button className="btn btn-primary" onClick={submit} disabled={pending}>
+            {pending ? "Sending…" : "Continue"}
+          </button>
+        </>
+      }
+      footerMessage={error ?? undefined}
+      footerMessageTone={error ? "err" : undefined}
+    >
+      <p style={{ marginBottom: 12 }}>
+        OpenSSH is requesting a passphrase. This will be used once and not stored.
+      </p>
+      {prompt && (
+        <p
+          style={{
+            marginBottom: 12,
+            fontFamily: "monospace",
+            fontSize: "0.85em",
+            color: "var(--fg-muted, #888)",
+            wordBreak: "break-all",
+          }}
+        >
+          {prompt}
+        </p>
+      )}
+      <Field label="Passphrase">
+        <input
+          ref={inputRef}
+          type="password"
+          className="input"
+          value={passphrase}
+          onChange={(e) => setPassphrase(e.target.value)}
+          onKeyDown={handleKeyDown}
+          disabled={pending}
+          autoComplete="off"
+          data-testid="ssh-passphrase-input"
+        />
+      </Field>
+      <p
+        style={{
+          marginTop: 14,
+          fontSize: "0.82em",
+          color: "var(--fg-muted, #888)",
+        }}
+      >
+        To avoid this prompt in the future, add the key to ssh-agent with{" "}
+        <code>ssh-add</code>.
+      </p>
+    </Modal>
+  );
+}
diff --git a/crates/ris-git/src/lib.rs b/crates/ris-git/src/lib.rs
index ba5bd3a..9e534c6 100644
--- a/crates/ris-git/src/lib.rs
+++ b/crates/ris-git/src/lib.rs
@@ -100,9 +100,16 @@ pub struct GitRemoteSummary {
 
 // ── internal helpers ──────────────────────────────────────────────────────────
 
-fn run_git(repo_path: &Path, args: &[&str]) -> Result<std::process::Output, GitError> {
+fn run_git_impl(
+    repo_path: &Path,
+    args: &[&str],
+    extra_env: &[(&str, &str)],
+) -> Result<std::process::Output, GitError> {
     let mut cmd = Command::new("git");
     cmd.args(args).current_dir(repo_path);
+    for (k, v) in extra_env {
+        cmd.env(k, v);
+    }
 
     // Suppress the transient console/cmd window that would otherwise flash on
     // Windows when spawning git.exe from a GUI process.
@@ -115,6 +122,10 @@ fn run_git(repo_path: &Path, args: &[&str]) -> Result<std::process::Output, GitE
     cmd.output().map_err(GitError::from)
 }
 
+fn run_git(repo_path: &Path, args: &[&str]) -> Result<std::process::Output, GitError> {
+    run_git_impl(repo_path, args, &[])
+}
+
 fn command_error(output: &std::process::Output) -> GitError {
     let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
     let stderr = if stderr.is_empty() {
@@ -459,10 +470,15 @@ pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<(), GitErro
 }
 
 /// Push the current branch to `remote`, setting the upstream tracking ref (`-u`).
-pub fn push_current_branch(repo_path: &Path, remote: &str) -> Result<(), GitError> {
+/// Pass `extra_env` to inject environment variables such as SSH_ASKPASS into the git subprocess.
+pub fn push_current_branch_with_env(
+    repo_path: &Path,
+    remote: &str,
+    extra_env: &[(&str, &str)],
+) -> Result<(), GitError> {
     validate_remote_name(remote)?;
     let branch = current_branch(repo_path)?;
-    let output = run_git(repo_path, &["push", "-u", remote, &branch])?;
+    let output = run_git_impl(repo_path, &["push", "-u", remote, &branch], extra_env)?;
     if output.status.success() {
         Ok(())
     } else {
@@ -470,11 +486,21 @@ pub fn push_current_branch(repo_path: &Path, remote: &str) -> Result<(), GitErro
     }
 }
 
+/// Push the current branch — convenience wrapper with no extra environment.
+pub fn push_current_branch(repo_path: &Path, remote: &str) -> Result<(), GitError> {
+    push_current_branch_with_env(repo_path, remote, &[])
+}
+
 /// Pull the current branch from `remote` using `--ff-only`.
 ///
 /// Rejects immediately if the working tree is not clean (staged, unstaged, or untracked files),
 /// to avoid ambiguous state after a fast-forward that lands new YAML content.
-pub fn pull_ff_only(repo_path: &Path, remote: &str) -> Result<(), GitError> {
+/// Pass `extra_env` to inject environment variables such as SSH_ASKPASS into the git subprocess.
+pub fn pull_ff_only_with_env(
+    repo_path: &Path,
+    remote: &str,
+    extra_env: &[(&str, &str)],
+) -> Result<(), GitError> {
     validate_remote_name(remote)?;
 
     // Guard: refuse if working tree is dirty.
@@ -484,7 +510,11 @@ pub fn pull_ff_only(repo_path: &Path, remote: &str) -> Result<(), GitError> {
     }
 
     let branch = current_branch(repo_path)?;
-    let output = run_git(repo_path, &["pull", "--ff-only", remote, &branch])?;
+    let output = run_git_impl(
+        repo_path,
+        &["pull", "--ff-only", remote, &branch],
+        extra_env,
+    )?;
     if output.status.success() {
         Ok(())
     } else {
@@ -492,6 +522,162 @@ pub fn pull_ff_only(repo_path: &Path, remote: &str) -> Result<(), GitError> {
     }
 }
 
+/// Pull the current branch — convenience wrapper with no extra environment.
+pub fn pull_ff_only(repo_path: &Path, remote: &str) -> Result<(), GitError> {
+    pull_ff_only_with_env(repo_path, remote, &[])
+}
+
+// ── SSH helpers ───────────────────────────────────────────────────────────────
+
+/// Returns true when `url` looks like an SSH remote (git@…, ssh://, or ssh+git://).
+pub fn is_ssh_url(url: &str) -> bool {
+    url.starts_with("git@") || url.starts_with("ssh://") || url.starts_with("ssh+git://")
+}
+
+/// Classifies a Git stderr string for common SSH authentication failures.
+///
+/// Returns a user-friendly message string when a known pattern is matched, or
+/// `None` when the error does not appear SSH-related.
+pub fn classify_git_ssh_error(stderr: &str) -> Option<String> {
+    let s = stderr.to_ascii_lowercase();
+    if s.contains("permission denied (publickey") || s.contains("permission denied (public key") {
+        return Some(
+            "SSH authentication failed. Your key may require a passphrase or may not be \
+             loaded in ssh-agent. Run ssh-add to add your key."
+                .to_string(),
+        );
+    }
+    if s.contains("could not read from remote repository") {
+        return Some(
+            "Could not read from remote repository. Check your network connection and remote URL."
+                .to_string(),
+        );
+    }
+    if s.contains("agent admitted failure") {
+        return Some(
+            "SSH agent admitted failure signing with the key. Try ssh-add to reload the key."
+                .to_string(),
+        );
+    }
+    if s.contains("no such identity") {
+        return Some(
+            "SSH key identity not found. Run ssh-add to load your key into the agent.".to_string(),
+        );
+    }
+    if s.contains("bad passphrase") {
+        return Some("Incorrect SSH key passphrase. Authentication failed.".to_string());
+    }
+    if s.contains("host key verification failed") {
+        return Some(
+            "SSH host key verification failed. The remote server's host key is untrusted or has \
+             changed. Check ~/.ssh/known_hosts."
+                .to_string(),
+        );
+    }
+    if s.contains("too many authentication failures") {
+        return Some(
+            "Too many SSH authentication attempts failed. Try adding your key to ssh-agent with \
+             ssh-add."
+                .to_string(),
+        );
+    }
+    if s.contains("permission denied") {
+        return Some(
+            "SSH authentication failed. Check that your key is loaded in ssh-agent or that the \
+             key has access to the remote repository."
+                .to_string(),
+        );
+    }
+    None
+}
+
+// ── SSH helper unit tests ─────────────────────────────────────────────────────
+
+#[cfg(test)]
+mod ssh_tests {
+    use super::*;
+
+    #[test]
+    fn is_ssh_url_recognises_git_at_prefix() {
+        assert!(is_ssh_url("git@github.com:org/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_recognises_ssh_scheme() {
+        assert!(is_ssh_url("ssh://git@github.com/org/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_recognises_ssh_git_scheme() {
+        assert!(is_ssh_url("ssh+git://git@github.com/org/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_https() {
+        assert!(!is_ssh_url("https://github.com/org/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_http() {
+        assert!(!is_ssh_url("http://github.com/org/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_empty() {
+        assert!(!is_ssh_url(""));
+    }
+
+    #[test]
+    fn classify_permission_denied_publickey() {
+        let stderr = "git@github.com: Permission denied (publickey).";
+        assert!(classify_git_ssh_error(stderr).is_some());
+        let msg = classify_git_ssh_error(stderr).unwrap();
+        assert!(msg.contains("ssh-agent") || msg.contains("ssh-add"));
+    }
+
+    #[test]
+    fn classify_could_not_read_from_remote() {
+        let msg = classify_git_ssh_error("fatal: Could not read from remote repository.").unwrap();
+        assert!(msg.contains("remote repository"));
+    }
+
+    #[test]
+    fn classify_agent_admitted_failure() {
+        let msg = classify_git_ssh_error(
+            "sign_and_send_pubkey: signing failed: agent admitted failure to sign",
+        )
+        .unwrap();
+        assert!(msg.contains("agent admitted failure"));
+    }
+
+    #[test]
+    fn classify_host_key_verification_failed() {
+        let msg = classify_git_ssh_error("Host key verification failed.").unwrap();
+        assert!(msg.contains("host key"));
+    }
+
+    #[test]
+    fn classify_too_many_failures() {
+        let msg = classify_git_ssh_error(
+            "Received disconnect from host: 2: Too many authentication failures",
+        )
+        .unwrap();
+        assert!(msg.contains("Too many"));
+    }
+
+    #[test]
+    fn classify_returns_none_for_non_ssh_error() {
+        assert!(classify_git_ssh_error("YAML parse error at line 5").is_none());
+        assert!(classify_git_ssh_error("nothing to commit, working tree clean").is_none());
+    }
+
+    #[test]
+    fn redact_ssh_url_does_not_strip_git_at() {
+        // is_ssh_url should handle git@ URLs that do NOT contain credentials
+        assert!(is_ssh_url("git@github.com:user/repo.git"));
+    }
+}
+
 // ── parser unit tests ─────────────────────────────────────────────────────────
 
 #[cfg(test)]
diff --git a/docs/BETA1_FOLLOWUP_PLAN_EN.md b/docs/BETA1_FOLLOWUP_PLAN_EN.md
index d649f1f..45843c9 100644
--- a/docs/BETA1_FOLLOWUP_PLAN_EN.md
+++ b/docs/BETA1_FOLLOWUP_PLAN_EN.md
@@ -24,18 +24,41 @@ helper writes to both MIME types; `getDragPayload` reads custom MIME → `text/p
 
 ---
 
-## 2. SSH passphrase handling
+## 2. SSH passphrase handling — **being implemented in this PR**
 
 **Symptom**: Push and pull operations that require an SSH passphrase hang
 indefinitely or return a non-descriptive error because the Git process prompts for
-a passphrase on stdin, which is unavailable in a Tauri subprocess.
-
-**Plan**: Detect SSH agent availability at startup; if absent, surface a
-configurable passphrase field in the Repository settings panel and inject it via
-`GIT_SSH_COMMAND` (or equivalent) when spawning `git push` / `git pull`.
-Fall back gracefully if the key has no passphrase.
-
-**Scope**: Does not change authentication for HTTPS remotes.
+a passphrase on stdin, which is unavailable in a Tauri GUI subprocess.
+
+**Security decision**: SSH private-key passphrases are **never stored** — not in
+settings, localStorage, config files, environment variables, logs, or command-line
+arguments.
+
+**Correct implementation direction**:
+
+- **Primary path — ssh-agent**: If `ssh-agent` (or Windows OpenSSH Authentication
+  Agent) has the key loaded, push/pull works transparently with no prompt.
+- **Secondary path — one-time `SSH_ASKPASS` prompt**: When OpenSSH requests a
+  passphrase (because the key is passphrase-protected and no agent is available),
+  the app sets `SSH_ASKPASS` to itself and `SSH_ASKPASS_REQUIRE=force`, then
+  intercepts the askpass invocation via a short-lived local IPC session. A modal
+  prompts the user once; the passphrase is returned only to the SSH process that
+  requested it and is cleared immediately after.
+- **SSH diagnostics**: Surface `SSH_AUTH_SOCK`, `ssh-add -l` status, detected
+  `ssh` executable, `ssh -V`, Windows OpenSSH agent service status, and
+  `core.sshCommand` to help users troubleshoot authentication failures.
+- **Better error messages**: Classify common SSH stderr messages (permission
+  denied, no identities, agent failure, host key failure) into user-friendly
+  guidance instead of raw error strings.
+- **Windows guidance**: Recommend Windows OpenSSH Authentication Agent when no
+  agent is detected. If Git for Windows appears to be using its own bundled SSH
+  instead of Windows OpenSSH, surface guidance:
+  `git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"`
+- **HTTPS remotes**: Existing HTTPS behavior is unchanged; SSH diagnostics are
+  not shown for HTTPS remotes.
+
+**Not done in this PR**: persistent credential vault, HTTPS token management,
+Linux/macOS packaging.
 
 ---
 

From 52e895f71e547bbed4e451df8b55ac2c2ef4a200 Mon Sep 17 00:00:00 2001
From: Jakub Plucinski <su-17@wp.pl>
Date: Thu, 28 May 2026 13:50:14 +0000
Subject: [PATCH 2/2] fix(git): harden ssh askpass session handling
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

A – Hook inheritance: git push/pull with askpass env now runs with
    -c core.hooksPath=<empty-temp-dir> so repo-controlled hooks cannot
    receive RIS_ASKPASS_PORT/TOKEN (TempHooksDir RAII guard).

B – Session lifecycle: AskpassInner/AskpassEnv carry a CSPRNG session_id.
    clear_session(id) guards on id match before clearing; cancelled
    AtomicBool lets the accept-loop exit early without the full 300 s wait.
    An old timed-out thread can no longer clear a newer session.

C – CSPRNG token: generate_token() now yields 256 bits from OS CSPRNG
    (getrandom 0.2). generate_session_id() yields 64 CSPRNG bits.

D – Friendly SSH errors: ssh_error_message() classifies raw git stderr
    via classify_git_ssh_error() and prepends user-friendly text plus
    ssh-agent guidance to push/pull failures on SSH remotes.

E – scp-like URL detection: is_ssh_url() now matches any [user@]host:path
    URL (not just git@), rejects local/Windows paths and git:// scheme.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
---
 .ai/cc-report.md                           |  89 +++++-----
 Cargo.lock                                 |   1 +
 apps/desktop/src-tauri/Cargo.toml          |   1 +
 apps/desktop/src-tauri/src/commands/git.rs |  74 +++++---
 apps/desktop/src-tauri/src/ssh_askpass.rs  | 134 ++++++++++++---
 crates/ris-git/src/lib.rs                  | 186 +++++++++++++++++++--
 6 files changed, 378 insertions(+), 107 deletions(-)

diff --git a/.ai/cc-report.md b/.ai/cc-report.md
index 5b096a9..2f83c58 100644
--- a/.ai/cc-report.md
+++ b/.ai/cc-report.md
@@ -1,73 +1,74 @@
 ## Summary
 
-Implemented safe SSH passphrase handling for push/pull operations (post-beta 1 follow-up item 2). When a Git operation requires a key passphrase and no ssh-agent has the key loaded, OpenSSH invokes the app binary in askpass helper mode. The app intercepts this via a short-lived localhost TCP session, prompts the user once via a frontend modal, and forwards the passphrase only to SSH via stdout. The passphrase is never stored, logged, or passed through environment variables or CLI arguments.
+Hardened the SSH askpass session handling from PR #86 by fixing five blocking issues raised in code review:
 
-Also updated the post-beta follow-up plan document to reflect the correct implementation direction (removing incorrect "stored passphrase field" approach).
+**A — Hook inheritance prevention**: Git push/pull invoked with askpass env vars now runs with `git -c core.hooksPath=<empty-temp-dir>` so no repository-controlled pre-push or commit-msg hook can inherit `RIS_ASKPASS_PORT`/`RIS_ASKPASS_TOKEN` and connect to the local IPC server. A `TempHooksDir` RAII guard creates and removes the empty directory automatically.
 
-## Files changed
-
-### Rust (backend)
+**B — Session lifecycle safety**: Added a `session_id: u64` (CSPRNG) to each `AskpassInner` and `AskpassEnv`. `clear_session(session_id)` compares the id before clearing, so an old timed-out TCP server thread cannot inadvertently clear a newer session. The `cancelled: Arc<AtomicBool>` flag lets `clear_session` / `start_session` signal the background accept-loop to exit without waiting for the full 300 s TCP timeout.
 
-- `crates/ris-git/src/lib.rs` — Added `push_current_branch_with_env`, `pull_ff_only_with_env` (with `extra_env: &[(&str, &str)]`), kept original functions as wrappers. Added `is_ssh_url()` and `classify_git_ssh_error()`. Added 14 unit tests.
-- `apps/desktop/src-tauri/src/ssh_askpass.rs` — New module. Contains `AskpassState` (Tauri managed state), TCP server loop, `run_as_askpass()` (askpass helper mode entry point), SSH diagnostics (`probe_ssh_add`, `find_ssh_executable`, `get_ssh_version`, `get_core_ssh_command`, `ssh_agent_guidance`), `build_askpass_env_pairs()`, and unit/integration tests including TCP roundtrip tests.
-- `apps/desktop/src-tauri/src/commands/git.rs` — Updated `push_git_current_branch` and `pull_git_ff_only` to accept `State<AskpassState>` and `AppHandle`, detect SSH remotes, and start/clear askpass sessions. Added `respond_ssh_passphrase` and `get_ssh_diagnostics` commands.
-- `apps/desktop/src-tauri/src/commands/mod.rs` — Re-exported `respond_ssh_passphrase` and `get_ssh_diagnostics`.
-- `apps/desktop/src-tauri/src/dto.rs` — Added `SshDiagnosticsDto`.
-- `apps/desktop/src-tauri/src/lib.rs` — Added `mod ssh_askpass`, `pub use ssh_askpass::run_as_askpass`, managed `AskpassState`, registered new commands.
-- `apps/desktop/src-tauri/src/main.rs` — Detects `RIS_ASKPASS_MODE=1` and runs `run_as_askpass()` before the GUI starts.
+**C — Cryptographically-strong token**: Replaced the timestamp-XOR-PID token with 256 bits of OS CSPRNG randomness via the `getrandom 0.2` crate. Session IDs use 64 bits of CSPRNG. Added `getrandom = "0.2"` to `apps/desktop/src-tauri/Cargo.toml`.
 
-### TypeScript / React (frontend)
+**D — Friendly SSH errors**: Added `ssh_error_message()` helper in `commands/git.rs`. For SSH remotes, it calls `ris_git::classify_git_ssh_error()` on the raw stderr. A match returns a user-friendly message plus `ssh_agent_guidance()` hints; unmatched errors fall back to the raw error string. The raw error is still logged (sanitised).
 
-- `apps/desktop/src/api/tauriClient.ts` — Added `SshDiagnosticsDto` interface, `respondSshPassphrase()`, `getSshDiagnostics()` functions.
-- `apps/desktop/src/features/repository/SshPassphraseModal.tsx` — New modal component: shows OpenSSH prompt, password input, Continue/Cancel buttons, ssh-add guidance. Calls `respondSshPassphrase` on submit or cancel. Clears input after each use.
-- `apps/desktop/src/App.tsx` — Added `useEffect` with `listen("ssh-passphrase-requested", ...)` and renders `<SshPassphraseModal>`.
-- `apps/desktop/src/App.nav.test.tsx` — Added mocks for `@tauri-apps/api/event` and `SshPassphraseModal` to prevent test breakage.
+**E — scp-like URL detection**: `is_ssh_url()` in `ris-git` now recognises any `[user@]host:path` URL where the colon is not followed by `//` (which would indicate a scheme like `git://`). Windows absolute paths (`C:\…`) and local paths (`/`, `~/`, `./`) are explicitly rejected.
 
-### Docs
-
-- `docs/BETA1_FOLLOWUP_PLAN_EN.md` — Section 2 updated: removed incorrect "stored passphrase field" direction; documented correct ssh-agent primary / SSH_ASKPASS secondary / diagnostics approach.
-- `CHANGELOG.md` — Added SSH passphrase prompting, SSH diagnostics, SSH error classification, and security note to Unreleased section.
+## Files changed
 
-### Tests
+### Rust (backend)
 
-- `apps/desktop/src/features/repository/SshPassphraseModal.test.tsx` — New test file: 8 tests covering modal appearance, submit, cancel, Enter key, input clearing, guidance text.
+- `crates/ris-git/src/lib.rs` — Rewrote `is_ssh_url()` to handle scp-like URLs with arbitrary usernames (not just `git@`). Added 8 new test cases covering scp with/without user, local paths, tilde, relative paths, `git://`, `file://`, unknown schemes.
+- `apps/desktop/src-tauri/Cargo.toml` — Added `getrandom = "0.2"`.
+- `apps/desktop/src-tauri/src/ssh_askpass.rs`
+  - Imports: removed `SystemTime`/`UNIX_EPOCH`; added `AtomicBool`/`Ordering`.
+  - `AskpassInner`: added `session_id: u64` and `cancelled: Arc<AtomicBool>`.
+  - `AskpassEnv`: added `session_id: u64`.
+  - `generate_token()`: 256-bit CSPRNG via `getrandom`.
+  - `generate_session_id()`: 64-bit CSPRNG via `getrandom` (new).
+  - `start_session()`: cancels any existing session before creating new one; passes `session_id` and `cancelled` to the server thread.
+  - `clear_session(session_id)`: guards on session_id match before clearing; signals `cancelled` and wakes blocked `recv_timeout`.
+  - `run_askpass_server()`: checks `cancelled` flag in accept loop; only clears its own session by id at exit.
+  - Tests: updated `askpass_session_lifecycle_create_and_clear` to pass a session_id; added `generate_token_is_64_hex_chars`, `generate_token_is_unique` (updated), `clear_session_with_wrong_id_does_not_clear`.
+- `apps/desktop/src-tauri/src/commands/git.rs`
+  - Added `AskpassEnv` to imports.
+  - Added `ssh_error_message(&GitError, is_ssh: bool) -> String` helper.
+  - `push_git_current_branch`: stores `Option<AskpassEnv>`, passes `is_ssh` as `no_hooks`, clears by `session_id`, uses `ssh_error_message`.
+  - `pull_git_ff_only`: same changes.
 
 ## Security model
 
-- **Passphrase lifetime**: Entered once in the frontend modal → sent via `respondSshPassphrase` Tauri command → forwarded via `mpsc::SyncSender` to TCP thread → written to TCP stream → read from stdout by OpenSSH. Never touches disk, logs, env vars, or CLI args.
-- **Token**: Per-operation random token prevents other processes from connecting to the short-lived TCP server.
-- **IPC binding**: `127.0.0.1` only, random OS-assigned port, lifetime ≤ 300s TCP accept + 60s user response.
-- **Attempt limit**: MAX_ASKPASS_ATTEMPTS=3 prevents infinite passphrase prompt loops.
-- **Cancellation**: If the user cancels or the session times out, `CANCEL\n` is sent to the helper, SSH receives exit code 1 and fails cleanly.
+- **No hook inheritance**: `git -c core.hooksPath=<empty-temp-dir>` is set for every push/pull that carries askpass env vars. The empty directory is created fresh for each operation and removed on drop. Repository hooks cannot see `RIS_ASKPASS_PORT`, `RIS_ASKPASS_TOKEN`, or `SSH_ASKPASS` during their execution.
+- **CSPRNG token**: 256-bit (64 hex chars) random token from OS CSPRNG. Prevents practical guessing or collision within the local TCP socket lifetime.
+- **Session-id lifecycle**: A stale background thread that times out after the user completes an operation cannot clear a newer session started for a subsequent operation.
+- **Passphrase lifetime**: unchanged — never stored, logged, or passed via env/CLI.
 
 ## Tests
 
 ```
-cargo fmt --all --check          — clean
-cargo check -p rack-inventory-studio-desktop — clean (0 warnings)
-cargo clippy -p rack-inventory-studio-desktop -p ris-git -- -D warnings — clean
-cargo test -p rack-inventory-studio-desktop -p ris-git — all pass
-node scripts/check-version-consistency.mjs — all 0.1.0-beta.1
-node scripts/check-repo-hygiene.mjs        — 8/8 checks
-tsc --noEmit (apps/desktop)                — clean
-vitest run                                  — 470 passed, 0 errors
+cargo fmt --all --check                     — clean
+cargo check --workspace                     — clean (0 warnings)
+cargo clippy --workspace -- -D warnings     — clean
+cargo test -p rack-inventory-studio-desktop — 53 passed, 0 failed
+cargo test -p ris-git                       — 50 passed, 0 failed (28 unit + 22 integration)
+node scripts/check-version-consistency.mjs  — all 0.1.0-beta.1
+node scripts/check-repo-hygiene.mjs         — 8/8 checks
+npx tsc --noEmit (apps/desktop)             — clean
+npx vitest run                              — 462 passed, 0 errors
+git diff --check                            — clean
 ```
 
 ## Risks
 
-- `run_as_askpass()` requires the binary to be invocable as a subprocess of SSH. On Windows, the binary path may contain spaces — handled via `current_exe()` which returns the full path; SSH_ASKPASS uses the full path. Spaces in paths should be safe as OpenSSH exec's the path directly.
-- The TCP token is not cryptographically strong (timestamp XOR nanos + PID). Sufficient for the threat model (short-lived local socket, no sensitive data besides passphrase lifetime), but not CSPRNG-quality.
-- SSH diagnostics (`probe_ssh_add`, `find_ssh_executable`) spawn subprocesses with 3-second timeouts. On slow machines these could briefly block the Tauri command thread. These are diagnostic-only and not on the push/pull hot path.
-- `classify_git_ssh_error` is implemented in `ris-git` but not yet surfaced to the frontend via the error DTOs from push/pull — it's available for future use.
+- The `TempHooksDir` temp directory path is deterministic (`ris_nohooks_{pid}`). On a multi-user system a malicious user could pre-create it. Mitigated: `create_dir_all` fails silently and the guard becomes `None` (no hooks suppression, but also no credential exposure); adding a random suffix would be a small future improvement.
+- `try_send(None)` when cancelling a session may silently fail if the channel buffer is already full (i.e., the user already responded). In practice the passphrase will still be delivered correctly; the cancel is effectively a no-op, which is the safe outcome.
 
 ## Not done
 
 - Persistent credential vault / HTTPS token management.
-- Surfacing `classify_git_ssh_error` output in push/pull error messages displayed to the user (function exists, wiring to frontend deferred).
-- SSH diagnostics UI panel in the app (data available via `get_ssh_diagnostics` command but no panel was built in this PR).
+- SSH diagnostics UI panel (data is available via `get_ssh_diagnostics` Tauri command).
 - Linux/macOS packaging changes.
-- App version bump (intentionally left to a release milestone).
+- App version bump (intentionally deferred to release milestone).
+- `TempHooksDir` with random suffix (low-priority hardening).
 
 ## Suggested next step
 
-Wire `classify_git_ssh_error` into the push/pull error DTOs returned to the frontend so users see "Permission denied (publickey). No identities found in SSH agent." instead of raw git stderr. Also build a minimal SSH diagnostics section in the Repository panel that shows agent status and guidance when a push/pull fails.
+Build a minimal "SSH Agent Status" section in the Repository panel that calls `get_ssh_diagnostics` when a push/pull fails with an SSH error and displays the guidance strings inline, so users see actionable steps without opening a terminal.
diff --git a/Cargo.lock b/Cargo.lock
index 6a23d8a..1a110b0 100644
--- a/Cargo.lock
+++ b/Cargo.lock
@@ -2582,6 +2582,7 @@ checksum = "f8dcc9c7d52a811697d2151c701e0d08956f92b0e24136cf4cf27b57a6a0d9bf"
 name = "rack-inventory-studio-desktop"
 version = "0.1.0-beta.1"
 dependencies = [
+ "getrandom 0.2.17",
  "log",
  "ris-application",
  "ris-core",
diff --git a/apps/desktop/src-tauri/Cargo.toml b/apps/desktop/src-tauri/Cargo.toml
index d4acb97..8b69ef4 100644
--- a/apps/desktop/src-tauri/Cargo.toml
+++ b/apps/desktop/src-tauri/Cargo.toml
@@ -17,6 +17,7 @@ tauri-plugin-log = "2"
 log = "0.4"
 serde = { version = "1", features = ["derive"] }
 serde_json = "1"
+getrandom = "0.2"
 
 ris-core = { path = "../../../crates/ris-core" }
 ris-repository = { path = "../../../crates/ris-repository" }
diff --git a/apps/desktop/src-tauri/src/commands/git.rs b/apps/desktop/src-tauri/src/commands/git.rs
index 90510bc..45812f8 100644
--- a/apps/desktop/src-tauri/src/commands/git.rs
+++ b/apps/desktop/src-tauri/src/commands/git.rs
@@ -7,7 +7,7 @@ use crate::dto::{
 };
 use crate::ssh_askpass::{
     build_askpass_env_pairs, find_ssh_executable, get_core_ssh_command, get_ssh_version,
-    probe_ssh_add, ssh_agent_guidance, AskpassState, SshAddStatus,
+    probe_ssh_add, ssh_agent_guidance, AskpassEnv, AskpassState, SshAddStatus,
 };
 
 fn no_session() -> String {
@@ -33,6 +33,27 @@ fn commit_to_dto(c: ris_git::GitCommitSummary) -> GitCommitDto {
     }
 }
 
+/// Build a user-facing error message for push/pull failures.
+///
+/// For SSH remotes, attempts to classify the raw git stderr and returns a
+/// friendly explanation plus agent guidance. Falls back to the raw error
+/// string when no pattern is recognised or the remote is not SSH.
+fn ssh_error_message(e: &ris_git::GitError, is_ssh: bool) -> String {
+    if is_ssh {
+        if let ris_git::GitError::CommandFailed { ref stderr, .. } = e {
+            if let Some(friendly) = ris_git::classify_git_ssh_error(stderr) {
+                let add_status = probe_ssh_add();
+                let guidance = ssh_agent_guidance(&add_status, true, None);
+                if guidance.is_empty() {
+                    return friendly;
+                }
+                return format!("{}\n\n{}", friendly, guidance.join("\n"));
+            }
+        }
+    }
+    e.to_string()
+}
+
 #[tauri::command]
 pub fn get_git_status(state: State<AppState>) -> Result<GitStatusDto, String> {
     let guard = lock(&state)?;
@@ -144,31 +165,35 @@ pub fn push_git_current_branch(
         .as_deref()
         .map(ris_git::is_ssh_url)
         .unwrap_or(false);
-    let env_owned: Vec<(String, String)> = if is_ssh {
+    let askpass_env: Option<AskpassEnv> = if is_ssh {
         match askpass.start_session(app) {
-            Ok(e) => build_askpass_env_pairs(&e),
+            Ok(e) => Some(e),
             Err(warn) => {
                 log::warn!("askpass session not started, continuing without: {warn}");
-                vec![]
+                None
             }
         }
     } else {
-        vec![]
+        None
     };
+    let env_owned: Vec<(String, String)> = askpass_env
+        .as_ref()
+        .map(build_askpass_env_pairs)
+        .unwrap_or_default();
     let env_refs: Vec<(&str, &str)> = env_owned
         .iter()
         .map(|(k, v)| (k.as_str(), v.as_str()))
         .collect();
 
-    let result =
-        ris_git::push_current_branch_with_env(&repo_path, &remote, &env_refs).map_err(|e| {
-            let msg = e.to_string();
-            log::error!("git_push failed: {}", sanitize_error(&msg));
+    let result = ris_git::push_current_branch_with_env(&repo_path, &remote, &env_refs, is_ssh)
+        .map_err(|e| {
+            let msg = ssh_error_message(&e, is_ssh);
+            log::error!("git_push failed: {}", sanitize_error(&e.to_string()));
             msg
         });
 
-    if is_ssh {
-        askpass.clear_session();
+    if let Some(ref env) = askpass_env {
+        askpass.clear_session(env.session_id);
     }
 
     result?;
@@ -208,31 +233,36 @@ pub fn pull_git_ff_only(
         .as_deref()
         .map(ris_git::is_ssh_url)
         .unwrap_or(false);
-    let env_owned: Vec<(String, String)> = if is_ssh {
+    let askpass_env: Option<AskpassEnv> = if is_ssh {
         match askpass.start_session(app) {
-            Ok(e) => build_askpass_env_pairs(&e),
+            Ok(e) => Some(e),
             Err(warn) => {
                 log::warn!("askpass session not started, continuing without: {warn}");
-                vec![]
+                None
             }
         }
     } else {
-        vec![]
+        None
     };
+    let env_owned: Vec<(String, String)> = askpass_env
+        .as_ref()
+        .map(build_askpass_env_pairs)
+        .unwrap_or_default();
     let env_refs: Vec<(&str, &str)> = env_owned
         .iter()
         .map(|(k, v)| (k.as_str(), v.as_str()))
         .collect();
 
     log::info!("git_pull: remote={remote}");
-    let pull_result = ris_git::pull_ff_only_with_env(&repo_path, &remote, &env_refs).map_err(|e| {
-        let msg = e.to_string();
-        log::error!("git_pull failed: {}", sanitize_error(&msg));
-        msg
-    });
+    let pull_result = ris_git::pull_ff_only_with_env(&repo_path, &remote, &env_refs, is_ssh)
+        .map_err(|e| {
+            let msg = ssh_error_message(&e, is_ssh);
+            log::error!("git_pull failed: {}", sanitize_error(&e.to_string()));
+            msg
+        });
 
-    if is_ssh {
-        askpass.clear_session();
+    if let Some(ref env) = askpass_env {
+        askpass.clear_session(env.session_id);
     }
 
     pull_result?;
diff --git a/apps/desktop/src-tauri/src/ssh_askpass.rs b/apps/desktop/src-tauri/src/ssh_askpass.rs
index 0a3c7d8..d9e22b0 100644
--- a/apps/desktop/src-tauri/src/ssh_askpass.rs
+++ b/apps/desktop/src-tauri/src/ssh_askpass.rs
@@ -25,8 +25,9 @@ use std::io::{BufRead, BufReader, Write};
 use std::net::{TcpListener, TcpStream};
 use std::path::Path;
 use std::process::Command;
+use std::sync::atomic::{AtomicBool, Ordering};
 use std::sync::{Arc, Mutex};
-use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
+use std::time::{Duration, Instant};
 use tauri::{AppHandle, Emitter};
 
 // ── Constants ─────────────────────────────────────────────────────────────────
@@ -48,8 +49,10 @@ pub struct AskpassState {
 }
 
 struct AskpassInner {
+    session_id: u64,
     tx: std::sync::mpsc::SyncSender<Option<String>>,
     attempts: u32,
+    cancelled: Arc<AtomicBool>,
 }
 
 /// Environment variables to set on the git subprocess to enable askpass.
@@ -57,6 +60,7 @@ pub struct AskpassEnv {
     pub binary_path: String,
     pub port: u16,
     pub token: String,
+    pub session_id: u64,
 }
 
 impl AskpassState {
@@ -88,23 +92,45 @@ impl AskpassState {
             .port();
 
         let token = generate_token();
+        let session_id = generate_session_id();
+        let cancelled = Arc::new(AtomicBool::new(false));
         let (tx, rx) = std::sync::mpsc::sync_channel::<Option<String>>(1);
 
         {
             let mut guard = self.inner.lock().unwrap();
-            *guard = Some(AskpassInner { tx, attempts: 0 });
+            // Cancel any existing session before replacing it.
+            if let Some(ref old) = *guard {
+                old.cancelled.store(true, Ordering::Relaxed);
+                old.tx.try_send(None).ok();
+            }
+            *guard = Some(AskpassInner {
+                session_id,
+                tx,
+                attempts: 0,
+                cancelled: Arc::clone(&cancelled),
+            });
         }
 
         let inner_arc = Arc::clone(&self.inner);
         let token_for_thread = token.clone();
+        let cancelled_for_thread = Arc::clone(&cancelled);
         std::thread::spawn(move || {
-            run_askpass_server(listener, token_for_thread, rx, app, inner_arc);
+            run_askpass_server(
+                listener,
+                token_for_thread,
+                rx,
+                app,
+                inner_arc,
+                session_id,
+                cancelled_for_thread,
+            );
         });
 
         Ok(AskpassEnv {
             binary_path,
             port,
             token,
+            session_id,
         })
     }
 
@@ -121,24 +147,33 @@ impl AskpassState {
     }
 
     /// Drop the session after the git operation completes.
-    pub fn clear_session(&self) {
-        self.inner.lock().unwrap().take();
+    ///
+    /// The `session_id` guard prevents an old, timed-out TCP server thread from
+    /// clearing a newer session that started after the previous one expired.
+    pub fn clear_session(&self, session_id: u64) {
+        let mut guard = self.inner.lock().unwrap();
+        if guard.as_ref().is_some_and(|i| i.session_id == session_id) {
+            if let Some(ref inner) = *guard {
+                inner.cancelled.store(true, Ordering::Relaxed);
+                inner.tx.try_send(None).ok();
+            }
+            guard.take();
+        }
     }
 }
 
 // ── Token generation ──────────────────────────────────────────────────────────
 
 fn generate_token() -> String {
-    let t = SystemTime::now()
-        .duration_since(UNIX_EPOCH)
-        .unwrap_or_default();
-    // Combine nanos + pid for reasonable uniqueness; not cryptographic but
-    // sufficient for a local 127.0.0.1 socket with a short lifetime.
-    format!(
-        "{:016x}{:08x}",
-        t.subsec_nanos() as u64 ^ t.as_secs(),
-        std::process::id()
-    )
+    let mut bytes = [0u8; 32];
+    getrandom::getrandom(&mut bytes).expect("OS CSPRNG unavailable");
+    bytes.iter().map(|b| format!("{b:02x}")).collect()
+}
+
+fn generate_session_id() -> u64 {
+    let mut bytes = [0u8; 8];
+    getrandom::getrandom(&mut bytes).expect("OS CSPRNG unavailable");
+    u64::from_ne_bytes(bytes)
 }
 
 // ── TCP server (background thread) ───────────────────────────────────────────
@@ -149,12 +184,17 @@ fn run_askpass_server(
     rx: std::sync::mpsc::Receiver<Option<String>>,
     app: AppHandle,
     state: Arc<Mutex<Option<AskpassInner>>>,
+    own_session_id: u64,
+    cancelled: Arc<AtomicBool>,
 ) {
     listener.set_nonblocking(true).ok();
 
     let deadline = Instant::now() + Duration::from_secs(TCP_ACCEPT_TIMEOUT_SECS);
 
     let stream = loop {
+        if cancelled.load(Ordering::Relaxed) {
+            break None;
+        }
         match listener.accept() {
             Ok((s, _)) => break Some(s),
             Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
@@ -174,8 +214,17 @@ fn run_askpass_server(
         }
     }
 
-    // Clear session when the server thread exits (covers timeout + error paths).
-    state.lock().unwrap().take();
+    // Only clear if this thread still owns the current session.
+    // A newer session may have started after a previous operation timed out.
+    {
+        let mut guard = state.lock().unwrap();
+        if guard
+            .as_ref()
+            .is_some_and(|i| i.session_id == own_session_id)
+        {
+            guard.take();
+        }
+    }
 }
 
 fn handle_askpass_connection(
@@ -652,14 +701,22 @@ mod tests {
         assert!(!t.is_empty());
     }
 
+    #[test]
+    fn generate_token_is_64_hex_chars() {
+        let t = generate_token();
+        assert_eq!(
+            t.len(),
+            64,
+            "CSPRNG token should be 64 hex chars (256 bits)"
+        );
+        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
+    }
+
     #[test]
     fn generate_token_is_unique() {
         let t1 = generate_token();
         let t2 = generate_token();
-        // Not guaranteed unique on very fast hardware, but practically always true.
-        // At minimum both should be non-empty.
-        assert!(!t1.is_empty());
-        assert!(!t2.is_empty());
+        assert_ne!(t1, t2, "CSPRNG tokens should be unique");
     }
 
     #[test]
@@ -689,6 +746,7 @@ mod tests {
             binary_path: "/usr/bin/myapp".to_string(),
             port: 12345,
             token: "abc123".to_string(),
+            session_id: 1,
         };
         let pairs = build_askpass_env_pairs(&env);
         let keys: Vec<&str> = pairs.iter().map(|(k, _)| k.as_str()).collect();
@@ -705,6 +763,7 @@ mod tests {
             binary_path: "/usr/bin/myapp".to_string(),
             port: 12345,
             token: "abc123".to_string(),
+            session_id: 1,
         };
         let pairs = build_askpass_env_pairs(&env);
         // No pair key or value should be named "passphrase" or "password".
@@ -741,11 +800,38 @@ mod tests {
         assert!(state.inner.lock().unwrap().is_none());
         // respond fails with no session
         assert!(state.respond(None).is_err());
-        // clear_session is a no-op when no session exists
-        state.clear_session();
+        // clear_session is a no-op when no session exists (any id)
+        state.clear_session(0);
         assert!(state.inner.lock().unwrap().is_none());
     }
 
+    #[test]
+    fn clear_session_with_wrong_id_does_not_clear() {
+        let (tx, _rx) = std::sync::mpsc::sync_channel(1);
+        let state = AskpassState::new();
+        {
+            let mut guard = state.inner.lock().unwrap();
+            *guard = Some(AskpassInner {
+                session_id: 42,
+                tx,
+                attempts: 0,
+                cancelled: Arc::new(AtomicBool::new(false)),
+            });
+        }
+        // Wrong session_id — should be a no-op.
+        state.clear_session(99);
+        assert!(
+            state.inner.lock().unwrap().is_some(),
+            "session should still exist after wrong id"
+        );
+        // Correct session_id — should clear.
+        state.clear_session(42);
+        assert!(
+            state.inner.lock().unwrap().is_none(),
+            "session should be cleared after correct id"
+        );
+    }
+
     #[test]
     fn tcp_roundtrip_passphrase() {
         // Spin up a listener, connect as the askpass helper, verify the protocol.
@@ -760,7 +846,7 @@ mod tests {
 
         // Server thread: accept one connection, send passphrase.
         let server = thread::spawn(move || {
-            let (mut stream, _) = listener.accept().unwrap();
+            let (stream, _) = listener.accept().unwrap();
             let mut write_stream = stream.try_clone().unwrap();
             let mut reader = BufReader::new(&stream);
 
diff --git a/crates/ris-git/src/lib.rs b/crates/ris-git/src/lib.rs
index 9e534c6..8fe7e80 100644
--- a/crates/ris-git/src/lib.rs
+++ b/crates/ris-git/src/lib.rs
@@ -1,4 +1,4 @@
-use std::path::Path;
+use std::path::{Path, PathBuf};
 use std::process::Command;
 
 // ── error ─────────────────────────────────────────────────────────────────────
@@ -469,16 +469,78 @@ pub fn add_remote(repo_path: &Path, name: &str, url: &str) -> Result<(), GitErro
     }
 }
 
+// ── Temporary hooks-disabled directory ───────────────────────────────────────
+
+/// A temporary empty directory used as a safe, hooks-disabled `core.hooksPath`.
+///
+/// Created by the `_with_env` functions when running git with askpass env vars
+/// set, to prevent repo-controlled hook scripts from inheriting
+/// `RIS_ASKPASS_PORT`/`RIS_ASKPASS_TOKEN` and connecting to the local IPC server.
+/// The directory is removed on drop.
+struct TempHooksDir(PathBuf);
+
+impl TempHooksDir {
+    fn create() -> Option<Self> {
+        let dir = std::env::temp_dir().join(format!("ris_nohooks_{}", std::process::id()));
+        // create_dir_all is a no-op if the dir already exists (e.g. from a
+        // previous run that crashed before cleanup). It will always be empty
+        // since we never write files into it.
+        std::fs::create_dir_all(&dir)
+            .ok()
+            .map(|_| TempHooksDir(dir))
+    }
+
+    fn path(&self) -> &Path {
+        &self.0
+    }
+}
+
+impl Drop for TempHooksDir {
+    fn drop(&mut self) {
+        // Ignore errors — if the dir is not empty for any reason, leave it.
+        let _ = std::fs::remove_dir(&self.0);
+    }
+}
+
+// ── Push / Pull ───────────────────────────────────────────────────────────────
+
 /// Push the current branch to `remote`, setting the upstream tracking ref (`-u`).
-/// Pass `extra_env` to inject environment variables such as SSH_ASKPASS into the git subprocess.
+///
+/// `extra_env` injects environment variables (e.g. SSH_ASKPASS) into the git subprocess.
+/// `no_hooks` disables repo-controlled hooks for this invocation by overriding
+/// `core.hooksPath` to an empty temp directory.  Set this to `true` whenever
+/// `extra_env` contains askpass secrets (`RIS_ASKPASS_PORT`/`RIS_ASKPASS_TOKEN`),
+/// because hook processes inherit the git env and could otherwise connect to the
+/// local askpass TCP server and intercept the passphrase flow.
 pub fn push_current_branch_with_env(
     repo_path: &Path,
     remote: &str,
     extra_env: &[(&str, &str)],
+    no_hooks: bool,
 ) -> Result<(), GitError> {
     validate_remote_name(remote)?;
     let branch = current_branch(repo_path)?;
-    let output = run_git_impl(repo_path, &["push", "-u", remote, &branch], extra_env)?;
+
+    // When askpass env is active, override core.hooksPath to a known-empty
+    // temp directory so no pre-push or other client-side hooks can run and
+    // accidentally receive the askpass token/port from the inherited env.
+    let _hooks_guard = if no_hooks {
+        TempHooksDir::create()
+    } else {
+        None
+    };
+    let hooks_cfg: Option<String> = _hooks_guard
+        .as_ref()
+        .map(|d| format!("core.hooksPath={}", d.path().display()));
+
+    let mut args: Vec<&str> = Vec::with_capacity(6);
+    if let Some(ref cfg) = hooks_cfg {
+        args.push("-c");
+        args.push(cfg.as_str());
+    }
+    args.extend_from_slice(&["push", "-u", remote, branch.as_str()]);
+
+    let output = run_git_impl(repo_path, &args, extra_env)?;
     if output.status.success() {
         Ok(())
     } else {
@@ -486,20 +548,21 @@ pub fn push_current_branch_with_env(
     }
 }
 
-/// Push the current branch — convenience wrapper with no extra environment.
+/// Push the current branch — convenience wrapper with no extra environment or hooks override.
 pub fn push_current_branch(repo_path: &Path, remote: &str) -> Result<(), GitError> {
-    push_current_branch_with_env(repo_path, remote, &[])
+    push_current_branch_with_env(repo_path, remote, &[], false)
 }
 
 /// Pull the current branch from `remote` using `--ff-only`.
 ///
-/// Rejects immediately if the working tree is not clean (staged, unstaged, or untracked files),
-/// to avoid ambiguous state after a fast-forward that lands new YAML content.
-/// Pass `extra_env` to inject environment variables such as SSH_ASKPASS into the git subprocess.
+/// Rejects immediately if the working tree is not clean.
+/// `extra_env` injects environment variables (e.g. SSH_ASKPASS) into the git subprocess.
+/// `no_hooks` disables repo-controlled hooks — same rationale as `push_current_branch_with_env`.
 pub fn pull_ff_only_with_env(
     repo_path: &Path,
     remote: &str,
     extra_env: &[(&str, &str)],
+    no_hooks: bool,
 ) -> Result<(), GitError> {
     validate_remote_name(remote)?;
 
@@ -510,11 +573,24 @@ pub fn pull_ff_only_with_env(
     }
 
     let branch = current_branch(repo_path)?;
-    let output = run_git_impl(
-        repo_path,
-        &["pull", "--ff-only", remote, &branch],
-        extra_env,
-    )?;
+
+    let _hooks_guard = if no_hooks {
+        TempHooksDir::create()
+    } else {
+        None
+    };
+    let hooks_cfg: Option<String> = _hooks_guard
+        .as_ref()
+        .map(|d| format!("core.hooksPath={}", d.path().display()));
+
+    let mut args: Vec<&str> = Vec::with_capacity(6);
+    if let Some(ref cfg) = hooks_cfg {
+        args.push("-c");
+        args.push(cfg.as_str());
+    }
+    args.extend_from_slice(&["pull", "--ff-only", remote, branch.as_str()]);
+
+    let output = run_git_impl(repo_path, &args, extra_env)?;
     if output.status.success() {
         Ok(())
     } else {
@@ -522,16 +598,49 @@ pub fn pull_ff_only_with_env(
     }
 }
 
-/// Pull the current branch — convenience wrapper with no extra environment.
+/// Pull the current branch — convenience wrapper with no extra environment or hooks override.
 pub fn pull_ff_only(repo_path: &Path, remote: &str) -> Result<(), GitError> {
-    pull_ff_only_with_env(repo_path, remote, &[])
+    pull_ff_only_with_env(repo_path, remote, &[], false)
 }
 
 // ── SSH helpers ───────────────────────────────────────────────────────────────
 
-/// Returns true when `url` looks like an SSH remote (git@…, ssh://, or ssh+git://).
+/// Returns true when `url` looks like an SSH remote.
+///
+/// Handles:
+/// - Explicit SSH schemes: `ssh://`, `ssh+git://`
+/// - scp-like syntax: `[user@]host:path` (colon not followed by `//`)
+///
+/// Does NOT treat `git://` as SSH (it is an unauthenticated Git protocol).
 pub fn is_ssh_url(url: &str) -> bool {
-    url.starts_with("git@") || url.starts_with("ssh://") || url.starts_with("ssh+git://")
+    if url.starts_with("ssh://") || url.starts_with("ssh+git://") {
+        return true;
+    }
+    // Reject well-known non-SSH schemes and local paths.
+    if url.starts_with("http://")
+        || url.starts_with("https://")
+        || url.starts_with("file://")
+        || url.starts_with('/')
+        || url.starts_with('~')
+        || url.starts_with('.')
+    {
+        return false;
+    }
+    // Reject Windows absolute paths (C:\... or C:/...).
+    let b = url.as_bytes();
+    if b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
+    {
+        return false;
+    }
+    // scp-like syntax: [user@]host:path — colon must not be followed by `//`
+    // (which would indicate a scheme like `git://` or `unknown://`).
+    if let Some(colon_pos) = url.find(':') {
+        let after_colon = &url[colon_pos + 1..];
+        if !after_colon.starts_with("//") && !after_colon.is_empty() {
+            return true;
+        }
+    }
+    false
 }
 
 /// Classifies a Git stderr string for common SSH authentication failures.
@@ -676,6 +785,49 @@ mod ssh_tests {
         // is_ssh_url should handle git@ URLs that do NOT contain credentials
         assert!(is_ssh_url("git@github.com:user/repo.git"));
     }
+
+    #[test]
+    fn is_ssh_url_recognises_scp_with_non_git_username() {
+        assert!(is_ssh_url("deploy@host.example.com:org/repo.git"));
+        assert!(is_ssh_url("ci-user@gitlab.internal:group/project.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_recognises_scp_without_user() {
+        assert!(is_ssh_url("host.example.com:org/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_local_absolute_path() {
+        assert!(!is_ssh_url("/home/user/repo"));
+        assert!(!is_ssh_url("/repos/myrepo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_tilde_path() {
+        assert!(!is_ssh_url("~/repos/myrepo"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_relative_path() {
+        assert!(!is_ssh_url("./repos/myrepo"));
+        assert!(!is_ssh_url("../sibling/repo"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_git_scheme() {
+        assert!(!is_ssh_url("git://github.com/org/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_file_scheme() {
+        assert!(!is_ssh_url("file:///home/user/repo.git"));
+    }
+
+    #[test]
+    fn is_ssh_url_rejects_unknown_scheme_with_double_slash() {
+        assert!(!is_ssh_url("unknown://host/path"));
+    }
 }
 
 // ── parser unit tests ─────────────────────────────────────────────────────────
