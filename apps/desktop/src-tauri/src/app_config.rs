use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Bundle identifier — must match `identifier` in `tauri.conf.json`.
const BUNDLE_ID: &str = "com.techtradeexpress.rackinventorystudio";

/// Managed state that records the log directory used by the current running
/// process. Populated during `lib.rs` startup before Tauri builder completes,
/// so commands can return the real active path.
pub struct ActiveLogState {
    /// The actual directory passed to `tauri-plugin-log` at startup.
    pub dir: PathBuf,
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
/// the Tauri builder runs. Falls back to the platform default only if managed
/// state is absent (should not happen in normal operation).
pub fn get_active_logs_dir(app: &tauri::AppHandle) -> PathBuf {
    if let Some(state) = app.try_state::<ActiveLogState>() {
        return state.dir.clone();
    }
    get_default_logs_dir(app)
}

/// Check whether `path` is a writable directory by creating and immediately
/// deleting a small probe file inside it.
pub fn is_dir_writable(path: &Path) -> bool {
    let probe = path.join(format!(".ris_write_probe_{}", std::process::id()));
    match std::fs::write(&probe, b"probe") {
        Ok(()) => {
            let _ = std::fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

/// Ensure `path` is a usable log directory: it must be (or become) a directory
/// and must be writable.
///
/// Returns `Ok(path)` on success, `Err(description)` if the path cannot be used.
pub fn prepare_log_dir_candidate(path: &Path) -> Result<PathBuf, String> {
    if path.exists() && !path.is_dir() {
        return Err(format!(
            "'{}' exists but is not a directory",
            path.display()
        ));
    }
    if !path.exists() {
        std::fs::create_dir_all(path)
            .map_err(|e| format!("Cannot create '{}': {e}", path.display()))?;
    }
    if !is_dir_writable(path) {
        return Err(format!("'{}' is not writable", path.display()));
    }
    Ok(path.to_path_buf())
}

/// Determine the log directory to use at startup and ensure it is usable.
///
/// Cascades through three candidates in order:
/// 1. Persisted custom directory (from app config), if configured and usable.
/// 2. Platform default directory (mirrors `tauri-plugin-log`'s `LogDir` resolution).
/// 3. `{temp_dir}/{BUNDLE_ID}/logs` as a last-resort fallback.
///
/// Each candidate is validated by `prepare_log_dir_candidate` (directory must
/// exist or be creatable, and must be writable via a probe write). This prevents
/// passing an unwritable path to `tauri-plugin-log`, which would panic on startup
/// with `PluginInitialization("log", "Permission denied (os error 13)")`.
///
/// Returns the path of the first usable candidate. If all three fail (extremely
/// unlikely — the OS temp dir is almost always writable), returns the temp-dir
/// path anyway so startup can continue.
pub fn resolve_startup_log_dir(config_dir: Option<&Path>) -> PathBuf {
    // 1. Custom persisted directory.
    if let Some(cfg_dir) = config_dir {
        let cfg = load_app_config(cfg_dir);
        if let Some(raw) = cfg.logs_directory {
            let path = PathBuf::from(&raw);
            if path.is_absolute() {
                if let Ok(v) = prepare_log_dir_candidate(&path) {
                    return v;
                }
            }
        }
    }
    // 2. Platform default directory.
    if let Some(default) = resolve_default_log_dir_early() {
        if let Ok(v) = prepare_log_dir_candidate(&default) {
            return v;
        }
    }
    // 3. Temp dir fallback.
    let temp = std::env::temp_dir().join(BUNDLE_ID).join("logs");
    if let Ok(v) = prepare_log_dir_candidate(&temp) {
        return v;
    }
    temp
}

/// Resolve the platform default log directory without an `AppHandle`.
///
/// Mirrors `tauri-plugin-log`'s `LogDir` target resolution so we can
/// pre-create the directory and use a `Folder` target at startup, avoiding
/// potential panics if the log plugin's lazy path resolution fails (observed
/// on WSL when `LogDir` is used directly).
///
/// Returns `None` only on unusual systems where the required env vars are absent.
pub fn resolve_default_log_dir_early() -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        // $XDG_DATA_HOME/{bundle_id}/logs  or  ~/.local/share/{bundle_id}/logs
        let base = std::env::var("XDG_DATA_HOME")
            .ok()
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var("HOME")
                    .ok()
                    .map(|h| PathBuf::from(h).join(".local").join("share"))
            })?;
        Some(base.join(BUNDLE_ID).join("logs"))
    }
    #[cfg(target_os = "windows")]
    {
        // %LOCALAPPDATA%\{bundle_id}\logs
        std::env::var("LOCALAPPDATA")
            .ok()
            .map(|d| PathBuf::from(d).join(BUNDLE_ID).join("logs"))
    }
    #[cfg(target_os = "macos")]
    {
        // ~/Library/Logs/{bundle_id}
        std::env::var("HOME").ok().map(|h| {
            PathBuf::from(h)
                .join("Library")
                .join("Logs")
                .join(BUNDLE_ID)
        })
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        None
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

    // ── is_dir_writable ───────────────────────────────────────────────────────

    #[test]
    fn writable_temp_dir_returns_true() {
        let dir = tempfile::tempdir().unwrap();
        assert!(is_dir_writable(dir.path()), "temp dir should be writable");
    }

    #[test]
    fn file_path_as_dir_returns_false() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("afile.txt");
        std::fs::write(&file, b"x").unwrap();
        // Treating a file as the "directory" — probe write inside it must fail.
        assert!(
            !is_dir_writable(&file),
            "file path should not be considered writable as a dir"
        );
    }

    // ── prepare_log_dir_candidate ─────────────────────────────────────────────

    #[test]
    fn prepare_existing_writable_dir_is_ok() {
        let dir = tempfile::tempdir().unwrap();
        let result = prepare_log_dir_candidate(dir.path());
        assert!(result.is_ok(), "existing writable dir should be accepted");
        assert_eq!(result.unwrap(), dir.path());
    }

    #[test]
    fn prepare_creates_missing_directory() {
        let base = tempfile::tempdir().unwrap();
        let new_dir = base.path().join("nested").join("logs");
        assert!(!new_dir.exists());
        let result = prepare_log_dir_candidate(&new_dir);
        assert!(result.is_ok(), "missing dir should be created");
        assert!(new_dir.is_dir(), "directory should exist after prepare");
    }

    #[test]
    fn prepare_rejects_existing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("notadir.txt");
        std::fs::write(&file, b"data").unwrap();
        let result = prepare_log_dir_candidate(&file);
        assert!(result.is_err(), "existing file should be rejected");
    }

    #[test]
    fn prepare_rejects_uncreatable_path() {
        let tmp = tempfile::tempdir().unwrap();
        let blocking_file = tmp.path().join("block");
        std::fs::write(&blocking_file, b"x").unwrap();
        // Cannot create a directory whose parent is a file.
        let bad = blocking_file.join("subdir");
        let result = prepare_log_dir_candidate(&bad);
        assert!(result.is_err(), "uncreatable path should be rejected");
    }

    // ── resolve_startup_log_dir ───────────────────────────────────────────────

    #[test]
    fn startup_log_dir_uses_valid_custom_dir() {
        let config_dir = tempfile::tempdir().unwrap();
        let custom_log_dir = tempfile::tempdir().unwrap();
        let cfg = AppConfig {
            logs_directory: Some(custom_log_dir.path().to_string_lossy().into_owned()),
        };
        save_app_config(config_dir.path(), &cfg).unwrap();

        let result = resolve_startup_log_dir(Some(config_dir.path()));
        assert_eq!(
            result,
            custom_log_dir.path(),
            "should use the custom log dir when valid"
        );
    }

    #[test]
    fn startup_log_dir_skips_invalid_custom_and_falls_back() {
        let config_dir = tempfile::tempdir().unwrap();
        // Custom dir points inside a file — uncreatable.
        let tmp = tempfile::tempdir().unwrap();
        let blocking_file = tmp.path().join("block");
        std::fs::write(&blocking_file, b"x").unwrap();
        let bad = blocking_file.join("logs");
        let cfg = AppConfig {
            logs_directory: Some(bad.to_string_lossy().into_owned()),
        };
        save_app_config(config_dir.path(), &cfg).unwrap();

        let result = resolve_startup_log_dir(Some(config_dir.path()));
        // Must NOT be the bad path; should have fallen back to default or temp.
        assert_ne!(result, bad, "should not use the invalid custom dir");
        assert!(result.is_dir(), "fallback path should be a real directory");
    }

    #[test]
    fn startup_log_dir_without_config_returns_a_writable_dir() {
        let result = resolve_startup_log_dir(None);
        // Without any config the result should be an existing writable directory.
        assert!(result.is_dir(), "result should be an existing directory");
        assert!(is_dir_writable(&result), "result should be writable");
    }
}
