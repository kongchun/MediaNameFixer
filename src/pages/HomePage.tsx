import { useState, useMemo, useEffect } from "react";
import {
  selectFolder,
  scanFiles,
  executeRename,
  executeArchive,
  getConfig,
  addRecentFolder,
} from "../api/tauri";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAppState } from "../store";
import {
  FileInfo,
  RenameMode,
  ArchiveMode,
} from "../types";
import { computeRenamePreview, computeArchivePreview } from "../utils/preview";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileTree } from "@/components/file-tree";
import { FolderOpen, Eye, Play, Image, Video, Layers, RefreshCw } from "lucide-react";

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
  const { folderPath, setFolderPath, activeTab } = useAppState();
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [renameMode, setRenameMode] = useState<RenameMode>("ByDateTime");
  const [archiveMode, setArchiveMode] = useState<ArchiveMode>("ByYear");
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "image" | "video">("all");
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [manualRenameMap, setManualRenameMap] = useState<Map<string, string>>(new Map());
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");

  const renameOps = useMemo(() => {
    if (activeTab !== "rename") return [];
    return computeRenamePreview(files, renameMode, new Set(files.map((f) => f.path)));
  }, [files, renameMode, activeTab]);

  const archiveOps = useMemo(() => {
    if (activeTab !== "archive") return [];
    return computeArchivePreview(files, archiveMode, new Set(files.map((f) => f.path)));
  }, [files, archiveMode, activeTab]);

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
      return [path, ...filtered].slice(0, 3);
    });
  }

  // 启动时读取配置，自动加载上次文件夹
  useEffect(() => {
    getConfig().then((config) => {
      if (config.recent_folders.length > 0) {
        setRecentPaths(config.recent_folders.slice(0, 10));
      }
      if (config.last_folder) {
        const p = config.last_folder;
        setFolderPath(p);
        setSelectedFolder(p);
        scanFiles(p).then((list) => {
          setFiles(list);
          selectNeedRename(list);
        }).catch(console.error);
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
      addRecentPath(p);
      addRecentFolder(p).catch(console.error);
      const list = await scanFiles(p);
      setFiles(list);
      selectNeedRename(list);
    }
  }

  async function handleTreeSelect(path: string) {
    setSelectedFolder(path);
    setFolderPath(path);
    addRecentPath(path);
    addRecentFolder(path).catch(console.error);
    const list = await scanFiles(path);
    setFiles(list);
    selectNeedRename(list);
  }

  async function handleRefresh() {
    if (!folderPath) return;
    const list = await scanFiles(folderPath);
    setFiles(list);
    selectNeedRename(list);
  }

  async function handlePreviewRename() {
    // 预览已自动计算，点击后去掉无需改名的勾选
    const needRenamePaths = renameOps
      .filter((op) => op.new_name !== op.old_name)
      .map((op) => op.old_path);
    updateSelectedPaths(needRenamePaths);
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
    await executeRename(opsToExecute);
    setManualRenameMap(new Map());
    setEditingPath(null);
    const list = await scanFiles(folderPath);
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
    const list = await scanFiles(folderPath);
    setFiles(list);
    updateSelectedPaths(list.map((f) => f.path));
  }

  const filteredFiles = useMemo(() => {
    if (mediaFilter === "all") return files;
    return files.filter((f) => getFileCategory(f.ext) === mediaFilter);
  }, [files, mediaFilter]);

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
      {/* 顶部工具栏：只有操作选项 */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-card">
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
              预览
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
              预览
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
              recentPaths={recentPaths}
            />
          </ScrollArea>
        </div>

        {/* 右侧：路径/刷新 + 表格 + 筛选 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 路径和刷新 */}
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground truncate flex-1">
              {folderPath || "未选择文件夹"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={async () => {
                if (!folderPath) return;
                try {
                  const url = "file:///" + folderPath.replace(/\\/g, "/");
                  await openUrl(url);
                } catch (e) {
                  alert("打开文件夹失败: " + e);
                  console.error("打开文件夹失败:", e);
                }
              }}
              disabled={!folderPath}
              title="打开当前文件夹"
            >
              <FolderOpen size={14} />
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
                    拍摄时间
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
                    <tr key={i} className={`hover:bg-accent/50 transition-colors ${!isChecked ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectFile(file.path)}
                        />
                      </td>
                      <td className="px-4 py-2 font-medium">{file.name}</td>
                      <td className="px-4 py-2">
                        {activeTab === "rename" && finalNewName ? (
                          editingPath === file.path ? (
                            <input
                              type="text"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onBlur={() => {
                                setManualRenameMap(prev => new Map(prev).set(file.path, editingValue));
                                setEditingPath(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setManualRenameMap(prev => new Map(prev).set(file.path, editingValue));
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
                              className={`cursor-pointer ${finalNewName === file.name ? "text-muted-foreground" : "text-primary font-medium"}`}
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
                          dateInfo?.time_source === "exif" || dateInfo?.time_source === "video"
                            ? "text-green-600 font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {dateInfo?.date_taken || file.date_taken || "-"}
                      </td>
                      <td
                        className={`px-4 py-2 text-xs ${
                          dateInfo?.time_source === "modified"
                            ? "text-green-600 font-semibold"
                            : "text-muted-foreground"
                        }`}
                      >
                        {dateInfo?.date_modified || file.date_modified || "-"}
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
              共 {files.length} 个文件
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
