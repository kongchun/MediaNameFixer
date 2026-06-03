import { createContext, useContext, useState, ReactNode } from "react";
import { AppConfig, Tab } from "../types";

interface AppState {
  folderPath: string;
  setFolderPath: (v: string) => void;
  activeTab: Tab;
  setActiveTab: (v: Tab) => void;
  config: AppConfig;
  setConfig: (v: AppConfig) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [folderPath, setFolderPath] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("rename");
  const [config, setConfig] = useState<AppConfig>({
    exif_provider: "kamadak",
    exiftool_path: "",
    recent_folders: [],
    last_folder: undefined,
  });

  return (
    <AppContext.Provider
      value={{ folderPath, setFolderPath, activeTab, setActiveTab, config, setConfig }}
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
