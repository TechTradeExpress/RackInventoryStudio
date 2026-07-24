# Beta 1 Smoke Gate -- TEST-01

Run this gate immediately before the beta release checklist, after all
hardening PRs are merged and CI is green on `master`.

**This gate does not change application logic.** It validates that the build is
in a ready-to-test state before distributing an installer to QA.

---

## 1. When to run

- All implementation PRs merged to `master`.
- CI green on the candidate commit.
- **Before** cutting the release branch (`release/v0.1.0-beta.N`).

---

## 2. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js >= 24 (see `.nvmrc`) | `node --version` |
| pnpm 10.x | `pnpm --version` |
| Rust stable toolchain | `cargo --version` |
| Git on PATH | `git --version` |
| Clean working tree | `git status` -- no uncommitted changes in the project repo |
| Safe test remote (push/pull only) | A personal/test GitHub repo. **Do not use production repos.** |

---

## 3. Step 1 -- Run the automated gate

```bash
pnpm smoke:beta
```

This runs:
- Version consistency across all four canonical sources
- Repository hygiene (no secrets, no package-lock.json, etc.)
- Script unit tests
- Frontend TypeScript type check
- Frontend Vitest suite
- Frontend production build
- Sanity check that the built HTML has no inline scripts or styles

**The script must exit 0 before proceeding to manual steps.**

If it fails, fix the issue, re-run, and confirm a clean pass.

> In environments where `pnpm` is not on PATH, run:
> `node scripts/smoke-beta-gate.mjs`

---

## 4. Step 2 -- Rust workspace checks (CI or local)

These are performed by CI on every PR. Confirm the candidate commit is green:

```
CI: Rust workspace      -- green
CI: Frontend checks     -- green
CI: Script and hygiene  -- green
CI: Version consistency -- green
CI: Workflow lint       -- green
CI: Dependency audit    -- green
```

To verify locally before CI:

```bash
cargo fmt --all --check
cargo clippy --workspace -- -D warnings
cargo test --workspace
```

---

## 5. Step 3 -- Prepare a disposable test copy

All mutating steps (save, commit, push, pull) must be performed on a
**disposable copy** of `examples/example-repository` placed **outside** the
project directory. This ensures the tracked example fixture stays clean and
`git status` in the project repository remains clean throughout the test.

```bash
# Create a temp directory and copy the fixture into it
cp -r /path/to/project/examples/example-repository /tmp/ris-smoke-test

# Verify the project repo is still clean
git -C /path/to/project status
# Expected: nothing to commit, working tree clean
```

Open the copy (`/tmp/ris-smoke-test`) in the app for all subsequent steps.

> **Rule:** Never save, commit, or push from the tracked
> `examples/example-repository` directory inside the project.
> Every mutating action uses `/tmp/ris-smoke-test` (or equivalent temp path).

---

## 6. Step 4 -- Manual UI smoke walk

Start the app in dev mode:

```bash
pnpm dev
```

The app opens at `http://localhost:1420` in the WebView. Work through each
section below. Check each item before moving to the next.

---

### 6.1 App launch and initial state

- [ ] App shell loads without blank screen or unhandled exception.
- [ ] Left navigation shows the Repository tab (no repo open).
- [ ] No console errors in the WebView dev tools.

---

### 6.2 Open the disposable test copy

- [ ] Click **Open** on the Repository tab.
- [ ] Navigate to `/tmp/ris-smoke-test` (the copy prepared in Step 3).
- [ ] Repository Summary appears with non-zero counts (3 locations, 6 racks, 50+ devices).
- [ ] All tabs (Locations, Racks, Devices, Device Models, CSV Import, Validation, Git) are accessible.
- [ ] Search bar is visible.
- [ ] No errors in the WebView console.

---

### 6.3 Locations, racks, devices, placements

- [ ] **Locations**: Navigate to Locations. At least 3 rows visible (Warsaw HQ, Gdansk, Lodz).
- [ ] Click the **Warsaw HQ row** -- the Racks tab opens showing only Warsaw HQ racks.
- [ ] **Racks**: At least 3 racks listed for Warsaw HQ.
- [ ] Click a rack row to open Rack Detail.
- [ ] **Rack diagram**: Rack diagram is rendered; placed devices are visible as colored cards.
- [ ] Click an empty U-slot -- Place modal opens with U prefilled.
- [ ] Dismiss the modal (Cancel) -- no crash or stale state.
- [ ] Click a placed card in the rack -- Placement Inspector opens on the right.
- [ ] **Devices**: Navigate to Devices. Table shows 50+ rows. Names are displayed (not codes).
- [ ] Filter or scroll to verify no obvious rendering errors.
- [ ] **Device Models**: Navigate to Device Models. 17+ models visible. Names visible.

---

### 6.4 Create a test location and rack

- [ ] Navigate to Locations. Click **Add location**.
- [ ] Leave code blank (auto-generated). Enter name `Smoke Test Location`. Submit.
- [ ] Success message appears. `Smoke Test Location` is visible in the table.
- [ ] Unsaved changes banner is shown at the top.
- [ ] Click the **Smoke Test Location row** -- Racks tab opens for that location.
- [ ] Add a rack: name `Smoke Rack 01`, height 10.
- [ ] Success message appears. Rack is visible in the list.

---

### 6.5 Save data

- [ ] Navigate to Validation. Click **Validate repository**.
- [ ] Validation completes. No unexpected blocking errors (warnings for unplaced devices are acceptable).
- [ ] Click **Save changes**.
- [ ] Success message. Unsaved changes banner disappears.

---

### 6.6 Close and reopen -- persistence check

- [ ] On the Repository tab, note the path (`/tmp/ris-smoke-test`).
- [ ] Click **Close**.
- [ ] Repository tab returns to initial (open/create) state.
- [ ] Re-open `/tmp/ris-smoke-test`.
- [ ] Locations list includes `Smoke Test Location` -- confirming the save persisted.
- [ ] Rack `Smoke Rack 01` is visible in the Racks list.

---

### 6.7 Unsaved changes / dirty guard

- [ ] Open the test copy (if not already open).
- [ ] Add a location: name `Temp Location`. **Do not save**.
- [ ] Click **Close** on the Repository tab.
- [ ] Confirmation dialog appears: "You have unsaved in-memory changes. Close anyway?"
- [ ] Click **Cancel** -- repository remains open.
- [ ] Click **Close** again, then confirm.
- [ ] Repository closes cleanly.

---

### 6.8 Git status and dirty indicator

- [ ] Open the test copy.
- [ ] Navigate to the **Git** section (left nav or Repository tab).
- [ ] Git status is displayed: branch name, ahead/behind count, last commit.
- [ ] Add a location (name `Git Dirty Test`). Do not save.
- [ ] The UI shows unsaved-changes indicator.
- [ ] Save changes (Validation -> Save changes).
- [ ] Git panel now shows the repository as dirty (uncommitted local changes).
- [ ] Discard or commit those changes before the push/pull step below.
- [ ] **After this step**: verify the project repo is still clean:
  `git -C /path/to/project status` -- should still show clean working tree.

---

### 6.9 Push/pull check -- safe test repository only

> **Use only a safe, disposable test repository.**
> Do not use the tracked `examples/example-repository` or any private repo.
> Do not proceed with push/pull on a repository whose remote you do not control.

- [ ] Open a repository backed by a personal test GitHub remote (the test copy
  at `/tmp/ris-smoke-test`, or a freshly created repo).
- [ ] Commit some changes in the app (add a location, save, then use Git Commit).
- [ ] Attempt **Push** with no upstream set -- app shows appropriate first-push guidance.
- [ ] After push succeeds, make another change, save, commit, and push again.
- [ ] Attempt **Pull** -- completes or returns a clean "nothing to pull" message.
- [ ] Open a repository with **no configured origin** remote -- app shows a clear
  "No remote named origin is configured" error -- no crash, no invented URL.

---

### 6.10 Cancel operation behavior

- [ ] Open a file dialog (Open repository) and click **Cancel** -- no crash, no stale state.
- [ ] Open the Place modal, fill in a device and U slot, then click **Cancel** -- no crash, rack diagram unchanged.
- [ ] Open the Edit Placement modal, make changes, then click **Cancel** -- no changes applied.

---

### 6.11 Create a new repository

- [ ] Click **Create** on the Repository tab.
- [ ] Click **Browse…** next to **Parent directory** and select an empty disposable parent directory (e.g. `/tmp`).
- [ ] Enter a **Code** such as `ris-new-repo`. The path preview shows `/tmp/ris-new-repo`.
- [ ] Enter a **Name** such as `RIS New Repo`.
- [ ] Click **Create repository**.
- [ ] Repository is created inside `/tmp/ris-new-repo`. Git is initialized automatically.
- [ ] Repository summary shows zero counts.
- [ ] Add a location and rack; save. Files appear inside `/tmp/ris-new-repo`.
- [ ] Attempt to create a second repository with the same parent and code — app shows an error that the directory already exists.

---

### 6.12 CSV import

- [ ] Open the test copy.
- [ ] Navigate to **CSV Import**.
- [ ] Paste the following CSV:

  ```
  device_type,status,name
  server,planned,Smoke Import Server
  network,in_stock,Smoke Import Switch
  ```

- [ ] Click **Preview** -- 2 rows shown, action `Create`, no errors.
- [ ] Click **Import** -- success message, 2 devices imported.
- [ ] Navigate to **Devices** -- new devices are visible.

---

### 6.13 Log check

Logs are written to:

| Platform | Default log path |
|---|---|
| Windows | `%PROGRAMDATA%\TechTradeExpress\RackInventoryStudio\logs\` |
| macOS / Linux (dev) | Tauri default log directory for the app identifier |

To find the active log path: **Settings -> Diagnostics and logs -> Open logs folder**.

- [ ] Open logs folder via Settings.
- [ ] Log file exists and contains recent entries (launch, open repo, save, etc.).
- [ ] Logs do **not** contain passwords, tokens, or SSH passphrases.
- [ ] Logs do **not** contain full file paths to private user directories beyond the repo root.
- [ ] Logs do **not** contain raw YAML or raw CSV content.
- [ ] No `ERROR` or `PANIC` entries after normal operations.

---

### 6.14 OS window close button

- [ ] With a repository open and no unsaved changes, click the OS title-bar **X** button.
- [ ] App closes immediately -- no dialog, no hang.
- [ ] With a repository open and unsaved changes (add a location, do not save), click the OS **X** button.
- [ ] Unsaved-changes dialog appears.
- [ ] Click **Cancel** -- app remains open, repository unchanged.
- [ ] Click **X** again, then click **Continue without saving** -- app closes cleanly.

---

### 6.15 Installer: no false "running" prompt

This check applies only when testing on a Windows machine with the built installer.

- [ ] On a fresh machine (or after uninstalling completely), run the installer.
- [ ] Installer does **not** show "Rack Inventory Studio is currently running" on first install.
- [ ] Close the app. Run the installer again (update flow).
- [ ] Installer does **not** show the running prompt (app is already closed).
- [ ] Launch the app. Run the installer again without closing the app first.
- [ ] Installer **does** show the prompt and offers to close the app automatically.
- [ ] Click OK -- installer closes the app and proceeds without error.

---

### 6.16 Project repo cleanliness check

After completing all manual steps, verify the project repository itself is unchanged:

```bash
git -C /path/to/project status
# Expected: nothing to commit, working tree clean

git -C /path/to/project diff HEAD
# Expected: (no output)
```

If any project files were accidentally modified, review and revert before tagging.

---

## 7. Blockers vs. non-blockers

### Release blockers (fix before tagging beta)

| Type | Example |
|---|---|
| App fails to launch | Crash on startup, blank WebView |
| Data corruption | Save writes incorrect YAML; reload does not match saved state |
| Git operation invents a URL or leaks credentials | Constructed URL instead of `origin` remote |
| Panic or unhandled Rust error visible in UI | |
| Log contains password, token, or passphrase | |
| Dirty guard does not fire before close | |
| OS window close button does not close the app | Window close broken |
| Installer shows false "running" prompt | Blocks fresh installs |
| Production build has inline scripts or styles | CSP regression |
| Cargo test failures | |
| CI not green on candidate commit | |

### Non-blockers (document and track)

| Type | Example |
|---|---|
| Minor UI polish | Alignment, spacing, colour |
| Missing fallback text for edge-case device/model names | Shows empty string instead of `Unnamed device` |
| Non-critical warning in Validation | Expected for demo data |
| Dependabot PR open | Handled separately after beta tag |

---

## 8. Pass / fail

### PASS criteria (all must be true)

- [ ] `pnpm smoke:beta` exits 0.
- [ ] All CI checks green on the candidate commit.
- [ ] All manual steps above completed with no blockers found.
- [ ] Log check passed (no credential leakage, no panics).
- [ ] Project repo `git status` clean after all steps.

### FAIL criteria (any one fails the gate)

- Any automated check exits non-zero.
- Any blocker from section 7 observed during manual steps.
- CI not green.
- Project repo `git status` dirty after test (tracked fixture was accidentally modified).

---

## 9. After gate passes

1. Cut release branch: `git checkout -b release/v0.1.0-beta.N`.
2. Trigger **Windows Installer** workflow on the release branch.
3. Run full `BETA_WINDOWS_11_QA_EN.md` on the built installer.
4. Tag and create GitHub Release only after Windows 11 QA passes.
