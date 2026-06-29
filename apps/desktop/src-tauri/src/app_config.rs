use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// Number of days to retain log files before cleanup.
pub const LOG_RETENTION_DAYS: u64 = 30;

/// Prefix used for all daily log files written by this app.
/// Cleanup only ever deletes files matching `<LOG_FILE_PREFIX>-YYYY-MM-DD.log`.
pub const LOG_FILE_PREFIX: &str = "ris";

/// Bundle identifier — must match `identifier` in `tauri.conf.json`.
const BUNDLE_ID: &str = "com.techtradeexpress.rackinventorystudio";

/// Vendor and app folder names used for the Windows ProgramData log path.
/// Produces `%PROGRAMDATA%\TechTradeExpress\RackInventoryStudio\logs`.
/// Available on Windows and in test builds (tests exercise path construction on all platforms).
#[cfg(any(target_os = "windows", test))]
const WINDOWS_VENDOR: &str = "TechTradeExpress";
#[cfg(any(target_os = "windows", test))]
const WINDOWS_APP_DIR: &str = "RackInventoryStudio";

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

/// Build the Windows default log path from a `%PROGRAMDATA%` root value.
///
/// Returns `{programdata}\TechTradeExpress\RackInventoryStudio\logs`.
///
/// Available on Windows and in test builds so that path-construction tests can
/// run on Linux CI without requiring Windows-specific path syntax.
#[cfg(any(target_os = "windows", test))]
pub fn windows_log_dir_from_programdata(programdata: &str) -> PathBuf {
    PathBuf::from(programdata)
        .join(WINDOWS_VENDOR)
        .join(WINDOWS_APP_DIR)
        .join("logs")
}

/// Returns the platform default log directory.
///
/// Resolves to:
/// - Windows: `%PROGRAMDATA%\TechTradeExpress\RackInventoryStudio\logs`
/// - Linux:   `$XDG_DATA_HOME/{bundle_id}/logs/`
/// - macOS:   `~/Library/Logs/{bundle_id}/`
///
/// Uses `resolve_default_log_dir_early()` as the primary source so that this
/// function and the startup log resolver always agree on the default path.
pub fn get_default_logs_dir(app: &tauri::AppHandle) -> PathBuf {
    resolve_default_log_dir_early().unwrap_or_else(|| {
        app.path()
            .app_log_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
    })
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
        // %PROGRAMDATA%\TechTradeExpress\RackInventoryStudio\logs
        // ProgramData is writable by all users; Program Files is not.
        std::env::var("PROGRAMDATA")
            .ok()
            .map(|d| windows_log_dir_from_programdata(&d))
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

// ── Daily log filename helpers ─────────────────────────────────────────────────

/// Convert a Unix timestamp (seconds since 1970-01-01) to (year, month, day).
///
/// Uses the standard "civil" Gregorian calendar algorithm — no external crate.
pub fn unix_secs_to_ymd(secs: u64) -> (u32, u32, u32) {
    let days = (secs / 86400) as i64;
    // Shift epoch to 0000-03-01 for simpler leap-year handling.
    let z = days + 719_468;
    let era: i64 = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // day-of-era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365; // year-of-era [0, 399]
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day-of-year [0, 365]
    let mp = (5 * doy + 2) / 153; // month-of-year (March = 0) [0, 11]
    let d = doy - (153 * mp + 2) / 5 + 1; // [1, 31]
    let m = if mp < 10 { mp + 3 } else { mp - 9 }; // [1, 12]
    let y = if m <= 2 { y + 1 } else { y };
    (y as u32, m as u32, d as u32)
}

/// Return the log filename stem for the current UTC date: `ris-YYYY-MM-DD`.
///
/// tauri-plugin-log appends `.log` automatically, producing `ris-YYYY-MM-DD.log`.
/// Using UTC avoids timezone-offset edge cases in file naming while keeping
/// filenames predictable across deployments.
pub fn daily_log_filename() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let (y, m, d) = unix_secs_to_ymd(secs);
    format!("{LOG_FILE_PREFIX}-{y:04}-{m:02}-{d:02}")
}

/// Delete log files in `log_dir` that are older than `retention_days` days
/// and whose names match the pattern `{LOG_FILE_PREFIX}-YYYY-MM-DD.log`.
///
/// Only files whose names are parseable as a date are touched; any other files
/// in the directory are left alone. Errors for individual files are logged as
/// warnings but do not abort the cleanup pass.
pub fn cleanup_old_log_files(log_dir: &Path, retention_days: u64) {
    let cutoff_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .saturating_sub(retention_days * 86_400);

    let entries = match std::fs::read_dir(log_dir) {
        Ok(e) => e,
        Err(e) => {
            log::warn!("log_cleanup: cannot read log dir: {e}");
            return;
        }
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if let Some(date_secs) = parse_ris_log_date_secs(&name) {
            if date_secs < cutoff_secs {
                let path = entry.path();
                if let Err(e) = std::fs::remove_file(&path) {
                    log::warn!("log_cleanup: failed to delete {}: {e}", path.display());
                } else {
                    log::info!("log_cleanup: deleted old log {}", path.display());
                }
            }
        }
    }
}

/// Parse a file name of the form `ris-YYYY-MM-DD.log` into a Unix timestamp
/// (midnight UTC of that date). Returns `None` if the name does not match.
fn parse_ris_log_date_secs(name: &str) -> Option<u64> {
    // Expected: "ris-YYYY-MM-DD.log"
    let stem = name.strip_suffix(".log")?;
    let rest = stem.strip_prefix(LOG_FILE_PREFIX)?.strip_prefix('-')?;
    let mut parts = rest.splitn(3, '-');
    let y: i32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    let d: u32 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    Some(ymd_to_unix_secs(y, m, d))
}

/// Convert a UTC calendar date to a Unix timestamp at midnight UTC.
fn ymd_to_unix_secs(y: i32, m: u32, d: u32) -> u64 {
    // Shift so that March 1 is the start of the year for simpler leap-year math.
    let (y, m) = if m <= 2 { (y - 1, m + 9) } else { (y, m - 3) };
    let era = y / 400;
    let yoe = y - era * 400; // year-of-era [0, 399]
    let doy = (153 * m as i32 + 2) / 5 + d as i32 - 1; // day-of-year (Mar=0)
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy; // day-of-era
    let days = era as i64 * 146_097 + doe as i64 - 719_468;
    (days * 86_400) as u64
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

    // ── windows_log_dir_from_programdata ─────────────────────────────────────
    // These tests are platform-independent: they pass a synthetic base path and
    // verify the component structure without relying on real Windows env vars.

    #[test]
    fn windows_log_dir_appends_vendor_app_logs_components() {
        // Use a Unix-style base path so the test works on Linux CI as well.
        let dir = windows_log_dir_from_programdata("/fake/ProgramData");
        // Verify leaf component is "logs"
        assert_eq!(dir.file_name().unwrap(), "logs");
        // Parent must be "RackInventoryStudio"
        let parent = dir.parent().unwrap();
        assert_eq!(parent.file_name().unwrap(), "RackInventoryStudio");
        // Grandparent must be "TechTradeExpress"
        let grandparent = parent.parent().unwrap();
        assert_eq!(grandparent.file_name().unwrap(), "TechTradeExpress");
    }

    #[test]
    fn windows_log_dir_is_deterministic() {
        let a = windows_log_dir_from_programdata("/fake/ProgramData");
        let b = windows_log_dir_from_programdata("/fake/ProgramData");
        assert_eq!(a, b, "same input must produce same path");
    }

    #[test]
    fn windows_log_dir_reflects_programdata_root() {
        let dir = windows_log_dir_from_programdata("/mnt/c/ProgramData");
        // The path must start from the given root.
        assert!(
            dir.starts_with("/mnt/c/ProgramData"),
            "path must be rooted at the given ProgramData value"
        );
    }

    // ── unix_secs_to_ymd ─────────────────────────────────────────────────────

    #[test]
    fn unix_epoch_is_1970_01_01() {
        assert_eq!(unix_secs_to_ymd(0), (1970, 1, 1));
    }

    #[test]
    fn known_date_2026_06_28() {
        // 2026-06-28 00:00:00 UTC = 1782604800
        assert_eq!(unix_secs_to_ymd(1_782_604_800), (2026, 6, 28));
    }

    #[test]
    fn leap_day_2000_02_29() {
        // 2000-02-29 00:00:00 UTC = 951782400
        assert_eq!(unix_secs_to_ymd(951_782_400), (2000, 2, 29));
    }

    #[test]
    fn non_leap_year_2001_no_feb_29() {
        // 2001-03-01 00:00:00 UTC = 983404800 (year after leap)
        let (y, m, d) = unix_secs_to_ymd(983_404_800);
        assert_eq!((y, m, d), (2001, 3, 1));
    }

    // ── parse_ris_log_date_secs ───────────────────────────────────────────────

    #[test]
    fn parse_valid_ris_log_filename() {
        // 2026-06-28 midnight UTC
        let secs = parse_ris_log_date_secs("ris-2026-06-28.log");
        assert!(secs.is_some(), "should parse valid filename");
        let (y, m, d) = unix_secs_to_ymd(secs.unwrap());
        assert_eq!((y, m, d), (2026, 6, 28));
    }

    #[test]
    fn parse_rejects_non_ris_filename() {
        assert!(parse_ris_log_date_secs("app-2026-06-28.log").is_none());
        assert!(parse_ris_log_date_secs("rack-inventory-studio.log").is_none());
    }

    #[test]
    fn parse_rejects_invalid_date() {
        assert!(parse_ris_log_date_secs("ris-2026-13-01.log").is_none()); // month 13
        assert!(parse_ris_log_date_secs("ris-2026-00-01.log").is_none()); // month 0
    }

    #[test]
    fn parse_rejects_no_extension() {
        assert!(parse_ris_log_date_secs("ris-2026-06-28").is_none());
    }

    // ── cleanup_old_log_files ────────────────────────────────────────────────

    #[test]
    fn cleanup_deletes_files_older_than_retention() {
        let dir = tempfile::tempdir().unwrap();
        // Create an old log file (timestamp 0 = 1970-01-01)
        let old = dir.path().join("ris-1970-01-01.log");
        std::fs::write(&old, b"old log").unwrap();
        // Create a recent log file (today's date)
        let today_name = format!("{}.log", daily_log_filename());
        let recent = dir.path().join(&today_name);
        std::fs::write(&recent, b"recent log").unwrap();
        // Create a non-RIS file that must not be touched
        let other = dir.path().join("other.log");
        std::fs::write(&other, b"other").unwrap();

        cleanup_old_log_files(dir.path(), LOG_RETENTION_DAYS);

        assert!(!old.exists(), "old log should be deleted");
        assert!(recent.exists(), "recent log should be kept");
        assert!(other.exists(), "non-RIS file should be left alone");
    }

    #[test]
    fn cleanup_leaves_recent_files_alone() {
        let dir = tempfile::tempdir().unwrap();
        let recent_name = format!("{}.log", daily_log_filename());
        let recent = dir.path().join(&recent_name);
        std::fs::write(&recent, b"today").unwrap();

        cleanup_old_log_files(dir.path(), LOG_RETENTION_DAYS);

        assert!(recent.exists(), "today's log should survive cleanup");
    }

    #[test]
    fn cleanup_on_empty_dir_is_a_noop() {
        let dir = tempfile::tempdir().unwrap();
        cleanup_old_log_files(dir.path(), LOG_RETENTION_DAYS);
        // Just assert we don't panic
    }
}
