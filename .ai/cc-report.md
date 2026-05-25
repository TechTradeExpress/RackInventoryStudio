# Docs cleanup — align with current beta state (Milestones A–F)

## Summary

Documentation-only pass aligning all docs with the actual current state after Beta QA hardening milestones A–F. No application code changed. Updated test counts, replaced stale placement-table/Add-Placement-form references with diagram-first placement descriptions, updated roadmap, and added archival banners to pre-hardening historical documents.

## Files changed

| File | Change |
|------|--------|
| `README.md` | Updated test counts; updated "Current desktop UI capabilities" and "What is implemented" sections for diagram-first placement, inline device creation, Settings → Diagnostics and logs; updated roadmap table (Milestones A–F all Done); updated v1.0.0 release gate to reference current QA doc |
| `CHANGELOG.md` | Added Unreleased entry for this cleanup |
| `docs/BETA_HARDENING_PLAN_EN.md` | Added archival banner; updated current-state table (rack detail row, test counts) |
| `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` | Added archival banner (pre-hardening checklist with placement table / Add Placement form) |
| `docs/UX_AUDIT_PREP_EN.md` | Added archival banner (pre-audit brief with AddPlacementPanel references) |
| `docs/UI_SCREENS_SPEC_EN.md` | Added archival banner (MVP screen spec with placement table) |
| `docs/USER_WORKFLOWS_EN.md` | Added archival banner (MVP workflows with Add Placement form) |

## Docs audited and not changed

| File | Verdict |
|------|---------|
| `docs/BETA_RELEASE_PROCESS_EN.md` | Accurate — no changes needed |
| `docs/BETA_WINDOWS_11_QA_EN.md` | Accurate — updated in Milestone F |
| `docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md` | Accurate — all milestones A–F have status lines |
| `.ai/windows-installer-ci.md` | Accurate — updated in Milestone F |

## Grep verification results after edits

```
grep: "Windows Diagnostic Installer / windows-diagnostic-installer" → NONE
  (only in CHANGELOG as valid historical removal notes)

grep: "placement table / Front placements / Rear placements" → NONE in active instructions
  (remains in CHANGELOG historical entries, BETA_QA_FINDINGS_ACTION_PLAN_EN.md
  as problem-statement context, older docs now marked archival, e2e smoke tests
  as assertions that they do NOT exist)

grep: "AddPlacementPanel / Add Placement / inline add form" → NONE in active instructions
  (only in docs now marked archival)
```

## Current canonical version

All four version sources remain at **0.1.0** — no version bump was made or needed.

## Checks run

```
git diff --check                           → clean
node scripts/check-version-consistency.mjs → 0.1.0 consistent
tsc --noEmit                               → clean
vitest run                                 → 388 passed (32 files)
vite build                                 → clean
playwright test                            → 16 passed
cargo fmt --all --check                    → clean
cargo check --workspace                    → clean
cargo test --workspace                     → 374 passed
cargo clippy --workspace -- -D warnings    → clean
test ! -f apps/desktop/package-lock.json  → OK
no tracked .ai/review-context-*.md        → OK
```

## Known risks

- `docs/BETA_HARDENING_PLAN_EN.md` Milestone 4 section still describes the pre-hardening placement table plan in detail. This is intentional — it is preserved as historical context. The archival banner at the top makes this clear.
- `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md`, `docs/UX_AUDIT_PREP_EN.md`, `docs/UI_SCREENS_SPEC_EN.md`, `docs/USER_WORKFLOWS_EN.md` retain their original stale content below the archival banners. Banners redirect readers to the current docs.
- No application source, tests, scripts, or workflow behavior was changed.

## Suggested next step

Perform the first full beta release cycle: cut `release/v0.2.0`, bump version, trigger Windows Installer workflow, complete Windows 11 QA, create `v0.2.0-beta.1` tag and GitHub Release.
