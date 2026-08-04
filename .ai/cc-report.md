## Summary

Stage 3F.5.4 NSP: proof of concept for a containerized Git-over-SSH E2E
fixture, replacing the Windows-native `sshd`/`cmd.exe`/`ForceCommand`/Git-Bash
chain (Stage 3F.5.1–3F.5.3, source of intermittent `git-clone-workflows`
hangs) with a disposable Linux container (OpenSSH + git) managed through
Docker Engine inside WSL2 — no Docker Desktop, no elevated privileges.
Windows stays fully native throughout: only the SSH *server* moves off
Windows; `RackInventoryStudio.exe`, `git.exe`, `ssh.exe`, askpass, and every
WDIO interaction are unchanged.

Built the fixture image/entrypoint/sshd_config, a WSL2/Docker Windows-side
runtime helper (`container-git-remote.ts`), wired it into
`git-remote-workflows.e2e.ts` behind an opt-in env var
(`RIS_E2E_GIT_REMOTE_PROVIDER=container`, default `native` — unchanged
behavior), added 67 unit tests, and validated end-to-end on this Windows
host: 5/5 consecutive real WDIO runs passed. Full writeup, including two
real defects found and fixed during validation and the critical WSL2
VM-idle-shutdown finding (and its workaround), is in
`docs/E2E_WDIO_PLAN.md`'s new "Stage 3F.5.4" section.

**Verdict: STAGE 3F.5.4 COMPLETE — PROCEED TO MIGRATION** (not migrated in
this stage, per its own explicit scope limit — see "Not done").

## Files changed

- `apps/desktop/e2e-wdio/fixtures/git-ssh-server/Dockerfile` (new) — pinned
  `alpine:3.20.3`, OpenSSH + git, dedicated `git` user with `git-shell` as
  its login shell (restricts SSH-authenticated command execution to
  git-upload-pack/git-receive-pack/git-upload-archive only), no elevated
  capabilities.
- `apps/desktop/e2e-wdio/fixtures/git-ssh-server/entrypoint.sh` (new) —
  generates fresh host keys per container start (no persistent volume);
  `git config --system --add safe.directory '*'` (fixes root/`docker exec`
  vs. `git`-owned-repo ownership check — see Risks).
- `apps/desktop/e2e-wdio/fixtures/git-ssh-server/sshd_config` (new) —
  pubkey-only, no PAM directive (Alpine's OpenSSH has none compiled in;
  including it destabilized `sshd` under the healthcheck's connection
  frequency — see docs), random 127.0.0.1-only port at the Docker level.
- `apps/desktop/e2e-wdio/support/container-git-remote.ts` (new) — WSL2
  distribution discovery/selection, image build/reuse, container
  lifecycle, ephemeral key generation/installation, `docker exec`-based
  repository administration, the WSL2-VM-idle-shutdown keep-alive
  workaround, diagnostics collection, idempotent verified cleanup.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` (new) — 67
  unit tests, all pure/dependency-injected, no real WSL/Docker required.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` (modified) —
  added a `RemoteFixture` abstraction unifying native/container providers;
  `before()` selects one via `resolveGitRemoteProvider()`
  (`RIS_E2E_GIT_REMOTE_PROVIDER`, default `native`); all three scenario
  bodies now call `fixture.*` instead of native-fixture functions directly.
  No behavioral change when the env var is unset.
- `docs/E2E_WDIO_PLAN.md` (modified) — new "Stage 3F.5.4" section (full
  writeup per this NSP's required report sections); updated the Stage 3F
  status-table row to reflect Repair 1 landing and this stage's addition.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1085 tests, 59
  files, all passed (includes the 67 new container-git-remote tests).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm check:version` — clean.
- `pnpm check:hygiene` — 8/8 passed.
- `pnpm test:scripts` — 237/237 passed.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` — clean.
- `cargo clippy --workspace -- -D warnings` — clean (no Rust files touched).
- `cargo test --workspace` — all passed (no Rust files touched).
- **Real Windows+WSL2+Docker validation** (not part of the command suite
  above, run manually on this host): standalone push/clone reproduction
  outside WDIO; `git-remote-workflows` via
  `RIS_E2E_GIT_REMOTE_PROVIDER=container` × 5 consecutive runs through the
  canonical runner (`scripts/run-wdio-e2e.mjs --repeat 5
  --continue-on-failure`) — **5/5 "1 passed, 1 total"** (~30s each); default
  `native` provider re-run once and confirmed unaffected (1 passed, 14s);
  verified no leftover containers, keep-alive processes, or run-root temp
  directories after the 5-run matrix.

## Risks

- **WSL2 VM idle-shutdown** is a real host characteristic this fixture
  works around (a held-open `wsl.exe ... sleep 86400` session) but cannot
  eliminate. Validated on this host down to a ~10-30s idle window; a host
  with an even shorter timeout, or an in-test step that outlasts the
  keep-alive handling, is a theoretical residual risk beyond what the 5-run
  matrix empirically bounds.
- `ensureImageBuilt`'s Docker-build-context path assumes WSL2's default
  `/mnt/c` automount convention; the error path if that's disabled/remapped
  is clear but untested against a real such host.
- Two real defects were found and fixed only through actual Windows+WSL2
  execution, not through unit tests or code review (Alpine's `UsePAM`
  behavior destabilizing `sshd`, and `adduser -S`'s locked-account default
  blocking all pubkey auth) — the fixture's current correctness rests on
  this stage's own empirical validation, not on the Dockerfile "looking
  right".

## Not done

- **Only `git-remote-workflows` is wired to the container provider**, per
  this stage's explicit scope limit. `git-clone-workflows` and
  `git-diverged-pull` are untouched — migrating them needs additional
  repository-seeding helpers (`seedBareRemoteFromLocalRepository`
  equivalent) not yet built for the container provider.
- **The native fixture's Windows-only components are not removed or
  refactored** (also per this stage's explicit instruction) —
  `findSshdWindows`, Win32 ACL handling (`securePrivateKeyFile`'s `icacls`
  branch), Git Bash discovery, the native `ForceCommand`, and the
  Win32-conditional `sshd_config` branches all remain in
  `support/git-remote.ts`, listed as migration-obsolete candidates in the
  new doc section but not touched.
- Did not restart the full Windows WDIO Gate, merge to `development`, or
  tag/publish a release — all explicitly out of scope for this stage.

## Suggested next step

Migrate `git-clone-workflows` and `git-diverged-pull` to the container
provider (per the "PROCEED TO MIGRATION" verdict), which will require
building the equivalent of `seedBareRemoteFromLocalRepository` for
`container-git-remote.ts`; once all three specs are on the container
provider and stable, retire the native fixture's Windows-only branches
listed above as a follow-up cleanup stage.
