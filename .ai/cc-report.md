# Milestone F — Release/versioning/installer process

## Summary

Finalized the beta release and versioning process. Removed the Windows Diagnostic Installer workflow and its companion docs. Added a `bump-version.mjs` helper script to update all four canonical version sources atomically. Rewrote `BETA_RELEASE_PROCESS_EN.md` with a concrete step-by-step release workflow, SemVer policy, pre-release tag convention, and release branch naming. Updated all other docs to reference only the standard Windows Installer. The repo now has exactly one installer workflow.

## Files deleted

| File | Reason |
|------|--------|
| `.github/workflows/windows-diagnostic-installer.yml` | Windows Diagnostic Installer workflow removed |
| `.ai/windows-diagnostic-installer.md` | Companion CI reference doc removed |

## Files changed

| File | Change |
|------|--------|
| `scripts/bump-version.mjs` | **New** — Node ESM version bump helper for all four canonical sources |
| `package.json` | Added `"bump:version": "node scripts/bump-version.mjs"` script |
| `docs/BETA_RELEASE_PROCESS_EN.md` | **Rewritten** — SemVer policy, pre-release tags, release branch naming, version bump helper, step-by-step release workflow (A–E) |
| `docs/BETA_WINDOWS_11_QA_EN.md` | Removed diagnostic artifact rows; updated rack placement checks for current UX; updated exit criteria |
| `docs/BETA_HARDENING_PLAN_EN.md` | Removed diagnostic installer references; updated artifact naming and release checklist steps |
| `docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md` | Added status line to Milestone F section |
| `.ai/windows-installer-ci.md` | Removed diagnostic workflow cross-reference; added links to release process and QA docs |
| `README.md` | Updated Windows installer section; added diagnostics-as-app-feature note |
| `CHANGELOG.md` | Added Milestone F entry; updated historical diagnostic installer entries |
| `.ai/cc-report.md` | This file |

## Current canonical version

All four version sources are at **0.1.0**. No version bump was required — all files were already consistent.

## Version bump helper validation

`scripts/bump-version.mjs` was tested:
- No args → usage message + exit 1
- Invalid format (`not-semver`) → error message + exit 1
- Current version (`0.1.0`) → "nothing to do" + exit 0
- New version (`0.2.0-beta.1`) → updates all four files; `check-version-consistency.mjs` confirms 0.2.0-beta.1; files restored to 0.1.0

## Final installer workflow state

| Workflow | File | Artifact name | Status |
|---|---|---|---|
| Windows Installer | `windows-installer.yml` | `rack-inventory-studio-vX.Y.Z-windows-installer` | **Active** |
| ~~Windows Diagnostic Installer~~ | ~~removed~~ | ~~removed~~ | **Deleted** |

## Tests/checks run

```
git diff --check             → clean
node scripts/check-version-consistency.mjs → 0.1.0 consistent
tsc --noEmit                 → clean
vitest run                   → 388 passed (32 files)
vite build                   → clean
playwright test              → 16 passed
cargo fmt --all --check      → clean
cargo check --workspace      → clean
cargo test --workspace       → clean
cargo clippy --workspace -- -D warnings → clean
test ! -f apps/desktop/package-lock.json → OK
git ls-files '.ai/review-context-*.md'  → OK (none tracked)
```

actionlint not available on this runner (noted).

## Known risks

- Historical entries in `CHANGELOG.md` still reference the diagnostic installer by name (as a documented removal), which is intentional and correct.
- Code signing is still not implemented — SmartScreen warning remains expected on all beta builds.
- `bump-version.mjs` does not update `Cargo.lock` (which Cargo regenerates automatically on next build). This is intentional — the script should not touch lockfiles.

## Manual release checklist

- [ ] `node scripts/bump-version.mjs X.Y.Z` — updates all four files
- [ ] `pnpm check:version` — verify consistency
- [ ] Update `CHANGELOG.md` — move Unreleased to new version section
- [ ] Commit version bump and changelog
- [ ] Push `release/vX.Y.Z` branch, open PR, wait for CI green
- [ ] GitHub Actions → Windows Installer → Run workflow (select release branch)
- [ ] Download artifact, confirm `.exe` present
- [ ] Install on Windows 11, accept SmartScreen, launch, run QA checklist
- [ ] Verify Settings → Diagnostics and logs → logs appear, no sensitive data
- [ ] `git tag -a vX.Y.Z-beta.1 -m "..."` + `git push origin vX.Y.Z-beta.1`
- [ ] GitHub → Releases → Draft release, attach installer zip, mark pre-release
- [ ] Publish release

## Suggested next step

Perform the first full beta release cycle: run `node scripts/bump-version.mjs 0.2.0-beta.1`, cut `release/v0.2.0`, trigger the Windows Installer workflow, complete the Windows 11 QA checklist, and create the first GitHub beta release.
