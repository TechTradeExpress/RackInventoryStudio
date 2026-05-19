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

275 workspace tests pass as of v0.35.0.

## Current desktop UI capabilities

- Opening a local inventory repository via folder picker or path input
- Repository summary (counts of locations, racks, devices, placements)
- Validation — run rules, view per-issue results (level, code, message, object)
- Save changes back to YAML files
- Close the current repository session (with unsaved-changes confirmation)
- Global unsaved changes banner whenever in-memory state differs from disk
- Tab navigation: Locations list, Racks list, Devices list, Device Models list
- Rack detail view — metadata table, graphical read-only rack unit diagram (U-position, front and rear sides)
- Placement inspector — all placement fields visible when a placement is selected
- Move a placement to a new rack, side, start U, and optional height override via the Placement Inspector form (supports same-rack, cross-side, and rack-to-rack moves); cross-rack move automatically navigates to the destination rack and selects the moved placement
- Add a new device or rack object placement to the selected rack via a simple form (side, target, start U, optional height override); unsaved changes must be saved explicitly via the Validation tab
- Remove an existing placement from the selected rack via a confirmation button in the Placement Inspector; unsaved changes must be saved explicitly via the Validation tab
- Frontend Vitest unit tests

## Project status

The core backend and the rack placement workflow are complete. The app is usable for inspecting and editing rack placements through forms.

### What is implemented

- Open local inventory repository; view summary, locations, racks, devices, device models
- Validation panel with per-issue results
- Rack detail view with graphical rack unit diagram (front and rear)
- Placement inspector: view all placement fields
- Add placement — device or rack object — via form
- Move placement: same rack, cross-side, and cross-rack, via the inspector form; cross-rack auto-navigates to the destination rack
- Remove placement via confirmation button
- Rack list shows Front / Rear / Total placement counts, updated live after mutations
- Unsaved changes banner, save flow, close with confirmation
- CI: Rust workspace tests and frontend checks pass

### Remaining MVP gaps

| Area | Status |
|---|---|
| Git remote sync — auth configuration | Auth (SSH keys, HTTPS credentials) must be configured in the OS/git-credential-helper outside the app |
| Native CSV file picker | Not implemented; users paste CSV into textarea |
| Edit / delete UI for all entity types | Add-only; edit requires direct YAML or Remove Placement |
| Drag-and-drop placement | Deferred post-MVP; form-based operations cover core use case |

See [`docs/MVP_READINESS_REPORT_EN.md`](docs/MVP_READINESS_REPORT_EN.md) for the full readiness assessment and [`docs/MVP_SMOKE_TEST_CHECKLIST_EN.md`](docs/MVP_SMOKE_TEST_CHECKLIST_EN.md) for the manual smoke-test checklist.

### Drag and drop

Drag and drop is **not a hard MVP blocker**. Form-based placement operations cover the core use case. Drag and drop remains the target UX but is deferred to post-MVP.

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

## Running frontend checks

```bash
# TypeScript type check
pnpm --filter @rack-inventory-studio/desktop typecheck

# Run Vitest unit tests
pnpm --filter @rack-inventory-studio/desktop test

# Full frontend build (TypeScript + Vite bundle)
pnpm --filter @rack-inventory-studio/desktop build
```

## Current limitations

- **No in-app Git auth** — push and pull are implemented but SSH keys and HTTPS credentials must be configured in the OS or git-credential-helper outside the app. Auth errors surface as clear error messages.
- **No CSV import UI** — the import engine exists in `ris-import` but the confirmation/write step has no UI.
- **No drag and drop** — placement positions are changed via inspector forms. Drag and drop is deferred to post-MVP as a UX enhancement.
- **No full dirty diff tracking** — the app uses a global unsaved-changes flag. It warns that in-memory state may differ from disk, but it does not track exactly which rack or placement changed.
- **Local desktop, single-user** — no server, no sync, no multi-user conflict resolution.
