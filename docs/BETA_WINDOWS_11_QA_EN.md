# Windows 11 Beta QA Runbook — Rack Inventory Studio

This is the Windows 11 beta QA runbook for Rack Inventory Studio.
It validates the current beta hardening state. It does not mark V1 as ready.

---

## 1. Purpose

Verify that the current beta build installs, launches, and operates correctly on
Windows 11. All automated CI checks and installer workflows must pass before this
manual QA pass begins.

---

## 2. Required inputs

| Input | Value |
|-------|-------|
| App version | v0.1.0 |
| Branch / commit under test | `qa/beta-windows-installer-validation` |
| Windows Installer artifact | `rack-inventory-studio-v0.1.0-windows-installer` |
| Windows Diagnostic Installer artifact | `rack-inventory-studio-v0.1.0-windows-diagnostic-installer` |
| Test machine | Clean or representative Windows 11 machine |
| Git on PATH | Required — Git must be installed and on PATH |
| Test repository | Example repo or a disposable new repo |

---

## 3. Installer artifact verification

Before installing, confirm:

| Check | Expected |
|-------|----------|
| Standard artifact name | `rack-inventory-studio-v0.1.0-windows-installer` |
| Diagnostic artifact name | `rack-inventory-studio-v0.1.0-windows-diagnostic-installer` |
| Installer file inside artifact | `Rack Inventory Studio_0.1.0_x64-setup.exe` |
| Diagnostic artifact extra file | `diagnostic-readme.txt` |
| SmartScreen warning | Expected — build is unsigned |

---

## 4. Install and launch checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 4.1 | Installer runs; accept SmartScreen warning | | |
| 4.2 | App launches without crash | | |
| 4.3 | Custom app icon visible in taskbar / Start | | |
| 4.4 | No unexpected console/cmd windows on launch | | |
| 4.5 | App version shown in Settings → About matches expected | | |

---

## 5. Repository open/create checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 5.1 | Open example repository | | |
| 5.2 | Create a disposable new repository | | |
| 5.3 | Git is initialized automatically for new repo | | |
| 5.4 | Opening a recent repository opens directly (not only fills path) | | |
| 5.5 | Unsaved-changes guard appears before replacing/closing a dirty repository | | |

---

## 6. Global busy overlay and Git console-window checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 6.1 | Open repository — busy overlay appears and clears | | |
| 6.2 | Refresh Git status — busy overlay appears and clears | | |
| 6.3 | Save changes — busy overlay appears and clears | | |
| 6.4 | Commit — busy overlay appears and clears | | |
| 6.5 | Pull — busy overlay appears and clears | | |
| 6.6 | Push (or attempt with expected error) — busy overlay appears and clears | | |
| 6.7 | UI is blocked while Git operation runs | | |
| 6.8 | No transient cmd/console windows flash during any Git operation | | |
| 6.9 | Error cases clear the overlay and show a panel error message | | |

---

## 7. Navigation and Settings checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 7.1 | Racks nav is hidden immediately after opening repository | | |
| 7.2 | Locations → Manage racks reveals Racks nav with location context subtitle | | |
| 7.3 | Settings opens from the left nav | | |
| 7.4 | Settings is accessible before opening a repository | | |
| 7.5 | Left rail does not duplicate or double-show app branding | | |

---

## 8. Rack detail and placement workflow checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 8.1 | Locations → Manage racks → open rack detail | | |
| 8.2 | Rack diagram is visually dominant (left side) | | |
| 8.3 | Right sidebar is palette-only — no inline "Add Placement" form | | |
| 8.4 | Placement table shows columns: U, Name, Type, Model/SKU, Serial, Asset tag, Actions | | |
| 8.5 | Click empty U-slot → PlacePlacementModal opens with U prefilled | | |
| 8.6 | Palette "Place…" button → modal opens with target preselected | | |
| 8.7 | Drag from palette to empty slot → modal opens with target and U preselected | | |
| 8.8 | Place a device — placement appears in diagram and table | | |
| 8.9 | Edit placement — change Start U | | |
| 8.10 | Edit placement — set Height U override | | |
| 8.11 | Edit placement — clear Height U override back to default | | |
| 8.12 | Remove placement via ConfirmDialog | | |
| 8.13 | Change side via ConfirmDialog (not a casual dropdown) | | |
| 8.14 | Switch Front/Rear view; inspector clears | | |
| 8.15 | Busy overlay appears and clears for all placement mutations | | |

---

## 9. Device Models terminology checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 9.1 | Add/Edit Device Model modal label: "Manufacturer model / SKU" | | |
| 9.2 | Help text explains vendor/catalog/SKU meaning | | |
| 9.3 | Device Models table column: "Model / SKU" | | |
| 9.4 | Existing `model_number` YAML/DTO field is still read/written correctly | | |

---

## 10. CSV import checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 10.1 | Download sample CSV from the import panel | | |
| 10.2 | Open sample CSV and confirm schema/column names are clear | | |
| 10.3 | Paste or load sample CSV into import preview | | |
| 10.4 | Preview renders correctly | | |
| 10.5 | Warning rows are not double-counted in import summary | | |
| 10.6 | Import button count matches importable rows | | |

---

## 11. Validation and save wording checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 11.1 | Validation button label: "Validate repository" | | |
| 11.2 | Save button label: "Save changes" | | |
| 11.3 | Empty-state text explains validation reads in-memory data (does not write files) | | |
| 11.4 | Save writes local YAML only | | |
| 11.5 | Commit and push remain explicit Git actions | | |

---

## 12. Diagnostics logging checks

| # | Check | Result | Notes |
|---|-------|--------|-------|
| 12.1 | Diagnostic build creates logs under `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\` | | |
| 12.2 | Logs appear after launch, open repo, save, validate, Git actions | | |
| 12.3 | Logs do NOT contain full user paths | | |
| 12.4 | Logs do NOT contain passwords, tokens, or secrets | | |
| 12.5 | Logs do NOT contain raw YAML or raw CSV content | | |
| 12.6 | Repository basename and branch names in logs are acceptable | | |

---

## 13. Results summary table

| Area | Result | Notes | Evidence (screenshot / log path) |
|------|--------|-------|----------------------------------|
| Install and launch | | | |
| Repository open/create | | | |
| Busy overlay and Git console | | | |
| Navigation and Settings | | | |
| Rack detail and placement | | | |
| Device Models terminology | | | |
| CSV import | | | |
| Validation and save wording | | | |
| Diagnostics logging | | | |

---

## 14. Exit criteria

Beta QA can be considered **passed** only when **all** of the following are true:

- [ ] Automated CI is green on the release commit.
- [ ] Windows installer workflow succeeds and produces a versioned artifact.
- [ ] Windows diagnostic installer workflow succeeds and produces a versioned artifact with `diagnostic-readme.txt`.
- [ ] Windows 11 manual QA checklist above is fully completed.
- [ ] No blocking bugs remain open.
- [ ] All known non-blocking issues are documented.

Until the manual QA checklist is completed on a real Windows 11 machine,
**do not announce or distribute this beta build as QA-passed.**
