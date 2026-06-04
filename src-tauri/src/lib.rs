pub mod commands;
pub mod config;
pub mod core;
pub mod models;
pub mod utils;

use commands::*;
use config::ConfigManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_manager = ConfigManager::new(&app.handle());
            app.manage(config_manager);
            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon().cloned() {
                    let _ = window.set_icon(icon);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_files,
            get_special_folders,
            list_drives,
            list_directories,
            preview_rename,
            execute_rename,
            preview_archive,
            execute_archive,
            get_config,
            set_config,
            add_recent_folder,
            add_favorite_folder,
            remove_favorite_folder,
            open_folder,
            open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
