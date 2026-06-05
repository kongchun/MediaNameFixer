import { invoke } from "@tauri-apps/api/core";
import { open, message } from "@tauri-apps/plugin-dialog";
import {
  AppConfig,
  ArchiveMode,
  ArchiveOperation,
  DirEntry,
  FileInfo,
  QuickAccessItem,
  RenameMode,
  RenameOperation,
} from "../types";

export async function selectFolder(): Promise<string | null> {
  const result = await open({ directory: true, multiple: false });
  return result as string | null;
}

export async function scanFiles(folderPath: string): Promise<FileInfo[]> {
  return invoke("scan_files", { folderPath });
}

export async function getSpecialFolders(): Promise<QuickAccessItem[]> {
  return invoke("get_special_folders");
}

export async function listDrives(): Promise<DirEntry[]> {
  return invoke("list_drives");
}

export async function listDirectories(parentPath: string): Promise<DirEntry[]> {
  return invoke("list_directories", { parentPath });
}

export async function previewRename(
  folderPath: string,
  mode: RenameMode,
  recursive = false,
  selectedPaths?: string[]
): Promise<RenameOperation[]> {
  return invoke("preview_rename", {
    params: { folder_path: folderPath, mode, recursive, selected_paths: selectedPaths },
  });
}

export async function executeRename(
  operations: RenameOperation[]
): Promise<void> {
  return invoke("execute_rename", { operations });
}

export async function previewArchive(
  folderPath: string,
  mode: ArchiveMode
): Promise<ArchiveOperation[]> {
  return invoke("preview_archive", {
    params: { folder_path: folderPath, mode },
  });
}

export async function executeArchive(
  operations: ArchiveOperation[]
): Promise<void> {
  return invoke("execute_archive", { operations });
}

export async function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
}

export async function setConfig(config: AppConfig): Promise<void> {
  return invoke("set_config", { config });
}

export async function addRecentFolder(folderPath: string): Promise<void> {
  return invoke("add_recent_folder", { folderPath });
}

export async function addFavoriteFolder(folderPath: string): Promise<void> {
  return invoke("add_favorite_folder", { folderPath });
}

export async function removeFavoriteFolder(folderPath: string): Promise<void> {
  return invoke("remove_favorite_folder", { folderPath });
}

export async function openFolder(path: string): Promise<void> {
  return invoke("open_folder", { path });
}

export async function openFile(path: string): Promise<void> {
  return invoke("open_file", { path });
}

export async function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

export async function showMessage(msg: string, title?: string): Promise<void> {
  await message(msg, { title: title || "提示", kind: "info" });
}

export async function checkRemoteVersion(url: string): Promise<any> {
  return invoke("check_remote_version", { url });
}

export async function getAppVersion(): Promise<string> {
  return invoke("get_app_version");
}
