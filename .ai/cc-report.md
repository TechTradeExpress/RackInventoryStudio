## Summary

Stage 3F.5.8A-R1: repair substage addressing review findings against Stage
3F.5.8A's Linux-native Docker backend, all fixable without a normal
(non-sandboxed) Linux host. Fixed a real defect (Node's structured `ENOENT`
error code was silently dropped by the exec wrapper, causing a genuinely
missing `docker` executable to misclassify as "unknown Docker error"),
brought stdin-based Docker execution into the same structured
`DockerCommandError` contract as the rest of the module, corrected doc
comments that implied real-host WDIO acceptance had been proven when it had
not, and resolved the `pnpm` version-mismatch investigation via Corepack
(no lockfile/dependency changes). All static and unit validation is green.

The parent stage remains **STAGE 3F.5.8A BLOCKED** — this repair hardens
the implementation and its own documentation but does not and cannot
complete Stage O's real-host WDIO acceptance from this sandbox; that stays
explicitly deferred.

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts`:
  - `execFileP` now preserves Node's structured `code` (errno string or
    numeric exit code) on the rejected error, not just on the original
    error stashed in `cause`. Exported (narrowly) so tests can exercise the
    real wrapping chain.
  - `wrapDockerError` propagates `code` onto the resulting
    `DockerCommandError`; `DockerCommandError` gained an optional `code`
    field.
  - `execDockerWithStdinViaWsl`/`execDockerWithStdinNative` rewritten as
    thin wrappers over a new shared `spawnWithStdin` helper (exported
    narrowly, same rationale as `execFileP`): preserves `code` on spawn
    failure, preserves exit code/stderr on non-zero exit, always produces
    a real `DockerCommandError`, bounds accumulated stderr to 64KB with an
    explicit truncation marker, never a shell, never `sudo`.
  - `resolveGitRemoteProvider`'s doc comment and the module's top-of-file
    doc comment reworded: no longer imply the explicit-container path was
    "proven on a real Linux host" — state precisely that a Linux-native
    backend implementation exists and was exercised manually against a
    real Docker daemon, while full WDIO acceptance remains unvalidated.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts`:
  - New `execFileP real execution-chain` test: a genuinely nonexistent
    executable name, a real Node `ENOENT`, through the real production
    wrapper — proves `code`/`cause` preservation and correct
    classification, rather than only asserting against a hand-constructed
    error shape (the pre-existing `classifyLinuxExecError` tests, kept,
    were insufficient alone).
  - New `spawnWithStdin` describe block (6 tests, no Docker required, uses
    `node -e ...` as a deterministic local executable): missing-executable
    ENOENT preservation, non-zero-exit diagnostics, successful stdin
    delivery, a stdin-mismatch proof that data actually reaches the child,
    bounded stderr, no-shell argument-literalness. This caught a real
    off-by-boundary bug in the first version of the stderr-truncation
    logic (fixed before merge — see Risks).
- `docs/E2E_WDIO_PLAN.md` — added the "Stage 3F.5.8A-R1" subsection
  documenting the repair and the deferred real-host acceptance checklist.

## Tests

- `pnpm vitest run e2e-wdio/support/container-git-remote.test.ts` —
  266/266 passed (259 pre-existing + 7 new: 1 real-chain ENOENT test + 6
  `spawnWithStdin` tests).
- `pnpm --filter @rack-inventory-studio/desktop test` — 1301/1301 passed
  (full desktop suite, includes the above).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.

## Static validation

All re-run through the repository-declared `pnpm@10.33.4` (see Risks for
why this mattered):

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm install --frozen-lockfile` | clean — lockfile already up to date, no reinstall (see Risks) |
| `pnpm check:version` | ✓ versions and toolchain declarations match |
| `pnpm check:hygiene` | ✓ 8/8 |
| `pnpm test:scripts` | ✓ 237/237 |
| `pnpm --filter @rack-inventory-studio/desktop typecheck` | clean |
| `pnpm --filter @rack-inventory-studio/desktop test` | ✓ 1301/1301 |
| `cargo fmt --all -- --check` | clean |
| `cargo clippy --workspace -- -D warnings` | clean |
| `cargo test --workspace` | ✓ all passed (no Rust code touched this stage) |
| `pnpm build:e2e:wdio-plugin` | succeeded |

## Risks

- **`pnpm` version mismatch in this sandbox, now resolved for validation
  purposes.** `package.json` declares `pnpm@10.33.4`; the `pnpm` on `PATH`
  is 9.15.9, from a different Node installation than the one `npm`'s own
  global prefix points at (`/usr/local/bin/node` vs. `npm config get
  prefix` → `/opt/nvm/versions/node/v24.18.0`). Under 9.15.9, `pnpm
  install --frozen-lockfile` prompted to destructively wipe and reinstall
  `node_modules`. Resolved narrowly via Corepack, invoked by explicit path
  since it isn't on `PATH` either: `corepack enable` itself fails
  ("Internal Error: not found: corepack" — it cannot self-shim without
  being on `PATH`), but `corepack prepare pnpm@10.33.4 --activate` +
  `corepack pnpm ...` correctly resolves and runs the declared version. Do
  not conflate this with a real dependency problem — running the correct
  version confirmed the lockfile was already up to date the whole time.
  This is a sandbox `PATH` inconsistency, not a repository issue; no
  lockfile or dependency file was changed.
- **A real bug was found and fixed by the new tests, not before them.**
  The first version of the stderr-truncation logic in `spawnWithStdin`
  could silently stop appending the truncation marker if a chunk boundary
  landed exactly on the 64KB limit. The new bounded-stderr test caught
  this immediately; fixed by checking for the marker itself rather than
  only comparing lengths.
- **Stage O real-host WDIO acceptance remains unvalidated from this
  sandbox** — unchanged from Stage 3F.5.8A, and explicitly not attempted
  again in this repair (out of scope per this substage's own NSP). See the
  "Deferred real-host acceptance checklist" in
  `docs/E2E_WDIO_PLAN.md`.

## Not done

- Real-host Stage O/P validation (explicitly deferred, not this
  substage's scope).
- `corepack enable`'s shim step could not be made to work in this sandbox
  (self-referential `PATH` requirement); documented as a known gap rather
  than forced through with a global `PATH` modification, which was
  explicitly out of scope.

## Suggested next step

Same as the parent stage: run the deferred real-host acceptance checklist
(`docs/E2E_WDIO_PLAN.md`, Stage 3F.5.8A-R1 section) on a normal Linux host
with working Docker port publication and a working `tauri-driver` session
handshake, before Stage 3F.5.8A can become COMPLETE or Stage 3F.5.8B can
begin.
