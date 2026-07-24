mod app_config;
mod commands;
mod diagnostics;
mod dto;
mod ssh_askpass;

pub use ssh_askpass::run_as_askpass;

use app_config::{
    cleanup_old_log_files, daily_log_filename, resolve_app_config_dir_early,
    resolve_startup_log_dir, ActiveLogState, LOG_RETENTION_DAYS,
};
use commands::{
    add_device_cmd, add_device_model_cmd, add_git_remote, add_location_cmd, add_rack_cmd,
    clone_repository_cmd, close_repository, commit_repository_changes, create_repository_cmd,
    delete_device_cmd, delete_device_model_cmd, delete_location_cmd, delete_rack_cmd, get_git_log,
    get_git_status, get_log_settings, get_rack_detail, get_repository_summary, get_ssh_diagnostics,
    import_device_csv_cmd, import_device_model_csv_cmd, init_git_repository, list_device_models,
    list_devices, list_git_remotes, list_locations, list_racks, move_placement,
    open_logs_directory, open_repository_cmd, place_device, place_rack_object,
    preview_device_csv_import_cmd, preview_device_model_csv_import_cmd, pull_git_ff_only,
    push_git_current_branch, read_csv_file, remove_placement, reset_logs_directory,
    respond_ssh_passphrase, save_current_repository, search_repository_cmd, set_logs_directory,
    update_device_cmd, update_device_model_cmd, update_location_cmd, update_rack_cmd,
    validate_current_repository, write_device_import_sample_csv,
    write_device_model_import_sample_csv, write_export_bytes, write_export_file, AppState,
};
use ssh_askpass::AskpassState;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Resolve a validated, writable log directory before the Tauri builder starts.
    // `resolve_startup_log_dir` cascades through: custom persisted dir → platform
    // default → temp dir fallback. Each candidate is checked for writability via a
    // probe write, so we never hand an unwritable path to tauri-plugin-log (which
    // would panic with PluginInitialization("log", "Permission denied")).
    let early_config_dir = resolve_app_config_dir_early();
    let log_dir = resolve_startup_log_dir(early_config_dir.as_deref());

    // Clean up log files older than the retention window before opening the log.
    // Non-fatal: errors are logged as warnings inside cleanup_old_log_files.
    cleanup_old_log_files(&log_dir, LOG_RETENTION_DAYS);

    // Compute the log filename stem once at startup; tauri-plugin-log appends
    // ".log" automatically to produce e.g. "ris-2026-06-28.log".
    let log_filename_stem = daily_log_filename();
    let log_filename = format!("{log_filename_stem}.log");

    let log_file_target = tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
        path: log_dir.clone(),
        file_name: Some(log_filename_stem),
    });

    // Managed state records the directory and filename used by this process.
    // Both are frozen at startup — commands read from here, not from the clock.
    let active_log_state = ActiveLogState {
        dir: log_dir,
        filename: log_filename,
    };

    let builder = tauri::Builder::default();

    // Embedded WebDriver server — compiled in only when the wdio-embedded
    // Cargo feature is active.  Zero impact on the production binary.
    #[cfg(feature = "wdio-embedded")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    let builder = builder.plugin(
        tauri_plugin_log::Builder::new()
            .targets([
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                log_file_target,
            ])
            .level(log::LevelFilter::Info)
            .build(),
    );

    // WDIO execute API / window-focus tracking / log forwarding — compiled
    // in only when the wdio-plugin Cargo feature is active.  Zero impact on
    // the production binary. Registered *after* tauri_plugin_log: both
    // plugins attempt to claim the global `log` crate logger on setup, and
    // tauri_plugin_log panics if that slot is already taken, whereas
    // tauri-plugin-wdio's own setup already tolerates losing that race (it
    // only warns) — so tauri_plugin_log must register first. We don't use
    // wdio's log-forwarding feature, only its execute API.
    #[cfg(feature = "wdio-plugin")]
    let builder = builder.plugin(tauri_plugin_wdio::init());

    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            session: Mutex::new(None),
        })
        .manage(active_log_state)
        .manage(AskpassState::new())
        .invoke_handler(tauri::generate_handler![
            clone_repository_cmd,
            create_repository_cmd,
            open_repository_cmd,
            get_repository_summary,
            validate_current_repository,
            save_current_repository,
            close_repository,
            list_locations,
            list_racks,
            list_devices,
            list_device_models,
            get_rack_detail,
            move_placement,
            place_device,
            place_rack_object,
            remove_placement,
            add_location_cmd,
            add_rack_cmd,
            add_device_model_cmd,
            add_device_cmd,
            preview_device_csv_import_cmd,
            import_device_csv_cmd,
            preview_device_model_csv_import_cmd,
            import_device_model_csv_cmd,
            write_device_model_import_sample_csv,
            update_location_cmd,
            delete_location_cmd,
            update_rack_cmd,
            delete_rack_cmd,
            update_device_model_cmd,
            delete_device_model_cmd,
            update_device_cmd,
            delete_device_cmd,
            get_git_status,
            init_git_repository,
            get_git_log,
            commit_repository_changes,
            list_git_remotes,
            add_git_remote,
            push_git_current_branch,
            pull_git_ff_only,
            respond_ssh_passphrase,
            get_ssh_diagnostics,
            read_csv_file,
            write_device_import_sample_csv,
            write_export_file,
            write_export_bytes,
            search_repository_cmd,
            get_log_settings,
            open_logs_directory,
            set_logs_directory,
            reset_logs_directory,
        ])
        .setup(|_app| {
            log::info!("Rack Inventory Studio starting");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
