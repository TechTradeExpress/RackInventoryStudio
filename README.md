# Rack Inventory Studio

Rack Inventory Studio is an offline-first desktop application for documenting physical device placement in rack cabinets.

## MVP stack

```text
Tauri + React + TypeScript + Rust
```

## Repository layout

```text
apps/
  desktop/        Tauri + React desktop application

crates/
  ris-core/       Domain models and domain logic
  ris-repository/ YAML repository loader/writer and RepositoryIndex
  ris-validation/ ValidationEngine and validators
  ris-import/     CSV import
  ris-git/        Git adapter
  ris-application/Application use cases

docs/             Project documentation
examples/         Example inventory repositories
tests/            Fixtures and integration tests
```

## Current status

This package is a coding starter structure. It intentionally contains project scaffolding and documentation, not a finished implementation.
