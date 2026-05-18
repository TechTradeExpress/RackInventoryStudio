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

The Rust backend is well ahead of the UI. The following is implemented and tested:

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
| Tauri commands — open, save, validate, close, list entities | Done |

222 workspace tests pass as of the frontend-foundation-cleanup milestone.

## Current frontend / Tauri status

The desktop UI is a functional but minimal shell. It supports:

- Selecting and opening a local inventory repository via folder picker or path input
- Displaying a repository summary (counts of locations, racks, devices, placements)
- Running validation and showing per-issue results (level, code, message, object)
- Saving changes back to YAML files
- Closing the current repository session
- Tab-based navigation to Locations and Racks list views

The UI is intentionally minimal. Full rack visualization, device editing, CSV import UI, and Git workflow are not yet implemented.

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
# TypeScript type check only
pnpm --filter @rack-inventory-studio/desktop typecheck

# Full frontend build (TypeScript + Vite bundle)
pnpm --filter @rack-inventory-studio/desktop build
```

## Current limitations

- **No Git workflow** — `ris-git` crate is a stub. Commit, push, pull, and diff are not implemented.
- **No device editing** — mutation commands (update, delete) are not exposed via UI.
- **No CSV import UI** — the import engine exists in `ris-import` but the confirmation/write step is not implemented.
- **No rack visualization** — rack view shows a placement summary count, not a visual U-position diagram.
- **Single-user, local only** — no server, no sync, no multi-user conflict resolution yet.
- **Placement side (front/rear)** is tracked in the domain but not yet visible in the UI.

## Milestone status

### Completed
- M1 — Core domain models
- M2 — YAML loader + RepositoryIndex
- M3 — ValidationEngine (36 rules)
- M4 — CSV import preview
- M5 — YAML writer with path preservation
- M6A — Application session, open/save/validate, add_* mutations
- M6B — Placement use cases (place, move, remove)
- M7 — Minimal Tauri shell with repository picker
- M8 — Frontend foundation cleanup (this milestone)

### In progress / next
- M9 — Read-only navigation screens (locations list, rack list, rack detail)
- M10 — Device and device model list views
- M11 — Editing flows (add/update/delete via UI)
- M12 — CSV import UI (confirm and write)
- M13 — Git workflow (commit, push, pull, diff view)
