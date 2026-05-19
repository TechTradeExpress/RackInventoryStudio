mod commands;
mod dto;

use commands::{
    add_location_cmd, add_rack_cmd, close_repository, get_rack_detail, get_repository_summary,
    list_device_models, list_devices, list_locations, list_racks, move_placement,
    open_repository_cmd, place_device, place_rack_object, remove_placement,
    save_current_repository, validate_current_repository, AppState,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
