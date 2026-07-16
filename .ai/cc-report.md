## Summary

Fix Rust Clippy `manual_filter` lint in `crates/ris-import/src/csv_reader.rs`.

Branch: `fix/rust-clippy-manual-filter` → base: `roadmap/e2e-wdio`

This is an independent CI fix on the integration branch — not part of Stage 3A.
Aktualna wersja stable Clippy zgłasza `clippy::manual_filter` dla trzech istniejących
wcześniej konstrukcji w `csv_reader.rs`. Ponieważ CI korzysta z pływającego toolchainu
stable, wcześniej akceptowany kod zaczął powodować błąd bez zmiany samego pliku.
The affected code was already present on `roadmap/e2e-wdio` before Stage 3A work began.

## Root cause

`cargo clippy --workspace -- -D warnings` reports `clippy::manual_filter` for:

```rust
.and_then(|v| if v.is_empty() { None } else { Some(v) })
```

The current stable Clippy reports `clippy::manual_filter` for three existing closures
in `csv_reader.rs`. CI uses a floating stable Rust toolchain, so previously accepted
code began failing without a change to this file.

The idiomatic replacement is `Option::filter` (available since Rust 1.27.0).
The change is semantically equivalent.

## Files changed

| File | Change |
|---|---|
| `crates/ris-import/src/csv_reader.rs` | Replace 3 × `and_then(|v| if v.is_empty() { None } else { Some(v) })` with `.filter(|v| !v.is_empty())` — only production code change |
| `.ai/cc-report.md` | Review report for this PR |

## Occurrences fixed (3 total)

| Location | Context |
|---|---|
| Line 69 (Device Model CSV parser) | `tags` field after `.map(|v| v.trim().to_string())` |
| Line 134 (`get_field` helper) | general field extractor used by all non-tags fields |
| Line 171 (Device CSV parser) | `tags` field after `.map(|v| v.trim().to_string())` |

## Semantic preservation

The transformation `and_then(|v| if v.is_empty() { None } else { Some(v) })`
→ `.filter(|v| !v.is_empty())` is equivalent for `Option<String>`:

1. Column absent → `None` propagates through `filter` unchanged ✓
2. Column present, value empty string → `filter` returns `None` ✓
3. Column present, value whitespace-only → trimmed to `""` → `filter` returns `None` ✓
4. Column present, non-empty value after trim → `filter` returns `Some(String)` ✓
5. Device CSV and Device Model CSV semantics unchanged ✓

## Tests

```
cargo fmt --all --check          → clean (0 errors)
cargo test --workspace           → 122 passed (src-tauri) + all workspace crates
cargo clippy --workspace -- -D warnings  → clean (0 errors, 0 warnings)
cargo check --workspace          → clean
```

`csv-import` related tests confirmed passing:
- `csv_preview_duplicate_serial_returns_error` ✓
- `import_devices_csv_rejects_error_row` ✓
- `sample_csv_parses_without_errors_via_importer` ✓

## Scope confirmation

```
git diff roadmap/e2e-wdio...HEAD --name-status
M .ai/cc-report.md
M crates/ris-import/src/csv_reader.rs
```

The only production code change is `crates/ris-import/src/csv_reader.rs`.
`.ai/cc-report.md` is the review report for this PR.

Not changed:
- Cargo.toml / Cargo.lock ✓
- Rust toolchain ✓
- GitHub Actions workflows ✓
- Dependencies ✓
- TypeScript / WDIO specs ✓
- Stage 3A documentation ✓
- Application version ✓
- No `#[allow(clippy::manual_filter)]` added ✓

## Effect

Unblocks Rust workspace CI job for all PRs targeting `roadmap/e2e-wdio`,
including PR #147 (`feature/e2e-wdio-placement-lifecycle`).

## Risks

Risks are minimal. The change is a direct semantic refactor from manual Option
filtering to `Option::filter`. Existing workspace tests and CI pass. The remaining
integration risk is limited to compatibility with the project's supported Rust
toolchain. The replacement uses `Option::filter`, available since Rust 1.27.0.
The repository does not currently document an explicit MSRV.

## Not done

- Stage 3B work (separate initiative)
- Toolchain pinning (not required; not in scope)

## Suggested next step

After merge: update `feature/e2e-wdio-placement-lifecycle` from `roadmap/e2e-wdio`,
re-run CI for PR #147, confirm Rust workspace green, update cc-report and generate
final Stage 3A review context.
