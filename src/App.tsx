import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";
import { useAppState } from "./store";
import { useEffect } from "react";

function App() {
  const { activeTab, config } = useAppState();

  useEffect(() => {
    const theme = config.theme || "liubai";
    document.documentElement.setAttribute("data-theme", theme);
  }, [config.theme]);

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans antialiased">
      <main className="flex-1 overflow-hidden">
        {activeTab === "settings" ? <SettingsPage /> : <HomePage />}
      </main>
    </div>
  );
}

export default App;
