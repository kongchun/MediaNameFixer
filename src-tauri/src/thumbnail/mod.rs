use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
mod system_thumbnail;

const THUMB_WIDTH: u32 = 120;
const THUMB_HEIGHT: u32 = 120;
#[allow(dead_code)]
const MAX_CACHE_SIZE_BYTES: u64 = 1024 * 1024 * 1024; // 1GB

fn get_cache_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| std::env::temp_dir())
        .join("MediaNameFixer")
        .join("thumbnails")
}

fn get_cache_key(file_path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    file_path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn get_thumbnail_cache_path(file_path: &str) -> PathBuf {
    let cache_dir = get_cache_dir();
    let cache_key = get_cache_key(file_path);
    // v2 表示带方向修正的版本，废弃旧缓存
    cache_dir.join(format!("{}_v2.jpg", cache_key))
}

fn is_image(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "tif"
    )
}

fn is_video(ext: &str) -> bool {
    matches!(
        ext.to_lowercase().as_str(),
        "mp4" | "mov" | "avi" | "mkv" | "flv" | "wmv" | "m4v" | "3gp" | "mpg" | "mpeg" | "ts" | "webm" | "m2ts" | "mts"
    )
}

pub fn generate_thumbnail(file_path: &str) -> Result<String, String> {
    let path = Path::new(file_path);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");

    let cache_path = get_thumbnail_cache_path(file_path);

    // 如果缓存已存在且文件未修改，直接返回
    if cache_path.exists() {
        if let Ok(metadata) = std::fs::metadata(file_path) {
            if let Ok(modified) = metadata.modified() {
                if let Ok(cache_metadata) = std::fs::metadata(&cache_path) {
                    if let Ok(cache_modified) = cache_metadata.modified() {
                        if cache_modified >= modified {
                            // 更新缓存文件访问时间，实现 LRU
                            let _ = touch_file(&cache_path);
                            return Ok(cache_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }

    // 确保缓存目录存在
    if let Some(parent) = cache_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    // 缓存大小检查暂时关闭
    // let _ = enforce_cache_limit();

    // 优先尝试 Windows 系统缩略图（性能更好，方向正确，支持视频/图片）
    #[cfg(target_os = "windows")]
    {
        if system_thumbnail::get_system_thumbnail(file_path, &cache_path) {
            return Ok(cache_path.to_string_lossy().to_string());
        }
    }

    // 视频文件系统缩略图失败，返回空表示使用图标
    if is_video(ext) {
        return Ok(String::new());
    }

    // 非图片文件也不生成
    if !is_image(ext) {
        return Ok(String::new());
    }

    // 回退：自己生成缩略图（处理 EXIF 方向）
    let img = image::open(file_path).map_err(|e| format!("打开图片失败: {}", e))?;
    let oriented = apply_exif_orientation(img, file_path);
    let thumb = oriented.thumbnail(THUMB_WIDTH, THUMB_HEIGHT);

    let mut output = std::fs::File::create(&cache_path).map_err(|e| format!("创建缩略图文件失败: {}", e))?;
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, 85);
    let rgb = thumb.to_rgb8();
    image::ImageEncoder::write_image(
        encoder,
        rgb.as_raw(),
        rgb.width(),
        rgb.height(),
        image::ExtendedColorType::Rgb8,
    )
    .map_err(|e| format!("编码缩略图失败: {}", e))?;

    Ok(cache_path.to_string_lossy().to_string())
}

fn read_exif_orientation(path: &str) -> u32 {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return 1,
    };
    let mut bufreader = std::io::BufReader::new(&file);
    let exifreader = exif::Reader::new();
    let exif = match exifreader.read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return 1,
    };
    for field in exif.fields() {
        if field.tag == exif::Tag::Orientation {
            if let exif::Value::Short(vec) = &field.value {
                return vec.first().copied().unwrap_or(1) as u32;
            }
        }
    }
    1
}

fn flip_horizontal(img: image::DynamicImage) -> image::DynamicImage {
    let rgba = img.to_rgba8();
    image::DynamicImage::ImageRgba8(image::imageops::flip_horizontal(&rgba))
}

fn flip_vertical(img: image::DynamicImage) -> image::DynamicImage {
    let rgba = img.to_rgba8();
    image::DynamicImage::ImageRgba8(image::imageops::flip_vertical(&rgba))
}

fn apply_exif_orientation(img: image::DynamicImage, path: &str) -> image::DynamicImage {
    match read_exif_orientation(path) {
        2 => flip_horizontal(img),
        3 => img.rotate180(),
        4 => flip_vertical(img),
        5 => flip_horizontal(img.rotate90()),
        6 => img.rotate90(),
        7 => flip_vertical(img.rotate90()),
        8 => img.rotate270(),
        _ => img,
    }
}

pub fn clear_thumbnail_cache() -> Result<(), String> {
    let cache_dir = get_cache_dir();
    if cache_dir.exists() {
        std::fs::remove_dir_all(&cache_dir).map_err(|e| format!("清理缩略图缓存失败: {}", e))?;
    }
    Ok(())
}

pub fn get_cache_size() -> Result<u64, String> {
    let cache_dir = get_cache_dir();
    if !cache_dir.exists() {
        return Ok(0);
    }
    let mut total: u64 = 0;
    fn visit(dir: &Path, total: &mut u64) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();
            let metadata = entry.metadata()?;
            if metadata.is_dir() {
                visit(&path, total)?;
            } else {
                *total += metadata.len();
            }
        }
        Ok(())
    }
    visit(&cache_dir, &mut total).map_err(|e| format!("计算缓存大小失败: {}", e))?;
    Ok(total)
}

pub fn format_size(size: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    if size == 0 {
        return "0 B".to_string();
    }
    let mut size = size as f64;
    let mut unit_idx = 0;
    while size >= 1024.0 && unit_idx < UNITS.len() - 1 {
        size /= 1024.0;
        unit_idx += 1;
    }
    if unit_idx == 0 {
        format!("{:.0} {}", size, UNITS[unit_idx])
    } else {
        format!("{:.2} {}", size, UNITS[unit_idx])
    }
}

fn touch_file(path: &Path) -> std::io::Result<()> {
    let now = std::time::SystemTime::now();
    let file = std::fs::OpenOptions::new().write(true).open(path)?;
    file.set_modified(now)?;
    Ok(())
}

#[allow(dead_code)]
fn enforce_cache_limit() -> Result<(), String> {
    let cache_dir = get_cache_dir();
    if !cache_dir.exists() {
        return Ok(());
    }

    // 收集所有缓存文件及其 modified 时间和大小
    let mut files: Vec<(PathBuf, std::time::SystemTime, u64)> = Vec::new();
    let mut total_size: u64 = 0;

    for entry in std::fs::read_dir(&cache_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        if metadata.is_file() {
            let modified = metadata.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH);
            let len = metadata.len();
            files.push((path, modified, len));
            total_size += len;
        }
    }

    // 如果未超过限制，无需清理
    if total_size <= MAX_CACHE_SIZE_BYTES {
        return Ok(());
    }

    // 按 modified 时间升序排序（最老的在前）
    files.sort_by(|a, b| a.1.cmp(&b.1));

    // 删除最老的文件，直到总大小低于限制
    for (path, _, len) in files {
        if total_size <= MAX_CACHE_SIZE_BYTES {
            break;
        }
        if std::fs::remove_file(&path).is_ok() {
            total_size -= len;
        }
    }

    Ok(())
}
