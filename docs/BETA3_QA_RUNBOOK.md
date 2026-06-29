# Rack Inventory Studio — Beta 3 QA Runbook

## Scope

This runbook covers manual verification of all features introduced in beta.3:

- List views: scroll and pagination correctness.
- Search, sort, and filter for Devices and Device Models.
- Searchable selects (comboboxes) with keyboard navigation.
- Device form: auto-fill Device Type from Device Model; work mode defaults.
- Create similar for Devices and Device Models.
- Placement flow: Rack Object inline form; front/rear handling.
- Front/rear rack side view toggle.
- Clone repository flow.
- Rack view export (SVG and PNG).
- Daily log files and retention cleanup.
- Settings diagnostics: active log dir, current log file, retention.
- Regression check for Git operations and core navigation.

## Preconditions

- Application built and running locally (dev or production binary).
- A local RIS repository available for opening.
- Git available in `PATH`.
- At minimum: one Location, one Rack, one Device Model, two Devices, one front
  placement and one rear placement in the test repository.
- A folder writable by the app for clone target and export files.
- Optional: a reachable Git remote (HTTPS public or SSH) for clone and push tests.
- Optional: SSH key configured for passphrase prompt testing.

## Test matrix

---

### 1. Repository: open / create / clone

| # | Action | Expected |
|---|--------|----------|
| 1.1 | Open an existing RIS repository via "Open repository" | Repository opens; locations and racks visible |
| 1.2 | Create a new repository via "Create repository" | Wizard completes; empty repo opens |
| 1.3 | Clone a public HTTPS repository into an empty target folder | Clone completes; app opens cloned repo; validates as RIS repository |
| 1.4 | Clone with a non-RIS repository URL | Clone succeeds; app shows validation error; no crash |
| 1.5 | Clone into an existing non-empty folder | Error shown before clone starts ("already exists"); no crash |
| 1.6 | Clone with a blank Git URL | Inline validation prevents submit |
| 1.7 | Clone with a blank parent directory | Inline validation prevents submit |
| 1.8 | After clone: confirm remote origin matches entered URL | Use Settings → Git or terminal `git remote -v` |
| 1.9 | *(SSH/alias, if SSH key available)* Clone SSH URL | Clone uses SSH; passphrase prompt appears if key is encrypted |

---

### 2. List views: scroll, pagination, and counters

| # | Action | Expected |
|---|--------|----------|
| 2.1 | Open Locations list with ≥ 20 locations | All entries scrollable; counter matches total |
| 2.2 | Open Racks list with ≥ 20 racks | All entries scrollable; counter matches total |
| 2.3 | Open Device Models list with ≥ 20 models | All entries scrollable; counter matches total |
| 2.4 | Open Devices list with ≥ 20 devices | All entries scrollable; counter matches total |
| 2.5 | Resize window to small height | Rows still scrollable; no rows hidden behind footer |

---

### 3. Search, sort, and filter

| # | Action | Expected |
|---|--------|----------|
| 3.1 | Search Devices by name | List narrows to matching devices; clears on backspace |
| 3.2 | Search Device Models by name | List narrows to matching models |
| 3.3 | Sort Devices by name (asc/desc) | Order changes correctly |
| 3.4 | Sort Device Models by manufacturer | Order changes correctly |
| 3.5 | Filter Devices by status (planned / installed) | List shows only matching status |
| 3.6 | Filter Devices by placed / unplaced | List filters correctly |
| 3.7 | Combine search + filter | Results reflect both constraints |
| 3.8 | Clear all filters | Full list restored |
| 3.9 | Search that returns no results | "No results" state shown; no crash |

---

### 4. Searchable selects

| # | Action | Expected |
|---|--------|----------|
| 4.1 | Open Add Device form; click Device Model field | Dropdown opens with searchable list |
| 4.2 | Type partial model name | List filters to matching models |
| 4.3 | Press ArrowDown / ArrowUp | Highlighted option moves |
| 4.4 | Press Home / End | Jumps to first / last option |
| 4.5 | Press Enter on highlighted option | Option selected; dropdown closes |
| 4.6 | Press Escape | Dropdown closes; selection unchanged |
| 4.7 | Click an option with mouse | Option selected; dropdown closes |
| 4.8 | Hover option with mouse | Option highlighted |
| 4.9 | Type until no results match | "No results" message shown |
| 4.10 | Open placement modal; open unplaced device picker | Searchable select appears; same keyboard behaviour |
| 4.11 | Open placement modal; switch to "Rack object"; open model picker | Searchable select for rack object models |

---

### 5. Device form: work mode and auto-fill

| # | Action | Expected |
|---|--------|----------|
| 5.1 | Set mode to **Planning**; open Add Device | Status defaults to "planned" |
| 5.2 | Set mode to **On-site**; open Add Device | Status defaults to "installed" |
| 5.3 | In either mode, manually change status before saving | Saved status matches manual choice |
| 5.4 | Edit an existing device | Status not overwritten by mode |
| 5.5 | Select a Device Model with a known Device Type | Device Type auto-fills from model |
| 5.6 | Select a model; then manually change Device Type | Manual type stays; is not overwritten |
| 5.7 | Manually set Device Type; then select a different model | Type stays as manually entered (not overwritten) |
| 5.8 | Clear Device Type manually; then select a model | Device Type remains manually controlled; model selection does not auto-fill again in this session |

---

### 6. Create similar

| # | Action | Expected |
|---|--------|----------|
| 6.1 | Device Models list: click Create similar on a model | Add Device Model form opens pre-filled with copied fields |
| 6.2 | Verify not copied: model code, external refs, metadata IDs | Those fields are blank |
| 6.3 | Save the similar model | New model saved with distinct identity |
| 6.4 | Devices list: click Create similar on a device | Add Device form opens pre-filled |
| 6.5 | Verify not copied: serial, asset tag, hostname, IP, MAC | Those fields are blank |
| 6.6 | Close form without saving | Dirty-guard prompt shown if fields modified |

---

### 7. Placement flow and Rack Object form

| # | Action | Expected |
|---|--------|----------|
| 7.1 | Open a rack; click an empty slot | Placement modal opens |
| 7.2 | Select an existing device from the picker; confirm | Device placed; slot shows device |
| 7.3 | Switch to "Rack object" tab; select a model | Rack object placed |
| 7.4 | Switch to "Rack object" tab; click "Create new" | Rack Object form opens with Device Type locked to "rack_object" |
| 7.5 | Fill form and save; return to placement modal | New rack object preselected in picker |
| 7.6 | Place in front and rear separately | Each side shows correct placements |
| 7.7 | Move a placement to a different slot | Move succeeds; old slot empty; new slot shows device |
| 7.8 | Remove a placement | Slot becomes empty; device returns to unplaced pool |
| 7.9 | Close placement modal without placing | No change in rack |

---

### 8. Front / rear rack side view

| # | Action | Expected |
|---|--------|----------|
| 8.1 | Open a rack detail view | Front side shown by default |
| 8.2 | Click "Rear" toggle | Rear placements shown |
| 8.3 | Click "Front" toggle | Front placements restored |
| 8.4 | Front device not visible on Rear view | Each side shows only its own placements |
| 8.5 | Keyboard: focus toggle and press Space or Enter | Side switches |

---

### 9. Export rack view

| # | Action | Expected |
|---|--------|----------|
| 9.1 | Front view visible; click Export SVG | Save dialog opens |
| 9.2 | Choose a file path and confirm | SVG file written; no error banner |
| 9.3 | Open the saved SVG in a browser | Rack diagram readable; device names visible |
| 9.4 | Click Export PNG on front view | Save dialog opens |
| 9.5 | Choose a file path and confirm | PNG file written; no error banner |
| 9.6 | Open the saved PNG | Image shows rack at ≥ 900 px wide |
| 9.7 | Repeat for Rear side | Both front and rear SVG/PNG are distinct |
| 9.8 | Cancel save dialog (no path chosen) | No error banner shown |
| 9.9 | Verify default filenames | Front and rear filenames include the rack name and side |

---

### 10. Logs and diagnostics

| # | Action | Expected |
|---|--------|----------|
| 10.1 | Launch the app; open Settings → Diagnostics and logs | Active log directory shown |
| 10.2 | Verify current log file name | Name matches `ris-YYYY-MM-DD.log` for today's date |
| 10.3 | Verify log retention shown | "30 days" displayed |
| 10.4 | Check directory status | "accessible", "will be created on first log write", or "not writable — check permissions" shown next to path |
| 10.5 | Click "Open logs folder" | OS file manager opens on the log directory |
| 10.6 | Inspect log directory | Contains only `ris-YYYY-MM-DD.log` files; no single unbounded file |
| 10.7 | Relaunch the app on the same calendar day | Same daily log file used; not a new file |
| 10.8 | *(Simulate old log)* Place a `ris-1970-01-01.log` file in the log dir; relaunch | Old file deleted on startup |
| 10.9 | Place a `not-ris-file.log` in the log dir; relaunch | Non-RIS file not deleted |
| 10.10 | Click "Choose logs folder…"; pick a different directory | Settings shows new directory; restart notice shown |
| 10.11 | After restart: verify app logs to new directory | New directory contains `ris-YYYY-MM-DD.log` |
| 10.12 | Click "Reset to default" | Custom directory cleared; default path shown; restart notice if needed |
| 10.13 | Click "Open logs folder" when xdg-open not available *(Linux)* | Friendly error with the path shown; no raw OS error string |

---

### 11. Git operations regression

| # | Action | Expected |
|---|--------|----------|
| 11.1 | Commit pending changes | Commit dialog works; status updates |
| 11.2 | Pull (fast-forward only) | Pull completes or shows "already up to date" |
| 11.3 | *(Remote available)* Push | Push succeeds |
| 11.4 | Close app with uncommitted changes | Dirty-guard prompt shown |
| 11.5 | *(SSH key with passphrase)* Push via SSH | Passphrase prompt appears; enter passphrase; push completes |
| 11.6 | Navigate to Git status view | Status reflects current repo state |

---

### 12. Final regression

| # | Action | Expected |
|---|--------|----------|
| 12.1 | Build a fresh release binary | Build completes without errors |
| 12.2 | Launch from clean working directory | App opens; repository panel visible |
| 12.3 | Open a recent repository from history | Repository loads without re-selecting path |
| 12.4 | Navigate between all main tabs | No blank screens; no JS errors in console |
| 12.5 | Close the app normally | App exits cleanly |

---

## Expected artifacts

After completing this runbook, the tester should record:

| Field | Value |
|-------|-------|
| OS and version | |
| Commit / build | |
| Build mode (dev / release) | |
| Repository path | |
| Test date | |
| Tester | |
| Result (pass / fail / partial) | |
| Blockers found | |
| Notes | |

---

## Known limitations

- Mid-session log rotation is not implemented: if the app runs past midnight UTC, the session continues writing to the launch-day log file until restarted.
- Log retention default (30 days) is not user-configurable in this release.
- PDF export is out of scope for beta.3.
