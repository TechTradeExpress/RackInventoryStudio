## Summary

First Windows beta release readiness — branch `release/0.1.0-beta.1-windows-readiness`.

Prepared the repository for distributing `v0.1.0-beta.1` as an unsigned Windows x64
installer. No new product features. No Linux packaging. No signing. No auto-update.

## Versioning decision

**All four canonical files bumped to `0.1.0-beta.1`.**

- `bump-version.mjs` explicitly supports prerelease SemVer (`0.1.0-beta.1` is
  shown in its own usage examples).
- `check-version-consistency.mjs` is format-agnostic — it just compares the four
  sources; prerelease strings are fine.
- Cargo, npm/pnpm, and Tauri's NSIS bundler all accept prerelease versions.
- The NSIS installer will be named `Rack Inventory Studio_0.1.0-beta.1_x64-setup.exe`.
- The GitHub artifact will be `rack-inventory-studio-v0.1.0-beta.1-windows-installer`.
- The Git tag after QA passes will be `v0.1.0-beta.1` (matching the files exactly).

Alternative considered: keep files at `0.1.0`, use tag `v0.1.0-beta.1`. Rejected —
there is no reason to diverge file version from the tag; the tooling handles it cleanly.

## Files changed

### Version files (4 sources, all bumped to `0.1.0-beta.1`)
- `package.json` (workspace root)
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/tauri.conf.json`

### CHANGELOG.md
- Added user-facing `v0.1.0-beta.1 — 2026-05-27 — First Windows beta` section at the
  top with highlights and known beta limitations.
- Converted all `## Unreleased —` headings to `## v0.1.0-beta.1 —` throughout.

### docs/release.md (new)
- Canonical release quick-reference: version sources, release branch workflow,
  required checks before release, how to build the Windows installer via GitHub
  Actions, expected Windows artifacts, how to create a GitHub prerelease manually,
  minimum smoke-test checklist, SmartScreen expectations, what is not included.

### docs/releases/v0.1.0-beta.1.md (new)
- Draft release notes for the GitHub prerelease: beta notice, feature summary,
  installation notes, log file location, smoke-test checklist, known limitations,
  what is not in this release.

### .ai/cc-report.md (this file)

## Windows release workflow status

`.github/workflows/windows-installer.yml` already exists and is fully suitable:
- `workflow_dispatch` only (manual trigger).
- Builds unsigned NSIS installer via `pnpm tauri build` on `windows-latest`.
- Extracts version from `tauri.conf.json`; uses it in artifact name.
- Uploads `rack-inventory-studio-v{version}-windows-installer` (30-day retention).
- No signing keys configured.
- No automatic GitHub Release.
- No Linux jobs.
- No Windows Diagnostic Installer references.

No changes to the workflow were required.

## Linux packaging

Linux packaging is **explicitly deferred**. No AppImage, deb, rpm, or Linux job was
added. Documented in `docs/release.md` and `docs/releases/v0.1.0-beta.1.md`.

## Tests

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0-beta.1 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 446 pass, 34 files
playwright test (apps/desktop)                  → 21 pass
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → all pass
cargo clippy --workspace -- -D warnings         → clean
actionlint                                      → not available locally; CI workflow-lint
                                                  job validates on push/PR
```

Windows packaging build: not run locally (Linux automation environment).
CI Windows Installer workflow (`workflow_dispatch`) must be triggered manually after
the release-readiness PR is merged and the `v0.1.0-beta.1` tag is pushed.

## Risks

- **NSIS version string with hyphen:** Tauri NSIS bundler uses the version string
  from `tauri.conf.json` in the installer filename. Pre-release strings (`0.1.0-beta.1`)
  are valid in filenames. Tauri may strip the pre-release suffix from the NSIS
  internal `ProductVersion` field (NSIS expects `X.Y.Z.0` internally) but the filename
  and artifact name will correctly include `0.1.0-beta.1`. The GitHub Actions workflow
  uses a `*.exe` glob that will match regardless.
- **Tag timing:** The Git tag `v0.1.0-beta.1` should be created on the merge commit
  of this PR into master, not on the feature branch. The release notes and docs
  reference this tag — do not tag before QA passes.

## Not done

- Windows build not run locally (no Windows environment); depends on GitHub Actions.
- EV code signing — deferred to stable release.
- Auto-update (Tauri updater) — deferred to a future milestone.
- Linux packaging — deferred to a future milestone.
- Automatic GitHub Release on CI push — not configured; manual only.
- Version bump to `0.1.0` (stable) — this is a beta; stable release is a separate milestone.

## Next steps after this PR is merged

1. **Merge this PR** to `master`.
2. **Confirm all CI checks pass** on the merge commit.
3. **Create and push the annotated tag:**
   ```bash
   git checkout master && git pull
   git tag -a v0.1.0-beta.1 -m "First Windows beta"
   git push origin v0.1.0-beta.1
   ```
4. **Trigger the Windows Installer workflow:**
   Go to `Actions → Windows Installer → Run workflow` → select `master` → Run.
5. **Wait for the build** (~15–25 min cold Rust cache, ~5–10 min warm).
6. **Download the artifact** and run Windows 11 QA per
   `docs/BETA_WINDOWS_11_QA_EN.md`.
7. **Create the GitHub prerelease** using the artifact and release notes from
   `docs/releases/v0.1.0-beta.1.md`.

## Final review-context handoff

After all implementation, checks, .ai/cc-report.md update, commit, push, and PR
creation, generate the review context as the last step:

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```
