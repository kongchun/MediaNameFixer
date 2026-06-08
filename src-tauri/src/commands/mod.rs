use crate::config::ConfigManager;
use crate::core::archiver::ArchiveEngine;
use crate::core::exif::create_provider;
use crate::core::exif::kamadak_provider::KamadakExifProvider;
use crate::core::exif::ExifProvider;
use crate::core::renamer::RenameEngine;
use crate::models::{
    AppConfig, ArchiveOperation, ArchiveParams, DirEntry, FileInfo, QuickAccessItem, RenameOperation, RenameParams,
};
use crate::thumbnail;
use crate::utils::{get_file_size, get_modified_time, get_creation_time, is_media_file, get_video_creation_time_with_source, get_mov_meta_creation_date};
use std::path::Path;
use tauri::State;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub fn scan_files(folder_path: String, config_manager: State<'_, ConfigManager>) -> Vec<FileInfo> {
    let path = Path::new(&folder_path);
    let mut result = Vec::new();
    let exif_provider = KamadakExifProvider::new();
    let cfg = config_manager.get();
    let old_3gp_utc = cfg.old_3gp_utc;
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
            let date_taken = if let Some((dt, source)) = exif_provider.read_date_taken_with_source(&p) {
                Some((dt.format("%Y-%m-%d %H:%M:%S").to_string(), source))
            } else {
                get_video_creation_time_with_source(&p, old_3gp_utc)
            };
            let date_taken_value = date_taken.as_ref().map(|(dt, _)| dt.clone());
            let date_taken_source = date_taken.as_ref().map(|(_, source)| source.clone());
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
                date_taken: date_taken_value,
                date_taken_source,
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
    let engine = RenameEngine::new(provider.as_ref(), cfg.old_3gp_utc);
    engine.preview(&params.folder_path, &params.mode, params.recursive, params.selected_paths.as_ref())
}

#[tauri::command]
pub fn execute_rename(operations: Vec<RenameOperation>) -> Result<(), String> {
    if operations.is_empty() {
        return Ok(());
    }

    let old_paths: std::collections::HashSet<String> =
        operations.iter().map(|op| op.old_path.clone()).collect();

    // 分离有冲突和无冲突的操作
    // 冲突定义：某个操作的 new_path 等于另一个操作的 old_path
    let (conflict_ops, direct_ops): (Vec<_>, Vec<_>) = operations
        .into_iter()
        .partition(|op| old_paths.contains(&op.new_path));

    // 1. 无冲突的直接执行
    for op in &direct_ops {
        std::fs::rename(&op.old_path, &op.new_path).map_err(|e| e.to_string())?;
    }

    // 2. 有冲突的先走临时名（两阶段，避免覆盖）
    if !conflict_ops.is_empty() {
        let temp_suffix = format!(".tmp_rename_{}", std::process::id());

        // 2a. 全部先改成临时名
        for op in &conflict_ops {
            let temp_path = op.old_path.clone() + &temp_suffix;
            std::fs::rename(&op.old_path, &temp_path).map_err(|e| e.to_string())?;
        }

        // 2b. 再从临时名改到最终目标
        for op in &conflict_ops {
            let temp_path = op.old_path.clone() + &temp_suffix;
            std::fs::rename(&temp_path, &op.new_path).map_err(|e| e.to_string())?;
        }
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

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/c", "start", "", &path])
            .creation_flags(CREATE_NO_WINDOW)
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

#[tauri::command]
pub fn open_folder_and_select(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        // macOS 先打开文件夹，无法直接选中文件
        let folder = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        std::process::Command::new("open")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        let folder = std::path::Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path);
        std::process::Command::new("xdg-open")
            .arg(&folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(&["/c", "start", "", &url])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn check_remote_version(url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(2))
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    
    let resp = client.get(&url)
        .header("User-Agent", "MediaNameFixer")
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {}", e))?;
    
    if !resp.status().is_success() {
        return Err(format!("HTTP {}: {}", resp.status().as_u16(), url));
    }
    
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("JSON 解析失败: {}", e))
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub fn get_thumbnail(file_path: String) -> Result<String, String> {
    thumbnail::generate_thumbnail(&file_path)
}

#[tauri::command]
pub fn get_thumbnail_cache_size() -> Result<String, String> {
    let size = thumbnail::get_cache_size()?;
    Ok(thumbnail::format_size(size))
}

#[tauri::command]
pub fn clear_thumbnail_cache() -> Result<(), String> {
    thumbnail::clear_thumbnail_cache()
}

#[tauri::command]
pub fn download_update(url: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url)
        .header("User-Agent", "MediaNameFixer")
        .send()
        .map_err(|e| format!("下载失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}: {}", resp.status().as_u16(), url));
    }

    // 保存到应用数据目录，避免被用户误删或被安全软件拦截
    let save_dir = dirs::data_local_dir()
        .map(|d| d.join("MediaNameFixer").join("updates"))
        .unwrap_or_else(|| std::env::temp_dir().join("MediaNameFixer").join("updates"));
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    let file_name = url.split('/').last().unwrap_or("update.exe");
    let file_path = save_dir.join(file_name);

    let bytes = resp.bytes().map_err(|e| e.to_string())?;
    std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;

    // 清理旧安装包，只保留最新的 2 个
    if let Ok(entries) = std::fs::read_dir(&save_dir) {
        let mut files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_file())
            .filter_map(|e| {
                let meta = e.metadata().ok()?;
                let modified = meta.modified().ok()?;
                Some((e.path(), modified))
            })
            .collect();
        files.sort_by(|a, b| b.1.cmp(&a.1)); // 按修改时间降序
        for (path, _) in files.iter().skip(2) {
            let _ = std::fs::remove_file(path);
        }
    }

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn install_update(path: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        // 正常模式启动安装包（显示 NSIS 向导）
        std::process::Command::new(&path)
            .spawn()
            .map_err(|e| format!("启动安装程序失败: {}", e))?;

        // 延迟 2 秒后退出当前应用，释放文件锁
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(2));
            app_handle.exit(0);
        });
    }

    #[cfg(not(target_os = "windows"))]
    {
        return Err("暂不支持此平台".to_string());
    }

    Ok(())
}
