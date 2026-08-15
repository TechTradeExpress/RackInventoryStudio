# Release process — Rack Inventory Studio

> **Historical document.** Written for the v0.1.0-beta.1 release specifically
> (tag names, artifact filenames, and release-notes links below are hardcoded
> to beta.1) and never generalized for beta.2 or beta.3. Superseded by
> [`docs/BETA_RELEASE_PROCESS_EN.md`](../BETA_RELEASE_PROCESS_EN.md), now the
> single source of truth for the release process (BRSP Stage B5A) — this
> document's genuinely reusable content (platform scope, installer artifact
> naming, version/tag table, "what's intentionally not included") was ported
> there. Preserved for historical context only.

This document was the quick-reference for releasing Rack Inventory Studio.
For the full policy (SemVer conventions, branch naming, QA runbook references) see
[`docs/BETA_RELEASE_PROCESS_EN.md`](../BETA_RELEASE_PROCESS_EN.md).

---

## Release scope — v0.1.0-beta.1 and onwards

**Platform:** Windows x64 only.

Linux packaging is **explicitly deferred** to a future milestone.
macOS packaging is not planned for the near term.

---

## Version sources

The app version is stored in four files that must always be identical:

| File | Field |
|---|---|
| `package.json` (workspace root) | `"version"` |
| `apps/desktop/package.json` | `"version"` |
| `apps/desktop/src-tauri/Cargo.toml` | `version = "..."` |
| `apps/desktop/src-tauri/tauri.conf.json` | `"version"` |

**Always use the helper script** — do not edit these files by hand:

```bash
node scripts/bump-version.mjs 0.1.0-beta.1
node scripts/check-version-consistency.mjs
```

CI enforces version consistency on every push and pull request.

---

## Release branch workflow

```
master
  │
  └── release/0.1.0-beta.1-windows-readiness  ← readiness PR (docs, version bump)
        │
        merge to master
        │
        tag v0.1.0-beta.1 on master merge commit
        │
        trigger Windows Installer workflow on that tag/branch
```

1. **Merge** the release-readiness PR to `master`.
2. **Run all CI checks** (must be green before tagging).
3. **Create and push an annotated tag:**
   ```bash
   git tag -a v0.1.0-beta.1 -m "First Windows beta"
   git push origin v0.1.0-beta.1
   ```
4. **Build the installer** (see below).
5. **Run Windows QA** (see [`docs/BETA_WINDOWS_11_QA_EN.md`](../BETA_WINDOWS_11_QA_EN.md)).
6. **Create a GitHub prerelease** (see below).

---

## Required checks before release

```bash
git diff --check
node scripts/check-version-consistency.mjs
node --test scripts/*.test.mjs
node scripts/check-repo-hygiene.mjs
pnpm --filter @rack-inventory-studio/desktop exec tsc --noEmit
pnpm --filter @rack-inventory-studio/desktop exec vitest run
pnpm --filter @rack-inventory-studio/desktop exec playwright test
cargo fmt --all --check
cargo check --workspace
cargo test --workspace
cargo clippy --workspace -- -D warnings
```

All checks must pass before building the installer or tagging the release.

---

## Windows installer path

The NSIS installer uses a vendor-prefixed install directory:

```
C:\Program Files\TechTradeExpress\RackInventoryStudio\
```

This is enforced by a custom NSIS template (`src-tauri/nsis/main.nsi`).
When upgrading Tauri, check if the upstream template changed and merge as needed.

---

## Building the Windows installer

### Via GitHub Actions (standard path)

1. Go to **Actions → Windows Installer → Run workflow**.
2. Select the release branch or `master` at the tagged commit.
3. Click **Run workflow**.
4. Wait for completion (15–25 min cold, 5–10 min warm Rust cache).
5. Open the completed run → **Artifacts** →
   download `rack-inventory-studio-v0.1.0-beta.1-windows-installer.zip`.
6. Extract and confirm `Rack Inventory Studio_0.1.0-beta.1_x64-setup.exe` is present.

The workflow file is at [`.github/workflows/windows-installer.yml`](../../.github/workflows/windows-installer.yml).

### Locally (optional, Windows machine only)

```bash
pnpm install --frozen-lockfile
pnpm --filter @rack-inventory-studio/desktop tauri build
# Installer produced at:
# apps/desktop/src-tauri/target/release/bundle/nsis/
#   Rack Inventory Studio_0.1.0-beta.1_x64-setup.exe
```

Local builds are not required; the GitHub Actions workflow is the canonical build.

---

## Windows artifacts produced

The NSIS installer workflow uploads one artifact per run:

| Artifact name | Contents |
|---|---|
| `rack-inventory-studio-v0.1.0-beta.1-windows-installer` | `Rack Inventory Studio_0.1.0-beta.1_x64-setup.exe` |

Artifacts are retained for **30 days** on the GitHub Actions run summary page.

---

## Creating a GitHub prerelease manually

After the installer is built and Windows QA passes:

1. Go to **GitHub → Releases → Draft a new release**.
2. Choose the existing tag `v0.1.0-beta.1`.
3. Title: `Rack Inventory Studio v0.1.0-beta.1`.
4. Body: copy from [`docs/releases/v0.1.0-beta.1.md`](../releases/v0.1.0-beta.1.md).
5. Attach: `rack-inventory-studio-v0.1.0-beta.1-windows-installer.zip`
   (downloaded from the GitHub Actions run artifacts).
6. Check **Set as a pre-release**.
7. Click **Publish release**.

---

## Windows smoke tests (minimum before publishing)

See the full checklist in [`docs/BETA_WINDOWS_11_QA_EN.md`](../BETA_WINDOWS_11_QA_EN.md).
Minimum before publishing a prerelease:

- [ ] Installer runs on a clean Windows 11 machine; accept SmartScreen warning.
- [ ] App launches without error dialogs.
- [ ] Open or create a repository successfully.
- [ ] Logs folder opens from Settings → Diagnostics and logs → Open logs folder.
- [ ] No crash on normal close.

---

## Unsigned installer — SmartScreen expectations

The installer is **not code-signed** in this beta. When a user runs it:

- Windows SmartScreen shows: "Windows protected your PC — Microsoft Defender
  SmartScreen prevented an unrecognized app from starting."
- User must click **"More info"** then **"Run anyway"** to proceed.
- This is expected and documented. Inform beta testers in advance.

Code signing (EV certificate) is planned for a future stable release — it is
**not** part of the v0.1.0-beta.1 scope.

---

## Version and tag naming

| Release type | Version in files | Git tag |
|---|---|---|
| Beta candidate 1 | `0.1.0-beta.1` | `v0.1.0-beta.1` |
| Beta candidate 2 | `0.1.0-beta.2` | `v0.1.0-beta.2` |
| Stable release | `0.1.0` | `v0.1.0` |

---

## What is intentionally not included

| Item | Status |
|---|---|
| EV / Authenticode code signing | Deferred to stable release |
| Windows SmartScreen reputation bypass | Requires signing + user adoption |
| Auto-update (Tauri updater) | Deferred to a future milestone |
| Linux packaging (AppImage, deb, rpm) | Deferred to a future milestone |
| macOS packaging | Not planned for near term |
| Windows Diagnostic Installer | Removed; diagnostics are an in-app feature |
| Automatic GitHub Release on CI push | Not configured; manual release only |
