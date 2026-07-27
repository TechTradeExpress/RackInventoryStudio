## 1. Summary

Stage 3F.1B per NSP, on `feature/e2e-stage-3f1b-local-git-workflows` →
`roadmap/e2e-wdio` (base = `roadmap/e2e-wdio` HEAD after PR #163/Stage
3F.1A merged, including its RP repair — confirmed merged before
branching). **Status: COMPLETE.**

Real local Git workflow coverage — Validate, Commit, Add remote, and
Push/Pull local error paths — building on Stage 3F.1A's detection/init
coverage and Stage 3F.0.5's fixture/helper infrastructure. Scope strictly
local, per the NSP: no successful push/pull, no clone, no SSH, no Docker,
no remote Git servers.

## 2. Audit findings (pre-implementation, per NSP §"Required pre-implementation audit")

- **HEAD matches Stage 3F.1A assumptions exactly**: `git log` from the
  Stage 3F.1A merge commit to this branch's point showed zero commits —
  no drift at all.
- **No new git-related selectors since Stage 3F.1A**: grepped
  `RepositoryPanel.tsx` for `data-testid`; exactly the 3 from Stage 3F.1A
  (`git-not-initialized`, `git-init-btn`, `git-branch-value`) were
  present, nothing else.
- **`RepositoryPanel.tsx`/Git backend unchanged**: re-read the full
  "Safe publish" stepper, "Remote" panel, and gating helpers
  (`gitStatusHelpers.ts`) directly against current HEAD before writing
  any selector or spec — matched the Stage 3F.0 audit's description in
  every respect (Push/Pull's duplicate button pairs, Validate/Commit
  gating logic, Add-remote form).
- No assumptions had changed materially — implementation proceeded as
  planned.

## 3. Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/features/repository/RepositoryPanel.tsx` | +11 `data-testid`, scoped strictly to this stage's 5 workflows: `git-validate-btn`, `git-commit-message-input`, `git-commit-btn`, `git-remote-name-input`, `git-remote-url-input`, `git-remote-add-btn`, `git-remote-add-success`, `git-stepper-push-btn`, `git-stepper-pull-btn`, `git-push-error`, `git-pull-error`. The Remote panel's identical Push/Pull button pair was deliberately left unselectorized. |
| `apps/desktop/e2e-wdio/specs/git-local-workflows.e2e.ts` | New — 3 `it()`s (see "Tests" below) |
| `apps/desktop/e2e-wdio/support/local-git.ts` | `writeMinimalRisFixture` fixed to also create empty `racks/`/`device-models/`/`devices/`/`placements/` directories (see "Bug found" below) |
| `apps/desktop/e2e-wdio/support/local-git.test.ts` | +1 regression test for the fix above |
| `docs/E2E_WDIO_PLAN.md` | Stage 3F.1B section rewritten COMPLETE; Program status table and Future-stages coverage figure updated |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | 3 rows moved to COVERED, 2 to PARTIAL; Summary counts recomputed |
| `.ai/cc-report.md` | This report |

No application code outside `RepositoryPanel.tsx`, and no Rust code, was
changed. Stage 3F.1A's own files were not touched.

**Bug found and fixed (Stage 3F.0.5's own test-helper code, not
application code):** `createLocalGitRepository`'s `writeMinimalRisFixture`
wrote only `repo.yaml` + `locations.yaml`, on the correct-at-the-time
reasoning that the *loader* (`ris-repository`) tolerates missing
`racks/`/`device-models/`/`devices/`/`placements/` directories entirely
(confirmed in Stage 3F.0.5's own audit). This stage's Validate spec was
the first to actually click Validate against such a fixture, and found
`VAL-REPO-004` (`crates/ris-validation/src/validators/repository.rs`) is
a separate, ERROR-level *validator* check requiring each of those four
paths to exist — independent of what the loader needs. A fixture missing
all four failed validation with 4 errors, permanently blocking Commit.
This is correct, intentional application behavior (the validator is
working as designed) — not a product bug, and not fixed at the
application level. Fixed the test helper to create the four directories
empty, matching what the app's own "Create repository" wizard produces.
Stage 3F.1A's own spec is unaffected — it never triggers Validate.

## 4. Tests implemented

`git-local-workflows.e2e.ts`, 3 `it()`s:
1. **Validate + Commit**: runs Validate from the "Safe publish" stepper
   (a distinct UI path from `ValidationPanel`'s own already-covered
   Validate button, same backend call `validateCurrentRepository`),
   confirms it unblocks Commit (the commit message input becomes
   enabled), enters a message, commits, and cross-checks via
   `local-git.ts` helpers: `getWorkingTreeStatus` becomes `"clean"`,
   `getHeadCommit` changes, `getCommitCount` increments by 1. The UI's
   own success signal (the commit form disappearing once
   `nothingToCommit` is true) is also observed.
2. **Add remote**: adds `origin` → `https://example.invalid/repository.git`
   (RFC 2606 reserved, guaranteed never to resolve) through the UI,
   waits for the `git-remote-add-success` banner, cross-checks
   `.git/config` via `getRemoteUrl()`. No network call is made anywhere
   in this flow.
3. **Push/Pull local error paths** (one flow): adds the same fake
   remote, clicks `git-stepper-push-btn`, waits for `git-push-error`;
   then clicks `git-stepper-pull-btn`, waits for `git-pull-error`. After
   each failure, cross-checks via helpers that `getHeadCommit`,
   `getCommitCount`, and the UI-displayed branch (via `getCurrentBranch`)
   are all unchanged from before the attempt. Finishes with an ordinary
   `closeRepository()` call to confirm the app is still fully usable
   after both failures.

All three tests build their fixtures exclusively via
`createLocalGitRepository` (no new repository-creation helper), use
`local-git.ts`'s inspection helpers for ground-truth verification rather
than raw filesystem inspection, and follow the teardown-robustness
pattern established in Stage 3F.1A's repair (an `opened` flag gating a
best-effort `closeRepositorySafely()` in `finally`, ahead of
`repo.cleanup()`). Per this stage's own instruction not to modify Stage
3F.1A, the small helper functions (`openRepositoryByPath`,
`closeRepository`, `closeRepositorySafely`, `getDisplayedBranch`,
`normalizeBranchText`) are duplicated spec-locally rather than promoted
to a shared module or backported into `git-detection-init.e2e.ts`.

## 5. Validation results

```
git diff --check                              PASS
node scripts/check-repo-hygiene.mjs           PASS (8/8)
node scripts/check-version-consistency.mjs    PASS
pnpm -C apps/desktop typecheck (tsc --noEmit)  PASS
pnpm -C apps/desktop test (vitest run)         PASS — 940/940, 57/57 files
  (939 → 940: +1 regression test for the writeMinimalRisFixture fix)
node scripts/run-wdio-e2e.mjs --spec git-local-workflows   CLEAN_PASS ×2
node scripts/run-wdio-e2e.mjs --spec git-detection-init    CLEAN_PASS ×1
  (Stage 3F.1A regression check — confirmed unaffected by the
  writeMinimalRisFixture fix, since it never triggers Validate)
node scripts/run-wdio-e2e.mjs --spec repository-lifecycle  CLEAN_PASS ×1
  (regression check — same RepositoryPanel.tsx open/close/reopen area)
cargo fmt/check/clippy                         not run — no Rust files changed
```

Ports 4444/4445 confirmed free before and after every WDIO run; no
leftover fixture directories or git/app/driver processes.

One diagnostic run was needed during development: the first
`git-local-workflows` attempt failed with "git-commit-message-input never
became enabled after Validate" — a temporary `browser.execute()` dump of
the stepper's step-meta text revealed "4 error(s) block the commit,"
which led directly to the `VAL-REPO-004` root cause above. The diagnostic
was removed before the final passing runs; it is not part of the
committed spec.

## 6. Coverage changes

| Status | Before (3F.1A) | After (3F.1B) |
|--------|------|------|
| COVERED | 62 | 65 |
| PARTIAL | 0 | 2 |
| NEEDS SELECTOR | 6 | 1 |
| NEEDS APPLICATION CHANGE | 2 | 2 |
| DEFERRED | 4 | 4 |
| NOT JUSTIFIED | 5 | 5 |
| **Total** | **79** | **79** |

- **Validate for publish, Commit with message, Add remote**: NEEDS
  SELECTOR → **COVERED**.
- **Push to remote, Pull from remote**: NEEDS SELECTOR → **PARTIAL** —
  local error-path only; a successful round-trip against a real
  reachable remote remains uncovered (Stage 3F.2). Marked `PARTIAL`
  rather than `COVERED` specifically to avoid claiming coverage that
  isn't actually implemented.
- Only **SSH passphrase prompt** remains NEEDS SELECTOR.

Coverage: 62/79 (78%) → **65/79 (82%)** (COVERED only; the 2 PARTIAL rows
are not counted toward this figure). Verified programmatically by
counting every status tag inside `docs/E2E_WDIO_COVERAGE_GAPS.md`'s
"## Coverage matrix" section only (excluding the legend and the Summary
counts table itself) — confirmed 79 rows both before and after this
stage's edits.

## 7. Risks

- The `writeMinimalRisFixture` fix changes the on-disk shape of every
  fixture `createLocalGitRepository` builds (four new empty directories)
  for any future stage relying on it — a strict correction (matches what
  the app itself produces), but worth flagging as a helper-behavior
  change, same category as Stage 3F.1A's `getCurrentBranch` fix.
- The Push/Pull error-path tests assert on a DNS-resolution-style failure
  against `example.invalid` (RFC 2606, guaranteed never to resolve).
  This is fast and deterministic in this environment; a sandboxed CI
  network configuration that resolves all hostnames (a "captive portal"
  DNS) could in principle turn this into a different kind of failure
  (e.g., a TLS/connection error rather than a resolution error) — the
  test only asserts that *an* error banner appears, not its exact text,
  so it should remain robust to this, but it is a latent environmental
  assumption worth noting.
- The Push/Pull selector-disambiguation decision (stepper-only) is now
  load-bearing for any future stage that wants to selectorize the Remote
  panel's identical pair — that stage will need its own scoped names
  (e.g. `git-remote-push-btn`), not `git-push-btn`, to avoid retroactively
  making this stage's `git-stepper-push-btn` ambiguous-by-association.

## 8. Remaining work for Stage 3F.2

Per `docs/E2E_WDIO_PLAN.md`'s Stage 3F.2 sketch: a genuine push/pull
round-trip against a real SSH-reachable remote, plus the SSH passphrase
prompt flow end to end. Two prerequisites already flagged by the Stage
3F.0 audit remain open: (1) a remote-fixture strategy decision (local SSH
daemon vs. disposable external target) — `validate_remote_url` rejects
local filesystem paths by design, so no fully local fixture is possible;
(2) `clone_repository_cmd`'s SSH-clone-askpass gap (no in-app prompt for
a passphrase-protected key on clone) is a genuine product gap, not a test
gap, and may need its own product decision before SSH clone coverage is
attempted. The "possible further split" noted in Stage 3F.0.5's docs
(a dedicated 3F.1.5 remote-fixture-infrastructure stage before 3F.2's
actual workflow specs, mirroring the 3F.0.5 → 3F.1 pattern) remains an
open suggestion for that stage's own NSP to confirm or reject.
