## Summary

PR 14: QA runbook for beta.3 and minor wording cleanup.

This PR is **docs + copy** — no logic, no new features, no version bump.

### Repair (align QA runbook expectations)

- **Runbook 5.8**: corrected expected behaviour for Device Type auto-fill.
  The previous text implied that clearing Device Type manually and then
  selecting a model would re-trigger auto-fill. This contradicts the PR 10
  implementation, which sets a `deviceTypeTouched` flag on any manual
  interaction so that subsequent model selections no longer overwrite the
  field in the same session. Updated text: "Device Type remains manually
  controlled; model selection does not auto-fill again in this session."
- **Runbook 10.4**: updated log directory status wording to match the UI
  labels changed in this PR. Was: `"accessible" or "not yet created"`.
  Now: `"accessible"`, `"will be created on first log write"`, or
  `"not writable — check permissions"`.
- **Roadmap PR 8 description**: clarified that PR 8 added test IDs and
  component test coverage for the front/rear toggle (not keyboard/ARIA
  improvements — those were PR 9).
- No logic, DTO, or Rust changes. Version unchanged.

- Added `docs/BETA3_QA_RUNBOOK.md`: a full manual QA checklist for all
  beta.3 features (12 sections, ~80 test cases).
- Updated `docs/BETA3_ROADMAP.md`: all 14 PRs marked complete with one-line
  summaries; added a "Remaining before beta.3 release" section.
- Improved three dir-status labels in the Settings panel from cryptic
  parenthetical phrases to clearer inline text; tests updated to match.

## Base branch / Working branch

- Base: `roadmap/beta3`
- Branch: `docs/beta3-qa-runbook-wording`

## Files changed

| File | Change |
|---|---|
| `docs/BETA3_QA_RUNBOOK.md` | New: 12-section manual QA runbook, ~80 test cases |
| `docs/BETA3_ROADMAP.md` | Updated: all PRs marked done; remaining release steps added |
| `apps/desktop/src/features/settings/SettingsPanel.tsx` | Wording: `(exists, writable)` → `(accessible)`, `(exists, not writable)` → `(not writable — check permissions)`, `(not yet created)` → `(will be created on first log write)` |
| `apps/desktop/src/features/settings/SettingsPanel.test.tsx` | Updated three test strings to match new status labels |

## QA runbook description

`docs/BETA3_QA_RUNBOOK.md` covers:

1. Repository open / create / clone (9 cases)
2. List views: scroll, pagination, counters (5 cases)
3. Search, sort, filter (9 cases)
4. Searchable selects and keyboard navigation (11 cases)
5. Device form: work mode defaults and Device Type auto-fill (8 cases)
6. Create similar for Devices and Device Models (6 cases)
7. Placement flow and Rack Object form (9 cases)
8. Front/rear rack side view (5 cases)
9. Export SVG and PNG (9 cases)
10. Logs and diagnostics (13 cases)
11. Git operations regression (6 cases)
12. Final regression (5 cases)

Includes preconditions, expected artifacts table, and known limitations section.

## Wording cleanups

| Location | Before | After |
|---|---|---|
| Settings: active dir status (accessible) | `(exists, writable)` | `(accessible)` |
| Settings: active dir status (problem) | `(exists, not writable)` | `(not writable — check permissions)` |
| Settings: active dir status (new) | `(not yet created)` | `(will be created on first log write)` |

No other UI text changed. Clone, export, work mode, create similar, and
SearchableSelect strings were reviewed and found consistent.

## Tests

```
git diff --check                       → clean
node scripts/check-version-consistency.mjs → 0.1.0-beta.2, all match
node --test scripts/*.test.mjs         → 19 passed, 0 failed
node scripts/check-repo-hygiene.mjs    → 8/8 checks passed
pnpm -C apps/desktop exec tsc --noEmit → 0 errors
pnpm -C apps/desktop exec vitest run   → 789 passed, 0 failed
pnpm -C apps/desktop exec vite build   → success
```

Rust checks skipped: no Rust files changed.

## Risks

- QA runbook is prose + checklists; no automated enforcement.
- Dir status wording change is cosmetic only; no logic touched.

## What remains before beta.3 release

1. Run full manual QA from `docs/BETA3_QA_RUNBOOK.md`.
2. Fix any blockers found.
3. Prepare a release PR: version bump, CHANGELOG, release notes.

## Version / tag / release

Version unchanged (0.1.0-beta.2). No tags created. No GitHub Release created.
