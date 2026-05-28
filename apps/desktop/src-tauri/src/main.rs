// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::var("RIS_ASKPASS_MODE").as_deref() == Ok("1") {
        std::process::exit(rack_inventory_studio_desktop_lib::run_as_askpass());
    }
    rack_inventory_studio_desktop_lib::run();
}
