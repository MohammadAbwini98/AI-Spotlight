# FEATURES.md — Confirmed DeepDive Feature Inventory

> **Last Updated**: 2026-09-12

## Desktop shell and design

- Electron frameless, transparent, always-on-top Spotlight window with no Windows thick frame, system backdrop, caption, native shadow, or renderer-drawn exterior shell halo.
- Secure same-origin `spotlight://renderer` asset loading for production and packaged React/CSS modules while Chromium web security remains enabled.
- Recoverable system tray and Ctrl+Space global Spotlight shortcut, with automatic Ctrl+Shift+Space fallback when the primary combination is occupied.
- Persistent search-surface visibility across normal focus changes; clicking another application does not implicitly dismiss DeepDive.
- Compact-to-expanded Liquid Glass Search, Todo, Create Task, and Settings workspaces.
- System/light/dark themes; OS/app-aware reduced motion; reduced transparency and increased-contrast materials; accessible control labels; and verified Arrow Up/Down search navigation with bidirectional automatic result-list scrolling.
- Theme-aware compact Spotlight search and action materials, including dark translucent capsules with light text/icons.
- Focus-responsive compact Spotlight behavior: inactive search fills the shell and hides secondary actions, then restores them with a restrained critically damped spring when focused.
- A static compact Sync icon during active synchronization, with preserved disabled and screen-reader status feedback.
- Critically damped Liquid Glass motion, preserved sequential screen choreography, a bottom-anchored task sheet, isolated result rendering, and compositor-aware animation surfaces.
- Theme-aware Zappicon controls and file-type glyphs with a documented third-party asset notice.

## File search and synchronization

- SQLite metadata index with external-content FTS5.
- Exact-name, prefix, BM25, and open-frequency ranking with bounded FTS candidates.
- Recent/frequent entries, favorites/history fields, Explorer operations, availability filtering, result limits, and stale request IDs.
- Categorized results for folders, documents, apps, compressed files, photos, videos, audio, and other files, with accessible per-category expand/collapse controls and keyboard selection limited to visible rows.
- Prefetched Recent/Frequent panel data with indexed, main-process-safe ordered lookups; result activation uses the history-aware open operation and refreshes the panel immediately.
- Worker-thread initial scan, targeted incremental updates, trusted reconciliation, pause/resume/cancel, canonical progress, and persistent counters.
- Duplicate/nested-root removal; persisted-root revalidation; protected/system/cache/build/temp exclusions; relative/UNC/device/whole-drive/sensitive-profile rejection; junction/symlink protection.
- Adaptive transactions/stat work, throttled progress, bounded watcher queue, set-based reconciliation, and idle WAL truncation.
- Active database/data-path exclusion and silent background incremental runs prevent sync feedback loops and visible spinner churn.
- Startup, schema/root-change, watcher-loss, and interrupted-session recovery.

## Todo and settings

- Lists, task search, five-state workflow status, priority, due dates, tags, notes, sorting, and local persistence.
- Left-aligned list headers with total, active, completed, and dropped statistics; task-list sidebar glyphs; neutral native status-menu options; 40-character list names; and 120-character task titles with live counters and trusted IPC validation.
- An in-place rich Task note inspector that covers the task canvas up to the persistent list sidebar, closes on an outside pointer press, flushes before task/list navigation, and never opens a separate editor experience.
- Contextual Liquid Glass selection, caret/block, slash-command, color/highlight, link, and table menus with boundary-aware positioning, keyboard navigation, and reduced-motion/transparency/contrast fallbacks.
- Rich note headings; bold, italic, underline, and strikethrough; adaptive text colors; six highlights; bulleted, numbered, lowercase/uppercase alphabetical and nested lists; and editable/resizable tables with contextual row, column, merge, split, and delete actions.
- Dual-format rich clipboard output for Outlook/Excel (`text/html` and table-aware `text/plain`), safe HTML paste, and TSV-to-editable-table conversion at the current caret.
- Automatic system-time task start timestamps, no end-date requirement during creation, and persisted end timestamps when tasks first enter Completed or Dropped; dark-mode Create Task menus retain readable native option colors.
- Notes copy to the system clipboard and export through a validated main-process save dialog as Markdown.
- Appearance and Todo preferences.
- Grouped Settings controls, keyboard-visible Todo actions, semantic task-opening controls, and a focus-contained Create Task dialog.
- Settings has explicit loading and IPC-error surfaces instead of rendering an empty transparent workspace.
- Scan-root get/add/remove/reset with native folder selection and validation.
- Index statistics, sync status, and active database-location diagnostics.
- Recent/frequent files panel with an explicit accessible Back action.
- Main-process runtime validation, top-frame authorization, and renderer-writable settings whitelisting for every privileged IPC operation.

## Local AI assistant

- Dedicated AI action button (sparkles glyph) first in the compact Spotlight actions; opens a full AI Chat screen without changing search input behavior.
- App navigation is `search | ai | todo | settings`; AI reuses the 640px workspace height so no new native geometry case exists.
- Streaming local responses with Stop/restart, retry, new chat, conversation picker, persisted history (migration 011), assistant copy, code blocks, safe Markdown, multiline composer, stick-to-bottom autoscroll, empty/error/setup states, and keyboard map (Enter send, Shift+Enter newline, Escape stop/back).
- Generation-phase status: Thinking/Responding pill states (additive `AiRuntimeStatus.phase`, 1.5 s refresh while generating, aria-live announcement, Stop preserved) report long hidden-reasoning generations without showing, persisting, or streaming reasoning content and without fake progress.
- Lazy llama.cpp runtime: starts only from AI Chat, stays loaded between prompts, survives window hiding, terminates on quit; single concurrent generation; bounded CPU threads with renderer/indexing reserve.
- Gemma 4 12B Q4_K_M manifest (`resources/ai/model-manifest.json`, no fabricated checksum); model resolved from explicit override or managed `%LOCALAPPDATA%\SpotlightTodo\models`, validated before launch, importable offline through a native dialog.
- Settings AI section: model, runtime status, model path, trusted model selection.
- Search/AI privacy separation: search uses SQLite only; the model receives only explicitly submitted text.
- Real-model verified on this workstation (llama-server b10909, Gemma 4 12B Q4_K_M, 15/15 qualification + 12/12 packaged E2E): streaming, Stop/reuse, multi-turn, Unicode, Markdown/code, persistence, restart reload, cascade delete, malformed-IPC rejection, runtime/model-unavailable states, crash recovery, and quit hygiene with no orphan processes.
- Offline-by-construction: zero runtime public-network URLs in main/preload/renderer production bundles; loopback-only AI traffic; model import works from local disk.

## Storage and packaging

- SQLite WAL database with automatic versioned migrations.
- `%LOCALAPPDATA%\SpotlightTodo` default, with `PORTABLE_EXECUTABLE_DIR\SpotlightData` only for persistent portable locations outside known OneDrive roots.
- Staged SQLite-family migration from legacy executable/roaming storage; cloud-adjacent sources are removed after verified publication.
- Electron sandbox, blocked navigation/windows/downloads/permissions, dangerous-file launch denial, and hardened Electron fuses.
- A guarded, versioned electron-builder release workflow for signed Windows Portable and per-user Setup executables; unsigned builds fail, both distributables are required and signature-checked, packaged migrations are checked, native AI-runtime dependencies are import-scanned against the pinned `vc-runtime.json` provenance (pre-packaging and against the packaged payload), and release files receive a SHA-256 inventory.
- DeepDive-branded executable, Portable, Setup, installer shortcuts, tray text, and certificate artifacts, with `resources/icon.svg` retained as the canonical artwork and generated ICO/PNG formats used at Windows package/runtime boundaries.
- A separate private multi-machine release mode with a non-exportable `DeepDive Local Use` build-machine key, Current User trust, signed local-use executables, and a public-only `.cer` plus explicit trust instructions for other personally controlled Windows accounts.
- Packaged window recovery registers independently of tray setup; a built-in tray-image fallback and second-instance reveal keep the taskbar-hidden overlay reachable.

## Not fully verified

- Public-certificate and clean-machine Portable/Setup runtime (VC++ redist decision CLOSED in source: app-local bundle + gate; clean-machine execution still pending).
- Portable wrapper code-2 on this workstation — not reproduced in 8/8 local conditions; classified environment-specific pending clean-machine confirmation.
- Full SQLite encryption at rest and key recovery.
- One-million-file execution on this workstation.
- OneDrive/network/ACL/storage-full hardware and environment scenarios.
- Direct Outlook and Excel clipboard testing across supported Office versions and themes.
