mod app_config;
mod commands;
mod diagnostics;
mod dto;
mod ssh_askpass;

pub use ssh_askpass::run_as_askpass;

use app_config::{resolve_app_config_dir_early, resolve_startup_log_dir, ActiveLogState};
use commands::{
    add_device_cmd, add_device_model_cmd, add_git_remote, add_location_cmd, add_rack_cmd,
    clone_repository_cmd, close_repository, commit_repository_changes, create_repository_cmd,
    delete_device_cmd, delete_device_model_cmd, delete_location_cmd, delete_rack_cmd, get_git_log,
    get_git_status, get_log_settings, get_rack_detail, get_repository_summary, get_ssh_diagnostics,
    import_device_csv_cmd, init_git_repository, list_device_models, list_devices, list_git_remotes,
    list_locations, list_racks, move_placement, open_logs_directory, open_repository_cmd,
    place_device, place_rack_object, preview_device_csv_import_cmd, pull_git_ff_only,
    push_git_current_branch, read_csv_file, remove_placement, reset_logs_directory,
    respond_ssh_passphrase, save_current_repository, search_repository_cmd, set_logs_directory,
    update_device_cmd, update_device_model_cmd, update_location_cmd, update_rack_cmd,
    validate_current_repository, write_device_import_sample_csv, write_export_bytes,
    write_export_file, AppState,
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

    let log_file_target = tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
        path: log_dir.clone(),
        file_name: None,
    });

    // Managed state records which directory this process actually logs to,
    // so `get_active_logs_dir` and the DTO can return the true active path.
    let active_log_state = ActiveLogState { dir: log_dir };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    log_file_target,
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
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
