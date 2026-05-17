# Milestone 7 — Minimal Tauri Shell

## Summary

Created the first working desktop shell that connects the React frontend with the Rust application layer.
The integration path React UI → Tauri commands → ris-application → ris-repository / ris-validation / ris-writer is fully implemented and verified via a successful `tauri build` release binary.

The Rust command layer was already present from earlier work on this branch.
This session completed the missing frontend pieces: the typed API layer (`tauriClient.ts`) and the functional React UI (`App.tsx`).

## Branch

`feature/milestone-7-minimal-tauri-shell`

## Files changed

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/src/lib.rs` | Registers all Tauri commands and manages `AppState` with `Mutex<Option<RepositorySession>>` |
| `apps/desktop/src-tauri/src/main.rs` | Calls `run()` from the lib crate |
| `apps/desktop/src-tauri/src/dto.rs` | Serializable DTOs: `RepositorySummaryDto`, `ValidationSummaryDto`, `ValidationIssueDto`, `SaveSummaryDto`, `OpenRepositoryResultDto` |
| `apps/desktop/src-tauri/src/commands/mod.rs` | Re-exports all commands and `AppState` |
| `apps/desktop/src-tauri/src/commands/repository.rs` | All five Tauri commands with thin logic delegating to `ris-application` |
| `apps/desktop/src/api/tauriClient.ts` | **New** — Frontend API layer: TypeScript types + `invoke` wrappers for all five commands |
| `apps/desktop/src/App.tsx` | **Replaced** — Minimal functional React shell (path input, open/close, summary table, validation panel, save, issue list) |

No lower-level crates were modified.

## Tauri commands added

| Command | Rust name | Behaviour |
|---------|-----------|-----------|
| `open_repository_cmd` | `open_repository_cmd` | Calls `ris_application::open_repository`, stores session in state, returns summary + validation summary |
| `get_repository_summary` | `get_repository_summary` | Returns summary for open session; errors if none open |
| `validate_current_repository` | `validate_current_repository` | Validates via `session.validate()`, returns issue list |
| `save_current_repository` | `save_current_repository` | Calls `session.save()`, returns write report counts |
| `close_repository` | `close_repository` | Sets state to `None` |

## DTOs added

- `RepositorySummaryDto` — 10 fields describing repository contents
- `ValidationSummaryDto` — error / warning / info / total counts
- `ValidationIssueDto` — code, level, message, optional object and file fields
- `SaveSummaryDto` — created / updated / unchanged / total counts
- `OpenRepositoryResultDto` — wraps summary + validation_summary for the open response

## React API functions added (`apps/desktop/src/api/tauriClient.ts`)

- `openRepository(path)` → `OpenRepositoryResultDto`
- `getRepositorySummary()` → `RepositorySummaryDto`
- `validateCurrentRepository()` → `ValidationIssueDto[]`
- `saveCurrentRepository()` → `SaveSummaryDto`
- `closeRepository()` → `void`

All types are explicitly declared; no `any`.

## UI behaviour implemented

- App title
- Repository path text input (Enter key submits)
- Open / Close buttons with disabled state during async operations
- Example path hint: `examples/example-repository`
- Repository summary table (10 rows)
- Validation section with Validate and Save buttons
- Validation summary line (errors / warnings / info / total with colour indicators)
- Save summary line on success
- Issues table showing first 20 of N issues, colour-coded by level
- Working indicator during all async operations
- Error area showing backend error strings

## Tests

```
cargo fmt --all --check          OK (no output)
cargo check --workspace          OK — Finished dev profile
cargo clippy --workspace         OK — no warnings
cargo test --workspace           OK — 222 tests (77 application, 35 csv_import,
                                       36 validation, 34 writer, 21 core, 19 loader)
```

Frontend:
```
pnpm install                     OK
pnpm --filter desktop build      OK — tsc + vite, 147 kB JS bundle
pnpm --filter desktop tauri build --verbose  OK — release binary built in ~72 s
  target/release/rack-inventory-studio-desktop  ✓
```

No OS-level packaging artifacts (`.deb`, `.AppImage`) were produced — WSL does not have `dpkg` or AppImage tooling installed. The release binary itself compiled and linked successfully.

## Risks

- WSL environment: the release binary cannot be run directly in WSL without an X server or a Wayland compositor. Functional testing of the running UI requires a native Linux desktop or Windows build.
- The validation call inside `open_repository_cmd` re-validates on disk (reads YAML again). For large repositories this will be slow, but is correct.
- `AppState` uses a `std::sync::Mutex`. Tauri commands run on a thread pool, so long-running commands (validate, save) will block other commands while holding the lock. Acceptable for this milestone.
- The identifier `studio.rackinventory.app` ends with `.app` — Tauri CLI warns this conflicts with macOS bundle extensions. Should be renamed before macOS release.

## Not done

- Full rack view, drag-and-drop, catalog CRUD screens
- Git workflow integration
- CSV import UI
- File-picker dialog (user must type path manually)
- Complex styling / component library / routing
- Frontend tests (no test infrastructure added)
- OS packaging (requires native Linux tooling)

## Suggested next step

Add a native file-picker dialog using `@tauri-apps/plugin-dialog` so the user can browse for a repository folder instead of typing a raw path. This is a small, self-contained addition that directly improves usability before the next major UI milestone.
