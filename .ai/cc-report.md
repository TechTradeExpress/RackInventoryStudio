## Summary

Changed the "Create repository" wizard so the user selects a **parent directory**
instead of the final repository directory. The repository is created inside
`<parent_directory>/<code>`. The `code` is the directory/path identifier; `name`
is a display-only label and does not affect the path.

Added strict backend validation of `code` as a safe directory name before composing
`final_path`. Frontend validation remains the first line of defence; the backend is
the authoritative security boundary.

## PR

https://github.com/TechTradeExpress/RackInventoryStudio/pull/116

## Files changed

| File | Change |
|---|---|
| `apps/desktop/src-tauri/src/dto.rs` | `CreateRepositoryInputDto.path` → `parent_path` |
| `apps/desktop/src-tauri/src/commands/repository.rs` | Add `validate_repo_code`; compute `final_path = parent_path.join(code)`; use trimmed code/name; existence check |
| `apps/desktop/src/api/tauriClient.ts` | `CreateRepositoryInput.path` → `parent_path`; dialog title → "Choose parent directory" |
| `apps/desktop/src/features/repository/wizardHelpers.ts` | `path` → `parentPath`; add `computePreviewPath`; fix trailing-separator stripping |
| `apps/desktop/src/features/repository/CreateRepositoryWizard.tsx` | "Directory" → "Parent directory"; path preview; send `parent_path` |
| `apps/desktop/src/features/repository/wizardHelpers.test.ts` | Updated + `computePreviewPath` tests incl. trailing separators |
| `apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx` | Updated placeholders/fields; added preview + no-path-in-name tests |
| `docs/BETA1_SMOKE_TEST_EN.md` | Section 6.11 updated for parent directory flow + existing-dir error |
| `CHANGELOG.md` | Fixed entry added |

## Backend `code` validation (`validate_repo_code`)

Runs before `final_path` is composed. Rejects:

| Rule | Example rejected |
|---|---|
| Empty / blank-only | `""` |
| Path separators `/` or `\` | `a/b`, `a\b`, `../repo`, `repo/` |
| Standalone `..` | `..` |
| Windows-forbidden chars `< > : " \| ? *` | `name:bad`, `name*bad` |
| Trailing dot | `repo.`, `repo..` |
| Trailing space | `repo ` |
| Windows reserved names (case-insensitive) | `CON`, `NUL`, `com1`, `LPT9` |

The error message for an existing target directory reads:
`Target directory already exists: <full final path>` — i.e. `<parent>/<code>`.

## `name` does not affect the path

`name` is a display-only label stored in `repo.yaml`. The final path is built
exclusively from `parent_path` and `code`:

```
final_path = PathBuf::from(parent_path).join(code)
```

## `computePreviewPath` trailing-separator fix

The helper strips trailing `/` or `\` from the parent before joining:

```typescript
const p = raw.replace(/[\\/]+$/, "");
```

So `/tmp/` + `repo` → `/tmp/repo` and `D:\RIS\` + `repo` → `D:\RIS\repo`.

## Version consistency

```
  package.json (workspace root)           0.1.0-beta.2
  apps/desktop/package.json               0.1.0-beta.2
  apps/desktop/src-tauri/Cargo.toml       0.1.0-beta.2
  apps/desktop/src-tauri/tauri.conf.json  0.1.0-beta.2

  ✓ All versions match: 0.1.0-beta.2
```

## Checks

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — all 4 sources |
| `node --test scripts/*.test.mjs` | 19 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
| `node scripts/smoke-beta-gate.mjs` (= `pnpm smoke:beta`) | 7/7 pass |
| `cargo fmt --all -- --check` | clean |
| `cargo check --workspace` | clean |
| `cargo test --workspace` | 0 failures (new `validate_repo_code` tests pass) |
| `cargo clippy --workspace -- -D warnings` | clean |
| `tsc --noEmit` (apps/desktop) | clean |
| Vitest (apps/desktop) | 562 tests pass, 43 files |
| `vite build` (apps/desktop) | success — no inline scripts or styles |

## Risks

- **Windows path separator in preview**: `computePreviewPath` detects Windows paths
  by the presence of `\` in the trimmed parent. If a user types a mixed-separator
  path this heuristic may pick the wrong separator for display only; the OS resolves
  the actual path correctly at creation time.
- **TOCTOU on existence check**: `final_path.exists()` and `create_dir_all` are not
  atomic. Acceptable for an interactive wizard (window is negligible in normal use).
- **`cargo test` runs no integration tests against a real filesystem**: Code-path
  correctness for `create_repository` relies on Vitest + manual smoke (section 6.11).

## Not done

- No change to `RepositorySummaryDto.repo_path` — still returns the final path.
- Frontend validation (`CODE_RE`) is unchanged; it is more restrictive than the backend
  (lowercase only, no uppercase), which is intentional: backend allows any safe name;
  frontend narrows to the project's naming convention.

## Suggested next step

Manual smoke test section 6.11: select parent dir, enter code, verify preview,
create, confirm directory is `<parent>/<code>`, confirm existing-dir error on retry.
