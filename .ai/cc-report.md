# CC Report — PR J: Atomic YAML writes and writer path containment (DATA-01, SEC-02)

## Summary

PR J implements two hardening items for `ris-repository`:

**DATA-01 — Atomic YAML writes**: Replaced `std::fs::write` with a write-to-temp-then-rename
strategy using `tempfile::NamedTempFile`. Each write: creates a `NamedTempFile` in the same
directory as the target, writes, flushes, calls `sync_all`, then calls `persist()` (which uses
`rename(2)` on Unix and `MoveFileExW(MOVEFILE_REPLACE_EXISTING)` on Windows). A crash mid-write
leaves an auto-deleted temp file, never a truncated YAML file.

**SEC-02 — Writer path containment**: Added `safe_inventory_join` which inspects every path
component for `..`, absolute roots, and Windows drive prefixes, then canonicalizes the parent
directory (if it exists) and verifies it falls within the canonical inventory root. All `PathBuf`
construction in `write_repository` now routes through this guard. A tampered `RepositoryLayout`
loaded from disk cannot escape the inventory directory.

## Files changed

| File | Change |
|---|---|
| `crates/ris-repository/Cargo.toml` | Moved `tempfile = "3"` from `[dev-dependencies]` to `[dependencies]` |
| `crates/ris-repository/src/writer.rs` | Added `atomic_replace`, `safe_inventory_join`, `WriteError::PathTraversal`; updated `write_if_changed` and `write_repository`; 8 new unit tests in `containment_tests` |
| `crates/ris-repository/tests/writer_tests.rs` | 18 new integration tests (atomic writes + containment) |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | PR J entry in grouping table; Section 14 description; DATA-01 and SEC-02 marked ✅ in backlog |

## Tests

```
cargo test -p ris-repository
```
- 8 unit tests (`containment_tests`) — all pass
- 49 integration tests (`writer_tests.rs`) — all pass

```
cargo test --workspace
```
All workspace tests pass; 0 failures.

```
cargo clippy --workspace -- -D warnings
```
No warnings or errors.

```
npx tsc --noEmit
```
No type errors.

```
npx vitest run
```
42 test files, 534 tests — all pass.

## Risks

- **`tempfile` promoted to production dependency**: Required for `NamedTempFile` in `atomic_replace`.
  It is a mature, widely-used crate with no known security concerns.
- **Non-existent parent directories**: When a path's parent doesn't exist yet (new entity files
  created by `write_repository` via `create_dir_all`), canonicalization cannot be performed.
  The component-level check (no `..`, no absolute, no prefix) is sufficient: all new directories
  are created by our own code within the already-canonicalized `inv_c` root.
- **Windows drive paths on non-Windows**: `C:\temp\evil.yaml` is treated as a relative path on
  Unix (backslash is a valid filename character). The `Component::Prefix` check only fires on
  Windows. This is documented in the unit tests with platform-specific assertions.
- **`persist()` cross-filesystem**: If the temp file and target are on different filesystems,
  `persist()` falls back to copy+delete (not atomic). This is avoided by using
  `NamedTempFile::new_in(parent)` to create the temp file in the same directory as the target.

## Not done

- SEC-03 (diagnostics redaction) — separate item, not in scope
- Dependency audit — separate item, not in scope
- `serde_yaml` migration — separate item, not in scope
- No changes to the Git layer or Tauri commands

## Suggested next step

Open a PR for this branch against `master` and attach the review context to ChatGPT for
sign-off before merging.

## Final review-context handoff

After merging, generate review context with:
```bash
bash scripts/ai/build-review-context.sh master .ai/review-context-$(date +%Y%m%d-%H%M).md
```
