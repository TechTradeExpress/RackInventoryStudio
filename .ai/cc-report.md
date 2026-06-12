## Summary

Changed the "Create repository" wizard so the user selects a **parent directory**
instead of the final repository directory. The repository is now created inside
`<parent_directory>/<code>`. If the target path already exists the operation is
rejected with a clear error.

PR #115 (beta.2 blockers) is already merged. This is a new PR on
`fix/repository-create-parent-directory-flow`.

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/src/dto.rs` | `CreateRepositoryInputDto.path` → `parent_path` |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Compute `final_path = parent_path.join(code)`; add existence check |
| `apps/desktop/src/api/tauriClient.ts` | `CreateRepositoryInput.path` → `parent_path`; dialog title → "Choose parent directory" |
| `apps/desktop/src/features/repository/wizardHelpers.ts` | `path` → `parentPath` in state/errors; add `computePreviewPath` helper |
| `apps/desktop/src/features/repository/CreateRepositoryWizard.tsx` | "Directory" → "Parent directory"; add path preview; send `parent_path` |
| `apps/desktop/src/features/repository/wizardHelpers.test.ts` | Update fixture field name; add `computePreviewPath` tests |
| `apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx` | Update placeholder/field assertions; add preview tests |
| `docs/BETA1_SMOKE_TEST_EN.md` | Update section 6.11 for parent directory flow |
| `CHANGELOG.md` | Add Fixed entry for parent directory flow |

## Tests

| Check | Result |
|---|---|
| `cargo fmt --all -- --check` | clean |
| `cargo clippy --workspace -- -D warnings` | clean |
| `cargo test --workspace` | 0 failures |
| `tsc --noEmit` | clean |
| Vitest (`apps/desktop`) | 559 tests pass (43 files) |
| `node --test scripts/*.test.mjs` | 19 pass |

## Risks

- **Windows path separator**: `computePreviewPath` uses `\` when parent path contains `\`,
  otherwise `/`. This is display-only; the OS resolves the actual path at creation time.
- **Existing-dir check is TOCTOU**: `final_path.exists()` check and `create_dir_all` are not
  atomic, but this is acceptable for an interactive wizard — the window between check and
  creation is negligible in normal use.
- **`cargo test` runs no integration tests**: Rust crate tests are empty; correctness of
  `final_path` composition depends on the Vitest + manual smoke tests.

## Not done

- No change to the `RepositorySummaryDto.repo_path` field — it continues to return
  the final repository path (which now equals `parent_path/code`).

## Suggested next step

Push branch, open PR `fix(repository): create new repositories inside selected parent directory`,
run Windows manual smoke test section 6.11, then merge.
