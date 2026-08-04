## Summary

Stage 3F.5.4-R4 RP: a strict review of Stage 3F.5.4-R3's `clearContainerSshConfig()`
found its `already-absent` classification still rested on `existsSync()` —
a bare boolean that cannot distinguish "the file genuinely does not exist"
from "the filesystem could not be inspected" (access denied, an
inaccessible parent, an I/O error). A real inspection failure could
therefore have been misclassified as confirmed absence. Fixed with a
structured-error-code rewrite and validated against real Docker/filesystem
state.

Fixed: `existsSync()` replaced with `lstatSync()` wrapped in try/catch;
only a thrown error whose structured `.code === "ENOENT"` (checked via new
`isNodeErrorWithCode`, never a message-text match) produces
`"already-absent"`. Every other error — `EACCES`, `EPERM`, `EBUSY`, `EIO`,
`ENOTDIR`, or one with no recognized code at all — is rethrown unchanged,
never downgraded to `"refused"` and never silently treated as success.
`clearContainerSshConfig` now takes an injectable `SshConfigFsDeps`
(`{lstat, remove}`, mirroring `inspectContainerPresence`'s `DockerInspectFn`
seam) so the structured-error scenarios are unit-tested deterministically
with no real NTFS ACL manipulation. `cleanupContainerRemote()` and
`rollbackPartialContainerFixture()` needed no conceptual change — both
already treated a thrown `clearSshConfig()` error as an authoritative
failure; they now simply receive a more precisely classified error instead
of a false "already-absent" they were never actually producing for these
cases (this RP closes the class of bug before it manifests, not a bug that
was already observed in practice).

A sweep found one more `existsSync()` call with the identical correctness
gap — `removeWorkDirImpl`'s work-directory absence check — deliberately
left unfixed here (documented as a same-shape follow-up candidate) to keep
this RP's single commit narrowly scoped to the SSH-config path it was
asked to repair.

**Verdict: STAGE 3F.5.4-R4 COMPLETE — READY FOR MIGRATION.**

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` —
  `isNodeErrorWithCode`, `SshConfigFsDeps`/`defaultSshConfigFsDeps`,
  `clearContainerSshConfig` rewritten to use `lstatSync`/`ENOENT`
  classification with injectable filesystem operations instead of
  `existsSync`. `lstatSync` added to the `node:fs` import.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — grew from
  181 to 194 tests: `isNodeErrorWithCode` pure classification,
  `clearContainerSshConfig`'s new dependency-injected structured-error
  coverage (ENOENT/EACCES/EPERM/EIO/no-code on inspection, EPERM on
  removal, original error instance preserved throughout), plus cleanup/
  rollback authority tests using a structured EACCES.
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.4-R4" section, including the
  documented (not fixed) `removeWorkDirImpl` observation.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` — unchanged;
  no type contract it references changed shape.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1212 tests, 59
  files, all passed (was 1199 before this RP; +13 net, all in
  `container-git-remote.test.ts`, which itself grew from 181 to 194).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm install --frozen-lockfile` / `pnpm check:version` /
  `pnpm check:hygiene` (8/8) / `pnpm test:scripts` (237/237) — all clean.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` / `cargo clippy --workspace -- -D warnings`
  / `cargo test --workspace` — all clean (no Rust files touched).
- **Real-host validation** (standalone script against real Docker/filesystem,
  deleted before commit): started a real container fixture, wrote a real
  `ssh-remote-command.env`, cleaned up once (succeeded, config genuinely
  gone from disk), called `clearContainerSshConfig()` again directly
  (correctly reported `"already-absent"` via real `lstatSync`/`ENOENT`),
  then a second full `cleanupContainerRemote()` call also succeeded — no
  container, work directory, or config file remained. No ACL-denial
  experiment run (not required — structured-error paths are covered
  deterministically in unit tests).
- **Container provider regression**: one `RIS_E2E_GIT_REMOTE_PROVIDER=container`
  run against `git-remote-workflows` — passed cleanly (28s), teardown
  conclusively successful, no leftover resources. Native-provider run
  skipped per this RP's own guidance (spec/native adapter unchanged, no
  shared cleanup-result type changed shape).

## Risks

- Same residual items carried forward from R1-R3, none newly introduced:
  WSL2 VM idle-shutdown worked around, not eliminated; `/mnt/c` automount
  assumption untested on a remapped host; keep-alive "stopped" still means
  "the kill call didn't throw," not a confirmed-exit wait; the intermittent
  UI-open flake and driver-port contention are unrelated to fixture-cleanup
  logic; only `git-remote-workflows` is migrated.
- `removeWorkDirImpl` still uses `existsSync()` for its own absence check —
  same correctness gap as the one this RP just fixed for SSH config, not
  yet repaired (see docs section for the explicit follow-up note).

## Not done

- Did not fix `removeWorkDirImpl`'s equivalent `existsSync()` gap —
  documented as a same-shape follow-up candidate, out of this RP's
  explicit single-file scope.
- Did not migrate `git-clone-workflows` or `git-diverged-pull`.
- Did not change application code, Docker lifecycle, the container image,
  SSH authentication, Git workflow assertions, or the native fixture.
- Did not investigate the UI-open flake or driver-port contention, add
  retries, or add sleeps.
- Did not run a native-provider WDIO regression (optional per this RP,
  skipped since nothing shared changed shape).
- Did not restart the full Windows WDIO Gate, merge to `development`, or
  tag/publish a release.
- Did not implement the optional `RIS_E2E_RUN_ROOT`-must-be-absolute
  hardening — judged unnecessary beyond this RP's core ask and skipped to
  stay minimal.

## Suggested next step

Apply the same `lstatSync`/`ENOENT`/injectable-deps repair to
`removeWorkDirImpl`'s work-directory absence check (the one remaining
`existsSync()`-as-authority site flagged by this RP), then proceed with
migrating `git-clone-workflows` and `git-diverged-pull` to the container
provider.
