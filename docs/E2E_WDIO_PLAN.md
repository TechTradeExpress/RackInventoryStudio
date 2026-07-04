# E2E Testing Plan — WebdriverIO + Tauri

## Status

**PR-1 merged** — WDIO tooling foundation in place.
`apps/desktop/e2e-wdio/` exists; smoke spec added; `test:e2e:wdio` script added.

Base branch for this roadmap: `roadmap/e2e-wdio`.

Future E2E PRs should target `roadmap/e2e-wdio`, not `development` or `master`.

---

## Current test landscape

| Layer | Tool | Location | What it covers |
|-------|------|----------|----------------|
| Unit / component | Vitest + Testing Library | `apps/desktop/src/**/*.test.{ts,tsx}` | React components, helpers, Tauri command handlers (mocked) |
| Rust unit | `cargo test` | `apps/desktop/src-tauri/`, `crates/*/` | Backend logic, git helpers, CSV import, export validation |
| Browser smoke | Playwright | `apps/desktop/e2e/smoke.spec.ts` | App shell in browser mode; Tauri APIs replaced by local mocks |

The Playwright smoke suite (`test:e2e`) launches the app as a **plain web app** via Vite
(`vite.config.e2e.ts`) with all Tauri packages aliased to mock implementations in
`apps/desktop/e2e/mocks/`. It exercises UI flows but does **not** launch or communicate with a
real Tauri binary.

The WDIO roadmap adds a **fourth layer**: true desktop E2E that launches the compiled Tauri
binary, drives it through WebDriver, and tests real IPC commands, file system writes, and
native dialog flows.

---

## Goals

- Add a maintainable E2E test layer for the compiled Tauri desktop app.
- Cover the most important user journeys that are not sufficiently covered by
  unit/component tests or the browser-mode Playwright suite.
- Keep the first E2E suite small, deterministic, and CI-friendly.
- Avoid network-dependent tests by default.
- Avoid real user home-directory writes; use isolated temporary directories.
- Keep E2E tests separate from release and version changes.

---

## Chosen stack

| Component | Choice |
|-----------|--------|
| Test runner | WebdriverIO (WDIO) |
| Tauri bridge | `@wdio/tauri-service` |
| App runtime | Tauri v2 |
| Spec language | TypeScript |
| Test data | Temp directories generated per run |

### Why WDIO + `@wdio/tauri-service`

`@wdio/tauri-service` supports Tauri app testing on Windows, Linux, and macOS. It provides:

- Automatic binary detection and driver setup
- WebView2 (Windows) and WebKitGTK (Linux) driver management
- Log capture from the Tauri binary
- `browser.executeScript` access to the WebView context
- A `browser.pause` / `browser.waitForExist` API familiar to anyone who has used Selenium

The service targets the **real compiled binary**, complementing (not replacing) the existing
browser-mode Playwright suite.

### Advanced Tauri APIs

If deep Tauri-specific IPC access is needed in tests (invoking backend commands directly from
specs, reading app state, triggering events), `tauri-plugin-wdio` can be added in a later
stage. It requires:

- Registering the Rust plugin in the Tauri app
- Granting the plugin in `capabilities/default.json`
- Importing `@wdio/tauri-plugin` in test setup

We will decide whether the plugin is needed in PR-1 after examining what can be tested via
normal WebDriver interactions.

---

## Non-goals

- No visual regression testing in the first iteration.
- No PDF export testing in the first iteration.
- No real GitHub/network clone tests by default.
- No destructive filesystem tests outside temporary directories.
- No broad refactor of app architecture or existing test setup.
- No replacement of the existing Playwright browser-mode smoke suite.

---

## Repository audit findings

Collected during Stage 0 on branch `roadmap/e2e-wdio` (based on `development` @ `e1fd3f5`).

| Item | Detail |
|------|--------|
| Package manager | `pnpm` (v10.33.4, workspace) |
| Frontend package | `apps/desktop/` |
| Tauri package | `apps/desktop/src-tauri/` |
| Tauri version | v2 |
| Identifier | `com.techtradeexpress.rackinventorystudio` |
| Existing unit scripts | `pnpm --filter @rack-inventory-studio/desktop test` (Vitest) |
| Existing e2e script | `pnpm --filter @rack-inventory-studio/desktop test:e2e` (Playwright, browser mode) |
| CI Linux job | ubuntu-24.04 (`ci.yml`) |
| CI Windows job | windows-latest (`windows-installer.yml`) |
| WDIO present | No |
| Playwright present | Yes — browser-mode only, `@playwright/test ^1.60.0` |

---

## Proposed PR stages

### PR-1 — E2E tooling foundation ✅ Implemented

**Branch from:** `roadmap/e2e-wdio`
**Target:** `roadmap/e2e-wdio`
**PR:** `feature/e2e-wdio-foundation`

Dependencies installed (`apps/desktop` devDependencies):
```
webdriverio           9.29.1
@wdio/cli             9.29.1
@wdio/local-runner    9.29.1
@wdio/mocha-framework 9.29.1
@wdio/tauri-service   1.2.0
```

pnpm workspace override (root `package.json`):
```
@wdio/native-utils: 2.5.0
```
Required because `@wdio/tauri-service@1.2.0` ships with a peer dependency pinned to 2.4.0
but imports the `installMockSyncOverride` symbol that only exists in 2.5.0.
The workspace override resolves the mismatch until the upstream package is fixed.

Config path: `apps/desktop/e2e-wdio/wdio.conf.ts`
Smoke spec: `apps/desktop/e2e-wdio/specs/app-smoke.e2e.ts`
Script: `"test:e2e:wdio": "wdio run e2e-wdio/wdio.conf.ts"`

Driver choice: **`external`** (`tauri-driver` process + system WebDriver binary)

- No Rust app code changed.
- `tauri-plugin-wdio` deferred — normal WebDriver element interactions are
  sufficient for smoke assertions (`body`, `h2`, `button` text selectors).
- `tauri-plugin-wdio-webdriver` deferred — switch to `driverProvider: 'embedded'`
  once that plugin is added (eliminates need for `tauri-driver`).

Platform prerequisites before running:
```
# All platforms
pnpm tauri build                            # or: cargo build --release in src-tauri/
cargo install tauri-driver

# Linux only
sudo apt-get install -y webkit2gtk-driver xvfb

# Windows — Edge WebDriver auto-managed by @wdio/tauri-service
```

Local run result (CI/dev environment, 2026-07-04):
```
BLOCKED — three environment prerequisites missing:
  1. tauri-driver not found (cargo install tauri-driver)
  2. WebKitWebDriver not found (apt-get install webkit2gtk-driver)
  3. Tauri release binary not built (pnpm tauri build)
Config and spec are correct; run in a prepared environment.
```

Acceptance status:
- ✅ Vitest (817 tests) still passes.
- ⚠️ Playwright still fails in this environment (pre-existing: Firefox system deps missing).
- ⚠️ WDIO smoke: correct config, blocked by environment prerequisites.
- ✅ No app behavior changes.
- ✅ No Rust changes.

---

### PR-2 — Test-only selectors and stable test hooks

**Branch from:** `roadmap/e2e-wdio`
**Target:** `roadmap/e2e-wdio`

Purpose:
- Add minimal stable `data-testid` attributes to components that need
  reliable WDIO selectors.
- Avoid changing visual UI or component behaviour.
- Avoid selectors based on fragile text strings when a stable test id is available.
- Document selector conventions (`docs/E2E_SELECTOR_CONVENTIONS.md` or inline).

Acceptance:
- No behaviour changes.
- Vitest component tests updated only if the test-id addition requires it.
- No new Rust code.

---

### PR-3 — Repository lifecycle E2E

**Branch from:** `roadmap/e2e-wdio`
**Target:** `roadmap/e2e-wdio`

Purpose:
- Cover create/open repository flow using temp directories.
- Verify basic repository summary loads (location list, rack list visible).
- No external Git or network access.
- Clean up temp test data after each run.

Acceptance:
- E2E creates a new RIS repository in an isolated temp path.
- App opens it and shows expected UI elements.
- Test is deterministic across runs.

---

### PR-4 — Core inventory E2E

**Branch from:** `roadmap/e2e-wdio`
**Target:** `roadmap/e2e-wdio`

Purpose:
- Add happy-path flow:
  1. Create location
  2. Create rack
  3. Create device model
  4. Create device
  5. Place device in rack
  6. Verify rack view shows placement
- Uses isolated repo fixture from PR-3 infrastructure.

Acceptance:
- Covers the central RIS workflow end-to-end.
- No dependency on test order unless explicitly isolated.
- No network access.

---

### PR-5 — Import/export E2E

**Branch from:** `roadmap/e2e-wdio`
**Target:** `roadmap/e2e-wdio`

Purpose:
- Cover Device Model CSV import smoke: paste/load CSV, preview, import, verify list.
- Cover rack SVG/PNG export where feasible without native dialog fragility.
- Test unsupported extension rejection if Save dialog control is reliable.

Acceptance:
- Import flow verified at E2E level.
- Export happy path verified if stable on CI.
- Native dialog automation deferred if unreliable.

---

### PR-6 — Git/clone safety E2E smoke

**Branch from:** `roadmap/e2e-wdio`
**Target:** `roadmap/e2e-wdio`

Purpose:
- Verify unsafe clone URLs are rejected in the UI before clone starts.
- Cover at minimum: `ext::`, `fd::`, `file://`.
- Do not execute any real clone or network call.
- Backend validation remains covered by Rust unit tests.

Acceptance:
- Frontend URL validation fires and disables Submit for unsafe inputs.
- No actual git command executed.

---

### PR-7 — CI integration

**Branch from:** `roadmap/e2e-wdio`
**Target:** `roadmap/e2e-wdio`

Purpose:
- Add optional (manual or branch-scoped) CI job for WDIO E2E.
- Linux headless feasibility evaluated (WebKitGTK driver availability on ubuntu-24.04).
- Windows feasibility evaluated (WebView2 driver, Tauri binary build time).
- Document platform limitations discovered.
- Keep required CI checks stable; E2E job non-blocking until stable.

Acceptance:
- CI job triggerable manually (`workflow_dispatch`) or on `roadmap/e2e-wdio` pushes.
- Does not block PRs to `development` or `master`.

---

### Integration PR — roadmap/e2e-wdio → development

After PR-1 through PR-7 are reviewed and stable:

- Open a single integration PR from `roadmap/e2e-wdio` into `development`.
- Review accumulated changes as a unit.
- Squash-merge into `development` following repository merge policy.

---

## Candidate first E2E smoke (PR-1 target)

1. Launch compiled Tauri binary.
2. Verify main app shell renders (window title or header visible).
3. Verify repository landing screen shows Open / Create / Clone actions.
4. Close app cleanly.

---

## Test data policy

- Use temporary directories (OS temp or `$TMPDIR`).
- Never write into the user home directory except via system temp.
- Use unique run IDs to prevent cross-run pollution.
- Clean up after test when the framework supports it.
- Keep fixture repositories minimal (single location, single rack is sufficient).

---

## CI policy

Initial WDIO E2E CI should be non-blocking / manually triggered until the suite is stable.

Progressive promotion path:
1. `workflow_dispatch` only (PR-7)
2. Auto-triggered on PRs to `roadmap/e2e-wdio`
3. Auto-triggered on PRs to `development`
4. Required check (only after repeated stability)

---

## Risks and unknowns

| Risk | Notes |
|------|-------|
| Linux WebKitGTK driver | ubuntu-24.04 may require installing `libwebkit2gtk-4.1-dev` and a WebDriver binary; unknown whether it ships in the runner |
| Windows WebView2 driver | Needs version matching; `@wdio/tauri-service` may handle auto-download but CI cache strategy needed |
| Native dialogs | Save/open dialogs driven by the OS are difficult to automate; may need app-level bypass in test builds |
| Tauri plugin/capability scope | Adding `tauri-plugin-wdio` touches `capabilities/default.json`; must be kept narrow |
| Binary build time | Tauri binary must be compiled before WDIO tests; adds significant CI time |
| Non-ASCII paths | Temp directory paths with non-ASCII characters may break on some platforms |
| Test isolation | Each spec must start from a clean repo state; shared state between specs causes flakiness |

---

## Stage 0 acceptance criteria

- [x] `roadmap/e2e-wdio` exists and is pushed.
- [x] This plan document is committed on `roadmap/e2e-wdio`.
- [x] No E2E dependencies installed.
- [x] No app code changed.
- [x] No version bump.
- [x] Future PR targets are clear (`roadmap/e2e-wdio`).
