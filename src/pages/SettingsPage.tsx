import { useEffect, useState } from "react";
import { getConfig, setConfig, openUrl, getAppVersion, clearThumbnailCache, getThumbnailCacheSize } from "../api/tauri";
import { checkRemoteVersion, isNewVersion, type UpdateMode } from "../api/update";
import { useAppState } from "../store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageModal } from "@/components/message-modal";
import { Settings, Save, Check, ArrowLeft, RotateCcw, RefreshCw, ExternalLink, Home } from "lucide-react";

type MenuKey = "general" | "thumbnail" | "format" | "lab" | "about";

export default function SettingsPage() {
  const { config, setConfig: setGlobalConfig, setActiveTab, updateInfo, setUpdateInfo } = useAppState();
  const [activeMenu, setActiveMenu] = useState<MenuKey>("general");
  const [provider, setProvider] = useState(config.exif_provider);
  const [path, setPath] = useState(config.exiftool_path || "");
  const [tolerance, setTolerance] = useState<number>(config.time_tolerance_seconds ?? 2);
  const [preferDateTaken, setPreferDateTaken] = useState<boolean>(config.prefer_date_taken ?? false);
  const [old3gpLegacy, setOld3gpLegacy] = useState<boolean>(!(config.old_3gp_utc ?? true));
  const [selectEarlier, setSelectEarlier] = useState<boolean>(config.select_earlier ?? true);
  const [showThumbnail, setShowThumbnail] = useState<boolean>(config.show_thumbnail ?? true);
  const [thumbnailSize, setThumbnailSize] = useState<"small" | "medium" | "large">(config.thumbnail_size ?? "medium");
  const [dateFormat, setDateFormat] = useState<string>(config.date_format ?? "YYYY-MM-DD HHmmss");
  const [duplicateSuffix, setDuplicateSuffix] = useState<string>(config.duplicate_suffix ?? "(c)");
  const [theme, setTheme] = useState<"liubai" | "mudan">(config.theme ?? "liubai");
  const [updateMode, setUpdateMode] = useState<UpdateMode>(config.update_mode ?? "dual");
  const [showLab, setShowLab] = useState(false);
  const [labClickCount, setLabClickCount] = useState(0);
  const [saved, setSaved] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "has-update" | "latest" | "error">("idle");
  const [updateError, setUpdateError] = useState<string>("");
  const [appVersion, setAppVersion] = useState<string>("");
  const [showWxDialog, setShowWxDialog] = useState(false);
  const [showQQDialog, setShowQQDialog] = useState(false);
  const [cacheSize, setCacheSize] = useState<string>("0 B");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  function showModal(title: string, message: string) {
    setModalTitle(title);
    setModalMessage(message);
    setModalOpen(true);
  }

  const loadCacheSize = async () => {
    try {
      const size = await getThumbnailCacheSize();
      setCacheSize(size);
    } catch {
      setCacheSize("0 B");
    }
  };

  useEffect(() => {
    loadCacheSize();
  }, []);

  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(console.error);
  }, []);

  useEffect(() => {
    getConfig().then((c) => {
      setProvider(c.exif_provider);
      setPath(c.exiftool_path || "");
      setTolerance(c.time_tolerance_seconds ?? 2);
      setPreferDateTaken(c.prefer_date_taken ?? false);
      setOld3gpLegacy(!(c.old_3gp_utc ?? true));
      setSelectEarlier(c.select_earlier ?? true);
      setShowThumbnail(c.show_thumbnail ?? true);
      setThumbnailSize((c.thumbnail_size ?? "medium") as "small" | "medium" | "large");
      setDateFormat(c.date_format ?? "YYYY-MM-DD HHmmss");
      setDuplicateSuffix(c.duplicate_suffix ?? "(c)");
      setTheme((c.theme ?? "liubai") as "liubai" | "mudan");
      setUpdateMode((c.update_mode ?? "dual") as UpdateMode);
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
      last_selected_folder: config.last_selected_folder,
      expanded_paths: config.expanded_paths,
      time_tolerance_seconds: tolerance,
      prefer_date_taken: preferDateTaken,
      old_3gp_utc: !old3gpLegacy,
      select_earlier: selectEarlier,
      show_thumbnail: showThumbnail,
      thumbnail_size: thumbnailSize,
      theme,
      update_mode: updateMode,
      date_format: dateFormat,
      duplicate_suffix: duplicateSuffix,
    };
    await setConfig(newCfg);
    setGlobalConfig(newCfg);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  const menuItems: { key: MenuKey; label: string }[] = [
    { key: "general", label: "基本信息" },
    { key: "format", label: "文件名格式" },
    { key: "thumbnail", label: "缩略图" },
    ...(showLab ? [{ key: "lab" as MenuKey, label: "实验室" }] : []),
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
                {activeMenu === "thumbnail" && "配置缩略图显示和缓存"}
                {activeMenu === "format" && "自定义重命名后的文件名格式"}
                {activeMenu === "lab" && "实验性功能，谨慎使用"}
                {activeMenu === "about" && "关于 MediaNameFixer"}
              </p>
            </div>
          </div>

          {/* 基本设置 */}
          {activeMenu === "general" && (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="p-6 space-y-8">
                {/* EXIF 解析 */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">EXIF 解析</h3>
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
                </div>

                {/* 时间处理 */}
                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">时间处理</h3>
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

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectEarlier}
                        onChange={(e) => setSelectEarlier(e.target.checked)}
                        className="rounded border-input"
                      />
                      原文件名称时间更早时，不推荐修改
                    </label>
                    <p className="text-xs text-muted-foreground">
                      智能分析时，若原文件名时间早于新文件名时间，不推荐修改。取消勾选则正常处理。
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={old3gpLegacy}
                        onChange={(e) => setOld3gpLegacy(e.target.checked)}
                        className="rounded border-input"
                      />
                      3GP利旧模式
                    </label>
                    <p className="text-xs text-muted-foreground">
                      旧 3GP 设备（3gp4/3gp5/3gp6/3gp7，常见于 2001-2007 年功能机）直接写入本地时间而非 UTC。勾选此项后，旧 3GP 文件将直接使用本地时间，不再进行 UTC 转换。MP4/MOV 始终按 UTC 处理。若旧 3GP 视频时间偏差 8 小时，请勾选此项。
                    </p>
                  </div>
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

          {/* 缩略图 */}
          {activeMenu === "thumbnail" && (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="p-6 space-y-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">显示设置</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium leading-none cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={showThumbnail}
                        onChange={(e) => setShowThumbnail(e.target.checked)}
                        className="rounded border-input"
                      />
                      显示文件缩略图
                    </label>
                    <p className="text-xs text-muted-foreground">
                      在文件列表中显示图片和视频缩略图。关闭可提升大文件夹加载性能。
                    </p>
                  </div>

                  {showThumbnail && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">缩略图尺寸</label>
                      <div className="flex gap-2">
                        {(["small", "medium", "large"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setThumbnailSize(s)}
                            className={cn(
                              "px-3 py-1.5 rounded-md text-sm border transition-colors",
                              thumbnailSize === s
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-muted-foreground border-input hover:bg-accent"
                            )}
                          >
                            {s === "small" ? "小" : s === "medium" ? "中" : "大"}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        小=40px，中=56px，大=72px。调整尺寸后保存并重新选择文件夹生效。
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">缓存管理</h3>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">缩略图缓存</label>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await clearThumbnailCache();
                            await loadCacheSize();
                            showModal("提示", "缩略图缓存已清理");
                          } catch (e) {
                            showModal("错误", "清理失败: " + e);
                          }
                        }}
                      >
                        清理缓存
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        当前缓存: {cacheSize}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      缩略图缓存上限 1GB，超过后自动清理最早生成的文件。
                    </p>
                  </div>
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

          {/* 实验室 */}
          {activeMenu === "lab" && (
            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
              <div className="p-6 space-y-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">系统配色</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setTheme("liubai")}
                      className={cn(
                        "relative rounded-lg border p-4 text-left transition-colors",
                        theme === "liubai"
                          ? "border-primary ring-1 ring-primary bg-accent"
                          : "border-input hover:bg-accent/50"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-md bg-neutral-900 border" />
                        <div className="w-10 h-10 rounded-md bg-white border" />
                      </div>
                      <p className="text-sm font-medium">留白</p>
                      <p className="text-xs text-muted-foreground mt-1">默认中性灰，简洁纯粹</p>
                      {theme === "liubai" && (
                        <div className="absolute top-2 right-2">
                          <Check size={14} className="text-primary" />
                        </div>
                      )}
                    </button>

                    <button
                      onClick={() => setTheme("mudan")}
                      className={cn(
                        "relative rounded-lg border p-4 text-left transition-colors",
                        theme === "mudan"
                          ? "border-primary ring-1 ring-primary bg-accent"
                          : "border-input hover:bg-accent/50"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-md bg-[#6366f1] border" />
                        <div className="w-10 h-10 rounded-md bg-[#f1f5f9] border" />
                      </div>
                      <p className="text-sm font-medium">暮靛</p>
                      <p className="text-xs text-muted-foreground mt-1">Slate + Indigo，柔和深邃</p>
                      {theme === "mudan" && (
                        <div className="absolute top-2 right-2">
                          <Check size={14} className="text-primary" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-4 border-t pt-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">升级检查</h3>
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">检查模式</label>
                    <div className="flex gap-2">
                      {(["dual", "public", "local"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => setUpdateMode(m)}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-sm border transition-colors",
                            updateMode === m
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-input hover:bg-accent"
                          )}
                        >
                          {m === "dual" ? "并发优选" : m === "public" ? "公网优先" : "内网优先"}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {updateMode === "dual" && "同时请求公网和内网，取版本号更高的结果（推荐）"}
                      {updateMode === "public" && "只请求公网更新地址"}
                      {updateMode === "local" && "只请求内网更新地址"}
                    </p>
                  </div>
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
                <div className="space-y-5">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold">版本信息</h3>
                    <div className="text-sm text-muted-foreground space-y-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="cursor-pointer select-none"
                          onClick={() => {
                            const next = labClickCount + 1;
                            setLabClickCount(next);
                            if (next >= 5) {
                              setShowLab(true);
                              setLabClickCount(0);
                              showModal("提示", "实验室功能已解锁");
                            }
                          }}
                          title="连续点击 5 次解锁实验室"
                        >
                          当前版本：{appVersion}
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updateStatus === "checking"}
                          onClick={async () => {
                            setUpdateStatus("checking");
                            setUpdateError("");
                            try {
                              const info = await checkRemoteVersion(updateMode);
                              if (info && appVersion && isNewVersion(appVersion, info.version)) {
                                setUpdateInfo(info);
                                setUpdateStatus("has-update");
                              } else if (info) {
                                setUpdateInfo(null);
                                setUpdateStatus("latest");
                              } else {
                                // 从控制台获取错误信息
                                const logs: string[] = [];
                                const originalError = console.error;
                                console.error = (...args) => {
                                  logs.push(args.join(" "));
                                  originalError(...args);
                                };
                                await checkRemoteVersion(updateMode);
                                console.error = originalError;
                                setUpdateError(logs.join("\n") || "无法连接到更新服务器");
                                setUpdateStatus("error");
                              }
                            } catch (e) {
                              setUpdateError(String(e));
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

                      {(updateInfo || updateStatus === "has-update") && updateInfo && (
                        <div className="rounded-md bg-green-50 border border-green-200 p-3 space-y-2">
                          <p className="text-sm text-green-700 font-medium">
                            发现新版本：{updateInfo.version}
                          </p>
                          {updateInfo.releaseNotes && (
                            <div className="text-xs text-green-700 bg-green-100/50 rounded-md p-2 whitespace-pre-line leading-relaxed">
                              {updateInfo.releaseNotes}
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap">
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
                        </div>
                      )}

                      {updateStatus === "latest" && !updateInfo && (
                        <p className="text-sm text-green-600">当前已是最新版本</p>
                      )}

                      {updateStatus === "error" && (
                        <div className="space-y-1">
                          <p className="text-sm text-orange-600">检查失败，请检查网络连接</p>
                          {updateError && (
                            <pre className="text-xs text-muted-foreground bg-muted p-2 rounded max-w-md overflow-auto whitespace-pre-wrap">{updateError}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <h3 className="text-sm font-semibold">作者信息</h3>
                    <p className="text-sm text-muted-foreground">作者：天堂龙</p>
                    <p className="text-sm text-muted-foreground">公众号：苏州前端</p>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => openUrl("https://techwebplus.cn/")}
                        className="group flex items-center justify-center h-10 w-10 rounded-lg border bg-background hover:w-24 hover:-translate-y-0.5 hover:bg-muted transition-all duration-300 cursor-pointer overflow-hidden"
                        title="访问主页"
                      >
                        <Home size={18} className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
                        <span className="hidden group-hover:inline-block ml-1.5 text-xs whitespace-nowrap text-muted-foreground">主页</span>
                      </button>
                      <button
                        onClick={() => openUrl("https://github.com/kongchun/MediaNameFixer")}
                        className="group flex items-center justify-center h-10 w-10 rounded-lg border bg-background hover:w-24 hover:-translate-y-0.5 hover:bg-muted transition-all duration-300 cursor-pointer overflow-hidden"
                        title="访问 GitHub"
                      >
                        <svg viewBox="0 0 1024 1024" className="shrink-0 w-[18px] h-[18px] fill-current text-muted-foreground group-hover:text-foreground transition-colors">
                          <path d="M511.6 76.3C264.3 76.2 64 276.4 64 523.5 64 718.9 189.3 885 363.8 946c23.5 5.9 19.9-10.8 19.9-22.2v-77.5c-135.7 15.9-141.2-73.9-150.3-88.9C215 726 171.5 718 184.5 703c30.9-15.9 62.4 4 98.9 57.9 26.4 39.1 77.9 32.5 104 26 5.7-23.5 17.9-44.5 34.7-60.8-140.6-25.2-199.2-111-199.2-213 0-49.5 16.3-95 48.3-131.7-20.4-60.5 1.9-112.3 4.9-120 58.1-5.2 118.5 41.6 123.2 45.3 33-8.9 70.7-13.6 112.9-13.6 42.4 0 80.2 4.9 113.5 13.9 11.3-8.6 67.3-48.8 121.3-43.9 2.9 7.7 24.7 58.3 5.5 118 32.4 36.8 48.9 82.7 48.9 132.3 0 102.2-59 188.1-200 212.9 23.5 23.2 38.1 55.4 38.1 91v112.5c0.8 9 0 17.9 15 17.9 177.1-59.7 304.6-227 304.6-424.1 0-247.2-200.4-447.3-447.5-447.3z"/>
                        </svg>
                        <span className="hidden group-hover:inline-block ml-1.5 text-xs whitespace-nowrap text-muted-foreground">GitHub</span>
                      </button>
                      <button
                        onClick={() => setShowQQDialog(true)}
                        className="group flex items-center justify-center h-10 w-10 rounded-lg border bg-background hover:w-24 hover:-translate-y-0.5 hover:bg-muted transition-all duration-300 cursor-pointer overflow-hidden"
                        title="加入QQ群 72135582"
                      >
                        <svg viewBox="0 0 1024 1024" className="shrink-0 w-[18px] h-[18px] fill-current text-muted-foreground group-hover:text-foreground transition-colors">
                          <path d="M824.8 613.2c-16-51.4-34.4-94.6-62.7-165.3C766.5 262.2 689.3 112 511.5 112 331.7 112 256.2 265.2 261 447.9c-28.4 70.8-46.7 113.7-62.7 165.3-34 109.5-23 154.8-14.6 155.8 18 2.2 70.1-82.4 70.1-82.4 0 49 25.2 112.9 79.8 159-26.4 8.1-85.7 29.9-71.6 53.8 11.4 19.3 196.2 12.3 249.5 6.3 53.3 6 238.1 13 249.5-6.3 14.1-23.8-45.3-45.7-71.6-53.8 54.6-46.2 79.8-110.1 79.8-159 0 0 52.1 84.6 70.1 82.4 8.5-1.1 19.5-46.4-14.5-155.8z"/>
                        </svg>
                        <span className="hidden group-hover:inline-block ml-1.5 text-xs whitespace-nowrap text-muted-foreground">QQ群</span>
                      </button>
                      <button
                        onClick={() => setShowWxDialog(true)}
                        className="group flex items-center justify-center h-10 w-10 rounded-lg border bg-background hover:w-24 hover:-translate-y-0.5 hover:bg-muted transition-all duration-300 cursor-pointer overflow-hidden"
                        title="微信公众号"
                      >
                        <svg viewBox="0 0 24 24" className="shrink-0 w-[18px] h-[18px] fill-current text-muted-foreground group-hover:text-foreground transition-colors">
                          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/>
                        </svg>
                        <span className="hidden group-hover:inline-block ml-1.5 text-xs whitespace-nowrap text-muted-foreground">公众号</span>
                      </button>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <h3 className="text-sm font-semibold">打赏支持</h3>
                    <div className="text-sm text-muted-foreground flex flex-col items-center">
                      <p>如果本软件对你有帮助，欢迎打赏支持开发者</p>
                      <img
                        src="/img/wxzsm.jpg"
                        alt="微信赞赏码"
                        className="w-72 rounded-lg border mt-2"
                      />
                      <p className="text-xs text-muted-foreground mt-1">微信扫一扫</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {showWxDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowWxDialog(false)}>
          <div className="bg-background rounded-xl border shadow-lg p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4 text-center">微信公众号</h3>
            <img src="/img/wxgzh.jpg" alt="微信公众号二维码" className="w-64 h-64 rounded-lg border mx-auto" />
            <p className="text-sm text-muted-foreground text-center mt-3">扫码关注「苏州前端」</p>
            <div className="flex justify-center mt-4">
              <button
                onClick={() => setShowWxDialog(false)}
                className="px-4 py-2 text-sm rounded-md border bg-background hover:bg-muted transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      {showQQDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowQQDialog(false)}>
          <div className="bg-background rounded-xl border shadow-lg p-6 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-4 text-center">苏州web前端技术小组</h3>
            <img src="/img/qq.jpg" alt="QQ群二维码" className="w-64 h-64 rounded-lg border mx-auto" />
            <p className="text-sm text-muted-foreground text-center mt-3">扫码加入 QQ 群 72135582</p>
            <div className="flex justify-center mt-4">
              <button
                onClick={() => setShowQQDialog(false)}
                className="px-4 py-2 text-sm rounded-md border bg-background hover:bg-muted transition-colors cursor-pointer"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
      <MessageModal
        open={modalOpen}
        title={modalTitle}
        message={modalMessage}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
