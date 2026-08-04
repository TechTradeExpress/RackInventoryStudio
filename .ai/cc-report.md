## Summary

Stage 3F.5.4-R1 RP: a strict pre-push review of Stage 3F.5.4's containerized
Git-over-SSH fixture proof of concept found real lifecycle and
cache-correctness defects — fixed all of them, added fault-injection test
coverage proving the fixes, and re-validated on the real
Windows+WSL2+Docker host.

Fixed: (1) `startContainerRemote()` could leave a running container/work
directory/keys behind on partial failure — now tracks acquired resources
in a `PartialContainerFixtureState` and rolls them back via
`rollbackPartialContainerFixture()`, rethrowing the *same* error instance
with rollback failures attached as a non-replacing `rollbackDiagnostics`
property. (2) The spec's container-provider `before()` could leak a fully
started container if `configureContainerSsh()` failed afterward — replaced
with `createContainerRemoteFixture()`, an atomic init boundary that cleans
up via `cleanupContainerRemote()` if configuration fails; gave the native
provider equivalent safety inline in the spec. (3) `ensureImageBuilt()`
reused a fixed `:dev` tag with no check it matched the checked-out fixture
source — now keyed by a boundary-safe content hash
(`ris-e2e-git-ssh-server:<12-char-hash>`, NUL-delimited name+content per
file so `["ab","c"]`/`["a","bc"]`-style concatenation ambiguity can't
collide), so a fixture edit structurally invalidates the cache. Also
hardened `cleanupContainerRemote()`'s ordering (keep-alive stopped last, in
a `finally`, structured `CleanupResult` instead of throwing), switched
container-existence verification from a substring-matching `docker ps
--filter name=` to exact-identity `docker inspect`, and made
`decodeWslMetaOutput()` detect UTF-16LE by content (BOM or NUL density)
instead of assuming it unconditionally.

**Verdict: STAGE 3F.5.4-R1 COMPLETE — READY TO PUSH.**

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` — the bulk of
  this RP: `PartialContainerFixtureState`/`rollbackPartialContainerFixture`,
  `ContainerOpsDeps` injection layer (every lifecycle side effect is now a
  narrow injectable function, production defaults use real wsl.exe/docker),
  rewritten `startContainerRemote` (transactional), new
  `createContainerRemoteFixture` factory + `ContainerRemoteFixtureHandle`,
  content-addressed `computeFixtureContentHash`/`ensureImageBuilt`/
  `computeCurrentFixtureImageTag`, rewritten `cleanupContainerRemote`
  (ordering + `CleanupResult`) and `cleanupOrphanedContainers` (injected
  deps), resilient `decodeWslMetaOutput`.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — grew from
  67 to 109 tests: all 13 fault-injection scenarios this RP's NSP listed,
  plus hash-boundary-safety and UTF-16LE-detection tests.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` — container
  branch now calls `createContainerRemoteFixture()` instead of
  `startContainerRemote()`/`configureContainerSsh()` separately; native
  branch wraps `configureNativeSsh()` in a try/catch that cleans up on
  failure; `RemoteFixture.cleanup()` return type loosened to
  `Promise<unknown>` (container's cleanup now returns a structured
  `CleanupResult`, not `void`).
- `docs/E2E_WDIO_PLAN.md` — new "Stage 3F.5.4-R1" section; updated the
  Stage 3F status-table row.

## Tests

- `pnpm --filter @rack-inventory-studio/desktop test` — 1127 tests, 59
  files, all passed (was 1085 before this RP; +42 net from the rewritten
  container-git-remote.test.ts).
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm check:version` / `check:hygiene` (8/8) / `test:scripts` (237/237) —
  all clean.
- `git diff --check` — clean.
- `cargo fmt --all -- --check` / `cargo clippy --workspace -- -D warnings`
  / `cargo test --workspace` — all clean (no Rust files touched).
- **Real Windows+WSL2+Docker validation**: forced content-hash build
  produced the expected tag with expected labels; a non-forced call
  correctly reused it. First 5-run stability matrix hit one genuine
  failure (a UI-open flake, same signature/class already documented in
  Stage 3F.5.4's own report, unrelated to either fixture provider — see
  Risks); a **fresh** 5-run matrix then passed 5/5 cleanly (22-28s each),
  per this RP's "no retries within a run" rule. A controlled real-host
  failure injection (fake `installPublicKey` throwing after the container
  genuinely existed and was healthy) confirmed against real Docker state:
  same error instance rethrown with `rollbackDiagnostics` attached,
  container actually gone from `docker inspect`, work directory removed,
  no `sleep 86400` keep-alive process left running. Native provider
  re-verified unaffected (1 passed, 14s).

## Risks

- The intermittent UI-open flake (`repository-active-root` not rendering
  within 30s on a scenario's very first "open repository" step, before any
  remote/SSH interaction) recurred once during this RP's real-host
  validation, in the same failure class already noted in Stage 3F.5.4's
  own report. It does not reproduce across either stage's clean 5-run
  matrices and its root cause is not understood — flagged, not
  investigated further here (out of this RP's scope).
- Everything else carried forward from Stage 3F.5.4's own report is
  unchanged: WSL2 VM idle-shutdown is a real host characteristic worked
  around, not eliminated; `/mnt/c` automount path assumption untested on a
  remapped host; only `git-remote-workflows` is migrated.

## Not done

- Did not migrate `git-clone-workflows` or `git-diverged-pull` — out of
  this RP's explicit scope ("narrow repair pass... do not migrate
  additional specs").
- Did not remove or refactor the native fixture (`git-remote.ts`) — out of
  scope; the native provider only gained a small inline safety fix at its
  point of use in the spec.
- Did not rewrite the three pre-existing Stage 3F.5.4 commits — this RP's
  changes are a new, fourth commit on top, per its own commit policy.
- Did not push. Did not restart the full Windows WDIO Gate, merge to
  `development`, or tag/publish a release — all explicitly out of scope.

## Suggested next step

Push the four local commits on `feature/windows-ssh-fixture` to origin
(pending explicit confirmation — pushing is a visible/shared action). After
that, the Stage 3F.5.4 report's own recommended next step still applies:
migrate `git-clone-workflows` and `git-diverged-pull` to the container
provider, then retire the native fixture's Windows-only branches.
