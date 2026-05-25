use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Persisted application configuration stored at `{app_config_dir}/app_config.json`.
///
/// Only one field for now: an optional custom log directory. When `None`, the
/// platform default (`app.path().app_log_dir()`) is used.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    /// Custom log directory path. `None` means "use the platform default".
    pub logs_directory: Option<String>,
}

/// Load the app config from `{config_dir}/app_config.json`.
///
/// Returns `Default::default()` if the file does not exist or cannot be parsed.
/// Logs a warning on malformed JSON so problems are visible in the log.
pub fn load_app_config(config_dir: &Path) -> AppConfig {
    let path = config_dir.join("app_config.json");
    match std::fs::read_to_string(&path) {
        Ok(contents) => match serde_json::from_str::<AppConfig>(&contents) {
            Ok(cfg) => cfg,
            Err(e) => {
                log::warn!(
                    "app_config: malformed config at [path:app_config.json], using defaults: {e}"
                );
                AppConfig::default()
            }
        },
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => AppConfig::default(),
        Err(e) => {
            log::warn!("app_config: cannot read config file, using defaults: {e}");
            AppConfig::default()
        }
    }
}

/// Save the app config to `{config_dir}/app_config.json`.
///
/// Creates the config directory if it does not exist.
pub fn save_app_config(config_dir: &Path, config: &AppConfig) -> Result<(), String> {
    std::fs::create_dir_all(config_dir)
        .map_err(|e| format!("Cannot create config directory: {e}"))?;
    let path = config_dir.join("app_config.json");
    let contents =
        serde_json::to_string_pretty(config).map_err(|e| format!("Serialize error: {e}"))?;
    std::fs::write(&path, contents).map_err(|e| format!("Cannot write config file: {e}"))
}

/// Returns the platform default log directory: the same path `tauri-plugin-log`
/// uses when `TargetKind::LogDir` is configured (i.e. `app.path().app_log_dir()`).
///
/// In Tauri v2 this resolves to:
/// - Windows: `%LOCALAPPDATA%\{bundle_id}\logs\`
/// - Linux:   `$XDG_DATA_HOME/{bundle_id}/logs/`
/// - macOS:   `~/Library/Logs/{bundle_id}/`
pub fn get_default_logs_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_log_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Returns the active log directory: the persisted custom override if set,
/// otherwise the platform default.
///
/// **Important**: `tauri-plugin-log` is initialized at startup using the platform
/// default (`TargetKind::LogDir`). A custom directory stored here will only be
/// applied on the **next** app restart, when `lib.rs` can read the config and
/// pass a `TargetKind::Folder` path to the log plugin builder.
pub fn get_active_logs_dir(app: &tauri::AppHandle) -> PathBuf {
    get_default_logs_dir(app)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn default_config_when_no_file_exists() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = load_app_config(dir.path());
        assert!(cfg.logs_directory.is_none());
    }

    #[test]
    fn save_and_load_custom_logs_directory() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = AppConfig {
            logs_directory: Some("/tmp/custom-logs".to_string()),
        };
        save_app_config(dir.path(), &cfg).unwrap();
        let loaded = load_app_config(dir.path());
        assert_eq!(loaded.logs_directory.as_deref(), Some("/tmp/custom-logs"));
    }

    #[test]
    fn load_malformed_config_returns_default() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("app_config.json");
        let mut f = std::fs::File::create(&path).unwrap();
        f.write_all(b"{ not valid json }").unwrap();
        let cfg = load_app_config(dir.path());
        assert!(cfg.logs_directory.is_none());
    }

    #[test]
    fn reset_clears_custom_logs_directory() {
        let dir = tempfile::tempdir().unwrap();
        // Save a custom dir
        let cfg = AppConfig {
            logs_directory: Some("/tmp/custom-logs".to_string()),
        };
        save_app_config(dir.path(), &cfg).unwrap();
        // Reset
        let reset = AppConfig {
            logs_directory: None,
        };
        save_app_config(dir.path(), &reset).unwrap();
        let loaded = load_app_config(dir.path());
        assert!(loaded.logs_directory.is_none());
    }
}
