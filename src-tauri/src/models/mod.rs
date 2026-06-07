use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub ext: String,
    pub date_taken: Option<String>,
    pub date_taken_source: Option<String>,
    pub date_created: Option<String>,
    pub date_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameOperation {
    pub old_path: String,
    pub new_path: String,
    pub old_name: String,
    pub new_name: String,
    pub date_taken: Option<String>,
    pub date_taken_source: Option<String>,
    pub date_created: Option<String>,
    pub date_modified: Option<String>,
    pub time_source: Option<String>, // "exif" | "video" | "modified" | "created"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveOperation {
    pub old_path: String,
    pub new_path: String,
    pub target_folder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenameParams {
    pub folder_path: String,
    pub mode: RenameMode,
    pub recursive: bool,
    pub selected_paths: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveParams {
    pub folder_path: String,
    pub mode: ArchiveMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RenameMode {
    ByDateTime,
    ByFileName,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ArchiveMode {
    ByYear,
    ByYearMonth,
    MergeSubfolders,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickAccessItem {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub exif_provider: String,
    pub exiftool_path: Option<String>,
    pub last_folder: Option<String>,
    pub last_selected_folder: Option<String>,
    pub expanded_paths: Vec<String>,
    pub recent_folders: Vec<String>,
    pub favorite_folders: Vec<String>,
    pub time_tolerance_seconds: u32,
    pub prefer_date_taken: bool,
    pub date_format: String,
    pub duplicate_suffix: String,
    pub old_3gp_utc: bool,
    pub select_earlier: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            exif_provider: "kamadak".to_string(),
            exiftool_path: None,
            last_folder: None,
            last_selected_folder: None,
            expanded_paths: Vec::new(),
            recent_folders: Vec::new(),
            favorite_folders: Vec::new(),
            time_tolerance_seconds: 2,
            prefer_date_taken: false,
            date_format: "YYYY-MM-DD HHmmss".to_string(),
            duplicate_suffix: "(c)".to_string(),
            old_3gp_utc: true,
            select_earlier: true,
        }
    }
}
