use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

pub fn get_file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

pub fn get_creation_time(path: &Path) -> Option<String> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.created().ok())
        .map(|t| {
            let dt: chrono::DateTime<chrono::Local> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
}

pub fn get_modified_time(path: &Path) -> Option<String> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| {
            let dt: chrono::DateTime<chrono::Local> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
}

/// 读取 MOV 文件的 moov.meta.ilst 中的 creationdate（真正的拍摄时间）
pub fn get_mov_meta_creation_date(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if ext != "mov" {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    find_meta_creation_date(&mut file, file_len)
}
pub fn get_video_creation_time(path: &Path) -> Option<String> {
    get_video_creation_time_with_source(path).map(|(dt, _)| dt)
}

pub fn get_video_creation_time_with_source(path: &Path) -> Option<(String, String)> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if !matches!(ext.as_str(), "mp4" | "mov" | "m4v" | "3gp") {
        return None;
    }

    let mut file = File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();

    // 优先读取 moov.meta.ilst 中的 com.apple.quicktime.creationdate
    if let Some(date) = find_meta_creation_date(&mut file, file_len) {
        return Some((date, "media".to_string()));
    }

    // Fallback: 读取 mvhd.creation_time
    file.seek(SeekFrom::Start(0)).ok()?;
    let creation_time = find_mvhd_creation_time(&mut file, file_len)?;

    // QuickTime epoch (1904-01-01) to Unix epoch (1970-01-01) = 2082844800 seconds
    if creation_time < 2082844800 {
        return None;
    }
    let unix_time = creation_time - 2082844800;
    let dt = chrono::DateTime::from_timestamp(unix_time as i64, 0)?;

    // 所有视频格式的 creation_time 默认视为 UTC，转本地时间
    let local_dt: chrono::DateTime<chrono::Local> = dt.into();
    Some((local_dt.format("%Y-%m-%d %H:%M:%S").to_string(), "mvhd".to_string()))
}

/// 在 moov.meta.ilst 中查找 com.apple.quicktime.creationdate
fn find_meta_creation_date(file: &mut File, file_len: u64) -> Option<String> {
    // 先找到 moov atom
    let moov_data = read_atom_data(file, file_len, "moov")?;

    // 在 moov 中查找 meta atom
    let meta_data = find_child_atom(&moov_data, "meta")?;

    // 在 meta 中查找 keys 和 ilst
    // 注意：某些 MOV 文件的 meta atom 没有 version/flags，直接就是 child atoms
    let keys_data = find_child_atom(meta_data, "keys");
    let ilst_data = find_child_atom(meta_data, "ilst");

    // 如果找不到，尝试跳过前 4 字节（version/flags）再查找
    let (keys_data, ilst_data) = match (keys_data, ilst_data) {
        (Some(k), Some(i)) => (Some(k), Some(i)),
        _ => {
            if meta_data.len() >= 4 {
                let meta_body = &meta_data[4..];
                (
                    find_child_atom(meta_body, "keys").or(keys_data),
                    find_child_atom(meta_body, "ilst").or(ilst_data),
                )
            } else {
                (keys_data, ilst_data)
            }
        }
    };

    let keys_data = keys_data?;
    let ilst_data = ilst_data?;

    // 解析 keys
    let keys = parse_keys_atom(keys_data)?;

    // 查找 creationdate 对应的索引
    let target_idx = keys.iter().position(|k| {
        k == "com.apple.quicktime.creationdate"
    })?;

    // 在 ilst 中读取对应索引的值
    parse_ilst_value(ilst_data, target_idx)
}

/// 读取指定 atom 的内容（不含 atom header）
fn read_atom_data(file: &mut File, file_len: u64, target_type: &str) -> Option<Vec<u8>> {
    file.seek(SeekFrom::Start(0)).ok()?;
    loop {
        let pos = file.stream_position().ok()?;
        if pos >= file_len { break None; }

        let (size, atom_type) = read_atom_header(file)?;
        if size < 8 || pos + size > file_len { break None; }

        if atom_type == target_type {
            let data_len = (size - 8) as usize;
            let mut buf = vec![0u8; data_len];
            file.read_exact(&mut buf).ok()?;
            return Some(buf);
        } else {
            let skip = if size == 1 {
                let real_size = read_u64_be(file)?;
                real_size.saturating_sub(16)
            } else if size == 0 {
                break None;
            } else {
                size - 8
            };
            file.seek(SeekFrom::Current(skip as i64)).ok()?;
        }
    }
}

/// 在数据缓冲区中查找指定类型的 child atom
fn find_child_atom<'a>(data: &'a [u8], target_type: &str) -> Option<&'a [u8]> {
    let mut offset = 0usize;
    while offset + 8 <= data.len() {
        let size = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        let atom_type = String::from_utf8_lossy(&data[offset+4..offset+8]);
        if size < 8 || offset + size > data.len() { break; }
        if atom_type == target_type {
            return Some(&data[offset+8..offset+size]);
        }
        offset += size;
    }
    None
}

/// 解析 keys atom: version/flags(4) + count(4) + entries
fn parse_keys_atom(data: &[u8]) -> Option<Vec<String>> {
    if data.len() < 8 { return None; }
    let count = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;
    let mut offset = 8usize;
    let mut keys = Vec::with_capacity(count);

    for _ in 0..count {
        if offset + 8 > data.len() { break; }
        let key_size = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        // key_type = data[offset+4..offset+8], usually "mdta"
        if key_size < 8 || offset + key_size > data.len() { break; }
        let key_value = String::from_utf8_lossy(&data[offset+8..offset+key_size]);
        keys.push(key_value.trim_end_matches('\0').to_string());
        offset += key_size;
    }

    Some(keys)
}

/// 解析 ilst atom，读取指定索引的值
fn parse_ilst_value(data: &[u8], target_idx: usize) -> Option<String> {
    let mut offset = 0usize;
    let mut current_idx = 0usize;

    while offset + 8 <= data.len() {
        let size = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        if size < 8 || offset + size > data.len() { break; }

        if current_idx == target_idx {
            // 解析 item 内部的 data atom
            let item_body = &data[offset+8..offset+size];
            return extract_data_atom_value(item_body);
        }

        offset += size;
        current_idx += 1;
    }

    None
}

/// 从 data atom 中提取文本值
fn extract_data_atom_value(data: &[u8]) -> Option<String> {
    if data.len() < 16 { return None; }
    let size = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let atom_type = String::from_utf8_lossy(&data[4..8]);
    if atom_type != "data" || size < 16 || size > data.len() { return None; }

    // data atom: size(4) + "data"(4) + version/flags(4) + reserved(4) + value
    let value = String::from_utf8_lossy(&data[16..size]);
    let trimmed = value.trim_end_matches('\0').to_string();
    if trimmed.is_empty() { return None; }

    // 解析 ISO 8601 格式: 2020-09-19T12:21:03+0800
    parse_iso8601_to_local(&trimmed)
}

/// 将 ISO 8601 时间字符串解析为本地时间格式
fn parse_iso8601_to_local(s: &str) -> Option<String> {
    // 尝试解析带时区偏移的格式: 2020-09-19T12:21:03+0800 或 2020-09-19T12:21:03+08:00
    let re_tz = regex::Regex::new(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}):?(\d{2})$").ok()?;
    if let Some(caps) = re_tz.captures(s) {
        let year = caps[1].parse::<i32>().ok()?;
        let month = caps[2].parse::<u32>().ok()?;
        let day = caps[3].parse::<u32>().ok()?;
        let hour = caps[4].parse::<u32>().ok()?;
        let minute = caps[5].parse::<u32>().ok()?;
        let second = caps[6].parse::<u32>().ok()?;
        let tz_hour = caps[7].parse::<i32>().ok()?;
        let tz_min = caps[8].parse::<i32>().ok()?;

        // 构建 UTC 时间（先减去时区偏移）
        let tz_offset_min = tz_hour * 60 + if tz_hour < 0 { -tz_min } else { tz_min };
        let naive = chrono::NaiveDate::from_ymd_opt(year, month, day)?
            .and_hms_opt(hour, minute, second)?;
        let utc = naive - chrono::Duration::minutes(tz_offset_min as i64);

        // 转换为本地时间
        let local_dt: chrono::DateTime<chrono::Local> = chrono::DateTime::from_timestamp(utc.and_utc().timestamp(), 0)?.into();
        return Some(local_dt.format("%Y-%m-%d %H:%M:%S").to_string());
    }

    // 不带时区偏移，直接视为本地时间
    let re_no_tz = regex::Regex::new(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$").ok()?;
    let caps = re_no_tz.captures(s)?;
    let year = caps[1].parse::<i32>().ok()?;
    let month = caps[2].parse::<u32>().ok()?;
    let day = caps[3].parse::<u32>().ok()?;
    let hour = caps[4].parse::<u32>().ok()?;
    let minute = caps[5].parse::<u32>().ok()?;
    let second = caps[6].parse::<u32>().ok()?;
    let naive = chrono::NaiveDate::from_ymd_opt(year, month, day)?
        .and_hms_opt(hour, minute, second)?;
    Some(naive.format("%Y-%m-%d %H:%M:%S").to_string())
}

fn find_mvhd_creation_time(file: &mut File, file_len: u64) -> Option<u64> {
    let (size, atom_type) = read_atom_header(file)?;

    if atom_type == "moov" {
        let end_pos = file.stream_position().ok()? + size.saturating_sub(8u64);
        while file.stream_position().ok()? < end_pos {
            let (child_size, child_type) = read_atom_header(file)?;
            if child_type == "mvhd" {
                return parse_mvhd(file);
            } else {
                let skip = child_size.saturating_sub(8u64);
                file.seek(SeekFrom::Current(skip as i64)).ok()?;
            }
        }
        None
    } else if atom_type == "mvhd" {
        parse_mvhd(file)
    } else {
        let skip = if size == 1 {
            let real_size = read_u64_be(file)?;
            real_size.saturating_sub(16)
        } else if size == 0 {
            return None;
        } else {
            size - 8
        };
        file.seek(SeekFrom::Current(skip as i64)).ok()?;

        if file.stream_position().ok()? >= file_len {
            return None;
        }
        find_mvhd_creation_time(file, file_len)
    }
}

fn read_atom_header(file: &mut File) -> Option<(u64, String)> {
    let size = read_u32_be(file)? as u64;
    let atom_type = read_atom_type(file)?;
    if size == 1 {
        let real_size = read_u64_be(file)?;
        Some((real_size, atom_type))
    } else {
        Some((size, atom_type))
    }
}

fn read_u32_be(file: &mut File) -> Option<u32> {
    let mut buf = [0u8; 4];
    file.read_exact(&mut buf).ok()?;
    Some(u32::from_be_bytes(buf))
}

fn read_u64_be(file: &mut File) -> Option<u64> {
    let mut buf = [0u8; 8];
    file.read_exact(&mut buf).ok()?;
    Some(u64::from_be_bytes(buf))
}

fn read_atom_type(file: &mut File) -> Option<String> {
    let mut buf = [0u8; 4];
    file.read_exact(&mut buf).ok()?;
    Some(String::from_utf8_lossy(&buf).to_string())
}

fn parse_mvhd(file: &mut File) -> Option<u64> {
    let mut buf = [0u8; 4];
    file.read_exact(&mut buf).ok()?;
    let version = buf[0];

    if version == 0 {
        let mut ct = [0u8; 4];
        file.read_exact(&mut ct).ok()?;
        Some(u32::from_be_bytes(ct) as u64)
    } else if version == 1 {
        let mut ct = [0u8; 8];
        file.read_exact(&mut ct).ok()?;
        Some(u64::from_be_bytes(ct))
    } else {
        None
    }
}

pub fn is_media_file(ext: &str) -> bool {
    let ext = ext.to_lowercase();
    matches!(
        ext.as_str(),
        "mov" | "mp4" | "jpg" | "jpeg" | "png" | "heic" | "webp" | "bmp" | "tif" | "tiff" | "gif"
    )
}
