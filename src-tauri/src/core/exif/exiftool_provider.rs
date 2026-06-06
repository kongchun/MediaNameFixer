use super::ExifProvider;
use chrono::NaiveDateTime;
use std::path::Path;
use std::process::Command;

pub struct ExifToolProvider {
    executable: String,
}

impl ExifToolProvider {
    pub fn new(executable: &str) -> Self {
        Self {
            executable: executable.to_string(),
        }
    }
}

impl ExifProvider for ExifToolProvider {
    fn read_date_taken(&self, path: &Path) -> Option<NaiveDateTime> {
        let output = Command::new(&self.executable)
            .args([
                "-DateTimeOriginal",
                "-CreateDate",
                "-MediaCreateDate",
                "-s3",
                "-d",
                "%Y:%m:%d %H:%M:%S",
                path.to_str()?,
            ])
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let line = line.trim();
            if !line.is_empty() {
                if let Ok(dt) = NaiveDateTime::parse_from_str(line, "%Y:%m:%d %H:%M:%S") {
                    return Some(dt);
                }
            }
        }
        None
    }

    fn read_date_taken_with_source(&self, path: &Path) -> Option<(NaiveDateTime, String)> {
        let output = Command::new(&self.executable)
            .args([
                "-DateTimeOriginal",
                "-CreateDate",
                "-MediaCreateDate",
                "-s3",
                "-d",
                "%Y:%m:%d %H:%M:%S",
                path.to_str()?,
            ])
            .output()
            .ok()?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let sources = ["original", "digitized", "mediacreate"];
        for (i, line) in stdout.lines().enumerate() {
            let line = line.trim();
            if !line.is_empty() {
                if let Ok(dt) = NaiveDateTime::parse_from_str(line, "%Y:%m:%d %H:%M:%S") {
                    return Some((dt, sources.get(i).unwrap_or(&"exif").to_string()));
                }
            }
        }
        None
    }
}
