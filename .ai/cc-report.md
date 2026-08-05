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

**Stage 3F.5.8A-R2 update:** closed remaining process-execution correctness
gaps in R1's own new code — `spawnWithStdin` now settles from the child's
`"close"` event (not `"exit"`, which can fire before stdio is fully
flushed/closed), with single-settlement discipline and explicit
spawn-failure/non-zero-exit/stdin-error precedence; `execFileP` and
`spawnWithStdin` now correctly separate Node's errno-string `code` from a
numeric process `exitCode` (previously conflated); bounded stderr now
enforces an actual byte limit via `Buffer` accumulation instead of
comparing JS string length against a constant literally named `...BYTES`.
12 new deterministic tests added (278/278 total in this file). See the
"Stage 3F.5.8A-R2 Update" subsections below for detail; the R1 narrative
above is left as-is as the historical record of that substage.

The parent stage remains **STAGE 3F.5.8A BLOCKED** — neither repair
attempts or resolves Stage O's real-host WDIO acceptance from this
sandbox; that stays explicitly deferred.

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

### Files changed — Stage 3F.5.8A-R2 update

- `apps/desktop/e2e-wdio/support/container-git-remote.ts`:
  - `execFileP`: new `splitNodeErrorCode` helper separates Node's raw,
    overloaded `error.code` into a string-only `code` (errno) and a
    number-only `exitCode`, replacing a direct copy that could leak a
    numeric exit code into `code`.
  - `spawnWithStdin` rewritten: settles from `"close"` (not `"exit"`);
    `"error"`/`stdin`'s own `"error"` captured as state via `once()`
    rather than rejecting directly; single `settled` guard; explicit
    precedence (spawn failure > non-zero exit, with any stdin error
    folded in only as secondary message context > successful-exit-with-
    failed-stdin, documented as `exitCode: 0` > resolve). New injectable
    `SpawnWithStdinDeps`/`defaultSpawnWithStdinDeps` seam (production
    unchanged: real `spawn`).
  - Stderr bounding rewritten as `BoundedStderrCollector`: accumulates raw
    `Buffer` chunks against the real byte limit, decodes once at the end,
    fixing a string-length/byte-length mismatch in the constant's own
    name. `MAX_STDIN_EXEC_STDERR_BYTES`/`STDERR_TRUNCATION_MARKER`
    exported (narrowly) for precise test assertions.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts`: 12 new
  tests — 1 real non-zero-exit test for `execFileP`, 1 real close-vs-exit
  test (grandchild inherits stderr fd, delayed write), 4 deterministic
  EPIPE/spawn-error-ordering tests via the injected fake-child seam, 6
  stderr-truncation boundary tests (including a direct regression test
  for R1's own boundary bug).
- `docs/E2E_WDIO_PLAN.md` — added the "Stage 3F.5.8A-R2" subsection.

## Tests

- `pnpm vitest run e2e-wdio/support/container-git-remote.test.ts` —
  **278/278 passed** (266 after R1 + 12 new this update).
- `pnpm --filter @rack-inventory-studio/desktop test` — **1313/1313
  passed** (full desktop suite, includes the above).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.

## Static validation

All re-run through the repository-declared `pnpm@10.33.4` via Corepack
(see Risks for why this mattered), current as of Stage 3F.5.8A-R2:

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm install --frozen-lockfile` | clean — lockfile already up to date, no reinstall (see Risks) |
| `pnpm check:version` | ✓ versions and toolchain declarations match |
| `pnpm check:hygiene` | ✓ 8/8 |
| `pnpm test:scripts` | ✓ 237/237 |
| `pnpm --filter @rack-inventory-studio/desktop typecheck` | clean |
| `pnpm --filter @rack-inventory-studio/desktop test` | ✓ 1313/1313 |
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
- **(R2) `spawnWithStdin` previously settled on `"exit"`, not `"close"`.**
  This was a real correctness gap, not yet exercised by any R1 test: a
  grandchild process inheriting this module's piped stderr descriptor
  could keep writing to it after the direct child had already exited,
  and the R1 implementation would have settled — and returned incomplete
  diagnostics — before that data arrived. Fixed and directly regression-
  tested (see Tests).
- **(R2) `execFileP`'s `code` field could leak a numeric exit code.**
  Node overloads `error.code` for both an errno string (spawn failure) and
  a numeric exit status (process ran, exited non-zero); the R1
  implementation copied it verbatim, which technically violated
  `DockerCommandError.code`'s own declared string-only type. Fixed via
  `splitNodeErrorCode`; directly tested against a real `exit(7)` process.
- **(R2) Bounded stderr was byte-named but character-limited.** The R1
  `MAX_STDIN_EXEC_STDERR_BYTES` constant was compared against JS string
  `.length` (UTF-16 code units), not actual bytes. Fixed via
  `BoundedStderrCollector`, which accumulates raw `Buffer` chunks and
  decodes once at the end.

## Not done

- Real-host Stage O/P validation (explicitly deferred, not this
  substage's scope).
- `corepack enable`'s shim step could not be made to work in this sandbox
  (self-referential `PATH` requirement); documented as a known gap rather
  than forced through with a global `PATH` modification, which was
  explicitly out of scope.

## Suggested next step

Same as the parent stage: run the deferred real-host acceptance checklist
(`docs/E2E_WDIO_PLAN.md`, Stage 3F.5.8A-R1 section, unchanged by R2) on a
normal Linux host with working Docker port publication and a working
`tauri-driver` session handshake, before Stage 3F.5.8A can become COMPLETE
or Stage 3F.5.8B can begin.
