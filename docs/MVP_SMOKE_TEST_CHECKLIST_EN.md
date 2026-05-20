# MVP Smoke-Test Checklist

Use this checklist to verify that the full end-to-end workflow is functional
after any significant change or before a release candidate.

Run in a clean session (no open repository at start).

---

## 1. Open repository

- [ ] Launch the desktop app.
- [ ] On the **Repository** tab, enter the path to a test repository (e.g. `examples/example-repository`) and click **Open**.
- [ ] Repository Summary table is shown with correct counts (Locations, Racks, Device Models, Devices, Placements).

---

## 2. Create a Location

- [ ] Navigate to the **Locations** tab.
- [ ] Fill in: Code `SMOKE-LOC`, Name `Smoke Test Location`.
- [ ] Click **Add location**.
- [ ] Success message appears; location is visible in the table.
- [ ] Unsaved changes banner appears at the top of the app.
- [ ] Switch to **Repository** tab — Device count in summary stays the same (locations not counted in that row), but no crash.

---

## 3. Create a Rack

- [ ] Navigate to the **Racks** tab.
- [ ] Select location `SMOKE-LOC`, fill in: Code `SMOKE-R01`, Name `Smoke Rack 01`, Height `42`.
- [ ] Click **Add rack**.
- [ ] Success message appears; rack `SMOKE-R01` is visible in the racks table.
- [ ] Unsaved changes banner is still visible.

---

## 4. Create a Device Model

- [ ] Navigate to the **Device Models** tab.
- [ ] Fill in: Type `server`, Code `SMOKE-MODEL`, Name `Smoke Server Model`, Height `2`.
- [ ] Click **Add device model**.
- [ ] Success message appears; model is visible in the table.

---

## 5. Create a Device Model (rack_object)

- [ ] On the **Device Models** tab, fill in: Type `rack_object`, Code `SMOKE-PATCH`, Name `Smoke Patch Panel`, Height `1`.
- [ ] Rack object hint is shown below the form.
- [ ] Click **Add device model**.
- [ ] Success message appears; `SMOKE-PATCH` is visible in the table.

---

## 6. Create a Device (manual)

- [ ] Navigate to the **Devices** tab.
- [ ] Fill in: Type `server`, Code `SMOKE-DEV01`, Name `Smoke Server 01`, Status `planned`.
- [ ] Optionally select model `SMOKE-MODEL`.
- [ ] Click **Add device**.
- [ ] Success message appears; `SMOKE-DEV01` is visible in the table.
- [ ] Unsaved changes banner remains visible.

---

## 7. CSV Import

- [ ] Navigate to the **CSV Import** tab.
- [ ] Paste the following CSV into the textarea:

```
code,device_type,status,name
SMOKE-DEV02,server,planned,Smoke Server 02
SMOKE-DEV03,network,in_stock,Smoke Switch 01
```

- [ ] Click **Preview**.
- [ ] Preview table shows 2 rows, both with action `Create`, no errors.
- [ ] No blocked banner is shown.
- [ ] Click **Import**.
- [ ] Success message shows "Imported 2 device(s)".
- [ ] Textarea is cleared; preview is cleared.
- [ ] Unsaved changes banner is visible.
- [ ] Switch to **Devices** tab — `SMOKE-DEV02` and `SMOKE-DEV03` appear in the list (auto-refresh via mutation token).
- [ ] Switch back to **Repository** tab — Devices count has increased to reflect the new devices.

---

## 8. Place a device in a rack

- [ ] Navigate to the **Racks** tab.
- [ ] Click rack `SMOKE-R01` to open Rack Detail.
- [ ] In the **Add Placement** section, select mode **Device**.
- [ ] Device selector shows `SMOKE-DEV01`, `SMOKE-DEV02`, `SMOKE-DEV03` (unplaced).
  - If CSV-imported devices are missing here, the global mutation token is not propagating — this is a regression.
- [ ] Select `SMOKE-DEV01`, Side `Front`, Start U `1`.
- [ ] Click **Add**.
- [ ] Success message appears; rack diagram shows the new placement.
- [ ] `SMOKE-DEV01` is removed from the device selector (no longer unplaced).

---

## 9. Place a rack object

- [ ] In the same Rack Detail for `SMOKE-R01`, switch to mode **Rack Object**.
- [ ] Model selector shows `SMOKE-PATCH`.
- [ ] Select `SMOKE-PATCH`, Side `Front`, Start U `3`.
- [ ] Click **Add**.
- [ ] Success message appears; placement is shown in the rack diagram and table.

---

## 10. Move a placement

- [ ] Click the placement for `SMOKE-DEV01` in the Front placement table.
- [ ] Placement Inspector shows device details.
- [ ] Change Side to `Rear`, Start U `1`, and click **Move**.
- [ ] Placement moves to the rear; rack diagram updates accordingly.

---

## 11. Remove a placement

- [ ] Select the rack object placement (SMOKE-PATCH) in the placement table.
- [ ] In the Placement Inspector, click **Remove placement**.
- [ ] Confirm the dialog.
- [ ] Placement is removed; rack diagram updates.
- [ ] `SMOKE-PATCH` reappears in the rack_object model selector.

---

## 12. Validation

- [ ] Navigate to the **Validation** tab.
- [ ] Click **Validate**.
- [ ] Result shows validation summary — no unexpected errors (warnings for unplaced devices are acceptable).

---

## 13. Save

- [ ] On the **Validation** tab, click **Save**.
- [ ] Success message shown; unsaved changes banner disappears.
- [ ] Navigate to **Repository** tab — summary counts reflect all created objects.

---

## 14. Reload (persistence check)

- [ ] On the **Repository** tab, note the repo path.
- [ ] Click **Close**.
- [ ] Re-enter the same path and click **Open**.
- [ ] Locations table: `SMOKE-LOC` present.
- [ ] Racks table: `SMOKE-R01` present with correct placement counts.
- [ ] Devices table: `SMOKE-DEV01`, `SMOKE-DEV02`, `SMOKE-DEV03` present.
- [ ] Device Models table: `SMOKE-MODEL`, `SMOKE-PATCH` present.
- [ ] Rack Detail for `SMOKE-R01`: rear placement for `SMOKE-DEV01` present; no rack-object placement (removed in step 11).

---

## 15. Close with unsaved changes

- [ ] Add a new location (e.g. Code `TMP`, Name `Temp`) but do NOT save.
- [ ] Click **Close**.
- [ ] A confirmation dialog appears: "You have unsaved in-memory changes. Close anyway?"
- [ ] Click **Cancel** — repository remains open.
- [ ] Click **Close** again, then confirm.
- [ ] Repository closes; Repository tab returns to initial state.

---

---

## 16. Validation navigation drill-down

- [ ] Navigate to the **Validation** tab and click **Validate**.
- [ ] In the Issues table, find an issue with a known object (e.g. a rack or device).
- [ ] A **Navigate** column is shown; navigable issues show a button (e.g. "Open Rack", "Open Device").
- [ ] Click "Open Rack" on a rack-related issue — app switches to Racks tab and selects/highlights the rack.
- [ ] Click "Open Device" on a device issue — app switches to Devices tab and the device row is highlighted in yellow.
- [ ] Click "Open Location" on a location issue — app switches to Locations tab and the location row is highlighted.
- [ ] Click "Open Device Model" on a device_model issue — app switches to Device Models tab and the model row is highlighted.
- [ ] Issues without a mapped target show a dash (—) in the Navigate column.
- [ ] Navigating from a placement issue (e.g. collision) navigates to the Racks tab and opens the relevant rack.
- [ ] Existing Validate and Save buttons still work after navigation.

---

## Pass criteria

All checkboxes above are checked with no unexpected errors or crashes.

---

## v1.0.0 release gate

Before tagging v1.0.0, all of the following must pass in addition to this manual checklist:

### Automated test suite

- [ ] `cargo test --workspace` — all Rust tests pass with no failures or ignored panics.
- [ ] `pnpm --filter @rack-inventory-studio/desktop typecheck` — TypeScript type check clean.
- [ ] `pnpm --filter @rack-inventory-studio/desktop test` — all Vitest unit tests pass.
- [ ] `pnpm --filter @rack-inventory-studio/desktop build` — Vite production build succeeds.

### UI automation (Playwright)

- [ ] Playwright smoke test suite covers the golden path: open → add location → add rack → add device model → add device → CSV import → place device → validate → save → reload.
- [ ] All Playwright tests pass against a production build.

**Playwright smoke tests are now implemented (milestone/playwright-smoke-tests branch).**

Run command:

```bash
pnpm --filter @rack-inventory-studio/desktop test:e2e
```

**How they work:**
- Tests run against a Vite dev server (port 1421) with `vite.config.e2e.ts`.
- Tauri IPC (`@tauri-apps/api/core`) and native file dialogs (`@tauri-apps/plugin-dialog`) are replaced with static fixture mocks via Vite `resolve.alias`.
- This is **not** a full Tauri E2E run — the Rust backend is not involved.
- Browser: Firefox (Chromium requires system libs unavailable in WSL2 dev environment).

**Covered smoke tests (7):**
1. App shell loads without console errors.
2. Open repository enables all tabs + search bar visible.
3. Global search shows results and navigates to Locations tab.
4. Validation panel shows issues and navigates to Devices tab on click.
5. CSV import preview and import flow (textarea → preview table → import result).
6. Rack detail and placement table visible after clicking a rack row.
7. Global search: short query suppresses dropdown; non-matching query shows "No results".

**Out of scope for this smoke layer:**
- Native file dialogs (mocked to return fixture path or null).
- Real Git remote operations.
- Full Tauri E2E with live Rust backend.

### Packaging check

- [ ] Application bundles successfully for the target OS (`.dmg`, `.msi`, or `.AppImage` as applicable).
- [ ] Bundled application launches from a clean install (no pre-installed dependencies required).
- [ ] Example repository can be opened from the bundled app without errors.

### Release documentation

- [ ] `README.md` reflects the released feature set (no "planned" items in the current-status section).
- [ ] User-facing documentation covers: basic workflow, Git auth assumptions, CSV import, create new repository, placement workflow, known limitations.
- [ ] `CHANGELOG.md` entry for v1.0.0 is written and reviewed.

### Release tag

- [ ] Git tag `v1.0.0` is created on `master` after all gates pass.
- [ ] Tag commit message includes a short release summary.
