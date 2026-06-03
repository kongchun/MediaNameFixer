import HomePage from "./pages/HomePage";
import SettingsPage from "./pages/SettingsPage";
import { useAppState } from "./store";

function App() {
  const { activeTab } = useAppState();

  return (
    <div className="h-screen flex flex-col bg-background text-foreground font-sans antialiased">
      <main className="flex-1 overflow-hidden">
        {activeTab === "settings" ? <SettingsPage /> : <HomePage />}
      </main>
    </div>
  );
}

export default App;
