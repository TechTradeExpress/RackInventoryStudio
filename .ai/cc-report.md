## Summary

Beta 4 Stage R1-R3: documentation-only repair correcting the last
remaining release-process inconsistency in `docs/BETA_RELEASE_PROCESS_EN.md`
— the normal (beta.5+) release flow incorrectly implied that the pre-merge
RC freeze commit is the same commit that ends up tagged.

**The defect.** Several passages said, in substance, that WDIO "must run
against the exact commit that will be tagged" and that "the exact commit
tested must be the exact commit tagged." For a normal release that goes
through a merge commit, this is impossible: if `RC_FREEZE_SHA` (`A`) is
validated pre-merge, and the release branch is then merged into `master`
producing a new commit `B`, then `A != B` as commit IDs by construction —
merging always creates a new commit. The tag is placed on `B`, never on
`A`. What the process actually relies on is `tree(A) == tree(B)` (the
merge introduces no last-minute content drift), not `A == B`.

**Corrected model**, made explicit throughout the WDIO release-gate
section:

```
Normal flow (beta.5+, once wdio-e2e.yml is already on master):
  RC_FREEZE_SHA (A) → pre-merge WDIO on A → installer/QA from A
  → merge → MERGED_MASTER_SHA (B), B != A as a commit ID
  → verify tree(A) == tree(B)
  → TAG_SHA == B (never A)

Beta.4 (one-time bootstrap — unchanged, still stricter):
  RC_FREEZE_SHA (A) → installer/QA from A
  → bootstrap merge → MERGED_MASTER_SHA (B)
  → verify tree(A) == tree(B)
  → exact-master WDIO directly on B (no pre-merge WDIO exists for beta.4)
  → TAG_SHA == B == POSTMERGE_WDIO_SHA
```

Also added: a "Reuse policy" paragraph stating explicitly that pre-merge
WDIO results may be reused for release approval once `tree(A) == tree(B)`
is confirmed — a **tree-equivalence** reuse, not a same-commit-ID reuse —
and that the merge commit must never be described as "the exact same
commit" as the one validated.

The beta.4 bootstrap procedure itself (untouched, verified unchanged):
still requires the post-merge exact-`master` WDIO run's result to gate the
tag directly, with no pre-merge reuse step of its own — this is stricter
than the corrected normal flow, and this repair did not weaken or
generalize it.

**No release gate was executed in this stage.** No date was chosen, no RC
freeze commit was created, no installer was built, no Windows QA was
performed, no WDIO was dispatched, nothing was merged, tagged, or
published. No application, fixture, dependency, or workflow file changed.

## RC Freeze SHA semantics

`RC_FREEZE_SHA` is the pre-merge, validated release-branch commit (release
date + final release-facing docs already committed — see "A.1 RC freeze").
For a normal release it is what pre-merge WDIO, the installer build, and
Windows QA all validate. It is never the commit the tag points at once a
merge commit is created.

## Merged Master SHA semantics

`MERGED_MASTER_SHA` is the merge commit created when the validated release
branch lands on `master`. Always a different commit ID from
`RC_FREEZE_SHA` — merging creates a new commit regardless of whether the
tree content changed. Required to have identical tree content to
`RC_FREEZE_SHA` before pre-merge validation is treated as still applying.

## Tag SHA semantics

`TAG_SHA` is the commit the release tag actually references.
Normal flow: `TAG_SHA == MERGED_MASTER_SHA`, never `RC_FREEZE_SHA`.
Beta.4: `TAG_SHA == MERGED_MASTER_SHA == POSTMERGE_WDIO_SHA` (WDIO itself
runs directly on the tagged commit, since beta.4 has no pre-merge WDIO
step at all).

## Files changed

- `docs/BETA_RELEASE_PROCESS_EN.md` — corrected the top-level step-C
  pre-merge WDIO description; replaced the "Procedure (run against the
  exact commit to be tagged)" heading with a neutral one that explains why
  the old phrasing doesn't hold for the normal flow; added an explicit SHA
  taxonomy (`RC_FREEZE_SHA`/`MERGED_MASTER_SHA`/`TAG_SHA`, normal vs.
  beta.4 relationships); split "Pass criteria" into pre-merge exact-SHA
  validation, merge continuity (exact tree-hash check), tag continuity,
  and an explicit tree-equivalence reuse policy (replacing the previous
  same-commit-ID reuse wording). The beta.4 bootstrap section itself was
  left untouched — verified it already correctly requires the stricter
  post-merge exact-`master` WDIO result to gate the tag.
- `.ai/cc-report.md` — this file.

The direct quote of `docs/E2E_WDIO_PLAN.md`'s policy text ("Full WDIO must
run against the exact release commit...") was reviewed and left
unchanged — it is a generic mandate, not a specific claim equating the RC
freeze commit ID with the later tagged merge commit ID.

No application source file, fixture file, dependency file
(`Cargo.lock`/`pnpm-lock.yaml`), or workflow file changed. `CHANGELOG.md`,
`docs/releases/v0.1.0-beta.4.md`, and `docs/BETA4_QA_RUNBOOK.md` were not
touched — no incorrect wording of this kind was found in them.

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

- None newly introduced. The WDIO bootstrap gap itself remains structurally
  unresolved (unchanged) — a documentation repair cannot close it.
- Dependency-audit findings unchanged from prior review — not re-reviewed
  in this stage since no dependency file changed.

## Not done

- No release date chosen or frozen, no RC freeze commit created.
- Installer not built, Windows QA not performed, WDIO not dispatched,
  nothing merged, tagged, or published — all explicitly out of scope for
  this repair.

## Suggested next step

Beta 4 Stage R2: choose and freeze the release date (creating
`RC_FREEZE_SHA`), confirm the release branch matches it, then dispatch the
Windows installer workflow against the branch name and verify the run's
`head_sha` before Windows 11 manual QA.
