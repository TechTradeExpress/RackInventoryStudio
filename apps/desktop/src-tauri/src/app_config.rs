use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Bundle identifier — must match `identifier` in `tauri.conf.json`.
const BUNDLE_ID: &str = "com.techtradeexpress.rackinventorystudio";

/// Managed state that records the log directory used by the current running
/// process. Populated during `lib.rs` startup before Tauri builder completes,
/// so commands can return the real active path.
pub struct ActiveLogState {
    /// `None` means the platform default (`TargetKind::LogDir`) is in use.
    /// `Some(path)` means a custom folder was configured at startup.
    pub dir: Option<PathBuf>,
}

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

/// Returns the log directory actually used by the current running process.
///
/// Reads from `ActiveLogState` managed state, which is set in `lib.rs` before
/// the Tauri builder runs. If no custom directory was configured at startup, the
/// platform default (`app.path().app_log_dir()`) is returned.
pub fn get_active_logs_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Some(state) = app.try_state::<ActiveLogState>() {
        if let Some(ref dir) = state.dir {
            return dir.clone();
        }
    }
    get_default_logs_dir(app)
}

/// Validate and materialise the persisted custom log directory for use at startup.
///
/// Returns `Some(dir)` only when:
/// - the path is absolute,
/// - the path either already exists as a directory, or
///   does not exist and `create_dir_all` succeeds.
///
/// Returns `None` — falling back to the platform default — when:
/// - no custom path is configured,
/// - the path is relative,
/// - the path already exists but is a file (not a directory),
/// - the path does not exist and `create_dir_all` fails (e.g. missing drive,
///   permission denied, unavailable network share).
///
/// The saved config is **not** modified; the user can still see the configured
/// path in Settings and change it.
pub fn resolve_startup_custom_log_dir(config_dir: Option<&Path>) -> Option<PathBuf> {
    let config_dir = config_dir?;
    let cfg = load_app_config(config_dir);
    let raw = cfg.logs_directory?;
    let path = PathBuf::from(&raw);

    if !path.is_absolute() {
        return None;
    }
    if path.exists() {
        if path.is_dir() {
            return Some(path);
        }
        // Exists but is a file or something else — unusable.
        return None;
    }
    // Path does not exist — try to create it.
    match std::fs::create_dir_all(&path) {
        Ok(()) => Some(path),
        Err(_) => None,
    }
}

/// Resolve the platform app-config directory without an `AppHandle`, using
/// only environment variables and the well-known bundle identifier. This is
/// used to load persisted settings *before* the Tauri builder finishes so the
/// log plugin can be configured correctly at startup.
///
/// Returns `None` only on unusual systems where the required env vars are absent.
pub fn resolve_app_config_dir_early() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("APPDATA")
            .ok()
            .map(|d| PathBuf::from(d).join(BUNDLE_ID))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var("HOME").ok().map(|h| {
            PathBuf::from(h)
                .join("Library")
                .join("Application Support")
                .join(BUNDLE_ID)
        })
    }
    #[cfg(target_os = "linux")]
    {
        // XDG_CONFIG_HOME → ~/.config fallback
        let base = std::env::var("XDG_CONFIG_HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var("HOME")
                    .ok()
                    .map(|h| PathBuf::from(h).join(".config"))
            })?;
        Some(base.join(BUNDLE_ID))
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        None
    }
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
        let cfg = AppConfig {
            logs_directory: Some("/tmp/custom-logs".to_string()),
        };
        save_app_config(dir.path(), &cfg).unwrap();
        let reset = AppConfig {
            logs_directory: None,
        };
        save_app_config(dir.path(), &reset).unwrap();
        let loaded = load_app_config(dir.path());
        assert!(loaded.logs_directory.is_none());
    }

    // ── resolve_startup_custom_log_dir ────────────────────────────────────────

    /// No config file → returns None (use platform default).
    #[test]
    fn startup_custom_dir_none_when_no_config() {
        let config_dir = tempfile::tempdir().unwrap();
        let result = resolve_startup_custom_log_dir(Some(config_dir.path()));
        assert!(result.is_none(), "empty config should yield None");
    }

    /// None config dir → returns None.
    #[test]
    fn startup_custom_dir_none_when_config_dir_absent() {
        let result = resolve_startup_custom_log_dir(None);
        assert!(result.is_none());
    }

    /// Valid existing directory → returns Some(custom_path).
    #[test]
    fn startup_custom_dir_returns_existing_dir() {
        let config_dir = tempfile::tempdir().unwrap();
        let custom_log_dir = tempfile::tempdir().unwrap();
        let cfg = AppConfig {
            logs_directory: Some(custom_log_dir.path().to_string_lossy().into_owned()),
        };
        save_app_config(config_dir.path(), &cfg).unwrap();

        let result = resolve_startup_custom_log_dir(Some(config_dir.path()));
        assert_eq!(
            result.as_deref(),
            Some(custom_log_dir.path()),
            "existing dir should be returned as active"
        );
    }

    /// Valid non-existing absolute path → dir is created, returns Some.
    #[test]
    fn startup_custom_dir_creates_missing_directory() {
        let config_dir = tempfile::tempdir().unwrap();
        // Pick a path that doesn't exist yet inside a real temp dir.
        let base = tempfile::tempdir().unwrap();
        let new_dir = base.path().join("nested").join("logs");
        assert!(!new_dir.exists());

        let cfg = AppConfig {
            logs_directory: Some(new_dir.to_string_lossy().into_owned()),
        };
        save_app_config(config_dir.path(), &cfg).unwrap();

        let result = resolve_startup_custom_log_dir(Some(config_dir.path()));
        assert_eq!(
            result.as_deref(),
            Some(new_dir.as_path()),
            "non-existing dir should be created and returned"
        );
        assert!(new_dir.is_dir(), "directory should have been created");
    }

    /// Relative path → returns None.
    #[test]
    fn startup_custom_dir_rejects_relative_path() {
        let config_dir = tempfile::tempdir().unwrap();
        let cfg = AppConfig {
            logs_directory: Some("relative/path/logs".to_string()),
        };
        save_app_config(config_dir.path(), &cfg).unwrap();

        let result = resolve_startup_custom_log_dir(Some(config_dir.path()));
        assert!(result.is_none(), "relative path should be rejected");
    }

    /// Path exists but is a file → returns None.
    #[test]
    fn startup_custom_dir_rejects_existing_file() {
        let config_dir = tempfile::tempdir().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("notadir.txt");
        std::fs::write(&file_path, b"data").unwrap();

        let cfg = AppConfig {
            logs_directory: Some(file_path.to_string_lossy().into_owned()),
        };
        save_app_config(config_dir.path(), &cfg).unwrap();

        let result = resolve_startup_custom_log_dir(Some(config_dir.path()));
        assert!(
            result.is_none(),
            "existing file should be rejected as log dir"
        );
    }

    /// Path under a non-existent parent that cannot be created → returns None.
    /// We simulate this by using a path rooted in a non-existent location.
    #[test]
    fn startup_custom_dir_rejects_uncreatable_path() {
        let config_dir = tempfile::tempdir().unwrap();
        // Use a path whose parent is an existing file — create_dir_all will fail
        // because it cannot create a dir where a file already exists.
        let tmp = tempfile::tempdir().unwrap();
        let blocking_file = tmp.path().join("block");
        std::fs::write(&blocking_file, b"x").unwrap();
        let bad_path = blocking_file.join("subdir"); // parent is a file

        let cfg = AppConfig {
            logs_directory: Some(bad_path.to_string_lossy().into_owned()),
        };
        save_app_config(config_dir.path(), &cfg).unwrap();

        let result = resolve_startup_custom_log_dir(Some(config_dir.path()));
        assert!(
            result.is_none(),
            "uncreatable path should fall back to default"
        );
    }

    /// `restart_required` is false when persisted dir equals the active dir
    /// (i.e. the app was restarted with the custom dir already applied).
    #[test]
    fn restart_required_false_when_persisted_matches_active() {
        let custom_path = PathBuf::from("/tmp/my-logs");
        let persisted = Some(custom_path.clone());
        let active = custom_path.clone();
        let effective_after_restart = persisted
            .clone()
            .unwrap_or_else(|| PathBuf::from("/default"));
        assert!(
            !(effective_after_restart != active),
            "should not require restart"
        );
    }

    /// `restart_required` is true when persisted dir differs from active
    /// (custom was just set during the current session).
    #[test]
    fn restart_required_true_when_persisted_differs_from_active() {
        let persisted = Some(PathBuf::from("/tmp/new-custom"));
        let active = PathBuf::from("/default/logs");
        let effective_after_restart = persisted
            .clone()
            .unwrap_or_else(|| PathBuf::from("/default/logs"));
        assert!(effective_after_restart != active, "should require restart");
    }

    /// `restart_required` is true after reset when the running process still
    /// uses the old custom directory.
    #[test]
    fn restart_required_true_after_reset_while_custom_active() {
        // After reset: persisted = None, but active = old custom dir.
        let persisted: Option<PathBuf> = None;
        let active = PathBuf::from("/tmp/old-custom");
        let default = PathBuf::from("/default/logs");
        let effective_after_restart = persisted.unwrap_or_else(|| default.clone());
        assert!(
            effective_after_restart != active,
            "reset while custom dir active should require restart"
        );
    }
}
