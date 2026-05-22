# Local Diagnostics Logging

## Overview

Rack Inventory Studio writes diagnostic logs **locally to the user's machine only**.
The application does **not** send any logs, telemetry, or usage data to the internet.
There are no external endpoints, no analytics services, no Sentry, no OpenTelemetry.

---

## Where are the logs stored?

Logs are written by `tauri-plugin-log` to the platform's application log directory.

### Windows 11 (primary target for QA)

```
%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\
```

Typical full path:
```
C:\Users\<username>\AppData\Roaming\com.techtradeexpress.rackinventorystudio\logs\
```

The log file is named after the app bundle identifier (e.g. `com.techtradeexpress.rackinventorystudio.log`
or similar — exact name to be confirmed during Windows QA).

> **Note:** The exact filename will be verified when running the app on a clean Windows 11 machine
> with the NSIS installer. The log directory is managed entirely by Tauri's `app_log_dir()`.

### macOS / Linux (development only)

| Platform | Directory |
|----------|-----------|
| macOS    | `~/Library/Logs/com.techtradeexpress.rackinventorystudio/` |
| Linux    | `~/.local/share/com.techtradeexpress.rackinventorystudio/logs/` or XDG equivalent |

---

## What is logged?

### Backend (Rust / Tauri)

Level `info` or higher:

| Event | Details logged |
|-------|----------------|
| App startup | `"Rack Inventory Studio starting"` |
| Open repository | basename of path, result: code/counts/validation issues |
| Create repository | basename of path, init_git flag, result: code |
| Save repository | start, result: created/updated/unchanged counts |
| Validate repository | errors/warnings/infos count |
| CSV preview | file size in bytes, result: row counts |
| CSV import | file size in bytes, result: created/warning counts |
| Git status | is_repo, branch, ahead/behind, clean |
| Git commit | start, result: short hash |
| Git push | remote name, ok or error |
| Git pull | remote name, ok with counts, or error |

Level `warn` / `error` on failures — error messages are sanitized before logging (see below).

### Frontend (TypeScript / React)

| Event | Details logged |
|-------|----------------|
| Frontend init | `"Rack Inventory Studio frontend initializing"` |
| Open repository | basename of path, result: code/counts on success |
| Open repository failure | sanitized error message |
| Create repository | result: code on success |
| Close repository | ok or sanitized error |
| Global unhandled error | error message (truncated) |
| Global unhandled promise rejection | reason (truncated, sanitized) |

---

## What is NOT logged?

- Full YAML file contents
- Full CSV file contents
- Passwords, tokens, secrets, private keys, API keys, auth credentials
- Full user data from device/model/rack records (codes and counts only)
- Full file system paths — only basenames are logged
- Environment variable values

---

## Data redaction

A redaction layer (`diagnostics.rs` on the backend, `src/lib/redact.ts` on the frontend)
is applied before any error message is written to the log.

Rules applied:
1. **Sensitive pattern check** — if the string contains `token`, `password`, `secret`,
   `private_key`, `api_key`, or `auth`, the entire value is replaced with
   `[redacted]` or `[error message redacted: possible credential]`.
2. **Length cap** — strings are truncated to 300 characters before being logged.
3. **Path sanitization** — only the basename (last path segment) is logged, not the full path.

### Limitations

- Redaction is heuristic: it matches known keyword patterns. A credential stored
  under an unusual key name would not be caught.
- Basenames of repositories, files, and CSV imports will appear in the log.
  These are technical identifiers, not secrets, but users should be aware.
- Log files may contain repository codes (e.g. `code=my-rack-repo`),
  item counts, and Git branch names (`branch="main"`).
- The log does **not** contain full user paths, serial numbers, asset tags, or
  device personal data beyond item counts.

---

## How to find the log file (Windows 11)

1. Press `Win + R`, type `%APPDATA%`, press Enter.
2. Navigate to `com.techtradeexpress.rackinventorystudio\logs\`.
3. Open the `.log` file with Notepad or any text editor.

Alternatively, open a terminal and run:
```cmd
dir "%APPDATA%\com.techtradeexpress.rackinventorystudio\logs\"
```

---

## How to include logs in a bug report

If you are reporting a problem with Rack Inventory Studio:

1. Reproduce the issue.
2. Navigate to the log directory described above.
3. Attach the most recent `.log` file to your bug report.
4. Optionally, review the file first to confirm it does not contain information
   you do not wish to share (repository codes, basenames, Git branch names).

---

## Technical notes

- **Plugin:** `tauri-plugin-log` v2 (official Tauri v2 logging plugin).
- **Rust logging facade:** `log` crate v0.4.
- **Log level:** `Info` and above written to file; `Stdout` target also active
  in debug builds for developer convenience.
- **Frontend:** `@tauri-apps/plugin-log` v2; calls wrapped in try/catch so
  tests and plain-browser builds never fail due to missing Tauri runtime.
- **No log rotation config** added in this version — single rolling file
  managed by Tauri's default policy (KeepOne). Add rotation strategy in a
  future iteration if needed.
