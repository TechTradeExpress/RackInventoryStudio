## Summary

Beta 4 Stage R1-R2: documentation-only repair correcting two remaining
release-process inconsistencies found in review, both in
`docs/BETA_RELEASE_PROCESS_EN.md`.

**Review finding 1 — top-level gate ordering contradicted the beta.4
bootstrap exception.** Step "C. WDIO release gate (mandatory...)" said,
unconditionally, "Do not proceed past this step until the WDIO release
gate has fully passed." That instruction is correct for future releases
once `master` already carries `wdio-e2e.yml`, but it is **not executable
for beta.4**: `wdio-e2e.yml` doesn't exist on `master` yet, so GitHub
manual `workflow_dispatch` is unavailable for it, and there is nothing to
wait for at that step. A maintainer following the document top-to-bottom
would have been stuck, only discovering later (in the separate bootstrap
section further down) that the earlier "stop here" instruction never
applied to this release. Corrected by branching step C explicitly: normal
releases wait for pre-merge WDIO here; beta.4 skips straight to installer
build and Windows QA, with an explicit forward pointer to the bootstrap
sequence, and an explicit "do not stop at this step for beta.4."

**Review finding 2 — `workflow_dispatch` was documented as accepting an
arbitrary commit SHA as its ref.** Step D said to "dispatch against that
exact commit SHA (GitHub Actions' 'Use workflow from' ref selector
accepts a specific SHA, not only a branch name)." Manual dispatch should
be documented against a **named ref** (branch or tag) — not a raw commit
SHA. Corrected model: dispatch using the release branch name
(`release/v0.1.0-beta.4`); the exact-commit guarantee comes from
**verifying the resulting workflow run's `head_sha`** afterward, not from
what was selected to trigger it. This only works because the release
branch is required to stay immutable after RC freeze — documented
explicitly: no further commits to the release branch after RC freeze
unless intentionally invalidating the candidate, in which case the
affected exact-SHA gates must be repeated.

**Also corrected (Finding 3): bootstrap tree-equality wording.** Two
places said the tree comparison between the RC freeze SHA and the merged
`master` SHA should be empty "modulo the merge itself" — ambiguous.
Corrected to state plainly that commit IDs always differ (merging creates
a new commit) while tree content must be **exactly** equal, with the
concrete check: `git rev-parse "<SHA>^{tree}"` compared for both commits,
plus `git diff --exit-code "$RC_FREEZE_SHA" "$MERGED_MASTER_SHA" -- .`
expected to exit 0.

Audited `docs/E2E_WDIO_PLAN.md`, `docs/releases/v0.1.0-beta.4.md`, and
`docs/BETA4_QA_RUNBOOK.md` for copied incorrect wording — none found; the
only file containing the actual incorrect process semantics was
`docs/BETA_RELEASE_PROCESS_EN.md` itself.

**No release gate was actually run in this stage.** No date was frozen,
no RC freeze commit was created, no installer was built, no Windows QA
was performed, no WDIO was dispatched, nothing was merged, tagged, or
published. No application, fixture, dependency, or workflow file changed.

## Corrected beta.4 gate order

```
Normal releases (beta.5+, once master carries wdio-e2e.yml):
  release preparation → RC freeze → ordinary static/PR CI
  → pre-merge WDIO against exact RC freeze SHA → installer build
  → Windows QA → merge to master → tag → GitHub Release

Beta.4 (one-time bootstrap exception):
  release preparation → RC freeze → ordinary static/PR CI
  → installer build → Windows QA
  → bootstrap merge to master, untagged
  → verify merged master tree == RC freeze tree (exact, not "modulo")
  → exact-master WDIO (app-smoke, representative, full matrix)
  → tag exact validated master SHA → GitHub prerelease
```

There is no pre-merge GitHub-hosted WDIO dispatch for beta.4. This is a
deferred gate caused by the one-time default-branch bootstrap constraint,
not a waived one.

## Corrected `workflow_dispatch` ref semantics

- Dispatch the installer workflow using the **release branch name**
  (`release/v0.1.0-beta.4`), never a raw commit SHA.
- **Precondition:** the release branch must not have moved past RC freeze
  — `origin/release/v0.1.0-beta.4` must still resolve to `RC_FREEZE_SHA`
  at dispatch time.
- **After the run completes, verify before trusting the artifact:**
  `workflow_run.head_branch == release/v0.1.0-beta.4` **and**
  `workflow_run.head_sha == RC_FREEZE_SHA`. If either fails, reject the
  artifact, determine why, and do not perform QA against it.
- This is the mechanism that makes branch-ref dispatch safe: the branch
  name alone is not proof of the exact commit; the run's own `head_sha`
  is the mandatory evidence.

## Release branch immutability after RC freeze

After the RC freeze commit, no further commits should land on
`release/v0.1.0-beta.4` unless intentionally invalidating the candidate.
Any post-freeze tracked-file change (including seemingly cosmetic ones)
creates a new release SHA, invalidates the old installer for the current
candidate, and requires every affected exact-SHA gate to be repeated.

## Bootstrap tree-equality rule

Commit IDs differ across the bootstrap merge by construction (a merge
commit is a new commit). What must be exactly equal is tree content:

```bash
test "$(git rev-parse "${RC_FREEZE_SHA}^{tree}")" = "$(git rev-parse "${MERGED_MASTER_SHA}^{tree}")"
git diff --exit-code "$RC_FREEZE_SHA" "$MERGED_MASTER_SHA" -- .   # expect exit 0
```

No extra master-side release-content change may appear during the merge.

## Files changed

- `docs/BETA_RELEASE_PROCESS_EN.md` — step C branched into normal-release
  vs. beta.4-bootstrap flows with an explicit "do not stop here for
  beta.4" forward pointer; step D rewritten to dispatch by branch name
  with mandatory post-run `head_sha` verification and explicit branch-
  immutability precondition; the "A.1 RC freeze" three-SHA explanation and
  the bootstrap-merge step both corrected from ambiguous "modulo the
  merge" wording to an exact tree-hash comparison.
- `.ai/cc-report.md` — this file.

No other tracked file required a change — `docs/E2E_WDIO_PLAN.md`,
`docs/releases/v0.1.0-beta.4.md`, and `docs/BETA4_QA_RUNBOOK.md` were
audited and found not to contain the incorrect process semantics being
corrected here. PR #172's body and remaining-gates checklist were updated
on GitHub (not a tracked repository file).

No application source file, fixture file, dependency file
(`Cargo.lock`/`pnpm-lock.yaml`), or workflow file changed. `CHANGELOG.md`
unchanged — no date assigned.

## Tests

No test code changed. No application/fixture behavior changed.

## Static validation

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm check:version` | ✓ still `0.1.0-beta.4`, unchanged |
| `pnpm check:hygiene` | ✓ 8/8 |
| `pnpm test:scripts` | ✓ 237/237 |
| `actionlint` | clean, no findings |

A full desktop/Cargo test run was not performed — correctly out of scope
for a docs-only repair with no code, dependency, or workflow file changes.

## Risks

- WDIO bootstrap gap remains structurally unresolved (unchanged) — a
  documentation repair cannot close it; it is closed only by actually
  performing the bootstrap merge and exact-`master` WDIO run in a later
  stage.
- Dependency-audit findings unchanged from Stage R1-R1 — not reviewed
  again in this stage since no dependency file changed.

## Not done

- Release date not chosen or frozen.
- No RC freeze commit created.
- Installer not built, Windows QA not performed, WDIO not dispatched,
  nothing merged, tagged, or published — all explicitly out of scope for
  this repair.

## Suggested next step

Beta 4 Stage R2: choose and freeze the release date (creating the RC
freeze commit), confirm the release branch matches it, then dispatch the
Windows installer workflow against the branch name and verify the run's
`head_sha` before proceeding to Windows 11 manual QA.
