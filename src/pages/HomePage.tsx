import { useState, useMemo, useEffect } from "react";
import {
  selectFolder,
  scanFiles,
  executeRename,
  executeArchive,
  getConfig,
  setConfig,
  addRecentFolder,
  addFavoriteFolder,
  removeFavoriteFolder,
  openFolder,
  openFile,
  openUrl,
} from "../api/tauri";
import { checkRemoteVersion, isNewVersion, type VersionInfo } from "../api/update";
import { useAppState } from "../store";
import {
  FileInfo,
  RenameMode,
  ArchiveMode,
} from "../types";
import { computeRenamePreview, computeArchivePreview, isWithinTimeTolerance, isOriginalEarlierThanNew } from "../utils/preview";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileTree } from "@/components/file-tree";
import { MessageModal } from "@/components/message-modal";
import { FolderOpen, Eye, Play, Image, Video, Layers, RefreshCw, Wrench, ExternalLink, Check } from "lucide-react";

const IMAGE_EXTS = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "heic", "heif",
  "tiff", "tif", "raw", "cr2", "nef", "arw", "dng", "orf", "raf", "pef",
]);
const VIDEO_EXTS = new Set([
  "mp4", "mov", "avi", "mkv", "flv", "wmv", "m4v", "3gp",
  "mpg", "mpeg", "ts", "webm", "m2ts", "mts",
]);

function getFileCategory(ext: string): "image" | "video" | "other" {
  const e = ext.toLowerCase();
  if (IMAGE_EXTS.has(e)) return "image";
  if (VIDEO_EXTS.has(e)) return "video";
  return "other";
}

export default function HomePage() {
  const { folderPath, setFolderPath, activeTab, setActiveTab, config, setConfig: setGlobalConfig } = useAppState();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [renameMode, setRenameMode] = useState<RenameMode>("ByDateTime");
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>("ByYear");
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [manualRenameMap, setManualRenameMap] = useState<Map<string, string>>(new Map());
  const [manualTimeSourceMap, setManualTimeSourceMap] = useState<Map<string, "taken" | "modified">>(new Map());
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMessage, setModalMessage] = useState("");

  const renameOps = useMemo(() => {
    if (activeTab !== "rename") return [];
    return computeRenamePreview(files, renameMode, new Set(files.map((f) => f.path)), manualTimeSourceMap, config.prefer_date_taken, config.date_format, config.duplicate_suffix);
  }, [files, renameMode, activeTab, manualTimeSourceMap, config.prefer_date_taken, config.date_format, config.duplicate_suffix]);

  const archiveOps = useMemo(() => {
    if (activeTab !== "archive") return [];
    return computeArchivePreview(files, archiveMode, new Set(files.map((f) => f.path)));
  }, [files, archiveMode, activeTab]);

  function showModal(title: string, message: string) {
    setModalTitle(title);
    setModalMessage(message);
    setModalOpen(true);
  }

  function getFinalNewName(file: FileInfo): string | undefined {
    const manual = manualRenameMap.get(file.path);
    if (manual !== undefined) return manual;
    return renameMap.get(file.path);
  }

  function updateSelectedPaths(paths: string[]) {
    setSelectedPaths(new Set(paths));
    setManualRenameMap(new Map());
    setEditingPath(null);
  }

  function selectNeedRename(list: FileInfo[]) {
    updateSelectedPaths(list.map((f) => f.path));
  }

  function addRecentPath(path: string) {
    setRecentPaths((prev) => {
      const filtered = prev.filter((p) => p !== path);
      return [path, ...filtered].slice(0, 5);
    });
  }

  // 启动时读取配置，自动加载上次文件夹
  useEffect(() => {
    getConfig().then((cfg) => {
      setGlobalConfig(cfg);
      if (cfg.recent_folders.length > 0) {
        setRecentPaths(cfg.recent_folders.slice(0, 5));
      }
      if (cfg.last_folder) {
        const p = cfg.last_folder;
        setFolderPath(p);
        // 恢复上次选中的子文件夹，没有则默认主文件夹
        const selected = cfg.last_selected_folder || p;
        setSelectedFolder(selected);
        // 恢复展开状态
        if (cfg.expanded_paths) {
          setExpandedPaths(cfg.expanded_paths);
        }
        scanFiles(selected).then((list) => {
          setFiles(list);
          selectNeedRename(list);
        }).catch(console.error);
      }
    }).catch(console.error);

    // 检查更新
    checkRemoteVersion().then((info) => {
      if (info && isNewVersion("0.1.6", info.version)) {
        setUpdateInfo(info);
      }
    }).catch(console.error);
  }, []);

  // 切换重命名模式时清空手动编辑
  useEffect(() => {
    setManualRenameMap(new Map());
    setEditingPath(null);
  }, [renameMode]);

  async function handleSelect() {
    const p = await selectFolder();
    if (p) {
      setFolderPath(p);
      setSelectedFolder(p);
      setExpandedPaths([]);
      addRecentPath(p);
      addRecentFolder(p).catch(console.error);
      const list = await scanFiles(p);
      setFiles(list);
      selectNeedRename(list);
    }
  }

  async function handleTreeSelect(path: string) {
    setSelectedFolder(path);
    addRecentPath(path);
    addRecentFolder(path).catch(console.error);
    const list = await scanFiles(path);
    setFiles(list);
    selectNeedRename(list);
    // 保存当前选中节点
    setConfig({ ...config, last_selected_folder: path }).catch(console.error);
  }

  async function handleQuickAccessSelect(path: string) {
    setFolderPath(path);
    setSelectedFolder(path);
    addRecentPath(path);
    if (path) {
      addRecentFolder(path).catch(console.error);
    }
    const list = await scanFiles(path);
    setFiles(list);
    selectNeedRename(list);
  }

  async function handleToggleFavorite(path: string) {
    const isFav = config.favorite_folders.includes(path);
    if (isFav) {
      await removeFavoriteFolder(path);
    } else {
      await addFavoriteFolder(path);
    }
    const cfg = await getConfig();
    setGlobalConfig(cfg);
  }

  async function handleRefresh() {
    setManualTimeSourceMap(new Map());
    const target = selectedFolder || folderPath;
    if (!target) return;
    const list = await scanFiles(target);
    setFiles(list);
    selectNeedRename(list);
  }

  function handleToggleTimeSource(path: string, source: "taken" | "modified") {
    setManualTimeSourceMap((prev) => {
      const next = new Map(prev);
      if (next.get(path) === source) {
        next.delete(path);
      } else {
        next.set(path, source);
      }
      return next;
    });
  }

  async function handlePreviewRename() {
    // 智能选择：按格式+容差筛选，并扩展链式冲突
    const tolerance = config.time_tolerance_seconds ?? 2;
    // 基于用户配置的日期格式生成标准文件名正则
    let pattern = (config.date_format || "YYYY-MM-DD HHmmss")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = pattern
      .replace(/YYYY/g, "\\d{4}")
      .replace(/MM/g, "\\d{2}")
      .replace(/DD/g, "\\d{2}")
      .replace(/HH/g, "\\d{2}")
      .replace(/mm/g, "\\d{2}")
      .replace(/ss/g, "\\d{2}");
    // 重复后缀模式：c 替换为 \d+
    const suffixPattern = (config.duplicate_suffix || "(c)")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/c/g, "\\d+");
    const standardFormat = new RegExp(`^${pattern}(?:${suffixPattern})?$`);

    // 第一步：按格式+容差判断初始是否需要改名
    const needRenameSet = new Set<string>();
    for (const op of renameOps) {
      // 新旧文件名完全一致，无需改名
      if (op.old_name === op.new_name) continue;
      const baseName = op.old_name.includes(".")
        ? op.old_name.slice(0, op.old_name.lastIndexOf("."))
        : op.old_name;
      const isStandard = standardFormat.test(baseName);
      const withinTolerance = isWithinTimeTolerance(op.old_name, op.new_name, tolerance);
      if (!isStandard || !withinTolerance) {
        needRenameSet.add(op.old_path);
      }
    }

    // 第二步：扩展链式冲突——链上所有文件都要勾选
    let changed = true;
    while (changed) {
      changed = false;
      for (const op of renameOps) {
        if (needRenameSet.has(op.old_path)) continue;

        // 已勾选文件改名后会覆盖/用到当前文件 → 当前文件也需勾选
        const coveredByNeeded = renameOps.some(
          (n) => needRenameSet.has(n.old_path) && n.new_path === op.old_path
        );
        // 当前文件改名后会覆盖/用到已勾选文件 → 当前文件也需勾选
        const coversNeeded = renameOps.some(
          (n) => needRenameSet.has(n.old_path) && op.new_path === n.old_path
        );

        if (coveredByNeeded || coversNeeded) {
          needRenameSet.add(op.old_path);
          changed = true;
        }
      }
    }

    updateSelectedPaths(Array.from(needRenameSet));
  }

  async function handleExecuteRename() {
    const opsToExecute = renameOps
      .filter((op) => selectedPaths.has(op.old_path))
      .map((op) => {
        const manualName = manualRenameMap.get(op.old_path);
        if (manualName !== undefined && manualName !== op.new_name) {
          const dirSep = op.old_path.lastIndexOf("\\");
          const dir = dirSep >= 0 ? op.old_path.slice(0, dirSep + 1) : "";
          return {
            ...op,
            new_name: manualName,
            new_path: dir + manualName,
          };
        }
        return op;
      });
    if (opsToExecute.length === 0) return;

    // 执行前冲突检测
    const conflicts: string[] = [];
    const newPathToOldName = new Map<string, string>();
    for (const op of opsToExecute) {
      if (newPathToOldName.has(op.new_path)) {
        conflicts.push(`"${op.old_name}" 与 "${newPathToOldName.get(op.new_path)}" 目标文件名相同`);
      } else {
        newPathToOldName.set(op.new_path, op.old_name);
      }
    }
    const unselectedFiles = files.filter((f) => !selectedPaths.has(f.path));
    for (const op of opsToExecute) {
      const unselected = unselectedFiles.find((f) => f.path === op.new_path);
      if (unselected) {
        conflicts.push(`"${op.old_name}" 将覆盖未勾选的文件 "${unselected.name}"`);
      }
    }
    if (conflicts.length > 0) {
      showModal("重命名冲突", "检测到以下冲突，请检查勾选状态或手动修改目标名：\n\n" + conflicts.join("\n"));
      return;
    }

    await executeRename(opsToExecute);
    setManualRenameMap(new Map());
    setManualTimeSourceMap(new Map());
    setEditingPath(null);
    const target = selectedFolder || folderPath;
    const list = await scanFiles(target);
    setFiles(list);
    updateSelectedPaths(list.map((f) => f.path));
  }

  async function handlePreviewArchive() {
    // 预览已改为自动计算，此按钮保留用于用户习惯
  }

  async function handleExecuteArchive() {
    const opsToExecute = archiveOps.filter((op) => selectedPaths.has(op.old_path));
    if (opsToExecute.length === 0) return;
    await executeArchive(opsToExecute);
    const target = selectedFolder || folderPath;
    const list = await scanFiles(target);
    setFiles(list);
    updateSelectedPaths(list.map((f) => f.path));
  }

  const filteredFiles = useMemo(() => {
    let result = files;
    if (mediaFilter !== "all") {
      result = result.filter((f) => getFileCategory(f.ext) === mediaFilter);
    }
    if (showSelectedOnly) {
      result = result.filter((f) => selectedPaths.has(f.path));
    }
    return result;
  }, [files, mediaFilter, showSelectedOnly, selectedPaths]);

  const renameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of renameOps) {
      map.set(op.old_path, op.new_name);
    }
    return map;
  }, [renameOps]);

  const archiveMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const op of archiveOps) {
      map.set(op.old_path, op.target_folder);
    }
    return map;
  }, [archiveOps]);

  // 预览后构建路径 -> 日期和时间来源的映射
  const previewDateMap = useMemo(() => {
    const map = new Map<string, { date_taken?: string; date_created?: string; date_modified?: string; time_source?: string }>();
    for (const op of renameOps) {
      map.set(op.old_path, {
        date_taken: op.date_taken,
        date_created: op.date_created,
        date_modified: op.date_modified,
        time_source: op.time_source,
      });
    }
    return map;
  }, [renameOps]);

  // 全选状态（基于当前筛选视图）
  const allSelected = filteredFiles.length > 0 && filteredFiles.every((f) => selectedPaths.has(f.path));
  const someSelected = filteredFiles.some((f) => selectedPaths.has(f.path)) && !allSelected;

  function toggleSelectAll() {
    const newSet = new Set(selectedPaths);
    if (allSelected) {
      for (const f of filteredFiles) {
        newSet.delete(f.path);
      }
    } else {
      for (const f of filteredFiles) {
        newSet.add(f.path);
      }
    }
    setSelectedPaths(newSet);
  }

  function toggleSelectFile(path: string) {
    const newSet = new Set(selectedPaths);
    if (newSet.has(path)) {
      newSet.delete(path);
    } else {
      newSet.add(path);
    }
    setSelectedPaths(newSet);
  }

  return (
    <div className="flex flex-col h-full">
      {/* 顶部工具栏：菜单 + 操作 合并为一行 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-card">
        {/* 左侧：Tab 切换 */}
        <div className="flex items-center gap-1">
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
        </div>

        <div className="flex-1" />
        {activeTab === "rename" && (
          <>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={renameMode}
              onChange={(e) => setRenameMode(e.target.value as RenameMode)}
            >
              <option value="ByDateTime">按时间日期</option>
              <option value="ByFileName">按文件名称</option>
            </select>

            <Button size="sm" variant="secondary" onClick={handlePreviewRename} disabled={selectedPaths.size === 0}>
              <Eye size={14} className="mr-2" />
              智能选择
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteRename}
              disabled={renameOps.length === 0}
            >
              <Play size={14} className="mr-2" />
              执行改名
            </Button>
          </>
        )}
        {activeTab === "archive" && (
          <>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              value={archiveMode}
              onChange={(e) => setArchiveMode(e.target.value as ArchiveMode)}
            >
              <option value="ByYear">按年归档</option>
              <option value="ByYearMonth">按年月归档</option>
              <option value="MergeSubfolders">合并子文件夹</option>
            </select>
            <Button size="sm" variant="secondary" onClick={handlePreviewArchive} disabled={selectedPaths.size === 0}>
              <Eye size={14} className="mr-2" />
              智能选择
            </Button>
            <Button
              size="sm"
              onClick={handleExecuteArchive}
              disabled={archiveOps.length === 0}
            >
              <Play size={14} className="mr-2" />
              执行归档
            </Button>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：选择文件夹 + 文件树 */}
        <div className="w-64 border-r bg-card flex flex-col">
          <div className="p-3 border-b">
            <Button variant="outline" size="sm" className="w-full" onClick={handleSelect}>
              <FolderOpen size={16} className="mr-2" />
              选择文件夹
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <FileTree
              rootPath={folderPath}
              selectedPath={selectedFolder}
              onSelect={handleTreeSelect}
              onQuickAccessSelect={handleQuickAccessSelect}
              recentPaths={recentPaths}
              favoriteFolders={config.favorite_folders}
              onToggleFavorite={handleToggleFavorite}
              expandedPaths={expandedPaths}
              onExpandedChange={(paths) => {
                setExpandedPaths(paths);
                setConfig({ ...config, expanded_paths: paths }).catch(console.error);
              }}
            />
          </ScrollArea>
        </div>

        {/* 右侧：路径/刷新 + 表格 + 筛选 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 路径和刷新 + 设置 */}
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground truncate flex-1">
              {selectedFolder || folderPath || "未选择文件夹"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={async () => {
                const target = selectedFolder || folderPath;
                if (!target) return;
                try {
                  await openFolder(target);
                } catch (e) {
                  showModal("错误", "打开文件夹失败: " + e);
                  console.error("打开文件夹失败:", e);
                }
              }}
              disabled={!selectedFolder && !folderPath}
              title="打开当前文件夹"
            >
              <ExternalLink size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleRefresh}
              disabled={!folderPath}
              title="刷新当前文件夹"
            >
              <RefreshCw size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setActiveTab("settings")}
              title="设置"
            >
              <Wrench size={14} />
            </Button>
          </div>

          {/* 表格头部信息 */}
          <div className="px-4 py-2 text-xs font-semibold text-muted-foreground border-b flex items-center justify-between">
            <span>文件列表 ({filteredFiles.length})</span>
            {activeTab === "rename" && renameOps.length > 0 && (
              <span className="text-primary">已预览 {renameOps.length} 项</span>
            )}
            {activeTab === "archive" && archiveOps.length > 0 && (
              <span className="text-primary">已预览 {archiveOps.length} 项</span>
            )}
          </div>
          <ScrollArea className="flex-1">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="w-8 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected; }}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                    {activeTab === "rename" ? "原文件名" : "文件名"}
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                    {activeTab === "rename"
                      ? "新文件名"
                      : activeTab === "archive"
                      ? "目标文件夹"
                      : "路径"}
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">
                    <div className="flex items-center gap-1.5">
                      {activeTab === "rename" && (
                        <label
                          className="flex items-center cursor-pointer select-none"
                          title="优先使用拍摄时间命名"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={config.prefer_date_taken ?? false}
                            onChange={async (e) => {
                              const newCfg = { ...config, prefer_date_taken: e.target.checked };
                              setGlobalConfig(newCfg);
                              await setConfig(newCfg);
                            }}
                            className="rounded border-input"
                          />
                        </label>
                      )}
                      <span>拍摄时间</span>
                    </div>
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">
                    修改时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFiles.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-muted-foreground"
                    >
                      {folderPath ? "该文件夹下无文件" : "请从左侧选择文件夹"}
                    </td>
                  </tr>
                )}
                {filteredFiles.map((file, i) => {
                  const isChecked = selectedPaths.has(file.path);
                  const finalNewName = getFinalNewName(file);
                  const targetFolder = archiveMap.get(file.path);
                  const dateInfo = previewDateMap.get(file.path);
                  return (
                    <tr key={i} className={`hover:bg-accent/50 transition-colors group ${!isChecked ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectFile(file.path)}
                        />
                      </td>
                      <td className={`px-4 py-2 font-medium ${activeTab === "rename" && finalNewName && isOriginalEarlierThanNew(file.name, finalNewName, config.time_tolerance_seconds ?? 2) ? "text-red-600" : ""}`}>
                        <div className="flex items-center gap-1">
                          <span className="flex-1">{file.name}</span>
                          <button
                            className="p-0.5 rounded hover:bg-accent text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openFile(file.path);
                            }}
                            title="打开文件"
                          >
                            <ExternalLink size={14} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {activeTab === "rename" && finalNewName ? (
                          editingPath === file.path ? (
                            <input
                              type="text"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => {
                                setManualRenameMap(prev => new Map(prev).set(file.path, editingValue));
                                setSelectedPaths(prev => {
                                  const next = new Set(prev);
                                  if (editingValue === file.name) {
                                    next.delete(file.path);
                                  } else {
                                    next.add(file.path);
                                  }
                                  return next;
                                });
                                setEditingPath(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setManualRenameMap(prev => new Map(prev).set(file.path, editingValue));
                                  setSelectedPaths(prev => {
                                    const next = new Set(prev);
                                    if (editingValue === file.name) {
                                      next.delete(file.path);
                                    } else {
                                      next.add(file.path);
                                    }
                                    return next;
                                  });
                                  setEditingPath(null);
                                } else if (e.key === "Escape") {
                                  setEditingPath(null);
                                }
                              }}
                              autoFocus
                              className="w-full px-1 py-0.5 text-sm border rounded bg-background"
                            />
                          ) : (
                            <span
                              className={`cursor-pointer ${
                                manualRenameMap.has(file.path)
                                  ? "text-red-600 font-medium"
                                  : isWithinTimeTolerance(file.name, finalNewName, config.time_tolerance_seconds ?? 2)
                                    ? "text-muted-foreground"
                                    : "text-primary font-medium"
                              }`}
                              onClick={() => {
                                setEditingPath(file.path);
                                setEditingValue(finalNewName);
                              }}
                            >
                              {finalNewName}
                            </span>
                          )
                        ) : activeTab === "archive" && targetFolder ? (
                          <span className="text-primary font-medium">
                            {targetFolder}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td
                        className={`px-4 py-2 text-xs ${
                          (() => {
                            const taken = dateInfo?.date_taken || file.date_taken;
                            const modified = dateInfo?.date_modified || file.date_modified;
                            if (taken && modified && taken > modified) return "text-red-600 font-semibold";
                            if (dateInfo?.time_source === "exif" || dateInfo?.time_source === "video") return "text-green-600 font-semibold";
                            return "text-muted-foreground";
                          })()
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="flex-1">{dateInfo?.date_taken || file.date_taken || "-"}</span>
                          {activeTab === "rename" && (dateInfo?.date_taken || file.date_taken) && (
                            <button
                              className={`p-0.5 rounded hover:bg-accent flex-shrink-0 ${manualTimeSourceMap.get(file.path) === "taken" ? "text-green-600 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTimeSource(file.path, "taken");
                              }}
                              title={manualTimeSourceMap.get(file.path) === "taken" ? "取消使用拍摄时间" : "使用拍摄时间命名"}
                            >
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-2 text-xs ${
                          dateInfo?.time_source === "modified"
                            ? "text-green-600 font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="flex-1">{dateInfo?.date_modified || file.date_modified || "-"}</span>
                          {activeTab === "rename" && (dateInfo?.date_modified || file.date_modified) && (
                            <button
                              className={`p-0.5 rounded hover:bg-accent flex-shrink-0 ${manualTimeSourceMap.get(file.path) === "modified" ? "text-green-600 opacity-100" : "text-muted-foreground opacity-0 group-hover:opacity-100"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleTimeSource(file.path, "modified");
                              }}
                              title={manualTimeSourceMap.get(file.path) === "modified" ? "取消使用修改时间" : "使用修改时间命名"}
                            >
                              <Check size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>

          {/* Media Type Filter */}
          <div className="flex items-center gap-2 px-4 py-2 border-t bg-muted/20">
            <span className="text-xs text-muted-foreground mr-1">筛选:</span>
            <Button
              size="sm"
              variant={showSelectedOnly ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setShowSelectedOnly(!showSelectedOnly)}
            >
              {showSelectedOnly ? "显示全部" : "仅显示已选"}
            </Button>
            <span className="w-px h-4 bg-border mx-1" />
            <Button
              size="sm"
              variant={mediaFilter === "all" ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setMediaFilter("all")}
            >
              <Layers size={12} className="mr-1" />
              全部
            </Button>
            <Button
              size="sm"
              variant={mediaFilter === "image" ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setMediaFilter("image")}
            >
              <Image size={12} className="mr-1" />
              图片
            </Button>
            <Button
              size="sm"
              variant={mediaFilter === "video" ? "secondary" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setMediaFilter("video")}
            >
              <Video size={12} className="mr-1" />
              视频
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              共 {files.length} 个文件，已选 {selectedPaths.size} 个
            </span>
          </div>
        </div>
      </div>

      {/* 更新提示对话框 */}
      {updateInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card rounded-xl p-6 max-w-sm w-full mx-4 shadow-lg border">
            <h3 className="text-lg font-semibold mb-2">发现新版本</h3>
            <div className="text-sm text-muted-foreground space-y-1 mb-4">
              <p>当前版本：0.1.6</p>
              <p>最新版本：{updateInfo.version}</p>
              {updateInfo.releaseNotes && <p>{updateInfo.releaseNotes}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setUpdateInfo(null)}>
                稍后提醒
              </Button>
              <Button size="sm" onClick={() => { openUrl(updateInfo.downloadUrl); setUpdateInfo(null); }}>
                立即更新
              </Button>
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
