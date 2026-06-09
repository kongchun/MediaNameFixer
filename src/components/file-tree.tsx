import { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Clock,
  Star,
  HardDrive,
  Image,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { listDirectories, getSpecialFolders } from "@/api/tauri";
import type { QuickAccessItem } from "@/types";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isLoaded: boolean;
  isExpanded: boolean;
}

function TreeItem({
  node,
  level,
  selectedPath,
  onSelect,
  onExpand,
}: {
  node: TreeNode;
  level: number;
  selectedPath: string;
  onSelect: (path: string) => void;
  onExpand: (path: string) => void;
}) {
  const isSelected = node.path === selectedPath;
  const hasChildren = node.children.length > 0 || !node.isLoaded;

  return (
    <div>
      <div
        className={cn(
          "flex items-center py-1 px-2 cursor-pointer hover:bg-accent rounded-sm select-none",
          isSelected && "bg-accent"
        )}
        style={{ paddingLeft: `${level * 14 + 4}px` }}
        onDoubleClick={() => onExpand(node.path)}
      >
        <span
          className="mr-1 text-muted-foreground flex-shrink-0 w-4 h-4 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onExpand(node.path);
          }}
        >
          {hasChildren ? (
            node.isExpanded ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="w-[14px]" />
          )}
        </span>
        <span
          className="flex items-center flex-1 min-w-0"
          onClick={() => onSelect(node.path)}
        >
          <span className="mr-2 text-muted-foreground flex-shrink-0">
            {node.path.endsWith(":\\") ? (
              <HardDrive size={16} className="text-muted-foreground" />
            ) : node.isExpanded ? (
              <FolderOpen size={16} className="text-blue-500" />
            ) : (
              <Folder size={16} className="text-blue-500" />
            )}
          </span>
          <span className="text-sm truncate">{node.name}</span>
        </span>
      </div>
      {node.isExpanded &&
        node.children.map((child, i) => (
          <TreeItem
            key={child.path + i}
            node={child}
            level={level + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
            onExpand={onExpand}
          />
        ))}
    </div>
  );
}

export function FileTree({
  rootPath,
  selectedPath,
  onSelect,
  onQuickAccessSelect,
  recentPaths,
  favoriteFolders,
  onToggleFavorite,
  expandedPaths,
  onExpandedChange,
}: {
  rootPath: string;
  selectedPath: string;
  onSelect: (path: string) => void;
  onQuickAccessSelect?: (path: string) => void;
  recentPaths: string[];
  favoriteFolders: string[];
  onToggleFavorite?: (path: string) => void;
  expandedPaths?: string[];
  onExpandedChange?: (paths: string[]) => void;
}) {
  const [quickAccess, setQuickAccess] = useState<QuickAccessItem[]>([]);
  const [root, setRoot] = useState<TreeNode | null>(null);

  // 加载当前文件夹树
  useEffect(() => {
    if (!rootPath) {
      setRoot(null);
      return;
    }
    console.time("[树] listDirectories: " + rootPath);
    const name = rootPath.split("\\").pop() || rootPath;
    listDirectories(rootPath)
      .then((dirs) => {
        console.timeEnd("[树] listDirectories: " + rootPath);
        console.time("[树] setRoot");
        setRoot({
          name,
          path: rootPath,
          children: dirs.map((d) => ({
            name: d.name,
            path: d.path,
            children: [],
            isLoaded: false,
            isExpanded: expandedPaths?.includes(d.path) ?? false,
          })),
          isLoaded: true,
          isExpanded: true,
        });
        console.timeEnd("[树] setRoot");
      })
      .catch((err) => {
        console.error("listDirectories error:", err);
      });
  }, [rootPath]);

  useEffect(() => {
    console.time("[树] getSpecialFolders");
    getSpecialFolders()
      .then((items) => {
        console.timeEnd("[树] getSpecialFolders");
        setQuickAccess(items);
      })
      .catch((err) => {
        console.error("getSpecialFolders error:", err);
      });
  }, []);

  const expandNode = useCallback(
    async (path: string) => {
      setRoot((prev) => {
        if (!prev) return prev;

        const walk = (node: TreeNode): TreeNode => {
          if (node.path === path) {
            const willExpand = !node.isExpanded;
            if (!node.isLoaded) {
              listDirectories(path).then((dirs) => {
                const newChildren = dirs.map((d) => ({
                  name: d.name,
                  path: d.path,
                  children: [],
                  isLoaded: false,
                  isExpanded: expandedPaths?.includes(d.path) ?? false,
                }));
                setRoot((prev2) => {
                  if (!prev2) return prev2;
                  const walk2 = (n: TreeNode): TreeNode => {
                    if (n.path === path) {
                      return { ...n, children: newChildren, isLoaded: true };
                    }
                    return { ...n, children: n.children.map(walk2) };
                  };
                  return walk2(prev2);
                });
              });
              // 通知外部展开变化
              if (onExpandedChange) {
                const next = expandedPaths ? [...expandedPaths] : [];
                if (!next.includes(path)) next.push(path);
                onExpandedChange(next);
              }
              return { ...node, isExpanded: true };
            }
            // 通知外部展开变化
            if (onExpandedChange) {
              const next = expandedPaths ? [...expandedPaths] : [];
              if (willExpand) {
                if (!next.includes(path)) next.push(path);
              } else {
                const idx = next.indexOf(path);
                if (idx >= 0) next.splice(idx, 1);
              }
              onExpandedChange(next);
            }
            return { ...node, isExpanded: willExpand };
          }
          return { ...node, children: node.children.map(walk) };
        };

        return walk(prev);
      });
    },
    [setRoot, expandedPaths, onExpandedChange]
  );

  return (
    <div className="h-full overflow-auto py-1">
      {/* 快捷访问 */}
      <div className="px-3 py-2">
        <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
          <Star size={12} />
          快捷访问
        </div>
        {quickAccess.map((item) => (
          <div
            key={item.path}
            className={cn(
              "flex items-center py-1 px-2 cursor-pointer hover:bg-accent rounded-sm select-none",
              selectedPath === item.path && "bg-accent"
            )}
            onClick={() => {
              if (onQuickAccessSelect) {
                onQuickAccessSelect(item.path);
              } else {
                onSelect(item.path);
              }
            }}
          >
            {item.name === "桌面" ? (
              <Monitor size={16} className="mr-2 text-blue-500 flex-shrink-0" />
            ) : item.name === "图片" ? (
              <Image size={16} className="mr-2 text-purple-500 flex-shrink-0" />
            ) : (
              <Folder size={16} className="mr-2 text-blue-500 flex-shrink-0" />
            )}
            <span className="text-sm truncate">{item.name}</span>
          </div>
        ))}
        {favoriteFolders.length > 0 && (
          <>
            <div className="my-1 border-t border-border/50" />
            {favoriteFolders.map((path) => (
              <div
                key={path}
                className={cn(
                  "flex items-center py-1 px-2 cursor-pointer hover:bg-accent rounded-sm select-none group",
                  selectedPath === path && "bg-accent"
                )}
                onClick={() => {
                  if (onQuickAccessSelect) {
                    onQuickAccessSelect(path);
                  } else {
                    onSelect(path);
                  }
                }}
              >
                <Folder size={16} className="mr-2 text-yellow-500 flex-shrink-0" />
                <span className="text-sm truncate flex-1">{path.split("\\").pop() || path}</span>
                <span
                  className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-accent"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite?.(path);
                  }}
                  title="取消收藏"
                >
                  <Star size={14} className="text-yellow-500" fill="currentColor" />
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* 最近访问 */}
      {recentPaths.length > 0 && (
        <div className="px-3 py-2 border-t">
          <div className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1">
            <Clock size={12} />
            最近访问
          </div>
          {recentPaths.map((path) => {
            const isFav = favoriteFolders.includes(path);
            return (
              <div
                key={path}
                className={cn(
                  "flex items-center py-1 px-2 cursor-pointer hover:bg-accent rounded-sm select-none group",
                  selectedPath === path && "bg-accent"
                )}
                onClick={() => onSelect(path)}
              >
                <Folder size={16} className="mr-2 text-yellow-500 flex-shrink-0" />
                <span className="text-sm truncate flex-1">
                  {path.split("\\").pop() || path}
                </span>
                <span
                  className={cn(
                    "ml-1 p-0.5 rounded hover:bg-accent",
                    isFav ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite?.(path);
                  }}
                  title={isFav ? "取消收藏" : "收藏"}
                >
                  <Star
                    size={14}
                    className={isFav ? "text-yellow-500" : "text-muted-foreground"}
                    fill={isFav ? "currentColor" : "none"}
                  />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* 当前文件夹树 */}
      {rootPath && (
        <div className="px-3 py-2 border-t">
          <div className="text-xs font-semibold text-muted-foreground mb-1">
            当前文件夹
          </div>
          {root ? (
            <TreeItem
              node={root}
              level={0}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onExpand={expandNode}
            />
          ) : (
            <div className="px-2 py-1 text-sm text-muted-foreground">
              加载中...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
