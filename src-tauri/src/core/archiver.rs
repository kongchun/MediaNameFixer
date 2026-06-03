use crate::models::{ArchiveMode, ArchiveOperation};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub struct ArchiveEngine;

impl ArchiveEngine {
    pub fn preview(folder_path: &str, mode: &ArchiveMode) -> Vec<ArchiveOperation> {
        let path = Path::new(folder_path);
        match mode {
            ArchiveMode::ByYear | ArchiveMode::ByYearMonth => {
                Self::preview_date_archive(path, mode)
            }
            ArchiveMode::MergeSubfolders => Self::preview_merge_subfolders(path),
        }
    }

    fn preview_date_archive(path: &Path, mode: &ArchiveMode) -> Vec<ArchiveOperation> {
        let mut operations = Vec::new();
        let mut used_names: HashSet<String> = HashSet::new();

        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                if !p.is_file() {
                    continue;
                }
                let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                let folder = Self::resolve_folder_from_name(&name, mode);
                if let Some(folder) = folder {
                    let dest = Self::unique_dest(path, &folder, &name, &mut used_names);
                    operations.push(ArchiveOperation {
                        old_path: p.to_string_lossy().to_string(),
                        new_path: dest.to_string_lossy().to_string(),
                        target_folder: folder,
                    });
                }
            }
        }
        operations
    }

    fn preview_merge_subfolders(path: &Path) -> Vec<ArchiveOperation> {
        let mut operations = Vec::new();
        let mut used_names: HashSet<String> = HashSet::new();

        if let Ok(dirs) = std::fs::read_dir(path) {
            for dir_entry in dirs.flatten() {
                let dir_path = dir_entry.path();
                if !dir_path.is_dir() {
                    continue;
                }
                if let Ok(files) = std::fs::read_dir(&dir_path) {
                    for file_entry in files.flatten() {
                        let file_path = file_entry.path();
                        if !file_path.is_file() {
                            continue;
                        }
                        let name = file_path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        let dest = Self::unique_dest(path, "", &name, &mut used_names);
                        operations.push(ArchiveOperation {
                            old_path: file_path.to_string_lossy().to_string(),
                            new_path: dest.to_string_lossy().to_string(),
                            target_folder: dir_path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                        });
                    }
                }
            }
        }
        operations
    }

    fn resolve_folder_from_name(name: &str, mode: &ArchiveMode) -> Option<String> {
        if name.len() < 10 {
            return None;
        }
        let yyyy = &name[..4];
        let dash1 = name.chars().nth(4)?;
        let mm = &name[5..7];
        let dash2 = name.chars().nth(7)?;
        if dash1 != '-' || dash2 != '-' {
            return None;
        }
        if !yyyy.chars().all(|c| c.is_ascii_digit())
            || !mm.chars().all(|c| c.is_ascii_digit())
        {
            return None;
        }
        match mode {
            ArchiveMode::ByYear => Some(yyyy.to_string()),
            ArchiveMode::ByYearMonth => Some(format!("{}{}", yyyy, mm)),
            _ => None,
        }
    }

    fn unique_dest(base: &Path, folder: &str, name: &str, used: &mut HashSet<String>) -> PathBuf {
        let dir = if folder.is_empty() {
            base.to_path_buf()
        } else {
            base.join(folder)
        };
        let mut dest = dir.join(name);
        let stem = Path::new(name)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext = Path::new(name)
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        let ext_part = if ext.is_empty() {
            "".to_string()
        } else {
            format!(".{}", ext)
        };

        let mut idx = 1;
        while used.contains(&dest.to_string_lossy().to_string()) {
            let new_name = format!("{}_{}{}", stem, idx, ext_part);
            dest = dir.join(&new_name);
            idx += 1;
        }
        used.insert(dest.to_string_lossy().to_string());
        dest
    }
}
