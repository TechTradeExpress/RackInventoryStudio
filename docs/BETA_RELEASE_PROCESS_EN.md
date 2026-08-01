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
v0.1.0-beta.3   ← next candidate (in preparation)
v0.1.0          ← final (stable) release
```

Only remove the pre-release suffix when the build is QA-passed and ready for
broad distribution.

---

## Version bump helper

A helper script updates all four canonical version sources atomically:

```bash
node scripts/bump-version.mjs 0.1.0-beta.3
```

Or via the package script:

```bash
pnpm bump:version 0.1.0-beta.3
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
git checkout -b release/v0.1.0-beta.3

# 4. Bump version
node scripts/bump-version.mjs 0.1.0-beta.3
pnpm check:version

# 5. Move the prepared CHANGELOG.md "v0.1.0-beta.3" section's date from
#    "Unreleased" to the actual release date (edit CHANGELOG.md manually —
#    the section content itself should already be prepared, see "CHANGELOG
#    workflow" below)

# 6. Commit version bump and changelog date
git add package.json apps/desktop/package.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/tauri.conf.json \
  CHANGELOG.md
git commit -m "chore: bump version to 0.1.0-beta.3 and finalize changelog date"
```

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

Do not proceed past this step until the WDIO release gate has fully passed
against the exact commit that will be tagged — see
["WDIO release gate"](#wdio-release-gate) below for the complete procedure.

### D. Build installer

1. Go to **GitHub Actions → Windows Installer → Run workflow**.
2. Select the release branch (e.g. `release/v0.1.0-beta.3`) and click **Run
   workflow**.
3. Wait for completion (typically 15–25 minutes on a cold Rust cache; 5–10
   minutes warm).
4. Open the completed run → **Artifacts** → download
   `rack-inventory-studio-vX.Y.Z-windows-installer.zip`.
5. Extract and confirm `Rack Inventory Studio_X.Y.Z_x64-setup.exe` is present.

Installer path enforced by the app: `C:\Program Files\TechTradeExpress\RackInventoryStudio\`,
via the custom NSIS template at `apps/desktop/src-tauri/nsis/main.nsi`.

### E. Windows 11 QA

Install the unsigned NSIS installer on a clean Windows 11 machine:

- Accept the SmartScreen warning: "More info → Run anyway" — **expected for
  unsigned builds**.
- Verify the app installs to the path above.
- Run the full checklist in [`BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md)
  and the beta.3-specific feature checklist in
  [`BETA3_QA_RUNBOOK.md`](BETA3_QA_RUNBOOK.md).

Minimum smoke tests before publishing:

- [ ] Installer runs; app launches without error dialogs.
- [ ] Open or create a repository successfully.
- [ ] Validate repository, save changes, CSV import preview (Devices and
      Device Models) all complete without error.
- [ ] Settings → Diagnostics and logs → Open logs folder works.
- [ ] No crash on normal close.

### F. Merge, tag, and GitHub Release

After Windows QA and the WDIO gate both pass:

1. Merge the `release/*` PR into `master` (this is the only way `master`
   advances — see "Branch policy" above).
2. Tag the merge commit on `master`:
   ```bash
   git checkout master && git pull
   git tag -a v0.1.0-beta.3 -m "Beta 0.1.0 candidate 3 — QA passed"
   git push origin v0.1.0-beta.3
   ```
3. Create a GitHub Release manually:
   1. Go to **GitHub → Releases → Draft a new release**.
   2. Select the tag `v0.1.0-beta.3`.
   3. Title: `Rack Inventory Studio v0.1.0-beta.3`.
   4. Body: copy from [`docs/releases/v0.1.0-beta.3.md`](releases/v0.1.0-beta.3.md).
   5. Attach the `rack-inventory-studio-v0.1.0-beta.3-windows-installer.zip`
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
  release preparation — do not wait until the release branch to write these)
  — at that point the heading's date is filled in and `Unreleased` is
  dropped from the title.
- Never mix two releases' worth of changes under one heading. If
  `## Unreleased` has accumulated content spanning more than the upcoming
  release, split it before cutting the release branch, not after.

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

### Procedure (run against the exact commit to be tagged)

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

### Pass criteria

- Every spec job in the full-matrix run must conclude `success`. A single
  failing spec blocks the release — do not tag until it either passes on a
  clean re-run or is triaged as a confirmed CI-infrastructure flake (not an
  app regression) with the reasoning recorded in the release PR.
- The exact commit tested must be the exact commit tagged. If any commit
  lands on the release branch after the WDIO gate passes, the gate must be
  re-run.
- Per `docs/E2E_WDIO_PLAN.md`: for `release/*` → `master`, do not rerun the
  full suite if the exact same commit SHA was already validated earlier in
  the same release cycle — reuse that result instead of re-running.

**Not run as part of this stage (BRSP B5A):** this procedure has been
prepared, not executed — no `wdio-e2e.yml` dispatch has occurred as part of
this document's preparation, per BRSP Stage B5A's own rules.

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
- [`BETA3_ROADMAP.md`](BETA3_ROADMAP.md) — beta.3 feature scope and completed PR sequence
- [`BETA3_QA_RUNBOOK.md`](BETA3_QA_RUNBOOK.md) — beta.3 feature-specific manual QA checklist
- [`BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) — Windows 11 manual QA runbook (required before distributing)
- [`archive/release.md`](archive/release.md) — superseded beta.1-era quick-reference (historical/archived)
- [`archive/BETA_HARDENING_PLAN_EN.md`](archive/BETA_HARDENING_PLAN_EN.md) — overall beta milestone plan (historical/archived)
- [`archive/BETA_QA_FINDINGS_ACTION_PLAN_EN.md`](archive/BETA_QA_FINDINGS_ACTION_PLAN_EN.md) — post-QA findings and follow-up milestones (historical/archived)
