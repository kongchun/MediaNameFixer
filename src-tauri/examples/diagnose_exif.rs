use std::fs::File;
use std::io::BufReader;
use std::path::Path;

fn main() {
    let folder = r"d:\Users\kongchun\Desktop\新建文件夹";
    println!("诊断文件夹: {}", folder);

    let entries = std::fs::read_dir(folder).unwrap();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if ext != "jpg" && ext != "jpeg" {
            continue;
        }

        println!("\n===== 文件: {} =====", path.display());

        let file = match File::open(&path) {
            Ok(f) => f,
            Err(e) => {
                println!("  打开失败: {}", e);
                continue;
            }
        };
        let mut bufreader = BufReader::new(&file);
        let exifreader = exif::Reader::new();
        let exif = match exifreader.read_from_container(&mut bufreader) {
            Ok(e) => e,
            Err(e) => {
                println!("  无 EXIF 数据: {}", e);
                continue;
            }
        };

        println!("  EXIF 字段数: {}", exif.fields().count());

        for field in exif.fields() {
            let tag_name = format!("{:?}", field.tag);
            if tag_name.contains("Date")
                || tag_name.contains("Time")
                || tag_name.contains("Original")
                || tag_name.contains("Create")
            {
                println!(
                    "  [{}] ifd={:?} value={}",
                    tag_name,
                    field.ifd_num,
                    field.display_value()
                );
            }
        }

        // 特别查找 DateTimeOriginal
        for field in exif.fields() {
            if field.tag == exif::Tag::DateTimeOriginal {
                println!("  >>> DateTimeOriginal 找到! value={:?}", field.value);
            }
        }
    }
}
