use crate::config::ConfigManager;
use crate::core::archiver::ArchiveEngine;
use crate::core::exif::create_provider;
use crate::core::exif::kamadak_provider::KamadakExifProvider;
use crate::core::exif::ExifProvider;
use crate::core::renamer::RenameEngine;
use crate::models::{
    AppConfig, ArchiveOperation, ArchiveParams, DirEntry, FileInfo, QuickAccessItem, RenameOperation, RenameParams,
};
use crate::utils::{get_file_size, get_modified_time, get_creation_time, is_media_file, get_video_creation_time, get_mov_meta_creation_date};
use std::path::Path;
use tauri::State;

#[tauri::command]
pub fn scan_files(folder_path: String) -> Vec<FileInfo> {
    let path = Path::new(&folder_path);
    let mut result = Vec::new();
    let exif_provider = KamadakExifProvider::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() {
                continue;
            }
            let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
            let ext = p
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();
            if !is_media_file(&ext) {
                continue;
            }
            let date_taken = exif_provider.read_date_taken(&p)
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
                .or_else(|| get_video_creation_time(&p));
            // MOV 文件使用 moov.meta.ilst.creationdate 作为创建时间
            let date_created = if ext.to_lowercase() == "mov" {
                get_mov_meta_creation_date(&p).or_else(|| get_creation_time(&p))
            } else {
                get_creation_time(&p)
            };
            result.push(FileInfo {
                path: p.to_string_lossy().to_string(),
                size: get_file_size(&p),
                ext: ext.clone(),
                date_created,
                date_modified: get_modified_time(&p),
                date_taken,
                name,
            });
        }
    }
    result.sort_by(|a, b| compare_filename_natural(&a.name, &b.name));
    result
}

fn compare_filename_natural(a: &str, b: &str) -> std::cmp::Ordering {
    // 分离扩展名，先按名称自然排序，再按扩展名字典序
    let (a_name, a_ext) = a.rsplit_once('.').unwrap_or((a, ""));
    let (b_name, b_ext) = b.rsplit_once('.').unwrap_or((b, ""));
    match natural_cmp(a_name, b_name) {
        std::cmp::Ordering::Equal => a_ext.cmp(b_ext),
        other => other,
    }
}

fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut a_chars = a.chars().peekable();
    let mut b_chars = b.chars().peekable();
    loop {
        match (a_chars.peek(), b_chars.peek()) {
            (None, None) => return std::cmp::Ordering::Equal,
            (None, Some(_)) => return std::cmp::Ordering::Less,
            (Some(_), None) => return std::cmp::Ordering::Greater,
            (Some(&ac), Some(&bc)) => {
                if ac.is_ascii_digit() && bc.is_ascii_digit() {
                    let mut a_num = 0u64;
                    while let Some(&c) = a_chars.peek() {
                        if !c.is_ascii_digit() { break; }
                        a_chars.next();
                        a_num = a_num * 10 + (c as u64 - '0' as u64);
                    }
                    let mut b_num = 0u64;
                    while let Some(&c) = b_chars.peek() {
                        if !c.is_ascii_digit() { break; }
                        b_chars.next();
                        b_num = b_num * 10 + (c as u64 - '0' as u64);
                    }
                    match a_num.cmp(&b_num) {
                        std::cmp::Ordering::Equal => continue,
                        other => return other,
                    }
                } else {
                    a_chars.next();
                    b_chars.next();
                    match ac.cmp(&bc) {
                        std::cmp::Ordering::Equal => continue,
                        other => return other,
                    }
                }
            }
        }
    }
}

#[tauri::command]
pub fn preview_rename(
    params: RenameParams,
    config_manager: State<'_, ConfigManager>,
) -> Vec<RenameOperation> {
    let cfg = config_manager.get();
    let provider = create_provider(&cfg.exif_provider, cfg.exiftool_path.as_deref());
    let engine = RenameEngine::new(provider.as_ref());
    engine.preview(&params.folder_path, &params.mode, params.recursive, params.selected_paths.as_ref())
}

#[tauri::command]
pub fn execute_rename(operations: Vec<RenameOperation>) -> Result<(), String> {
    for op in operations {
        std::fs::rename(&op.old_path, &op.new_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn preview_archive(params: ArchiveParams) -> Vec<ArchiveOperation> {
    ArchiveEngine::preview(&params.folder_path, &params.mode)
}

#[tauri::command]
pub fn execute_archive(operations: Vec<ArchiveOperation>) -> Result<(), String> {
    for op in &operations {
        if let Some(parent) = Path::new(&op.new_path).parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    for op in operations {
        std::fs::rename(&op.old_path, &op.new_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_special_folders() -> Vec<QuickAccessItem> {
    let mut items = Vec::new();
    if let Some(path) = dirs::desktop_dir() {
        items.push(QuickAccessItem {
            name: "桌面".to_string(),
            path: path.to_string_lossy().to_string(),
        });
    }
    if let Some(path) = dirs::picture_dir() {
        items.push(QuickAccessItem {
            name: "图片".to_string(),
            path: path.to_string_lossy().to_string(),
        });
    }
    items
}

#[tauri::command]
pub fn list_drives() -> Vec<DirEntry> {
    let mut drives = Vec::new();
    for letter in b'A'..=b'Z' {
        let drive = format!("{}:\\", letter as char);
        if std::path::Path::new(&drive).exists() {
            drives.push(DirEntry {
                name: drive.clone(),
                path: drive,
                is_dir: true,
            });
        }
    }
    drives
}

#[tauri::command]
pub fn list_directories(parent_path: String) -> Vec<DirEntry> {
    let path = Path::new(&parent_path);
    let mut result = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                result.push(DirEntry {
                    name,
                    path: p.to_string_lossy().to_string(),
                    is_dir: true,
                });
            }
        }
    }
    result.sort_by(|a, b| a.name.cmp(&b.name));
    result
}

#[tauri::command]
pub fn get_config(config_manager: State<'_, ConfigManager>) -> AppConfig {
    config_manager.get()
}

#[tauri::command]
pub fn set_config(
    config: AppConfig,
    config_manager: State<'_, ConfigManager>,
) -> Result<(), String> {
    config_manager.set(config)
}

#[tauri::command]
pub fn add_recent_folder(
    folder_path: String,
    config_manager: State<'_, ConfigManager>,
) -> Result<(), String> {
    let mut config = config_manager.get();
    config.last_folder = Some(folder_path.clone());
    // 去重并移到最前面
    config.recent_folders.retain(|p| p != &folder_path);
    config.recent_folders.insert(0, folder_path);
    // 最多保留 5 个
    config.recent_folders.truncate(5);
    config_manager.set(config)
}

#[tauri::command]
pub fn add_favorite_folder(
    folder_path: String,
    config_manager: State<'_, ConfigManager>,
) -> Result<(), String> {
    let mut config = config_manager.get();
    if !config.favorite_folders.contains(&folder_path) {
        config.favorite_folders.push(folder_path);
    }
    config_manager.set(config)
}

#[tauri::command]
pub fn remove_favorite_folder(
    folder_path: String,
    config_manager: State<'_, ConfigManager>,
) -> Result<(), String> {
    let mut config = config_manager.get();
    config.favorite_folders.retain(|p| p != &folder_path);
    config_manager.set(config)
}

#[tauri::command]
pub fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}
