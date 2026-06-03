import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";
import { useAppState } from "./store";
import { Button } from "@/components/ui/button";
import { Wrench } from "lucide-react";

function App() {
  const { activeTab, setActiveTab } = useAppState();

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans antialiased">
      <header className="flex items-center px-6 py-3 border-b bg-card">
        <div className="flex items-center gap-2 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Wrench size={18} className="text-primary-foreground" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            MediaNameFixer
          </h1>
        </div>
        <nav className="flex items-center gap-1">
          <Button
            variant={activeTab === "rename" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("rename")}
          >
            重命名
          </Button>
          <Button
            variant={activeTab === "archive" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("archive")}
          >
            归档
          </Button>
        </nav>
        <div className="flex-1 flex justify-end">
          <Button
            variant={activeTab === "settings" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("settings")}
          >
            <Wrench size={16} className="mr-2" />
            设置
          </Button>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        {activeTab === "settings" ? <SettingsPage /> : <HomePage />}
      </main>
    </div>
  );
}

export default App;
