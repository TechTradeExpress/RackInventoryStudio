## Summary

Stage 3F.1A per NSP, on `feature/e2e-stage-3f1a-local-git` →
`roadmap/e2e-wdio` (base = `roadmap/e2e-wdio` HEAD after PR #161/Stage 3F.0
and PR #162/Stage 3F.0.5 both merged — confirmed merged before branching).
**Status: COMPLETE.**

The first real Git *workflow* E2E coverage in the program (Stage 3F.0 was
audit-only, Stage 3F.0.5 was test-infrastructure-only). Scope: detection
of a repository with no `.git`, the "Initialize Git repository" action,
status refresh after init, detection persisting across a close/reopen
cycle, and idempotent detection for a repository that already has Git.
Explicitly excluded per the NSP: commit, add remote, push, pull, clone,
SSH, Docker, remote repositories — none touched.

**Pre-implementation audit (NSP §1), findings:**
- Stage 3F.0.5's helpers (`local-git.ts`) are present with all expected
  exports (`runGit`, `createLocalGitRepository`, `isGitRepository`,
  `getCurrentBranch`, `getWorkingTreeStatus`, etc.).
- `git log` shows zero commits touching
  `apps/desktop/src/features/repository/`,
  `apps/desktop/src-tauri/src/commands/{git,repository}.rs`, or
  `crates/ris-git/` between the Stage 3F.0 audit commit and this branch's
  point — the Git UI and backend are exactly as the Stage 3F.0 audit
  described. No documentation drift found.
- No `data-testid` existed anywhere in the git-related UI beyond the
  pre-existing `ssh-passphrase-input`.
- **New finding, made before writing the spec:** `create_repository_cmd`
  (`apps/desktop/src-tauri/src/commands/repository.rs`) always calls
  `ris_git::init_repository` itself right after scaffolding — confirmed
  by reading the command and by `repository-lifecycle.e2e.ts`'s own
  post-create `.git` assertion. This means a repository with genuinely no
  `.git` can only reach the app via "Open by path" against a fixture
  built outside the create wizard; `open_repository_cmd` (same file) was
  confirmed to never run git init as a side effect. This is why both new
  test cases build their fixture via `createLocalGitRepository` and open
  it by path, never via `createRepositoryThroughUi`.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/features/repository/RepositoryPanel.tsx` | +3 `data-testid`, detection/init scope only: `git-not-initialized` (wraps the "not tracked by Git" state's content), `git-init-btn` (the Initialize button), `git-branch-value` (the branch `<dd>` in the Git sidebar — rendered only once `gitStatus.is_repository` is true, so its appearance is itself the "status refreshed" signal). No selector added for validate/commit/add-remote/push/pull. The existing `aria-label="Refresh Git status"` was left as-is and not used — the app's automatic refresh after init/reopen made an explicit manual refresh unnecessary for this stage's assertions. |
| `apps/desktop/e2e-wdio/specs/git-detection-init.e2e.ts` | New — 2 `it()`s (see "Tests" below) |
| `apps/desktop/e2e-wdio/support/local-git.ts` | `getCurrentBranch` fixed: `git rev-parse --abbrev-ref HEAD` → `git symbolic-ref --short HEAD` (see "Helper fix" below) |
| `apps/desktop/e2e-wdio/support/local-git.test.ts` | +1 regression test for the fix above |
| `docs/E2E_WDIO_PLAN.md` | New "Stage 3F.1A" section (COMPLETE); old "Stage 3F.1" sketch renamed "Stage 3F.1B" with Git init removed from its bullet list; Program status table and Future-stages coverage figure updated |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | "Git init (convert non-git directory)" row moved NEEDS SELECTOR → COVERED; selector-coverage note updated; Summary counts recomputed |
| `.ai/cc-report.md` | This report |

No other application code, and no Rust code, was changed.

## Repair pass (review findings on PR #163)

Two blocking findings from review were addressed on this same branch/PR,
repair-only — no new workflow coverage, no Stage 3F.1B work:

1. **Teardown robustness.** Both `it()`s previously called
   `closeRepository()` only on the success path; a `finally` with only
   `repo.cleanup()` could delete the fixture directory while the app
   still had it open. Fixed: both tests now track an `opened` boolean,
   updated at each point the repository is actually opened/closed, and
   `finally` calls a new `closeRepositorySafely()` (catches and logs
   internally, never throws — so it cannot mask the original assertion
   failure) only `if (opened)`, before `repo.cleanup()`. `cleanup()`
   itself is unwrapped, matching Stage 3F.0.5's own design (idempotent,
   safe) and the reviewer's own example.
2. **Real branch verification.** The PR's original description claimed
   the UI-displayed branch was cross-checked against `getCurrentBranch()`
   — the code did not actually do this; it only asserted
   `branchAfterInit.length > 0`. Fixed: a new `getDisplayedBranch()`
   helper reads `git-branch-value`'s actual text via `.getText()`, and a
   `normalizeBranchText()` helper collapses whitespace before comparing
   (the element also renders an `IcGitBranch` SVG icon with no text
   content ahead of the branch name, so no prefix-stripping was needed —
   whitespace-collapsing was the only normalization actually required).
   Both PART B (immediately after init) and PART C (after reopen) now
   assert `displayedBranch === normalizeBranchText(getCurrentBranch())`
   exactly, not merely that the element exists.

**Non-blocking cleanup also applied:** removed the redundant
`existsSync(join(repo.path, ".git"))` check in PART B — `isGitRepository()`
already covers the same fact via the stronger, helper-based check, so the
raw filesystem check added no value. This let the `node:fs`/`node:path`
imports be dropped from the spec file entirely.

The "Tests" and "Risks" sections below have been corrected to describe
what the tests actually assert, superseding the pre-repair descriptions
that shipped in the initial PR.

**Helper fix (Stage 3F.0.5's own code, not application code) — the one
modification to an existing helper, made because it was necessary:**
`getCurrentBranch()` used `git rev-parse --abbrev-ref HEAD`, which fails
(exit 128, "ambiguous argument 'HEAD'") on an **unborn HEAD** — a freshly
`git init`'d repository with no commit yet. This is exactly the state
this stage's own init spec needs to inspect, since the app itself shows a
real branch name immediately after init (before any commit), by reading
`git status --porcelain=v1 --branch`'s "No commits yet on `<branch>`"
line (`parse_branch_line` in `crates/ris-git/src/lib.rs`). Fixed to use
`git symbolic-ref --short HEAD`, which resolves correctly both before and
after the first commit. A regression test
(`getCurrentBranch resolves on an unborn HEAD`) was added.

## Tests

**Scenarios delivered** (`git-detection-init.e2e.ts`, 2 `it()`s):
1. **Detection → Init → Status refresh → Persistence across reopen** (one
   flow, matching the NSP's scenarios 1–3): open a fixture with no `.git`
   → `git-not-initialized` shown, `git-branch-value` absent; click
   `git-init-btn` → `.git` now exists on disk (verified via
   `isGitRepository`) and the branch text actually displayed by
   `git-branch-value` equals `getCurrentBranch()`'s return value
   (normalized, exact string equality — not just "an element exists");
   close and reopen the same repository by path → detection still holds
   and the same exact-equality branch check is repeated post-reopen
   (`git-not-initialized` remains absent).
2. **Idempotency** (NSP scenario 4): open a fixture that already has Git
   → `git-branch-value` appears directly; `git-not-initialized` and
   `git-init-btn` are never shown. Describes the application's actual
   current behavior (the init affordance only renders while
   `is_repository` is false) — no product behavior was changed. (This
   test does not re-verify the exact branch text — the review's real-
   branch-verification finding scoped that to "after initialization" and
   "after reopening", neither of which this test performs.)

Both fixtures were built exclusively via `createLocalGitRepository`
(Stage 3F.0.5's helper); no new repository-creation helper was added, and
no raw git command was run directly in the spec where a 3F.0.5 helper
already covered the need. Teardown in both tests is now robust to a
mid-test assertion failure: an `opened` flag gates a best-effort
`closeRepositorySafely()` call in `finally`, ahead of `repo.cleanup()`
(see "Repair pass" above).

```
git diff --check                              PASS
node scripts/check-repo-hygiene.mjs           PASS (8/8)
node scripts/check-version-consistency.mjs    PASS
pnpm -C apps/desktop typecheck (tsc --noEmit)  PASS
pnpm -C apps/desktop test (vitest run)         PASS — 939/939, 57/57 files
  (938 → 939: +1 regression test for the getCurrentBranch fix)
node scripts/run-wdio-e2e.mjs --spec git-detection-init   CLEAN_PASS ×2
node scripts/run-wdio-e2e.mjs --spec repository-lifecycle CLEAN_PASS ×1
  (regression check — closest existing spec touching the same
  RepositoryPanel.tsx open/close/reopen UI area; confirmed unaffected by
  the new data-testid attributes)
cargo fmt/check/clippy                         not run — no Rust files changed
```

Ports 4444/4445 confirmed free before and after every WDIO run; no
leftover fixture directories or git/app/driver processes.

## Coverage

| Status | Before (3F.0.5) | After (3F.1A) |
|--------|------|------|
| COVERED | 61 | 62 |
| NEEDS SELECTOR | 7 | 6 |
| NEEDS APPLICATION CHANGE | 2 | 2 |
| DEFERRED | 4 | 4 |
| NOT JUSTIFIED | 5 | 5 |
| **Total** | **79** | **79** |

Coverage: 61/79 (77%) → **62/79 (78%)**. Verified programmatically by
counting every status tag inside `docs/E2E_WDIO_COVERAGE_GAPS.md`'s
"## Coverage matrix" section only (excluding the legend and the Summary
counts table itself) — confirmed 79 rows both before and after. Exactly
one row changed status ("Git init"); commit/add-remote/push/pull/SSH
statuses were not touched, per the NSP's own scope boundary.

## Risks

- The `getCurrentBranch` fix changes the underlying git invocation for
  any future stage relying on that helper; both forms resolve to the
  same branch name in every case tested, and `symbolic-ref` additionally
  handles the unborn-HEAD case `rev-parse --abbrev-ref` cannot — a strict
  improvement, but worth flagging as a helper-behavior change.
- `git-branch-value`'s "status refreshed" signal is inferred from its
  mere presence (only rendered once `is_repository` is true) combined
  with an exact-equality comparison against `getCurrentBranch()`'s return
  value, rather than from observing a literal before/after DOM
  transition — sufficient for this stage's scope, and now a genuine
  content check rather than a presence-only check (fixed in the repair
  pass above).
- The idempotency test validates UI-level behavior (the init affordance
  never renders once Git is detected) rather than exercising the backend
  `init_git_repository` command directly against an already-git
  repository — matches the NSP's "poprawna obsługa przez UI, zgodnie z
  aktualnym zachowaniem" framing; the backend command's own behavior in
  that case remains unasserted by E2E, since the UI makes it unreachable
  without bypassing the UI (out of scope).

## Not done

- No commit, add-remote, push, pull, clone, SSH, or Docker coverage — out
  of scope per this stage's own NSP.
- No new shared helper — both `it()`s use `createLocalGitRepository`
  directly; a small spec-local `openRepositoryByPath`/`closeRepository`
  pair lives inside the spec file itself (not promoted to `support/`),
  per the "don't add helpers ahead of need" instruction.
- The duplicate Push/Pull button disambiguation decision (flagged since
  Stage 3F.0's audit) — correctly deferred to Stage 3F.1B's own NSP.

## Suggested next step

Human review of this PR. Once accepted, open a dedicated NSP for Stage
3F.1B covering validate/commit/add-remote/push-pull-error-paths, starting
with the Push/Pull selector-disambiguation decision the Stage 3F.0 audit
already flagged (the two simultaneous button pairs — stepper vs. Remote
panel — need a scoped `data-testid` scheme before either can be
selectorized unambiguously).
