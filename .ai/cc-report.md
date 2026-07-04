## Summary

Stage 0: E2E testing roadmap planning branch created.

Branch `roadmap/e2e-wdio` created from `development` at commit `e1fd3f5`.
No dependencies installed. No app code changed. No version bump. No tags.
The only deliverable is a written E2E implementation plan document and a
reference note in the existing beta 3 roadmap doc.

---

## Stage 0 purpose

Establish the base roadmap branch and written plan for adopting WebdriverIO
(`@wdio/tauri-service`) as the real desktop E2E layer on top of the existing
Playwright browser-mode smoke suite.

---

## Base branch

- Source branch: `development`
- Branch point commit: `e1fd3f5cdd72c18546bac079a04ffc0aa34a3d54`
- New branch: `roadmap/e2e-wdio`

---

## Files changed

| File | Change |
|---|---|
| `docs/E2E_WDIO_PLAN.md` | New: full staged E2E implementation plan |
| `docs/BETA3_ROADMAP.md` | Added 4-line note at end pointing to `roadmap/e2e-wdio` and the plan doc |
| `.ai/cc-report.md` | This report |

---

## Repository audit findings

| Item | Detail |
|------|--------|
| Package manager | `pnpm` (v10.33.4, workspace) |
| Frontend package | `apps/desktop/` |
| Tauri package | `apps/desktop/src-tauri/` |
| Tauri version | v2 |
| Existing unit test script | `vitest run` (Vitest + Testing Library) |
| Existing e2e script | `test:e2e` — Playwright browser mode, mocked Tauri APIs (`apps/desktop/e2e/`) |
| CI Linux | ubuntu-24.04 (`ci.yml`) |
| CI Windows | windows-latest (`windows-installer.yml`) |
| WDIO present | No — not installed yet |
| `@wdio/tauri-service` present | No — not installed yet |

---

## Proposed PR breakdown

| PR | Branch | Target | Purpose |
|----|--------|--------|---------|
| PR-1 | `feature/e2e-wdio-foundation` | `roadmap/e2e-wdio` | Install WDIO deps, `wdio.conf.ts`, minimal smoke spec |
| PR-2 | `feature/e2e-wdio-selectors` | `roadmap/e2e-wdio` | Stable `data-testid` attributes for WDIO selectors |
| PR-3 | `feature/e2e-wdio-repo-lifecycle` | `roadmap/e2e-wdio` | Create/open repository E2E via temp dirs |
| PR-4 | `feature/e2e-wdio-core-inventory` | `roadmap/e2e-wdio` | Location → Rack → Device Model → Device → Placement happy path |
| PR-5 | `feature/e2e-wdio-import-export` | `roadmap/e2e-wdio` | CSV import and rack SVG/PNG export E2E |
| PR-6 | `feature/e2e-wdio-clone-safety` | `roadmap/e2e-wdio` | Clone URL rejection UI smoke |
| PR-7 | `feature/e2e-wdio-ci` | `roadmap/e2e-wdio` | CI job (manual/`workflow_dispatch` first) |
| Integration | `roadmap/e2e-wdio` | `development` | Final squash-merge into `development` |

---

## Confirmations

- No E2E dependencies installed ✓
- No app code changed ✓
- No Rust code changed ✓
- No version bump ✓
- No tags created ✓
- No GitHub Release ✓
- No `.ai/review-context-*.md` committed ✓

---

## Checks run

Since Stage 0 is documentation only:

```
git diff --check                         → clean
node scripts/check-version-consistency.mjs  → result below
node --test scripts/*.test.mjs           → result below
node scripts/check-repo-hygiene.mjs      → result below
```

Frontend / Rust format / lint checks skipped — no app code changed.

---

## Risks

- Driver availability on Linux CI (WebKitGTK) unknown until PR-7.
- Windows WebView2 driver version matching may need caching strategy.
- Tauri binary compilation required before WDIO tests; significant CI time.
- Native Save/Open dialogs may be hard to automate; deferred to PR-5 evaluation.
- `tauri-plugin-wdio` (advanced IPC) deferred until PR-1 evaluates whether
  normal WebDriver interactions are sufficient.

---

## Not done

- WDIO dependencies not installed (intentional; Stage 0 is planning only).
- No `wdio.conf.ts` yet (PR-1).
- No selector additions yet (PR-2).
- No CI job yet (PR-7).

---

## Suggested next step

Open PR-1: `feature/e2e-wdio-foundation` → `roadmap/e2e-wdio`

Tasks for PR-1:
1. `pnpm add -D webdriverio @wdio/cli @wdio/tauri-service @wdio/local-runner @wdio/mocha-framework` in `apps/desktop/`.
2. Add `apps/desktop/e2e-wdio/wdio.conf.ts`.
3. Add `apps/desktop/e2e-wdio/specs/app-smoke.e2e.ts` (launch, verify shell, close).
4. Add `"test:e2e:wdio": "wdio run e2e-wdio/wdio.conf.ts"` to `apps/desktop/package.json`.
5. Confirm smoke runs locally.
6. Update `docs/E2E_WDIO_PLAN.md`: mark PR-1 in progress, document driver choice.
