import Database from 'better-sqlite3'
import { promises as fs } from 'fs'
import type { Dir } from 'fs'
import { basename, dirname, extname, join, normalize } from 'path'
import { availableParallelism, totalmem } from 'os'
import { shouldExclude, shouldSkipExtension } from './exclusions'
import { isAppDataPath } from './index-paths'
import { createEmptySyncCounters } from '../../shared/sync-protocol'
import type { IndexerProgress, ScanMode, ScanState, SyncCounters } from '../../shared/types'

const MIN_BATCH_SIZE = 100
const MAX_BATCH_SIZE = 750
const INITIAL_BATCH_SIZE = 250
const TARGET_TRANSACTION_MS = 20
const PROGRESS_INTERVAL_MS = 150
const MAX_STAT_CONCURRENCY = 8
const STAT_SAMPLE_WINDOW = 64

interface IndexedEntry {
  normalizedPath: string
  displayPath: string
  name: string
  nameNormalized: string
  parentPath: string
  entryType: 'file' | 'directory'
  extension: string | null
  size: number
  createdAt: string | null
  modifiedAt: string | null
}

interface StoredEntry {
  normalized_path: string
  display_path: string
  name: string
  name_normalized: string
  parent_path: string
  entry_type: 'file' | 'directory'
  extension: string | null
  size: number
  created_at: string | null
  modified_at: string | null
  is_available: number
}

export interface IndexEngineControl {
  cancelled: boolean
  paused: boolean
}

export interface IndexEngineOptions {
  runId: string
  mode: ScanMode
  roots: string[]
  databasePath: string
  control: IndexEngineControl
  onProgress: (progress: IndexerProgress) => void
}

export interface IndexEngineResult {
  state: Extract<ScanState, 'complete' | 'complete_with_warnings' | 'cancelled'>
  counters: SyncCounters
  durationMs: number
  baselineTrusted: boolean
}

/** Runs one bounded metadata-only index pass on a background worker connection. */
export async function runIndexEngine(options: IndexEngineOptions): Promise<IndexEngineResult> {
  const { runId, mode, roots, databasePath, control, onProgress } = options
  const db = openWorkerDatabase(databasePath)
  const counters = createEmptySyncCounters()
  const startedAt = Date.now()
  let state: ScanState = 'preparing'
  let currentRoot: string | null = null
  let currentPath: string | null = null
  let batchSize = INITIAL_BATCH_SIZE
  let lastProgressAt = 0
  let statConcurrency = Math.min(2, getMaximumStatConcurrency())
  let statSampleCount = 0
  let statSampleDuration = 0
  let reconciliationSafe = true
  const batch: IndexedEntry[] = []
  const missingTargets: string[] = []
  const visitedDirectories = new Set<string>()

  if (mode !== 'incremental' && roots.length === 0) {
    reconciliationSafe = false
    counters.errors++
    counters.skipped++
  }

  const emitProgress = (force = false): void => {
    const now = Date.now()
    if (!force && now - lastProgressAt < PROGRESS_INTERVAL_MS) return
    lastProgressAt = now
    const elapsedMs = now - startedAt
    onProgress({
      runId,
      mode,
      state,
      currentRoot,
      currentPath,
      elapsedMs,
      throughputPerSecond: elapsedMs > 0 ? Math.round((counters.discovered / elapsedMs) * 1000) : 0,
      batchSize,
      ...counters
    })
  }

  const sessionId = insertScanSession(db, runId, mode)
  createSeenTable(db)
  const statements = prepareStatements(db)

  const flushBatch = async (): Promise<void> => {
    if (batch.length === 0) return
    const queuedEntries = batch.splice(0, batch.length)
    const entries = [
      ...new Map(queuedEntries.map((entry) => [entry.normalizedPath, entry])).values()
    ]
    const transactionStartedAt = performance.now()
    writeEntryBatch(db, statements, entries, counters)
    const transactionMs = performance.now() - transactionStartedAt
    batchSize = adaptBatchSize(batchSize, transactionMs)
    emitProgress()
    await new Promise<void>((resolve) => setImmediate(resolve))
  }

  try {
    state = 'scanning'
    updateSessionState(db, sessionId, state)
    emitProgress(true)

    for (const root of roots) {
      if (control.cancelled) break
      currentRoot = root
      if (isAppDataPath(root, databasePath)) {
        counters.excluded++
        continue
      }
      let rootMetadata: Awaited<ReturnType<typeof fs.lstat>>
      try {
        rootMetadata = await fs.lstat(root)
      } catch (error) {
        if (mode === 'incremental' && isMissingPathError(error)) {
          missingTargets.push(root)
        } else {
          counters.errors++
          counters.skipped++
          reconciliationSafe = false
        }
        continue
      }

      if (rootMetadata.isSymbolicLink()) {
        counters.excluded++
        continue
      }
      if (rootMetadata.isFile()) {
        await addFileTarget(root, rootMetadata, batch, counters)
        if (batch.length >= batchSize) await flushBatch()
        continue
      }
      if (!rootMetadata.isDirectory()) {
        counters.skipped++
        continue
      }

      const stack = [root]

      while (stack.length > 0 && !control.cancelled) {
        const resumedDirectoryScan = await waitWhilePaused(control, () => {
          state = 'paused'
          updateSessionState(db, sessionId, state)
          emitProgress(true)
        })
        if (control.cancelled) break
        if (resumedDirectoryScan) {
          state = 'scanning'
          updateSessionState(db, sessionId, state)
          emitProgress(true)
        }

        const directoryPath = stack.pop() as string
        const directoryKey = normalize(directoryPath).toLowerCase()
        if (visitedDirectories.has(directoryKey)) {
          counters.excluded++
          continue
        }
        visitedDirectories.add(directoryKey)
        currentPath = directoryPath
        counters.directoriesVisited++
        let directory: Dir | null = null

        try {
          directory = await fs.opendir(directoryPath)
          const pendingStats = new Set<Promise<void>>()
          for await (const entry of directory) {
            if (control.cancelled) break
            const resumedEntryScan = await waitWhilePaused(control, () => {
              state = 'paused'
              updateSessionState(db, sessionId, state)
              emitProgress(true)
            })
            if (control.cancelled) break
            if (resumedEntryScan) {
              state = 'scanning'
              updateSessionState(db, sessionId, state)
            }

            const absolutePath = join(directoryPath, entry.name)
            if (isAppDataPath(absolutePath, databasePath)) {
              counters.excluded++
              continue
            }
            if (entry.isSymbolicLink()) {
              counters.excluded++
              continue
            }
            if (shouldExclude(absolutePath, entry.name)) {
              counters.excluded++
              continue
            }

            if (entry.isDirectory()) {
              try {
                const directoryMetadata = await fs.lstat(absolutePath)
                if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
                  counters.excluded++
                  continue
                }
                stack.push(absolutePath)
                batch.push(makeDirectoryEntry(absolutePath, entry.name, directoryPath))
                counters.discovered++
              } catch {
                counters.errors++
                counters.skipped++
                reconciliationSafe = false
              }
            } else if (entry.isFile()) {
              counters.filesVisited++
              const extension = extname(entry.name)
              if (shouldSkipExtension(extension)) {
                counters.excluded++
                continue
              }
              const statTask = (async () => {
                const statStartedAt = performance.now()
                try {
                  const metadata = await fs.stat(absolutePath)
                  if (!metadata.isFile()) {
                    counters.skipped++
                    return
                  }
                  batch.push(
                    makeFileEntry(absolutePath, entry.name, directoryPath, extension, metadata)
                  )
                  counters.discovered++
                  counters.bytesRepresented += Number(metadata.size)
                } catch {
                  counters.errors++
                  counters.skipped++
                  reconciliationSafe = false
                } finally {
                  statSampleCount++
                  statSampleDuration += performance.now() - statStartedAt
                  if (statSampleCount >= STAT_SAMPLE_WINDOW) {
                    statConcurrency = adaptStatConcurrency(
                      statConcurrency,
                      statSampleDuration / statSampleCount
                    )
                    statSampleCount = 0
                    statSampleDuration = 0
                  }
                }
              })()
              pendingStats.add(statTask)
              void statTask.finally(() => pendingStats.delete(statTask))
              if (pendingStats.size >= statConcurrency) await Promise.race(pendingStats)
            } else {
              counters.skipped++
            }

            if (batch.length >= batchSize) await flushBatch()
            emitProgress()
          }
          await Promise.all(pendingStats)
          if (batch.length >= batchSize) await flushBatch()
        } catch {
          counters.errors++
          counters.skipped++
          reconciliationSafe = false
        } finally {
          try {
            await directory?.close()
          } catch {
            // Async directory iterators may already have closed the handle.
          }
        }
      }
    }

    if (!control.cancelled) await flushBatch()

    if (control.cancelled) {
      state = 'cancelled'
      const durationMs = Date.now() - startedAt
      persistTerminalState(db, sessionId, runId, mode, state, counters, durationMs, true, false)
      emitProgress(true)
      return { state, counters, durationMs, baselineTrusted: false }
    }

    if (mode !== 'incremental' && reconciliationSafe) {
      state = 'reconciling'
      updateSessionState(db, sessionId, state)
      emitProgress(true)
      counters.newlyUnavailable = reconcileAvailability(db)
    } else if (mode === 'incremental' && missingTargets.length > 0) {
      counters.newlyUnavailable = reconcileMissingTargets(db, missingTargets)
    }

    state = counters.errors > 0 ? 'complete_with_warnings' : 'complete'
    const durationMs = Date.now() - startedAt
    persistTerminalState(
      db,
      sessionId,
      runId,
      mode,
      state,
      counters,
      durationMs,
      false,
      mode !== 'incremental' && reconciliationSafe
    )
    db.pragma('wal_checkpoint(PASSIVE)')
    emitProgress(true)
    return {
      state,
      counters,
      durationMs,
      baselineTrusted: mode === 'incremental' ? true : reconciliationSafe
    }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    try {
      persistFailure(db, sessionId, runId, mode, counters, durationMs)
    } catch {
      // A full/read-only database can prevent recording its own failure. Preserve the original error.
    }
    throw error
  } finally {
    db.close()
  }
}

function openWorkerDatabase(databasePath: string): Database.Database {
  const db = new Database(databasePath)
  const cacheKiB = Math.max(8192, Math.min(65536, Math.floor(totalmem() / 1024 / 256)))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma(`cache_size = -${cacheKiB}`)
  db.pragma('temp_store = FILE')
  db.pragma('busy_timeout = 5000')
  db.pragma('wal_autocheckpoint = 2000')
  return db
}

function insertScanSession(db: Database.Database, runId: string, mode: ScanMode): number {
  const result = db
    .prepare("INSERT INTO scan_sessions (run_key, mode, state) VALUES (?, ?, 'preparing')")
    .run(runId, mode)
  return Number(result.lastInsertRowid)
}

function updateSessionState(db: Database.Database, sessionId: number, state: ScanState): void {
  db.prepare('UPDATE scan_sessions SET state = ? WHERE id = ? AND finished_at IS NULL').run(
    state,
    sessionId
  )
}

function createSeenTable(db: Database.Database): void {
  db.exec(`
    DROP TABLE IF EXISTS temp.scan_seen_paths;
    CREATE TEMP TABLE scan_seen_paths (
      normalized_path TEXT PRIMARY KEY
    ) WITHOUT ROWID;
  `)
}

function prepareStatements(db: Database.Database): {
  insertSeen: Database.Statement
  insertFile: Database.Statement
  updateFile: Database.Statement
  restoreFile: Database.Statement
} {
  return {
    insertSeen: db.prepare('INSERT OR IGNORE INTO temp.scan_seen_paths VALUES (?)'),
    insertFile: db.prepare(`
      INSERT INTO files (
        normalized_path, display_path, name, name_normalized, parent_path,
        entry_type, extension, size, created_at, modified_at, is_available
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `),
    updateFile: db.prepare(`
      UPDATE files SET
        display_path = ?, name = ?, name_normalized = ?, parent_path = ?,
        entry_type = ?, extension = ?, size = ?, created_at = ?, modified_at = ?,
        is_available = 1, indexed_at = datetime('now')
      WHERE normalized_path = ?
    `),
    restoreFile: db.prepare(`
      UPDATE files SET is_available = 1, indexed_at = datetime('now')
      WHERE normalized_path = ?
    `)
  }
}

function writeEntryBatch(
  db: Database.Database,
  statements: ReturnType<typeof prepareStatements>,
  entries: IndexedEntry[],
  counters: SyncCounters
): void {
  const normalizedPaths = entries.map((entry) => entry.normalizedPath)
  const placeholders = normalizedPaths.map(() => '?').join(',')
  const storedRows = db
    .prepare(
      `SELECT normalized_path, display_path, name, name_normalized, parent_path,
              entry_type, extension, size, created_at, modified_at, is_available
       FROM files WHERE normalized_path IN (${placeholders})`
    )
    .all(...normalizedPaths) as StoredEntry[]
  const storedByPath = new Map(storedRows.map((row) => [row.normalized_path, row]))

  db.transaction(() => {
    for (const entry of entries) {
      statements.insertSeen.run(entry.normalizedPath)
      const stored = storedByPath.get(entry.normalizedPath)
      if (!stored) {
        statements.insertFile.run(
          entry.normalizedPath,
          entry.displayPath,
          entry.name,
          entry.nameNormalized,
          entry.parentPath,
          entry.entryType,
          entry.extension,
          entry.size,
          entry.createdAt,
          entry.modifiedAt
        )
        counters.added++
        continue
      }

      const changed = hasMeaningfulChange(stored, entry)
      if (stored.is_available === 0) {
        counters.restored++
        if (!changed) {
          statements.restoreFile.run(entry.normalizedPath)
          continue
        }
      }

      if (changed) {
        statements.updateFile.run(
          entry.displayPath,
          entry.name,
          entry.nameNormalized,
          entry.parentPath,
          entry.entryType,
          entry.extension,
          entry.size,
          entry.createdAt,
          entry.modifiedAt,
          entry.normalizedPath
        )
        if (stored.is_available !== 0) counters.updated++
      } else if (stored.is_available !== 0) {
        counters.unchanged++
      }
    }
  })()
}

function hasMeaningfulChange(stored: StoredEntry, entry: IndexedEntry): boolean {
  return (
    stored.display_path !== entry.displayPath ||
    stored.name !== entry.name ||
    stored.name_normalized !== entry.nameNormalized ||
    stored.parent_path !== entry.parentPath ||
    stored.entry_type !== entry.entryType ||
    stored.extension !== entry.extension ||
    stored.size !== entry.size ||
    stored.created_at !== entry.createdAt ||
    stored.modified_at !== entry.modifiedAt
  )
}

function reconcileAvailability(db: Database.Database): number {
  const newlyUnavailable = (
    db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM files AS file
        WHERE file.is_available = 1
          AND NOT EXISTS (
            SELECT 1 FROM temp.scan_seen_paths AS seen
            WHERE seen.normalized_path = file.normalized_path
          )
      `
      )
      .get() as { count: number }
  ).count

  if (newlyUnavailable > 0) {
    db.prepare(
      `
      UPDATE files SET is_available = 0
      WHERE is_available = 1
        AND NOT EXISTS (
          SELECT 1 FROM temp.scan_seen_paths AS seen
          WHERE seen.normalized_path = files.normalized_path
        )
    `
    ).run()
  }
  return newlyUnavailable
}

function reconcileMissingTargets(db: Database.Database, targets: string[]): number {
  const uniqueTargets = [...new Set(targets.map((target) => normalize(target).toLowerCase()))]
  const countStatement = db.prepare(`
    SELECT COUNT(*) AS count FROM files
    WHERE is_available = 1
      AND (
        normalized_path = ?
        OR (
          substr(normalized_path, 1, ?) = ?
          AND substr(normalized_path, ? + 1, 1) IN ('\\', '/')
        )
      )
  `)
  const updateStatement = db.prepare(`
    UPDATE files SET is_available = 0
    WHERE is_available = 1
      AND (
        normalized_path = ?
        OR (
          substr(normalized_path, 1, ?) = ?
          AND substr(normalized_path, ? + 1, 1) IN ('\\', '/')
        )
      )
  `)

  let total = 0
  db.transaction(() => {
    for (const target of uniqueTargets) {
      const length = target.length
      const count = (countStatement.get(target, length, target, length) as { count: number }).count
      if (count === 0) continue
      updateStatement.run(target, length, target, length)
      total += count
    }
  })()
  return total
}

function persistTerminalState(
  db: Database.Database,
  sessionId: number,
  runId: string,
  mode: ScanMode,
  state: Extract<ScanState, 'complete' | 'complete_with_warnings' | 'cancelled'>,
  counters: SyncCounters,
  durationMs: number,
  cancellationRequested: boolean,
  establishesTrustedBaseline: boolean
): void {
  const persist = db.transaction(() => {
    const result = db
      .prepare(
        `
        UPDATE scan_sessions SET
          finished_at = datetime('now'), state = ?, discovered = ?, added = ?, updated = ?,
          unchanged = ?, newly_unavailable = ?, restored = ?, skipped = ?, excluded = ?,
          errors = ?, directories_visited = ?, files_visited = ?, bytes_represented = ?,
          duration_ms = ?, cancellation_requested = ?
        WHERE id = ? AND finished_at IS NULL
      `
      )
      .run(
        state,
        counters.discovered,
        counters.added,
        counters.updated,
        counters.unchanged,
        counters.newlyUnavailable,
        counters.restored,
        counters.skipped,
        counters.excluded,
        counters.errors,
        counters.directoriesVisited,
        counters.filesVisited,
        counters.bytesRepresented,
        durationMs,
        cancellationRequested ? 1 : 0,
        sessionId
      )
    if (result.changes !== 1) throw new Error(`Terminal state already persisted for ${runId}`)

    db.prepare(
      `
      UPDATE sync_status SET
        last_sync_at = datetime('now'), last_duration_ms = ?, last_state = ?,
        last_run_key = ?, last_mode = ?, last_discovered = ?, last_added = ?,
        last_updated = ?, last_unchanged = ?, last_removed = ?,
        last_newly_unavailable = ?, last_restored = ?, last_skipped = ?,
        last_excluded = ?, last_errors = ?, last_directories_visited = ?,
        last_files_visited = ?, last_bytes_represented = ?
      WHERE id = 1
    `
    ).run(
      durationMs,
      state,
      runId,
      mode,
      counters.discovered,
      counters.added,
      counters.updated,
      counters.unchanged,
      counters.newlyUnavailable,
      counters.newlyUnavailable,
      counters.restored,
      counters.skipped,
      counters.excluded,
      counters.errors,
      counters.directoriesVisited,
      counters.filesVisited,
      counters.bytesRepresented
    )

    if (establishesTrustedBaseline) {
      db.prepare("UPDATE app_settings SET value = 'true' WHERE key = 'scanCompleted'").run()
    }
  })
  persist()
}

function persistFailure(
  db: Database.Database,
  sessionId: number,
  runId: string,
  mode: ScanMode,
  counters: SyncCounters,
  durationMs: number
): void {
  const result = db
    .prepare(
      `
      UPDATE scan_sessions SET
        finished_at = datetime('now'), state = 'failed', discovered = ?, added = ?,
        updated = ?, unchanged = ?, newly_unavailable = ?, restored = ?, skipped = ?,
        excluded = ?, errors = ?, directories_visited = ?, files_visited = ?,
        bytes_represented = ?, duration_ms = ?
      WHERE id = ? AND finished_at IS NULL
    `
    )
    .run(
      counters.discovered,
      counters.added,
      counters.updated,
      counters.unchanged,
      counters.newlyUnavailable,
      counters.restored,
      counters.skipped,
      counters.excluded,
      counters.errors + 1,
      counters.directoriesVisited,
      counters.filesVisited,
      counters.bytesRepresented,
      durationMs,
      sessionId
    )
  if (result.changes !== 1) return

  db.prepare(
    `
    UPDATE sync_status SET
      last_sync_at = datetime('now'), last_duration_ms = ?, last_state = 'failed',
      last_run_key = ?, last_mode = ?, last_discovered = ?, last_added = ?,
      last_updated = ?, last_unchanged = ?, last_removed = ?,
      last_newly_unavailable = ?, last_restored = ?, last_skipped = ?,
      last_excluded = ?, last_errors = ?, last_directories_visited = ?,
      last_files_visited = ?, last_bytes_represented = ?
    WHERE id = 1
  `
  ).run(
    durationMs,
    runId,
    mode,
    counters.discovered,
    counters.added,
    counters.updated,
    counters.unchanged,
    counters.newlyUnavailable,
    counters.newlyUnavailable,
    counters.restored,
    counters.skipped,
    counters.excluded,
    counters.errors + 1,
    counters.directoriesVisited,
    counters.filesVisited,
    counters.bytesRepresented
  )
  db.prepare("UPDATE app_settings SET value = 'false' WHERE key = 'scanCompleted'").run()
}

function adaptBatchSize(current: number, transactionMs: number): number {
  if (transactionMs > TARGET_TRANSACTION_MS * 2) {
    return Math.max(MIN_BATCH_SIZE, Math.floor(current / 2))
  }
  if (transactionMs < TARGET_TRANSACTION_MS / 2) {
    return Math.min(MAX_BATCH_SIZE, Math.ceil(current * 1.2))
  }
  return current
}

function getMaximumStatConcurrency(): number {
  const cpuBound = Math.max(2, Math.ceil(availableParallelism() / 2))
  const memoryBound = totalmem() < 4 * 1024 ** 3 ? 2 : MAX_STAT_CONCURRENCY
  return Math.min(MAX_STAT_CONCURRENCY, cpuBound, memoryBound)
}

function adaptStatConcurrency(current: number, averageLatencyMs: number): number {
  if (averageLatencyMs > 25) return Math.max(1, Math.floor(current / 2))
  if (averageLatencyMs < 5) return Math.min(getMaximumStatConcurrency(), current + 1)
  return current
}

async function waitWhilePaused(
  control: IndexEngineControl,
  onPaused: () => void
): Promise<boolean> {
  let reported = false
  while (control.paused && !control.cancelled) {
    if (!reported) {
      onPaused()
      reported = true
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return reported
}

function makeDirectoryEntry(path: string, name: string, parentPath: string): IndexedEntry {
  return {
    normalizedPath: normalize(path).toLowerCase(),
    displayPath: path,
    name,
    nameNormalized: name.toLowerCase(),
    parentPath,
    entryType: 'directory',
    extension: null,
    size: 0,
    createdAt: null,
    modifiedAt: null
  }
}

function makeFileEntry(
  path: string,
  name: string,
  parentPath: string,
  extension: string,
  metadata: Awaited<ReturnType<typeof fs.stat>>
): IndexedEntry {
  return {
    normalizedPath: normalize(path).toLowerCase(),
    displayPath: path,
    name,
    nameNormalized: name.toLowerCase(),
    parentPath,
    entryType: 'file',
    extension: extension.toLowerCase() || null,
    size: Number(metadata.size),
    createdAt: metadata.birthtime.toISOString(),
    modifiedAt: metadata.mtime.toISOString()
  }
}

async function addFileTarget(
  path: string,
  metadata: Awaited<ReturnType<typeof fs.stat>>,
  batch: IndexedEntry[],
  counters: SyncCounters
): Promise<void> {
  const name = basename(path)
  const extension = extname(name)
  counters.filesVisited++
  if (shouldExclude(path, name) || shouldSkipExtension(extension)) {
    counters.excluded++
    return
  }
  batch.push(makeFileEntry(path, name, dirname(path), extension, metadata))
  counters.discovered++
  counters.bytesRepresented += Number(metadata.size)
}

function isMissingPathError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false
  return error.code === 'ENOENT' || error.code === 'ENOTDIR'
}
