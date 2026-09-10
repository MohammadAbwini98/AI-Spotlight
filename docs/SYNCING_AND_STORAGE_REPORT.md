# Spotlight-Todo File Synchronization, Storage, and Performance Report

**Validated:** 2026-07-13 on Windows, Electron 43.1, Node 22.12 toolchain, SQLite/FTS5 via `better-sqlite3` 12.11

## Executive summary

Spotlight-Todo now performs filesystem traversal and index writes in a dedicated Node worker thread. Electron's main process coordinates the run, serves short IPC requests, and keeps the window, Todo workspace, navigation, and search responsive. The index stores filesystem metadata only; it does not open, copy, parse, or upload file contents.

The design uses three synchronization layers:

1. A full initial scan establishes a trusted baseline.
2. A bounded `fs.watch` queue processes targeted changes while the application is running.
3. A full set-based reconciliation runs after startup, after schema/root changes, and whenever watcher trust is lost.

Unchanged file rows are not rewritten. A temporary path-membership table supports one set-based availability update after a successful, error-free full traversal. Cancelled, failed, or incomplete scans never perform global unavailability reconciliation.

## Root causes in the previous implementation

- Traversal and synchronous `better-sqlite3` write transactions ran in Electron's main process.
- Every discovered row was upserted, changing scan bookkeeping and `indexed_at` even when metadata was unchanged.
- A fixed 250-row batch and fixed delays could not adapt to the current disk or transaction latency.
- Runtime status could persist `success`, while the database allowed only `running`, `complete`, `cancelled`, and `failed`.
- Final progress and persistent statistics did not preserve all per-run counters.
- Removed counts could represent cumulative unavailable records instead of records newly made unavailable in one run.
- Manual synchronization always performed an O(N) traversal.
- `%APPDATA%` (roaming data) was used despite the documented `%LOCALAPPDATA%` fallback policy.
- The old Windows watcher model was absent, so downtime, root changes, and watcher loss had no explicit recovery path.
- Broad ranked FTS searches could monopolize the main process longer than the responsiveness target.
- Passive checkpoints made frames reusable but could leave a physically large WAL file allocated.

## Architecture before and after

### Before

```text
Renderer -> IPC -> Electron main
                    |- opendir/stat traversal
                    |- synchronous SQLite upserts
                    |- per-scan reconciliation
                    `- progress events
```

### After

```text
Renderer -> typed IPC -> main-process SyncCoordinator
                              |
                              v
                     dedicated sync worker
                     |- streaming traversal
                     |- bounded adaptive stat work
                     |- worker-owned index transactions
                     |- temporary seen-path table
                     |- set-based reconciliation
                     |- watcher queue/recovery
                     `- idle WAL maintenance

Renderer <- throttled progress <- coordinator
Search   -> bounded FTS candidates -> main read connection (WAL snapshot)
Todo     -> short main-process transactions
```

The coordinator rejects duplicate runs, creates unique run IDs, ignores stale worker events, acknowledges cancellation immediately, and marks an active session failed if the worker exits unexpectedly. On the next application start, unfinished sessions are finalized as failed and a trusted reconciliation is scheduled.

## Files changed

- Worker architecture: `electron/main/indexer/index-engine.ts`, `sync-worker.ts`, `sync-coordinator.ts`, `sync.ts`, and `exclusions.ts`; the obsolete `scanner.ts` was removed.
- Contracts/build: `electron/shared/types.ts`, `sync-protocol.ts`, `ipc-channels.ts`, `electron/preload/index.ts`, and `electron.vite.config.ts`.
- Main/IPC/search: `electron/main/index.ts`, `ipc/indexer.ipc.ts`, `ipc/settings.ipc.ts`, `ipc/search.ipc.ts`, and the existing duplicate type import in `ipc/todo.ipc.ts` was removed.
- Database/storage: `electron/main/db/database.ts`, migrations 006/007, `electron/main/storage/paths.ts`, and `data-path-policy.ts`.
- Renderer: `SearchView.tsx`, `SyncStatusBar.tsx` and its styles, `SettingsView.tsx` and its styles, plus TypeScript-cleanup changes in `RecentFrequentSection.tsx` and `TaskList.tsx`.
- Validation/tooling: `package.json`, `tsconfig.web.json`, `src/vite-env.d.ts`, three new Vitest specs, and the sync integration/benchmark/runtime scripts under `scripts/`.
- Documentation: this report and the refreshed files under `docs/ai/`.

## Database migrations

- **006_sync_engine.sql** replaces the legacy session constraint with canonical modes/states, preserves legacy rows, adds all per-run counters, extends `sync_status`, and adds `index_runtime`.
- **007_sync_reconciliation.sql** adds the case-insensitive normalized-name index, records index schema version 2, and forces one trusted reconciliation after the indexing upgrade.

Both migrations run inside the existing migration transaction and do not delete file, Todo, favorites, history, settings, or note data.

## What is indexed and stored

The `files` table stores:

- normalized and display paths;
- file or directory name;
- parent path and entry type;
- extension;
- byte size;
- creation and modification timestamps where supplied by Windows;
- availability state;
- index timestamp;
- favorites and open-history fields.

The `files_fts` FTS5 table indexes name, normalized name, and display path. Selective triggers update FTS only when searchable fields change. Availability, scan statistics, and open-history bookkeeping do not rebuild FTS rows.

No file-content read API is used by the index engine. Traversal uses `opendir`, `Dirent`, `lstat`, and `stat` metadata operations. Symbolic links and junctions are not followed.

Todo lists, tasks, tags, notes, settings, migration history, scan sessions, and the current sync summary live in the same local SQLite database so they move together and cannot silently diverge into separate indexes.

## Database location and migration

Resolution order is:

1. An explicit absolute diagnostics override, when supplied by the runtime test harness.
2. `PORTABLE_EXECUTABLE_DIR\SpotlightData` when a portable wrapper explicitly supplies a persistent directory outside known OneDrive roots.
3. `%LOCALAPPDATA%\SpotlightTodo` on Windows.

The raw executable directory is never treated as a persistent portable location because one-file launchers can unpack it under a temporary directory. Previous executable-adjacent and `%APPDATA%\SpotlightTodo` databases are discovered before creating a new local database. `spotlight.db`, `spotlight.db-wal`, and `spotlight.db-shm` are copied through a staging directory, with the main database exposed last. A successfully migrated OneDrive-adjacent source family is removed on a best-effort basis; other legacy sources remain rollback copies. A single-instance lock reduces the risk of copying while another Spotlight-Todo process is active. Settings displays the active database directory.

## Synchronization lifecycle and canonical states

The shared TypeScript model and database constraint use:

```text
idle -> preparing -> scanning -> reconciling -> complete
                    |    |             |          `-> complete_with_warnings
                    |    `-> paused
                    `-> cancelling -> cancelled
any active state ---------------------> failed
```

Each session persists discovered, added, updated, unchanged, newly unavailable, restored, skipped, excluded, errors, directories visited, files visited, represented bytes, duration, and cancellation request state. Terminal persistence is guarded by `finished_at IS NULL`, so one session can be finalized only once.

## Initial and full reconciliation

The worker streams roots with `fs.opendir()` and never builds a complete in-memory file list. Duplicate roots and children already covered by a parent root are removed before traversal. Whole drives, protected Windows locations, caches, dependency/build folders, temporary extensions, symlinks, and junctions are excluded.

Each batch loads existing rows by normalized path and classifies entries as new, changed, unchanged, or restored. Only new, changed, and restored rows are written to `files`. Every observed path is placed in a temporary `WITHOUT ROWID` membership table. After a fully successful traversal, one set-based query marks currently available rows absent from that table as unavailable.

Any root, directory, or metadata access error makes global reconciliation unsafe. The run completes with warnings and preserves unseen records. Cancellation and exceptions also skip global reconciliation.

## Incremental tracking and recovery

Windows recursive `fs.watch` runs inside the worker and keeps a maximum of 10,000 coalesced paths. Events are debounced for 750 ms. Duplicate file and parent events are deduplicated before writing.

Windows emits directory `change` events when a scan merely reads directory metadata. After debounce, the worker filters those directory-only metadata events while preserving file changes and every rename/create/delete event. This prevents the scanner from triggering itself continuously.

The active SQLite data directory is excluded from both traversal and watcher callbacks. This is essential in development/portable layouts where `SpotlightData` can sit beneath a configured Desktop root: database, WAL, SHM, log, and checkpoint writes cannot trigger another synchronization. Automatic incremental runs persist normally but do not broadcast visible spinner/banner progress; explicit user syncs remain visible and cancellable. Ambiguous watcher events without a filename invalidate trust, are coalesced without repeated console warnings, and cause at most one idle recovery request rather than a feedback loop.

Incremental runs accept files, directories, and missing paths:

- changed file: stat and compare one row;
- changed/created directory: traverse only that subtree;
- deleted file/folder: one targeted set-based availability update, including descendants;
- restored path: restore availability and update metadata only if it changed.

Watcher events are treated as an optimization, not a source of truth. Overflow, watcher errors, root changes, schema changes, interrupted sessions, and application restart remove watcher trust. The next run becomes a full reconciliation. A background reconciliation is scheduled after normal startup because watcher events cannot cover changes made while the app was closed.

## Performance controls

- **Worker isolation:** traversal and synchronization writes do not execute in Electron's main thread.
- **Adaptive transactions:** batches start at 250, remain between 100 and 750, and adjust toward a 20 ms transaction target.
- **Adaptive metadata concurrency:** stat work starts conservatively, is capped by CPU/memory-derived limits and eight operations, and backs down when observed latency rises.
- **Bounded queues:** at most one batch, a bounded stat set, and 10,000 coalesced watcher paths are retained.
- **Progress throttling:** renderer updates are limited to one approximately every 150 ms (at most 6.7 per second), with an exact forced terminal update.
- **Read concurrency:** WAL mode, short transactions, and a 5-second busy timeout keep reads available during writes.
- **Search bounding:** FTS orders an indexed candidate set first (256-1,600 rows depending on requested limit), then applies exact-name, prefix, open-frequency, and BM25 ranking.
- **WAL control:** auto-checkpoint is set to 2,000 pages; a passive checkpoint runs at completion, followed by a delayed worker-side truncate checkpoint with bounded retries when the app is idle.
- **Memory control:** SQLite cache is derived from available memory and bounded to 8-64 MiB per connection; worker temporary membership uses file-backed temporary storage.

## UI responsiveness protections

The renderer receives one canonical progress object containing the run ID and exact counters. The coordinator discards stale run IDs. Repeated Sync clicks are rejected. Terminal-clear timers verify the run ID before clearing state, so an older run cannot erase a newer banner. Preparing, scanning, reconciling, paused, cancelling, cancelled, complete, complete-with-warnings, and failed presentations are distinct. The cancel action acknowledges immediately while the worker stops cooperatively between bounded operations.

## Benchmark results

Fixtures are deterministic real files in an OS temporary directory and are deleted after each run. The scripts support 10,000, 100,000, and 1,000,000-file profiles; the 1,000,000 profile was not executed during this task to avoid creating a million NTFS entries on the user's workstation.

| Metric | Legacy 10k | Worker 10k | Legacy 100k | Worker 100k |
|---|---:|---:|---:|---:|
| Cold duration | 3.34 s | 3.30 s | 43.42 s | 44.85 s |
| Cold throughput | 3,011/s | 3,040/s | 2,312/s | 2,238/s |
| Warm no-change duration | not captured | 0.56 s | not captured | 5.62 s |
| One-file update | O(N) full scan | 8-99 ms targeted | O(N) full scan | 99 ms targeted |
| One-file delete | O(N) full scan | 24 ms targeted | O(N) full scan | 188 ms targeted |
| Cancellation acknowledgement | not captured | 0.68 ms | not captured | 0.64 ms |
| Main event-loop max | 60.29 ms | 39.65 ms | 222.43 ms | 185.73 ms |
| Active ranked-search max | not comparable | 18.79 ms | not comparable | 185.59 ms |
| Active ranked-search average | not comparable | 9.21 ms | not comparable | 68.80 ms |
| Peak RSS delta | 11.36 MB | 28.49 MB | 23.78 MB | 121.71 MB |
| WAL after idle checkpoint | 4.33 MB | bounded/reusable | 8.42 MB | 0 bytes |

The legacy search measurement used a materially simpler query without the production ranking expression, so it is not presented as a direct search-latency comparison. Worker memory is higher because the final harness includes the complete migrated schema, FTS candidates, a second SQLite connection, membership storage, and worker runtime. It remained bounded and did not grow with an unbounded file queue.

The final production Electron walkthrough used 100,000 real files while continuously exercising renderer IPC:

| Runtime check | Result |
|---|---:|
| Terminal state | `complete` |
| Discovered/added | 100,400 / 100,400 |
| Search samples during sync | 254 |
| Search average / maximum | 22.18 / 70.28 ms |
| Renderer frame maximum gap | 16.8 ms |
| Renderer round-trip maximum | 44.36 ms |
| Duplicate start | rejected with `INDEXER_BUSY` |
| Todo IPC/navigation | passed |
| Move/minimize/restore | passed |
| Interrupted-session recovery | passed; zero unfinished sessions |

Raw evidence is stored in `artifacts/benchmarks/*.json` and `artifacts/runtime/electron-medium.json`.

## Automated and runtime validation

```text
npm test
npm run typecheck
npm run test:sync
npm run benchmark:sync -- --profile=medium
npm run benchmark:sync:worker -- --profile=medium
npm run runtime:sync
npm run build
```

The database integration test validates real SQLite contents for state constraints, counters, unchanged timestamps, FTS row stability, exact search, delete/restore counts, warning safety, cancellation safety, forced failure safety, terminal uniqueness, junction-cycle prevention, and `quick_check` integrity.

## Remaining limitations and platform risks

- The 1,000,000-file profile is implemented but was not executed in this session.
- Recursive `fs.watch` behavior was validated on Windows; other platforms may require a different recursive watcher implementation.
- Offline OneDrive placeholders, ACL-denied directories, slow HDDs, network shares, and storage-full behavior need dedicated hardware/environment testing. Missing-root and traversal-error safety were validated.
- An inspection-only packaged app was built and its fuses/migrations were verified, but it was intentionally unsigned and the release verifier rejected it. No distributable release can be produced until a valid Windows signing certificate is supplied.
- SQLite contents remain plaintext. Local non-roaming placement and inherited OS ACLs reduce exposure, but cryptographic at-rest protection still requires an encrypted SQLite provider plus a defined key, recovery, backup, and migration design.
- Abrupt worker exit recovery is implemented in the coordinator, and interrupted restart plus forced worker error were tested, but a deliberate native worker crash was not injected into the production UI run.
- The physical WAL can grow during a very large write burst; committed frames are checkpointed and the file is truncated after the application becomes idle.
- Candidate-bounded ranking intentionally considers the best FTS candidates before applying open-frequency weighting. This keeps broad searches responsive but means an extremely high-open-count result outside the candidate window cannot outrank the candidate set.
