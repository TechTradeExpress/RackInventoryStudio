## Summary

Stage 3E per NSP, on `feature/e2e-stage-3e-selectors` → `roadmap/e2e-wdio`
(base `192720c` — PR #159/Stage 3D merged). **Status: COMPLETE.**

Closed every remaining low-risk NEEDS SELECTOR workflow: unsaved-changes
discard, recent repositories, global search, Device Model CSV import, and
the validation panel (validate/save/filter/navigate — 4 sub-workflows in
one panel). 5 new specs, 10 workflows total, 5 `data-testid`-bearing
application files touched (attribute additions only).

**Audit-first discipline followed throughout:**
- Re-read `docs/E2E_WDIO_PLAN.md` and `docs/E2E_WDIO_COVERAGE_GAPS.md` in
  full before starting; found them already consistent with HEAD (both were
  rewritten in the immediately preceding Stage 3D pass, merged as PR #159,
  no drift since) — no doc corrections needed before implementing.
- Re-verified every target area against actual current component source
  rather than trusting the docs' selector claims: read `ValidationPanel.tsx`,
  `GlobalSearch.tsx`, `RepositoryPanel.tsx` (recent repos),
  `UnsavedChangesDialog.tsx`, and `CsvImportPanel.tsx`'s
  `DeviceModelPreviewTable` directly, confirming each genuinely had zero
  `data-testid` coverage before adding anything.

**Two things found only by running the specs and debugging, not assumed
in advance** (both documented in the relevant spec files and in
`docs/E2E_WDIO_PLAN.md`'s Stage 3E section):
1. `GlobalSearch`'s result `<li role="option">` uses the identical
   `onMouseDown`-based selection pattern as `SearchableSelect`'s own
   options, so `selectSearchableOption()` looked directly reusable — but
   WebKitWebDriver's `getText()` does not reliably return that element's
   full text (a `text-overflow: ellipsis` styling quirk, confirmed by
   comparing `getText()` output against the same element's raw
   `textContent` in the same run). Wrote one small spec-local helper
   matching via `textContent` through `browser.execute()` instead, keeping
   the same Actions-routed click and stale-element-tolerant retry loop.
2. `RepositorySession::validate()` validates the **last-saved on-disk
   state only**, never in-memory unsaved edits — confirmed via its own doc
   comment and implementation in
   `crates/ris-application/src/session.rs`. My first fixture design
   assumed validation would reflect an unsaved device and failed
   consistently; rewrote the spec to exercise this real behavior directly
   (validate before saving → only the pre-existing on-disk issue appears;
   save from the panel; validate again → the new issue appears) rather
   than working around it.

Selector policy respected throughout: no `nth-child`, no xpath, no raw CSS
class selectors, no unscoped text matching in new code (the one text-based
exception — `GlobalSearch` result matching — was already an established
pattern for dynamically-generated content with no fixed identity, same
justification `selectSearchableOption()` itself already relies on).

No new shared helpers were added — the two spec-local exceptions
(`selectSearchResult()` in `global-search-workflow.e2e.ts`,
`getIssueRowCodes()`/`expectFilteredIssueCodes()` in
`validation-panel-workflows.e2e.ts`) are each used only within their own
spec file, per the helper policy's explicit preference.

Final HEAD: see `git log -1`. PR to be opened against `roadmap/e2e-wdio`,
not merged.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src/components/ui/UnsavedChangesDialog.tsx` | Added `unsaved-changes-discard` testid |
| `apps/desktop/src/features/csvImport/CsvImportPanel.tsx` | Added `csv-device-model-preview-table` testid |
| `apps/desktop/src/features/search/GlobalSearch.tsx` | Added `global-search-input` testid |
| `apps/desktop/src/features/repository/RepositoryPanel.tsx` | Added `recent-repo-row`/`data-recent-repo-path`, `recent-repo-remove-btn` |
| `apps/desktop/src/features/validation/ValidationPanel.tsx` | Added `validation-validate-btn`, `validation-save-btn`, `validation-filter-{all,error,warning,info}`, `validation-issue-row`/`data-validation-issue-code`, `validation-issue-navigate-btn`, `validation-save-summary` |
| `apps/desktop/e2e-wdio/specs/unsaved-changes-discard.e2e.ts` | New |
| `apps/desktop/e2e-wdio/specs/recent-repositories-workflow.e2e.ts` | New |
| `apps/desktop/e2e-wdio/specs/global-search-workflow.e2e.ts` | New |
| `apps/desktop/e2e-wdio/specs/csv-device-model-import.e2e.ts` | New |
| `apps/desktop/e2e-wdio/specs/validation-panel-workflows.e2e.ts` | New |
| `docs/E2E_WDIO_PLAN.md` | Stage 3E section rewritten COMPLETE with full delivered breakdown; Program status, Future-stages intro, coverage figures updated |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | 10 rows NEEDS SELECTOR → COVERED; new "Selectors added in Stage 3E" section; existing-specs table updated; summary counts recomputed (61/78, 78%) |
| `.ai/cc-report.md` | This report |

## Tests

```
pnpm -C apps/desktop typecheck           PASS
pnpm -C apps/desktop test                923/923 PASS
node --test scripts/*.test.mjs           223/223 PASS
node scripts/check-repo-hygiene.mjs      PASS
node scripts/check-version-consistency.mjs   PASS
cargo fmt --all --check                  PASS
cargo check --workspace                  PASS
cargo clippy --workspace -- -D warnings  PASS
git diff --check                         PASS

pnpm test:e2e:wdio -- --spec unsaved-changes-discard          CLEAN_PASS x2 (10s, 9s)
pnpm test:e2e:wdio -- --spec recent-repositories-workflow     CLEAN_PASS x2 (7s, 7s)
pnpm test:e2e:wdio -- --spec global-search-workflow           CLEAN_PASS x2 (9s, 9s)
pnpm test:e2e:wdio -- --spec csv-device-model-import          CLEAN_PASS x2 (10s, 10s)
pnpm test:e2e:wdio -- --spec validation-panel-workflows       CLEAN_PASS x2 (13s, 13s)
pnpm test:e2e:wdio -- --spec app-smoke --skip-build            CLEAN_PASS (5s)
```

Ports 4444/4445 free before/after every run; no lingering
tauri-driver/WebKitWebDriver/Xvfb/application-binary processes. Full
11+-spec suite not re-run — no shared support/ helper was modified in this
pass (only application-source `data-testid` additions and two spec-local
functions), consistent with the program's established re-run policy.

No lint tool is configured in this repo (no ESLint config, no `lint`
script) — nothing to run for that step, same as noted in the Stage 3D
report.

## Risks

- `global-search-workflow.e2e.ts`'s WebKitWebDriver `getText()` quirk was
  confirmed on this environment/driver version; if the driver changes
  behavior in the future, the spec-local `textContent`-based workaround
  may become unnecessary (harmless either way) or, less likely, could
  itself need revisiting if `textContent` semantics ever change for
  ellipsis-clipped elements.
- `validation-panel-workflows.e2e.ts` depends on two specific validation
  issue codes (`VAL-DEV-013`, `VAL-LOC-005`) continuing to fire under the
  exact fixture shape used (one unplaced device with a model, zero
  locations). If validation rules change in a future pass, this spec would
  need re-verification against the new rule set — same category of risk
  every other spec that asserts on a specific backend-generated string
  already carries.

## Not done

- Stage 3F (git workflow) — not started, per the program's staged plan and
  this NSP's explicit exclusion.
- Rack export (NEEDS APPLICATION CHANGE) — unchanged from Stage 3D, still
  requires a product decision before any further E2E work.
- No lint run — no lint tooling exists in this repo.

## Suggested next step

Human review of this PR. Stage 3F (git init/validate/commit/add-remote —
the entire remaining NEEDS SELECTOR backlog) is the next fully-derivable
stage per `docs/E2E_WDIO_PLAN.md`'s "Future stages"; it should get its own
NSP given git operations mutate real repository state and warrant a
dedicated risk review, per this program's own working model.
