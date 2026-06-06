use crate::core::exif::ExifProvider;
use crate::models::{RenameMode, RenameOperation};
use crate::utils::{get_creation_time, get_modified_time, is_media_file, get_video_creation_time, get_video_creation_time_with_source, get_mov_meta_creation_date};
use regex::Regex;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub struct RenameEngine<'a> {
    exif_provider: &'a dyn ExifProvider,
}

impl<'a> RenameEngine<'a> {
    pub fn new(exif_provider: &'a dyn ExifProvider) -> Self {
        Self { exif_provider }
    }

    pub fn preview(
        &self,
        folder_path: &str,
        mode: &RenameMode,
        recursive: bool,
        selected_paths: Option<&Vec<String>>,
    ) -> Vec<RenameOperation> {
        let path = Path::new(folder_path);
        let entries = collect_files(path, recursive);
        let mut operations = Vec::new();
        let mut used_names: HashSet<String> = HashSet::new();

        for entry in entries {
            let entry_path_str = entry.to_string_lossy().to_string();
            if let Some(selected) = selected_paths {
                if !selected.contains(&entry_path_str) {
                    continue;
                }
            }
            let ext = entry
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_string();
            if !is_media_file(&ext) {
                continue;
            }

            let old_name = entry.file_name().unwrap_or_default().to_string_lossy().to_string();

            // 读取拍摄时间（EXIF 或视频 QuickTime 时间）
            let date_taken_result = self.exif_provider.read_date_taken_with_source(&entry)
                .map(|(dt, source)| (dt.format("%Y-%m-%d %H:%M:%S").to_string(), source))
                .or_else(|| get_video_creation_time_with_source(&entry));
            let date_taken = date_taken_result.as_ref().map(|(dt, _)| dt.clone());
            let date_taken_source = date_taken_result.as_ref().map(|(_, source)| source.clone());
            let date_modified = get_modified_time(&entry);
            // MOV 文件使用 moov.meta.ilst.creationdate 作为创建时间
            let date_created = if ext.to_lowercase() == "mov" {
                get_mov_meta_creation_date(&entry).or_else(|| get_creation_time(&entry))
            } else {
                get_creation_time(&entry)
            };

            // 生成新文件名
            let (new_name, time_source) = match mode {
                RenameMode::ByDateTime => {
                    self.build_name_by_earliest(&entry, &ext, &date_taken, &date_created, &date_modified)
                }
                RenameMode::ByFileName => {
                    (extract_digits_date(&old_name, &ext), None)
                }
            };

            if let Some(new_name) = new_name {
                let unique_name = make_unique_name(&new_name, &ext, &mut used_names);
                let new_path = entry.with_file_name(&unique_name);
                operations.push(RenameOperation {
                    old_path: entry.to_string_lossy().to_string(),
                    new_path: new_path.to_string_lossy().to_string(),
                    old_name,
                    new_name: unique_name,
                    date_taken,
                    date_taken_source,
                    date_created,
                    date_modified,
                    time_source: time_source.map(|s| s.to_string()),
                });
            }
        }

        operations
    }

    /// 比较拍摄时间、创建时间和修改时间，选择最早的
    fn build_name_by_earliest(
        &self,
        path: &Path,
        ext: &str,
        _date_taken: &Option<String>,
        date_created: &Option<String>,
        date_modified: &Option<String>,
    ) -> (Option<String>, Option<&str>) {
        let taken_dt = self.exif_provider.read_date_taken(path)
            .or_else(|| {
                get_video_creation_time(path).and_then(|s| {
                    chrono::NaiveDateTime::parse_from_str(&s, "%Y-%m-%d %H:%M:%S").ok()
                })
            });
        let created_dt = date_created.as_ref().and_then(|s| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok()
        });
        let modified_dt = date_modified.as_ref().and_then(|s| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S").ok()
        });

        // 找出最早的时间
        let mut earliest = None;
        let mut source = None;

        if let Some(taken) = taken_dt {
            earliest = Some(taken);
            source = Some("exif");
        }

        if let Some(created) = created_dt {
            if earliest.map_or(true, |e| created < e) {
                earliest = Some(created);
                source = Some("created");
            }
        }

        if let Some(modified) = modified_dt {
            if earliest.map_or(true, |e| modified < e) {
                earliest = Some(modified);
                source = Some("modified");
            }
        }

        match (earliest, source) {
            (Some(dt), Some(src)) => {
                let final_source = if get_video_creation_time(path).is_some() && src == "exif" {
                    "video"
                } else {
                    src
                };
                (
                    Some(format!("{}.{}", dt.format("%Y-%m-%d %H%M%S"), ext.to_lowercase())),
                    Some(final_source),
                )
            }
            _ => (None, None),
        }
    }
}

fn collect_files(path: &Path, recursive: bool) -> Vec<PathBuf> {
    let mut result = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                result.push(p);
            } else if recursive && p.is_dir() {
                result.extend(collect_files(&p, recursive));
            }
        }
    }
    result
}

fn extract_digits_date(filename: &str, ext: &str) -> Option<String> {
    let re = Regex::new(r"(\d{4})\D?(\d{2})\D?(\d{2})\D?(\d{2})\D?(\d{2})\D?(\d{2})").ok()?;
    if let Some(caps) = re.captures(filename) {
        let y = &caps[1];
        let m = &caps[2];
        let d = &caps[3];
        let h = &caps[4];
        let min = &caps[5];
        let s = &caps[6];
        return Some(format!("{}-{}-{} {}{}{}.{}" , y, m, d, h, min, s, ext.to_lowercase()));
    }
    None
}

fn make_unique_name(name: &str, ext: &str, used: &mut HashSet<String>) -> String {
    let base = name.rfind('.').map(|i| &name[..i]).unwrap_or(name);
    let mut candidate = name.to_string();
    let mut idx = 1;
    while used.contains(&candidate) {
        candidate = format!("{}({}).{}", base, idx, ext.to_lowercase());
        idx += 1;
    }
    used.insert(candidate.clone());
    candidate
}
