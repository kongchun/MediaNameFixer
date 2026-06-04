export interface FileInfo {
  path: string;
  name: string;
  size: number;
  ext: string;
  date_taken?: string;
  date_created?: string;
  date_modified?: string;
}

export interface RenameOperation {
  old_path: string;
  new_path: string;
  old_name: string;
  new_name: string;
  date_taken?: string;
  date_created?: string;
  date_modified?: string;
  time_source?: string; // "exif" | "video" | "modified" | "created"
}

export interface ArchiveOperation {
  old_path: string;
  new_path: string;
  target_folder: string;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface QuickAccessItem {
  name: string;
  path: string;
}

export type RenameMode =
  | "ByDateTime"
  | "ByFileName";

export type ArchiveMode = "ByYear" | "ByYearMonth" | "MergeSubfolders";

export interface AppConfig {
  exif_provider: string;
  exiftool_path?: string;
  last_folder?: string;
  recent_folders: string[];
  favorite_folders: string[];
  time_tolerance_seconds?: number;
}

export type Tab = "rename" | "archive" | "settings";
