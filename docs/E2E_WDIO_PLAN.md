# Desktop E2E Program — WebdriverIO + Tauri

## Program status

| Item | Detail |
|------|--------|
| Integration branch | `roadmap/e2e-wdio` (long-lived) |
| Current stage | Stage 1 completed; Stage 2 scope not yet selected |
| Integration PR to development | None open — PR #143 was closed without merge |
| Decision | Further stages continue on `roadmap/e2e-wdio`; integration into `development` only after whole-program review |

`roadmap/e2e-wdio` is a long-lived integration branch.  It is not expected to be
merged into `development` after every stage.  It may contain incomplete intermediate
stages.  A new integration PR to `development` will be created only after the program
reaches an agreed completion point.

---

## Governance and branching

### Branch flow

```
feature/e2e-*
  → PR → roadmap/e2e-wdio

roadmap/e2e-wdio
  → (whole-program review)
  → PR → development
  → merge only after explicit approval
```

### Rules

- Never modify `development` or `master` directly from E2E work.
- Each feature PR targets `roadmap/e2e-wdio`, not `development`.
- Each feature PR must be independently reviewable.
- The roadmap branch may hold intermediate stages that are not yet suitable for integration.
- No new stage starts automatically from the previous one; stage priority is chosen
  based on product risk and testing value.

### Working model

For each substantial E2E change:

1. Define the problem and desired coverage.
2. Draft a stage plan.
3. Open a NSP (new-stage proposal) if scope is non-trivial.
4. Create `feature/e2e-*` branching from `roadmap/e2e-wdio`.
5. Implement.
6. Open a PR targeting `roadmap/e2e-wdio`.
7. Review.
8. Open a RP (review proposal) for cross-team sign-off if needed.
9. Merge to `roadmap/e2e-wdio`.
10. Update this document.

---

## Current test landscape

| Layer | Tool | Location | What it covers |
|-------|------|----------|----------------|
| Unit / component | Vitest + Testing Library | `apps/desktop/src/**/*.test.{ts,tsx}` | React components, helpers, Tauri command handlers (mocked) |
| Rust unit | `cargo test` | `apps/desktop/src-tauri/`, `crates/*/` | Backend logic, git helpers, CSV import, export validation |
| Browser smoke | Playwright | `apps/desktop/e2e/smoke.spec.ts` | App shell in browser mode; Tauri APIs replaced by local mocks |
| Desktop E2E | WebdriverIO | `apps/desktop/e2e-wdio/` | Real compiled Tauri binary; real IPC, filesystem, native UI |

The Playwright smoke suite (`test:e2e`) launches the app as a **plain web app** via Vite
(`vite.config.e2e.ts`) with all Tauri packages aliased to mock implementations.  It
exercises UI flows but does **not** launch or communicate with a real Tauri binary.

The WDIO layer is additive — it complements, not replaces, the existing Playwright suite.

---

## Program goals

- Add a maintainable E2E test layer for the compiled Tauri desktop app.
- Cover important user journeys not sufficiently covered by unit/component tests or
  the browser-mode Playwright suite.
- Keep each stage small, deterministic, and independently reviewable.
- Avoid network-dependent tests by default.
- Avoid real user home-directory writes; use isolated temporary directories.
- Keep E2E tests separate from release and version changes.

## Non-goals

- No visual regression testing in Stage 1.
- No PDF export testing in Stage 1.
- No real GitHub/network clone tests by default.
- No destructive filesystem tests outside temporary directories.
- No broad refactor of app architecture or existing test setup.
- No replacement of the existing Playwright browser-mode smoke suite.

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

`@wdio/tauri-service` supports Tauri app testing on Windows, Linux, and macOS.  It provides:

- Automatic binary detection and driver setup
- WebView2 (Windows) and WebKitGTK (Linux) driver management
- Log capture from the Tauri binary
- `browser.executeScript` access to the WebView context
- A `browser.pause` / `browser.waitForExist` API familiar to anyone who has used Selenium

The service targets the **real compiled binary**, complementing (not replacing) the
existing browser-mode Playwright suite.

### Advanced Tauri APIs

If deep Tauri-specific IPC access is needed (invoking backend commands directly from
specs, reading app state, triggering events), `tauri-plugin-wdio` can be added in a
later stage.  It requires:

- Registering the Rust plugin in the Tauri app
- Granting the plugin in `capabilities/default.json`
- Importing `@wdio/tauri-plugin` in test setup

Deferred until needed.  Normal WebDriver element interactions are sufficient for Stage 1.

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
| WDIO present | No (at Stage 0) |
| Playwright present | Yes — browser-mode only, `@playwright/test ^1.60.0` |

---

## Stage 1 — Foundation and core workflow

**Status: COMPLETED**

Delivered through feature branches merged into `roadmap/e2e-wdio` via PRs #138,
#140, #141 and #142.

### Scope delivered

- WDIO + `@wdio/tauri-service` dependency foundation
- WDIO configuration (`e2e-wdio/wdio.conf.ts`)
- Real compiled Tauri binary execution (not browser-mode)
- Isolated test environment with guarded cleanup
- App smoke spec: binary launch and landing screen assertions
- Stable `data-testid` selector contract for repository and inventory screens
- Repository lifecycle spec: create → open → close → reopen, canonical path verification
- Core inventory spec:
  - Location creation
  - Rack creation
  - Device Model creation (1U)
  - Device creation with that model
  - Unplaced device verification
  - Placement at U1 via `PlacePlacementModal`
  - Save through `UnsavedChangesDialog`
  - Close and reopen by exact path
  - Placement and model relationship verified after reopen

### Completed validation (Linux, 2026-07-14)

**Platform:** Linux (Ubuntu 24.04 LTS), Tauri v2 binary, `xvfb-run` virtual display

**Binary build:** `pnpm -C apps/desktop tauri build --no-bundle`

| Run | Result | Duration | Exit |
|-----|--------|----------|------|
| Isolated core spec run 1 | PASSED 1/1 | 00:22:44 | 0 |
| Isolated core spec run 2 (independent data) | PASSED 1/1 | 00:22:53 | 0 |
| Full WDIO suite (3 specs) | PASSED 3/3 | 00:28:38 | 0 |
| Vitest | 844/844 passed | — | 0 |
| TypeScript | 0 errors | — | 0 |
| GitHub checks | All green | — | — |

**Playwright:** blocked in the local Linux validation environment by a missing
`libasound2t64` system dependency.  Pre-existing condition; unrelated to Stage 1.

### Stage 1 history

#### Foundation (PR #138 — `feature/e2e-wdio-foundation`)

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
Required because `@wdio/tauri-service@1.2.0` ships with a peer dependency pinned to
2.4.0 but imports the `installMockSyncOverride` symbol that only exists in 2.5.0.
The workspace override resolves the mismatch until the upstream package is fixed.

Config path: `apps/desktop/e2e-wdio/wdio.conf.ts`

Smoke spec: `apps/desktop/e2e-wdio/specs/app-smoke.e2e.ts`

Script: `"test:e2e:wdio": "wdio run e2e-wdio/wdio.conf.ts"`

Driver choice: **`external`** (`tauri-driver` process + system WebDriver binary)

Platform prerequisites before running:
```bash
# All platforms — build with Tauri CLI (not bare cargo build) to embed frontend assets
pnpm -C apps/desktop tauri build --no-bundle   # embeds frontendDist correctly
cargo install tauri-driver

# Linux only
sudo apt-get install -y webkit2gtk-driver xvfb

# Windows — Edge WebDriver auto-managed by @wdio/tauri-service
```

**Important:** `cargo build --release` alone does NOT produce a working binary for E2E
tests.  The Tauri CLI (`pnpm tauri build --no-bundle`) must be used so that frontend
assets are embedded via `frontendDist`.  Without this, the WebView loads `devUrl`
(`http://localhost:1420`) and shows "Connection refused".

Binary path default: `../../target/release/rack-inventory-studio-desktop`

Override: `TAURI_BINARY_PATH=/abs/path/to/binary`

Service hook overhead note: `@wdio/tauri-service` runs a plugin-availability check
(`window.wdioTauri`) before every WebDriver command.  Without `tauri-plugin-wdio`
installed in the Rust app, this check always returns `false` and adds ~100 ms per
command.  On Linux with Xvfb, cold-start + hook overhead causes the full smoke
scenario to take ~75 s.  Adding `tauri-plugin-wdio` (deferred) would eliminate this.

Local run result (Linux / ubuntu-24.04-equivalent, 2026-07-12):
```
Platform   : Linux x86_64, WebKitGTK / Xvfb
Binary     : pnpm -C apps/desktop tauri build --no-bundle → target/release/rack-inventory-studio-desktop
Run command: TAURI_BINARY_PATH=... xvfb-run -a pnpm -C apps/desktop run test:e2e:wdio
Result     : 1 passed, 1 total (100% completed) in 00:01:17 — exit 0
```

#### Stable selectors (PR #140 — `feature/e2e-wdio-selectors`)

Stable `data-testid` contract for the repository landing screen:

| Selector ID | Element | Location |
|-------------|---------|----------|
| `repository-landing-title` | `<h1>` — page title | `PageHeader` via `testId` prop |
| `repository-clone-title` | `<h2>` — Clone section | `Panel` via `testId` prop |
| `repository-create-title` | `<h2>` — Create section | `Panel` via `testId` prop |
| `repository-create-submit` | `<button type="submit">` | `CreateRepositoryWizard` directly |

`PageHeader` and `Panel` accept an optional `testId?: string` prop forwarded to the
heading element.  No visible UI change.  No accessibility change.  No behavior change.

Local WDIO validation (Linux, 2026-07-13):
```
Result : 1 passed, 1 total (100% completed) in 00:01:17 — exit 0
```

#### Repository lifecycle (PR #141 — `feature/e2e-wdio-repo-lifecycle`)

##### Selector contract (PR-3 additions)

| Selector ID | Element | Location |
|-------------|---------|----------|
| `repository-create-parent-input` | Parent directory `<input>` | `CreateRepositoryWizard` |
| `repository-create-code-input` | Code `<input>` | `CreateRepositoryWizard` |
| `repository-create-name-input` | Name `<input>` | `CreateRepositoryWizard` |
| `repository-active-root` | Open-repo `<h1>` via PageHeader `testId` | `RepositoryPanel` |
| `repository-active-path` | Repo path `<span>` in PageHeader subtitle | `RepositoryPanel` |
| `repository-close-action` | Close `<button>` | `RepositoryPanel` |
| `repository-open-path-input` | Open-by-path `<input>` | `RepositoryPanel` |
| `repository-open-path-submit` | Open `<button>` | `RepositoryPanel` |

`repository-active-path` carries the exact `summary.repo_path` string rendered in
the page header subtitle.  The lifecycle spec reads its text, applies
`realpathSync.native(resolve(...))` to both displayed and expected values, and asserts
canonical equality — immediately after creation and again after reopening.

##### Isolated test environment

`apps/desktop/e2e-wdio/support/test-environment.ts` creates a fresh `ris-wdio-*`
dir under `os.tmpdir()` once per WDIO launcher, then sets:

| Env var | Purpose |
|---------|---------|
| `XDG_CONFIG_HOME / XDG_DATA_HOME / XDG_CACHE_HOME` | Isolate WebKit localStorage and Tauri app data |
| `APPDATA / LOCALAPPDATA / HOME` | Windows equivalents + home isolation |
| `GIT_CONFIG_GLOBAL` | Minimal e2e-only git identity (user.name + user.email) |
| `GIT_CONFIG_NOSYSTEM` | Prevent reading system git config |
| `RIS_E2E_RUN_ROOT` | Path of the generated run root (internal) |
| `RIS_E2E_ENV_INITIALIZED=1` | Initialization marker (set by launcher; checked by workers) |
| `RIS_E2E_REPOSITORY_PARENT` | Isolated parent dir for repos created during the spec |

`RIS_E2E_ENV_INITIALIZED` is the initialization marker — not `RIS_E2E_REPOSITORY_PARENT`.
A pre-existing `RIS_E2E_REPOSITORY_PARENT` from the developer's shell is detected and
rejected before any app launch ("Refusing to bypass the isolated WDIO test environment").

Cleanup guards (all must pass before `rmSync`):
- `runRoot` is a strict descendant of `tmpdir()` (containment, not just `startsWith`)
- `repoParent` is a strict descendant of `runRoot`
- `basename(runRoot)` starts with `ris-wdio-`
- `ownership-sentinel` file is present

Cleanup is performed by the WDIO `onComplete` hook (guarded test-environment cleanup).

Set `RIS_E2E_KEEP_TEMP=1` to preserve the run root for inspection.

Focused helper tests (Vitest):
```
e2e-wdio/support/test-environment.test.ts — 22 tests pass
```

##### Lifecycle route

Repository path on disk: `{RIS_E2E_REPOSITORY_PARENT}/{code}` (derived from
`create_repository_cmd`).  Reopen uses the "Open by path" `<input>` +
`data-testid="repository-open-path-submit"` — no native OS dialog.

##### React controlled-input workaround

`setValue()` does not reliably trigger React's `onChange` for controlled inputs in
WebKitWebDriver.  The `reactSetValue()` helper calls `browser.execute()` with the
native `HTMLInputElement.prototype.value` setter + a bubbling `input` event, which
React's synthetic event system picks up correctly.

##### Mocha timeout

Increased from 180 s to 300 s.  Full lifecycle on Linux with Xvfb takes ~210 s due
to `@wdio/tauri-service` beforeCommand hook overhead (~600 ms per command while
`tauri-plugin-wdio` is not installed).

Local WDIO validation (Linux, 2026-07-13):
```
Platform    : Linux x86_64, WebKitGTK / Xvfb
Result      : 2 passed, 2 total (100% completed) in 00:05:35 — exit 0
Specs       : app-smoke.e2e.ts ✅   repository-lifecycle.e2e.ts ✅

Active path after create : /tmp/ris-wdio-zuwtYu/repositories/e2emrjoajpv ✅
Active path after reopen : /tmp/ris-wdio-zuwtYu/repositories/e2emrjoajpv ✅
Cleanup (normal run)     : owned run root deleted ✅
Cleanup (RIS_E2E_KEEP_TEMP=1) : run root preserved, sentinel present ✅
Cleanup after failure    : onComplete ran and deleted run root ✅
Foreign RIS_E2E_REPOSITORY_PARENT : rejected before app launch ✅
```

#### Core inventory (PR #142 — `feature/e2e-wdio-core-inventory`)

Full creation and placement flow in a single spec:

**Creation flow:**
- Repository → Location → Rack → Device Model (1U) → Device
- Each entity verified in the corresponding panel list after creation
- Device row shows "unplaced" badge

**Placement + persistence:**
- Navigate to Racks → rack detail → `PlacementPalettePanel`
- Click Place… button for device → `PlacePlacementModal` pre-selects device
- Fill start U (U1) → submit → verify placed card at U1 with model name in `title`
- Close repository → `UnsavedChangesDialog` → "Save and continue"
- Reopen via "Open by path" input → verify `expectActiveRepositoryPath`
- Navigate Locations → click location row → Racks → click rack row
- Verify placed card (`data-device-code` + `data-start-u="1"`) with correct model after reopen

##### Selector contract (PR-4 additions)

**Creation testid selectors:**

| Selector | Element | Location |
|----------|---------|----------|
| `nav-{tab}` | Nav item div for each tab (`nav-locations`, `nav-racks`, `nav-devices`, `nav-device_models`) | `App.tsx` navItem |
| `location-add-btn` | "Add location" button | `LocationsPanel` |
| `location-form-submit` | Submit button in location modal | `LocationFormModal` |
| `rack-add-btn` | "Add rack" button | `RacksPanel` |
| `rack-form-submit` | Submit button in rack modal | `RackFormModal` |
| `model-add-btn` | "Add model" button | `DeviceModelsPanel` |
| `model-form-submit` | Submit button in device model modal | `DeviceModelFormModal` |
| `device-add-btn` | "Add device" button | `DevicesPanel` |
| `device-form-submit` | Submit button in device modal | `DeviceFormModal` |

**Placement testid selectors:**

| Selector | Element | Location |
|----------|---------|----------|
| `palette-drop-zone` | Presence signals rack detail loaded | `PlacementPalettePanel` |
| `place-btn` | "Place" submit button in placement modal | `PlacePlacementModal` |
| `start-u-input` | Start U `<input>` in placement modal | `PlacePlacementModal` |
| `unsaved-changes-save` | "Save and continue" button | `UnsavedChangesDialog` |

**Data attributes:**

| Data attribute | Purpose | Location |
|----------------|---------|----------|
| `data-location-code` | Stable row identifier | `LocationsPanel` |
| `data-rack-code` | Stable row identifier | `RacksPanel` |
| `data-model-code` | Stable row identifier | `DeviceModelsPanel` |
| `data-device-code` | Stable row identifier for devices list | `DevicesPanel` |
| `data-device-code` on Place button | Palette Place button scoped to device | `PlacementPalettePanel` |
| `data-device-code` on placed card | Placed card scoped to device | `RackUnitDiagram` |
| `data-start-u` on placed card | U-position verification | `RackUnitDiagram` |

##### Shared helpers

`apps/desktop/e2e-wdio/support/repository-ui.ts`:
- `canonicalPath()`, `reactSetValue()`, `reactSelectValue()`, `waitForEnabled()`,
  `expectActiveRepositoryPath()`, `createRepositoryThroughUi()`

##### Placement implementation notes

- `createRepositoryThroughUi()` returns `repoPath` captured for reopen.
- Device `data-device-code` captured from the devices list row after creation.
- Rack `<tr>` rows require JS click (`browser.execute((el) => el.click(), el)`) —
  WebKitGTK marks `<tr>` as not interactable.
- Palette Place button selector scoped to
  `button[data-testid^="place-btn-device-"][data-device-code="${code}"]` to avoid
  collision with placed-card `div`s that also carry `data-device-code`.
- `getText()` returns `""` for placed cards in WebKit because flex children use
  `overflow:hidden`; `getAttribute("title")` reliably contains the full label.
- Placement error propagation uses `isPlacementFailure()` type guard
  (`err instanceof Error && err.message.startsWith("Placement failed")`) instead of
  `String(err).startsWith(…)` which is always `false` for `Error` objects.
- State reset on reopen: `selectedLocationForRacks` cleared by `doOpen()` in `App.tsx`.
  Stage 2 re-navigates via Locations → click location row → Racks → click rack row.

##### Mocha timeout

Increased from 900 s (15 min) to 1 800 s (30 min).  Stage 1: ~12 min.
Stage 2: ~13 min.  Total estimated ~25 min → 30 min with margin.

##### Full validation results (Linux, 2026-07-14)

**Binary:** `pnpm -C apps/desktop tauri build --no-bundle` (46 s)

Isolated spec run 1 (17:42–18:05 UTC):
```bash
TAURI_BINARY_PATH="$(realpath target/release/rack-inventory-studio-desktop)" \
  xvfb-run -a pnpm -C apps/desktop exec wdio run \
  e2e-wdio/wdio.conf.ts --spec e2e-wdio/specs/core-inventory.e2e.ts
```
**PASSED** — 1/1 specs (100%) in **00:22:44** — exit 0

Stage 1 passed at 17:56 UTC; Stage 2 passed, placement persisted at U1 (18:05 UTC).
Owned root `/tmp/ris-wdio-rkX2DO` removed by the WDIO `onComplete` hook.

Isolated spec run 2 (18:05–18:28 UTC, independent data, suffix `mrkyp200`):

**PASSED** — 1/1 specs (100%) in **00:22:53** — exit 0

Owned root `/tmp/ris-wdio-q9Y6fT` removed by the WDIO `onComplete` hook.

Full WDIO suite:
```bash
xvfb-run -a pnpm -C apps/desktop run test:e2e:wdio
```
**PASSED** — 3/3 specs (100%) in **00:28:38** — exit 0

Unit tests: `pnpm -C apps/desktop run test:unit` — **844/844 passed**.

TypeScript: `pnpm tsc --noEmit` — **0 errors**.

Playwright: blocked — `libasound2t64` absent (pre-existing, unrelated to Stage 1).

---

## Stage 2 — Safety, recovery and CSV import

**Overall status: IN REVIEW**

The old PR-5 / PR-6 / PR-7 ordering from the initial roadmap is non-binding.
Stage 2 is complete only after Stage 2A and Stage 2B are both merged into
`roadmap/e2e-wdio`.

### Stage 2A — Safety and recovery

**Status: COMPLETED**

Delivered through `feature/e2e-wdio-safety-recovery` — merged as PR #144.

**Scope:**

- Unsafe clone URL rejection in the real Tauri binary UI
  (`ext::`, `fd::`, `file://` and one HTTPS control)
- Missing repository path recovery (path does not exist)
- Existing non-RIS directory recovery (path exists but is not a RIS repository)
- No network access; no real clone operation
- One new selector: `global-error` added to App.tsx error banner (no previous
  stable testid existed for this element)

**Spec:** `apps/desktop/e2e-wdio/specs/safety-recovery.e2e.ts`

**Validation (Linux, 2026-07-15):**

| Run | Result | Duration | Exit |
|-----|--------|----------|------|
| Isolated run 1 | PASSED 1/1 | 00:09:38 | 0 |
| Isolated run 2 (independent data) | PASSED 1/1 | 00:09:36 | 0 |
| Full WDIO suite (4 specs) | PASSED 4/4 | 00:38:19 | 0 |
| TypeScript | 0 errors | — | 0 |
| Vitest | 844/844 passed | — | 0 |
| GitHub checks | All green | — | — |

### Stage 2B — CSV import

**Status: IN REVIEW**

Delivered through feature branch `feature/e2e-wdio-csv-import`.

**Spec:** `apps/desktop/e2e-wdio/specs/csv-import.e2e.ts`

**Scope:**

- Device CSV import via the textarea path — no native file dialog
- Preview workflow: paste → preview → assert row count and device names
- Successful import: click Import → assert success banner → verify both devices in Devices panel
- Persistence: save + close + reopen by exact path → assert devices still present, no duplicates
- Negative validation: CSV with missing required `status` column → preview runs, import remains blocked

**New selectors (Stage 2B additions):**

| Selector | Element | Location |
|----------|---------|----------|
| `csv-preview-btn` | Preview `<button type="submit">` | `CsvImportPanel` |
| `csv-import-btn` | "Import N rows" `<button>` | `CsvImportPanel` |
| `csv-import-success` | Wrapper `<div>` around import success `Banner` | `CsvImportPanel` |
| `csv-device-preview-table` | `<table>` in device preview | `DevicePreviewTable` |

Existing selectors reused: `nav-csv_import`, `import-type-devices`, `csv-textarea`,
`device-add-btn`, `[data-device-code]`, `repository-close-action`, `unsaved-changes-save`,
`repository-open-path-input`, `repository-open-path-submit`, `repository-active-root`,
`repository-active-path`.

### Remaining candidate areas (unordered)

The following areas are candidates for stages beyond Stage 2B.  They are not
committed tasks and are not listed in priority order:

- **CI execution** — Add an optional (non-blocking) WDIO job to CI; evaluate Linux
  runner feasibility with WebKitGTK driver.
- **Windows validation** — Validate the suite on Windows with WebView2 driver.
- **Linux runner reproducibility** — Identify whether webkit2gtk-driver is available
  on ubuntu-24.04 GitHub-hosted runners.
- **Runtime reduction** — Evaluate `tauri-plugin-wdio` to eliminate the 100 ms/cmd
  hook overhead; consider helper refactoring to reduce test duration.
- **Export workflows** — Rack SVG/PNG export where stable without native dialog
  fragility.
- **Extended inventory workflows** — Edit and delete entity operations, full CRUD.
- **Git workflow** — init → validate → commit cycle in the real Tauri binary.
- **Cross-platform path behavior** — Non-ASCII paths, symlinked temp directories,
  UNC paths on Windows.

---

## Future stages

Placeholder areas for stages beyond Stage 2.  Scope and order will be decided during
program planning.

- Desktop CI and platform validation
- Import/export workflows
- Repository and clone safety
- Extended inventory workflows
- Performance and reliability hardening

---

## Integration criteria

Conditions to consider before opening a future integration PR from `roadmap/e2e-wdio`
into `development`:

- Agreed program scope reached and all intended stages reviewed
- No known unsafe cleanup behavior
- Repeatable desktop validation across at least two independent runs
- Supported-platform strategy decided (Linux runner, Windows runner, macOS)
- Runtime acceptable for CI without blocking required checks
- Dependency overrides reviewed for resolution status
- Documentation current with actual behavior
- Final branch comparison audited (no stale files, no review contexts committed)
- Explicit human decision to integrate

---

## Test data policy

- Use temporary directories under `os.tmpdir()`.
- Never write into the user home directory except via system temp.
- Use unique run IDs to prevent cross-run pollution.
- Clean up owned run roots via the WDIO `onComplete` hook (guarded cleanup).
- Keep fixture repositories minimal.
- Set `RIS_E2E_KEEP_TEMP=1` to preserve temp dirs for inspection on failure.

---

## CI policy

WDIO E2E CI is not yet configured.  When added it should be non-blocking initially.

Progressive promotion path:
1. `workflow_dispatch` only
2. Auto-triggered on PRs to `roadmap/e2e-wdio`
3. Auto-triggered on PRs to `development`
4. Required check (only after repeated stability)

---

## Risks and open questions

| Risk | Notes |
|------|-------|
| Linux WebKitGTK driver | ubuntu-24.04 runner availability of `webkit2gtk-driver` not yet confirmed for CI |
| Windows WebView2 driver | Version matching; `@wdio/tauri-service` may handle auto-download but CI cache strategy needed |
| Native dialogs | OS save/open dialogs difficult to automate; may need app-level bypass in test builds |
| Tauri plugin scope | Adding `tauri-plugin-wdio` touches `capabilities/default.json`; scope must remain narrow |
| Binary build time | Tauri binary must be compiled before WDIO tests; adds significant CI time |
| Non-ASCII paths | Temp directory paths with non-ASCII characters may break on some platforms |
| `@wdio/native-utils` override | Workspace override to 2.5.0 works around a peer-dep mismatch; upstream fix not yet released |
| Test isolation | Each spec must start from a clean state; shared state between specs causes flakiness |
| `tauri-plugin-wdio` hook overhead | ~100 ms per WebDriver command while plugin absent; acceptable for Stage 1, reassess for CI |
