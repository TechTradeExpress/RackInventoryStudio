# Release Process — Rack Inventory Studio

This is the canonical release process reference for Rack Inventory Studio.
It supersedes earlier drafts and is the authoritative guide for all releases from v0.1.0-beta.1 onwards.

For a concise cheat-sheet see [`docs/release.md`](release.md).
For the beta-specific QA runbook see [`docs/BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md).

---

## Version policy

### SemVer scheme

| Change type | Bump | Example |
|---|---|---|
| Bug fixes only | `PATCH` | `0.1.0` → `0.1.1` |
| New features (non-breaking) | `MINOR` | `0.1.1` → `0.2.0` |
| Breaking changes or stable promotion | `MAJOR` | `0.x.x` → `1.0.0` |

### Pre-release suffix

Beta candidates: `0.1.0-beta.1`, `0.1.0-beta.2`, …
Release candidates: `0.1.0-rc.1`, `0.1.0-rc.2`, …
Stable release: `0.1.0` (no suffix).

Only remove the pre-release suffix when the build is QA-passed and ready for broad distribution.

### Canonical version sources

The version is stored in **four files** that must always agree:

| File | Field |
|---|---|
| `package.json` (workspace root) | `"version"` |
| `apps/desktop/package.json` | `"version"` |
| `apps/desktop/src-tauri/Cargo.toml` | `version = "..."` (under `[package]`) |
| `apps/desktop/src-tauri/tauri.conf.json` | `"version"` |

CI enforces consistency on every push (`pnpm check:version` / `node scripts/check-version-consistency.mjs`).

**Always use the helper script — never edit version files by hand:**

```bash
node scripts/bump-version.mjs 0.1.0-beta.2
node scripts/check-version-consistency.mjs
```

---

## Branch and tag naming

| Name | Pattern | Purpose |
|---|---|---|
| Main branch | `master` | Ongoing development |
| Release branch | `release/vX.Y.Z` | Stabilization; cut from `master` |
| Git tag | `vX.Y.Z` or `vX.Y.Z-beta.N` | Immutable marker of a released build |

Only release-specific fixes (not new features) land directly on a release branch.
The Windows installer is always built from a release branch or its exact tag — **not** from a feature branch.

---

## Required checks before release

All of the following must be clean before building the installer or creating a tag:

```bash
git diff --check
node scripts/check-version-consistency.mjs
node --test scripts/*.test.mjs
node scripts/check-repo-hygiene.mjs
cargo fmt --all --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
npx tsc --noEmit
npx vitest run
```

CI runs most of these automatically. Do not build a release artifact from a commit where any check is red.

---

## Release workflow — step by step

### 1. Prepare release branch

```bash
git checkout master && git pull
git checkout -b release/v0.1.0-beta.2

# Bump version if not already correct
node scripts/bump-version.mjs 0.1.0-beta.2
node scripts/check-version-consistency.mjs

# Update CHANGELOG — move Unreleased entries under the new version heading
# (edit CHANGELOG.md manually)

git add package.json apps/desktop/package.json \
  apps/desktop/src-tauri/Cargo.toml \
  apps/desktop/src-tauri/tauri.conf.json \
  CHANGELOG.md
git commit -m "chore: bump version to 0.1.0-beta.2 and update changelog"
git push -u origin release/v0.1.0-beta.2
```

### 2. Open and merge release PR

Open a PR from `release/vX.Y.Z` to `master`. Wait for all CI checks to pass.
Merge only when CI is green. No direct pushes to `master`.

### 3. Tag the release commit

After the release PR is merged:

```bash
git checkout master && git pull
git tag -a v0.1.0-beta.2 -m "Beta 0.1.0 candidate 2"
git push origin v0.1.0-beta.2
```

### 4. Build installer (GitHub Actions)

1. Go to **Actions → Windows Installer → Run workflow**.
2. Select `master` (at the tagged commit) or the release branch.
3. Click **Run workflow**.
4. Wait for completion — typically 15–25 min (cold Rust cache) or 5–10 min (warm).
5. Open the completed run → **Artifacts** →
   download `rack-inventory-studio-vX.Y.Z-windows-installer.zip`.
6. Extract and confirm `Rack Inventory Studio_X.Y.Z_x64-setup.exe` is present.

### 5. Windows 11 QA

Install the unsigned NSIS installer on a clean Windows 11 machine:

- Accept the SmartScreen warning: "More info → Run anyway" — **expected for unsigned builds**.
- Verify the app installs to `C:\Program Files\TechTradeExpress\RackInventoryStudio\`.
- Run the full checklist in [`docs/BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md).

Minimum smoke tests before publishing:

- [ ] Installer runs; app launches without error dialogs.
- [ ] Open or create a repository successfully.
- [ ] Validate repository, save changes, CSV import preview all complete without error.
- [ ] Settings → Diagnostics and logs → Open logs folder works.
- [ ] No crash on normal close.

### 6. Create GitHub release

After Windows QA passes:

1. Go to **GitHub → Releases → Draft a new release**.
2. Select the existing tag (e.g. `v0.1.0-beta.2`).
3. Title: `Rack Inventory Studio v0.1.0-beta.2`.
4. Body: copy from `CHANGELOG.md` under the matching version heading.
5. Attach the `rack-inventory-studio-vX.Y.Z-windows-installer.zip` artifact.
6. Check **Set as a pre-release** for any `-beta.N` or `-rc.N` tag.
7. Publish.

---

## Windows installer path

The NSIS installer installs the application to:

```
C:\Program Files\TechTradeExpress\RackInventoryStudio\
```

This is set via a custom NSIS template at `apps/desktop/src-tauri/nsis/main.nsi`.
The template is a minimal fork of the Tauri v2 default — the ONLY change is the
`$INSTDIR` defaults in `Function .onInit`. When upgrading Tauri, compare the
upstream template and merge any changes into the custom template.

Reference: https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-bundler/src/bundle/windows/nsis/main.nsi

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

| Document | Purpose |
|---|---|
| [`docs/release.md`](release.md) | Quick-reference cheat-sheet |
| [`docs/BETA_RELEASE_PROCESS_EN.md`](BETA_RELEASE_PROCESS_EN.md) | Earlier beta release process (superseded by this document) |
| [`docs/BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) | Windows 11 manual QA runbook |
| [`docs/BETA1_FOLLOWUP_PLAN_EN.md`](BETA1_FOLLOWUP_PLAN_EN.md) | Beta 1 milestone follow-up PRs |
