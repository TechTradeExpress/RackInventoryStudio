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
  ris-git/              Git adapter stub (not yet implemented)
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
| Tauri commands — open, save, validate, close, list entities, move placement | Done |

222 workspace tests pass as of v0.13.0.

## Current desktop UI capabilities (v0.13.0)

- Opening a local inventory repository via folder picker or path input
- Repository summary (counts of locations, racks, devices, placements)
- Validation — run rules, view per-issue results (level, code, message, object)
- Save changes back to YAML files
- Close the current repository session (with unsaved-changes confirmation)
- Global unsaved changes banner whenever in-memory state differs from disk
- Tab navigation: Locations list, Racks list, Devices list, Device Models list
- Rack detail view — metadata table, graphical read-only rack unit diagram (U-position, front and rear sides)
- Placement inspector — all placement fields visible when a placement is selected
- Move a placement within the same rack side via a simple form (new start U, optional height override)
- Frontend Vitest unit tests

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

- **No Git workflow** — `ris-git` crate is a stub. Commit, push, pull, and diff are not implemented.
- **No CSV import UI** — the import engine exists in `ris-import` but the confirmation/write step has no UI.
- **No drag and drop** — placement positions are changed via the inspector form only.
- **No add/remove placement UI** — the backend supports these use cases but they are not yet exposed in the UI.
- **No side/rack change move** — the move form only moves within the same rack side; changing side or rack is not yet supported.
- **No full dirty diff tracking** — the app uses a global unsaved-changes flag. It warns that in-memory state may differ from disk, but it does not track exactly which rack or placement changed.
- **Local desktop, single-user** — no server, no sync, no multi-user conflict resolution.
