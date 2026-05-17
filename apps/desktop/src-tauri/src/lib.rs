mod commands;
mod dto;

use commands::{
    close_repository, get_repository_summary, open_repository_cmd, save_current_repository,
    validate_current_repository, AppState,
};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            session: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            open_repository_cmd,
            get_repository_summary,
            validate_current_repository,
            save_current_repository,
            close_repository,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
