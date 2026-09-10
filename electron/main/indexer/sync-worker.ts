import Database from 'better-sqlite3'
import { parentPort } from 'worker_threads'
import { promises as fs, watch, type FSWatcher } from 'fs'
import { resolve } from 'path'
import { runIndexEngine, type IndexEngineControl } from './index-engine'
import { isAppDataPath } from './index-paths'
import type { SyncWorkerCommand, SyncWorkerEvent } from '../../shared/sync-protocol'

if (!parentPort) throw new Error('Synchronization worker requires a parent port')

let activeRunId: string | null = null
let control: IndexEngineControl | null = null
let shuttingDown = false
let watcherTrusted = false
let watchRoots: string[] = []
let watchDatabasePath: string | null = null
let watchers: FSWatcher[] = []
let changeTimer: NodeJS.Timeout | null = null
let checkpointTimer: NodeJS.Timeout | null = null
let watcherRecoveryNeeded = false
let watcherTrustLostDuringRun = false
let lastWatcherWarningAt = 0
const pendingChanges = new Map<string, 'change' | 'rename'>()
const MAX_PENDING_CHANGES = 10_000
const WATCH_DEBOUNCE_MS = 750

function send(event: SyncWorkerEvent): void {
  parentPort?.postMessage(event)
}

async function start(command: Extract<SyncWorkerCommand, { type: 'start' }>): Promise<void> {
  if (activeRunId) {
    send({
      type: 'warning',
      runId: command.runId,
      code: 'SYNC_ALREADY_ACTIVE',
      message: `Synchronization ${activeRunId} is already active.`
    })
    return
  }

  let mode = command.mode
  let roots = command.roots
  if (mode === 'incremental') {
    if (!watcherTrusted) {
      mode = 'reconcile'
      roots = watchRoots.length > 0 ? watchRoots : command.roots
    } else {
      roots = [...pendingChanges.keys()]
      pendingChanges.clear()
    }
  }

  activeRunId = command.runId
  watcherTrustLostDuringRun = false
  if (checkpointTimer) clearTimeout(checkpointTimer)
  checkpointTimer = null
  control = { cancelled: false, paused: false }

  try {
    const result = await runIndexEngine({
      runId: command.runId,
      mode,
      roots,
      databasePath: command.databasePath,
      control,
      onProgress: (progress) => send({ type: 'progress', runId: command.runId, progress })
    })

    scheduleIdleCheckpoint(command.databasePath)

    if (result.state === 'cancelled') {
      send({
        type: 'cancelled',
        runId: command.runId,
        counters: result.counters,
        durationMs: result.durationMs
      })
    } else {
      if (mode !== 'incremental') {
        watcherTrusted = result.baselineTrusted && !watcherTrustLostDuringRun
      }
      send({
        type: 'completed',
        runId: command.runId,
        state: result.state,
        counters: result.counters,
        durationMs: result.durationMs
      })
    }
  } catch (error) {
    watcherTrusted = false
    send({
      type: 'error',
      runId: command.runId,
      code: 'SYNC_WORKER_ERROR',
      message: error instanceof Error ? error.message : String(error)
    })
  } finally {
    activeRunId = null
    control = null
    if (shuttingDown) process.exit(0)
    if (pendingChanges.size > 0 || watcherRecoveryNeeded) scheduleChangeNotification()
  }
}

function configureWatchers(roots: string[], databasePath: string): void {
  closeWatchers()
  watcherTrusted = false
  watcherRecoveryNeeded = false
  watcherTrustLostDuringRun = false
  pendingChanges.clear()
  watchRoots = [...new Set(roots.map((root) => resolve(root)))]
  watchDatabasePath = databasePath

  for (const root of watchRoots) {
    try {
      const watcher = watch(root, { recursive: true }, (eventType, filename) => {
        if (!filename) {
          loseWatcherTrust('A filesystem event did not include a path.', false)
          return
        }
        const changedPath = resolve(root, filename.toString())
        if (isAppDataPath(changedPath, databasePath)) return
        queueChangedPath(changedPath, eventType)
      })
      watcher.on('error', (error) => loseWatcherTrust(error.message))
      watchers.push(watcher)
    } catch (error) {
      loseWatcherTrust(error instanceof Error ? error.message : String(error))
    }
  }
}

function queueChangedPath(path: string, eventType: 'change' | 'rename'): void {
  if (pendingChanges.size >= MAX_PENDING_CHANGES) {
    pendingChanges.clear()
    loseWatcherTrust('The change queue overflowed; the next run will reconcile all roots.')
  } else {
    if (eventType === 'rename' || !pendingChanges.has(path)) pendingChanges.set(path, eventType)
  }
  scheduleChangeNotification()
}

function scheduleChangeNotification(): void {
  if (changeTimer) clearTimeout(changeTimer)
  changeTimer = setTimeout(() => void notifyChanges(), WATCH_DEBOUNCE_MS)
}

async function notifyChanges(): Promise<void> {
  changeTimer = null
  if (
    activeRunId ||
    shuttingDown ||
    (pendingChanges.size === 0 && !watcherRecoveryNeeded) ||
    !watchDatabasePath
  )
    return
  await pruneDirectoryMetadataEvents()
  if (
    activeRunId ||
    shuttingDown ||
    (pendingChanges.size === 0 && !watcherRecoveryNeeded) ||
    !watchDatabasePath
  )
    return
  watcherRecoveryNeeded = false
  send({
    type: 'changes-detected',
    pending: pendingChanges.size,
    watcherTrusted
  })
}

async function pruneDirectoryMetadataEvents(): Promise<void> {
  const candidates = [...pendingChanges.entries()].filter(([, eventType]) => eventType === 'change')
  const concurrency = 8
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    await Promise.all(
      candidates.slice(offset, offset + concurrency).map(async ([path]) => {
        try {
          const metadata = await fs.lstat(path)
          if (metadata.isDirectory() && pendingChanges.get(path) === 'change') {
            pendingChanges.delete(path)
          }
        } catch {
          // A missing path may represent a deletion and must be processed.
        }
      })
    )
  }
}

function loseWatcherTrust(message: string, reportWarning = true): void {
  watcherTrusted = false
  if (activeRunId) watcherTrustLostDuringRun = true
  else {
    watcherRecoveryNeeded = true
    scheduleChangeNotification()
  }

  const now = Date.now()
  if (reportWarning && now - lastWatcherWarningAt >= 60_000) {
    lastWatcherWarningAt = now
    send({ type: 'warning', runId: null, code: 'WATCHER_UNTRUSTED', message })
  }
}

function closeWatchers(): void {
  if (changeTimer) clearTimeout(changeTimer)
  changeTimer = null
  for (const watcher of watchers) watcher.close()
  watchers = []
}

function scheduleIdleCheckpoint(databasePath: string, attempt = 0): void {
  if (checkpointTimer) clearTimeout(checkpointTimer)
  checkpointTimer = setTimeout(
    () => {
      checkpointTimer = null
      if (activeRunId || shuttingDown) return
      let db: Database.Database | null = null
      try {
        db = new Database(databasePath)
        db.pragma('busy_timeout = 250')
        const result = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{
          busy: number
          log: number
          checkpointed: number
        }>
        if (result[0]?.busy && attempt < 2) scheduleIdleCheckpoint(databasePath, attempt + 1)
      } catch (error) {
        if (attempt < 2) scheduleIdleCheckpoint(databasePath, attempt + 1)
        else {
          send({
            type: 'warning',
            runId: null,
            code: 'WAL_CHECKPOINT_DEFERRED',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      } finally {
        db?.close()
      }
    },
    2000 * (attempt + 1)
  )
}

parentPort.on('message', (command: SyncWorkerCommand) => {
  switch (command.type) {
    case 'start':
      void start(command)
      break
    case 'pause':
      if (command.runId === activeRunId && control) control.paused = true
      break
    case 'resume':
      if (command.runId === activeRunId && control) control.paused = false
      break
    case 'cancel':
      if (command.runId === activeRunId && control) {
        control.cancelled = true
        control.paused = false
      }
      break
    case 'watch':
      configureWatchers(command.roots, command.databasePath)
      break
    case 'shutdown':
      shuttingDown = true
      closeWatchers()
      if (checkpointTimer) clearTimeout(checkpointTimer)
      if (control) {
        control.cancelled = true
        control.paused = false
      } else {
        process.exit(0)
      }
      break
  }
})

send({ type: 'ready' })
