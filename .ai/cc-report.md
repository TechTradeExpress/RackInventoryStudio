## Summary

Changed the "Create repository" wizard so the user selects a **parent directory**
instead of the final repository directory. The repository is created inside
`<parent_directory>/<code>`. The `code` is the directory/path identifier; `name`
is a display-only label and does not affect the path.

Added strict backend validation of `code` as a safe directory name before composing
`final_path`. Frontend validation remains the first line of defence; the backend is
the authoritative security boundary.

**Cleanup**: commit `0f7e5d8` accidentally tracked `.ai/review-context-20260612-0719.md`
(a ChatGPT review artefact that must not be part of any PR). It was removed from git
tracking in commit `e3c8e80` via `git rm --cached`. The `.gitignore` already contains
`.ai/` which prevents future accidental tracking of review-context files. Review-context
artefacts are generated locally and passed to ChatGPT; they are never committed.

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

## How the path is composed

```
final_path = PathBuf::from(parent_path.trim()).join(code.trim())
```

`code` becomes the last path component (directory name). `name` is stored only in
`repo.yaml` as a display label — it is never part of the filesystem path.

Example: parent = `D:\RIS`, code = `test-lab` → `final_path = D:\RIS\test-lab`.

## Backend `code` validation (`validate_repo_code`)

Runs before `final_path` is composed, before any filesystem access. Rejects:

| Rule | Example rejected |
|---|---|
| Empty / blank-only | `""` |
| Path separators `/` or `\` | `a/b`, `a\b`, `../repo`, `repo/` |
| Standalone `..` | `..` |
| Windows-forbidden chars `< > : " \| ? *` | `name:bad`, `name*bad` |
| Trailing dot | `repo.`, `repo..` |
| Trailing space | `repo ` |
| Windows reserved names — bare and with extension (case-insensitive) | `CON`, `NUL`, `com1`, `LPT9`, `con.txt`, `nul.repo`, `aux.data`, `com1.test`, `lpt9.backup` |

Windows treats `NAME.ext` identically to `NAME` for reserved device names. The check
extracts the stem (everything before the first `.`) and compares that against the
reserved list. This allows dotted codes like `dc.01`, `rack.01`, and `my.repo-1`
while still blocking `con.txt`, `nul.repo`, etc.

The error for an existing target directory reads:
`Target directory already exists: <full final path>` — i.e. `<parent>/<code>`.

## `computePreviewPath` trailing-separator fix

The helper strips trailing `/` or `\` from the parent before joining:

```typescript
const p = raw.replace(/[\\/]+$/, "");
```

So `/tmp/` + `repo` → `/tmp/repo` (not `/tmp//repo`) and
`D:\RIS\` + `repo` → `D:\RIS\repo` (not `D:\RIS\\repo`).

## Version consistency

```
  package.json (workspace root)           0.1.0-beta.2
  apps/desktop/package.json               0.1.0-beta.2
  apps/desktop/src-tauri/Cargo.toml       0.1.0-beta.2
  apps/desktop/src-tauri/tauri.conf.json  0.1.0-beta.2

  ✓ All versions match: 0.1.0-beta.2
```

## Checks

All checks run locally on the current HEAD (`426c299`) and passed:

| Check | Result |
|---|---|
| `git diff --check` | clean |
| `node scripts/check-version-consistency.mjs` | ✓ 0.1.0-beta.2 — all 4 sources |
| `node --test scripts/*.test.mjs` | 19 pass |
| `node scripts/check-repo-hygiene.mjs` | 8/8 pass (incl. no review-context tracked) |
| `node scripts/smoke-beta-gate.mjs` (= `pnpm smoke:beta`) | 7/7 pass |
| `cargo fmt --all -- --check` | clean |
| `cargo check --workspace` | clean |
| `cargo test --workspace` | 0 failures (validate_repo_code tests: 72 pass in desktop crate) |
| `cargo clippy --workspace -- -D warnings` | clean |
| `tsc --noEmit` (apps/desktop) | clean |
| Vitest (apps/desktop) | 562 tests pass, 43 files |
| `vite build` (apps/desktop) | success — no inline scripts or styles |

GitHub CI (run 27401679752): all 5 checks green.

## Risks

- **Windows path separator in preview**: `computePreviewPath` detects Windows paths
  by the presence of `\` in the trimmed parent. Mixed-separator paths would pick the
  wrong separator for display only; the OS resolves the actual path correctly.
- **TOCTOU on existence check**: `final_path.exists()` and `create_dir_all` are not
  atomic. Acceptable for an interactive wizard.
- **No integration tests against a real filesystem**: correctness of `create_repository`
  path composition relies on Vitest + manual smoke (section 6.11).

## Not done

- `RepositorySummaryDto.repo_path` unchanged — still returns the final path.
- Frontend `CODE_RE` is more restrictive than backend (lowercase only); intentional.

## Suggested next step

Manual smoke test section 6.11 on Windows: select parent dir, enter code, confirm
preview shows `<parent>\<code>`, create, confirm directory is `<parent>\<code>`,
confirm existing-dir error on retry. Then merge PR #116.
