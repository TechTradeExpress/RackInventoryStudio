# Rack Inventory Studio

Rack Inventory Studio is an offline-first desktop application for documenting physical device placement in server rack cabinets. It stores inventory data as YAML files in a Git repository, enabling version control, diff review, and team collaboration without a central server.

## Stack

```
Tauri 2  +  React 18  +  TypeScript 5  (desktop UI)
Rust workspace crates                   (domain + backend)
YAML files in Git                       (data layer)
```

## Repository layout

```
apps/
  desktop/              Tauri + React desktop application
    src/                React frontend (TypeScript)
    src-tauri/          Tauri Rust backend + commands

crates/
  ris-core/             Domain models and domain logic (no I/O)
  ris-repository/       YAML loader, YAML writer, RepositoryIndex
  ris-validation/       ValidationEngine and VAL-* rule validators
  ris-import/           CSV device import (preview only)
  ris-git/              Git adapter (init, status, commit, log, remotes, push, pull)
  ris-application/      Application use cases and session management

docs/                   Project specification and architecture docs
examples/               Example inventory YAML repository
tests/                  Shared test fixtures
```

## Current backend capabilities

| Area | Status |
|---|---|
| Domain models (Device, Rack, Location, Placement, …) | Done |
| YAML loader — strict (`load`) and tolerant (`load_raw`) | Done |
| RepositoryIndex — lookups by id and code | Done |
| ValidationEngine — 36 VAL-* rules | Done |
| CSV device import — preview with row-level issues | Done |
| YAML writer — write-back preserving original file paths | Done |
| Application session — open, save, validate | Done |
| Application mutations — add location/rack/device model/device | Done |
| Placement use cases — place, move, remove device and rack objects | Done |
| Tauri commands — open, save, validate, close, list entities, move placement, remove placement | Done |

374 Rust workspace tests pass. 388 frontend (Vitest) tests pass. 16 Playwright smoke tests pass.

## Current desktop UI capabilities

- Opening a local inventory repository via native folder picker or path input; recent repositories list stored in localStorage (clicking an entry fills the path input)
- Creating a new repository via a guided wizard (scaffolds YAML structure, optionally initialises a Git repo)
- Repository summary (counts of locations, racks, devices, placements)
- Validation — run rules, view per-issue results (level, code, message, object); navigation drill-down from each issue to the relevant entity
- Save changes back to YAML files
- Close the current repository session (with unsaved-changes confirmation)
- Global unsaved changes banner whenever in-memory state differs from disk (explicit note that this is separate from Git)
- Tab navigation: Locations list, Racks list, Devices list, Device Models list
- Global search — single input covering devices, racks, locations, and device models; navigate directly to any matching entity
- Rack detail — rack unit diagram as the primary placement surface (front/rear sides); click an empty slot to open the Place equipment modal; click an occupied block to select it and open the placement inspector
- Placement inspector — placement details and actions (edit, remove) shown in sidebar when a block is selected in the diagram
- Place equipment modal — place a device or rack object with U, side, and height; supports creating a new device inline without leaving the placement workflow
- Drag-and-drop placement — drag a device or rack object from the palette to a U-slot in the diagram; opens Place equipment modal pre-filled with target and U position
- Move a placement to a new rack, side, start U, and optional height override via the Edit placement modal; cross-rack move automatically navigates to the destination rack and selects the moved placement
- Remove an existing placement from the selected rack via a confirmation dialog in the Placement Inspector
- Settings — Diagnostics and logs: view active log directory, open logs folder, configure custom log path
- CSV device import via native OS file picker — preview with row-level validation, confirm/write
- Git integration — semantic status labels (clean / uncommitted / ahead / behind / diverged), contextual action hints, safe publish checklist (Save → Validate → Commit → Pull → Push), commit with message, push/pull with per-state gating
- Playwright smoke tests (16 tests) covering the golden path, search, CSV import, rack detail, diagram interactions, DnD, create-device-from-placement, and Git UX

## Project status

**MVP Core is functionally complete.** The core backend, inventory workflow, and Git integration are done. The app is usable end-to-end: open a repository, manage catalog entities, import devices via CSV, place them in racks, validate, save, and publish changes via Git.

### Current release direction — Beta hardening

**Beta hardening milestones A–F are complete.** The app has received a full UX hardening pass: global busy overlay, Windows Git console-window fix, Settings logs actions, rack diagram as primary placement surface, full drag-and-drop workflow, inline device creation from the placement flow, and a finalized release/versioning process. V1 is next once Windows 11 manual QA is completed and the first beta tag is created.

See [`docs/BETA_RELEASE_PROCESS_EN.md`](docs/BETA_RELEASE_PROCESS_EN.md) for the release checklist, version bump helper, and step-by-step release workflow. See [`docs/BETA_WINDOWS_11_QA_EN.md`](docs/BETA_WINDOWS_11_QA_EN.md) for the Windows 11 manual QA runbook (required before beta distribution). See [`docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md`](docs/BETA_QA_FINDINGS_ACTION_PLAN_EN.md) for the post-QA findings and completed milestones record.

### What is implemented (MVP Core)

- Open local inventory repository; view summary, locations, racks, devices, device models
- Validation panel with per-issue results
- Rack detail — rack unit diagram as primary placement surface; click empty slot or drag from palette to open Place equipment modal; create new device inline from placement workflow
- Placement inspector in sidebar: view/edit/remove placement selected in diagram
- Place device or rack object via diagram click, palette Place button, or drag-and-drop; cross-rack move auto-navigates to destination rack
- Remove placement via confirmation dialog
- Rack list shows Front / Rear / Total placement counts, updated live after mutations
- Unsaved changes banner, save flow, close with confirmation
- Edit and delete for all catalog entity types (locations, racks, device models, devices) with referential integrity guards
- Git: init, status, commit, log, remotes, push (`git push -u`), pull fast-forward
- CI: Rust workspace tests and frontend checks pass

### Roadmap to v1.0.0

v1.0.0 is the first user-facing release. It is not just a technical MVP — it must be an application that a new user can pick up and use without requiring developer guidance.

| Area | Status |
|---|---|
| Safe publish workflow / better Git UX | Done (PR #39) |
| Create new repository wizard | Done (PR #33) |
| Native CSV file picker | Done (PR #33) |
| Minimal global search | Done (PR #35) |
| Playwright smoke tests | Done (PR #36, #39) |
| Drag-and-drop placement | Done (PR #37) |
| Repository flow polish (landing / open / close / recent repos) | Done (PR #38) |
| Claude Design / UX audit and design direction | Done (branch `design/claude-ui-polish`) |
| UI polish based on design direction | Done (branch `design/claude-ui-polish`) |
| Windows installer CI (manual, unsigned) | Done (branch `design/claude-ui-polish`) |
| Beta QA Milestone A — immediate UX blockers | Done (PR #71) |
| Beta QA Milestone B — Settings logs actions | Done (PR #72) |
| Beta QA Milestone C — Rack diagram as primary placement surface | Done (PR #73) |
| Beta QA Milestone D — Complete drag-and-drop workflow | Done (PR #74) |
| Beta QA Milestone E — Create device from Place equipment | Done (PR #75) |
| Beta QA Milestone F — Release/versioning/installer process | Done (PR #76) |
| Manual Windows 11 QA + first beta tag | Required before v1.0.0 |
| V1 release | Pending Windows QA + beta tag |

Items planned after v1.0.0: plugin system, CMDB / NetBox / Nautobot / Zabbix integrations, advanced Git conflict resolution UI, advanced reports / PDF export, advanced import/export formats, application-level permissions, large enterprise workflows.

### v1.0.0 release gate

Before tagging v1.0.0, all of the following must pass:

- `cargo test --workspace` — all Rust tests (374)
- `pnpm typecheck` + `pnpm test` + `pnpm build` — frontend checks (388 Vitest tests)
- `pnpm --filter @rack-inventory-studio/desktop test:e2e` — Playwright smoke tests (16/16)
- Manual Windows 11 QA checklist (`docs/BETA_WINDOWS_11_QA_EN.md`)
- Windows Installer workflow run manually; artifact downloaded and installed on clean Windows 11
- Beta tag created and GitHub Release published per `docs/BETA_RELEASE_PROCESS_EN.md`

### Claude Design / UX Direction

The Claude Design phase is a planned UX audit before v1.0.0. It is not a chaotic redesign. The approach:

1. Audit the current UI against the documented user workflows.
2. Collect screenshots and identify friction points.
3. Design the app shell, rack detail, validation/publish flow, CSV import, and catalog panels.
4. Translate the design into small, testable implementation milestones.
5. Keep redesign changes separate from backend changes — no mixing of UI overhaul with major logic changes.
6. Maintain test suite stability throughout.

## Running Rust tests

```bash
cargo test --workspace
```

Format, lint, and check:

```bash
cargo fmt --all
cargo clippy --workspace -- -D warnings
cargo check --workspace
```

Or via Makefile targets: `make fmt`, `make test`, `make lint`, `make check`.

## Version consistency check

All four version files (`package.json`, `apps/desktop/package.json`, `Cargo.toml`, `tauri.conf.json`) must always match. Run:

```bash
pnpm check:version
```

CI enforces this automatically on every push and pull request. See [`docs/BETA_RELEASE_PROCESS_EN.md`](docs/BETA_RELEASE_PROCESS_EN.md) for the version bump procedure.

## Running the Tauri desktop app

```bash
# Install pnpm if needed
npm install -g pnpm

# Install frontend dependencies
pnpm install

# Start the desktop app in development mode
pnpm dev
# or:
pnpm tauri dev
```

### WSL2 / Linux rendering notes

On WSL2 without GPU passthrough (`/dev/dri` absent), `pnpm tauri dev` will print Mesa/EGL
warnings and the **app window will not appear**:

```
libEGL warning: failed to get driver name for fd -1
libEGL warning: MESA-LOADER: failed to retrieve device information
MESA: error: ZINK: failed to choose pdev
libEGL warning: egl: failed to create dri2 screen
```

Mesa blocks on EGL/ZINK initialisation before the GTK window can open. The fix is to force
Mesa's CPU-based software rasteriser and disable WebKit's DMA-BUF renderer:

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 pnpm tauri dev
# or use the helper script:
bash scripts/dev/tauri-dev-wsl.sh
```

`LIBGL_ALWAYS_SOFTWARE=1` skips hardware GPU detection entirely; Mesa errors disappear and
the GTK/WebKit main loop starts normally. Rendering is CPU-only (slower, but functional).
`WEBKIT_DISABLE_DMABUF_RENDERER=1` additionally prevents a blank-window issue in WebKit
when DMA-BUF buffer allocation fails.

This workaround is for local development only. Do not add it to CI.

## Running frontend checks

```bash
# TypeScript type check
pnpm --filter @rack-inventory-studio/desktop typecheck

# Run Vitest unit tests
pnpm --filter @rack-inventory-studio/desktop test

# Full frontend build (TypeScript + Vite bundle)
pnpm --filter @rack-inventory-studio/desktop build
```

## Windows installer (manual CI)

A single GitHub Actions workflow builds an unsigned Windows NSIS installer:

```
GitHub Actions → Windows Installer → Run workflow
```

- The workflow is **manual-only** (`workflow_dispatch`) — it is never triggered automatically on push or pull request.
- Build from a release branch (e.g. `release/v0.1.0`) or a tagged commit — not from an arbitrary feature branch.
- Produces a versioned artifact: `rack-inventory-studio-vX.Y.Z-windows-installer`.
- The installer is **unsigned**. Windows SmartScreen will warn on first run — click **More info → Run anyway**. This is expected for beta builds.
- Artifacts are retained for 30 days.

See `.ai/windows-installer-ci.md` for trigger instructions and `.github/workflows/windows-installer.yml` for the full workflow.

The full release process (version bump, release branch, build, QA, tagging, GitHub Release) is documented in [`docs/BETA_RELEASE_PROCESS_EN.md`](docs/BETA_RELEASE_PROCESS_EN.md).

**Diagnostics and logs** are an app feature — local log files are stored in `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\`. No telemetry. Users can open the logs folder from **Settings → Diagnostics and logs**.

## Current limitations

- **No in-app Git auth** — push and pull are implemented but SSH keys and HTTPS credentials must be configured in the OS or git-credential-helper outside the app. Auth errors surface as clear error messages.
- **No full dirty diff tracking** — the app uses a global unsaved-changes flag. It warns that in-memory state may differ from disk, but it does not track exactly which rack or placement changed.
- **No Git conflict resolution UI** — on diverged branches, the app shows a clear error and the user must resolve manually with Git outside the app.
- **Local desktop, single-user** — no server, no sync, no multi-user conflict resolution.
