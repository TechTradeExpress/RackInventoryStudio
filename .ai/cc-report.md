# CC Report — PR J: Atomic YAML writes and contain writer paths (DATA-01, SEC-02)

## Summary

PR J implements two hardening items for `ris-repository`, then addresses two
review-requested fixes to the initial implementation:

**DATA-01 — Atomic YAML writes**: Replaced `std::fs::write` with a
`NamedTempFile`-based strategy. Each write creates a temp file in the same
directory, flushes, calls `sync_all`, then renames over the target. A hard crash
mid-write may leave a temp file (auto-cleaned by `NamedTempFile`'s Drop), but
the final YAML file is never left truncated or partially written.

**SEC-02 — Writer path containment** (initial + review fixes):

*Initial*: `safe_inventory_join` rejects `..` components, absolute paths, and
Windows drive/UNC prefixes (via `Component::Prefix` on Windows). The parent
directory is verified via canonicalization if it exists. `write_repository`
uses a `checked_write` closure that routes every path through this guard.

*Review fix 1 — Symlink ancestor escape*: The initial check only canonicalized
the parent if it already existed. If `inventory/link` is a symlink to
`/tmp/outside` and the target subdir does not yet exist, the check was skipped.
Fix: walk up from the immediate parent to the nearest existing ancestor,
canonicalize it, and verify it falls within the canonical inventory root.
Additionally, `checked_write` now creates the parent directory eagerly and
re-canonicalizes it after creation (TOCTOU defence-in-depth).

*Review fix 2 — Cross-platform Windows-drive and UNC rejection*: On Unix, Rust's
path parser treats backslash as a filename character and `C:` as a Normal
component, so `Component::Prefix` never fires. A new string-level check rejects
any path whose raw string starts with an ASCII letter + `:` (Windows drive) or
`\\` (UNC backslash). These forms are now rejected on all platforms.

## Files changed

| File | Change |
|---|---|
| `crates/ris-repository/Cargo.toml` | Promote `tempfile` from dev-dep to dep |
| `crates/ris-repository/src/writer.rs` | `atomic_replace`, `safe_inventory_join` (with symlink-ancestor walk + cross-platform path checks), post-`create_dir_all` re-canonicalize in `checked_write`, 10 unit tests |
| `crates/ris-repository/tests/writer_tests.rs` | 19 integration tests (atomic writes, containment, symlink escape) |
| `docs/BETA1_FOLLOWUP_PLAN_EN.md` | PR J entry, Section 14, DATA-01/SEC-02 marked ✅ in backlog |

## Tests

```
cargo test -p ris-repository
```
- 10 unit tests (`containment_tests`) — all pass
- 50 integration tests (`writer_tests.rs`) — all pass
- 19 integration tests (other integration file) — all pass

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

```
node scripts/check-repo-hygiene.mjs
```
All 8 hygiene checks passed.

## Risks

- **`tempfile` promoted to production dependency**: Required for `NamedTempFile`
  in `atomic_replace`. Mature, widely-used crate with no known security concerns.
- **Hard crash may leave temp files**: A hard crash (SIGKILL, power loss) can
  prevent `NamedTempFile::drop` from running. The temp file is left in the same
  directory as the target. It is not a YAML file (no `.yaml` extension) and does
  not replace the original. On next startup the user can delete it manually.
  The original YAML file is never truncated.
- **Non-existent parent directories**: When a path's parent doesn't yet exist,
  only the component-level check applies (no ancestor to canonicalize). All new
  directories are created by our code via `create_dir_all` within the verified
  `inv_c` root; the post-`create_dir_all` re-canonicalization then confirms they
  stayed inside.
- **Windows-style paths on non-Windows**: `C:relative` without a following
  separator is also caught by the `letter + colon` string check, which is
  intentionally conservative.
- **TOCTOU**: The post-`create_dir_all` re-canonicalization in `checked_write`
  defends against a symlink being swapped in between the pre-creation check and
  the actual write. A sophisticated adversary with filesystem write access could
  still win the race; the primary line of defence is `safe_inventory_join`'s
  pre-check.

## Not done

- SEC-03 (diagnostics redaction) — separate item, not in scope
- Dependency audit — separate item, not in scope
- `serde_yaml` migration — separate item, not in scope
- No changes to the Git layer or Tauri commands

## Suggested next step

Attach the generated review context to ChatGPT for sign-off before merging PR #98.
