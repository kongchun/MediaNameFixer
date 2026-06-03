use crate::models::AppConfig;
use serde_json;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

pub struct ConfigManager {
    config_path: PathBuf,
    config: Mutex<AppConfig>,
}

impl ConfigManager {
    pub fn new(app_handle: &tauri::AppHandle) -> Self {
        let config_dir = app_handle.path().app_local_data_dir().unwrap_or_else(|_| {
            std::env::temp_dir().join("medianamefixer")
        });
        let _ = fs::create_dir_all(&config_dir);
        let config_path = config_dir.join("config.json");

        let config = if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            AppConfig::default()
        };

        Self {
            config_path,
            config: Mutex::new(config),
        }
    }

    pub fn get(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }

    pub fn set(&self, config: AppConfig) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
        fs::write(&self.config_path, json).map_err(|e| e.to_string())?;
        *self.config.lock().unwrap() = config;
        Ok(())
    }
}
