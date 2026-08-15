# Beta Release Process

This is the single source of truth for preparing, validating, and distributing a
beta release of Rack Inventory Studio. (`docs/release.md`, a shorter beta.1-era
cheat-sheet that duplicated and drifted from this document, has been archived —
see [`archive/release.md`](archive/release.md).)

---

## Purpose

Beta releases are unsigned Windows installers built from release branches for
internal QA and stakeholder testing. They are not published to end-users and do
not go through a code-signing workflow.

**Platform scope:** Windows x64 only. Linux packaging is explicitly deferred to
a future milestone; macOS packaging is not planned for the near term.

---

## Branch policy

```
feature/*
  ↓
roadmap/*
  ↓
development
  ↓
release/*
  ↓
master
  ↓
GitHub Release
```

- `development` is the integration branch. It receives completed `feature/*`
  work directly and completed `roadmap/*` programs after whole-program review
  (see `CLAUDE.md`).
- **A release branch is always cut from `development`, never from `master`.**
  `master` only ever advances by merging a `release/*` branch after release
  validation passes — it is not an independent line of development. (This
  matters in practice: after BRSP Stage B3, `development` and `master`
  diverged for the first time in this project's history — `development` was
  37 commits ahead. Cutting a release branch from `master` at that point
  would have silently omitted the entire E2E/WDIO program. Always check
  `git log --oneline origin/master..origin/development` before cutting a
  release branch — if it is non-empty, cut from `development`.)
- `release/*` branches only take release-specific fixes, never new features.
- The Windows installer is always built from the release branch or its exact
  tag — never from an arbitrary feature branch.

### Canonical version sources

The version is stored in **four files** that must always agree:

| File | Field |
|---|---|
| `package.json` (workspace root) | `"version"` |
| `apps/desktop/package.json` | `"version"` |
| `apps/desktop/src-tauri/Cargo.toml` | `version = "..."` (under `[package]`) |
| `apps/desktop/src-tauri/tauri.conf.json` | `"version"` |

Run `pnpm check:version` (or `node scripts/check-version-consistency.mjs`) at
any time to verify all four are in sync, plus Node toolchain consistency
across `.nvmrc`, `package.json engines.node`, and every workflow's
`node-version`. CI enforces this on every push and pull request
(`ci.yml`'s `version-check` job).

### Pre-release tags

```
v0.1.0-beta.1   ← first beta candidate (shipped 2026-05-27)
v0.1.0-beta.2   ← second candidate (shipped 2026-06-12)
v0.1.0-beta.3   ← prepared as a release candidate, never tagged or published
                  (superseded — see docs/releases/v0.1.0-beta.3.md)
v0.1.0-beta.4   ← current candidate (in preparation) — succeeds beta.3,
                  contains the full beta.2..beta.4 delta
v0.1.0          ← final (stable) release
```

Only remove the pre-release suffix when the build is QA-passed and ready for
broad distribution.

---

## Version bump helper

A helper script updates all four canonical version sources atomically:

```bash
node scripts/bump-version.mjs 0.1.0-beta.4
```

Or via the package script:

```bash
pnpm bump:version 0.1.0-beta.4
```

The script validates the version format, prints a before/after table, writes
all four files, and exits with a reminder to run the consistency check. It
does **not** commit automatically. Verify after running:

```bash
pnpm check:version
```

---

## Release workflow — step by step

### A. Prepare release branch

```bash
# 1. Ensure local development is up to date
git checkout development
git pull

# 2. Confirm master has nothing development lacks (sanity check, not expected to find anything)
git log --oneline origin/master..origin/development | tail -5

# 3. Cut release branch from development
git checkout -b release/v0.1.0-beta.4

# 4. Bump version
node scripts/bump-version.mjs 0.1.0-beta.4
pnpm check:version

# 5. Commit version bump and changelog reconciliation
git add package.json apps/desktop/package.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/tauri.conf.json \
  CHANGELOG.md
git commit -m "chore(release): prepare v0.1.0-beta.4"
```

**Do not assign the final calendar release date to the `CHANGELOG.md`
heading at this step.** Leave the section as `## vX.Y.Z — Unreleased`
through this preparation phase — version bump, changelog composition,
release-note drafting, QA runbook preparation, dependency review, ordinary
static CI. No immutable release-candidate claim exists yet at this point,
and this commit's SHA is expected to keep moving as preparation continues.

### A.1 RC freeze — before any release-candidate artifact is built

The release date, and any other release-facing tracked-documentation
content that needs to be final before validation, is committed **once**,
in its own step, immediately before the first release-candidate artifact
(the Windows installer) is built — not "immediately before tagging."

1. Choose the intended release date.
2. Write that date into every release-facing tracked document that needs
   it (the `CHANGELOG.md` heading, `docs/releases/vX.Y.Z.md`, and any other
   file whose content is meant to ship with the release).
3. Commit those changes.
4. That resulting commit is the **RC freeze SHA**.

```bash
# Example — do not run until the release date is actually being chosen
git add CHANGELOG.md docs/releases/v0.1.0-beta.4.md
git commit -m "docs(release): freeze v0.1.0-beta.4 release date"
git rev-parse HEAD   # this is the RC freeze SHA
```

**The release date is frozen before the release-candidate validation cycle
begins.** The commit containing the final date and release documentation
becomes the RC freeze SHA. The Windows installer and all subsequent
exact-SHA release gates (step D onward, the WDIO release gate) must use
that frozen commit. **Any tracked-file change after RC freeze creates a
new candidate SHA and invalidates any exact-SHA validation that applied to
the previous commit** — there is no way to add the date, or make any other
tracked-content change, after installer/QA/WDIO validation without
invalidating that validation. This includes seemingly cosmetic changes:
release date, changelog punctuation, release-note wording, version
metadata, or any other documentation attached to the tagged tree. If the
release candidate needs to change after RC freeze, treat it as an
intentional invalidation: make the change, and repeat every exact-SHA gate
that depended on the old commit.

**Three distinct SHAs matter across this process, and they are not
interchangeable:**

- **Preparation SHA** — the branch tip during step A, before RC freeze.
  Expected to still move.
- **RC freeze SHA** — the commit from step A.1. Final tracked release
  content for every pre-merge, exact-SHA validation gate (installer build,
  Windows QA, and any pre-merge WDIO dispatch once available).
- **Merged `master` SHA** — the commit created by the bootstrap merge (or,
  in the normal post-bootstrap flow, an ordinary merge) of the validated
  release branch into `master`. This is a **new** commit — merging creates
  a merge commit, so the merged `master` SHA **always** differs from the
  RC freeze SHA as a commit ID, even when the release branch's tree
  content is unchanged by the merge. **Do not require the merged `master`
  commit ID to equal the RC freeze commit ID** — that can never hold once
  a merge commit exists. Commit IDs differ; **tree content must be exactly
  equal**:
  ```bash
  test "$(git rev-parse "${RC_FREEZE_SHA}^{tree}")" = "$(git rev-parse "${MERGED_MASTER_SHA}^{tree}")"
  git diff --exit-code "$RC_FREEZE_SHA" "$MERGED_MASTER_SHA" -- .   # expect exit 0
  ```
  before treating pre-merge validation as still applying. The exact-`master`
  WDIO gate and the eventual tag both target this merged `master` SHA, not
  the RC freeze SHA.

### B. Validate (fast checks)

```bash
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
pnpm --filter @rack-inventory-studio/desktop typecheck
pnpm --filter @rack-inventory-studio/desktop test
pnpm --filter @rack-inventory-studio/desktop build
node scripts/check-version-consistency.mjs
node scripts/check-repo-hygiene.mjs
node --test scripts/*.test.mjs
git diff --check
```

Push the release branch and open a PR to `master`. Wait for all CI checks
(`ci.yml`'s five jobs, including `Workflow lint` / `actionlint`) to pass
before proceeding to the WDIO gate.

### C. WDIO release gate (mandatory, see full section below)

**This step's ordering depends on whether `wdio-e2e.yml` already exists on
`master`.** Check which flow applies before proceeding — do not assume the
"stop here" instruction below is executable; see
["WDIO release gate"](#wdio-release-gate) below for the complete
procedure either way.

**Normal releases (once `master` already carries `wdio-e2e.yml`):** do not
proceed past this step until the WDIO release gate has fully passed
against the exact **RC freeze SHA**, before merge. Installer build and
Windows QA (steps D/E) follow only after WDIO is green. After the release
branch is later merged to `master`, verify that the merged `master` tree
is exactly equal to the validated RC freeze tree (see "Merge continuity"
in the WDIO section below) — the release tag is created on that merged
`master` commit, not on the pre-merge RC freeze commit itself; the two are
different commit IDs by construction (merging creates a new commit) even
though their tree content matches.

**Beta.4 — the one-time bootstrap exception:** `wdio-e2e.yml` is not yet
present on `master`, so the GitHub-hosted WDIO gate **cannot** be
dispatched pre-merge — there is nothing to wait for at this step. This is
not a waived gate, it is a deferred one: for beta.4 only, skip straight
from here to **step D (Build installer)** and **step E (Windows QA)**,
then perform the documented untagged bootstrap merge, and only then run
the full exact-`master` WDIO gate before any tag — see "One-time beta.4
WDIO bootstrap exception" below for the complete beta.4 sequence. Do not
stop at this step for beta.4.

### D. Build installer

Manual `workflow_dispatch` must be run against a **named ref (branch or
tag)** — do not dispatch against a raw commit SHA; GitHub Actions'
"Use workflow from" selector is documented and intended for branches and
tags, not arbitrary commit SHAs. The exact-commit guarantee instead comes
from **verifying the resulting run's `head_sha`** after the fact, not from
what ref you selected to trigger it.

**Precondition: the release branch must not have moved past RC freeze.**
After "A.1 RC freeze" above, do not push another commit to
`release/v0.1.0-beta.4` unless intentionally invalidating the candidate —
any post-freeze tracked-file change creates a new release SHA, which
makes the old installer invalid for the current candidate and requires
every affected exact-SHA gate to be repeated. This branch-immutability
rule is what makes dispatching by branch name safe: as long as the branch
hasn't moved, dispatching against it and dispatching against the RC
freeze SHA are the same thing, and the run's own `head_sha` proves it
after the fact.

1. Record the RC freeze SHA once, right after creating it:
   ```bash
   RC_FREEZE_SHA=$(git rev-parse HEAD)
   ```
2. Confirm the release branch still resolves to it before dispatching:
   ```bash
   test "$(git rev-parse origin/release/v0.1.0-beta.4)" = "$RC_FREEZE_SHA"
   ```
3. Go to **GitHub Actions → Windows Installer → Run workflow**, select
   **`release/v0.1.0-beta.4`** (the branch, not a SHA) as the ref, and
   click **Run workflow**.
4. Wait for completion (typically 15–25 minutes on a cold Rust cache; 5–10
   minutes warm).
5. **Verify the run before trusting its artifact** — retrieve the
   workflow run's metadata (e.g. `gh run view <run-id> --json
   headBranch,headSha`) and require both:
   ```text
   workflow_run.head_branch = release/v0.1.0-beta.4
   workflow_run.head_sha    = RC_FREEZE_SHA
   ```
   If either does not hold — the branch moved, or the wrong run was
   selected — **reject the artifact**, determine why, and do not perform
   QA against it.
6. Only once step 5's verification passes: open the run → **Artifacts** →
   download `rack-inventory-studio-vX.Y.Z-windows-installer.zip`.
7. Extract and confirm `Rack Inventory Studio_X.Y.Z_x64-setup.exe` is present.

Installer path enforced by the app: `C:\Program Files\TechTradeExpress\RackInventoryStudio\`,
via the custom NSIS template at `apps/desktop/src-tauri/nsis/main.nsi`.

### E. Windows 11 QA

Install the unsigned NSIS installer on a clean Windows 11 machine:

- Accept the SmartScreen warning: "More info → Run anyway" — **expected for
  unsigned builds**.
- Verify the app installs to the path above.
- Run the full checklist in [`BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md),
  the beta.3-scope feature checklist in
  [`BETA3_QA_RUNBOOK.md`](BETA3_QA_RUNBOOK.md) (still the correct feature
  checklist — beta.4 carries the full beta.3 scope), and the beta.4-specific
  overlay in [`BETA4_QA_RUNBOOK.md`](BETA4_QA_RUNBOOK.md) (install/upgrade,
  version string, and the clone-responsiveness regression check).

Minimum smoke tests before publishing:

- [ ] Installer runs; app launches without error dialogs.
- [ ] Open or create a repository successfully.
- [ ] Validate repository, save changes, CSV import preview (Devices and
      Device Models) all complete without error.
- [ ] Settings → Diagnostics and logs → Open logs folder works.
- [ ] No crash on normal close.

### F. Merge, tag, and GitHub Release

After Windows QA and the WDIO gate both pass — **for beta.4 specifically,
see "One-time beta.4 WDIO bootstrap exception" below before merging**; the
normal ordering (WDIO gate fully passes pre-merge, then merge, then tag) is
not available for this one release because `wdio-e2e.yml` does not yet
exist on `master`.

For a normal release cycle (beta.5 and later, once the bootstrap exception
below no longer applies):

1. Merge the `release/*` PR into `master` (this is the only way `master`
   advances — see "Branch policy" above).
2. Tag the merge commit on `master`:
   ```bash
   git checkout master && git pull
   git tag -a v0.1.0-beta.5 -m "Beta 0.1.0 candidate 5 — QA passed"
   git push origin v0.1.0-beta.5
   ```
3. Create a GitHub Release manually:
   1. Go to **GitHub → Releases → Draft a new release**.
   2. Select the tag `v0.1.0-beta.5`.
   3. Title: `Rack Inventory Studio v0.1.0-beta.5`.
   4. Body: copy from `docs/releases/v0.1.0-beta.5.md`.
   5. Attach the `rack-inventory-studio-v0.1.0-beta.5-windows-installer.zip`
      artifact.
   6. Check **Set as a pre-release**.
   7. Publish.

### Windows artifacts produced

| Artifact name | Contents |
|---|---|
| `rack-inventory-studio-vX.Y.Z-windows-installer` | `Rack Inventory Studio_X.Y.Z_x64-setup.exe` |

Retained for **30 days** on the GitHub Actions run summary page
(`windows-installer.yml`'s `retention-days: 30`).

---

## CHANGELOG workflow

- `## Unreleased` at the top of `CHANGELOG.md` accumulates entries for work
  merged to `development` after the most recent version heading.
- When a release branch is cut (step A above), the entries that belong to
  that release should already be organized under their own
  `## vX.Y.Z — Unreleased` heading (prepared ahead of time as part of
  release preparation — do not wait until the release branch to write these).
- **The heading keeps saying `— Unreleased` through the preparation phase
  only** (release branch cut, version bump, ordinary static validation, PR
  opened as draft). It is not left that way through validation — see "A.1
  RC freeze" above. The date is filled in, and `Unreleased` dropped from
  the title, exactly once, in its own dedicated RC-freeze commit, **before**
  the installer is built and before any exact-SHA gate (Windows QA, WDIO)
  runs against this release. That RC-freeze commit is what every exact-SHA
  gate from then on validates. There is no way to add the date "without
  changing the SHA" — adding it is itself the tracked-file change that
  defines the RC freeze SHA; the model does not try to avoid creating a new
  SHA, it just makes sure that SHA is created *before* the exact-SHA gates
  run, not after, so nothing already-validated is invalidated by it.
- Never mix two releases' worth of changes under one heading. If
  `## Unreleased` (the top, pre-release-branch section) has accumulated
  content spanning more than the upcoming release, split it before cutting
  the release branch, not after.
- A release-candidate section may itself absorb an earlier abandoned
  candidate's prepared content (as beta.4's did with beta.3's — see
  `docs/releases/v0.1.0-beta.3.md`) rather than ever publishing that
  earlier candidate as its own shipped-version heading.

---

## WDIO release gate

Full desktop E2E (WebdriverIO) validation is mandatory before any release —
see `docs/E2E_WDIO_PLAN.md`'s "Desktop E2E execution policy → Release
validation": *"Full WDIO must run against the exact release commit; Windows
validation is mandatory."* This section is the concrete procedure for that
requirement, using the `wdio-e2e.yml` GitHub Actions workflow
(`workflow_dispatch`, see `docs/CI.md`).

**Current limitation, stated plainly:** `wdio-e2e.yml` only runs on
`ubuntu-24.04` today — there is no Windows WDIO CI job yet, even though
Windows is the primary distributed platform and the policy above calls
Windows validation mandatory. Until a Windows WDIO job exists, "Windows
validation" for this gate means the manual Windows 11 QA pass (step E above),
not an automated WDIO run. This gap is tracked, not hidden.

**Also note:** `wdio-e2e.yml` can only be dispatched once its workflow file
exists on the repository's default branch (`master`) — a GitHub platform
requirement, not a choice. Until a `release/*` branch has been merged to
`master` at least once, this gate cannot actually be executed; see
`docs/CI.md` and `.ai/BRSP_B2_5_CI_VALIDATION_REPORT.md` for the full history
of this constraint.

### One-time beta.4 WDIO bootstrap exception

**Current state, as of beta.4 preparation:** `.github/workflows/wdio-e2e.yml`
exists on `development` and on `release/v0.1.0-beta.4`, but **not on
`master`**. GitHub requires a `workflow_dispatch` workflow to exist on a
repository's default branch before it can be manually dispatched at all —
so the normal pre-merge flow ("dispatch WDIO against the release branch,
confirm it passes, then merge, then tag") is not available for beta.4. No
release branch has ever been merged to `master` with this workflow present
before now.

This is a **one-time bootstrap problem**, not a decision to skip the gate.
It is not solved by pushing `wdio-e2e.yml` to `master` directly (that would
be an untested, unreviewed change landing on the default branch outside the
normal release flow), by a standalone bootstrap commit, by silently
skipping WDIO for this release, or by treating earlier feature-branch WDIO
evidence (e.g. Stage 3F.5.7's real-Windows-host validation, recorded in
`docs/E2E_WDIO_PLAN.md`) as a substitute for this release's own gate.

**Required procedure, beta.4 only:**

1. **Before merging the beta.4 release PR**, complete every other pre-merge
   gate against the RC freeze SHA (see "A.1 RC freeze" above): normal
   release PR CI, the Windows installer build from that exact commit,
   Windows 11 manual QA using that installer
   (`BETA_WINDOWS_11_QA_EN.md` + `BETA3_QA_RUNBOOK.md` +
   `BETA4_QA_RUNBOOK.md`), and any further local Windows release-candidate
   checks defined by the next release stage. The release PR remains
   **untagged** throughout.
2. **Bootstrap merge.** Only once every pre-merge gate above except GitHub
   WDIO is green: merge the beta.4 release PR into `master`. Do not tag. Do
   not publish. This merge creates a new commit — the merged `master`
   commit ID will **not**, and is not expected to, equal the RC freeze
   SHA. Commit IDs differ; **tree content must be exactly equal**:
   ```bash
   test "$(git rev-parse "${RC_FREEZE_SHA}^{tree}")" = "$(git rev-parse "${MERGED_MASTER_SHA}^{tree}")"
   git diff --exit-code "$RC_FREEZE_SHA" "$MERGED_MASTER_SHA" -- .   # expect exit 0
   ```
   before treating pre-merge validation as still applying — no extra
   master-side release-content change may appear during the merge. At this
   point `master` gains `.github/workflows/wdio-e2e.yml` for the first
   time.
3. **Post-merge exact-master WDIO gate.** Immediately dispatch the full
   mandatory sequence from the "Procedure" section below (`app-smoke`,
   representative specs, full `all` matrix) against the **exact current
   `master` commit** (the merge commit from step 2). Record the `master`
   SHA, every workflow run ID, every result, and artifact references in the
   release tracking documentation.
4. **No tag until the full matrix succeeds** against that exact `master`
   commit. This is the same pass criteria as any other release — nothing
   about the bootstrap shortcuts it.
5. **If WDIO fails after the bootstrap merge:** beta.4 remains unpublished
   — no tag, no GitHub Release. Diagnose the failure, fix it through a new,
   separate, reviewable release-repair PR (never a direct `master` push),
   rerun any release gates the fix touches, and rerun the exact-`master`
   WDIO sequence against the new merge commit. Never tag a failing
   bootstrap merge, and never tag a commit whose WDIO run doesn't match the
   commit being tagged.

**This exception expires after beta.4.** Once `master` carries
`wdio-e2e.yml` (from the bootstrap merge above), beta.5 and every
subsequent release return to the normal flow described in this document:
release branch → PR CI → `workflow_dispatch` WDIO against the exact release
ref (pre-merge) → Windows installer/QA → merge to `master` → tag/release.
Merging a beta.4-style bootstrap release PR does **not**, by itself,
authorize tagging or publishing — only the exact-`master`-commit WDIO
result does.

### Procedure — WDIO validation of the release candidate

This heading intentionally avoids saying "the exact commit to be tagged":
for a normal (post-bootstrap) release, WDIO runs pre-merge against the RC
freeze SHA, which is **not** the commit that ends up tagged (the merge
creates a new commit); for beta.4, WDIO runs post-merge, directly against
the merge commit that *is* the one tagged. See "SHA taxonomy" below for
the precise relationships in each case.

1. **`app-smoke`** — fastest spec, confirms the binary launches and the
   landing screen renders. Run first; if this fails, stop — nothing else is
   worth running yet.
   ```
   GitHub Actions → Desktop E2E (WDIO) → Run workflow → spec: app-smoke
   ```
2. **Representative specs** — one from each major coverage domain, run
   individually so a failure is easy to attribute:
   - `core-inventory` (entity creation, placement, persistence)
   - `csv-import` or `csv-device-model-import` (import workflows)
   - `git-remote-workflows` (SSH push/pull round-trip)
   - `destructive-guards` (delete/guard flows, the longest-running category)
3. **Full matrix** — every spec, once the above all pass:
   ```
   GitHub Actions → Desktop E2E (WDIO) → Run workflow → spec: all
   ```

### Required artifacts and logs

For the release record, retain (download before the 7-day artifact
retention window expires, per `wdio-e2e.yml`'s `retention-days: 7`):

- `wdio-build` — the exact binary + `tauri-driver` used for the run.
- `wdio-log-<spec>` for every spec in the full-matrix run (uploaded
  unconditionally, pass or fail).
- `wdio-tempdir-<spec>` for any spec that failed (uploaded only on failure).
- The GitHub Actions run URL itself, referenced in the release PR.

### SHA taxonomy

Three distinct SHAs, not interchangeable (see also "A.1 RC freeze" above):

- **`RC_FREEZE_SHA`** — the pre-merge, validated release-branch commit
  (release date + final release-facing docs already committed).
- **`MERGED_MASTER_SHA`** — the merge commit created when the validated
  release branch lands on `master`. A genuinely new commit — always a
  different commit ID from `RC_FREEZE_SHA`, even when nothing else
  changed.
- **`TAG_SHA`** — the commit the release tag actually points at.

**Normal flow (beta.5+, once `wdio-e2e.yml` is already on `master`):**
```
PREMERGE_WDIO_SHA      == RC_FREEZE_SHA
INSTALLER_RUN_HEAD_SHA == RC_FREEZE_SHA
QA_ARTIFACT_SOURCE_SHA == RC_FREEZE_SHA
MERGED_MASTER_SHA      != RC_FREEZE_SHA         (different commit ID — merge creates a new commit)
tree(MERGED_MASTER_SHA) == tree(RC_FREEZE_SHA)  (required before treating pre-merge validation as still applying)
TAG_SHA                == MERGED_MASTER_SHA     (never RC_FREEZE_SHA)
```

**Beta.4 (one-time bootstrap flow — stricter, unchanged by this section):**
```
INSTALLER_RUN_HEAD_SHA == RC_FREEZE_SHA
QA_ARTIFACT_SOURCE_SHA == RC_FREEZE_SHA
tree(MERGED_MASTER_SHA) == tree(RC_FREEZE_SHA)
POSTMERGE_WDIO_SHA      == MERGED_MASTER_SHA
TAG_SHA                 == MERGED_MASTER_SHA == POSTMERGE_WDIO_SHA
```
Beta.4 has no `PREMERGE_WDIO_SHA` at all — its WDIO gate is necessarily
post-merge, which is *stricter* than the normal flow (WDIO there directly
validates the exact commit that gets tagged, with no tree-equivalence
step in between).

### Pass criteria

**Pre-merge exact-SHA validation (normal flow):**

- Every spec job in the full-matrix run must conclude `success`. A single
  failing spec blocks the release — do not proceed until it either passes
  on a clean re-run or is triaged as a confirmed CI-infrastructure flake
  (not an app regression) with the reasoning recorded in the release PR.
- The workflow run's `head_sha` must equal `RC_FREEZE_SHA`. If any commit
  lands on the release branch after this WDIO gate passes, RC freeze is
  invalidated and every affected exact-SHA gate — including this one —
  must be re-run against the new commit.

**Merge continuity (required before treating pre-merge validation as
still applying, both flows):**

```bash
test "$(git rev-parse "${RC_FREEZE_SHA}^{tree}")" = "$(git rev-parse "${MERGED_MASTER_SHA}^{tree}")"
git diff --exit-code "$RC_FREEZE_SHA" "$MERGED_MASTER_SHA" -- .   # expect exit 0
```

**Tag continuity (normal flow):** `TAG_SHA == MERGED_MASTER_SHA`. Do not
require `TAG_SHA == RC_FREEZE_SHA` once a merge commit exists — that
equality can never hold.

**Reuse policy (normal flow only — a tree-equivalence reuse, not a
same-commit-ID reuse):** if the release branch's `RC_FREEZE_SHA` passed
pre-merge WDIO, and the merged `master` commit has exactly the same tree
as that `RC_FREEZE_SHA` (per "Merge continuity" above), the pre-merge WDIO
result may be reused for release approval per this project's release
policy — the full suite does not need to be re-run against
`MERGED_MASTER_SHA` itself. The tag is then placed on the merged `master`
commit. Do not describe the merge commit as "the exact same commit" as
the validated one — it is a different commit ID with equivalent tree
content; that distinction is what the reuse policy is actually built on.

**Beta.4 has no equivalent pre-merge reuse step** — its WDIO gate runs
once, post-merge, directly against `MERGED_MASTER_SHA` (see "SHA
taxonomy" above); that result is what gates its tag, not a reused
pre-merge result.

**Not run as part of beta.4 Stage R1 (release-branch preparation):** this
procedure and the bootstrap exception above have been documented, not
executed — no `wdio-e2e.yml` dispatch, installer build, Windows QA, merge,
or tag has occurred as part of preparing and pushing the release branch
and opening the draft release PR. Those all remain outstanding gates,
tracked in the release PR itself.

---

## Version consistency enforcement

CI runs `node scripts/check-version-consistency.mjs` on every push and pull
request (`.github/workflows/ci.yml`, `version-check` job). Merges are
blocked if any version source, or the Node toolchain declarations, are out
of sync.

---

## Diagnostics logging

Log files are written locally on the user's machine — no telemetry, no
external network upload.

**Log location on Windows 11:**

```
%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\
```

Users can open the logs folder from **Settings → Diagnostics and logs →
Open logs folder**. The Settings panel also shows the active log directory
path, current log filename, retention window (30 days, rotated daily), and
provides a "Choose logs folder…" option for a custom location.

See the diagnostics logging checks in
[`BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) for the full log
verification procedure.

---

## Protected master (recommended, not yet enabled)

**As of this writing, `master` has no GitHub branch protection** (verified:
`gh api repos/.../branches/master/protection` → `404 Branch not protected`).
Enable in **Settings → Branches** before or as part of the next release:

- Require pull request before merging.
- Require status checks to pass: `Rust workspace`, `Frontend checks`,
  `Version consistency`, `Workflow lint`.
- Do not allow bypassing the above settings.

Until this is enabled, direct pushes to `master` bypassing CI and review are
possible — the release process above assumes discipline, not enforcement.

---

## Code signing — current status

**The installer is currently unsigned.** This is intentional for the beta
phase.

When users run the installer, Windows SmartScreen shows:
> "Windows protected your PC — Microsoft Defender SmartScreen prevented an
> unrecognized app from starting."

Users must click **More info → Run anyway**. Inform all beta testers of this
in advance.

### Manual EV signing flow (for stable release)

When an EV Authenticode certificate is obtained, the signing flow is:

1. **Build the unsigned installer** using the GitHub Actions workflow (as
   above).
2. **Download** the `*-setup.exe` from the artifact ZIP.
3. **Sign** on a Windows machine with the EV token:
   ```
   signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "Rack Inventory Studio_X.Y.Z_x64-setup.exe"
   ```
4. **Verify** the signature:
   ```
   signtool verify /pa /v "Rack Inventory Studio_X.Y.Z_x64-setup.exe"
   ```
5. **Upload** the signed `.exe` (not the original unsigned one) to the
   GitHub Release.

**Security rules (do not violate):**
- Do not commit certificates, private keys, PFX files, passwords, or token
  configs.
- Do not add signing secrets to the repository or CI environment unless CI
  signing is explicitly set up with proper secret management.
- If CI signing placeholders are added in the future, make them opt-in and
  skipped unless the required secrets are present.

### CI signing (future)

CI-based signing is not configured. If it is added, use GitHub Actions
secrets for the certificate password and/or HSM token PIN. The signing step
must be a separate, explicitly triggered job — not automatic on every push
or PR.

### Checksums

No checksums (SHA256 etc.) are currently generated or published for release
artifacts. Not required while the installer is unsigned and distributed
only to internal QA/stakeholders via a private GitHub Release, but worth
adding (e.g. a `.sha256` sidecar file attached alongside the installer) once
distribution broadens.

---

## Hotfix / rollback

If a released build has a critical regression:

1. **Hotfix**: cut `hotfix/vX.Y.Z+1` from the affected tag (on `master`),
   apply the minimal fix, bump the patch version, run all checks and the
   WDIO gate, build a new installer, repeat the QA and release steps above.
   A hotfix does not go through `development`/`roadmap/*` first — it targets
   `master` directly, then should be merged back into `development` so the
   fix isn't lost on the next regular release.
2. **Rollback**: unpublish the broken GitHub Release (set to draft or
   delete) and re-publish the last known-good release. Notify testers.
3. **Never force-push a tag** — create a new version tag instead.

---

## What is intentionally not included (beta scope)

| Item | Status |
|---|---|
| EV / Authenticode code signing | Deferred to stable release |
| Windows SmartScreen reputation bypass | Requires signing + user adoption |
| Auto-update (Tauri updater) | Deferred to a future milestone |
| Linux packaging (AppImage, deb, rpm) | Deferred to a future milestone |
| macOS packaging | Not planned for near term |
| Automated Windows WDIO CI | Not implemented — manual Windows 11 QA substitutes for now (see "WDIO release gate" above) |
| Automatic GitHub Release on CI push | Not configured; manual release only |
| Release artifact checksums | Not currently generated |

---

## Related documents

- [`CI.md`](CI.md) — CI workflow architecture, composite actions, and how to debug a failed run
- [`E2E_WDIO_PLAN.md`](E2E_WDIO_PLAN.md) — Desktop E2E program scope, stage history, and the release-validation policy referenced above
- [`BETA3_ROADMAP.md`](BETA3_ROADMAP.md) — beta.3 feature scope and completed PR sequence (superseded release, content now shipping as part of beta.4)
- [`BETA3_QA_RUNBOOK.md`](BETA3_QA_RUNBOOK.md) — beta.3 feature-specific manual QA checklist (still required for beta.4 — see `BETA4_QA_RUNBOOK.md`)
- [`BETA4_QA_RUNBOOK.md`](BETA4_QA_RUNBOOK.md) — beta.4-specific manual QA overlay (install/upgrade, version, clone-responsiveness regression)
- [`releases/v0.1.0-beta.3.md`](releases/v0.1.0-beta.3.md) — beta.3 release notes (historical — never published)
- [`releases/v0.1.0-beta.4.md`](releases/v0.1.0-beta.4.md) — current beta.4 release notes (draft)
- [`BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) — Windows 11 manual QA runbook (required before distributing)
- [`archive/release.md`](archive/release.md) — superseded beta.1-era quick-reference (historical/archived)
- [`archive/BETA_HARDENING_PLAN_EN.md`](archive/BETA_HARDENING_PLAN_EN.md) — overall beta milestone plan (historical/archived)
- [`archive/BETA_QA_FINDINGS_ACTION_PLAN_EN.md`](archive/BETA_QA_FINDINGS_ACTION_PLAN_EN.md) — post-QA findings and follow-up milestones (historical/archived)
