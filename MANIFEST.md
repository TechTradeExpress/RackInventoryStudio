# Rack Inventory Studio — Coding Starter Pack v0.1

## Contents

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

## Next implementation step

Start with:

```text
1. cargo check
2. pnpm install
3. implement ris-core domain models
4. implement ris-repository YAML loader
5. implement ris-validation ValidationEngine
```
