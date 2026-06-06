# MediaNameFixer

MediaNameFixer 是一款基于 Tauri 开发的 Windows 桌面应用，用于媒体文件（图片/视频）的批量重命名与自动归档。支持读取 EXIF 拍摄时间、视频元数据创建时间，自动将文件重命名为标准时间格式，或按年/年月归档到对应目录。

## 功能特性

- **批量重命名**
  - 按 EXIF 拍摄时间（图片）/ 视频创建时间 自动重命名
  - 支持文件名中数字日期提取并转为标准格式
  - 新文件名列支持手动编辑
  - 自动处理重名冲突（支持自定义后缀格式）
  - **智能选择**：自动勾选真正需要改名的文件（考虑时间容差和格式匹配）
  - **链式冲突检测**：执行前检测重命名覆盖冲突并弹窗提醒
- **文件归档**
  - 按年归档（`YYYY/`）
  - 按年月归档（`YYYY-MM/`）
  - 合并子文件夹到当前目录
- **文件管理**
  - 左侧文件树导航，支持双击展开/折叠
  - 记录最近访问文件夹（最多 10 条）和收藏文件夹
  - 图片 / 视频 / 全部 类型筛选
  - **仅显示已选** 快捷筛选模式
  - 一键打开当前文件夹（系统资源管理器）
  - 状态持久化：自动恢复上次文件夹、选中节点和树展开状态
- **时间来源识别**
  - 优先读取 EXIF `DateTimeOriginal`
  - 次选视频 `CreateDate` / `MediaCreateDate`
  - 兜底使用文件修改时间
  - **优先拍摄时间** 快捷开关（列头直接操作）
  - 文件列表显示拍摄时间来源图标：
    - **E** = EXIF 原始拍摄时间（DateTimeOriginal）
    - **D** = EXIF 数字化时间（DateTimeDigitized）
    - **M** = Apple 媒体创建时间 / QuickTime 创建时间（MediaCreateDate / CreateDate）
    - **G** = 旧 3GP 本地时间（3gp4/3gp5/3gp6/3gp7 格式）
- **版本更新检测**
  - 启动时自动检测新版本
  - 支持手动检查更新
  - 一键跳转下载最新安装包
- **设置自定义**
  - 自定义目标文件名格式（如 `YYYY-MM-DD HHmmss`）
  - 自定义重复文件后缀（如 `(c)` 或 `c`）
  - 时间容差秒数配置
  - EXIF 解析引擎切换（kamadak / exiftool）
  - **3GP利旧模式**：旧 3GP 设备（3gp4/3gp5/3gp6/3gp7）直接写入本地时间，勾选后跳过 UTC 转换

## 技术栈

- **前端**：React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **后端**：Rust + Tauri v2
- **元数据读取**：`kamadak-exif`（Rust EXIF 解析库）

## 环境准备

### 必需依赖

| 工具 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 18 | 前端构建运行环境 |
| Rust | 最新稳定版 | Tauri 后端编译 |
| npm | 随 Node 自带 | 包管理 |

### Windows 专项准备

1. **WebView2**：Windows 10/11 通常已预装，如缺失请从 [微软官网](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) 下载。
2. **Visual Studio Build Tools**：必须安装 **MSVC v143 - VS 2022 C++ x64/x86 生成工具**（Tauri 编译依赖）。
   - 下载 [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - 工作负荷勾选："使用 C++ 的桌面开发"
3. **Rust 工具链**：安装后确保默认使用 MSVC 目标
   ```powershell
   rustup default stable-x86_64-pc-windows-msvc
   ```

## 开发环境搭建

### 1. 克隆仓库

```bash
git clone https://github.com/kongchun/MediaNameFixer.git

### 2. 安装前端依赖

```bash
npm install
```

### 3. 安装/更新 Rust 依赖

```bash
cd src-tauri
cargo fetch
cd ..
```

> 如果网络较慢，建议配置 Cargo 国内镜像源（如阿里云镜像）。

## 构建与运行

### 开发模式（热重载）

```bash
npm run tauri dev
```
- 前端服务运行在 `http://localhost:1420`
- Rust 后端自动编译并启动桌面窗口

### 生产构建

```bash
npm run tauri build
```
- 构建完成后，安装包位于 `src-tauri/target/release/bundle/`
- 可直接分发 `.msi` 或 `.exe` 安装程序

### 仅构建前端

```bash
npm run build
```
- 输出到 `dist/` 目录，仅用于前端独立部署调试

## 项目结构

```
MediaNameFixer/
├── src/                     # 前端源码（React + TS）
│   ├── pages/               # 页面组件（HomePage / SettingsPage）
│   ├── components/          # UI 组件（FileTree / Button / ScrollArea）
│   ├── api/tauri.ts         # Tauri 后端命令调用封装
│   ├── utils/preview.ts     # 重命名/归档预览计算逻辑
│   ├── store/               # 全局状态管理
│   └── types/               # TypeScript 类型定义
├── src-tauri/               # Tauri + Rust 后端
│   ├── src/
│   │   ├── commands/        # Tauri 命令处理器（文件扫描、重命名、归档）
│   │   ├── core/            # 核心业务逻辑（EXIF 读取、重命名引擎）
│   │   ├── models/          # 数据模型
│   │   ├── config/          # 配置管理
│   │   └── lib.rs           # Tauri 入口与命令注册
│   ├── Cargo.toml           # Rust 依赖配置
│   └── tauri.conf.json      # Tauri 应用配置
├── tools/
│   └── media-tool.bat       # 原始批处理版本（功能对照参考）
├── public/                  # 静态资源
└── package.json             # Node 依赖与脚本
```

## IDE 推荐

- [VS Code](https://code.visualstudio.com/)
  - 插件：[Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) + [ES7+ React/Redux/React-Native snippets](https://marketplace.visualstudio.com/items?itemName=dsznajder.es7-react-js-snippets)

## 常见问题

**Q: 设置保存后重启丢失？**  
A: 请确保 `src-tauri/src/models/mod.rs` 中的 `AppConfig` 结构体带有 `#[serde(default)]` 属性，以兼容旧版配置文件。

**Q: `cargo build` 报错找不到 MSVC linker？**  
A: 请确认已安装 Visual Studio 的 "使用 C++ 的桌面开发" 工作负荷，并在 PowerShell 执行 `rustup default stable-x86_64-pc-windows-msvc` 切换到 MSVC 工具链。

**Q: 运行时提示缺少 WebView2？**  
A: 从 [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) 下载安装 Evergreen Standalone Installer。

**Q: 前端页面白屏？**  
A: 检查 `npm run tauri dev` 是否成功启动了 Vite 服务（端口 1420），以及 `src-tauri/tauri.conf.json` 中的 `devUrl` 配置是否正确。
