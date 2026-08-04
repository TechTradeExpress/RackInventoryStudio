# Desktop E2E Program — WebdriverIO + Tauri

## Program status

| Item | Detail |
|------|--------|
| Integration branch | `roadmap/e2e-wdio` (long-lived; merged into `development`, see below — not deleted, per this doc's own branch policy) |
| Current stage | Stage 3 COMPLETED (3A, 3B.1–3B.4, 3C) — embedded WDIO provider fully removed (PR #158); Stage 3D PARTIAL (merged as PR #159 — Placement Validation COMPLETE, Rack Export moved to NEEDS APPLICATION CHANGE); Stage 3E COMPLETE (merged as PR #160) — low-risk selector additions; Stage 3F.0 COMPLETE (merged as PR #161) — git workflow foundation audit; Stage 3F.0.5 COMPLETE (merged as PR #162) — local Git E2E test foundation, no workflow coverage added; Stage 3F.1A COMPLETE (merged as PR #163) — Git detection/init workflow coverage; Stage 3F.1B COMPLETE (merged as PR #164) — validate/commit/add-remote COVERED, push/pull local error paths PARTIAL; Stage 3F.2 COMPLETE (approved, RP applied) — remote Git over SSH: local-sshd fixture infrastructure, successful push/pull round-trips, upstream tracking, and SSH key-based authentication all COVERED; Stage 3F.3 COMPLETE — Git clone over SSH: scaffold-only clone, multi-commit clone, and clone-state persistence across close/reopen all COVERED, reusing Stage 3F.2's fixture infrastructure unmodified; Stage 3F.4 COMPLETE — diverged pull over SSH: `--ff-only` failure on a genuinely diverged history COVERED, proving both commits, working tree, branch, upstream, and remote configuration all survive the failure and a close/reopen cycle, reusing Stage 3F.2's fixture infrastructure unmodified |
| Stage 3F | **Reopened** (2026-08-04, Stage 3F.5) — Stage 3F.2–3F.4's SSH coverage was marked complete without ever running against a real, authenticating Windows connection (the fixture's identity-path serialization was broken until a same-day RP). Fixing that exposed a second, unrelated Windows-only defect (remote shell mangles Git's POSIX-quoted remote path); Repair 1 (POSIX remote shell via `ForceCommand` → Git Bash) has since landed. Stage 3F.5.1–3F.5.3 then found this Win32-OpenSSH/`cmd.exe`/Git-Bash chain intermittently hangs (`git-clone-workflows`); Stage 3F.5.4 built and validated a containerized (WSL2 + Docker Engine) alternative as a proof of concept; Stage 3F.5.4-R1 hardened its lifecycle (transactional startup rollback, atomic provider initialization, content-addressed image caching) after a strict pre-push review — see below. `v0.1.0-beta.3` is superseded by `v0.1.0-beta.4`; see `docs/BETA3_ROADMAP.md`. |
| BRSP Stages B1/B2/B2.5 | **Complete** — repo cleanup, CI architecture redesign (composite actions, Rust caching fix, concurrency/timeouts), `wdio-e2e.yml` (manual, non-blocking WDIO CI), and real-GitHub-Actions validation of `ci.yml`/`dependency-audit.yml`. See `.ai/BRSP_B1_PROJECT_CLEANUP_REPORT.md`, `.ai/BRSP_B2_CI_ARCHITECTURE_REPORT.md`, `.ai/BRSP_B2_5_CI_VALIDATION_REPORT.md`. |
| Integration PR to development | **Merged** — PR #167, merge commit `70d9c8b` (BRSP Stage B3, whole-program integration) |
| Decision | Whole-program review completed as BRSP Stage B3; `roadmap/e2e-wdio` is merged into `development`. Any further E2E program work now branches from `development` directly (`feature/e2e-*` → `development`), not from `roadmap/e2e-wdio`. |

`roadmap/e2e-wdio` was a long-lived integration branch, not merged into
`development` after every stage — only after the program reached an agreed
completion point and received explicit whole-program review approval
(BRSP Stage B3). That integration is now complete: `development` contains
the full Stage 3F Git-workflow coverage plus the CI infrastructure prepared
during BRSP. The branch itself is left in place per this doc's own rule
that a `roadmap/*` branch must not be deleted merely because its stage(s)
are complete; deleting it, if ever warranted, is a separate decision this
merge does not make.

---

## E2E Program governance

> General project branching, NSP/RP workflow, review-context rules and branch
> responsibilities are defined in `CLAUDE.md`. This document covers Desktop E2E
> Program-specific policy only.

> **Status: this program's `roadmap/e2e-wdio` cycle is closed** — merged into
> `development` as BRSP Stage B3 (see "Program status" above). The flow below
> describes how this program operated while `roadmap/e2e-wdio` was open, and
> remains the template if a future E2E initiative reopens a `roadmap/e2e-*`
> branch. Until then, further Desktop E2E work is ordinary `feature/e2e-*`
> work targeting `development` directly, per `CLAUDE.md`'s "Small changes"
> workflow — not this section's `roadmap/e2e-wdio` flow.

### E2E branch flow

```
feature/e2e-*
  → PR → roadmap/e2e-wdio

roadmap/e2e-wdio
  → (whole-program review)
  → PR → development
  → merge only after explicit approval
```

### E2E-specific rules

- Never modify `development` or `master` directly from E2E work.
- Each `feature/e2e-*` PR targets `roadmap/e2e-wdio`, not `development`.
- Each feature PR must be independently reviewable.
- The roadmap branch may hold intermediate stages not yet suitable for integration.
- No new stage starts automatically from the previous one; stage priority is chosen
  based on product risk and testing value.

### E2E working model

For each substantial E2E change:

1. Define the problem and desired coverage.
2. Draft a stage plan.
3. Open a NSP if scope is non-trivial.
4. Create `feature/e2e-*` branching from `roadmap/e2e-wdio`.
5. Implement spec and selectors.
6. Open a PR targeting `roadmap/e2e-wdio`.
7. Generate review context against `roadmap/e2e-wdio` (the direct PR base).
8. Review.
9. Open a RP when required.
10. Merge to `roadmap/e2e-wdio`.
11. Update this document.

---

## Review-context base policy

> The full review-context base policy is defined in `CLAUDE.md`
> (§ Review-context base policy). For Desktop E2E work the rule is: always use
> the direct PR base.

For `feature/e2e-*` PRs the direct base is always `roadmap/e2e-wdio`:

```bash
BASE_BRANCH="$(gh pr view --json baseRefName --jq '.baseRefName')"
test -n "$BASE_BRANCH"
bash scripts/ai/build-review-context.sh \
  "$BASE_BRANCH" \
  ".ai/review-context-$(date +%Y%m%d-%H%M).md"
```

For direct maintenance on `roadmap/e2e-wdio` without a PR, use the parent commit:

```bash
REVIEW_BASE="$(git rev-parse HEAD^)"
bash scripts/ai/build-review-context.sh \
  "$REVIEW_BASE" \
  ".ai/review-context-$(date +%Y%m%d-%H%M).md"
```

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

**Overall status: COMPLETED**

Stage 2A (PR #144) and Stage 2B (PR #145) are both merged into `roadmap/e2e-wdio`.

### Stage 2 scope summary

**Stage 2A — Safety and recovery:**
- Unsafe clone URL validation (`ext::`, `fd::`, `file://` prefixes, and one HTTPS control)
- Missing repository path recovery (path does not exist)
- Existing non-RIS directory recovery (path exists but is not a RIS repository)
- No network access; no real clone operation

**Stage 2B — CSV import:**
- Device CSV import through the textarea path — no native file dialog
- Preview: paste CSV → preview → assert row count and device names visible
- Successful import: click Import → assert success banner → verify both devices in Devices panel
- Persistence: save + close + reopen by exact path → assert devices still present, no duplicates
- Negative validation: missing required `status` column → preview runs, import button remains blocked

### Stage 2 final validation (Linux, 2026-07-15)

| Stage | Run | Result | Duration | Exit |
|-------|-----|--------|----------|------|
| 2A | Isolated run 1 | PASSED 1/1 | 00:09:38 | 0 |
| 2A | Isolated run 2 | PASSED 1/1 | 00:09:36 | 0 |
| 2A | Full suite (4 specs) | PASSED 4/4 | 00:38:19 | 0 |
| 2B | Isolated run 1 | PASSED 1/1 | 00:12:46 | 0 |
| 2B | Isolated run 2 | PASSED 1/1 | 00:12:41 | 0 |
| 2B | Final full suite (5 specs) | **PASSED 5/5** | **00:51:12** | 0 |

Additional checks (Stage 2B):
- TypeScript: 0 errors
- Vitest: 844/844 passed
- All GitHub checks green

**Playwright:** blocked locally by missing `libasound2t64`. Pre-existing condition;
unrelated to Stage 2. Playwright was not run as part of Stage 2 validation.

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

**Status: COMPLETED**

Delivered through `feature/e2e-wdio-csv-import` — merged as PR #145.

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

**Validation (Linux, 2026-07-15):**

| Run | Result | Duration | Exit |
|-----|--------|----------|------|
| Isolated run 1 | PASSED 1/1 | 00:12:46 | 0 |
| Isolated run 2 | PASSED 1/1 | 00:12:41 | 0 |
| Final full suite (5 specs) | PASSED 5/5 | 00:51:12 | 0 |
| TypeScript | 0 errors | — | 0 |
| Vitest | 844/844 passed | — | 0 |
| GitHub checks | All green | — | — |

### Remaining candidate areas (unordered) — historical, superseded

> This list was drafted before Stage 3 and predates the current coverage
> gap analysis. Several items are now done; see `docs/E2E_WDIO_COVERAGE_GAPS.md`
> and "Future stages" below for the current, evidence-based next-stage
> proposal rather than this list.

The following areas were candidates for stages beyond Stage 2B, not
committed tasks, not in priority order:

- ~~**Runtime reduction** — Evaluate `tauri-plugin-wdio`...~~ — **done**,
  Stage 3B.4.
- ~~**Extended inventory workflows** — Edit and delete entity operations,
  full CRUD.~~ — **done**, Stage 3B.1/3B.2/3C.
- **CI execution** — still not done; full WDIO remains manual/optional (see
  "Desktop E2E execution policy" above). Candidate for a future stage.
- **Windows validation** — a one-off performance *experiment* ran (3B.3);
  no CI or repeatable validation exists. Still open.
- **Linux runner reproducibility** — still not confirmed for CI.
- **Export workflows** — Rack SVG/PNG export; still MISSING, native-dialog
  concern still applies (see coverage gap analysis).
- **Git workflow** — still NEEDS SELECTOR; no `data-testid`s exist on
  `RepositoryPanel`'s git actions.
- **Cross-platform path behavior** — still open.

---

## Stage 3 — Placement and CRUD workflows

**Overall status: COMPLETED** (3A, 3B.1, 3B.2, 3B.3, 3B.4, 3C all merged;
the two technical passes that followed — WDIO provider benchmark and
embedded-provider removal — are documented further below and are not
numbered Stage 3 sub-stages)

Stage 3 is split into independently reviewable sub-stages.

### Stage 3A — Placement lifecycle

**Status: COMPLETED** (merged as PR #147, merge commit `40f6a12`)

Delivered through `feature/e2e-wdio-placement-lifecycle`.

**Scope:**

- Place device at U1 via `PlacementPalettePanel` → `PlacePlacementModal`
- Edit placement: move from U1 to U5 via `PlacementInspectorPanel` → `EditPlacementModal`
- Verify card moved to U5; U1 empty; model association unchanged
- Persist moved placement: save + close + reopen → verify U5, empty U1, correct model
- Remove placement: `PlacementInspectorPanel` → `remove-from-rack-btn` → `ConfirmDialog`
- Verify device returns to unplaced state in Devices panel
- Persist removal: save + close + reopen → device unplaced, no placed card in rack

**Rack geometry:**
- Rack: 14U
- Device model: 2U server
- Initial position: U1 (occupies U1–U2)
- Moved position: U5 (occupies U5–U6)

**Spec:** `apps/desktop/e2e-wdio/specs/placement-lifecycle.e2e.ts`

**New selectors:** None.  All selectors (`open-edit-modal-btn`, `start-u-input`, `save-btn`,
`remove-from-rack-btn`, placed card attributes) were already present from Stages 1 and 2.
`ConfirmDialog` confirm button located via `button.btn-danger` inside `[data-testid="modal-backdrop"]`
using `browser.execute()` — native text selector `button=Remove from rack` was avoided because
the inspector button (also labelled "Remove from rack") appears before the portal in DOM order,
and native `.click()` fires `mousedown` which lands on the backdrop overlay and triggers
`handleBackdrop` → immediate dialog close before the confirm button can be activated.

**Validation (Linux, 2026-07-16):**

| Run | Result | Duration | Exit |
|-----|--------|----------|------|
| Isolated run 9 | PASSED 1/1 | 00:35:36 | 0 |
| Isolated run 10 | PASSED 1/1 | 00:35:38 | 0 |
| Full suite (6 specs) | PASSED 6/6 | 01:26:54 | 0 |
| TypeScript | 0 errors | — | 0 |
| Vitest | 844/844 passed | — | 0 |
| GitHub checks | All green (CI #29478292711) | — | — |

### Stage 3B.1 — Entity updates and work mode

**Status: COMPLETED** (merged as PR #149, merge commit `abcb8e4`)

Delivered through `feature/e2e-wdio-entity-updates-work-mode`.

**Scope:**

- Work mode toggle: Planning → On-site → Planning (`work-mode-toggle`, `aria-pressed`)
- Edit device: change name, status, serial number (`device-form-submit`, `field-*`)
- Edit device model: change name, height, SKU (`model-form-submit`, `field-*`)
- Edit rack: change name, height, row (`rack-form-submit`, `field-*`)
- Edit location: change name (`location-form-submit`, `field-name`)
- Aggregate verification: all four updated entities visible in their panels
- Persistence: save + close + reopen → all four updates survive

**Spec:** `apps/desktop/e2e-wdio/specs/entity-updates-work-mode.e2e.ts`

**New selectors:** None.  All selectors were already present in application source.
Edit buttons use existing `aria-label="Edit <name>"` pattern; form field testids
(`field-name`, `field-height-u`, `field-row`, `field-model-sku`, `field-status`,
`field-serial`) and submit testids were already present from Stage 1.

**Validation (Linux, 2026-07-16):**

| Run | Result | Duration | Exit |
|-----|--------|----------|------|
| Full suite (7 specs) | PASSED 7/7 | — | 0 |
| TypeScript | 0 errors | — | 0 |
| Vitest | passed | — | 0 |
| GitHub checks (CI #29809393075) | All green | — | — |

### Stage 3B.2 — Delete flows and destructive-operation guards

**Status: COMPLETED** (merged as PR #152, merge commit `95ea5fd`)

> **Spec names below are historical.** The four specs delivered here
> (`entity-deletes-inventory`, `entity-deletes-hierarchy`,
> `destructive-guards-inventory`, `destructive-guards-hierarchy`) were
> consolidated into two specs (`entity-deletes.e2e.ts`,
> `destructive-guards.e2e.ts`) during Stage 3C's spec-consolidation audit —
> see "E2E spec consolidation" below. The workflow coverage described here
> is unchanged; only the file layout changed.

Delivered through `feature/e2e-wdio-destructive-guards`.

> **Architecture note:** `entity-updates-work-mode.e2e.ts` runs approximately 57 minutes.
> Stage 3B.2 **is implemented as separate specs** to avoid exceeding per-spec runtime limits.
> The Mocha timeout was increased to 90 minutes (5,400,000 ms) in the PR #152 repair pass
> to accommodate guard specs with 3× `navigateToRackDetail` + full 7-part graph assertions
> (~70 min observed).

**Scope:**

Four independent specs, each creating its own isolated repository:

- **`entity-deletes-inventory.e2e.ts`** — Two successful inventory-entity delete workflows:
  - Delete device model (unreferenced) → delete device (unplaced, no model)
  - Cancel assertion: dialog appears and entity survives cancel
  - Persistence: save + close + reopen → both entities absent
- **`entity-deletes-hierarchy.e2e.ts`** — Two successful hierarchy-entity delete workflows:
  - Delete rack (no placements) → delete location (no racks)
  - Relational count assertions (rack count on location, placement count on rack)
  - Persistence: save + close + reopen → both entities absent
- **`destructive-guards-inventory.e2e.ts`** — Two inventory-layer guard workflows:
  - Guard device model (device references it) → guard device (placed in rack)
  - Full 7-part graph assertions (A: setup, B: reopen verification, C–D: guard cycles,
    E: aggregate, F: dirty-state assertion, G: post-close reopen)
- **`destructive-guards-hierarchy.e2e.ts`** — Two hierarchy-layer guard workflows:
  - Guard location (rack references it) → guard rack (placement references it)
  - Full 7-part graph assertions (same A–G structure as inventory guards)

**New selectors added to application source:**

| Selector | Element | Location |
|----------|---------|----------|
| `confirm-dialog-confirm` | Confirm button in `ConfirmDialog` footer | `ConfirmDialog.tsx` |
| `confirm-dialog-cancel` | Cancel button in `ConfirmDialog` footer | `ConfirmDialog.tsx` |
| `location-delete-error` | Wrapper `<div>` around delete error `Banner` | `LocationsPanel` |
| `rack-delete-error` | Wrapper `<div>` around delete error `Banner` | `RacksPanel` |
| `device-model-delete-error` | Wrapper `<div>` around delete error `Banner` | `DeviceModelsPanel` |
| `device-delete-error` | Wrapper `<div>` around delete error `Banner` | `DevicesPanel` |

Delete trigger buttons use the existing `aria-label="Delete <name>"` pattern scoped to the
exact entity row — no new testid needed for the trigger itself.  ConfirmDialog buttons are
clicked via `browser.execute()` synthetic click to bypass the WebKitGTK modal-backdrop
`mousedown` intercept.  Row delete buttons are safe to native `.click()`.

**Shared support:** `apps/desktop/e2e-wdio/support/destructive-ui.ts` — helpers covering
atomic DOM reads, row finders, delete interaction, error banner assertions, rack-list/detail
state detection (`waitForRackListOrDetail`, `ensureRackListView`), and relational count helpers.

**Coverage: 8 workflows** promoted from NEEDS SELECTOR → COVERED.

See [`docs/E2E_WDIO_COVERAGE_GAPS.md`](E2E_WDIO_COVERAGE_GAPS.md) for the full matrix.

**RP hardening (PR #152 repair pass, 2026-07-22):**

The original `destructive-guards.e2e.ts` was split into two specs.  During the repair pass
the following hardening was applied to `destructive-ui.ts` and `wdio.conf.ts`:

- `waitForRackListOrDetail`: now requires **both** `palette-drop-zone` AND `rack-detail-back-btn`
  before returning `"detail"`, preventing false positives from transient residual DOM states
  where `palette-drop-zone` lingers while `rack-detail-back-btn` is absent.
- `ensureRackListView`: replaced `browser.execute()` synthetic click with direct `.click()` on
  `rack-detail-back-btn` — the back button is not behind a modal backdrop, so native click is
  correct and avoids `ChainablePromiseElement` serialization errors.
- `findRowByExactName` calls immediately after `ensureRackListView()` in guard specs now use a
  30 s timeout (was 15 s) to accommodate a data-load race: `rack-add-btn` can appear before
  `listRacks()` resolves, causing the row lookup to time out before the data arrives.
- Mocha timeout increased from 3,600,000 ms (60 min) to 5,400,000 ms (90 min) to accommodate
  guard specs that take ~70 min (3× navigateToRackDetail + full 7-part graph assertions).

**Validation (Linux, 2026-07-22–23, PR #152 validation RP):**

Binary: `./node_modules/.bin/tauri build --no-bundle --config '{"build":{"beforeBuildCommand":""}}'` — PASS (47 s)
Display: `Xvfb :77 -screen 0 1280x1024x24`
Playwright: BLOCKED — environment dependency: `libasound2t64` (pre-existing; no dependency changes)

| Spec | Run | Result | Duration |
|------|-----|--------|----------|
| `entity-deletes-inventory` | run 1 | PASSED | 00:38:15 |
| `entity-deletes-inventory` | run 2 | PASSED | 00:38:32 |
| `entity-deletes-hierarchy` | run 1 | PASSED | 00:31:12 |
| `entity-deletes-hierarchy` | run 2 | PASSED | 00:31:12 |
| `destructive-guards-inventory` | run 1 | PASSED | ~01:09 |
| `destructive-guards-inventory` | run 2 | PASSED | ~01:09 |
| `destructive-guards-hierarchy` | run 1 | PASSED | ~01:05 |
| `destructive-guards-hierarchy` | run 2 | PASSED | ~01:08 |
| Full suite (11 specs) | — | **PASSED 11/11** | — |

### Stage 3B.3 — Windows WDIO performance experiment

**Status: COMPLETE** — Decision: **KEEP EXTERNAL — temporary** (PR #153)

Branch: `experiment/e2e-wdio-windows-performance`
Direct base: `roadmap/e2e-wdio`

**What this stage delivered:**
- Opt-in timing instrumentation (`RIS_WDIO_TIMING=1`) via WDIO command hooks
- `RIS_WDIO_DRIVER_PROVIDER=external|embedded` env-var switch in `wdio.conf.ts`
- Optional Cargo feature `wdio-embedded` wrapping `tauri-plugin-wdio-webdriver`
  (no impact on production builds; guarded by `#[cfg(feature = "wdio-embedded")]`)
- `measureStep()` helper in `core-inventory.e2e.ts` for 9 logical business steps
- Benchmark runner script with PID-safe cleanup and outcome classification
- Performance comparison document: `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`

**Coverage changes:** none.  No COVERED counts changed; no specs added or removed.

**Results:** Windows matrix complete (8 runs, two passes; see `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`).

- app-smoke: external `PASS_WITH_FORCED_CLEANUP` ×2 (test correct; PID-safe cleanup
  handles leftover driver processes safely). Embedded `CLEAN_PASS` ×2, consistently
  faster (session startup ~79–83% lower, test execution ~34% lower).
- core-inventory: external `PASS_WITH_FORCED_CLEANUP` ×2, all 9 steps pass both runs.
  Embedded `TEST_FAILED` ×2 — deterministic failure at device-model selection:
  `tauri-plugin-wdio-webdriver` v1.2.0 does not dispatch `mousedown`, so the
  `SearchableSelect` component (used in `DeviceFormModal` and `PlacePlacementModal`)
  cannot be interacted with. Confirmed on both Windows/WebView2 and Linux/WebKit.

**Decision: KEEP EXTERNAL — temporary.**

- External completed full `core-inventory` flows (9/9 steps, 2/2 runs); behaviour
  is correct.  Default provider does not change.  PID-safe cleanup safely handles
  Windows teardown gap.
- Embedded is faster where it works (~34–35% on shared steps) but cannot complete
  the full spec due to a confirmed upstream `mousedown`-synthesis gap.  Adopting
  embedded in its current state would reduce real E2E coverage.
- Embedded is deferred to a separate future stage, contingent on an upstream fix or
  deliberate compatibility layer plus a full regression of all specs.

> **What actually happened next (historical outcome, not part of this
> stage):** the `mousedown` gap turned out to need no upstream fix — a
> "correct existing API usage" test-side change (Actions-routed clicks)
> resolved it, and embedded was restored to fully usable in a later
> technical pass. It was then benchmarked head-to-head against external
> (see "Technical pass — WDIO provider benchmark" below) and found ~12–28x
> slower with no stability advantage, and was subsequently removed
> entirely (see "Embedded WDIO provider removal" below). Kept here
> unedited as the historical record of this stage's own decision and
> reasoning at the time.

**Next stage:** optimize long-action latency in the external-provider flow (separate
branch from the updated `roadmap/e2e-wdio` base; Stage 3C and later stages
remain as planned).  No optimizations were implemented in this stage.

---

### Stage 3B.4 — E2E WDIO latency optimization

**Status: COMPLETED** (merged as PR #154, merge commit `a095043`)

Branch: `feature/e2e-wdio-latency-optimization`
Direct base: `roadmap/e2e-wdio`
Base SHA: `bd43e90b41bec7237693fe3c845b46bdf4f2f8c2`
Default provider: `external`

**Goal:** Reduce the long-tail latency observed in the external-provider flow
without changing test coverage, assertion semantics, or the default provider.

**Scope:**

- Fresh Linux baseline (`app-smoke` ×2, `core-inventory` ×2)
- Classification of the long-tail command distribution
- Optimization of redundant WebDriver state reads and polling patterns
- No coverage changes; no assertion changes; no provider changes
- Before/after comparison on the same environment and binary

**Not Stage 3C.** Stage 3C remains reserved for remaining placement workflows.
No parallel spec execution. No changes to `SearchableSelect.tsx` or embedded provider.

See `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` for full baseline data, diagnosis,
optimization batches, and before/after results (Linux Class A/B/C, §1–10).

**Windows repair pass (primary environment from this point):** correctness
repairs to `expectActiveRepositoryPath`/visibility helpers, a new opt-in
`representative-latency` benchmark (9 interaction-pattern cases drawn from
existing specs), a Windows baseline ×2 (1,069,722ms median), root-cause
diagnosis of a `@wdio/tauri-service` plugin-availability retry loop, three
optimization batches (client-side retry bypass, then installing
`tauri-plugin-wdio` behind a test-only Cargo feature — the actual root fix),
and a Windows final ×2 (12,287ms median, **−98.9%**). See
`docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §11 for full detail.

**Second Windows repair pass (target-spec migration, same branch/PR):**
moved the verified optimizations from the diagnostic benchmark into the
real specs. Hardened `expectActiveRepositoryPath`'s `canonicalPath()`
exception handling. Formalized the `wdio-plugin` test binary as a
committed, scripted build (`scripts/build-wdio-plugin-binary.mjs`,
`target-wdio-plugin/`, never the regular `target/release/`), with an opt-in
`RIS_WDIO_EXPECT_PLUGIN` presence contract. A/B-confirmed
`clickElementProtocol` remains ~40%/80ms faster than `browser.$().click()`
even with the plugin installed. Migrated 7 of 11 specs (`csv-import`,
`destructive-guards-hierarchy`, `destructive-guards-inventory`,
`entity-deletes-hierarchy`, `entity-deletes-inventory`,
`entity-updates-work-mode`, `placement-lifecycle`) to the shared
`clickWhenEnabled`/`clickNav` helpers; every modified spec validated
directly on Windows (6-28s each, down from historical Linux times of
minutes-to-~70min — see the before/after caveat in
`docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §12.5). `core-inventory ×2` and
`representative-latency ×2` re-validated on the final HEAD; the
representative benchmark passed its regression gate against the previous
final (all deltas within threshold). Full WDIO suite remains intentionally
deferred, not a merge gate for this pass. See
`docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §12 for full detail, including the
list of remaining costly patterns consciously left for a future pass.

**Linux canonical-runner repair pass (same branch/PR, two parts):** Linux
is now the primary Stage 3B.4 validation environment (all validation below
ran directly on Linux/WebKitWebDriver, not carried over from Windows).

- **Part 1** (static/unit-tested only, no E2E environment available in that
  session): hardened `scripts/run-wdio-e2e.mjs`'s port contract to a hard
  pre-run/post-run gate (occupied port or unverifiable `ss` probe now fails
  the run, never just warns), made the child environment deterministic
  (inherited `RIS_WDIO_EXPECT_PLUGIN`/`RIS_WDIO_DRIVER_PROVIDER`/
  `TAURI_BINARY_PATH` are discarded before this run's own values are set;
  `--binary` now requires an explicit `--expect-plugin`), fixed
  `plugin-presence.ts` and `expectActiveRepositoryPath` to distinguish a
  genuine WebDriver infrastructure failure from a real plugin-absence/
  path-mismatch result instead of conflating the two, and restored the
  placement modal's specific `"Placement failed"` diagnostic in the shared
  `waitForFormCloseOrError` helper.
- **Part 2** (full Linux E2E validation on real `xvfb-run`/`WebKitWebDriver`):
  validated the canonical runner's port contract with a real occupied-port
  negative test, ran the integration smoke (`app-smoke`) and all six specs
  modified by this repair pass, and ran `representative-latency ×2` and
  `core-inventory ×2` — the first plugin-backed Linux runs of either,
  establishing fresh Linux baselines rather than comparing against Windows.
  Also confirmed the production-shaped binary (no `wdio-plugin` feature)
  still correctly reports `wdioPluginAvailable=false`/`buildVariant=plain`
  through the same runner. Real E2E execution surfaced two further,
  previously-undetected bugs, fixed and re-validated in place: a driver-level
  race where the plugin-presence probe's first `browser.execute()` call
  (issued in the same tick as `@wdio/tauri-service`'s own before-hook probe)
  could hang for the full `connectionRetryTimeout` (90 s), and a
  `cleanupOwnedRunRoot` teardown race (`ENOTEMPTY`) against the app
  process's own still-settling filesystem writes, since WDIO's `onComplete`
  hook fires before the driver/app process is stopped. See
  `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §13 for full environment details,
  the occupied-port test transcript, and all before/after metrics. Full
  11-spec suite remains intentionally deferred — not a gate for this pass.

**Strict-review repair pass (same branch/PR):** addressed two blockers
from a strict review of PR #154. (1) `csv-import.e2e.ts` is modified in
the PR's overall diff against `roadmap/e2e-wdio` but had not been run
directly on the Linux final HEAD — the Linux repair pass above validated
only the six specs it touched, not every real E2E spec modified anywhere
in the PR. Ran it via the canonical runner (no code changes needed):
`CLEAN_PASS`, `wdioPluginAvailable=true`, `buildVariant=wdio-plugin`,
ports free before/after. The full modified-vs-validated real E2E spec
lists (8 specs each, from `git diff --name-status
origin/roadmap/e2e-wdio...HEAD -- apps/desktop/e2e-wdio/specs`) are now
identical. (2) The PR body/docs previously stated "CI workflow: PASS (6/7
checks)" while `Frontend dependency audit` was failing — corrected to
report each CI job separately with `CI overall: PARTIAL FAILURE`, and
re-confirmed via a lockfile diff against the direct base that the failing
advisories pre-date this PR and no new vulnerable dependency version was
introduced. See `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md` §14 for full
detail. PR #154 was subsequently merged (merge commit `a095043`).

---

### Technical pass — Node 24, dependency audit, embedded driver restoration

**Status: COMPLETE** — not a program stage; Stage 3C has not started.

> **Historical.** The embedded WDIO driver restored by this pass was later
> fully removed — see "Embedded WDIO provider removal" below. The
> `pnpm test:e2e:wdio:embedded` command, `target-embedded/`,
> `RIS_WDIO_DRIVER_PROVIDER=embedded`/`RIS_WDIO_EMBEDDED_PORT`, and the
> `wdio-embedded` Cargo feature described in this section no longer exist.
> Kept as-is below for the historical record of what this pass did and why.

Branch: `chore/e2e-dependency-audit-embedded-driver`
Direct base: `roadmap/e2e-wdio`
Checkpoint HEAD: `4db16bc1fb5fe1dd700b66cfab5e839f769cff85`
Final HEAD: `73e224d02b1a14f18b3fcc84d3d3a314f3a8404a`
Default provider: `external` (unchanged)

**Goal:** resume a technical pass that was blocked before Stage 3C — unify the
toolchain on Node.js 24 LTS, re-validate the dependency audit on that
toolchain, and determine whether the embedded WDIO driver (deferred at the
end of Stage 3B.3, §"Stage 3B.3 — Windows WDIO performance experiment") can
be restored to a usable state. Stage 3C (remaining placement workflows) is
explicitly out of scope for this pass.

**1. Node.js 24 LTS.** Standardized on Node.js 24.18.0 LTS ("Krypton"), the
newest published 24.x release at the time of this pass (per
`https://nodejs.org/dist/index.json`), replacing the prior Node 22 pins.
Updated `.nvmrc` (`24`), `package.json` (`engines.node: ">=24 <25"`,
`packageManager` unchanged at `pnpm@10.33.4`), and all three GitHub Actions
workflows (`ci.yml`, `dependency-audit.yml`, `windows-installer.yml`,
`node-version: 22` → `24`). Extended `scripts/check-version-consistency.mjs`
to also cross-check `.nvmrc` / `engines.node` / every workflow's
`node-version` and fail on drift, with new fixture-based tests
(`scripts/check-version-consistency.test.mjs`).

**2. Dependency audit re-validation.** On Node 24.18.0 / pnpm 10.33.4
(corepack-activated): `pnpm install --frozen-lockfile` — lockfile unchanged;
`pnpm audit` — initially clean (0 vulnerabilities), matching the checkpoint's
prior fix. A second audit run later in the same pass (after the embedded
work) surfaced one **new** high-severity advisory that had not been present
at the checkpoint: `brace-expansion` DoS via unbounded expansion length
(GHSA-mh99-v99m-4gvg), affecting versions `<=5.0.7`, transitively pulled in
at two different major versions (1.1.16 and 2.1.2) via `@wdio/cli`'s
`minimatch`/`recursive-readdir`/`glob`/`jake`/`mocha`/`archiver` dev-tooling
chain — no production dependency. Fixed in a dedicated commit via a
`pnpm.overrides` pin to `brace-expansion: ">=5.0.8"`; `pnpm audit` is clean
again (0 vulnerabilities) and both resolutions now converge on 5.0.8.
`pnpm why` confirmed the dependency paths for `brace-expansion`,
`fast-xml-parser`, `postcss`, and `@babel/core` — all resolve to a single
version each (except brace-expansion before the fix) and all trace to
`devDependencies` (WDIO tooling, Vite/Vitest, Babel via
`@vitejs/plugin-react`), none to production runtime dependencies.

**3. Embedded driver upstream investigation.** The known blocker from Stage
3B.3 (`tauri-plugin-wdio-webdriver` 1.2.0 does not dispatch `mousedown`, so
`SearchableSelect`'s `onMouseDown`-based option selection cannot be driven
under the embedded provider) was investigated directly against the
`webdriverio/desktop-mobile` upstream repository (issues, merged PRs,
current `main` source, published crate/npm versions):

- `tauri-plugin-wdio-webdriver` 1.2.0 (released 2026-06-25) remains the
  newest published version on crates.io as of this pass; no newer release
  exists.
- Reading the current upstream `main` source
  (`packages/tauri-plugin-webdriver/src/platform/executor.rs`) confirms the
  root cause is still present: the plain WebDriver classic "Element Click"
  handler (`click_element`, reached by a bare WDIO `.click()`) resolves to a
  JS `el.click()` call, which synthesizes a `click` event but never a
  `mousedown` — this has not changed since 1.2.0.
- However, the same source shows the W3C **Actions** API endpoint
  (`/session/{id}/actions`, `packages/tauri-plugin-webdriver/src/server/handlers/actions.rs`)
  already dispatches real `mousedown`/`mouseup` DOM events via
  `dispatch_pointer_event()` (`PointerEventType::Down` → `"mousedown"`,
  `Up` → `"mouseup"`, plus a synthesized `"click"` on release) — and this
  path was further hardened by upstream PR #433 ("resolve pointerMove origin
  so `click(options)` hits the target", merged 2026-06-19), already included
  in the currently-pinned 1.2.0 release.
- `webdriverio`'s own client documents that `element.click(options)` — i.e.
  passing a (possibly empty) options object instead of calling bare
  `.click()` — routes the command through the Actions API instead of
  WebDriver classic click. This is provider-agnostic: it works identically
  on the external and embedded providers.
- **Conclusion: remediation category 1 (correct existing API usage).** No
  upstream patch, pinned unreleased commit, test-only adapter, local patch,
  or fork was needed. `apps/desktop/src/components/ui/SearchableSelect.tsx`
  was **not modified**.

**4. Fix applied (test-side only).** Added `selectSearchableOption()` to
`apps/desktop/e2e-wdio/support/spec-interactions.ts`, using
`option.click({})` (Actions-routed) instead of a bare `.click()`, and
replaced every SearchableSelect option-click site with it: `core-inventory`,
`destructive-guards-hierarchy`, `destructive-guards-inventory`,
`entity-updates-work-mode`, `placement-lifecycle` (specs), and
`representative-latency` (benchmark) — consolidating five near-duplicated
inline polling loops and one raw XPath click into one shared, provider-
correct helper. No `HTMLElement.click()` workaround was introduced anywhere.

**5. Canonical embedded runner.** Added `pnpm test:e2e:wdio:embedded`
(`scripts/run-wdio-e2e-embedded.mjs`), the embedded counterpart to the
existing external canonical runner (`pnpm test:e2e:wdio`):

- Builds a dedicated `wdio-embedded` test binary
  (`scripts/build-wdio-embedded-binary.mjs`, `--features wdio-embedded`)
  into its own `CARGO_TARGET_DIR` (`target-embedded/`) — never
  `target/release/` (production) or `target-wdio-plugin/` (external-provider
  test binary).
- Sets `RIS_WDIO_DRIVER_PROVIDER=embedded` and `RIS_WDIO_EMBEDDED_PORT`
  (default 4445), discarding any inherited provider/port/binary env vars
  first so the child environment is fully deterministic.
- Reports provider and build variant up front
  (`provider=embedded buildVariant=wdio-embedded binary=... port=...`).
- Requires port 4445 (or `--port`) free before **and** after every run —
  refusing to start, or to report success, otherwise — and never kills a
  pre-existing process itself (diagnosed and aborted instead). Delegates
  the actual spec execution and PID-safe cleanup to the existing
  `run-wdio-performance-benchmark.mjs` (`--provider embedded`).
- A spawn failure is re-thrown with the original error preserved as
  `Error.cause`, printed in full by the top-level handler.
- Both new scripts reuse the existing pure port-contract helpers
  (`parseListeningPorts`/`inspectPortProbeResult`/`deriveFinalRunnerExitCode`)
  and spec-name validation (`isKnownSpecName`) rather than re-implementing
  them, with fixture-based unit tests
  (`scripts/build-wdio-embedded-binary.test.mjs`,
  `scripts/run-wdio-e2e-embedded.test.mjs`).

**6. SearchableSelect regression spec.** Added
`apps/desktop/e2e-wdio/specs/searchable-select-regression.e2e.ts`, a minimal
real E2E spec dedicated to `SearchableSelect` via the device form's model
field: opens the dropdown, searches (including a query that narrows the
option list to empty, proving the filter is real), selects via
`selectSearchableOption`'s Actions-routed click, confirms the trigger
updates, saves the form, then reopens the device to confirm the value
survived a real persistence round-trip (not just in-memory React state).

**7. Embedded validation (Linux, `xvfb-run` + WebKitWebDriver, final HEAD
`73e224d`).** Canonical embedded runner used throughout
(`pnpm test:e2e:wdio:embedded`). All outcomes below are `CLEAN_PASS` (test
passed, timing report valid, no forced cleanup needed, ports free before and
after):

| Spec | Run(s) | Duration |
|------|--------|----------|
| `app-smoke` | 1 | 66 s |
| `searchable-select-regression` | 1 | 177 s |
| `core-inventory` | ×2 | 280 s, 279 s (<1% variance) |
| `representative-latency` | ×2 | 239 s, 239 s (0% variance) |
| `csv-import` | 1 | 353 s |
| `destructive-guards-hierarchy` | 1 | 2664 s (44:21) |
| `destructive-guards-inventory` | 1 | 2675 s (44:32) |
| `entity-deletes-hierarchy` | 1 | 1165 s (19:22) |
| `entity-deletes-inventory` | 1 | 1412 s (23:29) |
| `entity-updates-work-mode` | 1 | 1939 s (32:15) |
| `placement-lifecycle` | 1 | 1211 s (20:08) |
| `repository-lifecycle` | 1 | 162 s (2:38) |
| `safety-recovery` | 1 | 358 s (5:55) |

Every real spec under `apps/desktop/e2e-wdio/specs/*.e2e.ts` (12/12) plus the
`representative-latency` benchmark ran via the canonical embedded runner on
the final HEAD — not just `app-smoke`. `core-inventory` (previously
`TEST_FAILED` under embedded at device-model selection, per Stage 3B.3) and
every other spec touching `SearchableSelect` now completes end to end.

**Embedded driver: USABLE.**

**8. External regression (final HEAD, same environment).** External
provider unchanged and still the default:

- `app-smoke` (rebuilt `wdio-plugin` binary fresh): `CLEAN_PASS`, 5 s.
- `core-inventory` (`--skip-build`): `CLEAN_PASS`, 10 s.
- Production-shaped binary (`CARGO_TARGET_DIR=target-production-check`,
  plain `tauri build --no-bundle`, no `wdio-*` feature) run via
  `pnpm test:e2e:wdio -- --spec app-smoke --binary
  "$PWD/target-production-check/release/rack-inventory-studio-desktop"
  --expect-plugin absent`: `CLEAN_PASS`, 76 s — `window.wdioTauri` confirmed
  `undefined`, i.e. the plugin is absent from the production-shaped binary.
  Embedded (`target-embedded/`), external-test (`target-wdio-plugin/`),
  production-check (`target-production-check/`), and production
  (`target/release/`) binaries remain four distinct build outputs.

**9. Static validation (Node 24.18.0 / pnpm 10.33.4).** `git diff --check`,
`pnpm install --frozen-lockfile`, `pnpm audit` (0 vulnerabilities),
`pnpm -C apps/desktop typecheck`, `pnpm -C apps/desktop test` (917/917),
`node --test scripts/*.test.mjs` (328/328, including the new
embedded-runner and version-consistency test files),
`node scripts/check-repo-hygiene.mjs` (8/8), `node
scripts/check-version-consistency.mjs` (app version + toolchain both
consistent), `cargo fmt --all --check`, `cargo check --workspace`, `cargo
clippy --workspace -- -D warnings`, and `cargo check`/`cargo clippy -p
rack-inventory-studio-desktop` for both `--features wdio-embedded` and
`--features wdio-plugin` — all clean.

**Not done / deferred:** CI (GitHub Actions) results are per-job in the PR
body once pushed — this pass validated everything the CI jobs check
directly and locally, but the workflows themselves had not yet run against
this branch at the time of writing. Stage 3C (remaining placement
workflows) was **not started**.

---

### Technical pass — WDIO provider benchmark (external vs. embedded)

**Status: COMPLETE (historical)** — not a program stage; Stage 3C had not
started. This benchmark is the basis for the later decision to fully remove
the embedded provider — see "Embedded WDIO provider removal" below.

Branch: `chore/e2e-provider-benchmark`, direct base `roadmap/e2e-wdio`.

Benchmarked the external and embedded providers head-to-head on the same
HEAD, same fresh binaries (build time excluded), alternating runs (1
discarded warm-up + 5 measured runs per provider, interleaved to control
for system-load drift).

**`app-smoke` (this pass, 5 measured runs each, fully completed):**

| Metric | External | Embedded |
|---|---|---|
| Runs | 5/5 CLEAN_PASS | 5/5 CLEAN_PASS |
| Median | 5318 ms | 65042 ms |
| Mean | 5315 ms | 65036 ms |
| CV | 1.41% | 0.04% |
| Ports free before/after | 5/5 | 5/5 |

Embedded is **1123% slower (≈12.2×)**. Both providers individually stable
(CV well under 2%) — a large, consistent, reproducible gap, not noise.

**`core-inventory`** (prior validated data, same HEAD lineage, one commit
earlier): external ~10s (1/1 CLEAN_PASS, `--skip-build`) vs. embedded 280s,
279s (2/2 CLEAN_PASS) — embedded ≈**28× slower**.

**`representative-latency`** (prior validated data): embedded 239s, 239s
(2/2 CLEAN_PASS, 0% variance); no directly comparable external run in this
pass, but the consistent order-of-magnitude gap on the other two specs
gives no basis to expect a reversal.

Both specs with a direct external comparison fail the pre-declared
≥10%-faster-median decision threshold by roughly three orders of magnitude
in the wrong direction. Stability was not the deciding factor — every
completed run on both providers was `CLEAN_PASS` with ports free
before/after; total wall-clock time was.

This does not contradict the earlier finding (§"Stage 3B.3") that embedded
has lower *in-session* per-command latency once a session is established —
this benchmark measures **total wall-clock time per run**, including
embedded's own process-spawn-and-become-ready sequence, which in this
environment cost roughly a fixed minute per run, dwarfing the per-command
savings for anything but a very long-running spec.

Two tooling bugs were found and fixed along the way (both benchmark-tooling
issues, not embedded-driver correctness issues): a `spawnSync` ENOBUFS
crash from capturing verbose WDIO output into an in-memory buffer instead
of a file, and a `brace-expansion@5.0.8`/`minimatch` incompatibility left
over from PR #155's own audit fix (fixed by also overriding `minimatch` to
`>=10.2.5`, whose `package.json` already requires a compatible
`brace-expansion` — this override remains in `package.json` today and is
unrelated to the embedded provider: it fixes a real dependency-resolution
issue in `@wdio/cli`'s own dev-tooling chain, needed by the external
provider too).

**Decision at the time: external remains the default provider**, embedded
kept as opt-in. No default-provider code changes were made in this pass.
(Superseded: embedded was later removed entirely — see below.)

---

### E2E spec consolidation

**Status: COMPLETE** (part of the Stage 3C pass below).

Audit of `apps/desktop/e2e-wdio/specs/*.e2e.ts`, `benchmarks/*.e2e.ts`, and
`support/*` before adding Stage 3C coverage, per the goal of reducing costly
app/session launches without merging specs that don't actually belong
together. Every existing pair the audit was asked to check by name is
addressed below — including the two pairs judged **not** to merge, with the
reason.

**Merged:**

- **`destructive-guards-hierarchy.e2e.ts` + `destructive-guards-inventory
  .e2e.ts` → `destructive-guards.e2e.ts`.** Both built the *exact same*
  fixture (Location, Rack 14U, Device Model 1U server, Device with model
  assigned, Placement at U1) independently before testing a different guard
  pair against it (Location/Rack vs. Device Model/Device). Every guard check
  in both original specs only *attempts* a blocked delete — none of them
  ever mutates the graph — so running all four guard checks against one
  shared fixture carries no order-dependency or isolation risk. Setup
  (fixture creation, full-graph verification, aggregate check, dirty-state
  check, reopen-verification) that was previously duplicated across two full
  app launches now runs once. Before (embedded, prior validated data):
  44:21 + 44:32 ≈ 89 min combined. After (external, this pass): 33–35s for
  one combined run (3 runs, all `CLEAN_PASS`) — not re-measured under
  embedded in this pass (external is the default/gating provider; the
  embedded provider was decided during this pass to be removed entirely —
  see "Embedded regression" below).
- **`entity-deletes-hierarchy.e2e.ts` + `entity-deletes-inventory.e2e.ts` →
  `entity-deletes.e2e.ts`.** Fixtures are disjoint — Location/Rack vs.
  Device Model/Device, and the device stays unplaced — so the two deletion
  sequences never interact: deleting the Rack/Location has no bearing on the
  Device/Model's existence or vice versa. One shared repository/session
  instead of two. Before (embedded, prior validated data): 19:22 + 23:29 ≈
  43 min combined. After (external, this pass): 28–29s.

**Helper refactor (both merges + Stage 3C):** `navigateToRackDetail`
(previously duplicated locally, with diverging robustness, in
`destructive-guards-inventory.e2e.ts` and `placement-lifecycle.e2e.ts`) is
now the one canonical version in `destructive-ui.ts`. Extracted
`clickLocationRowAndEnterRacks()`, which waits for the `nav-racks` tab to
become visible before proceeding — a real application-state condition
(matching the wait `core-inventory.e2e.ts` already used after its own
location-row click) that closes a rare race between a location-row click
and the following rack-list/detail state check; caught once during
validation of the new `destructive-guards.e2e.ts` (a `findRowByExactName`
timeout), not reproduced across five subsequent runs of the merged specs
after the fix. Also extracted `placeDeviceAtU()` (palette Place →
`PlacePlacementModal` → fill start U → submit), which
`destructive-guards.e2e.ts` and the new `placement-inspector-workflows
.e2e.ts` both needed verbatim.

**Considered and explicitly left separate:**

- **`core-inventory.e2e.ts` + `placement-lifecycle.e2e.ts`.** Both build a
  similarly-shaped fixture and place a device, which looks like duplication
  on the surface — but `core-inventory.e2e.ts`'s `measureStep()` call names
  are validated *by name* in `scripts/run-wdio-performance-benchmark.mjs`'s
  `REQUIRED_CORE_INVENTORY_STEPS`, and the spec is referenced throughout the
  Stage 3B.4 latency-optimization docs and the `representative-latency`
  benchmark as a stable baseline. Renaming or merging it would break that
  cross-cutting, out-of-scope infrastructure for no real gain — the two
  specs also test different behavior (core-inventory: full create-through-
  persist happy path; placement-lifecycle: move + remove semantics
  core-inventory never touches).
- **`entity-updates-work-mode.e2e.ts`.** Reviewed on its own (not paired
  with anything in the original list) — already comprehensive (four entity
  edits + work-mode toggle in one fixture) and tests a distinct concern
  (edits, not deletes/guards). No consolidation candidate identified.
- **`searchable-select-regression.e2e.ts`.** Explicitly out of scope for
  consolidation — a deliberately small, targeted regression, not a
  candidate for folding into a larger workflow spec.
- **`app-smoke.e2e.ts`, `repository-lifecycle.e2e.ts`,
  `safety-recovery.e2e.ts`, `csv-import.e2e.ts`.** Each tests a genuinely
  distinct concern (smoke, repository lifecycle, safety/validation logic,
  CSV import) with its own fixture shape; no meaningful duplicate setup to
  eliminate.

**Specs before:** 12 (`app-smoke`, `core-inventory`, `csv-import`,
`destructive-guards-hierarchy`, `destructive-guards-inventory`,
`entity-deletes-hierarchy`, `entity-deletes-inventory`,
`entity-updates-work-mode`, `placement-lifecycle`, `repository-lifecycle`,
`safety-recovery`, `searchable-select-regression`).
**Specs after:** 11 (the above minus the four hierarchy/inventory pairs,
plus `destructive-guards`, `entity-deletes`) **+ 1 new**
(`placement-inspector-workflows`, Stage 3C below) **= 12.**

---

### Stage 3C — Remaining placement workflows

**Status: COMPLETE**

Branch: `feature/e2e-stage-3c-placement-workflows`
Direct base: `roadmap/e2e-wdio`

**Scope**, verified against `docs/E2E_WDIO_COVERAGE_GAPS.md`'s gap analysis
and the current application source before implementing anything (all four
items confirmed still MISSING and all required selectors confirmed already
present — no new selectors added):

| Requirement | Selectors | Spec | Result |
|---|---|---|---|
| Edit placement height U | `open-edit-modal-btn`, `height-u-input`, `save-btn` | `placement-inspector-workflows.e2e.ts` Part C | `CLEAN_PASS` |
| Remove placement via `EditPlacementModal` | `remove-btn`, confirm label "Remove placement" | `placement-inspector-workflows.e2e.ts` Part D | `CLEAN_PASS` |
| `PlacementInspectorPanel` → target device | `edit-target-device-btn` | `placement-inspector-workflows.e2e.ts` Part F | `CLEAN_PASS` |
| `PlacementInspectorPanel` → target model | `edit-target-model-btn` | `placement-inspector-workflows.e2e.ts` Part H | `CLEAN_PASS` — see production bug below |

**Broader workflow checklist** (derived from the current plan and code, not
only the illustrative list in the stage brief):

| Item | Status |
|---|---|
| Add device to rack | Already covered (`core-inventory`, `placement-lifecycle`, `destructive-guards`, `entity-deletes`, `placement-inspector-workflows`) |
| Move within a rack (start U) | Already covered (`placement-lifecycle` Part 2) |
| Move between racks | **Not applicable** — `EditPlacementModal` and `RackDetailPanel.handleDiagramMovePlacement` both hardcode the current rack; no UI exposes selecting a different target rack. Nothing to test. |
| Remove placement | Already covered (`placement-lifecycle` via inspector) **+ new**: via `EditPlacementModal`'s own remove button |
| U-occupancy / collision validation | Exercised implicitly (every placement in every spec succeeds at a deliberately non-overlapping U); no dedicated negative/collision spec existed before this pass and none was in the plan's MISSING list — treated as out of scope for this pass, not silently dropped |
| Height override behavior | **New** — Part C |
| Device-type change behavior | Not placement-specific (device type is set at creation); no placement workflow depends on it |
| Navigate to target rack | Not applicable — see "move between racks" |
| View/data consistency | Exercised throughout via aggregate + persistence checks in every spec touched this pass |
| Unsaved-changes handling | Already covered (`destructive-guards`'s dirty-state check; `UnsavedChangesDialog` flows throughout) |
| Behavior after reopen | Already covered everywhere via save/close/reopen persistence checks, including the new spec's Part I |

**Existing coverage reused:** device placement (`placeDeviceAtU`, extracted
from `destructive-guards.e2e.ts`'s and the new spec's identical inline
sequences), repository create/save/close/reopen (`createRepositoryThroughUi`,
`expectActiveRepositoryPath`), row lookup (`findRowByExactName`), rack
navigation (`navigateToRackDetail`, `clickLocationRowAndEnterRacks`),
`ConfirmDialog` interaction (`clickConfirmDialogAction`,
`waitForConfirmDialogClosed`), `SearchableSelect` (`selectSearchableOption`).
No duplicate scenarios were added.

**New workflow: rack-object placements.** `edit-target-model-btn` only
applies to `device_model`-kind placements — "rack objects" (a Device Model
with `device_type: "rack_object"`, e.g. a PDU) placed directly from the
palette with no separate Device record. Testing it required creating a
rack-object model and placing it, which no existing spec did. The palette's
place button is keyed by the model's internal id
(`place-btn-model-<id>`), not its human-readable `data-model-code` — matched
in the spec via the button's `aria-label` instead.

**Production bug found and fixed** (`fix(placement)` commit, separate from
the `test(e2e)` Stage 3C commit): `PlacementInspectorPanel.tsx` checked
`placement.target_kind === "rack_object"` to decide whether to render
`edit-target-model-btn`, but `PlacementDto.target_kind` only ever takes two
values — `"device"` or `"device_model"`
(`PlacementTargetKind` in `crates/ris-core/src/placement.rs` has no
`RackObject` variant; rack-object placements get `target_kind:
DeviceModel`). `EditPlacementModal.tsx` already checked the correct value
for its own type label — only `PlacementInspectorPanel.tsx`'s condition was
wrong, so the button could never render for any real placement. Found while
writing this spec (the real app showed the inspector's "No placement
selected" empty state instead of the button); fixed by matching
`"device_model"`, with a four-case regression suite added to
`PlacementInspectorPanel.test.tsx`.

**Timing (external, final HEAD):** `placement-inspector-workflows.e2e.ts`
— `CLEAN_PASS` × 3 runs (across iterations of this pass), 25–26s each, ports
free before/after every run. Comfortably under the ~30-minute
reconsider-the-split guideline.

**Embedded regression — superseded by a provider decision made during this
pass:** a representative embedded run of `placement-inspector-workflows`
was started (per-command overhead made it long-running: still in Part A
after 8 minutes) alongside the already-completed `app-smoke` check
(`CLEAN_PASS`, 65s). Mid-run, the decision was made to fully remove the
embedded provider from the codebase — given that, continuing to spend time
validating it further had no value, so the run was interrupted
(`SIGTERM`, verified clean: no lingering `tauri-driver`/`Xvfb`/binary
processes, ports 4444/4445 free afterward) rather than left to finish. This
is a deliberate scope decision, not a `CLEAN_PASS`/`FAIL` result for that
run — no pass/fail claim is made about
`placement-inspector-workflows.e2e.ts` under embedded. `app-smoke`'s
completed `CLEAN_PASS` remains the last valid embedded data point on this
HEAD. The static provider-agnostic-interaction check below was performed in
its place.

**Embedded provider — removal decided in this pass, executed as a separate
follow-up.** Full removal was deliberately kept out of this PR — unrelated
to Stage 3C's placement-workflow scope and, per this repo's workflow rules,
belonging on its own branch/PR so it stayed independently reviewable and
revertable. It was carried out immediately after as its own technical pass
— see "Embedded WDIO provider removal" below for the full record.

**Static check — no provider-specific workarounds:** the new spec's element
interactions reuse only already-established, provider-agnostic patterns
from this codebase — `selectSearchableOption()` for the model-search
dropdown, `browser.execute(el => el.click(), el)` synthetic clicks for
backdrop-obscured `ConfirmDialog` buttons (the same pattern
`placement-lifecycle.e2e.ts` already uses for its "Remove from rack"
confirmation, needed because a native click's `mousedown` can land on the
dialog's own backdrop first). No `HTMLElement.click()` workaround was used
as a substitute for a real WebDriver click anywhere.

### Embedded WDIO provider removal

**Status: COMPLETE** — not a program stage; Stage 3C remains COMPLETE;
Stage 3D not started.

Branch: `chore/e2e-remove-embedded-provider`
Direct base: `roadmap/e2e-wdio` (PR #157 merged, HEAD `7e8b53e`)

**Reason:** the WDIO provider benchmark above found embedded ~12x slower
than external on `app-smoke` (and ~28x on `core-inventory`) with no
stability advantage, and Stage 3C's own attempted embedded regression run
for `placement-inspector-workflows` was still in its first part after 8
minutes. Carrying an unused, far-slower, no-longer-validated driver path
forward had no benefit — it was fully removed rather than kept as a
nominally-available but effectively-dead option. **external is now the
only supported WDIO driver provider.**

**Embedded implementation removed:**
- Cargo feature `wdio-embedded` and its `tauri-plugin-wdio-webdriver`
  optional dependency (`apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`).
- The feature-gated `tauri_plugin_wdio_webdriver::init()` registration in
  `apps/desktop/src-tauri/src/lib.rs`.
- The `capabilities/embedded-test.json` generation in
  `apps/desktop/src-tauri/build.rs` (and its now-unused `.gitignore` entry).
- `scripts/run-wdio-e2e-embedded.mjs`, `scripts/build-wdio-embedded-binary.mjs`
  and their test files; the `build:e2e:wdio-embedded` and
  `test:e2e:wdio:embedded` `package.json` scripts.
- `RIS_WDIO_DRIVER_PROVIDER` / `RIS_WDIO_EMBEDDED_PORT` env-var plumbing and
  the embedded branch of `apps/desktop/e2e-wdio/wdio.conf.ts`'s driver
  config (`driverProvider` is now a hardcoded `"external"` literal).
  `command-timing.ts`'s `PROVIDER` export and
  `run-wdio-performance-benchmark.mjs`'s `PROVIDER` constant are similarly
  hardcoded to `"external"` — kept as labeled constants (not deleted
  outright) since they are written into every timing report for
  readability, not because a choice still exists.
- `target-embedded/` (Cargo target dir), including a stray 1.4 GB build
  artifact directory found on disk and deleted (was git-ignored, never
  tracked).

**Provider benchmark tooling removed:** `scripts/run-provider-benchmark.mjs`
and its test file (the external-vs-embedded A/B comparison orchestrator —
its one purpose no longer applies with a single provider) and
`docs/E2E_WDIO_PROVIDER_BENCHMARK.md` (folded into this document's
"Technical pass — WDIO provider benchmark" section above, then deleted to
avoid duplication).

**`scripts/run-wdio-performance-benchmark.mjs` — kept, simplified.** Still
the primitive behind the canonical external runner and used directly for
`core-inventory` / `representative-latency` performance diagnostics.
Removed: `--provider`/`--compare` CLI options, `ALLOWED_PROVIDERS`, compare-
mode sequencing (`buildCompareSequence`), the A/B comparison report
(`computeComparison`, `writeCompareModeReport`), and pure helpers that
existed only to support it (`computeDelta`, `medianOf`,
`poolCommandDurationsFromNdjsonText`, `poolStepDurationsByName`,
`validatePort`, `readCargoLockVersion`). `PROVIDER = "external"` is now a
plain constant instead of a CLI-selected value.

**Port contract — intentionally unchanged.** Both `EXTERNAL_DRIVER_PORT`
(4444, tauri-driver) and the second monitored port (4445) are still
checked before/after every external run. Port 4445 was never
embedded-exclusive: on Windows, tauri-driver's own `msedgedriver.exe`
child legitimately lands on it (confirmed in
`docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`'s architecture diagram and raw
per-run port-owner data — `4444→tauri-driver.exe, 4445→msedgedriver.exe`
in every external run recorded there), and it is the same "native browser
driver" role WebKitWebDriver plays on Linux. The constant was renamed
(`EMBEDDED_PORT_DEFAULT` → `EXTERNAL_NATIVE_DRIVER_PORT`) to reflect that,
but the actual port numbers monitored and the cleanup behavior are
unchanged — no external-provider behavior change.

**Dependencies removed:** `tauri-plugin-wdio-webdriver` (Rust/Cargo only —
confirmed via `cargo tree -i tauri-plugin-wdio-webdriver` returning no
match after removal). No npm/pnpm package was embedded-exclusive.

**Dependencies retained (checked, not embedded-related):**
- `pnpm.overrides["brace-expansion"]` / `["minimatch"]` — `pnpm why
  minimatch -r` / `pnpm why brace-expansion -r` trace both to `@wdio/cli`'s
  own dev-tooling chain (`jake`/`ejs`/`create-wdio`, `glob`, `mocha`,
  `archiver-utils`) and to `@wdio/config`/`webdriver`/`webdriverio`/
  `@wdio/tauri-service` themselves — all required by the **external**
  provider's own toolchain, not embedded. Fixes a real
  `brace-expansion` DoS advisory (GHSA-mh99-v99m-4gvg) found during PR
  #155's own audit pass. Left in place.
- `@wdio/tauri-service`, `@wdio/tauri-plugin`, the `wdio-plugin` Cargo
  feature and `tauri-plugin-wdio` dependency — all required by the
  external-provider canonical runner (window-focus tracking, execute API,
  plugin-presence contract); confirmed distinct from the removed
  `wdio-embedded` feature/`tauri-plugin-wdio-webdriver` pair throughout
  this pass, per the audit's explicit instruction not to assume every
  `wdio`-named dependency is embedded-only.

**External provider (unchanged):**
- Canonical build: `pnpm build:e2e:wdio-plugin`
- Canonical test: `pnpm test:e2e:wdio -- --spec <name>`
- Driver: `tauri-driver` (external process)
- Ports: 4444 (tauri-driver) + 4445 (native browser driver child, platform-
  dependent) — both checked free before/after every run
- Cleanup: PID-safe, unchanged (`scripts/run-wdio-performance-benchmark.mjs`)

**Validation (final HEAD):**

```
pnpm install --frozen-lockfile          PASS
pnpm audit                               PASS, 0 vulnerabilities
pnpm -C apps/desktop typecheck           PASS
pnpm -C apps/desktop test                923/923 PASS
node --test scripts/*.test.mjs           223/223 PASS
node scripts/check-repo-hygiene.mjs      PASS
node scripts/check-version-consistency.mjs   PASS
cargo fmt --all --check                  PASS
cargo check --workspace                  PASS
cargo clippy --workspace -- -D warnings  PASS
git diff --check                         PASS

pnpm build:e2e:wdio-plugin                                          PASS
pnpm test:e2e:wdio -- --spec app-smoke --skip-build                 CLEAN_PASS, 5s
pnpm test:e2e:wdio -- --spec placement-inspector-workflows --skip-build   CLEAN_PASS, 26s
pnpm test:e2e:wdio -- --spec destructive-guards --skip-build        CLEAN_PASS, 34s
```

Every external run: ports 4444/4445 free before and after, no lingering
`tauri-driver`/`WebKitWebDriver`/`Xvfb`/application-binary processes. No
embedded test was run (none exists to run). 223 `node --test` cases is
lower than the pre-removal count (353, at the end of Stage 3C) purely
because 3 test files (`run-wdio-e2e-embedded.test.mjs`,
`build-wdio-embedded-binary.test.mjs`, `run-provider-benchmark.test.mjs`)
were deleted along with the code they tested, and
`run-wdio-performance-benchmark.test.mjs`/`run-wdio-e2e.test.mjs` lost the
tests for the removed compare-mode/provider-selection functions — not a
coverage regression on anything that still exists.

**Documentation:**
- This document: Stage 3C's embedded-regression paragraphs updated to
  reflect the removal actually happened (was "removal decided, not yet
  executed"); the provider-benchmark section expanded with the full
  results table (previously only summarized, full detail lived in the
  now-deleted `E2E_WDIO_PROVIDER_BENCHMARK.md`) and marked historical;
  the Node-24/embedded-driver-restoration section marked historical with
  an explicit "these commands no longer exist" note; the stray "Immediate
  next follow-up" bullet under "Future stages" removed (superseded by this
  section).
- `docs/E2E_WDIO_PROVIDER_BENCHMARK.md` — deleted (content folded above).
- `docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`, `docs/E2E_WDIO_LATENCY_OPTIMIZATION.md`
  — left as-is: genuinely historical, dated experiment records describing
  what was true at the time, with no active commands a reader could
  mistakenly try to run today.
- `apps/desktop/e2e-wdio/support/spec-interactions.ts` and
  `apps/desktop/e2e-wdio/specs/searchable-select-regression.e2e.ts` —
  comments explaining the Actions-routed-click technique updated to
  describe the embedded-driver quirk that originally motivated it as
  historical context, not a currently-relevant provider distinction.

**Grep verification (final HEAD):**
- Active embedded references (code/config/scripts, excluding intentional
  historical prose in docs and comments naming what was removed and why):
  none.
- `4445`: present only in the (unchanged, external-provider) port contract
  and in historical docs/data tables — no embedded meaning remains.
- `run-provider-benchmark`: none (file deleted).
- `tauri-plugin-wdio-webdriver`: present only in historical prose (PR #155
  section, this section) explaining what was removed and why — no active
  `Cargo.toml`/`Cargo.lock`/import reference remains.
- Old consolidated spec names (`destructive-guards-hierarchy`/`-inventory`,
  `entity-deletes-hierarchy`/`-inventory`): present only in historical
  prose (Stage 3B.2 delivery record, Stage 3C consolidation record) — no
  active script/command/spec-list reference remains.

## Future stages

Derived from `docs/E2E_WDIO_COVERAGE_GAPS.md`'s analysis, not carried
forward from an older plan — 65/79 workflows COVERED (82%), plus 2
PARTIAL (Push/Pull local error paths only), as of Stage 3F.1B (see
`docs/E2E_WDIO_COVERAGE_GAPS.md`'s Summary counts).
Ordered by proposed sequence; 3E/3F are sketched to show the intended path
but should each get their own NSP when picked up, per the normal E2E
working model.

### Stage 3D — Placement validation & export workflows

**Status: PARTIAL — Placement Validation COMPLETE; Rack Export NOT
IMPLEMENTED (moved to NEEDS APPLICATION CHANGE)**

Branch: `feature/e2e-stage-3d-placement-validation`, direct base
`roadmap/e2e-wdio`.

**Delivered — Placement Validation (Task 1 of the NSP), fully COMPLETE:**
new spec `placement-inspector-workflows.e2e.ts`'s sibling
`placement-validation.e2e.ts`, exclusively negative-path placement
coverage — the first spec in the whole suite to test placement
*rejection* rather than only the accepted path. Covers, each verifying the
correct error surfaces and that the repository ends in the identical state
as before the attempt (no placement created, no diagram change, unchanged
after a save/close/reopen round-trip):
- Occupied U (exact range match) → `collision:` error
- Partial overlap → `collision:` error
- Full overlap / containment → `collision:` error
- Exceeds rack height → `out of rack bounds:` error
- Invalid start U (non-positive integer, e.g. "0") → frontend validation
  error, never reaches the backend
- Invalid height override (non-positive integer) → frontend validation
  error, never reaches the backend

All six cases reuse existing Stage 3C helpers unchanged
(`navigateToRackDetail`, `placeDeviceAtU`, `findRowByExactName`,
`expectDeviceRowState`, `expectExactlyOnePlacement`, `reactSetValue`,
`clickWhenEnabled`, `waitForFormCloseOrError`, `createRepositoryThroughUi`,
`expectActiveRepositoryPath`, `selectSearchableOption`) plus one small
spec-local (not shared) helper for the open/fill/submit/expect-rejection
sequence, since each case's exact field values differ and the pattern
wasn't duplicated in shared code before. No new `data-testid` was added —
the rejection surfaces identically to every existing spec's success path,
via the same `.ft-msg.err` element `waitForFormCloseOrError` already
watches.

External validation: `CLEAN_PASS` × 2 (116s, 117s), ports free before/after
both runs, no lingering `tauri-driver`/`WebKitWebDriver`/`Xvfb`/binary
processes.

**Not implemented — Rack Export SVG/PNG, moved to NEEDS APPLICATION
CHANGE:** analysis (not implementation) confirmed both
`saveRackViewSvgViaDialog`/`saveRackViewPngViaDialog`
(`apps/desktop/src/api/tauriClient.ts`) call `@tauri-apps/plugin-dialog`'s
`save()` unconditionally — a real native OS save dialog, outside the
WebView, which WebDriver cannot interact with at all. Unlike repository
creation/opening (which already has a genuine product feature — a plain
text path input — alongside its native directory-picker button, and which
E2E specs use to bypass the picker entirely) or CSV import (no dialog
involved at all), **export has no non-dialog path in the UI today**. The
only ways to make it testable would be a test-only bypass/hook for the
save destination or restructuring the save flow to support a non-dialog
path — both explicitly forbidden by this stage's NSP ("nie dodawać nowych
hooków tylko dla testów"; "nie implementować obejść"). Per the NSP's own
explicit fallback, no workaround was implemented; this workflow is
reclassified from MISSING to a new **NEEDS APPLICATION CHANGE** status
(added to the Coverage key — see `docs/E2E_WDIO_COVERAGE_GAPS.md`),
distinct from NEEDS SELECTOR since the blocker isn't a missing selector,
it's a missing testable code path. Picking this up would require a
product decision (is a non-dialog export path worth adding for its own
sake, not just for testing?), which is out of scope for an E2E stage.

**Explicitly NOT in scope (respected):** no `data-testid` additions, no
new shared helpers beyond the one spec-local function described above, no
new frameworks/libraries/providers/benchmarks/runners, no workaround for
the export dialog, no further spec consolidation, no CI changes,
embedded-provider work (removed, not returning).

### Stage 3E — Low-risk selector additions

**Status: COMPLETE** (branch `feature/e2e-stage-3e-selectors`, PR pending
— not merged)

Branch: `feature/e2e-stage-3e-selectors`, direct base `roadmap/e2e-wdio`.

**Delivered — 5 new specs, 10 workflows, all indicative Stage 3E scope
items:**
- `unsaved-changes-discard.e2e.ts` — `UnsavedChangesDialog`'s "Continue
  without saving" button
- `recent-repositories-workflow.e2e.ts` — landing-screen recent-repos
  panel (row, path-cell fill behavior, Open button)
- `global-search-workflow.e2e.ts` — search input + result selection +
  navigation
- `csv-device-model-import.e2e.ts` — Device Model CSV preview/import/
  persist/negative-validation (sibling to the existing Device CSV spec)
- `validation-panel-workflows.e2e.ts` — validate, save-from-panel, level
  filter pills, navigate-from-issue

**Every workflow re-verified against actual HEAD before implementing**
(per this stage's own NSP, not trusting the prior gap-analysis document):
confirmed each area still had zero `data-testid` coverage, was not
already covered, and that no new selectors were needed beyond what each
workflow genuinely required to be automatable without text/CSS/xpath
selectors.

**New selectors** (see `docs/E2E_WDIO_COVERAGE_GAPS.md`'s "Selectors added
in Stage 3E" for the full list with exact locations) — all plain
`data-testid` additions, no logic, UX, or visual changes, no refactors.

**One helper policy exception, explained:** `global-search-workflow.e2e.ts`
does **not** reuse the existing `selectSearchableOption()` helper for
clicking a search result, despite `GlobalSearch`'s result `<li
role="option">` using the identical `onMouseDown`-based selection pattern
as `SearchableSelect`'s own options. Confirmed by debugging (not assumed):
WebKitWebDriver's `getText()` does not reliably return that element's full
text — a driver-level quirk of its `text-overflow: ellipsis` styling — so
text-matching via `getText()` silently never matches. A small spec-local
helper (`selectSearchResult()`, not moved to shared support/ — this is the
only place the quirk has been found) matches via raw `textContent` through
`browser.execute()` instead, keeping the same Actions-routed click and
stale-element-tolerant retry loop `selectSearchableOption()` already
established as correct.

**Real application behavior discovered while writing
`validation-panel-workflows.e2e.ts`, not a bug:**
`RepositorySession::validate()` (`crates/ris-application/src/session.rs`)
validates the **last-saved on-disk state** via
`ValidationEngine::validate(&self.repo_path)` — never the current
in-memory/unsaved session state, confirmed via the function's own doc
comment and implementation. The spec exercises this directly (validates
before saving, confirms the unsaved device is invisible, saves from the
panel, validates again, confirms it now appears) rather than working
around it.

**Why this tier first:** closed all 10 low-risk NEEDS SELECTOR workflows —
none of these areas involve deletion, git state, or file-system side
effects, so the selector additions themselves carried little regression
risk to the application.

**Explicitly NOT in scope (respected):** git workflow (Stage 3F, below —
different risk profile); anything network-dependent; rack export (NEEDS
APPLICATION CHANGE, not a selector gap); no new helpers beyond the one
spec-local exception above; no frameworks/libraries/architecture/
benchmarks/CI changes.

**Validation:** `pnpm -C apps/desktop typecheck` PASS; `pnpm -C
apps/desktop test` 923/923 PASS; `node --test scripts/*.test.mjs` 223/223
PASS; hygiene/version-consistency PASS; `cargo fmt/check/clippy` PASS;
`git diff --check` PASS. All 5 new specs `CLEAN_PASS` ×2 (run + `--skip-build`
run) via the canonical external runner, `app-smoke` `CLEAN_PASS`, ports
free before/after every run, no lingering processes. Full suite not
re-run — no shared helper was modified (only new spec-local code and
application-source `data-testid` additions).

Coverage: 51/78 (65%) → **61/78 (78%)**.

### Git Workflow — foundation audit (Stage 3F.0)

**Status: COMPLETE** — audit and documentation only, per this pass's own
NSP; no application code, tests, or selectors changed.

Branch: `feature/git-workflow-audit`, direct base `roadmap/e2e-wdio`.

**Goal:** a from-scratch audit of every git-related capability in the
application (backend, Tauri commands, UI, existing tests), assuming
nothing from prior planning docs, before scoping Stage 3F's
implementation. All findings below are cited to exact source locations.

**Architecture:** `crates/ris-git` has **no `git2`/libgit2 dependency**
(confirmed via its `Cargo.toml`) — every operation shells out to the
**system `git` binary** via `std::process::Command::new("git")`. The
application therefore has a hard runtime dependency on `git` being
installed and on `PATH`; `GitError::GitNotFound` is the dedicated error
for its absence. Every network-touching command (`push`, `pull`, `clone`)
is invoked with `TRANSPORT_SAFETY` flags (`-c protocol.ext.allow=never -c
protocol.fd.allow=never`) as defence-in-depth against `ext::`/`fd::`
transport-helper code execution, on top of `validate_remote_url`'s own
scheme allow-list (HTTPS, explicit/SCP-like SSH only — rejects `file://`,
`ext::`, other `://` schemes, and local filesystem paths outright, even
for testing purposes — see the Clone-SSH finding below).

**Implemented (backend: `crates/ris-git/src/lib.rs`, Tauri commands:
`apps/desktop/src-tauri/src/commands/git.rs`):**
- `is_git_repository` / `init_repository` (`git init`)
- `status` — branch, ahead/behind, clean/dirty, **counts only** for
  staged/unstaged/untracked (no per-file list; no selective staging —
  `commit_all` always runs `git add -A` before committing the whole tree)
- `recent_commits` (`git log`)
- `commit_all`
- `list_remotes`, `add_remote` (URL validated before the remote is ever
  written — see above)
- `push_current_branch_with_env` — auto-adds `-u` on the first push when
  no upstream is configured yet
- `pull_ff_only_with_env` — refuses immediately if the working tree is
  dirty (`GitError::DirtyWorkingTree`, no auto-stash); `--ff-only` only —
  a diverged branch is surfaced to the user as "resolve manually", no
  in-app merge/rebase UI
- `clone` — validates the URL, applies `TRANSPORT_SAFETY`, but (see
  finding below) does **not** go through the askpass path push/pull use
- A substantial SSH askpass subsystem (`apps/desktop/src-tauri/src/ssh_askpass.rs`,
  1233 lines, 24 unit tests): an in-process askpass helper (the binary
  re-execs itself via `SSH_ASKPASS`), a TCP session-based passphrase
  prompt/response bridged to the frontend via `ssh-passphrase-requested`/
  `ssh-passphrase-session-ended` Tauri events (`SshPassphraseModal.tsx`),
  `ssh-agent` probing with remediation guidance, SSH executable/version
  detection, and repo-local-vs-global `core.sshCommand` detection (a
  repo-local value is neutralised during askpass mode — a repo could
  otherwise ship a malicious SSH wrapper that inherits askpass secrets;
  global/user config is left untouched)
- Credential redaction (`redact_git_error`) for HTTPS embedded credentials,
  GitHub token prefixes, and common `key=value` credential patterns before
  any git stderr reaches a log or the UI

**Confirmed NOT implemented anywhere — product-scope boundaries, not
testing gaps (nothing exists to select or test):**
- Branch creation, switching/checkout, or listing (only the *current*
  branch name is ever read)
- Merge (beyond the automatic `--ff-only` pull), rebase, stash, tags
- A standalone fetch (only combined `pull`)
- A staged-files list or any selective-staging UI
- `user.name`/`user.email` configuration — the app never sets or reads
  these; commits rely entirely on the system git's own global config
- HTTPS credential management — no in-app prompt or storage; relies
  entirely on the system git credential helper. Only SSH gets the
  in-app askpass treatment.

**UI (`apps/desktop/src/features/repository/RepositoryPanel.tsx`, git
section) — zero `data-testid` coverage** except one field noted below.
Structured as a "Safe publish" stepper (Save → Validate → Commit → Pull →
Push, one inline action per step) plus a separate "Remote" panel (remote
list, add-remote form, and **a second, independent Pull/Push button pair**
next to a remote-selector dropdown). **Both button pairs call the exact
same `handlePush`/`handlePush` handlers** — a real selector-design
consideration for whoever implements Stage 3F.1: an unscoped
`data-testid="git-push-btn"` would match two elements simultaneously;
testids must be scoped to their containing `Panel` or the UI
deliberately deduplicated first (deduplicating is a product decision, out
of scope for an E2E stage). `SshPassphraseModal.tsx` already has
`ssh-passphrase-input` on its text field; its Submit/Cancel buttons do
not.

**Clone — two distinct findings:**
1. `CloneRepositoryForm.tsx` already has **full selector coverage** (11
   testids: `clone-form`, `clone-url`, `clone-parent`, `clone-browse`,
   `clone-dirname`, `clone-submit`, `clone-preview`, plus 4 error-message
   testids). Clone-over-HTTPS was DEFERRED for being network-dependent —
   that reason still holds, but it is not a selector gap.
2. `clone_repository_cmd` (`apps/desktop/src-tauri/src/commands/repository.rs`)
   calls the plain `ris_git::clone()`, **not** the askpass-hardened path
   `push`/`pull` use. A clone from an SSH remote whose key requires a
   passphrase has no in-app prompt at all — this is a genuine product
   limitation, found by this audit, not previously documented anywhere.
   Not fixed in this pass (audit-only scope); flagged here for a product
   decision before Stage 3F.2 attempts SSH clone coverage.

**Tests — unit coverage is already substantial; the real gap is E2E
only.** 82 Rust unit tests in `ris-git` (URL validation, redaction,
push/pull arg construction, SSH-URL detection, branch-line parsing), 24 in
`ssh_askpass.rs`; `git.rs`'s Tauri command wrappers have no direct tests
(thin, delegate to the above) but the frontend has ~1,857 lines across 8
test files (`RepositoryPanel.test.tsx`, `gitStatusHelpers.test.ts`,
`publishHelpers.test.ts`, `SshPassphraseModal.test.tsx`,
`CloneRepositoryForm.test.tsx`, `CreateRepositoryWizard.test.tsx`,
`recentRepositories.test.ts`, `wizardHelpers.test.ts`). **E2E coverage of
actual git operations is zero**: `safety-recovery.e2e.ts` only tests URL
*rejection* (never a real clone) and unrelated open-path recovery; no
spec anywhere calls `git init`, commits, pushes, pulls, or exercises the
SSH passphrase flow end to end.

**Why a "remote" fixture is harder than it looks:** `validate_remote_url`
rejects local filesystem paths outright (by design — defence against
`file://`/path-based transport abuse), so a fully offline E2E fixture
(e.g. a local bare repo added as a remote) is not possible through the
app's own UI. A genuine push/pull/clone round-trip test needs either a
local SSH daemon reachable at `ssh://`/SCP-like syntax, or a real
disposable external target — neither is free infrastructure, which is
why this is scoped as its own stage (3F.2) rather than folded into local
workflow coverage.

### Stage 3F.0.5 — Local Git E2E Test Foundation

**Status: COMPLETE.** Infrastructure-only, on
`feature/e2e-stage-3f-local-git-foundation` → `roadmap/e2e-wdio`.

**Purpose:** prepare the shared, safe, deterministic testing foundation
Stage 3F.1's actual local Git workflow specs will build on. This stage adds
**no Git workflow test** (no init/commit/validate/add-remote/push/pull spec)
and **no new `data-testid`** — it only prepares helpers, verifies the
existing isolation architecture actually reaches the processes that need
it, and documents both.

**Re-validated existing infrastructure (not re-built):** the isolated
temp-environment mechanism in `support/test-environment.ts` — created by
Stage 3B.x work — already satisfies this stage's isolation requirement in
full:
- `RIS_E2E_RUN_ROOT` / `RIS_E2E_REPOSITORY_PARENT` — the sentinel-validated,
  `tmpdir()`-scoped owned run root and its `repositories/` subdirectory,
  both already used by every existing spec that opens or creates a
  repository through the app's UI (`createRepositoryThroughUi`).
- `HOME` — set to `<runRoot>/home`, isolating anything that reads
  `~/.config`, `~/.gitconfig`, etc.
- `GIT_CONFIG_GLOBAL` — set to a file under `<runRoot>/git/config`
  containing only a minimal isolated identity (`Rack Inventory Studio
  E2E` / `e2e@localhost.invalid`); never the developer's real global
  config.
- `GIT_CONFIG_NOSYSTEM=1` — the system-wide `/etc/gitconfig` is never
  consulted.
- `XDG_CONFIG_HOME` (plus `XDG_DATA_HOME`/`XDG_CACHE_HOME`) — set to
  `<runRoot>/app-config` etc., isolating WebKit/Tauri app data.

These are set directly on `process.env` at WDIO launcher module-load time
(`initTestEnvironment()`, called at the top of `wdio.conf.ts`), before WDIO
spawns any worker or `@wdio/tauri-service` starts `tauri-driver`.

**Env-inheritance chain verified, not assumed:** the NSP for this stage
explicitly required proving the isolated environment reaches the Tauri
app process, not just the Node test process. Traced through
`@wdio/tauri-service`'s own dist bundle
(`node_modules/@wdio/tauri-service`):
`DriverPool.startTauriDriverForWorker` spawns `tauri-driver` with
`env: env ?? { ...process.env, ... }` — i.e. it spreads the **calling**
process's `process.env` (already isolated by `initTestEnvironment()`) into
`tauri-driver`'s environment. `tauri-driver` (a plain Rust
`std::process::Command` spawn, external crate — not this repo's code)
inherits its own environment into the launched Tauri application process
by default, with no evidence anywhere in the reachable code of an
`env_clear()`/`env_remove()` call that would strip it. The chain is
therefore: **WDIO worker process → tauri-driver → Tauri app**, fully
inheriting `HOME`/`GIT_CONFIG_GLOBAL`/`GIT_CONFIG_NOSYSTEM`/
`XDG_CONFIG_HOME` at every hop. A dedicated unit test
(`test-environment.test.ts`, "sets Git/XDG/HOME isolation vars on
process.env for downstream child-process inheritance") asserts exactly
the values this spread operator captures — the minimal test consistent
with the existing architecture per the NSP's own instruction (a full
Tauri-process-env-reading integration test was explicitly out of scope,
since it would require a production code change to expose process env
back to the test).

No new environment variables were added — the existing set already covers
every isolation requirement this stage specified.

**New: `support/local-git.ts`** — the actual new infrastructure this stage
adds, all outside the app (no production code touched):
- `runGit(cwd, args, options?)` — controlled `git` execution via
  `child_process.execFile` (array args, never `shell: true`), inherits the
  isolated `process.env`, redacts credential-shaped substrings from
  `stderr`, has a 15s default timeout, and rejects with a `GitCommandError`
  (carrying `args`/`cwd`/`exitCode`/`stdout`/`stderr`) on any non-zero
  exit, spawn failure, or timeout.
- `createLocalGitRepository(options?)` — builds a Git repository fixture
  under `RIS_E2E_REPOSITORY_PARENT` (or an explicit `parent`): unique
  directory, optional `git init` + **local-only** `user.name`/`user.email`
  (never `--global`), a minimal loader-valid RackInventoryStudio fixture
  (`inventory/repo.yaml` + `inventory/locations.yaml`, mirroring the schema
  `crates/ris-application/src/create.rs`'s `create_repository` writes —
  confirmed against `ris-repository`'s loader that only these two files are
  required, `racks/`/`device-models/`/`devices/`/`placements/` are all
  optional for a valid load), an optional initial commit, and an optional
  uncommitted working-tree change. Returns `{ path, repoCode, initialized,
  initialCommitSha, cleanup }`.
- Inspection helpers, scoped to exactly what Stage 3F.1's planned specs
  need and nothing beyond: `isGitRepository`, `getCurrentBranch`,
  `getHeadCommit`, `getCommitCount`, `getWorkingTreeStatus`,
  `getRemoteUrl`, `readGitConfig`. Deliberately not implemented: any
  merge/rebase/stash/tag/fetch/SSH/credential inspection — none of these
  are testable product surface yet (per the Stage 3F.0 audit) and adding
  them now would be speculative.

**Cleanup safety — reused, not duplicated:** `createLocalGitRepository`'s
`cleanup()` calls `assertPathIsCleanupSafe`, which re-uses
`test-environment.ts`'s own exported `isStrictChildPath` against
`RIS_E2E_RUN_ROOT` — the same ownership boundary the rest of the suite's
global `onComplete` cleanup already enforces — rather than introducing a
second, parallel safety mechanism. `cleanup()` refuses (throws, does not
delete) if `RIS_E2E_RUN_ROOT` is unset or the target path is not a strict
descendant of it; it is idempotent (a second call after the directory is
already gone is a no-op); per-fixture cleanup is available for specs that
want to free disk mid-run, and the existing whole-run `onComplete` cleanup
in `wdio.conf.ts` remains the backstop that guarantees no leftover
directory survives a completed WDIO run even if a spec never calls
`cleanup()` itself.

**Infrastructure tests added (Node/Vitest, no WDIO session):**
`support/local-git.test.ts` (14 tests) covers: repository creation with
and without `git init`, an initial commit (`getCommitCount`/
`getHeadCommit`/clean status), local `user.name`/`user.email` isolation
proven against a *simulated real global identity* (a fake
`GIT_CONFIG_GLOBAL` file is set mid-test and confirmed **not** to leak
into the fixture's commit author), clean-vs-dirty working-tree status,
adding and reading a remote URL with no network call, `runGit`'s literal
(non-shell) argument passing (a commit message containing `; \`` and `$()`
shell metacharacters round-trips verbatim with no side-effect files
created), diagnostic-error reporting for an invalid git subcommand, and
cleanup's refusal to delete a path outside the isolated run root.
Combined with the new `test-environment.test.ts` case above: 15 new tests,
0 new WDIO specs.

**Explicitly not done, per the NSP's scope boundary:** no
init/commit/validate/add-remote/push/pull WDIO spec; no remote-Git, SSH,
container, or `ssh-agent` infrastructure (Stage 3F.1.5 / 3F.2); no new
`data-testid`; no application code changed; the known SSH-clone-askpass
gap identified in Stage 3F.0 was not touched.

**Limitation acknowledged:** the env-inheritance verification stops at
`process.env`-spreading evidence from `@wdio/tauri-service`'s own source
plus a unit test on our own launcher code — it does not read environment
variables back out of a *running* Tauri app process, since doing so would
require a production code change (e.g. a debug-only command) explicitly
ruled out by this stage's NSP. If a future stage needs stronger proof, the
smallest addition would be a temporary, clearly-marked debug assertion
removed before merge — not a permanent product surface.

### Stage 3F.1A — Local Git detection & init

**Status: COMPLETE.** On `feature/e2e-stage-3f1a-local-git` →
`roadmap/e2e-wdio`.

**Scope delivered:** the first real Git *workflow* E2E coverage in the
program (3F.0/3F.0.5 were audit and infrastructure only) — Git detection
of a non-tracked directory, the "Initialize Git repository" action,
status refresh after init, detection persisting across a close/reopen
cycle, and idempotent detection for a repository that already has Git
(no re-init affordance is ever shown). One new spec:
`git-detection-init.e2e.ts`, two `it()`s.

**Pre-audit finding, before implementation:** `create_repository_cmd`
(the UI "Create repository" wizard's backend) always runs
`ris_git::init_repository` itself — confirmed by reading
`apps/desktop/src-tauri/src/commands/repository.rs` and by
`repository-lifecycle.e2e.ts`'s own post-create `.git` assertion. So a
repository with genuinely no `.git` can only be presented to the app via
"Open by path" against a fixture built outside the wizard — exactly what
`createLocalGitRepository({ initialized: false })` (Stage 3F.0.5) is for.
`open_repository_cmd` (same file) was confirmed to never run git init as
a side effect.

**New selectors (3, detection/init only):** `git-not-initialized` (wraps
the "not tracked by Git" state's content), `git-init-btn` (the
"Initialize Git repository" button), `git-branch-value` (the branch `<dd>`
in the Git sidebar — present only once `gitStatus.is_repository` is true,
so its appearance is itself the "status refreshed" signal). The existing
`aria-label="Refresh Git status"` button was left as-is and not used —
the app's own automatic refresh after init/reopen made an explicit manual
refresh unnecessary for this stage's assertions. No selector was added for
validate/commit/add-remote/push/pull, per this stage's explicit scope
boundary — see the "Confirmed not implemented" list below for what
Stage 3F.1B still needs.

**Helper bug found and fixed (Stage 3F.0.5's own code, not application
code):** `getCurrentBranch()` used `git rev-parse --abbrev-ref HEAD`,
which fails (exit 128, "ambiguous argument 'HEAD'") on an **unborn HEAD**
— a freshly `git init`'d repository with no commit yet. This is exactly
the state Stage 3F.1A's own init spec needs to inspect (the app itself
shows a real branch name immediately after init, before any commit,
because it reads `git status --porcelain=v1 --branch`'s "No commits yet
on `<branch>`" line — see `parse_branch_line` in `crates/ris-git/src/
lib.rs`). Fixed to use `git symbolic-ref --short HEAD`, which resolves
correctly both before and after the first commit. A regression test
(`getCurrentBranch resolves on an unborn HEAD`) was added to
`local-git.test.ts`. This is the one necessary modification to an
existing Stage 3F.0.5 helper — every other helper was used as-is.

**Fixtures used exclusively via the Stage 3F.0.5 helper**, per this
stage's own instruction: both `it()`s call `createLocalGitRepository()`
directly (`initialized: false` for the detection/init case, `initialized:
true` for the idempotency case) — no new repository-creation helper was
added, and no raw git command was run directly in the spec where a
3F.0.5 helper already covered the need (`isGitRepository`,
`getCurrentBranch` are used to cross-check the UI against the actual
on-disk state).

**Confirmed unchanged since the Stage 3F.0 audit** (re-verified before
implementing, per this stage's own audit-first instruction): `git log`
shows zero commits touching `apps/desktop/src/features/repository/`,
`apps/desktop/src-tauri/src/commands/{git,repository}.rs`, or
`crates/ris-git/` between the Stage 3F.0 audit commit and this stage's
branch point — the UI and backend are exactly as the audit described.

### Stage 3F.1B — Local git workflows: validate, commit, add-remote, push/pull error paths

**Status: COMPLETE.** On `feature/e2e-stage-3f1b-local-git-workflows` →
`roadmap/e2e-wdio`.

**Pre-implementation audit, per this stage's own NSP:** confirmed HEAD was
exactly the merged Stage 3F.1A commit (no drift — `git log` showed zero
commits between them), confirmed no git-related `data-testid` had been
added since Stage 3F.1A (still exactly the 3 from that stage), and
confirmed `RepositoryPanel.tsx`/the Git backend were unchanged from the
Stage 3F.0 audit's description.

**Scope delivered:** one new spec, `git-local-workflows.e2e.ts`, 3
`it()`s:
- **Validate + Commit** (one flow): runs Validate from the "Safe publish"
  stepper — a distinct UI path from `ValidationPanel`'s own
  already-covered Validate button, same backend call
  (`validateCurrentRepository`) — confirms it unblocks Commit, enters a
  message, commits, and cross-checks the result via `local-git.ts`
  helpers: working tree becomes clean, HEAD changes, commit count
  increments.
- **Add remote**: adds a fake HTTPS URL
  (`https://example.invalid/repository.git`, RFC 2606 reserved, never
  resolves) through the UI, confirms the success banner, cross-checks
  `.git/config` via `getRemoteUrl()`. The remote is never contacted.
- **Push/Pull local error paths**: adds the same fake remote, triggers
  Push then Pull from the "Safe publish" stepper's buttons, confirms both
  surface an error, and confirms via helpers that repository state
  (HEAD, commit count, branch) is unchanged and the app remains
  responsive (the ordinary close flow still works afterward).

**Selector-design decision, resolving the prerequisite flagged since
Stage 3F.0's audit:** the two simultaneous Push/Pull button pairs
(stepper vs. Remote panel, both calling the exact same
`handlePush`/`handlePull`) are disambiguated by selectorizing **only the
stepper's pair** — `git-stepper-push-btn` / `git-stepper-pull-btn`. The
Remote panel's identical pair is deliberately left unselectorized, so no
selector in the codebase matches more than one element. Push/Pull error
text (`git-push-error` / `git-pull-error`) is only ever rendered in the
stepper, so this also keeps the error-observation point co-located with
the button that was clicked.

**11 new `data-testid`s total:** `git-validate-btn`,
`git-commit-message-input`, `git-commit-btn`, `git-remote-name-input`,
`git-remote-url-input`, `git-remote-add-btn`, `git-remote-add-success`,
`git-stepper-push-btn`, `git-stepper-pull-btn`, `git-push-error`,
`git-pull-error`. No selector added for the Remote panel's Push/Pull
pair, and none for anything out of this stage's scope (clone, SSH,
branch/merge/rebase/stash/tags — none of which exist in the product, per
the Stage 3F.0 audit).

**Bug found and fixed in Stage 3F.0.5's own fixture-builder helper (not
application code):** `createLocalGitRepository`'s `writeMinimalRisFixture`
wrote only `repo.yaml` + `locations.yaml`, reasoning (correctly, at the
time) that the *loader* (`ris-repository`) tolerates missing
`racks/`/`device-models/`/`devices/`/`placements/` directories entirely.
This stage's own Validate spec was the first to actually click Validate
against such a fixture — and found `VAL-REPO-004`
(`crates/ris-validation/src/validators/repository.rs`) is a separate,
ERROR-level *validator* check requiring each of those four paths to
exist, independent of what the loader needs. A fixture missing all four
failed validation with 4 errors, permanently blocking the Commit step
(this is a real product behavior, correctly enforced — not a bug in the
application). Fixed `writeMinimalRisFixture` to also create the four
directories empty, matching what the app's own "Create repository"
wizard produces. A regression test was added to `local-git.test.ts`.
Stage 3F.1A's own spec was unaffected (it never triggers Validate).

**Why Push/Pull are PARTIAL, not COVERED:** per this stage's explicit
scope boundary, only the *local error path* was implemented — a
successful push/pull round-trip against a real reachable remote needs
network/SSH infrastructure that is Stage 3F.2's concern. The Coverage
Gaps doc reflects this precisely (`PARTIAL`, not `COVERED`) rather than
overclaiming.

**Explicitly NOT in scope, respected:** any successful push, pull, or
clone round-trip; the SSH passphrase modal; branch/merge/rebase/stash/
tags/fetch/staged-files/user-identity/HTTPS-credentials — none of these
exist in the application; no application/backend change beyond the
Stage 3F.0.5 test-helper fix described above.

### Stage 3F.2 — Remote git over SSH (COMPLETE, 2026-07-27)

**Scope delivered:** a genuine push round-trip, a genuine fast-forward pull
round-trip, upstream-tracking configuration, and the SSH key-based
authentication flow — all against a real SSH-reachable remote, run
deterministically in CI/dev environments with no network dependency. Clone
and the SSH-passphrase modal were explicitly excluded per this stage's own
NSP (see "Explicitly out of scope" below).

#### Architecture investigation

Read before any code was written, confirming the Stage 3F.0 audit's
findings still held (no drift since):

- **`push_current_branch_with_env` / `pull_ff_only_with_env`**
  (`crates/ris-git/src/lib.rs`) — both take `extra_env: &[(&str, &str)]`
  and a `GitSecurityMode`. `GitSecurityMode::Askpass` applies fail-closed
  hardening (a fresh `core.hooksPath` temp dir, and `core.sshCommand`
  override *only* when the repo has a repo-local value) but explicitly
  **never** strips `GIT_SSH`/`GIT_SSH_COMMAND` — both are user-controlled
  and preserved (see `ASKPASS_ENV_REMOVALS`'s doc comment). This is the
  load-bearing fact the chosen fixture strategy depends on: a
  `GIT_SSH_COMMAND` set before the app launches survives untouched through
  the askpass path.
- **`clone_repository_cmd`** (`apps/desktop/src-tauri/src/commands/repository.rs`)
  calls the plain `ris_git::clone()`, not the askpass-hardened path —
  confirmed still true, still a genuine product gap for a
  passphrase-protected key, still not fixed here (out of scope — see
  below).
- **`validate_remote_url`** (`crates/ris-git/src/lib.rs`) still rejects
  local filesystem paths and `file://` by design (transport-helper-injection
  hardening), and still accepts SCP-like SSH syntax
  (`user@host:path`, no port field) — confirmed by
  `add_remote_accepts_scp_like_ssh` in `crates/ris-git/tests/git_remote_tests.rs`,
  which is exactly the URL shape this stage's fixture uses.

**Remote strategy comparison:**

| Option | Determinism | CI compatibility | Startup complexity | Maintenance | Runtime | Security |
|--------|-------------|-------------------|---------------------|-------------|---------|----------|
| **A. Local bare repo + local `sshd`** (chosen) | High — same machine, no network, no external service dependency | High — `sshd`/`ssh-keygen`/`ssh` are already-present OpenSSH client/server tooling on the Linux dev/CI image (`webkit2gtk-driver`/`xvfb` are already prerequisites here); no new package needed | Low — one `spawn()`, one ephemeral keypair, a ~15-line `sshd_config`; prototyped and confirmed working standalone before any TS was written | Low — self-contained in `support/git-remote.ts`, no external service version to track | Fast — sub-second `sshd` startup, push/pull round-trips complete in well under a second locally | Good — 127.0.0.1-only, ephemeral per-run keys, `PasswordAuthentication no`, no privilege drop needed (same-user login), everything torn down per suite |
| B. Temporary containerized git server (e.g. a `gitea`/`sshd` Docker image) | High once running | Lower — requires a container runtime available in every environment that runs this suite (not guaranteed on a developer's machine, adds a Docker dependency this program has not needed anywhere else) | Higher — image pull/build, container lifecycle, port mapping | Higher — an image to keep updated, a second moving part alongside the Tauri app + WebKitWebDriver + tauri-driver stack | Slower — container start/stop overhead per suite run | Comparable, but a larger attack surface (a full container) for no additional test value over option A |
| C. Another already-available deterministic mechanism in the project | N/A | N/A | N/A | N/A | N/A | N/A — **none found**. The project has no existing git-server fixture, mock SSH server, or CI service container anywhere in the repo; `crates/ris-git/tests/git_remote_tests.rs` uses local bare repos over `file://`, which `validate_remote_url` deliberately rejects for the real app path (that test suite bypasses validation via a `add_remote_for_test` helper specifically for this reason) — it cannot stand in for a real SSH transport test. |

**Chosen: Option A**, justified by the comparison above — it needed no new
runtime dependency (OpenSSH client + server tooling was already present),
matched this program's existing "no Docker anywhere else" posture, and was
prototyped end-to-end (see below) before any production TypeScript was
written, derisking the approach early.

**Prototype validation (performed before writing `support/git-remote.ts`):**
a throwaway shell script generated an ephemeral ed25519 keypair (no
passphrase) and host key, started `sshd -f <config> -D -e` unprivileged on
a fixed port with `AuthorizedKeysFile`/`PubkeyAuthentication yes`/
`PasswordAuthentication no`/`UsePAM no`/`StrictModes no`, and confirmed
both a bare `ssh` connection and a full `git push` over that connection
succeeded — before committing to the design.

**Dynamic-connection-info problem and its solution:** `GIT_SSH_COMMAND`
must be a static value at Tauri app *launch* time (the app inherits
`process.env` once, at spawn — see `wdio.conf.ts`'s module-load-time
`initTestEnvironment()` call), but the `sshd` fixture's port and identity
file are only known once `startRemote()` runs inside a spec's `before()`
hook, which is necessarily *after* the app is already running (WDIO specs
cannot hook earlier). Resolved by pointing the static `GIT_SSH_COMMAND` at
a static wrapper script (`support/ssh-wrapper.sh`) that re-reads the actual
port/identity from a small env file
(`$RIS_E2E_RUN_ROOT/git/ssh-remote-command.env`) at every *invocation*
time instead of at app-launch time — `configureSsh()` writes that file.
This registration is unconditional in `wdio.conf.ts` and a complete no-op
for every other spec (`ssh` is only ever invoked by git talking to an SSH
remote, which no other spec does).

#### Files changed

- `apps/desktop/e2e-wdio/support/ssh-wrapper.sh` (new) — the static
  `GIT_SSH_COMMAND` target described above.
- `apps/desktop/e2e-wdio/support/git-remote.ts` (new) — fixture
  infrastructure: `findSshd()`, `startRemote()` (generates ephemeral
  host/client ed25519 keys, starts unprivileged `sshd` on a random
  127.0.0.1 port, waits for readiness), `configureSsh()` (writes the
  wrapper's config file), `createBareRemote()`, `buildSshRemoteUrl()`,
  remote-inspection helpers (`getRemoteHeadCommit`, `getRemoteCommitCount`),
  `pushSimulatedRemoteCommit()` (simulates a
  teammate's commit landing on the remote via a local-filesystem clone —
  test-side only, never through the app), and `cleanup()`.
- `apps/desktop/e2e-wdio/support/git-remote.test.ts` (new) — Vitest unit
  tests exercising the fixture standalone with plain `git` (no WDIO
  session), including a full push/pull round trip through the actual
  `ssh-wrapper.sh` script. Skips (not fails) when `sshd` is unavailable,
  mirroring `crates/ris-git/tests`' `if !git_available() { return; }`
  pattern.
- `apps/desktop/e2e-wdio/wdio.conf.ts` — registers the static
  `GIT_SSH_COMMAND` pointing at `ssh-wrapper.sh`, immediately after
  `initTestEnvironment()`.
- `apps/desktop/e2e-wdio/specs/git-remote-workflows.e2e.ts` (new) — the
  three scenarios below.
- `apps/desktop/src/features/repository/RepositoryPanel.tsx` — one new
  testid, `git-upstream-value`, on the pre-existing "Upstream" `<dd>`
  (previously unselectorized) — needed to prove Scenario 3's
  redetection-after-reopen at the UI level, not just via `.git/config`.
- `docs/E2E_WDIO_PLAN.md`, `docs/E2E_WDIO_COVERAGE_GAPS.md` — this section
  and the coverage-gap table updates.

#### Test scenarios implemented (`git-remote-workflows.e2e.ts`)

1. **Push** — create a fixture repo with an initial commit, add the
   local-sshd remote through the UI, click the stepper's Push button.
   Verified via helpers (not the UI success message, which has no
   `data-testid`): remote HEAD matches local HEAD, remote commit count is
   1, `branch.<name>.remote`/`.merge` are configured in `.git/config`; also
   cross-checked at the UI level (`git-branch-value`, new
   `git-upstream-value` shows `origin/<branch>`).
2. **Pull (fast-forward)** — after an initial push to establish tracking,
   `pushSimulatedRemoteCommit()` simulates a teammate's commit landing on
   the remote (a local-filesystem clone/commit/push, never through the
   app or SSH — legitimate since the fixture and test runner share a
   machine, whereas the *app under test* always goes through the real SSH
   transport). Clicks the stepper's Pull button; verified via helpers that
   local HEAD fast-forwards to the simulated commit, the working tree is
   clean, and the commit count increments.
3. **Close/reopen persistence** — push to establish upstream, close the
   repository, reopen it by path, and verify both at the UI level
   (`git-branch-value`, `git-upstream-value`) and via helpers
   (`.git/config`, `git remote -v`) that upstream tracking and the remote
   are still correctly detected.

All three authenticate over the fixture's real SSH transport (the app's
own `GitSecurityMode::Askpass` path — `is_ssh_url` classifies the SCP-like
remote URL as SSH, so the askpass session starts; it is inert here since
the fixture's key has no passphrase), which is this stage's "SSH
authentication flow" objective.

#### Validation results (2026-07-27)

- `git diff --check` — clean.
- `node scripts/check-repo-hygiene.mjs` — 8/8 passed.
- `node scripts/check-version-consistency.mjs` — versions and toolchain
  consistent.
- `pnpm -C apps/desktop typecheck` — clean (this command's `tsconfig.json`
  scopes to `src` only — it does not cover `e2e-wdio/`, consistent with
  every prior 3F stage; `support/git-remote.ts` and the new spec were
  additionally sanity-checked with a standalone `tsc --noEmit` pass using
  the project's actual compiler options, with zero errors).
- `pnpm -C apps/desktop test` — 58 files / 945 tests passed, including the
  5 new `git-remote.test.ts` tests.
- `cargo test --workspace` — all passed, 0 failures (no Rust source
  changed this stage).
- `node scripts/run-wdio-e2e.mjs --spec git-remote-workflows` — CLEAN PASS,
  all 3 scenarios passed; repeated with `--repeat 2` for the isolated ×2
  run this program's `feature/e2e-*` policy requires — both runs CLEAN
  PASS.
- Regression: `node scripts/run-wdio-e2e.mjs --spec git-detection-init` and
  `--spec git-local-workflows` — both still CLEAN PASS (no regression from
  the `wdio.conf.ts` or `RepositoryPanel.tsx` changes).

#### Coverage changes

See `docs/E2E_WDIO_COVERAGE_GAPS.md`'s Git workflow table and Summary
counts — **Push to remote** and **Pull from remote** moved PARTIAL →
COVERED; two new rows (**Upstream tracking persistence**, **SSH
authentication**) added and COVERED. 69/81 workflows COVERED (85%), up
from 65/79 (82%) at the Stage 3F.1B snapshot.

#### Explicitly out of scope (per this stage's own NSP, respected)

Clone, merge conflicts, rebase, stash, tags, multiple remotes, HTTPS
credentials, branch creation/switching, detached HEAD, force push, and the
SSH passphrase-prompt workflow (the fixture's key intentionally has no
passphrase). See `docs/E2E_WDIO_COVERAGE_GAPS.md` for exactly which of
these remain open gaps versus confirmed non-features of the application.

#### Remaining Git workflow gaps

- **SSH passphrase prompt** — still NEEDS SELECTOR (`SshPassphraseModal.tsx`
  Submit/Cancel have no testid). Blocked on a product decision for how a
  future stage wants to exercise it, and on the pre-existing
  `clone_repository_cmd` askpass gap if that future stage chooses a
  passphrase-protected key.
- **Clone over a real remote** — successful clone COVERED by Stage 3F.3
  (below), using this stage's fixture with a passphrase-less key. A
  passphrase-protected clone still needs the product-side askpass fix
  noted above.
- **`--ff-only` diverged pull ("resolve manually")** — not yet scoped by
  any stage.

### Stage 3F.3 — Git clone over SSH (COMPLETE, 2026-07-28)

**Scope delivered:** successful clone only, over the same real SSH
transport as Stage 3F.2 — a repository containing only the RIS scaffold
(no inventory data), a repository with multiple commits, and clone state
(detection, branch, upstream, remote configuration) surviving close and
reopen. Built directly on Stage 3F.2's infrastructure with no redesign,
per this stage's own NSP.

#### Audit findings (pre-implementation)

Read before any code was written:

- **`clone_repository_cmd`** (`apps/desktop/src-tauri/src/commands/repository.rs`)
  — unchanged since the Stage 3F.0/3F.2 audits. A plain, synchronous
  command: validates `destination` is empty/absent, calls the plain
  `ris_git::clone()` (no askpass wiring — the same pre-existing gap noted
  in Stage 3F.2, still irrelevant here since this stage's key has no
  passphrase), opens the cloned directory via the same `open_repository`
  path `open_repository_cmd`/`create_repository_cmd` use, and returns the
  same `OpenRepositoryResultDto` create/open both return.
- **`ris_git::clone()`** (`crates/ris-git/src/lib.rs`) — unchanged.
  Validates the URL via `validate_remote_url` (the same SCP-like
  acceptance already proven for push/pull), then runs `git clone` via
  `run_git_global`, a plain `Command::new("git")` with no explicit env
  manipulation — it inherits the app process's ambient environment,
  including the `GIT_SSH_COMMAND` `wdio.conf.ts` registers. No fixture
  change was needed to reach clone.
- **`CloneRepositoryForm.tsx`** already exposes every selector this stage
  needed — `clone-form`, `clone-url`, `clone-parent`, `clone-browse`,
  `clone-dirname`, `clone-preview`, `clone-submit`, plus `clone-url-error`/
  `clone-parent-error`/`clone-dirname-error`/`clone-error`. Confirmed by
  reading the component; **zero new selectors added this stage.** The form
  renders directly on the landing screen (no separate navigation step).
- **Clone success** (`App.tsx`'s `handleCloneSuccess`) transitions the app
  exactly like open/create success, confirmed by reading it alongside
  `handleOpenSuccess`/`handleCreateSuccess` — `repository-active-root`/
  `repository-active-path` appear the same way the existing
  `openRepositoryByPath` helper already relies on.
- **`git clone` itself already configures `origin` + upstream tracking**
  for the checked-out branch as a side effect — confirmed with a
  standalone `git clone` against a local bare repo before writing the
  spec. Unlike Stage 3F.2's push/pull scenarios (which started from an
  empty remote and had to push once to establish tracking), no extra step
  is needed here.
- **`support/git-remote.ts` and `support/ssh-wrapper.sh`** — confirmed via
  `git status`/`git log` unchanged since their Stage 3F.2 commit; reused
  without modification.

No assumptions from Stage 3F.2 had changed; nothing needed correcting
before implementation.

#### Infrastructure reuse

Reused unmodified from Stage 3F.2: `findSshd`, `startRemote`,
`configureSsh`, `createBareRemote`, `buildSshRemoteUrl`,
`getRemoteHeadCommit`, `getRemoteCommitCount`, `pushSimulatedRemoteCommit`,
`cleanup` (`support/git-remote.ts`), `createLocalGitRepository`,
`getCurrentBranch`, `getHeadCommit`, `getCommitCount`,
`getWorkingTreeStatus`, `getRemoteUrl`, `readGitConfig`
(`support/local-git.ts`), `reactSetValue`, `clickWhenEnabled`,
`expectActiveRepositoryPath` (`support/repository-ui.ts`), and the
`GIT_SSH_COMMAND` → `ssh-wrapper.sh` registration in `wdio.conf.ts`.

One addition, to the existing `git-remote.ts` module rather than a new
parallel one: `seedBareRemoteFromLocalRepo()` — pushes a local fixture
repo's branch directly into an otherwise-empty bare remote by filesystem
path (test-side, no SSH, same rationale as `pushSimulatedRemoteCommit`).
Needed because this stage's remotes must already contain content *before*
the app clones them — Stage 3F.2's scenarios always started from an empty
remote and populated it *through* the app instead, so no existing helper
covered this. Prototyped standalone (a raw `git push <bare-path>
branch:branch`) before adding it to the module.

`sshd` is a required prerequisite for this spec too, for the same reason
as Stage 3F.2's RP: `before()` throws rather than skips when it cannot be
found — this spec's entire purpose is SSH clone coverage, so a quiet skip
would let a run report green while cloning nothing.

#### Files changed

- `apps/desktop/e2e-wdio/support/git-remote.ts` — one addition,
  `seedBareRemoteFromLocalRepo()` (see above). Everything else unchanged.
- `apps/desktop/e2e-wdio/support/git-remote.test.ts` — one new unit test
  for `seedBareRemoteFromLocalRepo()`.
- `apps/desktop/e2e-wdio/specs/git-clone-workflows.e2e.ts` (new) — the
  three NSP scenarios.
- `docs/E2E_WDIO_PLAN.md`, `docs/E2E_WDIO_COVERAGE_GAPS.md` — this section
  and the coverage-gap table updates.

No application code changed this stage — `CloneRepositoryForm.tsx`
already had every selector needed.

#### "Empty repository" — this stage's interpretation of the NSP wording

The NSP asked for "clone an empty repository". Interpreted as *no
inventory data* — the minimal valid RIS scaffold (repo.yaml,
locations.yaml with `locations: []`, four empty
racks/device-models/devices/placements directories) committed once, not a
Git repository with zero commits. A genuinely empty bare repo (no refs at
all) cannot satisfy the NSP's own Scenario 1 requirement that "the
repository opens correctly": `open_repository` requires
`inventory/repo.yaml` to exist and fails hard without it (confirmed by
reading `crates/ris-repository/src/loader.rs` before implementation), so
a zero-commit clone would always end in an "invalid RIS repository" error,
never a successful open. Documented explicitly so Scenario 1's coverage is
not overstated as "clones a zero-commit repository", which it does not.

#### Test scenarios implemented (`git-clone-workflows.e2e.ts`)

1. **Scaffold-only clone** — seed a bare remote (via
   `seedBareRemoteFromLocalRepo`) with a single commit containing only the
   RIS scaffold (no locations/racks/devices), clone it through the UI.
   Verified: no `clone-error`, branch and upstream displayed correctly
   (`git-branch-value`/`git-upstream-value`), and via helpers — commit
   count 1, clean working tree, local HEAD matches remote HEAD, upstream
   tracking (`branch.<name>.remote`/`.merge`) and `origin`'s URL correct.
2. **Multi-commit clone** — seed the same way, then add a second commit
   with `pushSimulatedRemoteCommit` (remote commit count 2). Clone through
   the UI; verified HEAD matches the second commit, commit count 2, clean
   working tree, the second commit's file present, and repository
   metadata/remote configuration correct.
3. **Close/reopen persistence** — clone a scaffold-only repository, close
   it, reopen it by path. Verified both at the UI level
   (`git-branch-value`, `git-upstream-value`) and via helpers
   (`.git/config`, `git remote -v`) that detection, branch, upstream, and
   remote configuration all survive the round trip.

All three authenticate over the fixture's real SSH transport, same as
Stage 3F.2.

#### Validation results (2026-07-28)

- `git diff --check` — clean.
- `node scripts/check-repo-hygiene.mjs` — 8/8 passed.
- `node scripts/check-version-consistency.mjs` — versions and toolchain
  consistent.
- `pnpm -C apps/desktop typecheck` — clean.
- `pnpm -C apps/desktop test` — 58 files / 946 tests passed (includes the
  1 new `seedBareRemoteFromLocalRepo` unit test).
- `node scripts/run-wdio-e2e.mjs --spec git-clone-workflows` — CLEAN PASS,
  all 3 scenarios; repeated with `--repeat 2` — both runs CLEAN PASS.
- `node scripts/run-wdio-e2e.mjs --spec git-remote-workflows` — still
  CLEAN PASS (Stage 3F.2 regression check).
- Regression: `git-local-workflows` and `git-detection-init` — both still
  CLEAN PASS.

#### Coverage changes

See `docs/E2E_WDIO_COVERAGE_GAPS.md` — clone (SSH, successful) moves from
DEFERRED to COVERED; two new COVERED rows added (multi-commit clone,
clone-state persistence). HTTPS clone and passphrase-protected SSH clone
remain DEFERRED (network-dependent / product askpass gap respectively —
unchanged from Stage 3F.2).

#### Explicitly out of scope (per this stage's own NSP, respected)

SSH passphrase workflow, HTTPS clone, authentication failures, merge
conflicts, branch switching, fetch, pull, push, tags, submodules, multiple
remotes, shallow clone, detached HEAD, clone cancellation, clone progress,
clone retries.

#### Remaining Git workflow gaps

- **SSH passphrase prompt** — still NEEDS SELECTOR, unchanged from Stage
  3F.2.
- **Passphrase-protected SSH clone** — still blocked on the
  `clone_repository_cmd` askpass gap (a product fix, not a testing gap).
- **HTTPS clone** — still DEFERRED, network-dependent, no local mock.
- **`--ff-only` diverged pull** — COVERED by Stage 3F.4 (below).

### Stage 3F.4 — Diverged pull over SSH ("--ff-only" failure and recovery) (COMPLETE, 2026-07-28)

**Scope delivered:** one focused scenario proving `git pull --ff-only` —
the only pull mode the application ever runs — safely rejects a
genuinely diverged history, with every piece of repository state (both
commits, working tree, branch, upstream, remote URL) surviving the
failure and a subsequent close/reopen cycle. The application does not
implement merge, rebase, or conflict resolution, and this stage does not
add any — it proves the existing rejection behaviour is safe.

#### Audit findings (pre-implementation)

- **File location.** Considered extending `git-remote-workflows.e2e.ts`
  instead of a new file. Rejected: every prior Stage 3F sub-stage —
  3F.1A, 3F.1B, 3F.2, 3F.3 — got its own dedicated spec file, including
  Stage 3F.3 (clone), which is thematically at least as close to 3F.2's
  push/pull as this stage's diverged-pull scenario is, and still got its
  own file. One-file-per-stage is this program's established convention;
  a new file (`git-diverged-pull.e2e.ts`, the NSP's own suggested name)
  follows it.
- **Pull path re-read in full**, confirmed unchanged since the Stage
  3F.2 audit: `handlePull` (`RepositoryPanel.tsx`) clears
  push/pull status, calls `pullGitFfOnly`, and on failure sets
  `pullError` **without** bumping `refreshKey` — a failed pull does not
  trigger a fresh Git-status fetch, so `git-branch-value`/
  `git-upstream-value` display whatever was last fetched *before* the
  attempt (safe to assert here anyway, since neither branch nor upstream
  ever actually changes in this scenario). `pull_git_ff_only`
  (`commands/git.rs`) only special-cases SSH *authentication* failures
  (`classify_git_ssh_error`) — a non-fast-forward failure isn't one, so
  the raw git stderr (redacted) is what reaches `git-pull-error`; no
  product-level "diverged" wording exists anywhere in this path. Hence
  this stage asserts on the stable `git-pull-error` *selector*, never on
  git's own message text. `pull_ff_only_with_env`
  (`crates/ris-git/src/lib.rs`) runs exactly
  `git pull --ff-only <remote> <branch>`, confirmed unchanged.
- **Pull button stays clickable after failure** — because
  `getPullDisabledReason` only blocks on the *cached*, pre-attempt
  `ahead`/`behind`, which (per the point above) never updates within this
  scenario to reflect the divergence. Not asserted directly as a
  deliberate behaviour — the NSP's checklist doesn't require it, and this
  stage does not want to overstate incidental cache-staleness as an
  intentional "retry" design.
- **Close/reopen works with no restart**, confirmed by reading
  `handleCloneSuccess`/the close handler — reopening remounts with a
  fresh `repoPath`, which *does* trigger a new `get_git_status` fetch.
  This is where a genuinely fresh, non-stale ahead/behind read happens.

#### Prototype validation (before writing the spec)

Reproduced the full scenario standalone with plain `git` first: local
commit B (child of A) never pushed; a scratch clone/commit/push against
the bare remote produces commit C (also a child of A, independent of B);
a bare `git fetch <bare-path> <branch>` with **no destination refspec**
brings C's object into the local repo's object database without
touching `refs/remotes/origin/<branch>` (confirmed unchanged
before/after); `git merge-base --is-ancestor` both directions exits 1;
`git pull --ff-only` then exits 128 with "fatal: Not possible to
fast-forward, aborting.", HEAD stays at B, and (per `git status
--branch`) the *real* fetch inside `pull` does update
`refs/remotes/origin/<branch>` to C as a side effect — `[ahead 1, behind
1]`.

#### Exact commit graph constructed

```
      A
     / \
    B   C
```

- `A` — initial commit, created by `createLocalGitRepository`, pushed to
  the remote through the application to establish upstream tracking.
- `B` — local-only commit, child of `A`, created test-side (see
  "Helpers reused" below), never pushed. Local HEAD.
- `C` — remote-only commit, child of `A`, created via
  `pushSimulatedRemoteCommit` against the bare remote (a clone/commit/
  push that starts from the remote's own state, which is `A` at that
  point — independent of `B` by construction, since `B` is never pushed
  anywhere). Remote HEAD.

Divergence confirmed via `isAncestor(B, C)` and `isAncestor(C, B)` both
`false`, verified through Git itself (`git merge-base --is-ancestor`),
not inferred from the pull's error text.

#### Helpers reused (no new fixture/remote infrastructure)

`findSshd`, `startRemote`, `configureSsh`, `createBareRemote`,
`buildSshRemoteUrl`, `pushSimulatedRemoteCommit`, `getRemoteHeadCommit`,
`getRemoteCommitCount`, `cleanup` (`support/git-remote.ts`, Stage 3F.2,
unmodified); `createLocalGitRepository`, `getCurrentBranch`,
`getHeadCommit`, `getCommitCount`, `getWorkingTreeStatus`,
`getRemoteUrl`, `readGitConfig`, `runGit` (`support/local-git.ts`);
`reactSetValue`, `clickWhenEnabled`, `expectActiveRepositoryPath`
(`support/repository-ui.ts`).

#### Helper added

One addition, to the existing `support/local-git.ts` module (audited
first — no ancestry/merge-base helper existed anywhere before this
stage): `isAncestor(path, ancestorSha, descendantSha)`, a thin wrapper
around `git merge-base --is-ancestor` (exit 0 → true, exit 1 → false,
anything else propagates). Justified directly by the NSP's own
instruction to verify divergence through Git helpers rather than error
text. Covered by a new unit test in `local-git.test.ts` (linear-history
true case; forked/diverged-history false case, both directions).

Local commit "B" is created test-side — a plain `runGit` add+commit on
the already-open fixture's directory, writing a file outside
`inventory/` so the RIS loader ignores it, the same pattern
`pushSimulatedRemoteCommit` already uses for "C" — rather than through
the application's Validate+Commit UI flow. Justification, per the NSP's
own requirement to document this choice: Stage 3F.1B already covers
Validate+Commit through the UI in full; repeating it here would be
duplicative for no new Git-workflow value, and would additionally
require manufacturing a *new* in-app data change first (this fixture is
clean after its initial push, unlike 3F.1B's pre-dirtied fixture) —
touching an unrelated entity-creation UI just to produce a commit, which
broadens this spec's dependencies and fragility for a scenario whose
actual subject is the pull failure, not commit creation.

#### Selectors added

None. Reused: `git-stepper-pull-btn`, `git-pull-error`,
`git-branch-value`, `git-upstream-value`, `git-stepper-push-btn`,
`git-remote-name-input`, `git-remote-url-input`, `git-remote-add-btn`,
`git-remote-add-success`, `repository-close-action`,
`repository-open-path-input`, `repository-open-path-submit`,
`repository-active-root`, `repository-active-path`,
`repository-landing-title`.

#### Test scenario and assertions (`git-diverged-pull.e2e.ts`)

One test: create fixture with commit A, open it, add the SSH remote, push
through the app (establishes upstream), create local commit B and remote
commit C as above, confirm genuine divergence via `isAncestor` in both
directions, click Pull, and verify:

- `git-pull-error` renders (30s timeout);
- local HEAD is still B, remote HEAD is still C (helpers);
- local commit count is still 2 (A, B), remote commit count is still 2
  (A, C) — proves no merge commit was created;
- working tree is clean, and `.git/MERGE_HEAD` does not exist — proves no
  merge was even attempted;
- branch is unchanged, `branch.<name>.remote`/`.merge` still configured,
  `origin`'s URL unchanged (helpers);
- `git-branch-value`/`git-upstream-value` still display correctly (UI).

Then closes the repository, reopens it by path, and re-verifies local
HEAD, displayed branch/upstream, upstream config, and remote URL — proving
the application remains usable after the failure with no restart needed.

#### Validation results (2026-07-28)

- `git diff --check` — clean.
- `node scripts/check-repo-hygiene.mjs` — 8/8 passed.
- `node scripts/check-version-consistency.mjs` — versions and toolchain
  consistent.
- `pnpm -C apps/desktop typecheck` — clean.
- `pnpm -C apps/desktop test` — 58 files / 947 tests passed (includes the
  1 new `isAncestor` unit test).
- `node scripts/run-wdio-e2e.mjs --spec git-diverged-pull` — CLEAN PASS;
  repeated with `--repeat 2` — both runs CLEAN PASS.
- `node scripts/run-wdio-e2e.mjs --spec git-remote-workflows` — still
  CLEAN PASS (Stage 3F.2 regression).
- `node scripts/run-wdio-e2e.mjs --spec git-clone-workflows` — still
  CLEAN PASS (Stage 3F.3 regression).
- `node scripts/run-wdio-e2e.mjs --spec git-local-workflows` and
  `--spec git-detection-init` — both still CLEAN PASS.
- No Rust files changed this stage — `cargo test` not re-run, per the
  NSP's own instruction to run Rust checks only if Rust files changed.

#### Coverage changes

See `docs/E2E_WDIO_COVERAGE_GAPS.md` — the `--ff-only` diverged-pull gap
moves DEFERRED → COVERED. Coverage counts recalculated programmatically
from the document's own status tags (not estimated).

#### Explicitly out of scope (per this stage's own NSP, respected)

Automatic merge, merge conflict resolution, rebase, reset, force pull,
discard-local-changes actions, branch switching/creation, stash,
fetch-only workflow, multiple remotes, HTTPS, SSH passphrase prompt,
clone, tags, submodules, detached HEAD, force push, and any change to the
application's Git strategy — `--ff-only` behaves exactly as it did
before this stage.

#### Remaining Git workflow gaps

- **SSH passphrase prompt** — still NEEDS SELECTOR, unchanged.
- **Passphrase-protected SSH clone** — still blocked on the
  `clone_repository_cmd` askpass gap (a product fix, not a testing gap).
- **HTTPS clone** — still DEFERRED, network-dependent, no local mock.
- No further directly-testable gap remains in the push/pull/clone/diverge
  surface as scoped by the Stage 3F.0 audit; any future Git-workflow stage
  would need its own NSP to scope new ground (e.g. the SSH passphrase
  prompt itself, or a workflow not yet in the application at all).

### Stage 3F.5 — Windows remote-shell compatibility (audit complete, 2026-08-04; implementation pending)

**Why reopened.** Stage 3F.2–3F.4 were marked functionally complete without
ever having run against a real, authenticating Windows SSH connection — the
fixture's identity-path env-file serialization was broken
(`configureSsh()` wrote an unquoted Windows path into a file loaded via
bash `source`, corrupting every backslash) until a same-day RP fixed it
(`shQuote()`, `support/git-remote.ts`). Fixing that let a real connection
authenticate for the first time and immediately exposed a second, deeper,
unrelated defect: `git push`/`pull` now reach the remote, but fail with
`fatal: ''<path>'' does not appear to be a git repository`. `v0.1.0-beta.3`
is being superseded by `v0.1.0-beta.4` specifically so this can be fixed
properly on `development` instead of forced through the release branch —
see `docs/BETA3_ROADMAP.md` and `docs/releases/v0.1.0-beta.3.md` for the
release-level decision record.

#### Root cause

Git constructs its SSH exec payload unconditionally as
`<git-command> '<path>'` — POSIX single-quoted — regardless of remote OS;
this is Git's own behavior, not something this fixture or the application
controls. The receiving shell must be POSIX-quote-aware for the path to
survive. Win32-OpenSSH Server, absent a `DefaultShell` registry override
(confirmed unset on the dev machine used for this audit: `reg query
HKLM\SOFTWARE\OpenSSH` shows no such value), executes incoming exec
commands via `%ComSpec% /c "<command>"` — `cmd.exe`. `cmd.exe` has no
single-quote quoting construct; the quote characters reach
`git-receive-pack.exe`'s argv literally, corrupting the path. This was
invisible through Stage 3F.2–3F.4 because the identity bug always failed
the connection before authentication completed, long before the remote
shell ever got a command to misinterpret.

#### Full execution-path audit

Traced end-to-end, `wdio.conf.ts` → `git-remote.ts` → `ssh-wrapper.sh` →
`sshd` → remote git:

1. `wdio.conf.ts` sets `GIT_SSH_COMMAND` once, before app launch, to
   `bash "<abs path>/ssh-wrapper.sh"` — this `bash` is the *local* client
   invoker (resolved from PATH at app-launch time), unrelated to the
   remote-shell defect below.
2. `startRemote()` resolves `sshd` (`findSshd`/`findSshdWindows`/
   `findSshdPosix`), generates ephemeral host+client ed25519 keys, secures
   them (`chmod` POSIX / `icacls` Windows via `securePrivateKeyFile`),
   writes `sshd_config` (`buildSshdConfig`), and spawns `sshd` as a direct
   `child_process.spawn` child — **this is a private, unprivileged,
   127.0.0.1-only sshd instance, never the OS's system service** — a fact
   the recommended repair below depends on.
3. `configureSsh()` writes port + identity path into
   `ssh-remote-command.env`, now shell-quoted (`shQuote()`, same-day RP).
4. `git push`/`pull` → `ssh` (via the wrapper) → connects to the fixture's
   `sshd` → authenticates (works, as of the same-day RP) → sends
   `git-upload-pack`/`git-receive-pack '<path>'` as the SSH exec payload.
5. **Defect boundary**: `sshd` hands that string to `cmd.exe` (no
   `DefaultShell` override), which passes the quote characters through
   literally instead of stripping them.

**Every shell boundary in the chain**, audited individually:
`writeFileSync` calls (no shell, safe) → local `bash source` of the env
file (fixed this session, `shQuote()`) → local `ssh` argv construction in
`ssh-wrapper.sh` (already double-quoted, safe) → Git's own POSIX-quoted
remote-command construction (fixed, not under this fixture's control) →
**server-side shell interpretation of that string (the actual gap)**.

**Windows-specific assumptions already handled correctly** (audited, no
changes needed): `findSshdWindows()`'s three-tier candidate search;
`securePrivateKeyFile()`'s ACL (`icacls`) branch instead of `chmod`;
`buildSshdConfig()`'s conditional omission of `UsePAM` (unsupported on
Win32 OpenSSH). **Not yet handled anywhere**: remote command-shell
selection (this stage's subject), and Git Bash discovery (no
`findGitBash()`-equivalent exists yet — needed by the recommended repair).

**POSIX assumption** (implicit, not a deliberate mechanism): the fixture
"just works" on Linux/macOS only because sshd's OS-native default
(`/bin/sh`/`$SHELL`) already parses `'...'` correctly — nothing in this
codebase asserts that; it's inherited OS behavior, which is exactly why
the Windows gap stayed invisible until now.

**PATH / environment propagation**: the fixture's own `sshd` process
inherits the full test-runner environment (plain `child_process.spawn`,
no `env` override) — confirmed fine. **Open risk, not yet resolved
empirically**: Win32-OpenSSH is documented to build a fresh environment
for each incoming logon/exec session (via a Windows logon token) rather
than inheriting sshd's own process environment, so `PATH` inside a remote
exec session is not guaranteed to match what the test runner and sshd's
parent process see. Mitigation, required by Repair 1 below: any shell or
binary invoked as part of the fix must be referenced by an absolute,
discovered path — never a bare command name relying on session PATH.

**Temporary repo/config lifecycle and cleanup**: audited, no gap found.
`createBareRemote()`, `configureSsh()`/`clearSshConfig()`, and `cleanup()`
(SIGTERM → 3s grace → SIGKILL, retrying removal up to 10× — already
Windows-aware, per its own inline reasoning about lingering file handles)
are all unaffected by the remote-shell defect and need no changes for this
repair.

#### Alternatives evaluated

| Option | Verdict | Why |
|---|---|---|
| `DefaultShell` registry override (`HKLM:\SOFTWARE\OpenSSH\DefaultShell`) | Rejected | Confirmed via Win32-OpenSSH's own wiki: `HKLM`-only, admin-required, machine-wide — affects every SSH session on the host, not just this fixture. Wrong layer for an ephemeral, unprivileged, per-test-run process; this fixture's whole design principle (see `securePrivateKeyFile`'s own doc comment) is zero elevated privilege. |
| **`ForceCommand` in the fixture's own generated `sshd_config`, pointed at Git Bash** | **Recommended** | Because `startRemote()` spawns its **own** private `sshd` from its **own** generated config (never the system service), a `ForceCommand` directive there is scoped to exactly this one ephemeral instance — no registry writes, no elevated privilege, zero effect on the host's real SSH setup. `ForceCommand` is confirmed to apply to non-PTY sessions, exactly what `git push`/`pull` use. |
| Wrapper executable (compiled/scripted shim as the effective remote command) | Rejected as first choice | Solves the same problem `ForceCommand` already solves declaratively, at the cost of a new build artifact. Kept as a documented fallback if empirical testing shows `ForceCommand`'s own string can't reliably reach bash. |
| Native `cmd.exe` adaptation (make Git emit cmd-style quoting) | Rejected | Git's SSH exec-command quoting isn't configurable per-remote from a client application; would mean patching Git itself, disproportionate to a test-fixture problem, and would make the fixture stop exercising the application's real, unmodified code path. |
| Skip Windows SSH coverage, ship beta.3 as-is | Rejected | Superseded by the same-day strategic decision to ship `v0.1.0-beta.4` Windows-complete instead. |

#### Recommended repair staging

**Repair 1 — Windows remote shell compatibility (first, blocking).**
- Add `findGitBash()`: absolute-path candidate search (well-known
  `Program Files\Git\bin\bash.exe` / `Git\usr\bin\bash.exe` locations,
  `where.exe bash`, MSYS `which bash` fallback normalized via the existing
  `convertMsysPathToNative`) — same three-tier pattern as
  `findSshdWindows()`.
- Empirically determine (small standalone experiment against a throwaway
  fixture instance, *before* committing to syntax) whether Win32-OpenSSH
  parses the `ForceCommand` string itself via `cmd.exe` (→
  `%SSH_ORIGINAL_COMMAND%`) or bypasses shell resolution entirely (→
  `$SSH_ORIGINAL_COMMAND`) — official docs don't specify this and it must
  not be assumed.
- Add the resulting `win32`-conditional `ForceCommand` line to
  `buildSshdConfig()`, targeting `findGitBash()`'s absolute path.
- Extend the existing real round-trip test in `git-remote.test.ts` (today
  gated on `sshdAvailable`, currently the test that surfaced this defect)
  to assert success end-to-end on Windows once this lands.
- Re-run `git-remote-workflows`, `git-clone-workflows`, `git-diverged-pull`
  — the first real Windows pass these specs will have had.

**Repair 2 — Windows logon-session environment audit (follow-up).**
- Empirically confirm `git-upload-pack`/`git-receive-pack` resolve
  correctly once invoked inside the `ForceCommand`'d bash session, under
  the Windows logon-session environment (not the sshd parent process's
  inherited one). If they don't resolve, extend `ForceCommand` to prepend
  an explicit, discovered `PATH` before invoking bash.

**Repair 3 — Full Windows WDIO Gate restart (after 1 and 2 land).**
- `app-smoke`, the three SSH-dependent representative specs, the full
  22-spec matrix, and stability repeats — the release-gate sequence this
  work was originally blocked on, run for real for the first time.

### Stage 3F.5.4 — Containerized Git-over-SSH E2E fixture (proof of concept, 2026-08-04)

**Why this stage exists.** Stage 3F.5.1 landed Repair 1 above (Windows
remote shell compatibility). Stage 3F.5.2 then found `git-clone-workflows`
hangs intermittently; Stage 3F.5.3/3F.5.3b traced this to the Win32-OpenSSH
→ `ForceCommand` → `cmd.exe` → Git-Bash chain itself, not to the
application. Further investigation there would only improve test
infrastructure, not `RackInventoryStudio`. This stage stops investing in
Win32-OpenSSH-Server-as-Git-remote and validates a replacement: a
deterministic Linux container (OpenSSH + git) managed through Docker Engine
inside WSL2, reached from the still-fully-native Windows application over a
published `127.0.0.1` port. Docker Desktop is explicitly not required or
used.

**What stays native, what moves into the container.** Unchanged: the
application itself, Git for Windows' `git.exe`/`ssh.exe`, askpass, remote
URL handling, and every WDIO/UI interaction — only the SSH *server* moves
off Windows. `RackInventoryStudio.exe` → `git.exe` → `ssh.exe` →
`127.0.0.1:<published-port>` → Docker Engine (WSL2) → container → OpenSSH →
`git-upload-pack`/`git-receive-pack`.

#### Environment audit (Phase 1)

Confirmed on the validation host: Windows 11 Pro (build 26200), WSL2 with an
Ubuntu distribution (default, `wsl --status` reports "WSL 2"), systemd
enabled, Docker Engine 29.4.3 Community running inside WSL2 (not Docker
Desktop), current user already in the `docker` group (no elevated
privilege needed), and an unprivileged `hello-world` container ran
successfully. One environment-specific finding, handled generically rather
than assumed away: `wsl.exe`'s own meta-commands (`--status`,
`--list --verbose`) emit UTF-16LE whenever their stdout is piped (i.e.
always, from `child_process`) — naively decoding as UTF-8 renders every
character separated by a stray space. `container-git-remote.ts`'s
`decodeWslMetaOutput` handles this; output from a program run *inside* a
distro (`wsl -d <distro> -- <cmd>`) is unaffected (that program's own native
UTF-8), so this only applies to the two WSL meta-commands themselves.

#### Localhost forwarding proof (Phase 2)

A temporary `nginx:alpine` container published to a random host port bound
to `127.0.0.1` (`docker run -d --rm -p 127.0.0.1::80 nginx:alpine`) was
reached reliably from a native Windows process (`curl.exe`, 5/5 stable
requests), and the port stopped responding immediately after the container
was removed. No WSL-IP fallback was needed — direct `127.0.0.1` forwarding
is reliable on this host.

#### Critical finding: WSL2 VM idle-shutdown

Empirically confirmed, independent of any agent/tooling latency (reproduced
inside a single, uninterrupted script): a WSL2 distribution's lightweight
utility VM — along with every container running inside it — can be torn
down after as little as **~10–30 seconds** with no `wsl.exe` client process
attached, even while a container has an open, actively-used TCP connection.
A plain `sleep 30` between the last `wsl.exe` invocation and the next one
was enough to lose a container entirely (`docker ps -a` afterward showed no
trace of it at all, not even an `Exited` entry — the whole VM was
recreated). A real WDIO spec's UI waits routinely exceed that window
(`waitForDisplayed` timeouts of 10–30s are the norm throughout this suite),
so this is not a hypothetical risk.

**Mitigation, validated empirically, requiring no global WSL configuration
change:** holding one extra `wsl.exe -d <distro> -- sleep 86400` child
process open for the fixture's entire lifetime keeps the distribution
"attached" and prevents the teardown (confirmed: container survived 45s
idle with the session held open, vs. dying within ~10-30s without it).
`startContainerRemote()` starts this keep-alive session before anything
else; `cleanupContainerRemote()` kills it. This is the single most
important design element this stage's proof of concept produced — without
it, the whole architecture would be unreliable on a default WSL2 install.

#### Fixture architecture

`apps/desktop/e2e-wdio/fixtures/git-ssh-server/` — `Dockerfile`,
`entrypoint.sh`, `sshd_config`. Base image: `alpine:3.20.3` (pinned to an
exact point release, not a floating tag), chosen for footprint (~7 MB vs.
~75 MB for a Debian-slim base) and because `openssh-server`/`git` install
from Alpine's main repository with no extra configuration. Two
Alpine/OpenSSH-specific defects surfaced and fixed during validation, both
documented in the fixture's own comments:

- Alpine's OpenSSH build has no PAM support compiled in at all — unlike
  glibc distros, it doesn't even accept `UsePAM no` as a no-op; it logs
  "Unsupported option UsePAM" **on every single connection**, including
  the healthcheck's own probes, which at a 1s interval was frequent enough
  to destabilize `sshd` (observed: a container crashed ~78s after start
  under exactly this load). Fixed by omitting the directive entirely on
  this platform — the same platform-conditional pattern the native
  fixture's `buildSshdConfig` already uses for the identical Win32-OpenSSH
  case, just on the opposite platform.
- `adduser -S` (BusyBox/Alpine) leaves a locked (`!`) shadow password
  field; OpenSSH refuses login for **any** auth method — including
  pubkey, the only method this fixture uses — against a locked account,
  independent of `PasswordAuthentication`/`PubkeyAuthentication` settings
  (confirmed: "User git not allowed because account is locked"). Fixed
  with `passwd -u git` at image-build time, which clears only the lock
  bit; `PasswordAuthentication no` still applies, so this does not enable
  password login.

#### Security model

- Dedicated unprivileged `git` user; **login shell is `git-shell`**, not
  `/bin/sh` — confirmed empirically ("fatal: Interactive git shell is not
  enabled") that an authenticated interactive session is rejected outright,
  while `git-upload-pack`/`git-receive-pack` (what `git push`/`pull`/`clone`
  actually send) still work.
- Pubkey-only auth (`PasswordAuthentication no`, `KbdInteractiveAuthentication
  no`, `PermitRootLogin no`); `AllowUsers git`; TCP/X11/agent forwarding and
  tunneling all disabled in `sshd_config`.
- No `--privileged`, no added Linux capabilities (default Docker capability
  set only — an earlier `--cap-drop ALL` attempt broke the entrypoint,
  since root needs `CAP_DAC_OVERRIDE`/`CAP_CHOWN` for its own file-ownership
  setup; "avoid unnecessary capabilities" is satisfied by never adding any,
  not by dropping the defaults a container needs to function).
- Fresh ed25519 host keys generated at **container** startup (not baked
  into the image — a disposable container with no persistent volume can
  afford this, and it avoids every container from a given image sharing
  host-key material).
- Published SSH port is always `127.0.0.1`-bound, always random
  (`-p 127.0.0.1::22` — Docker's own "random host port" syntax), never a
  fixed port.
- No host filesystem mounts into the container, no Docker-socket mount, no
  persistent volumes — fully disposable.

#### Runtime helper (`apps/desktop/e2e-wdio/support/container-git-remote.ts`)

A new, self-contained module (not a refactor of `support/git-remote.ts` —
per this stage's own design constraint, it must not silently share
Windows-sshd-specific implementation detail, since none of that applies to
a plain-Linux-OpenSSH container). Responsibilities: WSL2 distribution
discovery and selection (`RIS_E2E_WSL_DISTRO` override, or enumerate + filter
to WSL2 + probe each for a working Docker Engine, first-match-wins,
deterministic); image build/reuse with an explicit forced-rebuild escape
hatch (`RIS_E2E_CONTAINER_REBUILD=1`); container lifecycle (unique
label-scoped naming, health-checked readiness, diagnostics collection on
failure); ephemeral ed25519 key generation and installation (public key
piped over `docker exec -i ... tee`'s stdin, never a command-line
argument); bare-repository administration via `docker exec` (as root — the
application's own Git traffic never uses this path, only SSH); and
idempotent, verified cleanup. Every Docker invocation is an argument array
through `wsl.exe -d <distro> -- docker ...`, never a concatenated shell
string; the few places a shell genuinely runs *inside* the container (a
handful of chained repository-administration commands) centrally quote
every interpolated value through the native fixture's already-tested
`shQuote()`.

Deliberately **not** using `--rm` on the container: a crashed/unhealthy
container's logs are the primary failure diagnostic, and `--rm` would
destroy them the instant the container exits. Cleanup removes the
container explicitly, after any diagnostics have already been collected.

**Windows path → WSL path**: the one Windows-specific assumption in this
whole design, isolated to a single pure function
(`windowsPathToWslMountPath`) used only to locate the Docker build context
— relies on WSL2's default automount convention (`C:\foo` →
`/mnt/c/foo`), with a clear, actionable error (not a silent failure) if a
host has that disabled or remapped. The Dockerfile/entrypoint/sshd_config
themselves make no Windows-only assumption at all — they're the same image
Linux CI could reuse unmodified.

#### Repository lifecycle

`createContainerBareRemote`, `getContainerRemoteHeadCommit`,
`getContainerRemoteCommitCount`, `pushSimulatedContainerRemoteCommit` — all
via `docker exec`, mirroring `support/git-remote.ts`'s equivalent
filesystem-path-based helpers. **Defect found and fixed during validation**:
`docker exec` runs as root by default, but every bare repository is owned
by the unprivileged `git` user — modern git's "detected dubious ownership"
safety check (protecting against a different-owner repository being a sign
of tampering) rejected root operating on a `git`-owned repo, confirmed
empirically (`fatal: detected dubious ownership in repository at
'/home/git/repos/...'`) via a standalone reproduction script *before* this
was ever attempted through the real application. This affected only the
container's own administrative/inspection helpers — the actual SSH push
from the Windows application, which authenticates and operates as the
repository's real owner (`git`), never hit this check at all and succeeded
on the very first attempt. Fixed with `git config --system --add
safe.directory '*'` in `entrypoint.sh`, safe in this disposable,
single-purpose container where the only two identities are root (already
has full filesystem access regardless) and the `git-shell`-restricted `git`
user reached over SSH.

#### Unit tests

`apps/desktop/e2e-wdio/support/container-git-remote.test.ts` — 67 tests,
all pure/dependency-injected (no real WSL/Docker access, `selectDistribution`
takes its Docker-availability check as an injected function exactly like
`securePrivateKeyFile`/`buildSshdConfig` already do in the native fixture).
Covers: safe-identifier validation and rejection, run-id/container-name/
image-tag generation, fixture content-hash computation, Windows→WSL path
conversion, `wsl.exe` UTF-16LE meta-output decoding, `wsl --list --verbose`
parsing (including WSL1 filtering and the default-distro marker), Docker
error classification, distribution selection (override handling, WSL1
rejection, Docker-unavailable fallback chaining, precise error diagnostics),
environment-variable overrides (`RIS_E2E_GIT_REMOTE_PROVIDER`,
`RIS_E2E_WSL_DISTRO`, `RIS_E2E_CONTAINER_REBUILD`), Docker argument
construction (`docker run`/cleanup filters — asserting `--rm` is never
present and the published port is never fixed), and published-port/remote-
URL parsing.

#### Proof-of-concept integration

`RIS_E2E_GIT_REMOTE_PROVIDER` (`native` default / `container`) selects the
fixture in `git-remote-workflows.e2e.ts`'s `before()` hook; both providers
are unified behind one `RemoteFixture` interface so the spec's three
scenario bodies never fork on provider. Only this one spec is wired up —
`git-clone-workflows`/`git-diverged-pull` are untouched, per this stage's
explicit scope limit. Both providers write the exact same
`ssh-remote-command.env` file `support/ssh-wrapper.sh` already reads, so
`wdio.conf.ts`'s existing unconditional `GIT_SSH_COMMAND` registration
serves either provider with zero changes.

#### Native Windows Git integration (validated on the real host)

A standalone reproduction (bypassing WDIO entirely, using the exact same
`GIT_SSH_COMMAND` → `ssh-wrapper.sh` chain the application uses) confirmed,
before the first real WDIO run: container start → health-checked readiness
→ ephemeral key install → native Windows `git.exe` push over SSH → bare-repo
creation → clone-back — all succeeding on the first attempt once the two
Alpine defects above were fixed.

#### WDIO proof-of-concept results / five-run stability matrix

`git-remote-workflows` run against `RIS_E2E_GIT_REMOTE_PROVIDER=container`
via the canonical runner
(`node scripts/run-wdio-e2e.mjs --spec git-remote-workflows --repeat 5
--continue-on-failure`), a fresh container per run:

| Run | Result | Duration |
|-----|--------|----------|
| 1 | 1 passed, 1 total | 31s |
| 2 | 1 passed, 1 total | 30s |
| 3 | 1 passed, 1 total | 31s |
| 4 | 1 passed, 1 total | 31s |
| 5 | 1 passed, 1 total | 31s |

All 5 runs: all 3 scenarios (push, fast-forward pull, upstream survival
across close/reopen) passed. Each run's benchmark-runner classification was
`PASS_WITH_FORCED_CLEANUP` (`passed=false` in that tool's strict
`CLEAN_PASS`-only sense) — this is the pre-existing, already-documented
Windows `@wdio/tauri-service` external-provider behavior (every Windows
external-provider run in the Stage 3B.3 matrix landed here too; see
`docs/E2E_WDIO_WINDOWS_PERFORMANCE.md`), unrelated to this stage's fixture
work — `cleanupSafe=true`/`cleanupSucceeded=true` on every run, and the
underlying WDIO/Mocha result was unambiguously "1 passed, 1 total" each
time. One prior ad-hoc run (before the five-run matrix, immediately after
the ownership-check fix above) hit an unrelated one-off UI flake — a
`repository-active-root` element failed to render within 30s on the very
first "open repository" step of scenario 3, before any remote/SSH
interaction — that did not reproduce across the five-run matrix and left no
evidence of a container/fixture-side cause; documented here rather than
silently discarded, per this stage's "a failed run remains a failure, no
retries inside one run" rule (it was not retried — a fresh 5-run matrix was
started instead).

The default (`native`) provider was re-run unchanged after this stage's
spec refactor and confirmed unaffected (1 passed, 1 total, 14s) — the
provider abstraction introduced no regression to the existing fixture.

#### Cleanup verification

After the five-run matrix: `docker ps -a --filter label=ris.e2e.fixture=git-ssh`
returned no containers; no stray `sleep`-based keep-alive processes
remained inside the WSL distribution; no `ris-wdio-*` run-root directories
remained under the Windows temp directory for any of the five runs.

#### Remaining risks

- The WSL2 VM idle-shutdown behavior above is a real host characteristic,
  not something this fixture can eliminate — only work around (the
  keep-alive session). A host with an even more aggressive idle timeout
  than observed here, or a WDIO step legitimately exceeding the keep-alive
  session's own lifetime handling, remains a theoretical risk; the 5-run
  matrix is the empirical evidence bounding it for now.
- `ensureImageBuilt`'s Windows→WSL path assumption (default `/mnt/c`
  automount) is undemonstrated on a host with automount disabled or
  remapped — the error path is clear and actionable, but untested against
  a real such host.
- Only `git-remote-workflows` has been migrated; `git-clone-workflows`
  (which additionally needs `seedBareRemoteFromLocalRepository`-equivalent
  seeding) and `git-diverged-pull` have not been exercised against the
  container provider at all.

#### Obsolete native-fixture components (after a full future migration — not removed now)

Per this stage's explicit instruction, nothing below is removed or
rewritten yet; identified only as what a full migration would eventually
retire from `support/git-remote.ts`: `findSshdWindows`/`findSshd`'s Win32
branch, `securePrivateKeyFile`'s `icacls`/Win32-ACL branch,
`findGitBash`/`findGitBashWindows`/`deriveGitRootFromExe`/
`buildWindowsGitBashCandidates` (Git Bash discovery, needed only for the
native fixture's Windows `ForceCommand`), and `buildSshdConfig`'s Win32
`ForceCommand`/`UsePAM`-omission branches. `shQuote`, the bare-remote
inspection/simulation helpers' *shape* (not their filesystem-path
implementation), and the overall `SshRemoteServer`-like lifecycle contract
would all carry forward conceptually into the container-only design.

#### Migration recommendation

**Stage 3F.5.4 COMPLETE — PROCEED TO MIGRATION.** All of this stage's own
decision criteria are met: Windows-to-WSL container networking is reliable
(once the idle-shutdown workaround is in place); native Windows `git.exe`
and `ssh.exe` work against the container without modification; all 5
`git-remote-workflows` runs passed; cleanup succeeded and was verified
every time; no privileged or machine-wide configuration was required;
failure diagnostics (container inspect/logs/port mapping) are collected
automatically; and runtime overhead is comparable to the native fixture
(~25-31s full-spec runs either way). Recommended next stage: migrate
`git-clone-workflows` and `git-diverged-pull` to the container provider,
then retire the native fixture's Windows-only branches identified above.

### Stage 3F.5.4-R1 — Container fixture lifecycle and image cache hardening (2026-08-04)

**Why this RP.** A strict review of Stage 3F.5.4's proof-of-concept
implementation (before its commits were pushed) found real lifecycle and
cache-correctness defects: `startContainerRemote()` could leave a running
container, a Windows work directory, and key files behind if it failed
partway through (no server object was ever returned to trigger cleanup);
the spec's own container-provider `before()` branch could leak the same
resources if `configureContainerSsh()` failed after `startContainerRemote()`
had already succeeded; and `ensureImageBuilt()` reused whatever image
happened to carry the `:dev` tag with no check that it still matched the
checked-out Dockerfile/entrypoint.sh/sshd_config — editing the fixture and
re-running a spec could silently keep testing against a stale image. None
of this was visible in Stage 3F.5.4's own 5-run stability matrix, because
every one of those runs completed successfully; only a failure partway
through startup, or an edit to the fixture source, would have exposed it.

#### Transactional startup

`startContainerRemote()` now tracks every resource it acquires —
distribution, keep-alive session, container name, Windows work directory —
in a `PartialContainerFixtureState` as it goes. Any failure at any step,
including ones after the container already exists (port parsing,
healthcheck, `ssh-keygen`, key permissions, `installPublicKey`, …),
triggers `rollbackPartialContainerFixture()` before the error is rethrown.
The **same error instance** that failed is what callers see (`error ===
originalError` holds) — rollback failures are attached as a non-replacing
`rollbackDiagnostics` array property, never masking the original failure.
Rollback order: collect diagnostics (while the container still exists) →
remove container → remove work directory → clear SSH wrapper config (only
if one was actually written — never true from inside
`startContainerRemote()` itself, see below) → stop the keep-alive last.
`cleanupContainerRemote()` is deliberately not reused here: it expects a
complete `ContainerSshRemoteServer`, which may not exist yet.

#### Atomic provider initialization

`createContainerRemoteFixture()` is the new atomic boundary the spec now
calls instead of `startContainerRemote()`/`configureContainerSsh()`
separately: it only returns the ready provider abstraction once *both*
succeed. By the time `configureContainerSsh()` runs, a complete server
object already exists, so its failure path calls `cleanupContainerRemote()`
directly (not the partial-rollback helper) before rethrowing. The spec's
`before()` no longer has a window where `fixture` is unassigned but a
container is already running. The native provider got the equivalent
guarantee inline in the spec (a `try`/`catch` around `configureNativeSsh()`
that calls the native fixture's own `cleanup()` on failure) rather than a
change to `support/git-remote.ts` itself, keeping this RP's native-fixture
footprint to zero.

#### Content-addressed image cache

`ensureImageBuilt()` is now keyed by `ris-e2e-git-ssh-server:<12-char-hash>`,
where the hash (`computeFixtureContentHash`) covers the Dockerfile,
`entrypoint.sh`, and `sshd_config` actually on disk, each delimited by its
own NUL-bounded name field (`\0<name>\0<content>`) rather than plain
concatenation — plain concatenation of file *contents* alone is ambiguous
(`["ab","c"]` and `["a","bc"]` hash identically with no separators); a
dedicated test proves the boundary-safe design doesn't collide the same
way. A source edit changes the hash, which changes the tag, which
`ensureImageBuilt`'s own existence check then correctly reports as absent —
cache invalidation falls out of the design rather than needing separate
logic. `RIS_E2E_CONTAINER_REBUILD=1` still rebuilds the same content-hash
tag on demand. Images are labeled `ris.e2e.fixture=git-ssh` and
`ris.e2e.fixture-hash=<hash>` for auditability; old-hash images are not
deleted automatically — a safe manual sweep is
`wsl -d <distro> -- docker image prune --filter label=ris.e2e.fixture=git-ssh`
(add `-a` to remove all unused images, not just dangling ones, if
reclaiming disk space from superseded fixture versions is the goal).

#### Cleanup ordering and container verification

`cleanupContainerRemote()`'s successful-teardown order is now: clear SSH
wrapper config → remove container → verify removal → remove Windows work
directory → stop the keep-alive **last, in a `finally`** — so it stays
available for every Docker command the earlier steps still need, even if
one of them fails. It returns a structured `CleanupResult`
(`sshConfigCleared`/`containerRemoved`/`containerVerifiedAbsent`/
`workDirRemoved`/`keepAliveStopped`/`errors`) instead of throwing — a
failed container removal is recorded, never silently treated as success.
Verification switched from `docker ps -aq --filter name=<containerName>`
(a substring match — a real Docker footgun) to `docker inspect
<containerName>`, an exact-identity check that cannot match a
similarly-named unrelated container.

#### WSL output decoding (non-blocking hardening)

`decodeWslMetaOutput()` no longer assumes every `wsl.exe` meta-command
result is UTF-16LE unconditionally: a UTF-16LE BOM is authoritative when
present; otherwise NUL-byte density (~50% for UTF-16LE-encoded ASCII/
Latin-1 text vs. ~0% for UTF-8) decides; anything not clearly UTF-16LE by
either signal decodes as UTF-8.

#### Fault-injection test coverage

`container-git-remote.test.ts` grew from 67 to 109 tests, adding
dependency-injected fault-injection coverage for every lifecycle function
this RP touched — `startContainerRemote` (port-parse failure, `ssh-keygen`
failure, `installPublicKey` failure, distribution-resolution failure, the
original error surviving as the same thrown instance, rollback diagnostics
attaching without replacing it), `createContainerRemoteFixture`
(`configureContainerSsh` failing after a successful start),
`rollbackPartialContainerFixture` and `cleanupContainerRemote` (safe with
no container/no work directory, keep-alive always stopped even when every
other step fails, safe to call twice, never throws), and
`cleanupOrphanedContainers` (never removes anything beyond the exact,
label-filtered id list — no fallback to "remove everything"). None of this
requires real WSL/Docker access.

#### Real-host validation

On the same Windows+WSL2+Docker host as the original Stage 3F.5.4 proof of
concept: a forced content-hash build produced the expected tag with the
expected labels, and a subsequent non-forced call correctly reused it
without rebuilding. A fresh 5-run stability matrix
(`RIS_E2E_GIT_REMOTE_PROVIDER=container`, fresh container per run) hit one
genuine failure on its first attempt — `[data-testid="repository-active-
root"]` never rendered within 30s on a scenario's very first "open
repository" UI action, before any remote/SSH/container interaction; the
same container/SSH pipeline in the same run then completed its remaining
two scenarios successfully — the identical failure signature and location
class already documented as a one-off UI flake in Stage 3F.5.4's own report
(there, on scenario 3's first open; here, on scenario 1's). Per this RP's
own "a failed run remains a failure, no retries inside one run" rule, that
run was counted as a failure and a **fresh** 5-run matrix was started; all
5 of those passed cleanly (22-28s each). A controlled real-host failure
injection (a fake `installPublicKey` throwing after the container was
genuinely created and became healthy) confirmed, against real Docker
state: the same injected error instance was rethrown with
`rollbackDiagnostics` attached, the container was actually gone from
Docker's own `inspect` afterward, the run's `container-ssh-<runId>`
subdirectory was removed, and no `sleep 86400` keep-alive process was left
running. The default native provider was re-run once and confirmed
unaffected (1 passed, 14s).

#### Remaining risks

Unchanged from Stage 3F.5.4's own report: the WSL2 VM idle-shutdown
behavior is a real host characteristic this fixture works around, not
eliminates; the `/mnt/c` automount path assumption is untested on a
remapped host; only `git-remote-workflows` is migrated. The intermittent
UI-open flake observed once during this RP's real-host validation (and
once during the original stage's) appears unrelated to either fixture
provider — it occurs before any remote/SSH/container interaction and does
not reproduce across either stage's clean 5-run matrices — but is noted
here rather than silently discarded, since its root cause is not yet
understood.

**STAGE 3F.5.4-R1 COMPLETE — READY TO PUSH.**

### Stage 3F.5.4-R2 — Verified container teardown (2026-08-04)

**Why this RP.** A strict review of Stage 3F.5.4-R1 found one remaining
class of correctness issue: fixture teardown could report success without
that success ever being *conclusively verified*. `checkContainerExists`
collapsed every `docker inspect` failure (daemon down, WSL unavailable,
permission denied, `wsl.exe` itself erroring) to the same boolean as a
genuine "container not found" — meaning a Docker communication failure
during verification could be silently read as "the container is gone".
Worse, the spec's `after()` hook never inspected `cleanup()`'s return value
at all, so even an honestly-reported failure had no way to fail the suite.
This RP makes teardown *authoritative*: a WDIO run cannot pass while its
fixture teardown is unverified.

#### Tri-state container presence

`ContainerPresence` replaces the old boolean with `{status: "present"} |
{status: "absent"} | {status: "unknown"; error: string}`. Only Docker's own
exact not-found result may produce `"absent"` — confirmed against this
project's real Docker Engine (29.4.3 under WSL2): `docker inspect` on a
missing name prints `error: no such object: <name>` (lowercase, no
daemon-response prefix), `docker rm`/`docker port` print `Error response
from daemon: No such container: <name>`; both are recognized by
`isDockerNotFoundError`'s single case-insensitive `no such
(object|container):` pattern. Every other failure — daemon unavailable, WSL
unavailable, permission denied, a missing docker CLI, a generic unrelated
"not found" — falls through to `"unknown"`, never `"absent"`.
`inspectContainerPresence` takes its `docker inspect` call as an injectable
dependency (mirroring `selectDistribution`'s `checkDocker` seam), so the
whole classification is unit-tested with fabricated stderr text — no real
WSL/Docker required for that coverage. `execDocker` now throws a
`DockerCommandError` that preserves `stderr`/`exitCode`/`cause` rather than
only a flattened message string, since the classifier needs the raw stderr.

An empirically important finding from this stage's real-host work: `docker
rm -f <name>` on an already-absent container exits **0** on this Docker
version (idempotent by design) — only `docker inspect` reliably signals
absence via a non-zero exit, which is exactly why `containerVerifiedAbsent`
is always derived from a dedicated post-removal `inspectContainerPresence`
call, never from "the removal call didn't throw".

#### Authoritative teardown

`CleanupResult` gained `containerRemovalAttempted` and
`keepAliveStopRequested` (distinguishing "we tried" from "we confirmed"),
and `isCleanupSuccessful`/`assertCleanupSucceeded`/`formatCleanupFailure`
give it a single, testable success predicate: `sshConfigCleared &&
containerVerifiedAbsent && workDirRemoved && keepAliveStopped &&
errors.length === 0`. `containerRemoved`/`containerRemovalAttempted` are
deliberately *not* part of the predicate — an idempotent removal against an
already-absent container is still a successful cleanup, provided
`containerVerifiedAbsent` is conclusively `true`.

#### Provider-neutral cleanup contract

`RemoteFixture.cleanup(): Promise<unknown>` — a shape the spec had no way
to act on even if it wanted to — is now `Promise<FixtureCleanupResult>`
(`{ok, provider: "native" | "container", errors}`). The container adapter
maps its `CleanupResult` via `toFixtureCleanupResult`; the native adapter
(unchanged in `git-remote.ts` itself, same "zero native-fixture footprint"
approach Stage 3F.5.4-R1 used) gets an inline try/catch in the spec that
converts a thrown error into `{ok: false, errors: [message]}` rather than
letting it disappear. The spec's `after()` hook is now one line:
`assertFixtureCleanupSucceeded(await fixture.cleanup())` — a container left
running, an unverified presence check, a refused work-directory removal, or
a still-running keep-alive all fail the suite, for either provider.

#### Atomic-init cleanup diagnostics

`createContainerRemoteFixture()`'s `configureContainerSsh()`-failure path
previously called `cleanupContainerRemote()` only to discard the outcome
(`.catch(() => {})`). It now attaches that outcome — a failed/unverified
`CleanupResult`, or the cleanup call itself throwing — as a non-replacing
`cleanupDiagnostics` string-array property on the *original* configuration
error, which stays the primary thrown error (the same instance when it was
already an `Error`; a non-`Error` thrown value is wrapped in one with the
original value preserved as `cause`).

#### Partial docker-run rollback

The generated container name is now recorded in
`PartialContainerFixtureState` *before* `docker run` is even attempted
(previously only after it resolved successfully) — the name is unique and
controlled by this run, so targeting it for rollback is always safe, even
when `docker run` itself throws after partial engine-side work.
`rollbackPartialContainerFixture` is tri-state aware end to end: it
inspects presence first (confirmed absent skips the removal attempt
entirely — idempotency), attempts removal for `"present"` or `"unknown"`
(a failed inspection proves nothing), and re-verifies afterward — a generic
final-inspection failure is recorded as a diagnostic, never silently
converted into confirmed absence.

#### Work-directory verification

`removeWorkDir` now returns a tri-state `WorkDirRemovalResult` (`"removed"
| "already-absent" | "refused"`) instead of silently no-op'ing when
`RIS_E2E_RUN_ROOT` is unset or the target is outside it (the path-safety
guard, `isStrictChildPath`, is unchanged). `"refused"` is reported as an
error, never as success; `"removed"`/`"already-absent"` both count as
success in `CleanupResult.workDirRemoved`.

#### Idempotency

Calling cleanup twice on already-absent resources still yields two
conclusively successful results: Docker's own exact not-found counts as
absent, a missing work directory counts as already-cleared, a missing SSH
config file counts as already-cleared. Proven both in fault-injection tests
and against real Docker state (see below).

#### Unit and fault-injection tests

`container-git-remote.test.ts` grew from 109 to 158 tests: presence
classification (`isDockerNotFoundError`/`inspectContainerPresence`, all 9
scenarios this RP's own checklist named — present, both not-found message
shapes, daemon/WSL/permission/CLI-missing/generic-unrelated all `"unknown"`,
never `"absent"`), teardown authority
(`isCleanupSuccessful`/`assertCleanupSucceeded`/`formatCleanupFailure`,
provider-neutral `toFixtureCleanupResult`/`assertFixtureCleanupSucceeded`),
rewritten `rollbackPartialContainerFixture`/`cleanupContainerRemote`
coverage for the tri-state contract plus new idempotency cases, three new
partial-`docker run`-failure fault-injection scenarios, and atomic-init
diagnostics coverage (clean rethrow with no diagnostics, diagnostics
attached without replacing the original error, a thrown cleanup error
itself captured as a diagnostic, non-`Error` thrown values wrapped with
`cause`).

#### Controlled real-host validation

On the same Windows+WSL2+Docker host as Stage 3F.5.4/R1, a standalone
script exercised the real production functions (not fakes) against real
Docker state: (1) a normal start+cleanup cycle succeeded, independently
confirmed absent via a fresh `docker inspect` call; (2) a second cleanup
call on the now-absent container also reported success (idempotency); (3)
a forced `"unknown"` presence result on a real, already-removed container
made `assertCleanupSucceeded` throw and left `containerVerifiedAbsent:
false` — teardown correctly went red on an unverifiable result, never
silently green; (4) a real `docker run` was allowed to actually create a
container engine-side, then made to throw immediately afterward (simulating
a lost response) — rollback still removed that exact real container,
independently confirmed via `docker inspect`. All temporary injection code
was removed before commit; no container, work directory, or keep-alive
process was left behind by the script.

#### Container provider validation

`RIS_E2E_GIT_REMOTE_PROVIDER=container` against `git-remote-workflows`: one
functional run, then a fresh 5-run stability matrix
(`--repeat 5 --continue-on-failure`) — **5/5 passed** (24-31s each), every
run's teardown conclusively successful per its own `[container-git-remote]
cleaned up container ...` log line. Independently verified after all five
runs: `docker ps -a --filter label=ris.e2e.fixture=git-ssh` empty, no
`sleep 86400` keep-alive process, no per-run work directory left under the
OS temp root.

#### Native provider regression

Re-run against `RIS_E2E_GIT_REMOTE_PROVIDER=native`: the first attempt,
launched immediately after the container matrix's last run, failed at the
WDIO-launcher level (`exitCode=1`, `reportValid=false` — no spec dot-report
was ever produced, i.e. a session-start failure, not a test assertion
failure) — consistent with driver-port contention immediately following
the preceding container-provider matrix's own forced port cleanup (see
wdio.conf.ts's own doc comment on tauri-driver/msedgedriver port handling).
Four immediate, consecutive re-runs all passed cleanly (1 passed each,
14-35s), and this RP touched no native-fixture internals
(`support/git-remote.ts` is unchanged) — the one failure is attributed to
transient driver-port state, not a regression from this RP's changes.

#### Remaining risks

The intermittent driver-port-contention failure observed once during this
RP's native-provider regression check (see above) joins the intermittent
UI-open flake already flagged in Stage 3F.5.4/R1's own reports as a
residual, not-yet-eliminated characteristic of this Windows WDIO
environment — neither is caused by, nor fixed by, this RP's container
fixture changes. The keep-alive process's "stopped" state is still
reported as "the kill call didn't throw", not a confirmed-exit wait (this
RP's own scope explicitly allows leaving this as a residual risk rather
than enlarging the repair with a bounded exit-confirmation helper).
Everything else carried forward from Stage 3F.5.4/R1's own reports is
unchanged: WSL2 VM idle-shutdown is a real host characteristic worked
around, not eliminated; `/mnt/c` automount path assumption untested on a
remapped host; only `git-remote-workflows` is migrated.

**STAGE 3F.5.4-R2 COMPLETE — READY FOR MIGRATION.**

### Not proposed as a numbered coverage stage

- **CI execution / full WDIO in CI** — tracked separately in "Desktop E2E
  execution policy" § Future WDIO CI design above; an infrastructure
  initiative, not a workflow-coverage gap, and not derived from the gap
  analysis.
- **Windows validation** — a one-off performance experiment ran (3B.3);
  no repeatable CI/validation infrastructure exists. Same category as CI
  execution — infrastructure, not coverage.

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

## Desktop E2E execution policy

Full desktop E2E is an integration and release gate, not a test that must run
before every small PR.

### Ordinary feature PRs

For normal `feature/*` pull requests the required fast CI checks are:

- TypeScript
- Vitest
- Rust tests
- Repository scripts and hygiene
- Dependency audits
- Workflow lint
- Playwright browser-mode tests when the CI environment supports them

Full WDIO desktop E2E is **not required** on ordinary PRs. It is not run
automatically on every push and must not become a required check for changes
unrelated to E2E infrastructure. The ~51-minute full-suite figure quoted in
earlier stages is stale: the Stage 3B.4 latency optimization and Stage 3C's
spec consolidation have since dropped individual external-provider specs to
roughly 5–35s each (see Stage 3C's per-spec timings above), but the full
suite has not been timed end-to-end since those changes, so no current
total figure is quoted here. Running the full suite for every small PR
would still create unnecessary feedback time and CI cost regardless of the
exact total.

### PRs targeting `roadmap/e2e-wdio`

For `feature/e2e-*` → `roadmap/e2e-wdio` pull requests, the following are
required before review:

- The changed or new WDIO spec must be run independently (isolated spec run)
- The independent spec run should be repeated at least twice when practical
- The full WDIO suite must be run locally once after successful isolated validation
- Results must be documented in the PR body
- Cleanup and contamination checks must be documented

CI policy for these PRs:

- Normal fast checks remain required
- Full WDIO CI is optional or manually triggered
- Full WDIO is not yet a blocking check for each roadmap feature PR

### Integration PR (`roadmap/e2e-wdio` → `development`)

When an integration PR is eventually opened, full desktop E2E in CI must be:

- Automatic
- Mandatory
- Blocking
- Executed against the exact integration commit
- Accompanied by retained logs and diagnostic artifacts

The integration PR must not merge when:

- WDIO fails
- Cleanup safety fails
- The exact tested commit differs from the PR head
- Required platform validation is missing from the agreed integration criteria

### Release validation

Before a release candidate is merged or promoted:

- Full WDIO must run against the exact release commit
- Windows validation is mandatory (Windows is the primary distributed platform)
- Linux validation is recommended and may be mandatory once stable CI exists
- Logs and artifacts should be retained

For `release/*` → `master`:
- Do not rerun the full suite when the exact commit was already validated as a
  release candidate
- Reuse the release-candidate result only when the commit SHA is unchanged

### WDIO CI design (implemented — BRSP Stage B2)

**Status: Promotion step 1 COMPLETE.** `.github/workflows/wdio-e2e.yml`
(added in BRSP Stage B2, CI Architecture & WDIO Integration) implements the
design below. Full detail — architecture, composite actions, debugging a
failed run, local usage — lives in [`docs/CI.md`](CI.md); this section
keeps only the promotion path and status.

Initial WDIO CI:

- ✅ Starts as `workflow_dispatch` (manual)
- ✅ Runs on Linux
- ✅ Non-blocking — not a required check on any branch
- ✅ Retains Tauri logs, WDIO logs, and failure diagnostics (log + preserved
  temp dir per spec, uploaded as job artifacts — see `docs/CI.md`)
- ✅ Reuses the project's own port-contract / PID-safe-cleanup guarded
  runner (`scripts/run-wdio-e2e.mjs`) unmodified — CI runs the same code
  path as local development
- ✅ Uses the exact built Tauri binary from the tested commit (built fresh
  by the workflow's own `build-binary` job, not a cached/older artifact)
- ⬜ Total full-suite runtime not yet measured end-to-end in CI (each spec's
  local timing is documented per-stage above; no aggregate CI figure exists
  yet — first real `workflow_dispatch` run with `spec: all` will establish
  one)

Promotion path:

1. ✅ Manual `workflow_dispatch` — **implemented**
2. ⬜ Automatic non-blocking run for roadmap integration candidates (e.g. on
   PRs targeting `roadmap/e2e-wdio`) — not enabled; deliberately deferred,
   see `docs/CI.md`'s workflow header comment
3. ⬜ Required blocking check for `roadmap/e2e-wdio` → `development` —
   reserved for Stage B3
4. ⬜ Release candidate validation — reserved for Stage B5/B6
5. ⬜ Windows matrix after the Linux path is stable — not started

---

## Risks and open questions

| Risk | Notes |
|------|-------|
| Linux WebKitGTK driver | ubuntu-24.04 runner availability of `webkit2gtk-driver` not yet confirmed for CI |
| Windows WebView2 driver | Version matching; `@wdio/tauri-service` may handle auto-download but CI cache strategy needed |
| Native dialogs | OS save/open dialogs difficult to automate; may need app-level bypass in test builds |
| Binary build time | Tauri binary must be compiled before WDIO tests; adds significant CI time |
| Non-ASCII paths | Temp directory paths with non-ASCII characters may break on some platforms |
| `@wdio/native-utils` override | Workspace override to 2.5.0 works around a peer-dep mismatch; upstream fix not yet confirmed |
| Test isolation | Each spec must start from a clean state; shared state between specs causes flakiness |

**Resolved since originally logged:**
- ~~Tauri plugin scope~~ — `tauri-plugin-wdio` (the `wdio-plugin` Cargo feature) was added in Stage 3B.4, test-only, narrowly scoped via a dedicated `capabilities/wdio-plugin-test.json` generated by `build.rs`, never shipped in production builds.
- ~~`tauri-plugin-wdio` hook overhead~~ — installing the plugin (Stage 3B.4) eliminated the ~7–8s per-command plugin-availability retry loop it was meant to address; the canonical runner now always builds with it via `pnpm build:e2e:wdio-plugin`.
