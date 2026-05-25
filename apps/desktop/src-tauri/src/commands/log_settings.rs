use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::app_config::{
    get_active_logs_dir, get_default_logs_dir, load_app_config, save_app_config, AppConfig,
};

/// DTO returned by all log-settings commands.
#[derive(serde::Serialize, Debug)]
pub struct LogSettingsDto {
    /// Platform default log directory (where tauri-plugin-log writes on the current run).
    pub default_log_dir: String,
    /// Currently active log directory for this running instance.
    /// Equal to `default_log_dir` because tauri-plugin-log is initialized at startup
    /// with the platform default — a custom directory is only applied after restart.
    pub active_log_dir: String,
    /// Persisted custom log directory override, if the user has set one.
    pub custom_log_dir: Option<String>,
    /// True when `custom_log_dir` is set and differs from the currently active dir.
    /// This is always true when `custom_log_dir` is `Some(...)` because the active
    /// dir always reflects the startup configuration (platform default).
    pub restart_required: bool,
}

fn build_dto(app: &AppHandle) -> LogSettingsDto {
    let config_dir = app
        .path()
        .app_config_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
    let cfg = load_app_config(&config_dir);
    let default_dir = get_default_logs_dir(app);
    let active_dir = get_active_logs_dir(app);
    let restart_required = cfg.logs_directory.is_some();
    LogSettingsDto {
        default_log_dir: default_dir.display().to_string(),
        active_log_dir: active_dir.display().to_string(),
        custom_log_dir: cfg.logs_directory,
        restart_required,
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

/// Open a directory in the OS file manager.
///
/// Uses platform-specific commands:
/// - Windows: `explorer.exe <dir>`
/// - macOS:   `open <dir>`
/// - Linux:   `xdg-open <dir>`
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
        std::process::Command::new("xdg-open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {e}"))?;
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        return Err("Opening file manager is not supported on this platform".to_string());
    }
    Ok(())
}
