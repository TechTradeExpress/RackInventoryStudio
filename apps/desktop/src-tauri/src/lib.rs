mod commands;
mod dto;

use commands::{
    add_device_cmd, add_device_model_cmd, add_git_remote, add_location_cmd, add_rack_cmd,
    close_repository, commit_repository_changes, create_repository_cmd, delete_device_cmd,
    delete_device_model_cmd, delete_location_cmd, delete_rack_cmd, get_git_log, get_git_status,
    get_rack_detail, get_repository_summary, import_device_csv_cmd, init_git_repository,
    list_device_models, list_devices, list_git_remotes, list_locations, list_racks, move_placement,
    open_repository_cmd, place_device, place_rack_object, preview_device_csv_import_cmd,
    pull_git_ff_only, push_git_current_branch, read_csv_file, remove_placement,
    save_current_repository, search_repository_cmd, update_device_cmd, update_device_model_cmd,
    update_location_cmd, update_rack_cmd, validate_current_repository, AppState,
};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            session: Mutex::new(None),
        })
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
            search_repository_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
