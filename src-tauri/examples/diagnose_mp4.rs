use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

fn main() {
    let path = Path::new(r"d:\Users\kongchun\Pictures\Camera Roll\2020\XFHN9629.MP4");
    println!("文件: {}", path.display());

    // 文件系统时间
    let meta = std::fs::metadata(path).unwrap();
    let created: chrono::DateTime<chrono::Local> = meta.created().unwrap().into();
    let modified: chrono::DateTime<chrono::Local> = meta.modified().unwrap().into();
    println!("\n文件系统时间:");
    println!("  创建时间: {}", created.format("%Y-%m-%d %H:%M:%S"));
    println!("  修改时间: {}", modified.format("%Y-%m-%d %H:%M:%S"));

    // QuickTime atoms
    let mut file = File::open(path).unwrap();
    let file_len = file.metadata().unwrap().len();

    println!("\nQuickTime Atoms:");
    scan_atoms(&mut file, file_len, 0, 0);

    // mvhd creation_time & modification_time
    file.seek(SeekFrom::Start(0)).unwrap();
    if let Some((ct, mt)) = find_mvhd_times(&mut file, file_len) {
        let ct_unix = ct - 2082844800;
        let mt_unix = mt - 2082844800;
        let ct_dt = chrono::DateTime::from_timestamp(ct_unix as i64, 0).unwrap();
        let mt_dt = chrono::DateTime::from_timestamp(mt_unix as i64, 0).unwrap();
        let ct_local: chrono::DateTime<chrono::Local> = ct_dt.into();
        let mt_local: chrono::DateTime<chrono::Local> = mt_dt.into();
        println!("\nmvhd times:");
        println!("  creation_time:     UTC={}  Local(+8)={}", ct_dt.format("%Y-%m-%d %H:%M:%S"), ct_local.format("%Y-%m-%d %H:%M:%S"));
        println!("  modification_time: UTC={}  Local(+8)={}", mt_dt.format("%Y-%m-%d %H:%M:%S"), mt_local.format("%Y-%m-%d %H:%M:%S"));
        let diff_hours = (ct_dt.timestamp() - mt_dt.timestamp()).abs() / 3600;
        println!("  creation vs modification diff = {} 小时", diff_hours);

        // 和文件系统修改时间比较
        let fs_diff_ct = (modified.timestamp() - ct_dt.timestamp()).abs() / 3600;
        let fs_diff_mt = (modified.timestamp() - mt_dt.timestamp()).abs() / 3600;
        println!("  文件修改时间 - creation_time(UTC) = {} 小时", fs_diff_ct);
        println!("  文件修改时间 - modification_time(UTC) = {} 小时", fs_diff_mt);
    }

    // 尝试读取 meta creationdate
    file.seek(SeekFrom::Start(0)).unwrap();
    if let Some(date) = find_meta_creation_date(&mut file, file_len) {
        println!("\nmoov.meta.ilst.creationdate: {}", date);
    } else {
        println!("\nmoov.meta.ilst.creationdate: 未找到");
    }
}

fn scan_atoms(file: &mut File, file_len: u64, start: u64, depth: usize) {
    let mut pos = start;
    while pos + 8 <= file_len {
        file.seek(SeekFrom::Start(pos)).unwrap();
        let mut buf = [0u8; 8];
        if file.read_exact(&mut buf).is_err() { break; }

        let size = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) as u64;
        let atom_type = String::from_utf8_lossy(&buf[4..8]);

        if size < 8 || pos + size > file_len { break; }

        let indent = "  ".repeat(depth);
        if is_container_atom(&atom_type) && size > 8 {
            println!("{}[{}] @{} size={}", indent, atom_type, pos, size);
            scan_atoms(file, pos + size, pos + 8, depth + 1);
        } else {
            println!("{}  {} @{} size={}", indent, atom_type, pos, size);
        }

        pos += size;
    }
}

fn is_container_atom(t: &str) -> bool {
    matches!(t, "moov" | "trak" | "mdia" | "minf" | "stbl" | "meta" | "ilst")
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

fn find_mvhd_times(file: &mut File, file_len: u64) -> Option<(u64, u64)> {
    file.seek(SeekFrom::Start(0)).ok()?;
    loop {
        let pos = file.stream_position().ok()?;
        if pos >= file_len { break None; }

        let (size, atom_type) = read_atom_header(file)?;
        if size < 8 || pos + size > file_len { break None; }

        if atom_type == "moov" {
            let moov_end = pos + size;
            let mut moov_pos = file.stream_position().ok()?;
            while moov_pos + 8 <= moov_end {
                let (child_size, child_type) = read_atom_header(file)?;
                if child_size < 8 || moov_pos + child_size > moov_end { break; }
                if child_type == "mvhd" {
                    let mut buf = [0u8; 4];
                    file.read_exact(&mut buf).ok()?;
                    let version = buf[0];
                    if version == 0 {
                        let mut ct_buf = [0u8; 4];
                        let mut mt_buf = [0u8; 4];
                        file.read_exact(&mut ct_buf).ok()?;
                        file.read_exact(&mut mt_buf).ok()?;
                        return Some((
                            u32::from_be_bytes(ct_buf) as u64,
                            u32::from_be_bytes(mt_buf) as u64,
                        ));
                    } else {
                        let mut ct_buf = [0u8; 8];
                        let mut mt_buf = [0u8; 8];
                        file.read_exact(&mut ct_buf).ok()?;
                        file.read_exact(&mut mt_buf).ok()?;
                        return Some((
                            u64::from_be_bytes(ct_buf),
                            u64::from_be_bytes(mt_buf),
                        ));
                    }
                }
                file.seek(SeekFrom::Current((child_size - 8) as i64)).ok()?;
                moov_pos += child_size;
            }
            break None;
        }

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

fn parse_keys_atom(data: &[u8]) -> Option<Vec<String>> {
    if data.len() < 8 { return None; }
    let count = u32::from_be_bytes([data[4], data[5], data[6], data[7]]) as usize;
    let mut offset = 8usize;
    let mut keys = Vec::with_capacity(count);
    for _ in 0..count {
        if offset + 8 > data.len() { break; }
        let key_size = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        if key_size < 8 || offset + key_size > data.len() { break; }
        let key_value = String::from_utf8_lossy(&data[offset+8..offset+key_size]);
        keys.push(key_value.trim_end_matches('\0').to_string());
        offset += key_size;
    }
    Some(keys)
}

fn parse_ilst_value(data: &[u8], target_idx: usize) -> Option<String> {
    let mut offset = 0usize;
    let mut current_idx = 0usize;
    while offset + 8 <= data.len() {
        let size = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        if size < 8 || offset + size > data.len() { break; }
        if current_idx == target_idx {
            let item_body = &data[offset+8..offset+size];
            return extract_data_atom_value(item_body);
        }
        offset += size;
        current_idx += 1;
    }
    None
}

fn extract_data_atom_value(data: &[u8]) -> Option<String> {
    if data.len() < 16 { return None; }
    let size = u32::from_be_bytes([data[0], data[1], data[2], data[3]]) as usize;
    let atom_type = String::from_utf8_lossy(&data[4..8]);
    if atom_type != "data" || size < 16 || size > data.len() { return None; }
    let value = String::from_utf8_lossy(&data[16..size]);
    let trimmed = value.trim_end_matches('\0').to_string();
    if trimmed.is_empty() { return None; }
    parse_iso8601_to_local(&trimmed)
}

fn parse_iso8601_to_local(s: &str) -> Option<String> {
    let re = regex::Regex::new(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}):?(\d{2})$").ok()?;
    let caps = re.captures(s)?;
    let year = caps[1].parse::<i32>().ok()?;
    let month = caps[2].parse::<u32>().ok()?;
    let day = caps[3].parse::<u32>().ok()?;
    let hour = caps[4].parse::<u32>().ok()?;
    let minute = caps[5].parse::<u32>().ok()?;
    let second = caps[6].parse::<u32>().ok()?;
    let tz_hour = caps[7].parse::<i32>().ok()?;
    let tz_min = caps[8].parse::<i32>().ok()?;
    let tz_offset_min = tz_hour * 60 + if tz_hour < 0 { -tz_min } else { tz_min };
    let naive = chrono::NaiveDate::from_ymd_opt(year, month, day)?.and_hms_opt(hour, minute, second)?;
    let utc = naive - chrono::Duration::minutes(tz_offset_min as i64);
    let local_dt: chrono::DateTime<chrono::Local> = chrono::DateTime::from_timestamp(utc.and_utc().timestamp(), 0)?.into();
    Some(local_dt.format("%Y-%m-%d %H:%M:%S").to_string())
}

fn find_meta_creation_date(file: &mut File, file_len: u64) -> Option<String> {
    let moov_data = read_atom_data(file, file_len, "moov")?;
    let meta_data = find_child_atom(&moov_data, "meta")?;
    let keys_data = find_child_atom(meta_data, "keys");
    let ilst_data = find_child_atom(meta_data, "ilst");
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
    let keys = parse_keys_atom(keys_data)?;
    let target_idx = keys.iter().position(|k| k == "com.apple.quicktime.creationdate")?;
    parse_ilst_value(ilst_data, target_idx)
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
