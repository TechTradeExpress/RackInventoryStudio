## Summary

Stage 3F.5.7-R1 (RP): restricted Stage 3F.5.7's container default to
Windows only. Strict review caught that the shipped resolver returned
`"container"` for an unset/empty `RIS_E2E_GIT_REMOTE_PROVIDER` on *every*
platform — but the container backend is Windows-specific (invokes
`wsl.exe`, discovers WSL distributions, runs Docker through WSL2,
translates paths to `/mnt/<drive>`) and Linux-native Docker execution is
still deferred to Stage 3F.5.8. An unqualified global default would have
selected a non-functional backend by default on Linux/macOS.

`resolveGitRemoteProvider()` now takes an injectable
`platform: NodeJS.Platform = process.platform` parameter: unset/empty
resolves to `"container"` only when `platform === "win32"`, and to
`"native"` on every other platform. Explicit `native`/`container` values
are unaffected on any platform (unchanged branch). Production
zero-argument calls use the real `process.env` and real
`process.platform` — platform is never inferred from an environment
variable, never monkey-patched in tests.

Also reviewed and narrowed `withNativeFallbackHint()`'s call sites: kept
on all prerequisite/configuration failures (WSL/Docker discovery, image
build), removed from the published-port parse failure, which is an
internal fixture invariant (the container is already running by that
point) rather than a missing-prerequisite condition — appending the hint
there would have read as "workaround" rather than surfacing a fixture
defect.

Corrected `docs/E2E_WDIO_PLAN.md`'s Stage 3F.5.7 section in place where it
now conflicts with the real behavior (unqualified "returns container when
unset" language, and a "23 runs" framing that implied the invalid-provider
run also passed/tore down/got `PASS_WITH_FORCED_CLEANUP`, which it did
not — it fails before any fixture exists). Added a new Stage 3F.5.7-R1
section documenting the repair, its tests, and real-host validation.

Validated on the real Windows/WSL2/Docker host: 3 unset-provider specs
(all resolved `container`, all passed) + 1 explicit-native spec (resolved
`native`, passed) = 4 real WDIO executions, all with conclusive teardown
and zero residue afterward.

**Stage 3F.5.7-R1 status: COMPLETE — READY FOR LINUX PORTABILITY VALIDATION.**
Parent Stage 3F.5.7 returns to the same status, per this RP's own
completion criteria being met.

## Files changed

- `apps/desktop/e2e-wdio/support/container-git-remote.ts` —
  `resolveGitRemoteProvider()` gained an injectable
  `platform: NodeJS.Platform = process.platform` parameter; the
  unset/empty branch now returns `"container"` only when
  `platform === "win32"`, `"native"` otherwise. Removed
  `withNativeFallbackHint()` from `startContainerRemote`'s published-port
  parse failure (internal fixture invariant, not a missing prerequisite);
  kept on every other call site (WSL/Docker discovery, image build). Doc
  comments updated to describe the platform-aware contract and the
  hint-classification rationale.
- `apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — replaced
  the `resolveGitRemoteProvider` suite with the 13 platform × value cases
  (win32/linux/darwin × unset/explicit/invalid, plus case-sensitivity and
  non-trim preservation) driven by an explicit injected `platform`
  argument, and a `production zero-argument call` sub-suite asserting the
  real call resolves against the real host's actual `process.platform`
  (no mutation). Added a `withNativeFallbackHint classification` suite
  (no-WSL-distributions and WSL-distro-without-Docker prerequisite cases,
  plus an `ensureImageBuilt` build-failure case) asserting both the
  retained diagnostic and the appended hint; extended the existing
  `startContainerRemote` "scenario 1" port-parse-failure test with an
  assertion that the hint is *absent* there.
- `apps/desktop/e2e-wdio/support/git-remote-fixture.test.ts` — extended
  the default-provider-wiring suite with injected-platform cases (win32
  unset → container branch, linux unset → native branch, explicit native
  on win32, explicit container on linux) through the real resolver via
  the `CreateGitRemoteFixtureDeps.resolveProvider` seam — no
  `process.platform` mutation, no real WSL/Docker/sshd. Kept the existing
  identity-proof test.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` —
  doc-comment-only correction: the `RemoteFixture` interface's comment
  now says "container on Windows... still native on other platforms until
  Stage 3F.5.8" instead of the previously unscoped "defaults to
  container".
- `docs/E2E_WDIO_PLAN.md` — corrected the original Stage 3F.5.7 section's
  "Resolver change" paragraph (marked superseded, points at R1) and its
  "fixture teardown vs. runner forced cleanup" paragraph (split "23 runs"
  into the accurate 22-passing + 1-expected-failure classification).
  Marked the original `STAGE 3F.5.7 COMPLETE` line as superseded pending
  R1. Added the full Stage 3F.5.7-R1 section (root issue, platform-aware
  resolver design, Windows/Linux/explicit-override default behavior,
  fallback-hint classification, resolver/adapter/hint test coverage,
  Windows regression results, Linux-boundary validation limits, static
  validation, remaining risks, final status) ending in a restored
  `STAGE 3F.5.7 COMPLETE` for the parent stage.
- `.ai/cc-report.md` — this file.

## Tests

- `git diff --check` — clean.
- `pnpm install --frozen-lockfile` — clean.
- `pnpm check:version` — clean.
- `pnpm check:hygiene` — 8/8 clean.
- `pnpm test:scripts` — 237/237 passed.
- `pnpm --filter @rack-inventory-studio/desktop typecheck` — clean.
- `pnpm --filter @rack-inventory-studio/desktop test` — 1262/1262 passed,
  60 files (includes the new/updated platform-matrix, hint-classification,
  and adapter-wiring tests above).
- `cargo fmt --all -- --check` — clean.
- `cargo clippy --workspace -- -D warnings` — clean.
- `cargo test --workspace` — all passed, 0 failed across every crate (no
  Rust source changed in this RP — confirmed via `git status` before and
  after; result consistent with Stage 3F.5.7's already-validated 104/104
  baseline).

### Real-host Windows regression (fresh processes, one at a time)

Pre-run: no stale app/driver process, ports 4444/4445 clear.

| Spec | Provider (env) | Resolved | Result | Duration |
|------|------------------|----------|--------|----------|
| `git-remote-workflows` | unset | container | PASS | 29s |
| `git-clone-workflows` | unset | container | PASS | 23s |
| `git-diverged-pull` | unset | container | PASS | 20s |
| `git-clone-workflows` | native | native | PASS | 11s |

Each unset run's log confirmed no native-sshd fixture log line; the
explicit-native run's log confirmed no `container-git-remote` log line at
all. All four reported `ports_free=true` and the pre-existing
`PASS_WITH_FORCED_CLEANUP` runner classification (same quirk documented
in Stage 3F.5.6/3F.5.7, unrelated to this change). Post-run: no
`ris.e2e.fixture=git-ssh` container, no stale app/driver process, ports
4444/4445 both clear. No 5×3 stability matrix was re-run — this repair
changes only platform-default *selection*, not lifecycle code, and the
Windows branch was already validated 15/15 in Stage 3F.5.7.

### Linux boundary

No Linux host was available in this environment. The `linux + unset ->
native` decision was proven at the unit level against the real
production `resolveGitRemoteProvider()` with an injected `platform:
"linux"` argument (not a reimplementation) — this is a genuine proof of
the platform-branching logic, but the RP's optional "production
zero-argument resolver test passes on the actual Linux host" check could
only be exercised on the available `win32` host. No lightweight real Linux
WDIO spec run was attempted (no Linux host to check native prerequisites
on); nothing was installed, and this was not misreported as a pass.

## Risks

- The Linux production zero-argument resolver path was not independently
  host-verified (see "Linux boundary" above) — logically proven via
  injected-platform unit tests against the real function, not run on an
  actual Linux machine. Recommended as a sanity check whenever Stage
  3F.5.8 is validated on Linux.
- `scripts/run-wdio-performance-benchmark.mjs`'s port-ownership-based
  forced-cleanup gap (documented in Stage 3F.5.7) is unchanged by this
  repair — still out of scope.
- Explicit `RIS_E2E_GIT_REMOTE_PROVIDER=container` on Linux/macOS still
  resolves to a value that will not currently produce a working fixture
  (the backend is still WSL-specific) — pre-existing since Stage 3F.5.7,
  unchanged by this repair, now explicitly documented as expected rather
  than left implicit.

## Not done

- Did not implement Linux-native Docker support or invoke Docker directly
  on Linux — explicitly deferred to Stage 3F.5.8.
- Did not remove WSL2 assumptions or `/mnt/c` path handling.
- Did not change container lifecycle logic, the native provider, Git
  workflow specs, application code, or CI workflows.
- Did not fix `support/git-remote.ts`'s remaining `existsSync()` sites or
  the runner's forced-cleanup port-ownership gap.
- Did not add retries, sleeps, or increase any timeout.
- Did not re-run the full 5×3 stability matrix (not required — see Tests
  above) or re-run a full WDIO invalid-provider spec (unit-level
  re-verification only, per this RP's own scope note).
- Did not merge to `development`, run the full release gate, or
  tag/publish a release.
- Left `apps/desktop/src-tauri/Cargo.toml`'s pre-existing working-tree
  modification (CRLF/LF normalization artifact, empty `git diff`, present
  before Stage 3F.5.7 started) untouched and unstaged — unrelated to this
  RP's scope.

## Suggested next step

Stage 3F.5.8: Linux-native Docker portability — direct Linux Docker CLI
execution, removing the `/mnt/c` assumption, `xvfb`/WebKitWebDriver
validation, Linux CI validation, and (only after that's proven on a real
Linux host, including the sanity check on the resolver's zero-argument
production path noted in Risks above) reconsidering the Linux default.
