# Rack Inventory Studio — Beta 4 QA Runbook

## Scope and relationship to other QA documents

This is a **release-specific overlay**, not a standalone full QA suite.
Beta.4 carries the entire feature scope originally prepared for the
unshipped beta.3 (see `docs/releases/v0.1.0-beta.3.md`), so:

- **Run `docs/BETA3_QA_RUNBOOK.md` in full first.** Every check in that
  document (list views, search/sort/filter, searchable selects, work mode,
  create similar, contextual rack object form, front/rear toggle, clone
  repository, rack export SVG/PNG, daily log rotation, diagnostics,
  regression checks) is still the correct beta.3-scope checklist and
  remains required for beta.4 — it is not reproduced here.
- **Also consult `docs/BETA_WINDOWS_11_QA_EN.md`** for the general Windows
  11 installer/environment checklist (SmartScreen, install path,
  uninstall, etc.) — also not reproduced here.
- **This document adds only what's new or newly relevant since beta.3's
  scope was drafted**, plus a small number of targeted regression checks
  for the Windows clone-responsiveness fix and Windows Git/SSH reliability
  work that landed after beta.3's original preparation.

This runbook is for the **packaged installed application**. It does not
require, and should not require, access to the internal E2E Docker
fixture, WSL2, or any development toolchain — if a step seems to need
those, that's a bug in the runbook, not a missing dependency for the QA
tester.

## Preconditions

- Beta.4 installer built from the `release/v0.1.0-beta.4` branch at the
  exact commit under validation.
- A Windows 11 test machine (see `docs/BETA_WINDOWS_11_QA_EN.md` for
  environment specifics).
- Git installed and on `PATH`.
- A reachable Git remote (SSH, with a working key) for the clone/push/pull
  checks below — a real remote (e.g. GitHub, GitLab, or any real SSH Git
  host you control), not the internal test fixture.
- Optional: an existing beta.2 installation on the same machine, to
  exercise the upgrade/reinstall path.

## Beta.4-specific checks

### Install and version

| # | Action | Expected |
|---|--------|----------|
| 4.1 | Run the beta.4 installer on a clean machine (or over a previous install — see 4.2) | Installs without error; SmartScreen "More info → Run anyway" works as expected |
| 4.2 | If a beta.2 (or earlier) install is present, run the beta.4 installer over it | Upgrade/reinstall completes without error; no leftover conflicting shortcuts or Start-menu entries |
| 4.3 | Launch the application after install | Application starts, no error dialogs, no unexpected console/terminal window ever appears |
| 4.4 | Check the application's reported version (Settings, About, or equivalent) | Reports `0.1.0-beta.4` |

### Clone responsiveness (regression check for the UI-thread hang fix)

| # | Action | Expected |
|---|--------|----------|
| 4.5 | Start "Clone repository" against a real remote with a non-trivial repository (large enough that the clone takes at least several seconds) | Application window remains responsive throughout — it can be moved, resized, and its menus/buttons remain interactive while the clone is in progress; it must **not** appear frozen or show "Not Responding" |
| 4.6 | Wait for the clone to complete | Clone succeeds; the cloned directory opens automatically as the active repository, exactly like Create/Open |
| 4.7 | Inspect the opened repository | Locations/racks/devices from the cloned repository are visible and correct |

### Git workflow regression (remote handling)

| # | Action | Expected |
|---|--------|----------|
| 4.8 | From the cloned (or any remote-connected) repository, make a change and push | Push completes; no unexpected errors; credentials/passphrase prompts (if applicable) behave as in beta.3 |
| 4.9 | Pull from the same remote (fast-forward case) | Pull completes normally |
| 4.10 | Close the application, then reopen it and reopen the same repository | Repository reopens cleanly; no state corruption; no crash |

### Diagnostics

| # | Action | Expected |
|---|--------|----------|
| 4.11 | Open **Settings → Diagnostics and logs** | Log directory health, current log filename, and retention window are shown, exactly as in beta.3 |
| 4.12 | Use "Open logs folder" | Opens the correct directory; today's log file is present and contains recent entries |

### Close-out

| # | Action | Expected |
|---|--------|----------|
| 4.13 | Close the application normally after the above | No crash, no leftover process in Task Manager |

## Sign-off

Record, for the exact installer/commit under test:

- Installer filename and version string.
- Windows build tested against (see `docs/BETA_WINDOWS_11_QA_EN.md`).
- Pass/fail for every item above **and** every item in
  `docs/BETA3_QA_RUNBOOK.md`.
- Any deviation, with enough detail to reproduce.

Beta.4 must not be tagged or published until this sign-off, together with
`docs/BETA3_QA_RUNBOOK.md`'s sign-off, is complete with no open blockers.
