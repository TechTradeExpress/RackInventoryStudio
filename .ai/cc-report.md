## Summary

CI hardening — pin runner images and add workflow linting (follows PR #80). Replaced all `ubuntu-latest` references in `ci.yml` with the explicit `ubuntu-24.04` image to prevent silent runner drift. Added a new `workflow-lint` CI job that runs `raven-actions/actionlint@v2` to lint all `.github/workflows/*.yml` files on every pull request and push.

No product behavior changes. No frontend UI changes. No Rust/Tauri changes. No version bump. No new runtime or dev dependencies.

## Files changed

- `.github/workflows/ci.yml` — Pinned all four Linux jobs (`rust`, `version-check`, `scripts`, `frontend`) from `ubuntu-latest` to `ubuntu-24.04`. Added new `workflow-lint` job using `raven-actions/actionlint@v2` on `ubuntu-24.04`.
- `CHANGELOG.md` — Added `## Unreleased — CI runner pinning and workflow linting` section.

## Workflows changed

`.github/workflows/ci.yml`:

| Job | Before | After |
|-----|--------|-------|
| `rust` | `ubuntu-latest` | `ubuntu-24.04` |
| `version-check` | `ubuntu-latest` | `ubuntu-24.04` |
| `scripts` | `ubuntu-latest` | `ubuntu-24.04` |
| `frontend` | `ubuntu-latest` | `ubuntu-24.04` |
| `workflow-lint` | *(new)* | `ubuntu-24.04` + `raven-actions/actionlint@v2` |

`.github/workflows/windows-installer.yml`: unchanged — `windows-latest` retained (manual-only workflow, no reason to pin).

## Runner pinning details

- Replaced 4× `ubuntu-latest` → `ubuntu-24.04`.
- `ubuntu-24.04` is the current LTS image behind `ubuntu-latest` as of May 2026; pinning makes the runner version explicit so future image promotions (e.g., `ubuntu-latest` → `ubuntu-26.04`) do not silently change CI behaviour.
- `windows-latest` in the Windows Installer workflow is left unpinned — it is a manual-only workflow with no automated triggers, and there is no pinned Windows image equivalent in scope for this PR.

## Actionlint integration details

- New job: `workflow-lint` / "Workflow lint" on `ubuntu-24.04`.
- Uses `raven-actions/actionlint@v2` — installs the latest stable actionlint release and lints `.github/workflows/*.yml`.
- Fails CI on any actionlint syntax or semantic error (no silent suppression).
- Lightweight: checkout + actionlint only, no pnpm/Node setup.
- `actionlint` was not available locally — lint correctness is verified by the GitHub Actions run.

## Checks run locally

```
git diff --check                                → clean
node scripts/check-version-consistency.mjs      → 0.1.0 consistent
node --test scripts/*.test.mjs                  → 17 pass, 0 fail
node scripts/check-repo-hygiene.mjs             → 8/8 checks passed
tsc --noEmit (apps/desktop)                     → clean
vitest run (apps/desktop)                       → 388 pass, 32 files
playwright test (apps/desktop)                  → 17 pass
cargo fmt --all --check                         → clean
cargo check --workspace                         → clean
cargo test --workspace                          → clean
cargo clippy --workspace -- -D warnings         → clean
no apps/desktop/package-lock.json               → ok
no tracked .ai/review-context-*.md              → ok
actionlint (local)                              → not available; verified by CI
```

## Known risks

- `raven-actions/actionlint@v2` resolves to the latest patch within the v2 major — a breaking change in v2.x would affect the lint job. Major version tags are the standard GitHub Actions convention; risk is low.
- actionlint was not available locally for pre-push verification. The `workflow-lint` CI job is the authoritative validator for this PR.
- `ubuntu-24.04` is explicitly supported by GitHub-hosted runners. If GitHub deprecates this image label before a new pin PR is merged, the Linux jobs will fail — but image labels are deprecated on long notice cycles (months).

## Not done

- `windows-latest` in `windows-installer.yml` not pinned — manual-only workflow, out of scope.
- No actionlint config file (`.actionlint.yml`) added — the default configuration is sufficient for the current workflows.

## Suggested next step

Monitor the `workflow-lint` CI job on this PR for any actionlint findings; fix any real issues before merging.
