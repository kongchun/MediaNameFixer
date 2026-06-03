use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

fn main() {
    let path = Path::new(r"d:\Users\kongchun\Pictures\Camera Roll\2020\IMG_2998.MOV");
    println!("测试文件: {}", path.display());

    let mut file = File::open(path).unwrap();
    let file_len = file.metadata().unwrap().len();

    // Step 1: 读取 moov atom
    println!("\n=== Step 1: 读取 moov atom ===");
    let moov_data = read_atom_data(&mut file, file_len, "moov");
    match &moov_data {
        Some(data) => println!("moov atom 大小: {} bytes", data.len()),
        None => println!("未找到 moov atom!"),
    }

    // Step 2: 在 moov 中查找 meta
    println!("\n=== Step 2: 在 moov 中查找 meta ===");
    let meta_data = moov_data.as_ref().and_then(|d| find_child_atom(d, "meta"));
    match &meta_data {
        Some(data) => {
            println!("meta atom body 大小: {} bytes", data.len());
            println!("前 16 bytes (hex): {:02x?}", &data[..data.len().min(16)]);
        }
        None => println!("未找到 meta atom!"),
    }

    // Step 3: 跳过 version/flags，查找 keys 和 ilst
    println!("\n=== Step 3: 查找 keys 和 ilst ===");
    if let Some(meta) = meta_data {
        if meta.len() >= 4 {
            let meta_body = &meta[4..];
            println!("meta_body 大小: {} bytes", meta_body.len());

            // 打印 meta_body 中所有 child atoms
            println!("\nmeta_body 中的所有 child atoms:");
            let mut offset = 0usize;
            while offset + 8 <= meta_body.len() {
                let size = u32::from_be_bytes([meta_body[offset], meta_body[offset+1], meta_body[offset+2], meta_body[offset+3]]) as usize;
                let atom_type = String::from_utf8_lossy(&meta_body[offset+4..offset+8]);
                if size < 8 || offset + size > meta_body.len() {
                    println!("  offset={}: invalid atom size={}", offset, size);
                    break;
                }
                println!("  offset={}: type='{}' size={} body={} bytes", offset, atom_type, size, size-8);
                offset += size;
            }

            let keys_data = find_child_atom(meta_body, "keys");
            let ilst_data = find_child_atom(meta_body, "ilst");

            match &keys_data {
                Some(data) => println!("keys atom body 大小: {} bytes", data.len()),
                None => println!("未找到 keys atom!"),
            }
            match &ilst_data {
                Some(data) => println!("ilst atom body 大小: {} bytes", data.len()),
                None => println!("未找到 ilst atom!"),
            }

            // Step 4: 解析 keys
            println!("\n=== Step 4: 解析 keys ===");
            if let Some(keys) = keys_data {
                let parsed_keys = parse_keys_atom(keys);
                match &parsed_keys {
                    Some(klist) => {
                        println!("解析到 {} 个 keys:", klist.len());
                        for (i, k) in klist.iter().enumerate() {
                            println!("  [{}] '{}'", i, k);
                        }
                    }
                    None => println!("解析 keys 失败!"),
                }

                // Step 5: 查找 creationdate 索引
                println!("\n=== Step 5: 查找 creationdate ===");
                if let Some(klist) = parsed_keys {
                    let idx = klist.iter().position(|k| k == "com.apple.quicktime.creationdate");
                    match idx {
                        Some(i) => println!("creationdate 在索引: {}", i),
                        None => println!("未找到 com.apple.quicktime.creationdate!"),
                    }

                    // Step 6: 解析 ilst
                    if let Some(ilst) = ilst_data {
                        if let Some(i) = idx {
                            let value = parse_ilst_value(ilst, i);
                            match &value {
                                Some(v) => println!("ilst[{}] 的值: '{}'", i, v),
                                None => println!("解析 ilst[{}] 失败!", i),
                            }
                        }
                    }
                }
            }
        } else {
            println!("meta atom 太小 (< 4 bytes)");
        }
    }

    // 直接测试公共函数
    println!("\n=== 直接测试 get_mov_meta_creation_date ===");
    let result = get_mov_meta_creation_date(path);
    match result {
        Some(v) => println!("结果: '{}'", v),
        None => println!("get_mov_meta_creation_date 返回 None"),
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
    find_child_atom_debug(data, target_type)
}

fn find_child_atom_debug<'a>(data: &'a [u8], target_type: &str) -> Option<&'a [u8]> {
    let mut offset = 0usize;
    println!("    find_child_atom: 数据大小={}, 查找 '{}'", data.len(), target_type);
    while offset + 8 <= data.len() {
        let size = u32::from_be_bytes([data[offset], data[offset+1], data[offset+2], data[offset+3]]) as usize;
        let atom_type = String::from_utf8_lossy(&data[offset+4..offset+8]);
        println!("      offset={}: type='{}' size={}", offset, atom_type, size);
        if size < 8 || offset + size > data.len() {
            println!("      -> invalid, break");
            break;
        }
        if atom_type == target_type {
            println!("      -> found! returning body [{}..{}] = {} bytes", offset+8, offset+size, size-8);
            return Some(&data[offset+8..offset+size]);
        }
        offset += size;
    }
    println!("      -> not found");
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
    let naive = chrono::NaiveDate::from_ymd_opt(year, month, day)?
        .and_hms_opt(hour, minute, second)?;
    let utc = naive - chrono::Duration::minutes(tz_offset_min as i64);

    let local_dt: chrono::DateTime<chrono::Local> = chrono::DateTime::from_timestamp(utc.and_utc().timestamp(), 0)?.into();
    Some(local_dt.format("%Y-%m-%d %H:%M:%S").to_string())
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

fn get_mov_meta_creation_date(path: &Path) -> Option<String> {
    let ext = path.extension()?.to_str()?.to_lowercase();
    if ext != "mov" {
        return None;
    }
    let mut file = File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    find_meta_creation_date(&mut file, file_len)
}

fn find_meta_creation_date(file: &mut File, file_len: u64) -> Option<String> {
    let moov_data = read_atom_data(file, file_len, "moov")?;
    let meta_data = find_child_atom(&moov_data, "meta")?;
    if meta_data.len() < 4 { return None; }
    let meta_body = &meta_data[4..];
    let keys_data = find_child_atom(meta_body, "keys")?;
    let ilst_data = find_child_atom(meta_body, "ilst")?;
    let keys = parse_keys_atom(keys_data)?;
    let target_idx = keys.iter().position(|k| {
        k == "com.apple.quicktime.creationdate"
    })?;
    parse_ilst_value(ilst_data, target_idx)
}
