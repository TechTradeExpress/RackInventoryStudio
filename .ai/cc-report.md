# cc-report — milestone/playwright-smoke-tests

## Branch

`milestone/playwright-smoke-tests` — exploratory local branch, **no PR, no push**.

**PR:** none — exploratory local branch  
**Latest code commit hash:** 9ae80db  
**Status:** ready for ChatGPT review before continuing on the same branch

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
- Updated `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` Playwright section (count 6 → 7).

---

## Implementation Decision: Web/Vite Runner, not Full Tauri E2E

Tests run against a Vite dev server (port 1421) — not the compiled Tauri shell.

**Why not full Tauri E2E:**
- Requires a compiled platform-specific .app/.exe binary.
- WebDriver integration not yet configured in this repo.
- Would require OS-level system deps and Tauri driver setup in CI.

**Why Vite/web layer:**
- Zero Rust compilation — tests start in ~3 s.
- Fully deterministic (static fixture data, no filesystem side effects).
- Exercises the full React/TS layer, which is the primary risk surface.
- Can run in CI with no Tauri system deps.

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

`invoke()` uses a switch statement with per-command argument validation.

| Command | Validated argument | Validation rule |
|---|---|---|
| `open_repository_cmd` | `path` | non-empty string AND must equal FIXTURE_REPO_PATH |
| `search_repository_cmd` | `query` | string; `[]` if trimmed length < 2; `[]` if no fixture keyword match |
| `preview_device_csv_import_cmd` | `csvContent` | non-empty string |
| `import_device_csv_cmd` | `csvContent` | non-empty string |
| `read_csv_file` | `path` | string if provided |

Fixture keyword matching for search: queries containing "server", "rack", "main", or "room"
return the fixture results. All other queries return [] (enables testing the no-results state).

---

## Browser Decision: Firefox

Firefox is used. Chromium requires `libnspr4.so` unavailable in WSL2 dev environment without
sudo. Firefox is a valid CI browser. Single-browser config kept — no matrix added.

---

## Smoke Tests (7)

| # | Test name | What it verifies |
|---|---|---|
| 1 | App shell loads without console errors | Heading visible, Validation tab disabled, zero console errors (fixture) |
| 2 | Open repository enables all tabs | Fill path, click Open, all 7 tabs enabled, search bar visible |
| 3 | Global search shows results and navigates to Locations | Type "server", see "Server Room A", click → Locations tab |
| 4 | Validation panel shows issues and navigates on click | Click Validate, see mock issue, click "Open Device" → Devices tab |
| 5 | CSV import preview and import flow | Fill textarea, Preview → cell visible, Import → "1 device created" |
| 6 | Rack detail and placement table visible | Click Racks, click "Main Rack" cell → Rack Detail + plc-srv-01 |
| 7 | Global search edge cases | Short query ("s") → no dropdown; "zz-no-match" → "No results" shown |

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
| `pnpm test:e2e` (Playwright) | PASS — 7/7, Firefox, 7.2 s |

---

## Manual Check Result

Verified manually against a running local Vite dev build:

| Flow | Result |
|---|---|
| Repository tab — open example repo, summary loads | PASS |
| Validation tab — click Validate, issues appear | PASS |
| Global Search — type query, result visible, click navigates | PASS |
| Racks / Rack Detail — click rack row, placement table visible | PASS |
| CSV Import — paste CSV into textarea, Preview, Import | PASS |

No regressions observed.

---

## Known Limitations

- This is not full Tauri E2E — the real Rust backend is not running in Playwright tests.
- Native file dialogs are mocked — OS-level file picker cannot be tested.
- Real Git remote operations are not tested.
- Mock keyword matching for search is a simple string-contains check, not a real search engine.
- open_repository_cmd accepts only the single fixture path; multiple repos not supported in tests.

---

## Risks

- Mocks may give a false sense of security if they drift from the real backend command shape.
- Firefox-only config: browser-specific behavior differences vs Chromium are not caught.
- E2E smoke layer tests the frontend flow, not full desktop integration.

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

## Continuation

PR not yet created. Branch not pushed. After code review approval, a PR will be created
from `milestone/playwright-smoke-tests` → `master` unless the reviewer requests further
changes on this branch first.
