## Summary

Stage 3F (Git workflow E2E coverage) is functionally complete. This
branch, `feature/e2e-stage-3f2-remote-ssh` → `roadmap/e2e-wdio` (base =
`roadmap/e2e-wdio` HEAD, same commit as Stage 3F.1B's merge, PR #164),
bundles three approved/completed sub-stages plus a final PR-readiness
pass:

- **Stage 3F.2** — remote Git over SSH: push, fast-forward pull, upstream
  tracking, close/reopen persistence, SSH key-based authentication.
  Reviewed and approved; one RP applied (missing-`sshd` policy changed
  from silent skip to a hard `before()` failure, so a run cannot report
  green while exercising zero SSH scenarios).
- **Stage 3F.3** — Git clone over SSH: scaffold-only clone, multi-commit
  clone, clone-state persistence. Reviewed and approved; one RP applied
  (the seeding helper now sets the bare remote's symbolic HEAD explicitly
  instead of relying on the host's `init.defaultBranch` to happen to
  match).
- **Stage 3F.4** — diverged pull over SSH: `git pull --ff-only` safely
  rejects a genuinely diverged history (local commit B / remote commit C,
  both children of a common pushed commit A, divergence proven via `git
  merge-base --is-ancestor`), with every piece of repository state
  surviving the failure and a close/reopen cycle.
- **PR-readiness pass** (this pass) — full diff review, documentation
  consistency check, and a critical self-review; found and fixed three
  real issues (two stale doc comments describing behaviour that no longer
  exists, one genuinely unused helper function). See "PR-prep findings"
  below.

## PR-prep findings (this pass)

1. `wdio.conf.ts`'s "Prerequisites" doc comment still said `sshd` was
   "required only for the git-remote-workflows spec (Stage 3F.2)" — stale
   since Stage 3F.3 was added; missed updating it further when Stage 3F.4
   was added too. Fixed to name all three SSH specs.
2. `support/git-remote.ts`'s `startRemote()` doc comment still described
   the pre-RP "callers should skip the suite" policy — stale since Stage
   3F.2's RP changed this to a hard failure. Fixed to describe the actual
   current policy and point at the three specs that implement it; also
   generalized its own thrown error message, which named only
   `git-remote-workflows`.
3. `remoteBranchExists()` (`support/git-remote.ts`) was dead code — built
   as general-purpose "remote refs" inspection infrastructure per Stage
   3F.2's original NSP, but never actually called by any of the three
   specs that shipped (they all ended up using `getRemoteHeadCommit`/
   `getRemoteCommitCount` instead, which implicitly prove ref existence
   via `rev-parse` failing on a missing ref). Confirmed via usage-count
   audit — every *other* exported helper in both `support/git-remote.ts`
   and `support/local-git.ts` is used by at least one real spec;
   `remoteBranchExists` was the sole exception, only exercised by its own
   unit test. Since Stage 3F is now closed (no further sub-stage will
   arrive to consume it), removed the function, its two assertions in
   `git-remote.test.ts`, its import, and a stale doc mention in
   `docs/E2E_WDIO_PLAN.md`.
4. One unused type import (`SshRemoteServer` in `git-remote.test.ts`,
   never referenced) — removed. Found via a `tsc --noUnusedLocals
   --noUnusedParameters` pass against every new/changed TS file (this
   command isn't part of the project's own `typecheck` script, which
   scopes to `apps/desktop/src` and doesn't cover `e2e-wdio/` — run
   manually for this cleanup pass).

No functional, race-condition, or architectural issues were found in the
self-review (fixture lifecycle, port allocation, sshd cleanup ordering,
Mocha `before`/`after` failure semantics, cross-spec process isolation,
and every commit-count/HEAD/ancestry assertion in the diverged-pull
scenario were each traced through by hand). Full detail of what was
checked is in the chat response, not duplicated here.

## Files changed in this pass

- `apps/desktop/e2e-wdio/wdio.conf.ts` — prerequisites doc comment fix (2).
- `apps/desktop/e2e-wdio/support/git-remote.ts` — doc comment fix (2),
  dead code removal (3).
- `apps/desktop/e2e-wdio/support/git-remote.test.ts` — unused import
  removal (4), dead-code-following test cleanup (3).
- `docs/E2E_WDIO_PLAN.md` — stale helper mention fix (3); added a "Stage
  3F — functionally complete" row to the Program status table.

## Tests

Re-run in full after every cleanup edit:

- `git diff --check` — clean.
- `node scripts/check-repo-hygiene.mjs` — 8/8 passed.
- `node scripts/check-version-consistency.mjs` — versions/toolchain
  consistent.
- `pnpm -C apps/desktop typecheck` — clean.
- `pnpm -C apps/desktop test` — 58 files / 947 tests passed.
- `node scripts/run-wdio-e2e.mjs --spec git-remote-workflows` — CLEAN PASS.
- `node scripts/run-wdio-e2e.mjs --spec git-clone-workflows` — CLEAN PASS.
- `node scripts/run-wdio-e2e.mjs --spec git-diverged-pull` — CLEAN PASS.
- `node scripts/run-wdio-e2e.mjs --spec git-local-workflows` — CLEAN PASS
  (regression).
- `node scripts/run-wdio-e2e.mjs --spec git-detection-init` — CLEAN PASS
  (regression).
- `cargo test --workspace` — all passed, 0 failures (no Rust files
  changed across all of Stage 3F.2–3F.4 or this pass).
- `cargo fmt --all -- --check` — clean.
- `cargo clippy --workspace --all-targets` — only pre-existing warnings in
  files this branch never touches (`crates/ris-application/tests/
  application_tests.rs`, `app_config.rs`, `commands/repository.rs`,
  `diagnostics.rs`); confirmed via `git status` that none of Stage 3F's
  work touches any of them.

## Risks

- `sshd`/`ssh-keygen`/`ssh` are required prerequisites for 3 of the 5
  Git-workflow specs — documented, and their `before()` hooks fail loudly
  (not silently) if missing, so this cannot produce a false-green result.
- The bare-remote seeding helper's probe fetch and the SSH port-allocation
  TOCTOU window are both narrow, previously-documented, low-probability
  risks (see each stage's own report for detail) — not reintroduced or
  changed by this pass.
- No CHANGELOG.md entry was added for the one application-code change
  (`git-upstream-value` testid) — checked against project precedent
  (`git log`/`grep` over `CHANGELOG.md`): standalone testid additions with
  no behavioural change are not changelogged in this project, and no
  prior Stage 3F sub-stage's testid additions were either.

## Not done / out of scope

No new functionality was implemented in this pass, per its own
instruction. Commit history was not rewritten or squashed — a proposal is
presented in the chat response for the user to approve; no `git commit`
or `git push` was run.

## Suggested next step

Review the proposed commit structure and PR description in the chat
response; once approved, either commit as one squashed commit or ask for
the finer-grained per-stage split to be executed, then open the PR to
`roadmap/e2e-wdio`.
