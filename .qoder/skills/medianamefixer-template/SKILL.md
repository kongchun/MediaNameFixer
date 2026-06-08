---
name: medianamefixer-template
description: >
  Scaffolds and maintains Tauri v2 desktop applications following the MediaNameFixer project conventions.
  Stack: Tauri v2 + React 19 + TypeScript + Vite + Tailwind CSS v3 + Rust.
  Covers directory layout, Shadcn/UI-style theming, CVA component patterns, React Context state management,
  Tauri invoke API layer, Rust module organization, and naming conventions.
  Use when creating a new Tauri desktop app, initializing a media/file management tool,
  or when the user wants to follow the MediaNameFixer code style and UI design patterns.
---

# MediaNameFixer Project Template

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | ^19.1.0 |
| Language | TypeScript | ~5.8.3 |
| Build Tool | Vite | ^5.4.21 |
| Styling | Tailwind CSS | ^3.4.19 |
| Desktop Framework | Tauri | ^2 |
| Backend | Rust | edition 2021 |
| Icons | lucide-react | ^1.17.0 |

Key utility packages: `clsx`, `tailwind-merge`, `class-variance-authority`.

## Directory Structure

### Frontend (`src/`)

```
src/
├── api/           # Tauri invoke wrappers and external API calls
│   ├── tauri.ts   # All invoke() calls to Rust commands
│   └── update.ts  # Version check / update logic
├── assets/        # Static assets (images, fonts)
├── components/    # React components
│   ├── ui/        # Reusable primitive components (Button, Badge, ScrollArea)
│   └── ...        # Feature-specific components
├── hooks/         # Custom React hooks
├── lib/           # Utility functions
│   └── utils.ts   # cn() helper: twMerge(clsx(...))
├── pages/         # Top-level page components
│   ├── HomePage.tsx
│   └── SettingsPage.tsx
├── store/         # Global state (React Context)
│   └── index.tsx  # AppProvider + useAppState hook
├── types/         # Shared TypeScript interfaces
│   └── index.ts   # All domain types (FileInfo, AppConfig, etc.)
├── utils/         # Additional helpers
├── App.tsx        # Root component, tab routing
├── main.tsx       # ReactDOM root render
├── index.css      # Tailwind directives + CSS variables theme
└── vite-env.d.ts  # Vite environment types
```

### Rust Backend (`src-tauri/src/`)

```
src-tauri/src/
├── commands/      # Tauri command handlers (exported to frontend)
├── config/        # App configuration manager
├── core/          # Business logic modules
│   ├── mod.rs
│   ├── renamer.rs
│   ├── archiver.rs
│   └── exif/      # EXIF/metadata submodules
├── models/        # Data structures (serde)
├── thumbnail/     # Thumbnail generation logic
├── utils/         # Rust helpers
├── lib.rs         # Module declarations + Tauri Builder setup
└── main.rs        # Entry point, windows_subsystem cfg
```

## Styling Conventions

### Theme System (CSS Variables)

Use HSL-based CSS variables in `index.css`. Define a full color palette:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 222.2 84% 4.9%;
  --radius: 0.5rem;
}
```

Map them in `tailwind.config.js` under `theme.extend.colors` using `hsl(var(--name))`.

### Tailwind Config

- `darkMode: ["class"]`
- Content: `["./index.html", "./src/**/*.{js,ts,jsx,tsx}"]`
- Extend colors, borderRadius. No custom plugins unless necessary.

### Utility Function (`cn`)

Always use the `cn` helper for className composition:

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

## Component Patterns

### Primitive Components (Shadcn/UI Style)

Use `class-variance-authority` (CVA) for variant-driven components:

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ...",
  {
    variants: {
      variant: { default: "...", destructive: "...", outline: "...", secondary: "...", ghost: "...", link: "..." },
      size: { default: "h-10 px-4 py-2", sm: "h-9 rounded-md px-3", lg: "h-11 rounded-md px-8", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
Button.displayName = "Button";
export { Button, buttonVariants };
```

### State Management

Use **React Context + useState**. No Redux, no Zustand.

```typescript
// store/index.tsx
const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState);
  return <AppContext.Provider value={{ state, setState }}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppState must be used within AppProvider");
  return ctx;
}
```

## API Layer

### Tauri Invoke Wrapper

All Rust commands are wrapped in `src/api/tauri.ts`. Never call `invoke()` directly from components.

```typescript
import { invoke } from "@tauri-apps/api/core";

export async function scanFiles(folderPath: string): Promise<FileInfo[]> {
  return invoke("scan_files", { folderPath });
}
```

Naming: camelCase for TS wrapper functions; snake_case for Rust command names.

## Rust Backend Conventions

### Module Organization (`lib.rs`)

Declare all modules as `pub mod` and use `tauri::generate_handler!` to register commands:

```rust
pub mod commands;
pub mod config;
pub mod core;
pub mod models;

use commands::*;
use config::ConfigManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_manager = ConfigManager::new(&app.handle());
            app.manage(config_manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![scan_files, get_config, set_config])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### `main.rs`

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    medianamefixer_app_lib::run()
}
```

### Data Types

- Use `serde::{Deserialize, Serialize}` for all data exchanged with frontend.
- Use `thiserror` for structured error handling.
- Config structs must derive `Default` or use `#[serde(default)]` to avoid deserialization failures on missing fields.

### Cargo.toml Profile

Use aggressive size optimization for release builds:

```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
strip = true
panic = "abort"
```

## Naming Conventions

| Context | Convention | Example |
|---------|-----------|---------|
| TS files | PascalCase for components, camelCase for utilities | `HomePage.tsx`, `useAppState.ts` |
| TS interfaces | PascalCase | `FileInfo`, `AppConfig` |
| TS functions | camelCase | `scanFiles`, `previewRename` |
| Rust files | snake_case | `renamer.rs`, `archiver.rs` |
| Rust structs/enums | PascalCase | `FileInfo`, `RenameMode` |
| Rust functions | snake_case | `scan_files`, `preview_rename` |
| Tauri commands | snake_case | `scan_files`, `get_config` |
| CSS variables | kebab-case | `--primary-foreground` |

## Vite Configuration

```typescript
// vite.config.ts
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
```

## Application Entry

```typescript
// main.tsx
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppProvider } from "./store";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <AppProvider>
    <App />
  </AppProvider>,
);
```

## Tauri Config (`tauri.conf.json`)

- `productName` and window `title` must match the application name.
- Enable `assetProtocol` with scope `["**"]` if serving local file thumbnails.
- `frontendDist` points to `../dist`.

## Rules & Constraints

### Frontend Code Rules

1. **Import Order**
   - React / third-party libraries
   - `@/components/ui/*` (primitive UI)
   - `@/components/*` (feature components)
   - `@/api/*` (Tauri wrappers)
   - `@/store`, `@/types`, `@/utils/*`
   - `lucide-react` icons: always named imports, never `*` import

2. **No Direct `invoke()` Calls**
   - All `invoke()` must be wrapped in `src/api/tauri.ts`
   - Components import from `@/api/tauri`, never use `@tauri-apps/api/core` directly

3. **Modal Uniformity**
   - All message dialogs use `MessageModal` (info) or `ConfirmModal` (confirm/cancel)
   - Never use `alert()` / `window.confirm()` or ad-hoc modal implementations
   - `MessageModal` / `ConfirmModal` live in `src/components/message-modal.tsx`

4. **Component Props Style**
   - Use destructured inline type annotations for simple props:
     ```tsx
     export function MyComp({ open, title }: { open: boolean; title: string }) {}
     ```
   - Complex shared types go in `src/types/index.ts`

5. **Constants**
   - File-type sets: `const IMAGE_EXTS = new Set(["jpg", "png", ...]);`
   - Naming: UPPER_SNAKE_CASE

6. **Operation Feedback Rule**
   - After batch operations (rename, archive), show a system dialog with the exact count:
     - `"已成功重命名 X 个文件"`
     - `"已成功归档 X 个文件"`

### Rust Code Rules

1. **Command Registration**
   - Every public command needs `#[tauri::command]`
   - Register in `lib.rs` via `tauri::generate_handler![...]`

2. **State Injection**
   - Shared state (e.g., `ConfigManager`) injected via `State<'_, ConfigManager>`
   - Managed in `.setup()` with `app.manage(config_manager)`

3. **Error Handling**
   - Command return type: `Result<T, String>` for fallible operations
   - Use `.map_err(|e| e.to_string())?` consistently
   - Never panic in commands; always return `Err(...)`

4. **Config Safety**
   - Config structs **must** derive `Default` or use `#[serde(default)]`
   - Read config with fallback to default on parse failure:
     ```rust
     fs::read_to_string(&path)
         .ok()
         .and_then(|s| serde_json::from_str(&s).ok())
         .unwrap_or_default()
     ```

5. **Platform Code**
   - Wrap OS-specific logic with `#[cfg(target_os = "...")]`
   - Windows constants (e.g., `CREATE_NO_WINDOW`) defined at module top

6. **File Sorting**
   - Media files sorted by **natural order** (numeric segments compared as numbers, not strings)

### Business Logic Constraints

1. **Recent Folders Limit**: Keep at most **5** recent folders
2. **Favorite Folders Deduplication**: Prevent duplicates before adding
3. **Rename Conflict Resolution**: Two-phase rename via temporary suffix when `new_path` equals another `old_path`
4. **Time Tolerance**: Compare filename timestamps within configurable seconds tolerance
5. **Thumbnail Scope**: Only generate thumbnails for image/video categories

## Checklist for New Projects

- [ ] `package.json`: `type: "module"`, npm scripts include `dev`, `build`, `tauri`
- [ ] `vite.config.ts`: `@` alias to `./src`, port 1420, ignore `src-tauri`
- [ ] `tailwind.config.js`: HSL color mapping, `darkMode: ["class"]`
- [ ] `index.css`: full CSS variable theme, `@tailwind` directives
- [ ] `src/lib/utils.ts`: `cn()` helper exported
- [ ] `src/store/index.tsx`: React Context provider + hook
- [ ] `src/types/index.ts`: all shared interfaces
- [ ] `src/api/tauri.ts`: all `invoke()` calls centralized
- [ ] `src/components/message-modal.tsx`: MessageModal + ConfirmModal ready
- [ ] `src-tauri/Cargo.toml`: release profile optimized for size
- [ ] `src-tauri/src/lib.rs`: modules declared, commands registered, plugins initialized
- [ ] `src-tauri/src/main.rs`: `windows_subsystem` cfg + `lib::run()`
