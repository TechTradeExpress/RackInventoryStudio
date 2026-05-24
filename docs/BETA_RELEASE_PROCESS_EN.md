# Beta Release Process

This document describes how to prepare, build, and distribute a beta installer for Rack Inventory Studio.

---

## Purpose

Beta releases are unsigned Windows installers built from the `master` branch for internal QA and stakeholder testing. They are not published to end-users and do not go through a code-signing workflow.

---

## Version policy

- The single source of truth for the app version is **`apps/desktop/src-tauri/tauri.conf.json`** (`"version": "X.Y.Z"`).
- Three files must always match it:
  - `package.json` (workspace root)
  - `apps/desktop/package.json`
  - `apps/desktop/src-tauri/Cargo.toml`
- Run `pnpm check:version` (or `node scripts/check-version-consistency.mjs`) at any time to verify all four are in sync.
- CI (`version-check` job in `.github/workflows/ci.yml`) enforces this on every push and pull request.

## Beta naming convention

Beta builds are identified by the **version number in the artifact name**, not by a separate label:

```
rack-inventory-studio-v0.1.0-windows-installer
rack-inventory-studio-v0.1.0-windows-diagnostic-installer
```

For pre-release milestones, bump the patch version (e.g. `0.1.0` → `0.1.1`) to distinguish builds. Do not use `-beta` or `-rc` suffixes during early development — numeric versioning is sufficient.

---

## Release checklist

### 1. Verify version consistency

```bash
pnpm check:version
```

All four files must report the same version. If they differ, update them manually before proceeding.

### 2. Merge to master

- Open a PR from your feature branch to `master`.
- All CI checks must pass (Rust, frontend, version-check jobs).
- Merge using the standard PR review process.

### 3. Trigger the installer build

- Go to **Actions → Windows Installer → Run workflow** (or **Windows Diagnostic Installer** for QA builds).
- Select branch `master` and click **Run workflow**.
- Wait for the run to complete (typically 15–25 minutes on a cold cache).

### 4. Download and verify the artifact

- Open the completed Actions run.
- Download the artifact named `rack-inventory-studio-vX.Y.Z-windows-installer.zip`.
- Extract and verify the `.exe` file is present.

### 5. Smoke test

Follow the QA checklist in `.ai/windows-diagnostic-installer.md`:

1. Install (accept SmartScreen warning — the build is unsigned).
2. Launch and verify no error dialog appears.
3. Open the example repository or create a new one.
4. Run **Validate repository** and **Save changes**.
5. Try **CSV Import**: paste a sample CSV, click Preview.
6. Check the **Repository** tab: Git status, Safe Publish steps.
7. Inspect the log file — no paths, secrets, or raw data should appear.
8. Close the app — verify no crash.

### 5a. Complete Windows 11 manual QA

Before distributing, complete the full Windows 11 QA checklist:

- Follow [`docs/BETA_WINDOWS_11_QA_EN.md`](BETA_WINDOWS_11_QA_EN.md) for the complete checklist.
- Windows 11 manual QA **must be completed** before a beta release is announced or distributed.
- Record results in the summary table in the runbook.

### 6. Distribute

Share the `.exe` directly with testers. Include the `diagnostic-readme.txt` from the diagnostic artifact as a companion note.

---

## Version bump procedure

When ready to increment the version (e.g. for the next beta milestone):

1. Create a feature branch: `git checkout -b chore/bump-version-0.2.0`
2. Update **all four** version files to the new version:
   - `package.json` → `"version": "0.2.0"`
   - `apps/desktop/package.json` → `"version": "0.2.0"`
   - `apps/desktop/src-tauri/Cargo.toml` → `version = "0.2.0"`
   - `apps/desktop/src-tauri/tauri.conf.json` → `"version": "0.2.0"`
3. Run `pnpm check:version` to confirm consistency.
4. Commit: `chore: bump version to 0.2.0`
5. Open a PR, merge to `master`, then trigger the installer workflow.

---

## Protected master (recommended)

To prevent accidental direct pushes, enable branch protection on `master` in **Settings → Branches**:

- Require a pull request before merging
- Require status checks to pass (CI: `Rust workspace`, `Frontend checks`, `Version consistency`)
- Do not allow bypassing the above settings

This ensures every merge is reviewed and all checks are green.

---

## Related documents

- [`BETA_HARDENING_PLAN_EN.md`](BETA_HARDENING_PLAN_EN.md) — overall beta milestone plan
- [`.ai/windows-diagnostic-installer.md`](../.ai/windows-diagnostic-installer.md) — full QA instructions and log locations
