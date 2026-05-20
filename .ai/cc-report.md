# cc-report — milestone/playwright-smoke-tests

## Branch

`milestone/playwright-smoke-tests` — exploratory local branch, **no PR, no push**.

**PR:** none — exploratory local branch  
**Final commit hash:** see git log after repair commit  
**Status:** ready for ChatGPT review before continuing on the same branch

---

## Goal

Playwright Smoke Tests Foundation — establish a Vite/web-based Playwright smoke layer for the
desktop app so that golden-path flows are verifiable without a full Tauri binary.

---

## Summary of Changes

- Added Playwright as smoke test foundation (`@playwright/test` devDependency).
- Added `test:e2e` script to `package.json`.
- Added `playwright.config.ts` (Firefox, port 1421, Vite web server).
- Added `vite.config.e2e.ts` with Vite resolve aliases replacing Tauri packages with mocks.
- Added `e2e/mocks/tauri-core.ts` — static fixture `invoke()` mock for all backend commands.
- Added `e2e/mocks/tauri-dialog.ts` — file dialog mock returning fixture path or null.
- Added `e2e/smoke.spec.ts` — 6 Playwright smoke tests.
- Added ignore for `test-results/` and `playwright-report/` in both `.gitignore` files.
- Updated `docs/MVP_SMOKE_TEST_CHECKLIST_EN.md` Playwright section from "not yet implemented"
  to current state with run instructions and coverage summary.

---

## Implementation Decision: Web/Vite Runner, not Full Tauri E2E

Tests run against a Vite dev server (port 1421) — not the compiled Tauri shell.

**Why not full Tauri E2E:**
- Requires a compiled platform-specific `.app`/`.exe` binary.
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

`tauri-core.ts` exports `invoke<T>(command, _args)` with static fixture responses covering:
open_repository, get_repository_summary, list_locations, list_racks, list_devices,
list_device_models, get_rack_detail, validate_current_repository, search_repository_cmd,
preview_device_csv_import_cmd, import_device_csv_cmd, get_git_status, get_git_log,
list_git_remotes, read_csv_file.

`tauri-dialog.ts` returns a hardcoded fixture repo path for directory pickers and `null`
for CSV file pickers (simulating dialog cancel).

The Rust backend is not running during Playwright tests.

---

## Browser Decision: Firefox

Firefox is used. Chromium was evaluated first but requires `libnspr4.so`, which is not available
in the WSL2 dev environment without `sudo apt-get install`. No sudo access during this session.

Firefox was installed via `playwright install firefox`. All 6 tests pass stably with Firefox.
Firefox is a valid CI browser widely supported by Playwright. Single-browser config kept
intentionally — no matrix added.

---

## Smoke Tests (6)

| # | Test name | What it verifies |
|---|---|---|
| 1 | App shell loads without console errors | Heading visible, Validation tab disabled, zero console errors |
| 2 | Open repository enables all tabs | Fill path, click Open, all 7 tabs enabled, search bar visible |
| 3 | Global search shows results and navigates to Locations | Type "server", see "Server Room A", click → Locations tab |
| 4 | Validation panel shows issues and navigates on click | Click Validate, see mock issue, click "Open Device" → Devices tab |
| 5 | CSV import preview and import flow | Fill textarea, Preview → cell visible, Import → "1 device created" |
| 6 | Rack detail and placement table visible | Click Racks, click "Main Rack" cell → Rack Detail + plc-srv-01 |

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
| `cargo test --workspace` | PASS — 344 tests across all crates, 0 failed |
| `cargo clippy --workspace -- -D warnings` | PASS |

### Frontend

| Command | Result |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm test` (Vitest) | PASS — 63 tests, 6 files |
| `pnpm build` | PASS — 55 modules, 231 kB bundle |
| `pnpm test:e2e` (Playwright) | PASS — 6/6 tests, Firefox, 6.2 s |

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
- Console error guard is currently limited to test 1 (app shell); other tests do not assert
  zero console errors.
- Mocks are static and do not yet validate command arguments in detail.

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

After code review feedback, work will continue on the same branch
`milestone/playwright-smoke-tests` without creating a new branch or PR unless explicitly
requested.
