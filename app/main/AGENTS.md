# Local Agent Rules — app/main (Electron Main Process)

> Also read: `../../AGENTS.md` and `../../docs/ai/ARCHITECTURE.md` before editing this folder.

---

## Scope

This folder contains the **Electron main process** code responsible for:

- App lifecycle (startup, quit, auto-launch)
- Global keyboard shortcut registration (`globalShortcut`)
- System tray icon and context menu (`Tray`)
- `BrowserWindow` creation and management
- IPC handler definitions (`ipcMain.handle`, `ipcMain.on`)
- File system access and task persistence (via `../../src/` modules)

---

## Required Reading

Before editing this folder:

- `../../AGENTS.md`
- `../../docs/ai/ARCHITECTURE.md` — data flow and IPC contracts
- `../../docs/ai/RULES.md` — Electron security rules
- `../../docs/ai/KNOWN_ISSUES.md` — fragile areas

---

## Local Rules

1. **Only native APIs here.** `app/main` is the sole owner of `globalShortcut`, `Tray`, `BrowserWindow`, `dialog`, and file I/O.
2. **Validate all IPC inputs.** Never trust data received from the renderer. Validate type and range before processing.
3. **All storage operations use `src/`.** Do not implement storage logic inline in main process files — import from `../../src/`.
4. **Document IPC channels.** Every new `ipcMain.handle` or `ipcMain.on` must be reflected in `../../docs/ai/ARCHITECTURE.md`.
5. **Security settings.** New `BrowserWindow` instances must use `contextIsolation: true` and `nodeIntegration: false`.
6. **Never hardcode secrets.** Use environment variables.
7. **Error handling.** All IPC handlers must return a structured error object on failure — never let errors propagate unhandled to the renderer.

---

## Testing / Verification

- Unit test IPC handlers in `../../tests/` where possible
- Manually verify: app starts, tray appears, hotkey opens overlay, window hides on Escape
- See `../../docs/ai/TESTING.md` for the full manual checklist

---

## Do Not Break

- Global hotkey registration
- Window show/hide behavior
- IPC handlers relied on by the renderer
- Tray context menu functionality

---

## Update Requirements

After changes to this folder, update:

- `../../docs/ai/ARCHITECTURE.md` if IPC contracts or module structure changed
- `../../docs/ai/CURRENT_STATE.md` if app behavior changed
- `../../docs/ai/TASK_LOG.md` always
