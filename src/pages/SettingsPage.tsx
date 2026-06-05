import { useEffect, useState } from "react";
import { getConfig, setConfig, openUrl } from "../api/tauri";
import { checkRemoteVersion, isNewVersion, type VersionInfo } from "../api/update";
import { useAppState } from "../store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Settings, Save, Check, ArrowLeft, RotateCcw, RefreshCw, ExternalLink } from "lucide-react";

type MenuKey = "general" | "format" | "about";

export default function SettingsPage() {
  const { config, setConfig: setGlobalConfig, setActiveTab } = useAppState();
  const [activeMenu, setActiveMenu] = useState<MenuKey>("general");
  const [provider, setProvider] = useState(config.exif_provider);
  const [path, setPath] = useState(config.exiftool_path || "");
  const [tolerance, setTolerance] = useState<number>(config.time_tolerance_seconds ?? 2);
  const [preferDateTaken, setPreferDateTaken] = useState<boolean>(config.prefer_date_taken ?? false);
  const [dateFormat, setDateFormat] = useState<string>(config.date_format ?? "YYYY-MM-DD HHmmss");
  const [duplicateSuffix, setDuplicateSuffix] = useState<string>(config.duplicate_suffix ?? "(c)");
  const [saved, setSaved] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "has-update" | "latest" | "error">("idle");
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    getConfig().then((c) => {
      setProvider(c.exif_provider);
      setPath(c.exiftool_path || "");
      setTolerance(c.time_tolerance_seconds ?? 2);
      setPreferDateTaken(c.prefer_date_taken ?? false);
      setDateFormat(c.date_format ?? "YYYY-MM-DD HHmmss");
      setDuplicateSuffix(c.duplicate_suffix ?? "(c)");
      setGlobalConfig(c);
    });
  }, []);

  async function handleSave() {
    const newCfg = {
      exif_provider: provider,
      exiftool_path: path || undefined,
      recent_folders: config.recent_folders,
      favorite_folders: config.favorite_folders,
      last_folder: config.last_folder,
      time_tolerance_seconds: tolerance,
      prefer_date_taken: preferDateTaken,
      date_format: dateFormat,
      duplicate_suffix: duplicateSuffix,
    };
    await setConfig(newCfg);
    setGlobalConfig(newCfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const menuItems: { key: MenuKey; label: string }[] = [
    { key: "general", label: "基本设置" },
    { key: "format", label: "文件名格式" },
    { key: "about", label: "关于" },
  ];

  return (
    <div className="h-full flex">
      {/* 左侧菜单 */}
      <div className="w-52 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setActiveTab("rename")}>
            <ArrowLeft size={16} className="mr-2" />
            返回
          </Button>
        </div>
        <nav className="p-2 space-y-1">
          {menuItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveMenu(item.key)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                activeMenu === item.key
                  ? "bg-accent font-medium text-accent-foreground"
                  : "hover:bg-accent/50 text-muted-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>

      {/* 右侧内容 */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-xl">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Settings size={20} className="text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">设置</h1>
              <p className="text-sm text-muted-foreground">
                {activeMenu === "general" && "配置 EXIF 解析引擎和相关参数"}
                {activeMenu === "format" && "自定义重命名后的文件名格式"}
                {activeMenu === "about" && "关于 MediaNameFixer"}
              </p>
            </div>
          </div>

          {/* 基本设置 */}
          {activeMenu === "general" && (
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

                {/* Prefer Date Taken */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={preferDateTaken}
                      onChange={(e) => setPreferDateTaken(e.target.checked)}
                      className="rounded border-input"
                    />
                    优先拍摄时间
                  </label>
                  <p className="text-xs text-muted-foreground">
                    勾选后，按时间日期重命名时，只要文件有拍摄时间（EXIF），就直接使用拍摄时间作为新文件名，不再比较修改时间取最早。
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
          )}

          {/* 文件名格式 */}
          {activeMenu === "format" && (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="p-6 space-y-6">
                {/* Date Format */}
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    目标文件名格式
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value)}
                      placeholder="YYYY-MM-DD HHmmss"
                      className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDateFormat("YYYY-MM-DD HHmmss")}
                      title="恢复默认"
                    >
                      <RotateCcw size={14} className="mr-1" />
                      恢复默认
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    支持 YYYY（年）、MM（月）、DD（日）、HH（时）、mm（分）、ss（秒）。
                  </p>
                </div>

                {/* Duplicate Suffix */}
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    重复文件后缀
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={duplicateSuffix}
                      onChange={(e) => setDuplicateSuffix(e.target.value)}
                      placeholder="(c)"
                      className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDuplicateSuffix("(c)")}
                      title="恢复默认"
                    >
                      <RotateCcw size={14} className="mr-1" />
                      恢复默认
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    重复文件名时附加的后缀，c 会被替换为数字。默认 (c)，效果如 (1)、(2)。
                  </p>
                </div>

                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
                  <p className="font-medium text-foreground">示例预览</p>
                  <p>默认格式：2024-01-02 030405.jpg</p>
                  <p>重复文件：2024-01-02 030405(1).jpg、2024-01-02 030405(2).jpg</p>
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
          )}

          {/* 关于 */}
          {activeMenu === "about" && (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="p-6 space-y-4">
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold">关于</h2>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div className="flex items-center gap-2">
                      <span>版本：0.1.5</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateStatus === "checking"}
                        onClick={async () => {
                          setUpdateStatus("checking");
                          const info = await checkRemoteVersion();
                          if (info && isNewVersion("0.1.5", info.version)) {
                            setUpdateInfo(info);
                            setUpdateStatus("has-update");
                          } else if (info) {
                            setUpdateStatus("latest");
                          } else {
                            setUpdateStatus("error");
                          }
                        }}
                      >
                        {updateStatus === "checking" ? (
                          <RefreshCw size={14} className="mr-1 animate-spin" />
                        ) : (
                          <RefreshCw size={14} className="mr-1" />
                        )}
                        检查更新
                      </Button>
                    </div>

                    {updateStatus === "has-update" && updateInfo && (
                      <div className="rounded-md bg-green-50 border border-green-200 p-3 space-y-2">
                        <p className="text-sm text-green-700 font-medium">
                          发现新版本：{updateInfo.version}
                        </p>
                        {updateInfo.releaseNotes && (
                          <p className="text-xs text-green-600">{updateInfo.releaseNotes}</p>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-300 text-green-700 hover:bg-green-100"
                          onClick={() => openUrl(updateInfo.downloadUrl)}
                        >
                          <ExternalLink size={14} className="mr-1" />
                          立即下载
                        </Button>
                      </div>
                    )}

                    {updateStatus === "latest" && (
                      <p className="text-sm text-green-600">当前已是最新版本</p>
                    )}

                    {updateStatus === "error" && (
                      <p className="text-sm text-orange-600">检查失败，请检查网络连接</p>
                    )}

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
          )}
        </div>
      </div>
    </div>
  );
}
