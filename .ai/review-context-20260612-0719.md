# ChatGPT Code Review Context

## Review mode
You are a strict code reviewer. Review only this change. Focus on correctness, scope, tests, security, maintainability and operational risk.

Return:
- Status: Approve / Request changes / Needs human decision
- Summary
- Blocking issues
- Non-blocking suggestions
- Scope check
- Tests
- Risks
- Recommended next action

## Repository
- Repo: TechTradeExpress/RackInventoryStudio
- URL: https://github.com/TechTradeExpress/RackInventoryStudio

## Branch
- Current branch: fix/repository-create-parent-directory-flow
- Base branch: master
- Commits ahead of base: 1

## Pull request
No PR detected for current branch.

## Claude Code report
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

## Changed files
M	.ai/cc-report.md
M	CHANGELOG.md
M	apps/desktop/src-tauri/src/commands/repository.rs
M	apps/desktop/src-tauri/src/dto.rs
M	apps/desktop/src/api/tauriClient.ts
M	apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx
M	apps/desktop/src/features/repository/CreateRepositoryWizard.tsx
M	apps/desktop/src/features/repository/wizardHelpers.test.ts
M	apps/desktop/src/features/repository/wizardHelpers.ts
M	docs/BETA1_SMOKE_TEST_EN.md

## Diff stat
 .ai/cc-report.md                                   | 141 +++++----------------
 CHANGELOG.md                                       |   6 +
 apps/desktop/src-tauri/src/commands/repository.rs  |  21 ++-
 apps/desktop/src-tauri/src/dto.rs                  |   2 +-
 apps/desktop/src/api/tauriClient.ts                |   4 +-
 .../repository/CreateRepositoryWizard.test.tsx     |  59 ++++++++-
 .../features/repository/CreateRepositoryWizard.tsx |  38 ++++--
 .../src/features/repository/wizardHelpers.test.ts  |  44 ++++++-
 .../src/features/repository/wizardHelpers.ts       |  16 ++-
 docs/BETA1_SMOKE_TEST_EN.md                        |  10 +-
 10 files changed, 197 insertions(+), 144 deletions(-)

## Diff
diff --git a/.ai/cc-report.md b/.ai/cc-report.md
index 9dcfc4e..cb8ebe7 100644
--- a/.ai/cc-report.md
+++ b/.ai/cc-report.md
@@ -1,125 +1,54 @@
 ## Summary
 
-Fixes two beta.2 release blockers on branch `bugfix/beta2-installer-close-blockers` (PR #115).
+Changed the "Create repository" wizard so the user selects a **parent directory**
+instead of the final repository directory. The repository is now created inside
+`<parent_directory>/<code>`. If the target path already exists the operation is
+rejected with a clear error.
 
-### Blocker 1 — NSIS installer false "running" prompt (root cause confirmed, reverted)
+PR #115 (beta.2 blockers) is already merged. This is a new PR on
+`fix/repository-create-parent-directory-flow`.
 
-**Root cause verified** by fetching the canonical Tauri bundler source
-(`crates/tauri-bundler/src/bundle/windows/nsis/utils.nsh` via GitHub API):
-
-`nsis_tauri_utils::FindProcess` returns `0` when the process IS found (running),
-and non-zero when the process is NOT found. The canonical macro checks `${If} $R0 = 0`
-to detect a running process.
-
-The custom `RisCheckIfRunning` macro introduced in commit `9bf25e5` had this inverted:
-it checked `IntCmp $R0 1 ris_running...` — triggering the prompt and kill path when
-`$R0 = 1`, i.e., when the process was NOT running. This caused the false prompt on
-every fresh install or reinstall after the app was closed.
-
-**Fix:** Removed `RisCheckIfRunning` entirely. Both call sites (Section Install and
-Section Uninstall) now use the canonical bundler macro:
-```
-!insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
-```
-`utils.nsh` is provided by the Tauri bundler at build time and handles all edge cases:
-correct `FindProcess` convention, currentUser install mode, silent/passive mode,
-localized strings, kill success/failure flow.
-
-### Blocker 2 — OS window close button (capability fix preserved, unchanged)
-
-`core:window:allow-close` and `core:window:allow-destroy` remain in
-`apps/desktop/src-tauri/capabilities/default.json`. The `onCloseRequested` handler
-in `App.tsx` logs `destroy()` failures via `logError` instead of swallowing them.
-No changes to this fix in this revision.
-
-## PR
-
-https://github.com/TechTradeExpress/RackInventoryStudio/pull/115
-
-## Files changed in this revision
+## Files changed
 
 | File | Change |
 |---|---|
-| `apps/desktop/src-tauri/nsis/main.nsi` | Removed `RisCheckIfRunning` macro; restored `CheckIfAppIsRunning` at both call sites |
-| `CHANGELOG.md` | Added Fixed entry for installer false running prompt |
-| `.ai/cc-report.md` | Updated with root cause, revert description, full check results |
-
-## Files preserved from previous revisions (unchanged here)
-
-| File | Status |
-|---|---|
-| `apps/desktop/src-tauri/capabilities/default.json` | `core:window:allow-close` + `core:window:allow-destroy` present |
-| `apps/desktop/src/App.tsx` | `catch (error)` with `logError` + `closingRef` reset |
-| `apps/desktop/src/App.close.test.tsx` | 549 tests pass including rejection/retry |
-| `scripts/check-capabilities.test.mjs` | Guard test for capability permissions |
-| `docs/BETA1_SMOKE_TEST_EN.md` | Sections 6.14/6.15 for manual OS close + installer |
-
-## Version consistency
-
-```
-  package.json (workspace root)           0.1.0-beta.2
-  apps/desktop/package.json               0.1.0-beta.2
-  apps/desktop/src-tauri/Cargo.toml       0.1.0-beta.2
-  apps/desktop/src-tauri/tauri.conf.json  0.1.0-beta.2
-  All versions match: 0.1.0-beta.2
-```
-
-## Checks
-
-All checks passed (Linux, Node 18, Rust 1.95.0):
+| `apps/desktop/src-tauri/src/dto.rs` | `CreateRepositoryInputDto.path` → `parent_path` |
+| `apps/desktop/src-tauri/src/commands/repository.rs` | Compute `final_path = parent_path.join(code)`; add existence check |
+| `apps/desktop/src/api/tauriClient.ts` | `CreateRepositoryInput.path` → `parent_path`; dialog title → "Choose parent directory" |
+| `apps/desktop/src/features/repository/wizardHelpers.ts` | `path` → `parentPath` in state/errors; add `computePreviewPath` helper |
+| `apps/desktop/src/features/repository/CreateRepositoryWizard.tsx` | "Directory" → "Parent directory"; add path preview; send `parent_path` |
+| `apps/desktop/src/features/repository/wizardHelpers.test.ts` | Update fixture field name; add `computePreviewPath` tests |
+| `apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx` | Update placeholder/field assertions; add preview tests |
+| `docs/BETA1_SMOKE_TEST_EN.md` | Update section 6.11 for parent directory flow |
+| `CHANGELOG.md` | Add Fixed entry for parent directory flow |
+
+## Tests
 
 | Check | Result |
 |---|---|
-| `git diff --check` | clean |
-| `node scripts/check-version-consistency.mjs` | 0.1.0-beta.2 -- all 4 sources |
-| `node --test scripts/*.test.mjs` | 19 pass (17 bump-version + 2 capabilities guard) |
-| `node scripts/check-repo-hygiene.mjs` | 8/8 pass |
-| `pnpm smoke:beta` | 7/7 pass |
 | `cargo fmt --all -- --check` | clean |
-| `cargo check --workspace` | clean |
-| `cargo test --workspace` | 0 failures |
 | `cargo clippy --workspace -- -D warnings` | clean |
-| `npx pnpm@10.33.4 -C apps/desktop exec tsc --noEmit` | clean |
-| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vitest run` | 549 pass (43 files) |
-| `npx pnpm@10.33.4 --filter @rack-inventory-studio/desktop exec vite build` | success -- no inline scripts or styles |
-
-## Windows Installer CI
-
-Workflow triggered on branch `bugfix/beta2-installer-close-blockers` after push.
-Previous run (capability fix only):
-https://github.com/TechTradeExpress/RackInventoryStudio/actions/runs/27161492074
-
-A new run must be triggered after this push. Manual trigger at:
-https://github.com/TechTradeExpress/RackInventoryStudio/actions/workflows/windows-installer.yml
-
-Select branch: `bugfix/beta2-installer-close-blockers`
-
-**The NSIS revert is the critical fix for the false running prompt** and must be
-validated by a Windows build.
+| `cargo test --workspace` | 0 failures |
+| `tsc --noEmit` | clean |
+| Vitest (`apps/desktop`) | 559 tests pass (43 files) |
+| `node --test scripts/*.test.mjs` | 19 pass |
 
-## Manual QA required after Windows installer build
+## Risks
 
-1. RIS not running: install proceeds without "is currently running" prompt.
-2. RIS not running: uninstall proceeds without "is currently running" prompt.
-3. RIS running: installer shows prompt.
-4. RIS running: click OK — RIS closes, install/uninstall continues.
-5. RIS running: click Cancel — install/uninstall aborts cleanly.
-6. Dev mode on Windows: system X button with no unsaved changes — app closes immediately.
-7. Dev mode on Windows: system X button with unsaved changes — 3-button guard dialog appears.
-8. Guard: "Save and continue" — saves and closes.
-9. Guard: "Continue without saving" — closes without saving.
-10. Guard: "Cancel" — app remains open.
+- **Windows path separator**: `computePreviewPath` uses `\` when parent path contains `\`,
+  otherwise `/`. This is display-only; the OS resolves the actual path at creation time.
+- **Existing-dir check is TOCTOU**: `final_path.exists()` check and `create_dir_all` are not
+  atomic, but this is acceptable for an interactive wizard — the window between check and
+  creation is negligible in normal use.
+- **`cargo test` runs no integration tests**: Rust crate tests are empty; correctness of
+  `final_path` composition depends on the Vitest + manual smoke tests.
 
-## Risks
+## Not done
 
-- **NSIS can only be compiled on Windows**: The revert to `CheckIfAppIsRunning` is
-  correct by source inspection but must be confirmed by the Windows Installer CI run.
-- **Capability fix unverified locally**: `core:window:allow-destroy` enforcement is
-  a Windows-only Tauri IPC check; confirmed by source analysis, validated by Windows
-  build + manual smoke.
+- No change to the `RepositorySummaryDto.repo_path` field — it continues to return
+  the final repository path (which now equals `parent_path/code`).
 
 ## Suggested next step
 
-Trigger Windows Installer CI on branch `bugfix/beta2-installer-close-blockers`, then
-run manual QA steps 1-10 above. If installer smoke passes and the system X button
-closes the app correctly, merge PR #115 and proceed with the beta.2 release gate.
+Push branch, open PR `fix(repository): create new repositories inside selected parent directory`,
+run Windows manual smoke test section 6.11, then merge.
diff --git a/CHANGELOG.md b/CHANGELOG.md
index 010e6c4..76031d6 100644
--- a/CHANGELOG.md
+++ b/CHANGELOG.md
@@ -24,6 +24,12 @@
 
 ### Fixed
 
+- **Create repository now uses selected folder as parent directory**: The "Create
+  repository" wizard now asks for a **parent directory** instead of the final
+  repository directory. The repository is created inside
+  `<parent>/<code>` — e.g. selecting `D:\RIS` with code `test-lab` creates
+  `D:\RIS\test-lab`. If the target directory already exists the operation is
+  rejected with a clear error message.
 - **Fixed false Windows installer "app is currently running" prompt**: Restored
   Tauri's canonical `CheckIfAppIsRunning` NSIS macro. The custom `RisCheckIfRunning`
   macro introduced in beta.2 had inverted `nsis_tauri_utils::FindProcess` return value
diff --git a/apps/desktop/src-tauri/src/commands/repository.rs b/apps/desktop/src-tauri/src/commands/repository.rs
index da51155..ff0bb2e 100644
--- a/apps/desktop/src-tauri/src/commands/repository.rs
+++ b/apps/desktop/src-tauri/src/commands/repository.rs
@@ -139,17 +139,28 @@ pub fn create_repository_cmd(
     input: CreateRepositoryInputDto,
     state: State<AppState>,
 ) -> Result<OpenRepositoryResultDto, String> {
-    let path = input.path.trim().to_string();
-    if path.is_empty() {
-        return Err("Target path cannot be blank".to_string());
+    let parent_path = input.parent_path.trim().to_string();
+    if parent_path.is_empty() {
+        return Err("Parent path cannot be blank".to_string());
+    }
+    let code = input.code.trim().to_string();
+    if code.is_empty() {
+        return Err("Repository code cannot be blank".to_string());
+    }
+    let final_path = std::path::PathBuf::from(&parent_path).join(&code);
+    if final_path.exists() {
+        return Err(format!(
+            "Directory already exists: {}",
+            final_path.display()
+        ));
     }
     log::info!(
         "create_repository: {}",
-        basename(std::path::Path::new(&path)),
+        basename(std::path::Path::new(&final_path)),
     );
 
     let session = create_repository(CreateRepositoryInput {
-        path: std::path::PathBuf::from(&path),
+        path: final_path,
         code: input.code.clone(),
         name: input.name.clone(),
         id: None,
diff --git a/apps/desktop/src-tauri/src/dto.rs b/apps/desktop/src-tauri/src/dto.rs
index df6edf1..efbe87e 100644
--- a/apps/desktop/src-tauri/src/dto.rs
+++ b/apps/desktop/src-tauri/src/dto.rs
@@ -309,7 +309,7 @@ pub struct UpdateDeviceInputDto {
 
 #[derive(Debug, Serialize, Deserialize)]
 pub struct CreateRepositoryInputDto {
-    pub path: String,
+    pub parent_path: String,
     pub code: String,
     pub name: String,
 }
diff --git a/apps/desktop/src/api/tauriClient.ts b/apps/desktop/src/api/tauriClient.ts
index a2ae23a..463c1fc 100644
--- a/apps/desktop/src/api/tauriClient.ts
+++ b/apps/desktop/src/api/tauriClient.ts
@@ -538,7 +538,7 @@ export function getSshDiagnostics(remote?: string): Promise<SshDiagnosticsDto> {
 // ── Create repository ─────────────────────────────────────────────────────────
 
 export interface CreateRepositoryInput {
-  path: string;
+  parent_path: string;
   code: string;
   name: string;
 }
@@ -593,7 +593,7 @@ export async function selectRepositoryFolder(): Promise<string | null> {
   const result = await open({
     directory: true,
     multiple: false,
-    title: "Select Repository Folder",
+    title: "Choose parent directory",
   });
   if (result === null || result === undefined) return null;
   if (Array.isArray(result)) return result[0] ?? null;
diff --git a/apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx b/apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx
index 41870a1..e8500ce 100644
--- a/apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx
+++ b/apps/desktop/src/features/repository/CreateRepositoryWizard.test.tsx
@@ -16,7 +16,7 @@ const mockBrowse = vi.mocked(selectRepositoryFolder);
 
 const FIXTURE_RESULT: OpenRepositoryResultDto = {
   summary: {
-    repo_path: "/some/path",
+    repo_path: "/some/path/test-repo",
     repository_code: "test-repo",
     repository_name: "Test Repo",
     locations_count: 0,
@@ -54,10 +54,10 @@ describe("CreateRepositoryWizard — Git enforcement", () => {
     ).toBeTruthy();
   });
 
-  it("calls createRepository without initialize_git field on submit", async () => {
+  it("calls createRepository with parent_path (not path) on submit", async () => {
     render(<CreateRepositoryWizard onSuccess={vi.fn()} />);
 
-    fireEvent.change(screen.getByPlaceholderText(/path to new/i), {
+    fireEvent.change(screen.getByPlaceholderText(/path to parent directory/i), {
       target: { value: "/my/dir" },
     });
     fireEvent.change(screen.getByPlaceholderText(/e\.g\. my-datacenter/i), {
@@ -71,15 +71,16 @@ describe("CreateRepositoryWizard — Git enforcement", () => {
 
     await waitFor(() => expect(mockCreate).toHaveBeenCalledOnce());
     const call = mockCreate.mock.calls[0][0];
-    expect(call).toEqual({ path: "/my/dir", code: "test-repo", name: "Test Repo" });
+    expect(call).toEqual({ parent_path: "/my/dir", code: "test-repo", name: "Test Repo" });
     expect(Object.prototype.hasOwnProperty.call(call, "initialize_git")).toBe(false);
+    expect(Object.prototype.hasOwnProperty.call(call, "path")).toBe(false);
   });
 
   it("calls onSuccess after successful create", async () => {
     const onSuccess = vi.fn();
     render(<CreateRepositoryWizard onSuccess={onSuccess} />);
 
-    fireEvent.change(screen.getByPlaceholderText(/path to new/i), {
+    fireEvent.change(screen.getByPlaceholderText(/path to parent directory/i), {
       target: { value: "/my/dir" },
     });
     fireEvent.change(screen.getByPlaceholderText(/e\.g\. my-datacenter/i), {
@@ -94,3 +95,51 @@ describe("CreateRepositoryWizard — Git enforcement", () => {
     await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(FIXTURE_RESULT));
   });
 });
+
+describe("CreateRepositoryWizard — path preview", () => {
+  it("shows path preview when both parent and code are filled", async () => {
+    render(<CreateRepositoryWizard onSuccess={vi.fn()} />);
+
+    fireEvent.change(screen.getByPlaceholderText(/path to parent directory/i), {
+      target: { value: "/home/user/repos" },
+    });
+    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my-datacenter/i), {
+      target: { value: "my-dc" },
+    });
+
+    expect(screen.getByText(/repository will be created at/i)).toBeTruthy();
+    expect(screen.getByText("/home/user/repos/my-dc")).toBeTruthy();
+  });
+
+  it("does not show path preview when parent is empty", () => {
+    render(<CreateRepositoryWizard onSuccess={vi.fn()} />);
+
+    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my-datacenter/i), {
+      target: { value: "my-dc" },
+    });
+
+    expect(screen.queryByText(/repository will be created at/i)).toBeNull();
+  });
+
+  it("path preview uses code, not name, as the folder", async () => {
+    render(<CreateRepositoryWizard onSuccess={vi.fn()} />);
+
+    fireEvent.change(screen.getByPlaceholderText(/path to parent directory/i), {
+      target: { value: "/a" },
+    });
+    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my-datacenter/i), {
+      target: { value: "mycode" },
+    });
+    fireEvent.change(screen.getByPlaceholderText(/e\.g\. my datacenter/i), {
+      target: { value: "Some Name" },
+    });
+
+    expect(screen.getByText("/a/mycode")).toBeTruthy();
+    expect(screen.queryByText("/a/Some Name")).toBeNull();
+  });
+
+  it("shows 'Parent directory' label", () => {
+    render(<CreateRepositoryWizard onSuccess={vi.fn()} />);
+    expect(screen.getByText("Parent directory")).toBeTruthy();
+  });
+});
diff --git a/apps/desktop/src/features/repository/CreateRepositoryWizard.tsx b/apps/desktop/src/features/repository/CreateRepositoryWizard.tsx
index 3ccb2a1..2279f76 100644
--- a/apps/desktop/src/features/repository/CreateRepositoryWizard.tsx
+++ b/apps/desktop/src/features/repository/CreateRepositoryWizard.tsx
@@ -5,7 +5,7 @@ import {
   selectRepositoryFolder,
   type OpenRepositoryResultDto,
 } from "../../api/tauriClient";
-import { hasWizardErrors, validateWizardForm } from "./wizardHelpers";
+import { computePreviewPath, hasWizardErrors, validateWizardForm } from "./wizardHelpers";
 import { useBusy } from "../../lib/appBusy";
 
 interface Props {
@@ -15,18 +15,19 @@ interface Props {
 export function CreateRepositoryWizard({ onSuccess }: Props) {
   const { isBusy, runBusy } = useBusy();
 
-  const [path, setPath] = useState("");
+  const [parentPath, setParentPath] = useState("");
   const [code, setCode] = useState("");
   const [name, setName] = useState("");
   const [error, setError] = useState<string | null>(null);
 
-  const validationErrors = validateWizardForm({ path, code, name });
+  const validationErrors = validateWizardForm({ parentPath, code, name });
   const formHasErrors = hasWizardErrors(validationErrors);
+  const previewPath = computePreviewPath(parentPath, code);
 
   async function handleBrowse() {
     try {
       const selected = await selectRepositoryFolder();
-      if (selected !== null) setPath(selected);
+      if (selected !== null) setParentPath(selected);
     } catch (e) {
       setError(String(e));
     }
@@ -38,7 +39,7 @@ export function CreateRepositoryWizard({ onSuccess }: Props) {
     setError(null);
     try {
       const result = await runBusy("Creating repository…", () =>
-        createRepository({ path: path.trim(), code: code.trim(), name: name.trim() }),
+        createRepository({ parent_path: parentPath.trim(), code: code.trim(), name: name.trim() }),
       );
       onSuccess(result);
     } catch (e) {
@@ -49,13 +50,13 @@ export function CreateRepositoryWizard({ onSuccess }: Props) {
   return (
     <form onSubmit={handleSubmit}>
       <div style={styles.field}>
-        <label style={styles.label}>Directory</label>
+        <label style={styles.label}>Parent directory</label>
         <div style={common.row}>
           <input
             style={common.input}
-            value={path}
-            onChange={(e) => setPath(e.target.value)}
-            placeholder="Path to new repository directory…"
+            value={parentPath}
+            onChange={(e) => setParentPath(e.target.value)}
+            placeholder="Path to parent directory…"
             disabled={isBusy}
           />
           <button
@@ -67,8 +68,8 @@ export function CreateRepositoryWizard({ onSuccess }: Props) {
             Browse…
           </button>
         </div>
-        {validationErrors.path && (
-          <div style={styles.fieldError}>{validationErrors.path}</div>
+        {validationErrors.parentPath && (
+          <div style={styles.fieldError}>{validationErrors.parentPath}</div>
         )}
       </div>
 
@@ -89,6 +90,12 @@ export function CreateRepositoryWizard({ onSuccess }: Props) {
         )}
       </div>
 
+      {previewPath && (
+        <div style={styles.previewPath}>
+          Repository will be created at: <span style={styles.previewPathValue}>{previewPath}</span>
+        </div>
+      )}
+
       <div style={styles.field}>
         <label style={styles.label}>Name</label>
         <input
@@ -146,6 +153,15 @@ const styles = {
     color: "#b00020",
     marginTop: "0.15rem",
   } as CSSProperties,
+  previewPath: {
+    fontSize: "0.82rem",
+    color: "#555",
+    marginBottom: "0.65rem",
+  } as CSSProperties,
+  previewPathValue: {
+    fontFamily: "monospace",
+    color: "#333",
+  } as CSSProperties,
   gitNote: {
     fontSize: "0.82rem",
     color: "#444",
diff --git a/apps/desktop/src/features/repository/wizardHelpers.test.ts b/apps/desktop/src/features/repository/wizardHelpers.test.ts
index b92e313..caffbfe 100644
--- a/apps/desktop/src/features/repository/wizardHelpers.test.ts
+++ b/apps/desktop/src/features/repository/wizardHelpers.test.ts
@@ -1,8 +1,8 @@
 import { describe, expect, it } from "vitest";
-import { hasWizardErrors, validateWizardForm } from "./wizardHelpers";
+import { computePreviewPath, hasWizardErrors, validateWizardForm } from "./wizardHelpers";
 
 const base = {
-  path: "/some/path",
+  parentPath: "/some/path",
   code: "my-repo",
   name: "My Repository",
 };
@@ -12,8 +12,8 @@ describe("validateWizardForm", () => {
     expect(validateWizardForm(base)).toEqual({});
   });
 
-  it("requires path", () => {
-    expect(validateWizardForm({ ...base, path: "   " }).path).toBeDefined();
+  it("requires parentPath", () => {
+    expect(validateWizardForm({ ...base, parentPath: "   " }).parentPath).toBeDefined();
   });
 
   it("requires code", () => {
@@ -53,7 +53,7 @@ describe("validateWizardForm", () => {
   });
 
   it("returns no errors when all required fields are provided", () => {
-    expect(validateWizardForm({ path: "/a", code: "a", name: "A" })).toEqual({});
+    expect(validateWizardForm({ parentPath: "/a", code: "a", name: "A" })).toEqual({});
   });
 });
 
@@ -66,11 +66,41 @@ describe("hasWizardErrors", () => {
     expect(hasWizardErrors({ code: "invalid" })).toBe(true);
   });
 
-  it("returns true when path error is present", () => {
-    expect(hasWizardErrors({ path: "required" })).toBe(true);
+  it("returns true when parentPath error is present", () => {
+    expect(hasWizardErrors({ parentPath: "required" })).toBe(true);
   });
 
   it("returns true when name error is present", () => {
     expect(hasWizardErrors({ name: "required" })).toBe(true);
   });
 });
+
+describe("computePreviewPath", () => {
+  it("joins parent and code with forward slash on unix paths", () => {
+    expect(computePreviewPath("/home/user/repos", "my-datacenter")).toBe(
+      "/home/user/repos/my-datacenter",
+    );
+  });
+
+  it("joins parent and code with backslash on Windows paths", () => {
+    expect(computePreviewPath("D:\\RIS", "test-lab")).toBe("D:\\RIS\\test-lab");
+  });
+
+  it("returns empty string when parent is blank", () => {
+    expect(computePreviewPath("   ", "my-repo")).toBe("");
+  });
+
+  it("returns empty string when code is blank", () => {
+    expect(computePreviewPath("/some/path", "   ")).toBe("");
+  });
+
+  it("returns empty string when both are blank", () => {
+    expect(computePreviewPath("", "")).toBe("");
+  });
+
+  it("name does not appear in the preview path", () => {
+    const preview = computePreviewPath("/a", "my-code");
+    expect(preview).not.toContain("My Name");
+    expect(preview).toBe("/a/my-code");
+  });
+});
diff --git a/apps/desktop/src/features/repository/wizardHelpers.ts b/apps/desktop/src/features/repository/wizardHelpers.ts
index 44d84cb..50a7af0 100644
--- a/apps/desktop/src/features/repository/wizardHelpers.ts
+++ b/apps/desktop/src/features/repository/wizardHelpers.ts
@@ -1,11 +1,11 @@
 export interface WizardFormState {
-  path: string;
+  parentPath: string;
   code: string;
   name: string;
 }
 
 export interface WizardFormErrors {
-  path?: string;
+  parentPath?: string;
   code?: string;
   name?: string;
 }
@@ -14,8 +14,8 @@ const CODE_RE = /^[a-z0-9][a-z0-9._-]*$/;
 
 export function validateWizardForm(state: WizardFormState): WizardFormErrors {
   const errors: WizardFormErrors = {};
-  if (!state.path.trim()) {
-    errors.path = "Path is required.";
+  if (!state.parentPath.trim()) {
+    errors.parentPath = "Parent directory is required.";
   }
   if (!state.code.trim()) {
     errors.code = "Code is required.";
@@ -32,3 +32,11 @@ export function validateWizardForm(state: WizardFormState): WizardFormErrors {
 export function hasWizardErrors(errors: WizardFormErrors): boolean {
   return Object.keys(errors).length > 0;
 }
+
+export function computePreviewPath(parent: string, code: string): string {
+  const p = parent.trim();
+  const c = code.trim();
+  if (!p || !c) return "";
+  const sep = p.includes("\\") ? "\\" : "/";
+  return `${p}${sep}${c}`;
+}
diff --git a/docs/BETA1_SMOKE_TEST_EN.md b/docs/BETA1_SMOKE_TEST_EN.md
index 8586d9c..6198b6a 100644
--- a/docs/BETA1_SMOKE_TEST_EN.md
+++ b/docs/BETA1_SMOKE_TEST_EN.md
@@ -235,10 +235,14 @@ section below. Check each item before moving to the next.
 ### 6.11 Create a new repository
 
 - [ ] Click **Create** on the Repository tab.
-- [ ] Choose an empty disposable directory (e.g. `/tmp/ris-new-repo`).
-- [ ] Repository is created. Git is initialized automatically.
+- [ ] Click **Browse…** next to **Parent directory** and select an empty disposable parent directory (e.g. `/tmp`).
+- [ ] Enter a **Code** such as `ris-new-repo`. The path preview shows `/tmp/ris-new-repo`.
+- [ ] Enter a **Name** such as `RIS New Repo`.
+- [ ] Click **Create repository**.
+- [ ] Repository is created inside `/tmp/ris-new-repo`. Git is initialized automatically.
 - [ ] Repository summary shows zero counts.
-- [ ] Add a location and rack; save. Files appear in the chosen directory.
+- [ ] Add a location and rack; save. Files appear inside `/tmp/ris-new-repo`.
+- [ ] Attempt to create a second repository with the same parent and code — app shows an error that the directory already exists.
 
 ---
 
