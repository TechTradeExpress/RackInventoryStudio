# cc-report — milestone/git-ux-polish

## Branch

`milestone/git-ux-polish`

**PR:** https://github.com/TechTradeExpress/RackInventoryStudio/pull/39

---

## Goal

Polish the Git workflow UX in the Repository panel so that users clearly understand:
1. Whether the directory is a Git repository.
2. The current branch and upstream.
3. Whether the working tree is clean or dirty (uncommitted Git changes).
4. Whether the branch is ahead / behind / diverged from remote.
5. What they should do next to safely publish changes.
6. The distinction between unsaved app changes (in-memory) and uncommitted Git changes (on disk, not yet committed).

---

## Summary of Changes

### New helper module: `gitStatusHelpers.ts`

Pure functions for deriving semantic labels, action hints, and a publish checklist from `GitStatusDto` and `hasUnsavedChanges`. Extracted as pure functions for testability.

- `deriveGitStatusLabel(status)` — returns a human-readable label and severity:
  - `"No Git repository detected"` (info)
  - `"Clean working tree"` (ok)
  - `"Local changes not committed"` (warn)
  - `"Ahead of remote by N commits"` (ok)
  - `"Behind remote by N commits"` (warn)
  - `"Diverged from remote (↑N ↓M)"` (error)

- `deriveGitActionHints(status, hasUnsavedChanges)` — contextual action hints array:
  - "Save in-memory changes to disk before committing to Git."
  - "Working tree has uncommitted changes — validate, then commit."
  - "No upstream branch — push requires a configured remote and tracking branch."
  - "Branch is N commits behind remote — pull before pushing."
  - "Branch is N commits ahead of remote — push when ready."
  - "Branch has diverged from remote — manual git intervention required."

- `derivePublishChecklist(status, hasUnsavedChanges)` — 5-step checklist with live done/pending/unknown state:
  1. Save changes to disk
  2. Validate — no errors (unknown until run)
  3. Commit local changes
  4. Pull if behind
  5. Push to remote

### RepositoryPanel.tsx improvements

- **Semantic status label** — replaced raw "Clean" / "Dirty — X staged, Y unstaged, Z untracked" with `deriveGitStatusLabel`; color-coded by severity (green/amber/red/grey).
- **Detail counts** — staged/unstaged/untracked shown inline (smaller, grey) when dirty, not as the primary label.
- **"No Git repository detected"** — explicit colour-coded message replaces plain hint text.
- **Action hints panel** — `<ul>` list of hints below the status table; only rendered when hints exist.
- **Publish checklist** — compact ✓/·/○ row at the top of the Publish section; step 2 state is injected from local `publishValidation` state.
- **Commit input placeholder** — improved to `"e.g. Add rack-b01 to Warsaw server room"`.
- **Commit button title** — comprehensive `title` attribute covering all disabled reasons.
- **"Pull --ff-only" → "Pull latest"** — more user-friendly label.
- **Remote sync guidance** — contextual behind/ahead/diverged boxes above the push/pull buttons.
- **Push/Pull button tooltips** — `title` attribute when disabled due to unsaved changes.

### App.tsx

- **Unsaved changes banner** — improved text: "Unsaved inventory changes — data modified in memory, not yet written to YAML files." Adds explicit note that this is separate from Git.

### E2E mock (`tauri-core.ts`)

Changed `get_git_status` from `is_repository: false` to a realistic state:
- `is_repository: true`, `branch: "main"`, `upstream: "origin/main"`, `ahead: 1`, `is_clean: true`

Added `get_git_log` with one fixture commit. Added `list_git_remotes` with `origin`.

Added mock responses for previously unhandled commands:
- `init_git_repository`, `push_git_current_branch`, `pull_git_ff_only`, `commit_repository_changes`

### Playwright smoke tests

Added test 8: **"git section shows status label and publish guidance"**
- Verifies Git section heading is visible after repo open.
- Verifies semantic status label "Ahead of remote by 1 commit" from mock.
- Verifies action hint list item about being ahead.
- Verifies branch cell "main" in Git status table.
- Verifies "nothing to commit" message (clean tree).
- Verifies "Push current branch" button enabled.
- Verifies "Pull latest" label (not "Pull --ff-only").

### Documentation

- `docs/USER_WORKFLOWS_EN.md` — expanded workflow 22 with safe publish path steps, status labels table, key distinction between app changes and Git changes, conflict/auth scope note.
- `docs/UI_SCREENS_SPEC_EN.md` — replaced section 6 with current implementation layout, status label table, distinction note, commit/push/pull behavior.
- `docs/MVP_READINESS_REPORT_EN.md` — marked "Safe publish workflow / better Git UX" as Done (PR #39).

---

## Files Changed

| File | Change |
|---|---|
| `src/features/repository/gitStatusHelpers.ts` | New — `deriveGitStatusLabel`, `deriveGitActionHints`, `derivePublishChecklist` |
| `src/features/repository/gitStatusHelpers.test.ts` | New — 30 tests covering all helpers |
| `src/features/repository/RepositoryPanel.tsx` | Semantic labels, action hints, checklist, Pull Latest label, remote guidance |
| `src/App.tsx` | Improved unsaved changes banner text with app-vs-Git distinction |
| `e2e/mocks/tauri-core.ts` | Realistic Git mock state; added missing command handlers |
| `e2e/smoke.spec.ts` | Added test 8: Git UX smoke test |
| `docs/USER_WORKFLOWS_EN.md` | Expanded workflow 22 with safe publish path and status labels |
| `docs/UI_SCREENS_SPEC_EN.md` | Updated section 6 to match current implementation |
| `docs/MVP_READINESS_REPORT_EN.md` | Marked milestone Done (PR #39) |

---

## Implementation Decisions

### Pure helper functions for testability
`gitStatusHelpers.ts` has no side effects. The publish checklist step 2 (validate) always returns `null` (unknown) from the helper; callers inject the local `publishValidation` state in the render function. This keeps the helpers fully unit-testable without mocking component state.

### Severity-based color coding
All Git status colors derive from a `SEVERITY_COLOR` map keyed on `GitSeverity`. This makes the color scheme consistent and easy to maintain.

### Commit constraint unchanged
The existing "validate first" requirement for commit is preserved. This is the safe publish philosophy: commit requires save + validate without errors + non-empty message. The improvement is in the guidance UI (hints, checklist, button title attributes).

### Mock change: is_repository=true
Changed the E2E mock from `is_repository: false` to a realistic clean-repo-with-ahead state. This does not break existing tests (none interact with the Git section) and enables a meaningful Git UX smoke test.

### "Pull --ff-only" → "Pull latest"
The underlying command remains `git pull --ff-only`. The button label is user-friendly. Technical detail is in docs.

---

## App changes vs Git changes distinction

| State | Source | Banner/indicator | How to resolve |
|---|---|---|---|
| Unsaved app changes | In-memory mutations not saved | Global amber banner | "Save repository" in Repository tab |
| Uncommitted Git changes | YAML files differ from last commit | Git status row (amber) | Validate → Commit in Git section |

These are independent. Saving to disk clears the app banner but does not create a Git commit.

---

## Tests

| Command | Result |
|---|---|
| `cargo fmt --all --check` | PASS |
| `cargo check --workspace` | PASS |
| `cargo test --workspace` | PASS — all Rust tests pass |
| `cargo clippy --workspace -- -D warnings` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` (Vitest) | PASS — 114 tests, 9 files (30 new gitStatusHelpers tests) |
| `pnpm build` | PASS — 59 modules, 242 kB bundle |
| `pnpm test:e2e` (Playwright) | PASS — 9/9 (1 new Git UX test) |

---

## Manual Check

Verified via Playwright smoke tests + unit tests. WSL2 environment — no interactive browser.

Verified points:
- Semantic status label "Ahead of remote by 1 commit" visible (Playwright test)
- Action hint list item about being ahead visible (Playwright test)
- Branch "main" visible in Git status table (Playwright test)
- "Nothing to commit" when tree is clean (Playwright test)
- Push/Pull buttons enabled with remote in mock (Playwright test)
- "Pull latest" label (not "Pull --ff-only") confirmed (Playwright test)
- PR #38 regression: all 8 prior smoke tests still pass
- DnD placement, CSV import, global search smoke flows unchanged

---

## Known Limitations

- Publish checklist step 2 (validate) shows "·" (unknown) by default until the user runs validation in the Git section. The Validation tab's result is not surfaced to the checklist.
- Action hints and checklist do not auto-refresh — user must click "Refresh Git status" to update after external git operations.
- Ahead/behind counters are only available when upstream is configured. Without upstream, push/pull buttons still appear disabled with explanation.

---

## Risks

- Changing `get_git_status` mock from `is_repository: false` to `true` affects all e2e tests that open the repo. Verified all 8 prior tests still pass.

---

## Repair (post-review blocker)

### Blocker
Push/Pull controls were not gated by Git sync state. A single `syncDisabled`
flag (`pushing || pulling || hasUnsavedChanges || !selectedRemote`) was shared
by both buttons, ignoring behind/diverged states. This meant:
- Behind-only: Pull was enabled (correct), but Push was also enabled — users
  could try to push before pulling, which remote would reject.
- Diverged: both Push and Pull could appear enabled despite the UI saying
  "manual git intervention required."

### Fix
Replaced `syncDisabled` with separate `pushDisabled` / `pullDisabled` derived
from two new pure helper functions in `gitStatusHelpers.ts`:

- `getPushDisabledReason(status, hasUnsavedChanges, selectedRemote): string | null`
- `getPullDisabledReason(status, hasUnsavedChanges, selectedRemote): string | null`

Each returns `null` when the action is allowed, or a specific reason string
used directly as the button `title` attribute.

### Gating logic per state

| State | Push | Pull |
|---|---|---|
| Unsaved app changes | Disabled — "Save inventory changes to disk first" | Disabled — same |
| No remote selected | Disabled — "Select a remote to push to" | Disabled — "Select a remote to pull from" |
| Behind only | Disabled — "Pull latest before pushing" | **Enabled** |
| Diverged | Disabled — "Branch has diverged — resolve manually with Git" | Disabled — same |
| Ahead only | **Enabled** | **Enabled** |
| Clean/up-to-date | **Enabled** | **Enabled** |

### Tests added
14 new Vitest tests in `gitStatusHelpers.test.ts`:
- `getPushDisabledReason`: 7 tests (ahead-only → null, clean → null, unsaved → blocked, no remote → blocked, behind-only → blocked with Pull message, diverged → blocked, unsaved priority over no-remote)
- `getPullDisabledReason`: 7 tests (behind-only → null, clean → null, ahead-only → null, unsaved → blocked, no remote → blocked, diverged → blocked, behind-only explicitly re-tested for null)

### Test results after repair

| Command | Result |
|---|---|
| `cargo fmt --all --check` | PASS |
| `cargo check --workspace` | PASS |
| `cargo test --workspace` | PASS — all Rust tests pass |
| `cargo clippy --workspace -- -D warnings` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` (Vitest) | PASS — 128 tests, 9 files (44 in gitStatusHelpers) |
| `pnpm build` | PASS — 59 modules, 242 kB bundle |
| `pnpm test:e2e` (Playwright) | PASS — 9/9 |

### Manual check (verified by test logic)
1. Ahead-only (mock state): Push enabled, Pull enabled ✓ (Playwright test confirms)
2. Behind-only (unit test): Push disabled ("Pull latest before pushing"), Pull enabled (null) ✓
3. Diverged (unit test): Push disabled ("diverged"), Pull disabled ("diverged") ✓
4. Unsaved app changes (unit test): Push disabled, Pull disabled ✓
5. No remote (unit test): Push disabled, Pull disabled ✓
6. Existing Playwright Git UX smoke still passes 9/9 ✓

---

## Not Done

- Conflict resolution (intentionally deferred).
- Git authentication prompts (intentionally deferred).
- Auto-refresh Git status on external operations.
- Surfacing Validation tab results into the Publish checklist step 2.
- "Open last repository" on startup.

---

## Suggested Next Step

Claude Design / UX audit milestone: schedule a design direction audit to inform UI polish decisions (typography, spacing, color palette) before v1.0.0 release.
