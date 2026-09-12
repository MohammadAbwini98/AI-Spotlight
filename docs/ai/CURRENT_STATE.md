# CURRENT_STATE.md — Live Project Status

> **Last Updated**: 2026-09-12

## Current status

DeepDive (repository: Spotlight-Todo) is a working Electron 43/React desktop application with SQLite/FTS5 file search, Todo lists/tasks/notes, settings, hardened portable/local data-path handling, system tray/global shortcuts, and the Liquid Glass overlay UI. Source is version-controlled on `main` and pushed to `git@github.com:MohammadAbwini98/AI-Spotlight.git`.

A dedicated local AI chat (`search | ai | todo | settings`) is implemented against a lazy llama.cpp runtime configured for Gemma 4 12B Q4_K_M — and it is now REAL-MODEL + PACKAGED verified on this workstation: official llama-server b10909, 7.38 GB Q4_K_M GGUF, 15/15 real-model qualification tests, 12/12 packaged CDP-driven E2E gates, release signatures/migrations/SHA-256 valid. Runtime binaries and the GGUF are provisioned locally and gitignored, never committed.

## Confirmed working

- Production main, preload, worker, and renderer bundles build with `npm run build`.
- Node and renderer TypeScript projects pass through `npm run typecheck`.
- Vitest regression suite passes with 87 tests across 20 files.
- Real SQLite worker integration passes initial, unchanged, changed, deleted, restored, warning, cancelled, and failed lifecycles.
- Synchronization traversal and index writes run in `sync-worker.js`, not Electron's main thread.
- Canonical states and exact per-run counters persist in `scan_sessions` and `sync_status`.
- Full scans avoid rewriting unchanged `files`/FTS rows and use set-based availability reconciliation.
- A bounded Windows watcher processes targeted changes and falls back to reconciliation when untrusted.
- The active database/data directory is excluded from traversal and watcher events, preventing self-triggered sync loops; automatic watcher runs remain silent in the visible sync UI.
- `%LOCALAPPDATA%\SpotlightTodo` is the default non-roaming store. Portable wrappers use `PORTABLE_EXECUTABLE_DIR` only outside known OneDrive roots; previous cloud-adjacent database files are evacuated after a verified staged copy.
- Renderer sandboxing, restrictive navigation/window/download/permission policies, top-frame IPC authorization, runtime argument bounds, and settings whitelisting are enabled.
- Persisted/environment scan roots are revalidated; relative, UNC/device, whole-drive, system, entire-profile, AppData, `.ssh`, and `.gnupg` roots are rejected.
- Executables, scripts, shortcuts, installers, registry files, and `.url` files are blocked from `shell.openPath`; Show in Explorer remains available.
- Electron 43.1.0, better-sqlite3 12.11.1, electron-builder 26.15.3, electron-vite 5.0.0, Vite 7.3.6, and Vitest 4.1.10 are installed; full `npm audit` reports zero vulnerabilities.
- Development tooling pins a local Node 22.12 runtime, so npm scripts do not accidentally execute Vite 7 with an older global Node installation; the development launcher also removes an inherited `ELECTRON_RUN_AS_NODE` override before Electron starts.
- Release builds require Node 22.12+, Authenticode signing, hardened Electron fuses, complete packaged migrations, and a SHA-256 release inventory. The old unsigned release is quarantined.
- The guarded release orchestrator produces versioned `DeepDive` Portable and per-user Setup executables under product-specific release directories, validates both artifacts, and refuses to replace an existing version directory unless `--force` is explicit; its non-mutating dry run is verified.
- Public release packaging now checks for externally configured signing credentials before deleting output or running the build. Private/self-signed Local Use and test certificates are excluded, and the error directs personal builds to `npm run release:local`.
- A separate private-use workflow creates or reuses a non-exportable Current User `DeepDive Local Use` signing key, locally trusts its public certificate, signs both distributables, and exports only `DeepDive-Local.cer` plus installation instructions under `release/local/DeepDive/<version>/`. The complete DeepDive 1.0.0 local release passed signature, migration, icon, product-metadata, and SHA-256 verification.
- Windows packaging now has a transparent 32-bit product icon with dedicated 16, 24, 32, 48, 64, 128, and 256 px frames; the runtime tray uses the matching 256 px PNG instead of its embedded fallback.
- `resources/icon.svg` is the canonical DeepDive artwork; Windows packaging uses its generated multi-resolution ICO and the BrowserWindow/tray use its generated PNG while preserving the existing app ID and data locations for upgrade compatibility.
- DeepDive 1.0.1 is the signed private patch release containing the persistent-on-focus-loss search-window behavior; its Portable and Setup artifacts passed signature, migration, packaged-code, and SHA-256 verification.
- Settings displays the active database directory.
- The production Electron bundle completed a 100,000-file walkthrough while search, Todo, navigation, window movement, and rendering remained responsive.
- Compact Spotlight chrome remains transparent and uses distinct reference-matched light and dark glass materials for the search capsule, buttons, text, and icons.
- The inactive compact Spotlight state hides secondary actions and lets the search capsule spring smoothly across the available shell width; focusing the search restores the action controls.
- The compact Sync button remains visually static during synchronization while retaining its disabled state and accessible syncing label.
- The Windows shell disables the system backdrop, native shadow, thick frame, caption, and rounded non-client frame. Outer application surfaces draw no exterior CSS shadow; unused renderer pixels remain fully transparent while inset glass highlights remain.
- Recent Files includes an accessible Back action that restores the compact Spotlight view.
- Arrow Up/Down selection keeps the active search result visible, reaches the true top/bottom boundaries, and cannot be overridden by pointer-entry events caused by scrolling content beneath a stationary cursor.
- Ctrl+Space is the primary global Spotlight toggle. If Windows reports it as occupied, Ctrl+Shift+Space is registered automatically and the tray explains the fallback; Ctrl+P is not intercepted.
- Moving focus outside DeepDive no longer hides or minimizes the search surface. Visibility changes require an explicit Ctrl+Space toggle, compact-search Escape, tray/quit action, or application close action.
- The packaged overlay registers its shortcut before optional tray setup, uses a built-in visible tray image when the packaged icon is absent, and clears delayed blur work before reveal.
- Production renderer assets load through the privileged, same-origin `spotlight://renderer` protocol instead of cross-origin `file://` module requests. The rebuilt signed Portable executable was visually verified with React, CSS, window focus, and its complete compact UI rendered at 200% display scaling.
- Privileged IPC accepts only the trusted `spotlight://renderer` top frame (or the explicit development origin). Settings now loads normally in the signed Portable, and a visible loading/error panel prevents an IPC failure from appearing as a transparent crash.
- Motion properties are owned by Framer Motion without competing CSS transitions; the original root layout morph and sequential screen exit/entrance choreography are preserved.
- Non-gesture UI motion uses critically damped springs, and the in-app/OS Reduced Motion preferences now govern Framer Motion as well as CSS animations while retaining gentle opacity feedback.
- Create Task is a bottom-anchored, spatially symmetric sheet with a full-workspace focus scrim, persistent primary action, labeled fields, contained keyboard focus, Escape dismissal, and focus restoration.
- Settings uses grouped material surfaces with higher text contrast, accessible control names, visible keyboard focus, and solid/high-contrast fallbacks; hover-only Todo actions are also exposed on keyboard focus.
- High-frequency sync progress updates no longer rerender unchanged search controls or result rows, and major animated surfaces receive targeted compositor/layout hints.
- Recent/Frequent data is prefetched and cached in the persistent Search view, both lookups use ordered partial indexes, and the native window is sized before the Recent transition begins. Selecting a result now opens it through the history-aware IPC path and immediately refreshes Recent/Frequent data.
- Search results are grouped into stable keyboard-navigable Spotlight categories, each category can be expanded or collapsed with an accessible disclosure control, and hidden groups are excluded from Arrow/Home/End selection. Results use extension-aware Zappicon glyphs, including dedicated PDF, archive, image, video, audio, app, document, and folder treatments.
- Todo includes task filtering and five persisted workflow states: Pending, In Progress, Follow-Up, Completed, and Dropped.
- Todo list names are limited to 40 characters, task titles to 120 characters, and both creation surfaces expose live character counts backed by main-process validation.
- The selected Todo list header is left-aligned beside Search navigation and reports total, active, completed, and—when applicable—dropped counts. Sidebar lists use the task-list glyph. The note editor expands across the task canvas up to the persistent list sidebar and dismisses on an outside pointer press.
- Native task-status menus keep unselected options at neutral system text/background colors while the closed control retains the selected status accent.
- Create Task shows the current system date/time as its automatic start date, no longer asks for an end date, and records the first Completed or Dropped transition as the persisted end timestamp. Priority and reminder menus retain readable native option colors in dark mode.
- Task notes expose copy feedback and a trusted native Markdown export flow; the renderer still has no direct filesystem access.
- Task notes are now rich-text capable inside the existing Task page panel. Contextual selection/block/slash menus provide headings, inline styles, adaptive colors/highlights, nested lists, links, and editable tables without adding a route, window, dialog, or permanent word-processor toolbar.
- Rich notes persist sanitized HTML in the existing note record, preserve a Markdown export projection, and mirror readable plain text into the existing FTS-backed `tasks.notes` field. Serialized saves and an imperative flush prevent stale debounces from crossing task boundaries.
- Rich table clipboard handling emits `text/html` plus tab-separated `text/plain`, accepts safe HTML tables and TSV pastes, and keeps table actions contextual to the active cell.
- Dedicated AI Chat view (`ai` route) with background startup, streaming responses, Stop, retry, new/persisted conversations, copy, safe Markdown, multiline composer, and model-missing import UX; search never starts the runtime.
- Loopback-only lazy llama.cpp lifecycle (ensureReady/generate/cancel/shutdown) with single-generation CPU policy, bounded health polling, crash-to-error recovery, and quit-time termination.
- Main-process GGUF resolution/validation (explicit path, managed `%LOCALAPPDATA%\SpotlightTodo\models`, manifest match, optional SHA-256) and native trusted model import.
- Settings AI section reports model, runtime status, and model path with a trusted Select control.
- Real-model qualification (i7-4980HQ/8 threads/32 GB RAM, llama-server b10909, `gemma-4-12B-it-Q4_K_M.gguf` 7.38 GB): cold start 11-51 s, first visible token ~27 s (extensive reasoning preamble), steady decode ~2.6 tok/s (llama-bench tg64), model-loaded RSS ~14.8 GB, cancel ~16 ms, shutdown ~1 s with zero orphan processes.
- Packaged signed Portable/Setup produced via `release:local`; unpacked payload verified end-to-end over CDP (search isolation, chat open, streamed assistant reply persisted to SQLite, graceful exit 0, no orphan server).

## Synchronization performance (100,000 real files)

- Cold initial scan: 44.85 s, 2,238 entries/s.
- Warm no-change reconciliation: 5.62 s, 100,400 rows unchanged and zero file-row rewrites.
- Targeted one-file edit/delete: 99 ms / 188 ms.
- Cancellation acknowledgement: 0.64 ms.
- Stress-harness ranked search: 68.8 ms average, 185.6 ms maximum.
- Production UI search: 22.2 ms average, 70.3 ms maximum over 254 samples.
- Production renderer maximum frame gap: 16.8 ms.
- Real 236,276-row Recent/Frequent lookups: approximately 204-208 ms each before migration; below 1 ms each with migration 008.
- WAL after the idle truncate checkpoint: 0 bytes.

See `docs/SYNCING_AND_STORAGE_REPORT.md` and the JSON files under `artifacts/`.

## Known gaps

- The deterministic 1,000,000-file profile exists but was not run on this workstation.
- The private signed Portable executable is runtime-verified on this build account; the public certificate-backed release and a clean-machine offline run remain unverified.
- ACL-denied folders, offline OneDrive placeholders, slow/network disks, and disk-full behavior require environment-specific testing.
- Recursive watcher behavior is validated for Windows, not every Electron-supported platform.
- Transparent BrowserWindow height changes can still produce an occasional compositor frame outlier depending on the Windows/GPU combination; renderer animation probes otherwise remain at refresh cadence.
- SQLite remains plaintext. Full at-rest encryption requires an encrypted SQLite engine and key-recovery design; release consumers currently rely on the local Windows account ACL and device encryption.
- This workstation's 10.0.19041 SDK directories are incomplete; the Electron 43 native addon was verified by explicitly retargeting MSBuild to the installed 10.0.22621 SDK.
- Outlook and Excel clipboard interoperability is implemented with safe standard HTML tables and TSV fallback, but direct application/version matrix testing remains environment-specific and unexecuted on this workstation.

## Do not break

- File metadata only; never index or upload file contents.
- Todo, favorites, availability, open history, and settings must remain in the same migrated database.
- Renderer filesystem access remains prohibited; native operations use the typed preload bridge.
- Cancelled, failed, or incomplete scans must never globally mark unseen records unavailable.
- Search, Todo, navigation, hotkey, tray, and window interaction must remain available during synchronization.
