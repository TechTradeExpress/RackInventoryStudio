## Summary

Stage 3F.0.5 per NSP, on `feature/e2e-stage-3f-local-git-foundation` →
`roadmap/e2e-wdio` (base = `roadmap/e2e-wdio` HEAD after PR #161/Stage 3F.0
merged — confirmed merged before branching). **Status: COMPLETE.**

Infrastructure-only stage per its own explicit scope: prepares the shared,
safe, deterministic test foundation Stage 3F.1's actual local Git workflow
specs will build on. No Git workflow test, no `data-testid`, no
application code — as required.

**1. Status of the stage:** COMPLETE. All 12 acceptance criteria in the
NSP are met (see section-by-section detail below); nothing is PARTIAL.

**2. Helpers created:**
- `apps/desktop/e2e-wdio/support/local-git.ts` (new) — `runGit()` (a
  controlled `git` execution helper), `createLocalGitRepository()` (the
  repository-fixture builder), and 7 inspection helpers
  (`isGitRepository`, `getCurrentBranch`, `getHeadCommit`,
  `getCommitCount`, `getWorkingTreeStatus`, `getRemoteUrl`,
  `readGitConfig`) — scoped to exactly what Stage 3F.1's planned specs
  need, nothing beyond.
- `apps/desktop/e2e-wdio/support/test-environment.test.ts` (modified) —
  one new test strengthening existing coverage: asserts the isolation
  vars actually land on `process.env` after `initTestEnvironment()`.

**3. Environment isolation — exact mechanism:** re-validated (not
re-built) the existing infrastructure in `support/test-environment.ts`
(from prior Stage 3B.x work), which already sets, directly on
`process.env` at WDIO launcher module-load time:
- `HOME=<runRoot>/home`
- `GIT_CONFIG_GLOBAL=<runRoot>/git/config` (containing only a minimal
  isolated identity, `Rack Inventory Studio E2E` /
  `e2e@localhost.invalid` — never the real developer's config)
- `GIT_CONFIG_NOSYSTEM=1`
- `XDG_CONFIG_HOME=<runRoot>/app-config` (plus `XDG_DATA_HOME`/
  `XDG_CACHE_HOME`)

No new environment variables were needed — this set already fully covers
the NSP's isolation requirement (point 2). `local-git.ts`'s
`createLocalGitRepository` additionally sets `user.name`/`user.email`
**locally** (`git config` without `--global`) on every fixture repo it
creates, layering an explicit per-repo identity on top of the
test-environment's own isolated global default.

**4. Env passed to the Tauri app — verified, not assumed:** traced through
`@wdio/tauri-service`'s own dist bundle
(`node_modules/@wdio/tauri-service`): `DriverPool.startTauriDriverForWorker`
spawns `tauri-driver` with `env: env ?? { ...process.env, ... }` — i.e. it
spreads the calling (already-isolated) process's `process.env` into
`tauri-driver`'s environment. `tauri-driver` is a plain
`std::process::Command` spawn (external Rust crate, not this repo) and
inherits its own environment into the launched Tauri app by default —
there is no `env_clear()`/`env_remove()` call anywhere in the reachable
code that would strip it. Chain: **WDIO worker process → tauri-driver →
Tauri app**, fully inheriting the isolation vars at every hop. This
finding, plus its inherent limitation (it stops at reading
`@wdio/tauri-service`'s source + a unit test on our own launcher code — it
does not read env vars back out of a *running* app process, since that
would require a production code change explicitly out of scope for this
stage) is documented in full in `docs/E2E_WDIO_PLAN.md`'s new Stage 3F.0.5
section.

**5. Cleanup safety guarantees:** `createLocalGitRepository`'s `cleanup()`
calls `assertPathIsCleanupSafe`, which re-uses `test-environment.ts`'s own
exported `isStrictChildPath` against `RIS_E2E_RUN_ROOT` — the same
ownership boundary the suite's global `onComplete` cleanup already
enforces — rather than a second, parallel mechanism. It refuses (throws,
does not delete) when `RIS_E2E_RUN_ROOT` is unset or the target path is
not a strict descendant of it, and is idempotent (a second call after the
directory is already gone is a no-op). The existing whole-run
`onComplete` cleanup in `wdio.conf.ts` remains the backstop guaranteeing
no leftover directory survives a completed WDIO run even if a spec never
calls `cleanup()` itself.

**6. Infrastructure tests added:** `apps/desktop/e2e-wdio/support/
local-git.test.ts` (14 tests, Node/Vitest, no WDIO session, no network)
plus 1 new test in `test-environment.test.ts` — 15 new tests total, 0 new
WDIO specs. Coverage: repo creation with/without `git init`; an initial
commit (`getCommitCount`/`getHeadCommit`/clean status); local
`user.name`/`user.email` isolation proven against a *simulated real
global identity* (a fake `GIT_CONFIG_GLOBAL` file set mid-test, confirmed
**not** to leak into the fixture's commit author — directly proving
"brak odczytu globalnej konfiguracji użytkownika"); clean-vs-dirty
working-tree status; adding and reading a remote URL with no network
call; `runGit`'s literal (non-shell) argument passing (a commit message
containing `;`, `` ` ``, and `$()` shell metacharacters round-trips
verbatim with no side-effect files created); diagnostic-error reporting
for an invalid git subcommand (`GitCommandError` with
args/cwd/exitCode/stdout/stderr); and cleanup's refusal to delete a path
outside the isolated run root.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/support/local-git.ts` | New — runGit, createLocalGitRepository, 7 inspection helpers |
| `apps/desktop/e2e-wdio/support/local-git.test.ts` | New — 14 unit tests |
| `apps/desktop/e2e-wdio/support/test-environment.test.ts` | +1 test verifying isolation vars land on process.env |
| `docs/E2E_WDIO_PLAN.md` | New "Stage 3F.0.5 — Local Git E2E Test Foundation" section; Program status table updated; "possible further split" note added under Stage 3F.2 |
| `.ai/cc-report.md` | This report |

`docs/E2E_WDIO_COVERAGE_GAPS.md` intentionally **not** touched — no
selector or classification change occurred, per the NSP's own instruction
not to increase the coverage count for infrastructure work.

No application code (Rust or frontend `src/`) was changed. No new
`data-testid`.

## Tests

**7. Validation commands run:**

```
git diff --check                              PASS
node scripts/check-repo-hygiene.mjs           PASS (8/8)
node scripts/check-version-consistency.mjs    PASS
pnpm -C apps/desktop typecheck (tsc --noEmit)  PASS
  (note: this tsconfig's include is ["src"] only — it does not cover
  apps/desktop/e2e-wdio/. No dedicated tsconfig exists for e2e-wdio in
  this repo; its only static-check surface is Vitest, run below, plus
  WDIO's own tsx-based transpilation at spec runtime. This predates this
  stage and is unrelated to it.)
pnpm -C apps/desktop test (vitest run)         PASS — 938/938, 57/57 files
  includes local-git.test.ts (14/14) and the strengthened
  test-environment.test.ts (23/23)
cargo fmt/check/clippy                         not run — no Rust files changed
```

## Manual verification (per NSP §"Walidacja")

- Global `git config --global --list` captured before and after the full
  test run: `user.email=su-17@wp.pl`, `user.name=Jakub Plucinski` —
  **unchanged**.
- No leftover `local-git-test-*` / `outside-run-root-*` temp directories
  after the suite completed.
- No leftover git processes.
- Project repository's own `.git/config` (checked via
  `git config --local --list`) and commit history untouched by any test
  — the two commits on this branch are the only changes, both authored
  directly by this session, not by any test run.

## Confirmations (per NSP §"Raport końcowy")

- **8. No network, SSH, or Docker used anywhere in this stage** —
  confirmed: `runGit`'s only remote-adjacent test is `git remote add` +
  `git remote get-url`, neither of which contacts a network; no SSH
  key, agent, or `known_hosts` handling exists in `local-git.ts`; no
  container/Docker infrastructure was added.
- **9. No production/application code changed** — confirmed via
  `git diff --stat` across both commits: only `apps/desktop/e2e-wdio/
  support/*` and `docs/E2E_WDIO_PLAN.md` changed.
- **10. No Git workflow WDIO spec added** — confirmed: zero new files
  under `apps/desktop/e2e-wdio/specs/`; `local-git.test.ts` is a
  Vitest/Node unit-test file for the helper module, not a WDIO spec.

## Risks

- The env-inheritance verification (point 4 above) is evidence-based
  (reading `@wdio/tauri-service`'s dist bundle plus a unit test on our own
  code) rather than a live-process readback — a genuine limitation
  acknowledged explicitly in both this report and the docs. If
  `@wdio/tauri-service` changes its env-spreading behavior in a future
  version bump, this evidence would need re-verification; nothing in this
  stage guards against that silently.
- `createLocalGitRepository`'s minimal RIS fixture (`repo.yaml` +
  `locations.yaml` only) is confirmed loader-valid by reading
  `ris-repository`'s loader directly, but has not been round-tripped
  through the actual app's "open repository" flow in this stage (no WDIO
  spec exists yet to do so) — Stage 3F.1 will be the first place this
  fixture shape is exercised end-to-end through the UI, if that turns out
  to be needed.
- The "possible further split" (3F.1.5/3F.2) noted in the docs is a
  suggestion, not a decision — Stage 3F.1's own NSP does not need to
  adopt it, and Stage 3F.2's NSP is where it would actually be confirmed
  or rejected.

## Not done

- No Git workflow specs (init/commit/validate/add-remote/push/pull) — out
  of scope for this stage per its own NSP; that is Stage 3F.1.
- No remote-Git/SSH/container infrastructure — out of scope; that is
  Stage 3F.1.5/3F.2 (proposed split, not yet decided).
- No new `data-testid` or UI change — out of scope per the NSP's explicit
  prohibition.
- The known SSH-clone-askpass product gap (identified in Stage 3F.0) was
  not touched — correctly out of scope; flagged again here per the NSP's
  own "found a production bug — describe it, don't fix it" instruction,
  though this stage found no *new* production bug of its own.

## Suggested next step

Human review of this PR. Once accepted, open a dedicated NSP for Stage
3F.1 (Local git workflows: init, validate/status, commit, add-remote,
push/pull disabled-state and error-path coverage) using the
`local-git.ts` helpers prepared here — including resolving the
selector-design prerequisite already flagged in Stage 3F.0's audit (the
duplicate Push/Pull button pairs need a disambiguated `data-testid` scheme
before any git workflow spec can reliably target them).
