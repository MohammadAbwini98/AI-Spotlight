# ARCHITECTURE.md — Confirmed Project Architecture

> **Last Updated**: 2026-07-22

## Runtime boundaries

```text
React renderer
  <-> sandboxed typed contextBridge/preload
Electron main process
  |- window/tray/hotkey and deny-by-default session lifecycle
  |- authorized/validated IPC and SQLite reads/Todo writes
  `- SyncCoordinator
       <-> Node worker thread
            |- filesystem traversal and watcher
            |- index comparison/batching
            |- synchronization SQLite writes
            `- checkpoint maintenance
```

`nodeIntegration` is disabled; `contextIsolation` and the Chromium sandbox are enabled. Renderer code has no direct filesystem access. The main process denies navigation, new windows, downloads, permission requests, webviews, non-top-frame IPC, and IPC from any WebContents other than the current application window.

## Important modules

| Module | Responsibility |
|---|---|
| `electron/main/index.ts` | App/window/tray lifecycle, single-instance lock, startup recovery |
| `electron/main/window-shortcuts.ts` | Primary/fallback global shortcut registration policy |
| `electron/main/renderer-protocol.ts` | Path-confined production renderer URL and asset resolution policy |
| `electron/main/indexer/sync-coordinator.ts` | Run IDs, duplicate/stale protection, worker lifecycle, crash recovery |
| `electron/main/indexer/sync-worker.ts` | Protocol, watcher queue, trust fallback, idle checkpoints |
| `electron/main/indexer/index-engine.ts` | Traversal, classification, adaptive work, reconciliation, persistence |
| `electron/main/indexer/sync.ts` | Public indexer facade and scan-root resolution |
| `electron/main/indexer/exclusions.ts` | Root minimization, validation, exclusions |
| `electron/main/db/database.ts` | Main SQLite connection, pragmas, migrations, interrupted-run recovery |
| `electron/main/storage/` | Portable/local path selection and legacy migration |
| `electron/main/ipc/` | Search, sync, settings, and Todo contracts |
| `electron/main/ipc/security.ts` | Active-window/top-frame authorization and channel-specific runtime validation |
| `electron/main/security/file-launch.ts` | Dangerous OS shell-launch extension policy |
| `electron/shared/` | Typed worker/IPC models |
| `src/features/` | Search, Todo, and Settings renderer features |
| `src/components/Icon/` | Theme-aware mask rendering for the selected Zappicon SVG assets |

## Index flow

```text
request/startup recovery -> coordinator run ID -> worker WAL connection
 -> opendir roots -> bounded stat metadata -> classify batch
 -> write meaningful changes + temporary seen paths
 -> trusted full run performs one set-based availability update
 -> persist exact counters once -> idle WAL maintenance
```

The main connection may execute short Todo/history/settings writes while the worker owns synchronization writes. WAL, bounded transactions, and `busy_timeout=5000` serialize writers safely while allowing concurrent readers.

## Incremental strategy

- Recursive Windows `fs.watch`, 750 ms debounce, maximum 10,000 coalesced paths.
- Directory metadata events caused by scanning are filtered after debounce.
- File, subtree, and missing-path targets run without a full traversal.
- Overflow/error, root/schema change, interrupted run, or restart removes trust and forces reconciliation.
- Watchers optimize latency; startup reconciliation restores correctness across downtime.

## Database and storage

- `better-sqlite3`, WAL, `synchronous=NORMAL`, foreign keys, 5-second busy timeout.
- Adaptive 8-64 MiB cache; worker membership temporary data is file-backed.
- Core tables include `files`, `files_fts`, `scan_sessions`, `sync_status`, `index_runtime`, settings, Todo, and migrations.
- Partial composite indexes cover the Recent and Frequent order/filter predicates so those synchronous main-process reads do not scan and sort the full file table.
- Resolution: explicit diagnostics override -> safe `PORTABLE_EXECUTABLE_DIR\SpotlightData` outside known OneDrive roots -> `%LOCALAPPDATA%\SpotlightTodo`.
- Legacy executable-adjacent and `%APPDATA%\SpotlightTodo` families are staged only when no target database exists. A successfully evacuated OneDrive-adjacent family is removed; other legacy sources remain rollback copies.
- Migration filenames must be a complete contiguous 001-010 sequence in both source and packaged resources. Migration 009 expands the persisted task workflow states; migration 010 adds rich-note format, plain-text, and Markdown projections while preserving legacy content.

## Note export flow

```text
In-place TaskNotesEditor -> sanitize + HTML/plain-text/Markdown projections
 -> serialized 500 ms note upsert or explicit task-transition flush
 -> validated preload/main IPC -> existing note record + tasks.notes FTS projection
 -> main process reads canonical Markdown projection -> native Save dialog
 -> main process writes the selected Markdown file
```

The renderer never receives a general-purpose path-write API and cannot choose a destination without the native user gesture.

`TaskNotesEditor` owns browser selection, contextual menus, slash commands, safe paste, and table editing inside the existing `NoteEditor` panel. `NoteEditor` owns task-bound draft serialization and ordered persistence so an older save cannot overwrite a newer task draft. Rich HTML is sanitized before DOM insertion and before persistence; plain text remains the search/indexing contract.

## Local AI assistant (dedicated chat, lazy runtime)

Spotlight search and the AI assistant are architecturally independent. Search
resolves through SQLite/FTS5 only; the AI runtime starts solely from explicit
AI interaction (opening AI Chat) and never during startup, search, Todo,
Settings, sync, or Recent Files use.

```text
React AiChatView (src/features/ai/)
  <-> sandboxed typed contextBridge/preload window.electronAPI.ai
Electron main process
  |- authorized/validated AI IPC (electron/main/ipc/ai.ipc.ts)
  `- AiRuntimeService (electron/main/ai/)
       |- model-resolver / model-validator (managed %LOCALAPPDATA%/SpotlightTodo/models)
       |- LlamaProcessManager (sole child_process.spawn owner, shell:false, 127.0.0.1 only)
       |- LlamaClient (OpenAI-compatible SSE streaming over loopback)
       `- AiSessionManager (ai_conversations/ai_messages, migration 011)
            <-> llama-server.exe (extraResource, outside app.asar)
                 <-> Gemma 4 12B GGUF (managed model dir, survives app upgrades)
```

| Module | Responsibility |
|---|---|
| `src/features/ai/AiChatView.tsx` | Dedicated chat screen orchestration, background ensureReady, 50 ms stream batching |
| `src/features/ai/AiChatHeader.tsx` | Back nav, model pill, conversation picker, new chat |
| `src/features/ai/AiConversation.tsx` | Transcript with stick-to-bottom autoscroll and polite completion announcements |
| `src/features/ai/AiMessage.tsx` | User/assistant bubbles, copy feedback, streaming caret |
| `src/features/ai/AiComposer.tsx` | Multiline input (Enter send, Shift+Enter newline, Escape stop) |
| `src/features/ai/AiRuntimeStatus.tsx` | Understandable runtime states, never a bare spinner |
| `src/features/ai/ai-markdown.ts` | Escape-first safe Markdown projection (no new dependency) |
| `electron/main/ai/ai-runtime.service.ts` | Lifecycle (ensureReady/generate/cancel/shutdown), single-generation policy |
| `electron/main/ai/ai-config.ts` | Centralized context/threads/sampling/timeout policy |
| `electron/main/ai/ai-errors.ts` | Structured error taxonomy plus UI messages |
| `electron/main/ai/ai-provider.ts` | AiProvider seam and MockAiProvider for tests |
| `electron/main/ipc/ai.ipc.ts` | Trusted handlers, 40 ms main-side delta batching, native GGUF import |
| `electron/shared/` AI types/channels | `AiRole/Message/ChatRequest/RuntimeStatus/TokenDelta/Completion/Conversation/ModelInfo`, `AI_*` channels |

Streaming flows `llama-server -> LlamaClient -> AiRuntimeService -> main IPC
(AI_CHAT_DELTA/COMPLETE/ERROR) -> preload -> React`. Stop cancels the
AbortController stream without unloading the model. Quit cancels generation,
closes the stream, and terminates llama-server with a bounded wait so no
orphan process remains. Only visible user/assistant text persists; reasoning,
KV cache, and diagnostics never do.
