use super::ExifProvider;
use chrono::NaiveDateTime;
use exif::{Reader, Tag, Value};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;

pub struct KamadakExifProvider;

impl KamadakExifProvider {
    pub fn new() -> Self {
        Self
    }
}

impl ExifProvider for KamadakExifProvider {
    fn read_date_taken(&self, path: &Path) -> Option<NaiveDateTime> {
        let file = File::open(path).ok()?;
        let mut bufreader = BufReader::new(&file);
        let exifreader = Reader::new();
        let exif = exifreader.read_from_container(&mut bufreader).ok()?;

        let target_tags = [Tag::DateTimeOriginal, Tag::DateTimeDigitized, Tag::DateTime];
        for field in exif.fields() {
            if target_tags.contains(&field.tag) {
                if let Some(dt) = parse_exif_date(&field.value) {
                    return Some(dt);
                }
            }
        }
        None
    }
}

fn parse_exif_date(value: &Value) -> Option<NaiveDateTime> {
    match value {
        Value::Ascii(vec) => {
            let bytes = vec.first()?;
            // 优先使用 exif crate 原生的 DateTime 解析器
            if let Ok(exif_dt) = exif::DateTime::from_ascii(bytes) {
                return NaiveDateTime::from_exif_date_time(&exif_dt);
            }
            // 回退到字符串解析
            let s = std::str::from_utf8(bytes).ok()?;
            NaiveDateTime::parse_from_str(s, "%Y:%m:%d %H:%M:%S").ok()
        }
        _ => None,
    }
}

trait ExifDateTimeExt {
    fn from_exif_date_time(dt: &exif::DateTime) -> Option<NaiveDateTime>;
}

impl ExifDateTimeExt for NaiveDateTime {
    fn from_exif_date_time(dt: &exif::DateTime) -> Option<NaiveDateTime> {
        let formatted = format!(
            "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
            dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second
        );
        NaiveDateTime::parse_from_str(&formatted, "%Y-%m-%d %H:%M:%S").ok()
    }
}
