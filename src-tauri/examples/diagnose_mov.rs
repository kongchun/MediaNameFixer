use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

fn main() {
    let path = Path::new(r"d:\Users\kongchun\Pictures\Camera Roll\2020\IMG_2998.MOV");
    println!("文件: {}", path.display());

    if !path.exists() {
        println!("文件不存在!");
        return;
    }

    // 文件系统时间
    let meta = std::fs::metadata(path).unwrap();
    println!("\n===== 文件系统时间 =====");
    if let Ok(t) = meta.created() {
        let dt: chrono::DateTime<chrono::Local> = t.into();
        println!("  创建时间 (created):  {}", dt.format("%Y-%m-%d %H:%M:%S"));
    }
    if let Ok(t) = meta.modified() {
        let dt: chrono::DateTime<chrono::Local> = t.into();
        println!("  修改时间 (modified):  {}", dt.format("%Y-%m-%d %H:%M:%S"));
    }

    // 全面扫描 QuickTime atoms
    println!("\n===== QuickTime Atoms 扫描 =====");
    scan_atoms(path);

    // 尝试读 EXIF（MOV 通常没有）
    println!("\n===== EXIF 尝试 =====");
    let file = File::open(path).unwrap();
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    match exifreader.read_from_container(&mut bufreader) {
        Ok(exif) => {
            println!("  EXIF 字段数: {}", exif.fields().count());
            for field in exif.fields() {
                println!("  [{:?}] value={}", field.tag, field.display_value());
            }
        }
        Err(e) => {
            println!("  无 EXIF 数据: {}", e);
        }
    }
}

fn scan_atoms(path: &Path) {
    let mut file = File::open(path).unwrap();
    let file_len = file.metadata().unwrap().len();
    read_atoms_recursive(&mut file, file_len, 0, "");
}

fn read_atoms_recursive(file: &mut File, file_len: u64, depth: usize, parent: &str) {
    let indent = "  ".repeat(depth);
    loop {
        let pos = match file.stream_position() {
            Ok(p) => p,
            Err(_) => break,
        };
        if pos >= file_len {
            break;
        }

        let (size, atom_type) = match read_atom_header(file) {
            Some(v) => v,
            None => break,
        };

        if size < 8 {
            break;
        }

        let atom_start = pos;
        let atom_end = atom_start + size;

        let atom_path = if parent.is_empty() {
            atom_type.clone()
        } else {
            format!("{}.{}", parent, atom_type)
        };

        // 打印 creation_time 相关的 atoms
        if atom_type == "mvhd" || atom_type == "tkhd" || atom_type == "mdhd" {
            if let Some(ct) = parse_creation_time(file, &atom_type) {
                let unix_time = ct.saturating_sub(2082844800);
                if let Some(dt) = chrono::DateTime::from_timestamp(unix_time as i64, 0) {
                    let local_dt: chrono::DateTime<chrono::Local> = dt.into();
                    println!("{}[{}] creation_time: {} (UTC) / {} (Local)",
                        indent, atom_path, dt.format("%Y-%m-%d %H:%M:%S"), local_dt.format("%Y-%m-%d %H:%M:%S"));
                }
            }
            file.seek(SeekFrom::Start(atom_end)).ok();
        }
        // 读取 meta -> ilst 中的文本数据
        else if atom_type == "data" && parent.contains("ilst") {
            let mut type_buf = [0u8; 4];
            let mut locale_buf = [0u8; 4];
            if file.read_exact(&mut type_buf).is_ok() && file.read_exact(&mut locale_buf).is_ok() {
                let data_type = u32::from_be_bytes(type_buf);
                if data_type == 1 {
                    let remaining = size.saturating_sub(16);
                    let mut text_buf = vec![0u8; remaining.min(256) as usize];
                    if file.read_exact(&mut text_buf).is_ok() {
                        let text = String::from_utf8_lossy(&text_buf);
                        println!("{}[{}] text: {}", indent, atom_path, text.trim());
                    }
                }
            }
            file.seek(SeekFrom::Start(atom_end)).ok();
        }
        // 递归读取容器 atoms
        else if matches!(atom_type.as_str(),
            "moov" | "trak" | "mdia" | "minf" | "stbl" | "ilst" | "udta") {
            let child_file_len = atom_end.min(file_len);
            read_atoms_recursive(file, child_file_len, depth + 1, &atom_path);
        }
        // meta atom 有 4 字节 version/flags 头
        else if atom_type == "meta" {
            file.seek(SeekFrom::Current(4)).ok(); // skip version/flags
            let child_file_len = atom_end.min(file_len);
            read_atoms_recursive(file, child_file_len, depth + 1, &atom_path);
        } else {
            file.seek(SeekFrom::Start(atom_end)).ok();
        }

        if file.stream_position().unwrap_or(0) >= file_len {
            break;
        }
    }
}

fn parse_creation_time(file: &mut File, atom_type: &str) -> Option<u64> {
    let mut buf = [0u8; 4];
    file.read_exact(&mut buf).ok()?;
    let version = buf[0];

    // skip flags (3 bytes already read as version + flags)
    let ct = if version == 0 {
        let mut ct = [0u8; 4];
        file.read_exact(&mut ct).ok()?;
        u32::from_be_bytes(ct) as u64
    } else if version == 1 {
        let mut ct = [0u8; 8];
        file.read_exact(&mut ct).ok()?;
        u64::from_be_bytes(ct)
    } else {
        0
    };

    // For mvhd, also read modification_time and timescale
    if atom_type == "mvhd" && version == 0 {
        let mut mt = [0u8; 4];
        file.read_exact(&mut mt).ok()?;
        let mut ts = [0u8; 4];
        file.read_exact(&mut ts).ok()?;
        let timescale = u32::from_be_bytes(ts);
        println!("    mvhd timescale: {}", timescale);
    }

    Some(ct)
}

fn read_quicktime_creation_time(path: &Path) -> Option<u64> {
    let mut file = File::open(path).ok()?;
    let file_len = file.metadata().ok()?.len();
    find_creation_time(&mut file, file_len)
}

fn find_creation_time(file: &mut File, file_len: u64) -> Option<u64> {
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
            size.saturating_sub(8)
        };
        file.seek(SeekFrom::Current(skip as i64)).ok()?;
        if file.stream_position().ok()? >= file_len {
            return None;
        }
        find_creation_time(file, file_len)
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
