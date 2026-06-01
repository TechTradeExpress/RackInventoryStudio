# CC Report — PR N: Migrate serde_yaml to serde_yml

## Summary

PR N removes the deprecated/unmaintained `serde_yaml 0.9` crate (RUSTSEC-2024-0320)
from the workspace dependency graph and replaces it with `serde_yml 0.0.13`.
`serde_yml 0.0.13` is a compatibility shim backed by `noyalib 0.0.5`, a pure-Rust
(`#![forbid(unsafe_code)]`) YAML library. `unsafe-libyaml` (the C-FFI YAML parser
that was pulled in by `serde_yaml 0.9`) is no longer in the dependency graph.

## Dependency before and after

| Crate | Before | After |
|---|---|---|
| `serde_yaml` | 0.9.34+deprecated | removed |
| `unsafe-libyaml` | 0.2.11 (transitive) | removed |
| `serde_yml` | — | 0.0.13 (new) |
| `noyalib` | — | 0.0.5 (transitive via serde_yml) |

## Crates affected

- `crates/ris-repository` — YAML load and write
- `crates/ris-application` — repository creation (repo.yaml scaffold)

## Files changed

| File | Change |
|---|---|
| `crates/ris-repository/Cargo.toml` | `serde_yaml = "0.9"` → `serde_yml = "0.0.13"` |
| `crates/ris-application/Cargo.toml` | `serde_yaml = "0.9"` → `serde_yml = "0.0.13"` |
| `crates/ris-repository/src/error.rs` | `serde_yaml::Error` → `serde_yml::Error` |
| `crates/ris-repository/src/loader.rs` | `serde_yaml::` → `serde_yml::`; `+ 'static` on `T` in `read_yaml`, `read_yaml_glob` |
| `crates/ris-repository/src/raw_loader.rs` | All `serde_yaml::` → `serde_yml::`; `+ 'static` on `T` in `read_yaml`, `read_yaml_dir` |
| `crates/ris-repository/src/writer.rs` | `serde_yaml::Error` and `serde_yaml::to_string` → `serde_yml::` |
| `crates/ris-application/src/create.rs` | `serde_yaml::to_string` → `serde_yml::to_string` |
| `Cargo.lock` | `serde_yaml 0.9` + `unsafe-libyaml` removed; `serde_yml 0.0.13` + `noyalib 0.0.5` added |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | PR N row added; `serde_yaml` migration item removed from "can wait" list; Section 18 added |
| `.ai/cc-report.md` | This file |

## Exact YAML call sites migrated

### `ris-repository`

| File | Call site |
|---|---|
| `src/error.rs:14` | `source: serde_yaml::Error` |
| `src/loader.rs:24` | `serde_yaml::from_str(&text)` |
| `src/raw_loader.rs:123` | `match serde_yaml::from_str(&text)` |
| `src/raw_loader.rs:15,36,50,51,65,66,84,105,106,107` | `Option<serde_yaml::Value>` fields in DTOs |
| `src/raw_loader.rs:160–202` | `serde_yaml::Value::String`, `::Number`, `::Sequence` pattern matches |
| `src/writer.rs:22` | `Yaml(#[from] serde_yaml::Error)` |
| `src/writer.rs:369` | `serde_yaml::to_string(value)` |

### `ris-application`

| File | Call site |
|---|---|
| `src/create.rs:155` | `serde_yaml::to_string(&RepoYaml { … })` |

## API difference and adaptation

`serde_yml::from_str` (backed by `noyalib`) requires `T: 'static`. `serde_yaml 0.9` did not.

All DTOs used in the YAML load path are owned structs with no borrowed fields, so
`+ 'static` was added to the internal generic bounds on:
- `read_yaml<T>` in `loader.rs` and `raw_loader.rs`
- `read_yaml_glob<T>` in `loader.rs`
- `read_yaml_dir<T>` in `raw_loader.rs`

No semantic change — all concrete types that are passed for `T` are `'static`.

**`serde_yml::Value`** variants used (`String`, `Number`, `Sequence`) are identical in
`serde_yml 0.0.13` / `noyalib::compat::serde_yaml::Value`. No match arm changes needed.

## Output format notes

`serde_yml 0.0.13` (backed by `noyalib`) produces YAML output that passes all existing
format-sensitive tests:
- `generated_yaml_has_no_null_optional_fields` — no `null` values emitted for `Option`
  fields annotated with `#[serde(skip_serializing_if = "Option::is_none")]`
- `generated_yaml_has_stable_field_order_across_two_writes` — struct field order preserved
- `repo_yaml_field_order_is_format_version_repository` — `format:` before `version:` before `repository:`
- `second_write_reports_all_unchanged` — byte-for-byte stable output on second write

## Compatibility testing performed

- All 50 `ris-repository` tests pass (round-trip, stability, null-field, field-order,
  containment, load/write basics)
- All 28 `ris-application` tests pass (create, example-repo, MVP smoke, search)
- Full workspace (`cargo test --workspace`): all pass, 0 failures
- Existing YAML fixture files load without error under `serde_yml`
- Round-trip: load → write → load → compare counts/IDs all match

## Error messages

The error message format from `serde_yml::Error` / `noyalib` is functionally equivalent
to `serde_yaml 0.9`. The `LoadError::Yaml` variant wraps the error as `{source}` via
`thiserror`, so any wording change in the underlying library's Display impl flows through
transparently. No tests assert on exact YAML error message strings; no user-facing changes.

## Audit results

- `cargo audit` — not installed locally. CI `Rust dependency audit` job verifies.
  `serde_yaml 0.9` (RUSTSEC-2024-0320) is no longer in the dependency graph, so the
  advisory is expected to resolve.
- `pnpm audit --audit-level moderate` — no frontend changes; result unchanged from PR M
  (No known vulnerabilities found).

## Tests

```
cargo fmt --all --check
```
Clean.

```
git diff --check
```
Clean.

```
node scripts/check-version-consistency.mjs
```
Pass — 0.1.0-beta.1 consistent.

```
node --test scripts/*.test.mjs
```
17/17 pass.

```
node scripts/check-repo-hygiene.mjs
```
All 8 checks pass.

```
cargo check --workspace
```
Pass.

```
cargo test --workspace
```
All pass, 0 failures.

```
cargo clippy --workspace -- -D warnings
```
Clean.

```
npx tsc --noEmit
```
No type errors.

```
npx vitest run
```
42 test files, 539 tests — all pass (no frontend changes; unaffected by this PR).

## Risks

- **`serde_yml 0.0.13` is itself a deprecated shim**: The crate documentation notes that
  `serde_yml 0.0.13` is a "thin compatibility shim" and recommends migrating to `noyalib`
  directly. However: (a) it removes the security concern (`serde_yaml 0.9` / `unsafe-libyaml`),
  (b) all tests pass, (c) there are no active RUSTSEC advisories against `serde_yml 0.0.13`,
  (d) it is a thin re-export layer with no additional risk surface. A follow-up PR can
  migrate to `noyalib` directly using `use noyalib::compat::serde_yaml as serde_yaml_compat`.
- **`+ 'static` bound propagation**: The added `'static` bounds are correct and match the
  concrete types used at all call sites. They are compiler-enforced.

## Not done

- TEST-01 smoke test (gate before beta release checklist, not a PR)
- CSP hardening
- GitHub Actions SHA pinning
- Askpass constant-time comparison
- Direct migration to `noyalib` (separate future PR if desired)

## Remaining items before beta release

1. **TEST-01** — manual smoke test (before release checklist, not a PR).
2. Post-beta.2: CSP hardening, GitHub Actions SHA pinning, askpass CT comparison.

## Suggested next step

Generate review context and attach to ChatGPT for sign-off before merging PR N.
