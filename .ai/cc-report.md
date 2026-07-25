## Summary

Documentation-only maintenance/planning pass, committed directly to
`roadmap/e2e-wdio` (no PR, no branch — per explicit instruction). Base:
`db6752d` (PR #158 merged — embedded WDIO provider removal). Final:
`7ec419b`.

Reconciled `docs/E2E_WDIO_PLAN.md` and `docs/E2E_WDIO_COVERAGE_GAPS.md`
with actual repo state, treating the repo (not the prior docs) as source
of truth throughout.

**`E2E_WDIO_PLAN.md`:** the "Program status" table and every per-stage
status line were stale — "Stage 2 COMPLETED" at the top while Stage 3
(3A–3C) and two subsequent technical passes (provider benchmark, embedded
removal) were already fully merged; Stage 3B.2 and 3B.4 still marked "IN
REVIEW" despite their PRs (#152, #154) having merged long ago. All fixed,
each with the actual merge commit cited. The pre-Stage-3 "Remaining
candidate areas" planning list was marked historical/superseded (several
items it listed as open were actually done). Stage 3B.3's forward-looking
"embedded deferred to a future stage, contingent on an upstream fix"
prediction — which did not hold (embedded was later restored via a
test-side fix, benchmarked, then fully removed) — got an explicit
"what actually happened next" annotation rather than being silently left
to mislead a reader. Two now-resolved risk-table items (`tauri-plugin-wdio`
scope/overhead) were moved to a "Resolved" note. A stale "~51 minute full
suite" runtime claim was replaced with an honest statement of what is
and isn't currently known (no fresh full-suite timing exists post
Stage 3B.4/3C optimization — I did not run one, per the instruction not to
run large validations in this pass). The generic "Future stages"
placeholder was replaced with a concrete Stage 3D (scoped in detail:
rack export SVG/PNG + U-occupancy negative-path spec, zero new selectors)
plus sketched Stage 3E (low-risk selector additions) and 3F (git workflow,
kept separate for its distinct risk profile), derived from the rewritten
gap analysis rather than copied from the old placeholder list.

**`E2E_WDIO_COVERAGE_GAPS.md`:** fully re-verified against current source,
not carried forward.
- Existing-specs table updated for the Stage 3C consolidation
  (`entity-deletes-inventory`/`-hierarchy` → `entity-deletes`;
  `destructive-guards-inventory`/`-hierarchy` → `destructive-guards`) and
  the two Stage 3C-era specs (`placement-inspector-workflows`,
  `searchable-select-regression`, the latter existed before but was never
  in this table).
- 4 placement workflows promoted MISSING → COVERED (edit height U, remove
  via `EditPlacementModal`, inspector navigate to device/model — all
  covered by `placement-inspector-workflows.e2e.ts` in Stage 3C).
- 3 workflows reclassified MISSING → NEEDS SELECTOR after checking the
  actual component source: the prior version's own notes already said
  "selector absent" for these rows, which contradicts this document's own
  MISSING/NEEDS SELECTOR definitions (checked directly:
  `UnsavedChangesDialog.tsx`'s discard button and
  `CsvImportPanel.tsx`'s `DeviceModelPreviewTable` genuinely have no
  `data-testid`).
- 2 workflows added that weren't tracked before: U-occupancy/collision
  negative-path testing (MISSING — no dedicated negative spec exists, but
  selectors are the same as every existing placement spec) and
  move-between-racks (DEFERRED — confirmed via `EditPlacementModal.tsx`
  and `RackDetailPanel.tsx` that the application has no UI for it at all,
  so it isn't a testing gap, just genuinely unsupported).
- Confirmed `export-svg-btn`/`export-png-btn` still exist in
  `RackDetailPanel.tsx` (spot-checked directly, since an earlier grep
  attempt in this pass falsely returned no match).
- Summary counts fully recomputed by hand-counting every row (then
  cross-checked with a small counting script) rather than trusting the
  prior table — the 2026-07-22 version's own summary (67 total, 6 MISSING)
  did not match its own matrix (69 rows counted, 9 tagged MISSING).
  Corrected total: **73 workflows, 45 COVERED (62%)**.

No test, TypeScript, Rust, selector, helper, `package.json`, CI, or
benchmark changes — this pass was documentation only, per explicit
instruction.

## Files changed

| File | Change |
|------|--------|
| `docs/E2E_WDIO_PLAN.md` | Status reconciliation (Program status table, per-stage status lines, resolved-risks note, stale runtime claim, historical annotations); "Future stages" replaced with concrete Stage 3D scope + 3E/3F sketch |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | Fully re-verified rewrite: spec list, 4 MISSING→COVERED promotions, 3 MISSING→NEEDS SELECTOR reclassifications, 2 newly-tracked workflows, recomputed summary counts |
| `.ai/cc-report.md` | This report |

## Tests

None run — this pass is documentation-only per explicit instruction ("Nie
uruchamiać dużych walidacji"). All classification/status claims were
verified by reading current source/spec files directly (`grep`/`Read`),
not by executing tests or builds.

## Risks

- The "~51 minute full suite" runtime figure was removed rather than
  replaced with a fresh number, since producing one would require running
  the full suite (out of scope for this pass). A future pass that does run
  the full suite should record the actual current figure.
- Stage 3D's rack-export scope flags an open question (native save-dialog
  automation feasibility) for its own NSP rather than resolving it here —
  intentional, since resolving it would require reading/testing
  application behavior beyond a docs pass.
- The corrected coverage-gap counts (73 total, 45 COVERED, 62%) supersede
  the 2026-07-22 version's numbers; anything referencing the old "67
  total / 57%" figures elsewhere (if any exist outside these two
  documents) was not searched for in this pass, since the task scope was
  limited to these two files.

## Not done

- No selector implementation, no new specs, no CI changes — explicitly out
  of scope per the task brief.
- Stage 3D/3E/3F are proposals only, not started.
- Full-suite runtime re-measurement (see Risks).

## Suggested next step

Pick up Stage 3D (rack export SVG/PNG + U-occupancy negative-path spec) —
it's the only fully-scoped, zero-new-selector item in the current gap
analysis. Start with an NSP resolving the rack-export native-dialog
question flagged in `docs/E2E_WDIO_PLAN.md`'s Stage 3D section before
committing to full coverage there.
