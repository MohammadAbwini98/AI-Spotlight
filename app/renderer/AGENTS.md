# Local Agent Rules — app/renderer (Electron Renderer / UI)

> Also read: `../../AGENTS.md` and `../../docs/ai/ARCHITECTURE.md` before editing this folder.

---

## Scope

This folder contains the **Electron renderer process** — the entire UI layer of the app:

- Spotlight-style task input overlay
- Task list display and interaction
- Search / filter UI
- Keyboard navigation
- IPC calls to the main process (via contextBridge / preload)

---

## Required Reading

Before editing this folder:

- `../../AGENTS.md`
- `../../docs/ai/ARCHITECTURE.md` — IPC contracts and data flow
- `../../docs/ai/RULES.md` — UI and architecture rules
- `../../docs/ai/FEATURES.md` — feature inventory

---

## Local Rules

1. **No direct native API access.** The renderer must never use `require('fs')`, `require('electron')`, or any Node.js API directly. All native operations go through the IPC bridge.
2. **IPC only.** Communicate with the main process exclusively via `window.electronAPI` (contextBridge) or the established IPC pattern.
3. **Follow existing component structure.** Do not introduce new UI frameworks or component systems without explicit instruction.
4. **Keyboard-first.** All interactive elements must be keyboard-accessible. The app must be fully usable without a mouse.
5. **Performance.** The overlay must open without visible lag (< 200ms).
6. **Style consistency.** Follow the existing CSS/styling approach. Do not mix styling systems (e.g., adding Tailwind if the project uses vanilla CSS).
7. **No hardcoded data.** All task data comes from the main process via IPC — never hardcode sample tasks in production UI.

---

## Testing / Verification

- Manually test all user-facing flows after UI changes
- Verify keyboard navigation works throughout the app
- Verify that task creation, completion, and deletion work end-to-end
- See `../../docs/ai/TESTING.md` for the full manual checklist

---

## Do Not Break

- Task creation and submission flow
- Keyboard shortcut handling within the UI (Enter to add, Escape to close, arrow keys to navigate)
- IPC calls to the main process (do not rename channels without updating main)
- Dark mode / visual theme consistency

---

## Update Requirements

After changes to this folder, update:

- `../../docs/ai/FEATURES.md` if UI features changed
- `../../docs/ai/ARCHITECTURE.md` if IPC usage or component structure changed
- `../../docs/ai/CURRENT_STATE.md` if app behavior changed
- `../../docs/ai/TASK_LOG.md` always
