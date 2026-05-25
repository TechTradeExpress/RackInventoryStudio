mod app_config;
mod commands;
mod diagnostics;
mod dto;

use app_config::{load_app_config, resolve_app_config_dir_early, ActiveLogState};
use commands::{
    add_device_cmd, add_device_model_cmd, add_git_remote, add_location_cmd, add_rack_cmd,
    close_repository, commit_repository_changes, create_repository_cmd, delete_device_cmd,
    delete_device_model_cmd, delete_location_cmd, delete_rack_cmd, get_git_log, get_git_status,
    get_log_settings, get_rack_detail, get_repository_summary, import_device_csv_cmd,
    init_git_repository, list_device_models, list_devices, list_git_remotes, list_locations,
    list_racks, move_placement, open_logs_directory, open_repository_cmd, place_device,
    place_rack_object, preview_device_csv_import_cmd, pull_git_ff_only, push_git_current_branch,
    read_csv_file, remove_placement, reset_logs_directory, save_current_repository,
    search_repository_cmd, set_logs_directory, update_device_cmd, update_device_model_cmd,
    update_location_cmd, update_rack_cmd, validate_current_repository,
    write_device_import_sample_csv, AppState,
};
use std::path::PathBuf;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Read persisted config before the Tauri builder starts so the log plugin
    // can be initialised with the correct target directory.
    let early_config_dir = resolve_app_config_dir_early();
    let persisted_custom_log_dir: Option<PathBuf> = early_config_dir
        .as_deref()
        .map(load_app_config)
        .and_then(|cfg| cfg.logs_directory)
        .map(PathBuf::from)
        .filter(|p| {
            // Accept absolute paths that are either an existing directory or
            // a non-existent path we can attempt to create.
            p.is_absolute() && (!p.exists() || p.is_dir())
        });

    // If a valid custom directory is configured, try to create it now so the
    // log plugin can open the file handle immediately.
    if let Some(ref dir) = persisted_custom_log_dir {
        let _ = std::fs::create_dir_all(dir);
    }

    // Build the log file target: custom folder or platform LogDir.
    let log_file_target = match &persisted_custom_log_dir {
        Some(dir) => tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Folder {
            path: dir.clone(),
            file_name: None,
        }),
        None => {
            tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir { file_name: None })
        }
    };

    // Managed state records which directory this process actually logs to,
    // so `get_active_logs_dir` and the DTO can return the true active path.
    let active_log_state = ActiveLogState {
        dir: persisted_custom_log_dir,
    };

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
        .invoke_handler(tauri::generate_handler![
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
            read_csv_file,
            write_device_import_sample_csv,
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
