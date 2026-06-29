use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::app_config::{
    daily_log_filename, get_active_logs_dir, get_default_logs_dir, is_dir_writable,
    load_app_config, save_app_config, AppConfig, LOG_RETENTION_DAYS,
};

// `restart_required` is true when the persisted custom directory differs from
// the directory used by the current running process. This can happen in two
// ways:
//  a) User just set a new custom dir — it will take effect on next restart.
//  b) User just reset to default — the current process still logs to the
//     custom dir; it will revert to default on next restart.

/// DTO returned by all log-settings commands.
#[derive(serde::Serialize, Debug)]
pub struct LogSettingsDto {
    /// Platform default log directory (where tauri-plugin-log writes on the current run).
    pub default_log_dir: String,
    /// Currently active log directory for this running instance.
    pub active_log_dir: String,
    /// Persisted custom log directory override, if the user has set one.
    pub custom_log_dir: Option<String>,
    /// True when `custom_log_dir` is set and differs from the currently active dir.
    pub restart_required: bool,
    /// True when the active log directory exists on disk.
    pub dir_exists: bool,
    /// True when the active log directory is writable.
    pub dir_writable: bool,
    /// Name of the log file for the current session (e.g. `ris-2026-06-28.log`).
    pub current_log_filename: String,
    /// Number of days after which old log files are cleaned up.
    pub retention_days: u64,
}

fn build_dto(app: &AppHandle) -> LogSettingsDto {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let cfg = load_app_config(&config_dir);
    let default_dir = get_default_logs_dir(app);
    let active_dir = get_active_logs_dir(app);

    // `restart_required` is true when the persisted setting would produce a
    // different log directory than the one currently in use. This covers:
    //  - A new custom directory was just saved; restart needed to activate it.
    //  - A reset was just performed; restart needed to revert to default.
    let persisted_dir = cfg
        .logs_directory
        .as_deref()
        .map(std::path::Path::new)
        .map(std::path::Path::to_path_buf);
    let effective_after_restart = persisted_dir.clone().unwrap_or_else(|| default_dir.clone());
    let restart_required = effective_after_restart != active_dir;

    let dir_exists = active_dir.exists();
    let dir_writable = dir_exists && is_dir_writable(&active_dir);
    let current_log_filename = format!("{}.log", daily_log_filename());

    LogSettingsDto {
        default_log_dir: default_dir.display().to_string(),
        active_log_dir: active_dir.display().to_string(),
        custom_log_dir: cfg.logs_directory,
        restart_required,
        dir_exists,
        dir_writable,
        current_log_filename,
        retention_days: LOG_RETENTION_DAYS,
    }
}

/// Return the current log-directory settings.
#[tauri::command]
pub fn get_log_settings(app: AppHandle) -> Result<LogSettingsDto, String> {
    Ok(build_dto(&app))
}

/// Open the active logs directory in the OS file manager.
///
/// The path is resolved on the backend from the running Tauri instance —
/// the frontend does NOT supply an arbitrary path.
#[tauri::command]
pub fn open_logs_directory(app: AppHandle) -> Result<(), String> {
    let dir = get_active_logs_dir(&app);

    // Ensure the directory exists (the log plugin creates it on first log write,
    // but it might not exist yet if the app has never written a log entry).
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create logs directory: {e}"))?;
    }

    open_path_in_file_manager(&dir)
}

/// Validate a path and persist it as the custom log directory.
///
/// The directory is created if it does not exist.
/// Returns updated `LogSettingsDto` with `restart_required: true`.
#[tauri::command]
pub fn set_logs_directory(app: AppHandle, path: String) -> Result<LogSettingsDto, String> {
    let path = path.trim().to_string();
    if path.is_empty() {
        return Err("Log directory path cannot be empty".to_string());
    }
    let dir = Path::new(&path);
    // If path exists it must be a directory (not a file).
    if dir.exists() && !dir.is_dir() {
        return Err(format!("'{}' exists but is not a directory", path));
    }
    // Create directory if it doesn't exist.
    if !dir.exists() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Cannot create directory '{}': {e}", path))?;
    }

    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve config directory: {e}"))?;
    let cfg = AppConfig {
        logs_directory: Some(path),
    };
    save_app_config(&config_dir, &cfg)?;
    log::info!("log_settings: custom log directory set");
    Ok(build_dto(&app))
}

/// Remove the custom log directory override; revert to platform default on next restart.
#[tauri::command]
pub fn reset_logs_directory(app: AppHandle) -> Result<LogSettingsDto, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Cannot resolve config directory: {e}"))?;
    let cfg = AppConfig {
        logs_directory: None,
    };
    save_app_config(&config_dir, &cfg)?;
    log::info!("log_settings: custom log directory reset to default");
    Ok(build_dto(&app))
}

/// Detect whether the process is running inside WSL (Windows Subsystem for Linux).
///
/// Checks `WSL_DISTRO_NAME` env var (set by WSL 2) and the kernel release
/// string in `/proc/sys/kernel/osrelease` (contains "microsoft" or "WSL").
#[cfg(target_os = "linux")]
fn is_wsl() -> bool {
    if std::env::var("WSL_DISTRO_NAME").is_ok() {
        return true;
    }
    std::fs::read_to_string("/proc/sys/kernel/osrelease")
        .map(|s| {
            let lower = s.to_lowercase();
            lower.contains("microsoft") || lower.contains("wsl")
        })
        .unwrap_or(false)
}

/// Convert a Linux path to a Windows-style path using `wslpath -w`.
///
/// Returns `None` if `wslpath` is not available or conversion fails.
#[cfg(target_os = "linux")]
fn wslpath_to_windows(path: &Path) -> Option<String> {
    let out = std::process::Command::new("wslpath")
        .arg("-w")
        .arg(path)
        .output()
        .ok()?;
    if out.status.success() {
        String::from_utf8(out.stdout)
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    }
}

/// Open a directory in the OS file manager.
///
/// - Windows: `explorer.exe <dir>`
/// - macOS:   `open <dir>`
/// - Linux/WSL: `explorer.exe <wslpath -w dir>` (falls back to friendly error)
/// - Linux (native): `xdg-open <dir>` (friendly error if not available)
fn open_path_in_file_manager(dir: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        if is_wsl() {
            // On WSL, convert the Linux path to a Windows path and open via explorer.exe.
            match wslpath_to_windows(dir) {
                Some(win_path) => {
                    std::process::Command::new("explorer.exe")
                        .arg(&win_path)
                        .spawn()
                        .map_err(|_| {
                            format!(
                                "Could not open the logs folder in Windows Explorer. \
                             The folder is at: {}",
                                dir.display()
                            )
                        })?;
                }
                None => {
                    return Err(format!(
                        "Could not open the logs folder automatically (path conversion failed). \
                         The folder is at: {}",
                        dir.display()
                    ));
                }
            }
        } else {
            // Native Linux: use xdg-open; give a helpful message if it is not installed.
            std::process::Command::new("xdg-open")
                .arg(dir)
                .spawn()
                .map_err(|e| {
                    if e.kind() == std::io::ErrorKind::NotFound {
                        format!(
                            "Could not open the logs folder automatically \
                             (xdg-open is not installed). \
                             The folder is at: {}",
                            dir.display()
                        )
                    } else {
                        format!("Failed to open file manager: {e}")
                    }
                })?;
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        return Err(format!(
            "Opening the file manager is not supported on this platform. \
             The folder is at: {}",
            dir.display()
        ));
    }
    Ok(())
}
