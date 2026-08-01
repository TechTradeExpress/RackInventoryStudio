# Beta Release Process

This document describes how to prepare, build, and distribute a beta installer for Rack Inventory Studio.

---

## Purpose

Beta releases are unsigned Windows installers built from release branches for internal QA and stakeholder testing. They are not published to end-users and do not go through a code-signing workflow.

---

## Version policy

### SemVer scheme

| Change type | Version bump | Example |
|---|---|---|
| Bug fixes only | `PATCH` | `0.1.0` → `0.1.1` |
| New features (non-breaking) | `MINOR` | `0.1.1` → `0.2.0` |
| Breaking changes or stable release | `MAJOR` | `0.x.x` → `1.0.0` |

### Pre-release tags

Beta candidates use a numbered pre-release suffix:

```
v0.1.0-beta.1   ← first beta candidate
v0.1.0-beta.2   ← second candidate (after fixes)
v0.1.0          ← final (stable) release
```

Only tag `v0.1.0` (no pre-release suffix) when the build is QA-passed and ready for distribution.

### Canonical version sources

The version is stored in **four files** that must always agree:

| File | Field |
|---|---|
| `package.json` (workspace root) | `"version"` |
| `apps/desktop/package.json` | `"version"` |
| `apps/desktop/src-tauri/Cargo.toml` | `version = "..."` (under `[package]`) |
| `apps/desktop/src-tauri/tauri.conf.json` | `"version"` |

Run `pnpm check:version` (or `node scripts/check-version-consistency.mjs`) at any time to verify all four are in sync. CI enforces this on every push and pull request.

---

## Release branch naming

| Branch | Purpose |
|---|---|
| `master` | Main development branch — ongoing work |
| `release/vX.Y.Z` | Release stabilization branch; cut from `master` |

Mainline development stays on `master`. A release branch is cut from `master` after all intended PRs are merged. Only release-specific fixes (not new features) should land directly on a release branch. The Windows installer is built from the release branch or its exact tag — **not** from an arbitrary feature branch.

---

## Version bump helper

A helper script is provided to update all four canonical version sources atomically:

```bash
node scripts/bump-version.mjs 0.1.1
node scripts/bump-version.mjs 0.2.0-beta.1
```

Or via the package script:

```bash
pnpm bump:version 0.1.1
```

The script validates the version format, prints a before/after table, writes all four files, and exits with a reminder to run the consistency check. It does **not** commit automatically. Verify after running:

```bash
pnpm check:version
```

---

## Release workflow — step by step

### A. Prepare release branch

```bash
# 1. Ensure local master is up to date
git checkout master
git pull

# 2. Cut release branch
git checkout -b release/v0.1.0

# 3. Bump version if needed (skip if already correct)
node scripts/bump-version.mjs 0.1.0
pnpm check:version

# 4. Update CHANGELOG — move Unreleased entries to the new version heading
#    (edit CHANGELOG.md manually)

# 5. Commit version bump and changelog
git add package.json apps/desktop/package.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/tauri.conf.json \
  CHANGELOG.md
git commit -m "chore: bump version to 0.1.0 and update changelog"
```

### B. Validate

```bash
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
pnpm --filter @rack-inventory-studio/desktop typecheck
pnpm --filter @rack-inventory-studio/desktop test
pnpm --filter @rack-inventory-studio/desktop build
```

Push the release branch and open a PR to `master`. Wait for all CI checks to pass before proceeding.

### C. Build installer

1. Go to **GitHub Actions → Windows Installer → Run workflow**.
2. Select the release branch (e.g. `release/v0.1.0`) and click **Run workflow**.
3. Wait for completion (typically 15–25 minutes on a cold Rust cache; 5–10 minutes warm).
4. Open the completed run → **Artifacts** → download `rack-inventory-studio-vX.Y.Z-windows-installer.zip`.
5. Extract and confirm the `.exe` is present inside.

### D. Windows 11 QA

1. Install the unsigned NSIS installer on a Windows 11 machine.
2. Accept the SmartScreen warning ("More info → Run anyway") — expected for unsigned builds.
3. Launch the app; verify it opens without error dialogs.
4. Open or create a repository.
5. Run Validate repository, Save changes, CSV Import preview.
6. Check the Repository tab: Git status, commit, push/pull flow.
7. Open **Settings → Diagnostics and logs**: verify log directory path is shown, "Open logs folder" works, and log entries appear after operations.
8. Close the app — verify no crash.

Full checklist: [`docs/BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md).

### E. Tag and GitHub Release

Only after Windows 11 QA passes:

```bash
# Create annotated beta tag on the release branch (or the merge commit on master)
git tag -a v0.1.0-beta.1 -m "Beta 0.1.0 candidate 1 — QA passed"
git push origin v0.1.0-beta.1
```

Create a GitHub Release manually:

1. Go to **GitHub → Releases → Draft a new release**.
2. Select the tag (e.g. `v0.1.0-beta.1`).
3. Title: `Rack Inventory Studio v0.1.0-beta.1`.
4. Copy release notes from the relevant section of `CHANGELOG.md`.
5. Attach the `rack-inventory-studio-v0.1.0-windows-installer.zip` artifact.
6. Check **Set as a pre-release** for any `-beta.N` or `-rc.N` tag.
7. Publish.

---

## Version consistency enforcement

CI runs `pnpm check:version` on every push and pull request (`.github/workflows/ci.yml`, `version-check` job). Merges are blocked if any version source is out of sync.

---

## Diagnostics logging

Log files are written locally on the user's machine — no telemetry, no external network upload.

**Log location on Windows 11:**

```
%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\
```

Users can open the logs folder from **Settings → Diagnostics and logs → Open logs folder**. The Settings panel also shows the active log directory path and provides a "Choose logs folder…" option for a custom location.

See the diagnostics logging checks in [`docs/BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) for the full log verification procedure.

---

## Protected master (recommended)

Enable branch protection on `master` in **Settings → Branches**:

- Require pull request before merging.
- Require status checks to pass: `Rust workspace`, `Frontend checks`, `Version consistency`.
- Do not allow bypassing the above settings.

---

## Code signing — current status

**The installer is currently unsigned.** This is intentional for the beta phase.

When users run the installer, Windows SmartScreen shows:
> "Windows protected your PC — Microsoft Defender SmartScreen prevented an unrecognized app from starting."

Users must click **More info → Run anyway**. Inform all beta testers of this in advance.

### Manual EV signing flow (for stable release)

When an EV Authenticode certificate is obtained, the signing flow is:

1. **Build the unsigned installer** using the GitHub Actions workflow (as above).
2. **Download** the `*-setup.exe` from the artifact ZIP.
3. **Sign** on a Windows machine with the EV token:
   ```
   signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a "Rack Inventory Studio_X.Y.Z_x64-setup.exe"
   ```
4. **Verify** the signature:
   ```
   signtool verify /pa /v "Rack Inventory Studio_X.Y.Z_x64-setup.exe"
   ```
5. **Upload** the signed `.exe` (not the original unsigned one) to the GitHub Release.

**Security rules (do not violate):**
- Do not commit certificates, private keys, PFX files, passwords, or token configs.
- Do not add signing secrets to the repository or CI environment unless CI signing is explicitly set up with proper secret management.
- If CI signing placeholders are added in the future, make them opt-in and skipped unless the required secrets are present.

### CI signing (future)

CI-based signing is not configured. If it is added, use GitHub Actions secrets for
the certificate password and/or HSM token PIN. The signing step must be a separate,
explicitly triggered job — not automatic on every push or PR.

---

## Hotfix / rollback

If a released build has a critical regression:

1. **Hotfix**: cut `hotfix/vX.Y.Z+1` from the affected tag, apply the minimal fix,
   bump the patch version, run all checks, build a new installer, repeat the QA and
   release steps above.
2. **Rollback**: unpublish the broken GitHub Release (set to draft or delete) and
   re-publish the last known-good release. Notify testers.
3. **Never force-push a tag** — create a new version tag instead.

---

## Related documents

- [`CI.md`](CI.md) — CI workflow architecture, composite actions, and how to debug a failed run
- [`BETA_HARDENING_PLAN_EN.md`](archive/BETA_HARDENING_PLAN_EN.md) — overall beta milestone plan (historical/archived)
- [`BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) — Windows 11 manual QA runbook (required before distributing)
- [`BETA_QA_FINDINGS_ACTION_PLAN_EN.md`](archive/BETA_QA_FINDINGS_ACTION_PLAN_EN.md) — post-QA findings and follow-up milestones (historical/archived)
