# Rack Inventory Studio — Implementation Plan v0.1

## 1. Purpose

This document describes the MVP implementation plan for **Rack Inventory Studio**.

The plan is based on approved decisions:

```text
Stack:
  Tauri + React + TypeScript + Rust

Repository structure:
  lightweight monorepo

Data model:
  YAML in Git repository

Application:
  offline-first desktop
```

The document defines:

- application repository structure,
- directory layout,
- Rust crate split,
- React frontend split,
- prototype order,
- MVP milestones,
- completion criteria,
- out-of-MVP scope.

---

## 2. Target repository structure

The project will be developed as a lightweight monorepo.

```text
rack-inventory-studio/
  README.md
  LICENSE
  CHANGELOG.md
  Cargo.toml
  package.json
  pnpm-workspace.yaml

  apps/
    desktop/
      src-tauri/
        Cargo.toml
        tauri.conf.json
        src/
          main.rs
          commands/

      src/
        main.tsx
        App.tsx
        app/
        api/
        components/
        screens/
        features/
        hooks/
        types/

      package.json
      vite.config.ts
      tsconfig.json

  crates/
    ris-core/
      Cargo.toml
      src/
        lib.rs

    ris-repository/
      Cargo.toml
      src/
        lib.rs

    ris-validation/
      Cargo.toml
      src/
        lib.rs

    ris-import/
      Cargo.toml
      src/
        lib.rs

    ris-git/
      Cargo.toml
      src/
        lib.rs

    ris-application/
      Cargo.toml
      src/
        lib.rs

  docs/
    SPEC_PL.md
    SPEC_EN.md
    VALIDATION_AND_CSV_SPEC_PL.md
    VALIDATION_AND_CSV_SPEC_EN.md
    USER_WORKFLOWS_PL.md
    USER_WORKFLOWS_EN.md
    UI_SCREENS_SPEC_PL.md
    UI_SCREENS_SPEC_EN.md
    ARCHITECTURE_PL.md
    ARCHITECTURE_EN.md
    TECH_STACK_PL.md
    TECH_STACK_EN.md
    IMPLEMENTATION_PLAN_PL.md
    IMPLEMENTATION_PLAN_EN.md

  examples/
    example-repository/
      inventory/
        repo.yaml
        locations.yaml
        racks/
        device-models/
        devices/
        placements/

  tests/
    fixtures/
      valid-repository/
      invalid-repository/
      csv/
```

---

## 3. Monorepo rationale

The selected structure is a lightweight and practical monorepo.

Reasons:

```text
1. Desktop application and Rust core live in one repository.
2. Core can be tested independently from UI.
3. CLI can be added later without rewriting logic.
4. Documentation, examples, and fixtures live near code.
5. Rust crates enforce clear responsibility split.
6. Project is easy to understand for open source contributors.
```

---

## 4. Rust workspace

Root `Cargo.toml` should define the workspace:

```toml
[workspace]
members = [
  "apps/desktop/src-tauri",
  "crates/ris-core",
  "crates/ris-repository",
  "crates/ris-validation",
  "crates/ris-import",
  "crates/ris-git",
  "crates/ris-application"
]
resolver = "2"
```

Main rule:

```text
Domain logic does not go into src-tauri.
src-tauri is a thin integration layer between Tauri and ris-application.
```

---

## 5. Frontend workspace

Frontend should use one package manager.

Recommendation:

```text
pnpm
```

Root `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
```

Desktop application:

```text
apps/desktop/
```

contains React + TypeScript + Vite + Tauri.

---

## 6. Rust crates

### 6.1. `ris-core`

The primary domain library.

Contains:

```text
- domain models,
- enums,
- ID types,
- height calculation logic,
- U range logic,
- basic domain error types.
```

Example modules:

```text
ids
device_type
device_status
repository_metadata
location
rack
device_model
device
placement
placement_range
validation_issue
```

It should not depend on:

```text
YAML
Git
Tauri
React
Filesystem
```

### 6.2. `ris-repository`

YAML data repository handling.

Contains:

```text
- RepositoryLoader,
- RepositoryWriter,
- RepositoryIndex,
- YAML parser,
- YAML serializer,
- directory structure detection,
- file-to-domain mapping.
```

Dependencies:

```text
ris-repository -> ris-core
```

### 6.3. `ris-validation`

Repository validation.

Contains:

```text
- ValidationEngine,
- GeneralValidators,
- RepositoryValidators,
- LocationValidators,
- RackValidators,
- DeviceModelValidators,
- DeviceValidators,
- PlacementValidators,
- CsvValidators.
```

Dependencies:

```text
ris-validation -> ris-core
ris-validation -> ris-repository
```

### 6.4. `ris-import`

CSV import.

Contains:

```text
- CsvReader,
- CsvDeviceImportValidator,
- CsvImportPreview,
- CsvDeviceImporter.
```

Dependencies:

```text
ris-import -> ris-core
ris-import -> ris-repository
ris-import -> ris-validation
```

### 6.5. `ris-git`

Git handling.

Contains:

```text
- GitService,
- GitStatusReader,
- GitHistoryReader,
- GitCommitService,
- GitSyncService,
- ConflictBranchService.
```

Dependencies should stay minimal.

Preferred:

```text
ris-git
```

Optional:

```text
ris-git -> ris-core
```

if shared result or error types are needed.

### 6.6. `ris-application`

Application use case layer.

Contains operations:

```text
OpenRepository
CreateRepository
PullLatestData
SaveRepository
PublishChanges
CreateConflictBranch

AddLocation
UpdateLocation
DeleteLocation

AddRack
UpdateRack
DeleteRack

AddDeviceModel
UpdateDeviceModel
DeleteDeviceModel

AddDevice
UpdateDevice
DeleteDevice

ImportDevicesFromCsv

PlaceDevice
PlaceRackObject
MovePlacementWithinSide
RemovePlacement
UpdatePlacement

ValidateRepository
Search
```

Dependencies:

```text
ris-application -> ris-core
ris-application -> ris-repository
ris-application -> ris-validation
ris-application -> ris-import
ris-application -> ris-git
```

---

## 7. Desktop application

Desktop application is located in:

```text
apps/desktop/
```

It consists of:

```text
src-tauri/
  Tauri backend and commands

src/
  React frontend
```

### 7.1. `src-tauri`

`src-tauri` should be a thin layer.

Responsibilities:

```text
- register Tauri commands,
- call ris-application,
- map errors to frontend responses,
- integrate with app/window system.
```

It should not contain:

```text
- validator logic,
- CSV import logic,
- data model logic,
- direct YAML writing outside application/repository layer.
```

### 7.2. Tauri commands

Example commands:

```text
open_repository
create_repository
validate_repository
get_repository_status

get_locations
add_location
update_location
delete_location

get_location_details
add_rack
update_rack
delete_rack

get_device_models
add_device_model
update_device_model
delete_device_model

get_devices
add_device
update_device
delete_device

preview_csv_import
import_devices_csv

get_rack_view
place_device
place_rack_object
move_placement_within_side
remove_placement
update_placement

save_repository
publish_changes
pull_latest_data
get_git_history
```

---

## 8. React frontend

Frontend is located in:

```text
apps/desktop/src/
```

### 8.1. Proposed directories

```text
app/
api/
components/
screens/
features/
hooks/
types/
```

### 8.2. `app/`

Application configuration:

```text
routing
layout
global state
app shell
```

### 8.3. `api/`

Communication layer with Tauri backend.

Examples:

```text
repositoryApi.ts
validationApi.ts
locationsApi.ts
racksApi.ts
devicesApi.ts
modelsApi.ts
csvImportApi.ts
gitApi.ts
rackViewApi.ts
```

### 8.4. `components/`

Shared UI components:

```text
Button
Table
Modal
FormField
TagList
StatusBadge
ValidationBadge
EmptyState
ConfirmDialog
```

### 8.5. `screens/`

Main screens:

```text
StartScreen
RepositoryScreen
ValidationScreen
HistoryScreen
LocationsScreen
LocationDetailsScreen
DeviceModelsScreen
DevicesScreen
CsvImportScreen
RackViewScreen
```

### 8.6. `features/`

Functional modules:

```text
repository
validation
locations
racks
deviceModels
devices
csvImport
rackView
gitHistory
```

### 8.7. `types/`

TypeScript types matching backend DTOs.

Rule:

```text
TypeScript types should be aligned with DTO structures returned by Rust commands.
```

---

## 9. Frontend-backend communication

Frontend communicates with backend through Tauri commands.

Example:

```text
React component
  -> repositoryApi.openRepository(path)
    -> Tauri invoke("open_repository")
      -> command open_repository
        -> ris-application::OpenRepository
          -> ris-repository::RepositoryLoader
```

Frontend should not directly:

```text
- read YAML,
- write YAML,
- call Git,
- perform validation as source of truth.
```

---

## 10. Tests

### 10.1. Unit tests

Should live in crates.

Examples:

```text
ris-core:
  placement range tests
  effective_height_u tests

ris-validation:
  validator rules tests

ris-import:
  CSV parsing and validation tests

ris-repository:
  YAML load/write tests
```

### 10.2. Integration tests

Fixtures:

```text
tests/fixtures/
  valid-repository/
  invalid-repository/
  csv/
```

Tests should cover:

```text
- loading valid repository,
- detecting errors,
- placement validation,
- CSV import,
- YAML writing.
```

### 10.3. UI tests

For MVP, UI tests can be minimal.

Core tests are the priority.

---

## 11. Milestone 0 — Repository bootstrap

### Goal

Create empty but valid project structure.

### Scope

```text
- create repository,
- add MIT LICENSE,
- add README,
- add Cargo workspace,
- add pnpm workspace,
- add apps/desktop,
- add crates,
- add docs,
- add examples,
- add tests/fixtures.
```

### Completion criteria

```text
cargo check works
pnpm install works
directory structure matches the plan
documentation is in docs/
example-repository is in examples/
```

---

## 12. Milestone 1 — Domain core

### Goal

Implement primary domain models.

### Scope

```text
ris-core:
  - Location
  - Rack
  - DeviceModel
  - Device
  - Placement
  - PlacementFile
  - RepositoryMetadata
  - DeviceType
  - DeviceStatus
  - PlacementTargetKind
  - PlacementSide
  - PlacementRange
```

Logic:

```text
- effective_height_u
- end_u
- U range
- rack_object detection
```

### Completion criteria

```text
models compile
basic unit tests pass
no dependency on YAML, Git, Tauri
```

---

## 13. Milestone 2 — YAML loader and RepositoryIndex

### Goal

Load example YAML repository into domain models.

### Scope

```text
ris-repository:
  - RepositoryLoader
  - YAML structs
  - mapping YAML -> domain
  - RepositoryIndex
  - load locations
  - load racks
  - load device-models
  - load devices
  - load placements
```

### Completion criteria

```text
test/app can load examples/example-repository
RepositoryIndex contains by_id and by_code indexes
rack, device, model, placement can be found by ID/code
```

---

## 14. Milestone 3 — ValidationEngine

### Goal

Implement repository validation.

### Scope

```text
ris-validation:
  - ValidationIssue
  - ValidationEngine
  - general validators
  - repository validators
  - location validators
  - rack validators
  - model validators
  - device validators
  - placement validators
```

### Completion criteria

```text
valid-repository passes without ERROR
invalid-repository returns expected ERROR/WARNING/INFO
validator detects placement collisions
validator detects placement outside rack
validator detects duplicate code
```

---

## 15. Milestone 4 — CSV import preview

### Goal

Implement CSV import validation and preview.

### Scope

```text
ris-import:
  - CsvReader
  - CsvDeviceImportValidator
  - CsvImportPreview
  - support columns:
    code
    device_type
    name
    device_model_code
    serial_number
    asset_tag
    external_ref
    status
    tags
```

### Completion criteria

```text
valid CSV gives preview without ERROR
invalid CSV returns correct ValidationIssue
device_model_code maps to device_model_id
device_type is required
import does not write data without confirmation
```

---

## 16. Milestone 5 — YAML writer

### Goal

Write modified data to YAML in stable format.

### Scope

```text
ris-repository:
  - RepositoryWriter
  - write devices
  - write placements
  - write racks
  - stable field order
  - avoid unnecessary file rewrites
```

### Completion criteria

```text
added Device is saved to correct file
added Placement is saved to correct rack file
YAML format is stable
round-trip test load -> write -> load passes
```

---

## 17. Milestone 6 — Application Layer

### Goal

Implement use cases.

### Scope

```text
ris-application:
  - OpenRepository
  - ValidateRepository
  - AddLocation
  - AddRack
  - AddDeviceModel
  - AddDevice
  - ImportDevicesFromCsv
  - PlaceDevice
  - PlaceRackObject
  - MovePlacementWithinSide
  - RemovePlacement
  - SaveRepository
```

### Completion criteria

```text
operations work on example repository
invalid operations return readable errors
RepositoryIndex refreshes after operations
integration tests pass
```

---

## 18. Milestone 7 — Minimal Tauri shell

### Goal

Run Tauri application and connect React with Rust.

### Scope

```text
apps/desktop:
  - Tauri app
  - React app
  - basic layout
  - open_repository command
  - validate_repository command
  - screen showing repository status
```

### Completion criteria

```text
desktop app starts
frontend calls backend
example-repository can be selected
UI shows number of locations, racks, devices and errors
```

---

## 19. Milestone 8 — Validation screen

### Goal

Build validation screen.

### Scope

```text
- ValidationIssue list
- ERROR/WARNING/INFO filtering
- problem count summary
- rerun validation
```

### Completion criteria

```text
user can see validation issues
user can filter by level
ERROR blocks publishing
```

---

## 20. Milestone 9 — Locations and rack list

### Goal

Build location and rack list screens.

### Scope

```text
- LocationsScreen
- LocationDetailsScreen
- locations table
- racks table
- add location
- add rack
```

### Completion criteria

```text
locations can be viewed
racks in location can be viewed
location can be added
rack can be added
empty placement file is created for new rack
```

---

## 21. Milestone 10 — Rack view without drag and drop

### Goal

Display rack and placements.

### Scope

```text
- RackViewScreen
- Front / Rear switch
- U view from top to bottom
- show placements
- unplaced devices panel
- rack objects panel
- placement details panel
```

### Completion criteria

```text
rack-a01 shows front and rear placements
side can be switched
unplaced devices are visible
rack objects are visible
```

---

## 22. Milestone 11 — Rack drag and drop

### Goal

Implement basic placement operations through UI.

### Scope

```text
- drag device to U
- drag rack object to U
- move placement within same side
- remove placement
- backend collision validation
- refresh rack view after operation
```

### Completion criteria

```text
device can be placed in rack
rack object can be added
placement can be moved
item cannot be placed on collision
item cannot exceed rack height
```

---

## 23. Milestone 12 — Device catalog and CSV import UI

### Goal

Build device catalog and CSV import screen.

### Scope

```text
- DevicesScreen
- devices table
- filters
- search
- add device
- CsvImportScreen
- import preview
- confirm import
```

### Completion criteria

```text
devices can be viewed
devices can be filtered
valid CSV can be imported
CSV with errors blocks import
imported devices are saved to YAML
```

---

## 24. Milestone 13 — Device models catalog

### Goal

Build device models catalog.

### Scope

```text
- DeviceModelsScreen
- device_type tabs/categories
- add model
- edit model
- rack_object handling
```

### Completion criteria

```text
models can be viewed
model can be added
rack_object appears in Rack objects panel
```

---

## 25. Milestone 14 — Git workflow MVP

### Goal

Add basic Git handling.

### Scope

```text
ris-git:
  - status
  - pull
  - commit
  - push
  - history
  - conflict branch

UI:
  - RepositoryScreen
  - HistoryScreen
```

### Completion criteria

```text
change status can be viewed
local save works
changes can be published
publishing is blocked by ERROR
history shows commits
conflict creates conflict branch
```

---

## 26. MVP completion criteria

MVP is complete when:

```text
1. Application opens data repository.
2. Application validates repository.
3. Application shows locations and racks.
4. Application shows rack view front/rear.
5. Application shows devices and device models.
6. Application imports devices from CSV.
7. Application allows placing devices in rack.
8. Application allows adding rack objects to rack.
9. Application detects collisions and placements outside rack.
10. Application writes YAML.
11. Application supports basic Git workflow.
12. Documentation v0.1 is in repository.
```

---

## 27. Scope boundaries

### Before v1.0.0 (MVP+ / Beta phase)

Items planned for the MVP+ phase, required before the v1.0.0 release:

```text
- safe publish workflow / better Git UX,
- create new repository wizard,
- native CSV file picker,
- minimal global search,
- Claude Design / UX audit and design direction,
- drag-and-drop placement,
- UI polish based on design direction,
- UI automation / Playwright smoke tests,
- release hardening,
- packaging and user-facing release documentation.
```

### After v1.0.0

Not planned before v1.0.0:

```text
- full plugin system,
- CMDB integration,
- NetBox/Nautobot/Zabbix integrations,
- physical audit,
- placement import,
- device model import,
- PDF export,
- domain-level change diff,
- advanced Git conflict resolution UI,
- merge request workflow,
- automatic Git conflict resolution,
- advanced reports / export formats,
- application permissions independent from Git,
- large enterprise workflows.
```

---

## 28. Implementation recommendation

Most important recommendation:

> Start with core, not UI.

Initial work order:

```text
1. Bootstrap monorepo.
2. ris-core.
3. ris-repository.
4. ris-validation.
5. ris-import.
6. ris-application.
7. Minimal Tauri shell.
8. RackView UI.
```

This gives the project a stable foundation and makes it easier to test.

---

## 29. Roadmap adjustment after rack workflow milestones

### Context

After milestones 1–25, the backend is complete and the rack placement workflow is usable through form-based UI. This section records the roadmap adjustment made at that point.

### Completed or substantially complete areas

```text
- Tauri + React + TypeScript + Rust monorepo structure
- ris-core: domain models, enums, placement range logic
- ris-repository: YAML loader, writer, RepositoryIndex
- ris-validation: 36 VAL-* rules, ValidationEngine
- ris-import: CSV preview (no write UI yet)
- ris-application: session, open, save, validate,
    add location/rack/device model/device,
    place_device, place_rack_object,
    move_placement (same-rack, cross-side, cross-rack),
    remove_placement
- Tauri commands: open, save, validate, close, list entities,
    get_rack_detail, add_placement, move_placement, remove_placement
- Desktop UI: open repo, summary, validation, locations,
    racks list with Front/Rear/Total counts,
    rack detail + unit diagram, placement inspector,
    add/move/remove placement via forms,
    cross-rack auto-navigation, unsaved changes banner
- CI: GitHub Actions, Rust workspace tests, frontend checks
- Toolchain: pnpm 10, Node 22 LTS
```

### Drag and drop decision

Drag and drop is **not required for MVP Core** but is **planned for MVP+ / Beta before v1.0.0**.

Rationale:

```text
- users can already add, move, and remove placements via forms,
- backend validates placement operations (collisions, rack height),
- YAML can be saved,
- rack view is usable without drag and drop.

Form-based placement operations satisfy MVP Core correctness requirements.
Drag and drop is a UX enhancement planned for the MVP+ phase as part of the
Claude Design / UX direction milestone, before the v1.0.0 user-facing release.
```

### Remaining MVP blockers

```text
1. Add/Edit UI for core entities:
   - add location, add rack
   - add device model
   - add device

2. CSV import confirm/write UI:
   - preview engine exists (ris-import),
   - confirmation step and write flow are not built.

3. Validation navigation / problem drill-down:
   - issues are displayed,
   - "Go to rack" / "Go to device" navigation is not built.

4. Git workflow:
   - ris-git is a stub,
   - status, pull, publish/commit/push, conflict branch are not implemented.

5. MVP smoke-test checklist and documentation alignment.
```

### Revised milestone order

```text
M26  Add Location / Rack UI foundation
M27  Add Device Model UI foundation
M28  Add Device UI foundation
M29  CSV import preview UI
M30  CSV import confirm/write
M31  Validation navigation / problem drill-down
M32  Save/dirty state hardening (if still needed)
M33  Git status foundation
M34  Git publish MVP
M35  Pull / conflict branch MVP
M36  MVP documentation sync
M37  MVP smoke test / example repository polish
```

MVP+ / Beta (before v1.0.0):

```text
- safe publish workflow / better Git UX
- create new repository wizard
- native CSV file picker
- minimal global search
- Claude Design / UX audit and design direction
- drag and drop in rack view
- UI polish based on design direction
- UI automation / Playwright smoke tests
- release hardening
- packaging and user-facing release documentation
```

After v1.0.0:

```text
- domain-level change diff
- merge request workflow
- advanced Git conflict resolution UI
- full CMDB/IPAM/NetBox integrations
- PDF/CSV export
- physical audit
- plugin system
- application-level permissions
- large enterprise workflows
```

---

## 30. Revised roadmap: MVP Core → v1.0.0

### Context

As of milestone M35, MVP Core is functionally complete. The application covers the full inventory workflow end-to-end. This section records the roadmap revision toward a user-facing v1.0.0 release.

### Roadmap stages

#### Stage 1 — MVP Core (complete)

```text
Milestones M0–M35.

Backend:
  ris-core, ris-repository, ris-validation, ris-import, ris-git, ris-application
  275 Rust tests passing.

Desktop UI:
  Open/close repository, summary, validation, locations, racks, devices,
  device models, CSV import (textarea-based), rack detail with unit diagram,
  placement inspector (add/move/remove), edit/delete for all entity types,
  Git workflow (init, status, commit, log, remotes, push, pull).

CI:
  GitHub Actions, Rust workspace tests, frontend typecheck/test/build.
```

#### Stage 2 — MVP+ / Beta (current — before v1.0.0)

Goal: bring the app to a quality level suitable for a user-facing release.
No single blocker — this is a set of parallel improvements.

```text
M38  Safe publish workflow / better Git UX
       - clearer publish/pull state, credential error guidance,
       - explicit "publish requires clean validation" confirmation.

M39  Create new repository wizard
       - guided flow to init a Git repository and create the YAML directory
         structure inside the app.

M40  Native CSV file picker
       - replace the textarea with a native OS file picker.

M41  Minimal global search
       - single search input covering devices, racks, locations, device models.

M42  Claude Design / UX audit
       - UX audit of current screens against documented workflows,
       - screenshot and friction-point collection,
       - design direction for: app shell, rack detail, validation/publish flow,
         CSV import, catalog panels,
       - output: a set of small, testable implementation milestones.
       - Constraint: design changes must not mix with backend logic changes.
         Redesign milestones are isolated from correctness milestones.

M43  Drag-and-drop placement
       - drag device from unplaced panel to a U row in the rack diagram,
       - drag rack object similarly,
       - backend collision validation unchanged.

M44  UI polish (based on M42 design direction)
       - apply design decisions from M42 incrementally.

M45  UI automation / Playwright smoke tests
       - automate the manual smoke checklist from docs/MVP_SMOKE_TEST_CHECKLIST_EN.md,
       - cover the golden path: open → add → import → place → validate → save → reload.
```

#### Stage 3 — v1.0.0 Candidate

```text
- All MVP+ milestones (M38–M45) complete.
- Release hardening: dependency audit, error message review, known-limitation docs.
- Packaging check: app bundles and launches from a clean install on target OS.
- All test gates pass (Rust, frontend, Playwright, manual checklist).
```

#### Stage 4 — v1.0.0 Release

```text
- User-facing release documentation:
    - basic workflow guide,
    - Git auth assumptions (SSH keys / HTTPS credential helper),
    - CSV import instructions,
    - create new repository walkthrough,
    - placement workflow,
    - known limitations.
- Version tag and changelog entry.
```

### v1.0.0 definition

v1.0.0 is the first release a new user can install and use without developer guidance. It is not just a technical milestone — it requires polished UX, a guided repository creation flow, a usable Git publish experience, and documented limitations.

### Claude Design principles

The Claude Design / UX audit phase (M42) is not a chaotic redesign. Rules:

```text
1. Audit before designing — identify real friction from real workflows.
2. Design is output of the audit — do not design without data.
3. Small milestones — no "redesign everything in one PR".
4. Keep the test suite green — every design milestone ships with passing tests.
5. No backend mixing — redesign PRs do not touch Rust logic.
6. Known limitations documented — not hidden behind cosmetic polish.
```
