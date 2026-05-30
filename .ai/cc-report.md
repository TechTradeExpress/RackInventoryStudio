# CC Report — PR G: Release/signing/versioning hardening

## Summary

Hardened the Windows installer path (now vendor-prefixed), documented the full
release and code-signing process, and confirmed the versioning toolchain is
already CI-enforced. The diagnostic installer workflow remains absent (hygiene
check #7/#8 enforces it). No functional changes to app code.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/nsis/main.nsi` | New — custom NSIS template; only change vs. upstream default is `$INSTDIR` defaults in `Function .onInit` (vendor-prefixed path) |
| `apps/desktop/src-tauri/tauri.conf.json` | Added `bundle.publisher: "TechTradeExpress"` and `bundle.windows.nsis.template: "nsis/main.nsi"` |
| `docs/RELEASE_PROCESS_EN.md` | New — canonical release process: versioning, branch/tag naming, pre-release checks, build steps, install path, unsigned-artifact notes, manual EV signing flow, hotfix/rollback |
| `docs/release.md` | Added "Windows installer path" section documenting the new vendor-prefixed path |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | Marked PR G as Implemented; updated install-path description to reflect the now-complete custom NSIS template |

## Tests

```
git diff --check                                     # clean
node scripts/check-version-consistency.mjs           # ✓ all versions match: 0.1.0-beta.1
node --test scripts/*.test.mjs                       # 17 tests — all passed
node scripts/check-repo-hygiene.mjs                  # 8/8 checks passed
cargo fmt --all --check                              # clean
cargo check --workspace                              # clean
cargo test --workspace                               # clean
cargo clippy --workspace -- -D warnings              # clean
npx tsc --noEmit                                     # clean
npx vitest run                                       # 534 tests — 42 files — all passed
```

## Risks

- The custom NSIS template (`nsis/main.nsi`) is a fork of the Tauri v2 default.
  When Tauri is upgraded, the upstream template must be checked for changes and
  any relevant updates merged into this file. A maintenance comment at the top
  of the file documents this. Reference URL is included.
- The template was extracted from the Tauri CLI binary (strings output) since
  no standalone file is shipped. The extracted template was verified to be a
  faithful copy — no unknown diffs beyond the path change.
- `bundle.publisher: "TechTradeExpress"` sets the MANUFACTURER in registry
  entries (`HKLM\Software\TechTradeExpress\...`). This is separate from the
  filesystem path (which is set by the template).
- The installer is still unsigned. SmartScreen bypass is expected and documented.

## Not done

- CI-based code signing — not configured; requires a real EV certificate and
  secret management. The manual signing flow is documented in `RELEASE_PROCESS_EN.md`.
- `unsavedGuard.ts` cleanup (left from PR F) — intentionally deferred.

## Suggested next step

Obtain an EV Authenticode certificate and add optional CI signing
(using GitHub Actions secrets, skipped unless secrets are present) as
a follow-up to the stable release milestone.

## Final review-context handoff

After all implementation, checks, and `.ai/cc-report.md` update, generate the review context as the last step using a timestamped filename.
The base branch for this repository is `master` unless explicitly instructed otherwise.

```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```

The file `.ai/review-context-YYYYMMDD-HHMM.md` should be attached or pasted to ChatGPT as the code review context before approving the milestone.
