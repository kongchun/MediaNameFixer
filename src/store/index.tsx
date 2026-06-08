import { createContext, useContext, useState, ReactNode } from "react";
import { AppConfig, Tab } from "../types";
import { type VersionInfo } from "../api/update";

interface AppState {
  folderPath: string;
  setFolderPath: (v: string) => void;
  activeTab: Tab;
  setActiveTab: (v: Tab) => void;
  config: AppConfig;
  setConfig: (v: AppConfig) => void;
  updateInfo: VersionInfo | null;
  setUpdateInfo: (v: VersionInfo | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [folderPath, setFolderPath] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("rename");
  const [config, setConfig] = useState<AppConfig>({
    exif_provider: "kamadak",
    exiftool_path: "",
    recent_folders: [],
    favorite_folders: [],
    last_folder: undefined,
    time_tolerance_seconds: 2,
    prefer_date_taken: false,
    date_format: "YYYY-MM-DD HHmmss",
    duplicate_suffix: "(c)",
    show_thumbnail: true,
    thumbnail_size: "medium",
    theme: "liubai",
    update_mode: "dual",
  });
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);

  return (
    <AppContext.Provider
      value={{ folderPath, setFolderPath, activeTab, setActiveTab, config, setConfig, updateInfo, setUpdateInfo }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
