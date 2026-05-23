# Windows Diagnostic Installer

Workflow: `.github/workflows/windows-diagnostic-installer.yml`

This workflow produces an unsigned Windows NSIS installer intended for **QA and
diagnostics verification only**. It is separate from the standard Windows installer
workflow (`.github/workflows/windows-installer.yml`) and the artifact is clearly named
`rack-inventory-studio-windows-diagnostic-installer` to distinguish it from any future
production build.

---

## What this workflow is for

- Verify the application installs and launches correctly on Windows 11.
- Confirm that the local diagnostics logging pipeline works end-to-end.
- Confirm that log entries are present for key operations and contain no secrets or full paths.
- Provide QA with a self-contained artifact (installer + instructions) with no extra steps.

---

## How to trigger

The workflow is **`workflow_dispatch` only** — it never runs on push, pull request, or
schedule.

1. Go to the GitHub repository → **Actions** tab.
2. Select **Windows Diagnostic Installer** from the left sidebar.
3. Click **Run workflow** → choose the target branch → **Run workflow**.
4. Wait 15–30 minutes (cold Rust cache) or 5–10 minutes (warm cache).

---

## Artifact

| Property | Value |
|---|---|
| Artifact name | `rack-inventory-studio-windows-diagnostic-installer` |
| Contents | `*.exe` NSIS installer + `diagnostic-readme.txt` |
| Installer format | NSIS (self-extracting, no WiX required) |
| Path inside runner | `target/release/bundle/nsis/*.exe` |
| Retention | 30 days |
| `if-no-files-found` | `error` — build fails visibly if no installer is produced |

Download: open the workflow run page → scroll to **Artifacts** → download the zip.
The zip contains the `.exe` and `diagnostic-readme.txt`.

---

## SmartScreen warning (expected)

The installer is **not code-signed**. On Windows 11, double-clicking the downloaded `.exe`
will show a blue "Windows protected your PC" dialog.

To proceed:
1. Click **More info**.
2. Click **Run anyway**.

This warning disappears once a trusted publisher certificate is added.
Code signing is deferred and not part of this workflow.

---

## Log file location on Windows 11

The app writes logs locally via `tauri-plugin-log`. No network upload.

```
%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\
```

Typical full path:
```
C:\Users\<username>\AppData\Roaming\com.techtradeexpress.rackinventorystudio\logs\
```

**To open the log folder:**
1. Press `Win + R`, type `%APPDATA%`, press Enter.
2. Navigate to `com.techtradeexpress.rackinventorystudio\logs\`.
3. Open the `.log` file with Notepad or any text editor.

Or from a terminal:
```cmd
dir "%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\"
```

> **Note:** The exact log filename is managed by Tauri (`app_log_dir()`) and will be
> confirmed on the first Windows QA run. It is expected to be the app bundle identifier
> or similar.

---

## Windows 11 QA checklist

Perform these actions after installing the diagnostic build:

| Step | Action | Expected outcome |
|------|--------|-----------------|
| 1 | Install the app | SmartScreen warning → accept → installer completes |
| 2 | Launch the app | App opens, no error dialogs |
| 3 | Open the example repository | Repository panel shows entity counts |
| 4 | Click **Validation** tab → **Validate repository** | Issues panel populates |
| 5 | Click **Save changes** | Save banner shows created/updated/unchanged counts |
| 6 | Go to **CSV Import** → paste a sample CSV → **Preview** | Preview table renders |
| 7 | Go to **Repository** tab → check Git section | Git status is visible |
| 8 | Check the log file after each action | Expected entries present (see below) |
| 9 | Close the app | No crash, no Windows error dialog |

---

## Expected log entries

Open the `.log` file and verify these lines appear (values will vary):

```
INFO  Rack Inventory Studio starting
INFO  Rack Inventory Studio frontend initializing
INFO  open_repository: ok code=<repo-code> locations=<n> racks=<n> devices=<n>
INFO  validate_repository: ok errors=0 warnings=0 infos=0
INFO  save_repository: ok created=0 updated=0 unchanged=<n>
INFO  csv_preview: ok rows=<n>
INFO  git_status: is_repo=true branch=main clean=true ahead=0 behind=0
```

Errors are logged at `WARN` or `ERROR` level with sanitized messages.

---

## What must NOT appear in logs

These items must be absent from the log file:

| Category | Examples of what must NOT appear |
|---|---|
| Full file system paths | `C:\Users\alice\Documents\repo\devices.yaml` |
| Passwords / tokens / secrets | Any value containing `password`, `token`, `secret`, `private_key`, `api_key`, `auth` |
| Raw YAML file contents | Any raw multi-line YAML |
| Raw CSV file contents | Any raw CSV rows with device data |
| Serial numbers | Individual device serial numbers |
| Asset tags | Individual device asset tags |

Path references are reduced to basename only by the redaction layer (e.g. `[path:devices.yaml]`).
Error messages containing credential keywords are replaced with `[error message redacted: possible credential]`.

---

## How to collect logs for a bug report

1. Reproduce the issue in the installed app.
2. Navigate to `%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\`.
3. Review the log file to confirm it contains no information you don't wish to share
   (repository codes, Git branch names, and file basenames may appear — these are expected).
4. Attach the `.log` file to the bug report.

---

## Known limitations

| Limitation | Notes |
|---|---|
| Unsigned installer | SmartScreen warning on every machine that has not seen the binary before. Expected for diagnostic builds. |
| Local-only logs | No telemetry, no external upload. Log retention is local and manual. |
| No log rotation | Tauri's default `KeepOne` policy. A single rolling log file. |
| Log filename | The exact `.log` filename is managed by Tauri and will be confirmed during first QA run. |
| MSI/WiX not supported | Only NSIS format is built (`bundle.targets: ["nsis"]`). WiX is not installed on `windows-latest` runners. |
| Visual QA | App visual layout and UX correctness requires a Windows 11 machine with a GUI. Cannot be verified in headless CI. |

---

## Relationship to other workflows

| Workflow | File | Artifact name | Purpose |
|---|---|---|---|
| Windows Installer | `windows-installer.yml` | `rack-inventory-studio-windows-installer` | Standard unsigned installer |
| **Windows Diagnostic Installer** | `windows-diagnostic-installer.yml` | **`rack-inventory-studio-windows-diagnostic-installer`** | **QA + diagnostics build** |

Both workflows are `workflow_dispatch` only. The diagnostic workflow is identical in
build steps but uploads a different artifact name and includes `diagnostic-readme.txt`
alongside the installer.

---

## Logging implementation reference

- **Backend:** `tauri-plugin-log` v2 + `log` crate v0.4. Configured in `apps/desktop/src-tauri/src/lib.rs`.
- **Redaction:** `apps/desktop/src-tauri/src/diagnostics.rs` (Rust) and `apps/desktop/src/lib/redact.ts` (TypeScript).
- **Frontend:** `apps/desktop/src/lib/diagnosticsLog.ts` wraps `@tauri-apps/plugin-log`.
- **Full docs:** `.ai/local-diagnostics-logging.md`.
