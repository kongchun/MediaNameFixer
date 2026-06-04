import { useEffect, useState } from "react";
import { getConfig, setConfig } from "../api/tauri";
import { useAppState } from "../store";
import { Button } from "@/components/ui/button";
import { Settings, Save, Check, ArrowLeft } from "lucide-react";

export default function SettingsPage() {
  const { config, setConfig: setGlobalConfig, setActiveTab } = useAppState();
  const [provider, setProvider] = useState(config.exif_provider);
  const [path, setPath] = useState(config.exiftool_path || "");
  const [tolerance, setTolerance] = useState<number>(config.time_tolerance_seconds ?? 2);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getConfig().then((c) => {
      setProvider(c.exif_provider);
      setPath(c.exiftool_path || "");
      setTolerance(c.time_tolerance_seconds ?? 2);
      setGlobalConfig(c);
    });
  }, []);

  async function handleSave() {
    const newCfg = { exif_provider: provider, exiftool_path: path || undefined, recent_folders: config.recent_folders, last_folder: config.last_folder, time_tolerance_seconds: tolerance };
    await setConfig(newCfg);
    setGlobalConfig(newCfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" className="mr-2" onClick={() => setActiveTab("rename")}>
            <ArrowLeft size={16} className="mr-1" />
            返回
          </Button>
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <Settings size={20} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">设置</h1>
            <p className="text-sm text-muted-foreground">配置 EXIF 解析引擎和相关参数</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 space-y-6">
            {/* EXIF Provider */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                EXIF 解析引擎
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="kamadak">kamadak-exif（默认，纯 Rust）</option>
                <option value="exiftool">exiftool（外部程序）</option>
              </select>
              <p className="text-xs text-muted-foreground">
                选择用于读取照片拍摄时间的解析引擎。kamadak-exif 为纯 Rust 实现，无需外部依赖。
              </p>
            </div>

            {/* exiftool path */}
            {provider === "exiftool" && (
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  exiftool 路径
                </label>
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="留空使用系统 PATH 中的 exiftool"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="text-xs text-muted-foreground">
                  如果 exiftool 不在系统 PATH 中，请填写完整路径。
                </p>
              </div>
            )}

            {/* Time Tolerance */}
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                时间容差（秒）
              </label>
              <input
                type="number"
                min={0}
                max={60}
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                新老文件名解析出的拍摄时间相差在此秒数内时，视为相同文件名，默认 2 秒。
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/50 rounded-b-xl">
            {saved ? (
              <div className="flex items-center gap-1.5 text-sm text-green-600">
                <Check size={14} />
                已保存
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">修改后点击保存生效</div>
            )}
            <Button size="sm" onClick={handleSave}>
              <Save size={14} className="mr-1.5" />
              保存
            </Button>
          </div>
        </div>
        {/* About */}
        <div className="mt-6 rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="p-6 space-y-3">
            <h2 className="text-sm font-semibold">关于</h2>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>作者：天堂龙</p>
              <p>QQ群：72135582</p>
              <p>
                主页：
                <a
                  href="https://techwebplus.cn/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  https://techwebplus.cn/
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
