## Summary

Stage 3D per NSP, on `feature/e2e-stage-3d-placement-validation` →
`roadmap/e2e-wdio` (base `399eeb5`). **Status: PARTIAL** — Placement
Validation task fully delivered; Rack Export task analyzed and explicitly
not implemented, per the NSP's own instruction not to work around a
blocker it couldn't clear cleanly.

**Task 1 — Placement validation: COMPLETE.** New spec
`placement-validation.e2e.ts`, the first in the suite dedicated to
placement *rejection*. Backend error strings were traced to their exact
source before writing any assertion (`ApplicationError::Collision`/
`OutOfRackBounds` in `crates/ris-application/src/session.rs` and
`error.rs`, forwarded verbatim to the frontend via `.map_err(|e|
e.to_string())`) rather than guessed from UI behavior. Six cases: occupied
U, partial overlap, full overlap/containment, exceeds rack height, invalid
start U, invalid height override — each asserts the specific error, that
no placement was created, that the diagram is unchanged, and that this
holds after a real save/close/reopen cycle. Reused every relevant Stage 3C
helper unmodified; added exactly one small spec-local (not exported)
helper for the shared open/fill/submit/expect-rejection sequence, since no
existing helper covered "submit and expect failure."

**Task 2 — Rack export: analyzed, not implemented.** Read
`tauriClient.ts`'s `saveRackViewSvgViaDialog`/`saveRackViewPngViaDialog`
and confirmed both call `@tauri-apps/plugin-dialog`'s `save()`
unconditionally — a real native OS dialog outside the WebView, which
WebDriver cannot drive. Checked whether the app has a non-dialog
alternative (the way repository-open/create's text-path input bypasses its
own native picker) — it does not; export has no such fallback. Per the
NSP's explicit constraints (no test-only hooks, no workarounds), did not
implement anything for this workflow. Instead added a new
**NEEDS APPLICATION CHANGE** status to the coverage doc's key and moved
both rows there, distinct from NEEDS SELECTOR since a `data-testid` alone
wouldn't unblock this — the missing thing is a testable code path, not a
selector.

Both `docs/E2E_WDIO_PLAN.md` and `docs/E2E_WDIO_COVERAGE_GAPS.md` updated
to match reality: Stage 3D marked PARTIAL with the reason; coverage
recounted 45/73 (62%) → 51/78 (65%).

No selectors added, no new helpers beyond the one described above, no new
frameworks/libraries/providers/benchmarks/runners, no CI changes — all per
explicit NSP constraints.

Final HEAD: see `git log -1`. PR to be opened against `roadmap/e2e-wdio`,
not merged.

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/e2e-wdio/specs/placement-validation.e2e.ts` | New — 6 negative placement-validation cases |
| `docs/E2E_WDIO_PLAN.md` | Stage 3D section rewritten to PARTIAL with full delivered/not-implemented breakdown; Program status and Future-stages intro updated; coverage figures refreshed |
| `docs/E2E_WDIO_COVERAGE_GAPS.md` | New NEEDS APPLICATION CHANGE status; Rack placement matrix updated (6 new COVERED rows, 2 reclassified); selector-readiness sections updated; summary counts recomputed (51/78, 65%) |
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

pnpm test:e2e:wdio -- --spec placement-validation   CLEAN_PASS, 116s (run 1)
pnpm test:e2e:wdio -- --spec placement-validation --skip-build   CLEAN_PASS, 117s (run 2)
pnpm test:e2e:wdio -- --spec app-smoke --skip-build   CLEAN_PASS, 6s
```

Ports 4444/4445 free before/after every run; no lingering
tauri-driver/WebKitWebDriver/Xvfb/application-binary processes (checked
via `ps aux` after each run). Full 11-spec suite not re-run: no shared
helper was modified in this pass, only used as-is, consistent with this
program's established "don't re-run untouched specs that don't use
changed helpers" policy.

Note: this repo has no configured lint tool (no ESLint config, no `lint`
script in either `package.json`) — the NSP's "lint" validation step has
nothing to run against; `typecheck` is the closest equivalent and passes.
`apps/desktop/tsconfig.json`'s `include` is `["src"]` only, so
`e2e-wdio/**` is not covered by `pnpm -C apps/desktop typecheck` — a
pre-existing project characteristic, not something introduced or fixed in
this pass; the new spec's correctness was validated by actually running it
(twice, both `CLEAN_PASS`) rather than by static typecheck.

## Risks

- Rack export remains untested. This is a deliberate, documented decision,
  not an oversight — see Task 2 above and the NEEDS APPLICATION CHANGE
  entries in the coverage doc.
- The full WDIO suite was not re-run against this change. Judged
  acceptable since the new spec only reads existing helpers, doesn't
  modify them, and its own external validation (2x CLEAN_PASS) covers
  everything it touches.

## Not done

- Rack export SVG/PNG — moved to NEEDS APPLICATION CHANGE, requires a
  product decision before it can become a testing-stage candidate.
- Stage 3E/3F — not started, per the program's staged plan.
- No lint run — no lint tooling configured in this repo (see Tests note).

## Suggested next step

Human review of this PR. Stage 3E (validation panel, global search,
recent repositories, unsaved-changes-discard, CSV device-model preview
selectors) is the next fully-derivable stage per
`docs/E2E_WDIO_PLAN.md`'s "Future stages" — it should get its own NSP when
picked up. Rack export needs a product-level decision (is a non-dialog
export path worth adding?) before any further E2E work on it makes sense.
