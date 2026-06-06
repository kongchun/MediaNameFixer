use chrono::NaiveDateTime;
use std::path::Path;
use std::sync::Arc;

pub mod exiftool_provider;
pub mod kamadak_provider;

pub trait ExifProvider: Send + Sync {
    fn read_date_taken(&self, path: &Path) -> Option<NaiveDateTime>;
    fn read_date_taken_with_source(&self, path: &Path) -> Option<(NaiveDateTime, String)> {
        self.read_date_taken(path).map(|dt| (dt, "exif".to_string()))
    }
}

pub fn create_provider(provider_name: &str, exiftool_path: Option<&str>) -> Arc<dyn ExifProvider> {
    match provider_name {
        "exiftool" => Arc::new(exiftool_provider::ExifToolProvider::new(
            exiftool_path.unwrap_or("exiftool"),
        )),
        _ => Arc::new(kamadak_provider::KamadakExifProvider::new()),
    }
}
