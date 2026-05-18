# Rack Inventory Studio — Coding Starter Pack v0.1

> **Archival document.** This file was the initial coding starter pack used to bootstrap the project.
> For current repository contents and status, see [README.md](README.md) and [CHANGELOG.md](CHANGELOG.md).

## Contents (at project creation)

```text
README.md
LICENSE
CHANGELOG.md
Cargo.toml
package.json
pnpm-workspace.yaml

apps/
  desktop/
    Tauri + React + TypeScript application skeleton

crates/
  ris-core/
  ris-repository/
  ris-validation/
  ris-import/
  ris-git/
  ris-application/

docs/
  project documentation in PL and EN

examples/
  example-repository/

tests/
  fixtures/
```

## Accepted technical decisions

```text
Stack:
  Tauri + React + TypeScript + Rust

Repository structure:
  lightweight monorepo

Data source:
  YAML files in Git repository
```
