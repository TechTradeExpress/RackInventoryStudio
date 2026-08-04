## Summary

RP on `release/v0.1.0-beta.3` (PR #168 → `master`): the Windows WDIO Gate's
SSH fixture was failing because `configureSsh()` wrote the client identity
path into an env file unquoted, and `ssh-wrapper.sh` loads that file via
bash `source` — i.e. as shell syntax, not plain key/value. Backslashes in a
Windows path (`C:\Users\...\id_ed25519`) were consumed as bash escape
characters during that `source`, corrupting the path before `ssh` ever saw
it, which broke pubkey auth on Windows.

Added a single shell-value serializer, `shQuote()`, and routed every value
written into `ssh-remote-command.env` through it. `ssh-wrapper.sh` needed no
changes — it already double-quotes its variable expansions at the point of
use; the corruption happened earlier, during `source`.

Reproduced the original bug on the pre-fix baseline (`git stash` + rerun of
the real push/pull round-trip test): `Identity file
C:Userssu-17...id_ed25519 not accessible` → `Permission denied (publickey)`,
confirming both the root cause and that the fix addresses it.

## Files changed

- `apps/desktop/e2e-wdio/support/git-remote.ts` — added `shQuote()` (POSIX
  single-quote serializer with the standard `'\''`-escape idiom for embedded
  single quotes); `configureSsh()` now writes both `RIS_SSH_REMOTE_PORT` and
  `RIS_SSH_REMOTE_IDENTITY` through it instead of raw interpolation.
- `apps/desktop/e2e-wdio/support/git-remote.test.ts` — added pure `shQuote`
  unit tests (Windows paths, spaces, `$`, backticks, double/single quotes,
  trailing backslash) and real round-trip tests that write an env file,
  `source` it in an actual `bash` subprocess, and compare the echoed value
  byte-for-byte (gated on `bash` being on PATH, not on `sshd`, so they run
  everywhere `ssh-wrapper.sh` itself can). Updated the existing
  `configureSsh` env-file-contents test to expect the now-quoted format.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1002 tests, 1 known
  failure (see Risks/Not done below); all `shQuote` unit + round-trip tests
  and the updated `configureSsh` test pass.
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm check:version` — clean.
- `pnpm check:hygiene` — 8/8 passed.
- `pnpm test:scripts` — 237/237 passed.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` — clean.
- `cargo clippy --workspace -- -D warnings` — clean.
- `cargo test --workspace` — all passed, 0 failures (no Rust files
  touched).

## Risks

- **A second, unrelated defect was discovered downstream of this fix and is
  NOT fixed by this commit.** Before this fix, the SSH round-trip test
  failed at the identity/auth stage (masking anything past it). With
  identity corruption fixed, authentication now succeeds, but the real
  push/pull test then fails one step later:
  `fatal: ''<path>'' does not appear to be a git repository`. Root cause:
  Windows OpenSSH Server has no `DefaultShell` registry override on this
  machine (confirmed via `reg query HKLM\SOFTWARE\OpenSSH`), and the
  fixture's generated `sshd_config` sets no shell directive, so sshd falls
  back to `cmd.exe` as the remote command interpreter. `git push`/`pull`
  send a POSIX-quoted remote command (`git-receive-pack '<path>'`);
  `cmd.exe` doesn't strip single quotes, so they reach `git-receive-pack`'s
  argv literally, corrupting the path. Per this RP's own failure policy,
  this was diagnosed but intentionally not repaired here — out of scope for
  an SSH-identity-serialization fix. See "Not done" below.
- No other exported env-file value existed to audit beyond `PORT` and
  `IDENTITY` — both now covered.

## Not done

- **The Windows-remote-shell defect above.** Investigated (not implemented):
  `DefaultShell` is a machine-wide `HKLM`-only setting requiring admin
  rights — wrong layer for this ephemeral, unprivileged, per-test-run
  fixture. A more promising, scoped candidate: this fixture spawns its
  *own* `sshd` process from its *own* generated config
  (`buildSshdConfig()`/`startRemote()`), never the system service, so a
  `ForceCommand "<git-bash path>" -c "%SSH_ORIGINAL_COMMAND%"` directive
  added only to that generated config would affect only this ephemeral
  instance — no registry writes, no admin rights, no cross-test/machine
  impact. Unverified before implementing: (1) whether Win32-OpenSSH parses
  the `ForceCommand` string itself via `cmd.exe` (→ `%VAR%` syntax) or
  bypasses shell resolution — official docs don't state this, needs an
  empirical test against the real fixture; (2) a reliable Git Bash
  discovery helper (candidate list, mirroring the existing
  `buildWindowsSshdCandidates` pattern); (3) confirming a `win32`-only
  conditional addition doesn't affect the already-working POSIX path. This
  should be its own RP/ticket, not folded into this one.
- Did not push this commit or restart the Windows WDIO Gate — restarting it
  now would fail the same three SSH specs (`git-remote-workflows`,
  `git-clone-workflows`, `git-diverged-pull`) for the reason above, making a
  gate run non-diagnostic. Awaiting an explicit decision on push.

## Suggested next step

File the Windows-remote-shell (`cmd.exe`-vs-`ForceCommand`/Git-Bash)
defect as its own issue/RP, scoped to `apps/desktop/e2e-wdio/support/
git-remote.ts`'s `buildSshdConfig()`/`startRemote()`. Once that's resolved
(or explicitly deferred), restart the Windows WDIO Gate from Section 1 —
running it now against only this fix would still fail on the downstream
shell-quoting issue.
