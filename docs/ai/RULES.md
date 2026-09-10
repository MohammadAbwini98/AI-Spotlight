# RULES.md — Non-Negotiable Project Rules

> These rules apply to all AI agents and human developers working in this repository.
> Rules are derived from project structure and standard Electron best practices.
> Rules marked ❓ must be verified and refined once application code exists.

---

## Non-Negotiable Rules

1. **Never hardcode secrets.** All API keys, tokens, passwords, and credentials must be in environment variables or a `.env` file that is `.gitignore`d.
2. **Never bypass IPC.** The renderer must never access native APIs directly — all native operations go through the IPC bridge to the main process.
3. **Task data integrity.** Never write directly to the storage layer from the renderer. Always route through IPC → main → `src/storage`.
4. **Minimal diffs.** AI agents must not refactor code unrelated to the current task.
5. **No invented features.** Do not add product features not requested by the user.
6. **Update memory after every task.** `CURRENT_STATE.md` and `TASK_LOG.md` must be updated after every agent task.

---

## Coding Style Rules

> ❓ Verify exact style config once code exists (`.eslintrc`, `.prettierrc`, `tsconfig.json`).

- Use **TypeScript** for all new files (inferred from `.spec.ts` pattern) 🔵
- Use **consistent naming**: `camelCase` for variables/functions, `PascalCase` for classes/types
- Keep functions small and single-purpose
- Prefer `const` over `let`; avoid `var`
- Add JSDoc comments for exported functions and complex logic
- Do not leave `console.log` statements in production code

---

## Architecture Rules

- `app/main` owns all native Electron APIs: `globalShortcut`, `Tray`, `BrowserWindow`, file I/O
- `app/renderer` owns all UI rendering and user interaction
- `src/` owns all shared business logic, data models, and storage utilities
- IPC channel names must be documented and consistent
- Do not mix renderer and main process logic in the same file

---

## API Contract Rules (IPC)

- IPC channel names must be descriptive and documented in `docs/ai/ARCHITECTURE.md`
- Changing an IPC channel name is a **breaking change** — update both sides
- IPC handlers must validate inputs before processing
- ❓ Preload/contextBridge API surface must be documented once code exists

---

## Database / Storage Rules

- All task reads and writes go through the `src/storage` module
- Storage operations must be atomic where possible (avoid partial writes)
- Do not delete tasks without user confirmation
- ❓ If SQLite is used, add a migration for every schema change

---

## UI Rules

- The overlay window must open instantly (< 200ms perceived delay) 🔵
- All interactive elements must be keyboard-accessible
- The app must be usable without a mouse
- Dark mode support is expected (Spotlight-style aesthetic)
- Do not add new UI frameworks without explicit instruction

---

## Logging Rules

- Use structured logging (not bare `console.log`) in main process 🔵
- Never log sensitive user data (task content that may be private)
- Log errors with enough context to debug without reproduction steps

---

## Error Handling Rules

- All IPC handlers must catch errors and return a structured error response to the renderer
- Storage failures must not crash the app — show a user-friendly error instead
- Unhandled promise rejections must be caught

---

## Dependency Rules

- Do not add new npm dependencies without a documented reason
- Prefer smaller, well-maintained packages
- Avoid packages with known security vulnerabilities (run `npm audit` periodically)

---

## Documentation Rules

- Keep `docs/ai/` files updated after every agent task
- Never copy secrets into documentation
- Mark all inferences clearly with 🔵 and unknowns with ❓
- Do not document invented or assumed features as confirmed facts
