# PROJECT_BRIEF.md — DeepDive Search & Todo Desktop App

> **Last Updated**: 2026-07-15
> **Status legend**: ✅ Confirmed from plan.md · 🔵 Inferred · ❓ Unknown / Needs Verification

---

## What This Project Is

**DeepDive** (repository: Spotlight-Todo) is a polished, keyboard-first Windows desktop application combining:

1. A **Spotlight-style local file search** with offline, high-performance file and folder indexing
2. A **full-featured Todo and Notes workspace** with lists, tasks, tags, priorities, and notes
3. An **Apple-inspired Liquid Glass UI** with light/dark themes, smooth motion, and full accessibility
4. **Local-first Windows packaging** — supports portable operation without admin rights or internet access, but only signed and integrity-verified builds are releasable

## Main Goal

Give users a frictionless way to search files and manage tasks via a single compact, keyboard-driven floating interface — accessible via a global hotkey or system tray, requiring no elevated privileges.

## Main Users

- Individual knowledge workers and developers who prefer keyboard-first workflows
- Users who want a local-first, offline, portable productivity tool with no cloud account required

## Main Workflows

1. Press global hotkey → compact Spotlight bar appears
2. Type filename → live FTS5 results appear; press Enter to open
3. Click Todo button → bar expands into full Todo workspace
4. Manage tasks, lists, notes without leaving the floating interface
5. Run Sync to update the file index after changes on disk
6. Configure scan roots and appearance in Settings

## High-Level Modules

| Module | Description |
|--------|-------------|
| `electron/main/` | Electron main process — app lifecycle, IPC handlers, indexer, DB |
| `electron/preload/` | contextBridge API — safe renderer ↔ main bridge |
| `src/` | React renderer — all UI (search, todo, settings, glass components) |
| `src/design/` | CSS tokens, themes, Framer Motion config |
| `src/components/` | Shared Glass UI components |
| `src/features/` | search/, todo/, settings/ feature modules |
| `electron/main/indexer/` | File scanner, sync engine, traversal queue |
| `electron/main/db/` | SQLite setup, migrations, queries |
| `electron/main/storage/` | App data path resolution (portable vs. user data) |
| `docs/` | Plan, AI memory, README |
| `resources/` | Icons, assets, offline README |

## What the Project Is Not

- Not a cloud service or server-based app
- Not a team collaboration tool
- Not a calendar or scheduling application
- Not dependent on Windows Search, Everything, USN Journal, or admin rights
- Not capable of full file-content indexing (Phase 2 indexes names/paths only)

---

## Confirmed (from plan.md)

- ✅ Electron + React + TypeScript + Vite (electron-vite)
- ✅ SQLite (better-sqlite3) with WAL mode and FTS5 for file search
- ✅ Apple Liquid Glass UI design system
- ✅ Framer Motion for animations
- ✅ No admin rights required; no Windows services
- ✅ Portable EXE + per-user Setup EXE packaging via electron-builder, guarded by mandatory signing and post-package integrity checks
- ✅ Data location: `%LOCALAPPDATA%\SpotlightTodo\` by default; `PORTABLE_EXECUTABLE_DIR\SpotlightData` only when the wrapper directory is persistent and outside known OneDrive roots
- ✅ 12-phase implementation plan
- ✅ Approved scan scope: Desktop, Documents, Downloads, Pictures, Videos, Music + user additions
- ✅ Excluded: Windows, Program Files, node_modules, .git, system dirs

## Inferred

- 🔵 Vitest for unit tests, Playwright for E2E (typical electron-vite stack)
- 🔵 react-window or similar for virtualized lists
- 🔵 electron-builder for portable packaging

## Unknown / Needs Verification

- ❓ Global hotkey: always-on with system tray, or normal window?
- ❓ Target OS: Windows only, or cross-platform?
- ❓ Which phase to start + pause for review vs. execute all at once?
