# cc-report — milestone/playwright-smoke-tests

## Branch

`milestone/playwright-smoke-tests` — exploratory local branch.

**PR:** none — not yet created  
**Push:** not yet performed  
**Latest code commit hash:** 9ae80db (pre-PR polish code commit)  
**Status:** ready for PR after this cleanup commit

### Note on .ai/cc-report.md

This file is intentionally committed as an artefact of the current milestone/review workflow.
It is tracked in git on this branch so the build-review-context.sh script can include it in
the ChatGPT review context. It is covered by the root .gitignore entry for `.ai/`, but was
force-added (`git add -f`) to make it available to the review script.

---

## Goal

Playwright Smoke Tests Foundation — establish a Vite/web-based Playwright smoke layer for the
desktop app so that golden-path flows are verifiable without a full Tauri binary.

---

## Iteration History

### Foundation commit (d6d28a9)
Initial Playwright setup: 6 smoke tests, Vite E2E config, Tauri mocks.

### Repair commits (62af0bc, a3118dc, ae75537)
- Root .gitignore Playwright artifact ignores committed.
- Desktop .gitignore updated with playwright-report/.
- MVP smoke test checklist updated.
- cc-report.md committed.

### Hardening pass (31b90c3)
- Console error guard promoted from test-1-only to global page fixture.
- Mock invoke() converted to per-command switch with argument validation.

### Final pre-PR polish (9ae80db)
- open_repository_cmd mock restricted to FIXTURE_REPO_PATH only.
- search_repository_cmd mock returns [] for non-fixture queries.
- Added smoke test 7: short query suppression + no-results empty state.
- Docs updated: smoke test count 6 → 7.

### Non-blocking cleanup (this commit)
- Removed numeric prefixes from all 7 smoke test names.
- Reordered tests: rack detail now appears before search edge cases.
- Updated docs/MVP_SMOKE_TEST_CHECKLIST_EN.md: replaced branch-specific wording with
  merge-neutral description ("implemented as a Vite/web smoke layer").

---

## Summary of Changes

- Added Playwright as smoke test foundation (`@playwright/test` devDependency).
- Added `test:e2e` script to `package.json`.
- Added `playwright.config.ts` (Firefox, port 1421, Vite web server).
- Added `vite.config.e2e.ts` with Vite resolve aliases replacing Tauri packages with mocks.
- Added `e2e/mocks/tauri-core.ts` — invoke() mock with per-command argument validation.
- Added `e2e/mocks/tauri-dialog.ts` — file dialog mock returning fixture path or null.
- Added `e2e/smoke.spec.ts` — 7 Playwright smoke tests with global console error guard.
- Added ignore for `test-results/` and `playwright-report/` in both .gitignore files.
- Updated `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` Playwright section.

---

## Implementation Decision: Web/Vite Runner, not Full Tauri E2E

Tests run against a Vite dev server (port 1421) — not the compiled Tauri shell.

**Tauri IPC mocked via Vite aliases:**

| Package import | Replaced by |
|---|---|
| `@tauri-apps/api/core` | `e2e/mocks/tauri-core.ts` |
| `@tauri-apps/plugin-dialog` | `e2e/mocks/tauri-dialog.ts` |

The Rust backend is not running during Playwright tests.

---

## Console Error Guard

The `page` fixture is overridden via `base.extend()` so every test collects `console.error`
events and fails if any are emitted. No filtering is applied — the mock layer is clean.

---

## Mock Argument Validation

| Command | Validated argument | Validation rule |
|---|---|---|
| `open_repository_cmd` | `path` | non-empty string AND must equal FIXTURE_REPO_PATH |
| `search_repository_cmd` | `query` | string; `[]` if trimmed length < 2; `[]` if no fixture keyword match |
| `preview_device_csv_import_cmd` | `csvContent` | non-empty string |
| `import_device_csv_cmd` | `csvContent` | non-empty string |
| `read_csv_file` | `path` | string if provided |

---

## Browser Decision: Firefox

Chromium requires `libnspr4.so` unavailable in WSL2 dev environment without sudo. Firefox
is a valid CI browser. Single-browser config kept — no matrix added.

---

## Smoke Tests (7)

| Test name | What it verifies |
|---|---|
| app shell loads without console errors | Heading visible, Validation tab disabled, zero console errors |
| open repository enables all tabs | Fill path, click Open, all 7 tabs enabled, search bar visible |
| global search shows results and navigates to Locations | Type "server", see "Server Room A", click → Locations tab |
| validation panel shows issues and navigates on click | Click Validate, see mock issue, click "Open Device" → Devices tab |
| CSV import preview and import flow | Fill textarea, Preview → cell visible, Import → "1 device created" |
| rack detail and placement table visible | Click Racks, click "Main Rack" cell → Rack Detail + plc-srv-01 |
| global search handles short and no-result queries | "s" → no dropdown; "zz-no-match" → "No results" |

---

## How to Run

```bash
pnpm --filter @rack-inventory-studio/desktop test:e2e
```

If Firefox is not yet installed: `npx playwright install firefox`

---

## Test Results

### Backend

| Command | Result |
|---|---|
| `cargo fmt --all --check` | PASS |
| `cargo check --workspace` | PASS |
| `cargo test --workspace` | PASS — 344 tests, 0 failed |
| `cargo clippy --workspace -- -D warnings` | PASS |

### Frontend

| Command | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm test` (Vitest) | PASS — 63 tests, 6 files |
| `pnpm build` | PASS — 55 modules, 231 kB bundle |
| `pnpm test:e2e` (Playwright) | PASS — 7/7, Firefox, 7.3 s |

---

## Manual Check Result

| Flow | Result |
|---|---|
| Repository tab — open example repo, summary loads | PASS |
| Validation tab — click Validate, issues appear | PASS |
| Global Search — type query, result visible, click navigates | PASS |
| Racks / Rack Detail — click rack row, placement table visible | PASS |
| CSV Import — paste CSV into textarea, Preview, Import | PASS |

---

## Known Limitations

- Not full Tauri E2E — real Rust backend is not running in Playwright tests.
- Native file dialogs are mocked.
- Real Git remote operations are not tested.
- Mock keyword matching for search is a simple string-contains check.
- open_repository_cmd accepts only the single fixture path.

---

## Risks

- Mocks may drift from real backend command shape over time.
- Firefox-only config: Chromium behavior differences not caught.
- Smoke layer tests frontend flow only, not full desktop integration.

---

## Out of Scope (Intentional)

- Drag and drop tests.
- Full Tauri E2E with compiled binary.
- GitHub Actions CI job.
- Visual regression tests.
- Native file dialog tests.
- Real Git remote tests.
- Backend / domain changes.
- Multi-browser matrix.

---

## Status

Branch ready for push and PR creation. PR not yet created. Branch not yet pushed.
Current branch HEAD will be visible in the accompanying review-context file.
