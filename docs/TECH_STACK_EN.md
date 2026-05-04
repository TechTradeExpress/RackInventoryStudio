# Rack Inventory Studio — Technology Stack v0.1

## 1. Decision

For the **Rack Inventory Studio** MVP, the accepted stack is:

```text
Desktop shell:
  Tauri

Frontend:
  React
  TypeScript

Application backend / core:
  Rust

Data format:
  YAML

Synchronization:
  Git

Import:
  CSV
```

## 2. Why Tauri

Tauri fits the project because the application is desktop, offline-first, works on local files, uses Git, and should have a lightweight desktop wrapper.

Tauri allows combining a web frontend with a Rust backend responsible for domain logic, validation, import, YAML writing, and Git operations.

## 3. Why React

React was chosen as the MVP frontend because it supports:

- component-based UI,
- tables,
- forms,
- side panels,
- filtering,
- search,
- drag and drop,
- fast prototyping,
- TypeScript,
- large ecosystem.

The most important screen, the rack view, requires interactive drag and drop UI. React is a safe ecosystem choice for this type of interface.

## 4. Responsibility split

### React frontend

Frontend is responsible for:

```text
- application screens,
- navigation,
- tables,
- forms,
- rack view,
- drag and drop,
- validation issue presentation,
- CSV import preview,
- communication with Tauri backend.
```

Frontend should not be the source of truth for:

```text
- effective_height_u,
- repository validation,
- reference resolution,
- YAML writing,
- Git commands.
```

### Rust / Tauri backend

Backend is responsible for:

```text
- loading repository,
- parsing YAML,
- writing YAML,
- building RepositoryIndex,
- validation,
- CSV import,
- domain operations,
- Git operations,
- conflict branch creation,
- filesystem access.
```

## 5. Proposed directory split

```text
src-tauri/
  src/
    domain/
    repository/
    validation/
    import/
    git/
    application/
    commands/

src/
  app/
  components/
  screens/
  features/
  hooks/
  api/
  types/
```

## 6. Rust backend modules

```text
domain:
  models and domain logic

repository:
  YAML loader/writer, directory structure, RepositoryIndex

validation:
  ValidationEngine and validators

import:
  CSV reader, preview, importer

git:
  GitService, status, history, commit, push, conflict branch

application:
  use cases

commands:
  Tauri commands called by frontend
```

## 7. React frontend modules

```text
app:
  routing, layout, app configuration

components:
  shared UI components

screens:
  main screens

features:
  functional modules

api:
  Tauri command communication

types:
  TypeScript types
```

## 8. Frontend-backend communication

Example:

```text
React UI
  -> api.validateRepository()
    -> Tauri command validate_repository
      -> Rust Application Layer
        -> ValidationEngine
          -> ValidationIssue[]
```

Frontend should not know YAML path details or Git implementation details.

## 9. Drag and drop

React drag and drop should call Application Layer operations:

```text
PlaceDevice
PlaceRackObject
MovePlacementWithinSide
RemovePlacement
```

Frontend may calculate helper previews, but final validation must be performed by the backend.

## 10. Minimal technical prototype

The first prototype should cover backend core:

```text
1. Load example YAML repository.
2. Build RepositoryIndex.
3. Run ValidationEngine.
4. Calculate effective_height_u.
5. Detect collisions.
6. Validate CSV.
7. Import CSV into data model.
8. Write YAML.
```

## 11. Final decision

Approved MVP stack:

```text
Tauri + React + TypeScript + Rust
```

Source of truth:

```text
YAML files in Git repository
```

Strategy:

```text
React handles UI.
Rust handles core, validation, import, storage, and Git.
Tauri connects frontend with backend and provides desktop shell.
```
