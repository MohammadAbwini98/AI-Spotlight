import { Worker } from 'worker_threads'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { getDb } from '../db/database'
import { IPC } from '../../shared/ipc-channels'
import { createEmptySyncCounters } from '../../shared/sync-protocol'
import type { SyncWorkerCommand, SyncWorkerEvent } from '../../shared/sync-protocol'
import type { IndexerProgress, ScanMode, ScanState } from '../../shared/types'

const WORKER_SHUTDOWN_TIMEOUT_MS = 2000

export class SyncCoordinator {
  private worker: Worker | null = null
  private activeRunId: string | null = null
  private sequence = 0
  private progress: IndexerProgress = createIdleProgress()
  private shutdownRequested = false
  private watchRoots: string[] = []
  private watchDatabasePath: string | null = null
  private activeRunIsBackground = false

  isActive(): boolean {
    return this.activeRunId !== null
  }

  getProgress(): IndexerProgress {
    return { ...this.progress }
  }

  start(mode: ScanMode, roots: string[], databasePath: string, background = false): string | null {
    if (this.activeRunId || this.shutdownRequested) return null
    const worker = this.ensureWorker()
    this.configureTracking(roots, databasePath)
    const runId = `${Date.now()}-${++this.sequence}`
    this.activeRunId = runId
    this.activeRunIsBackground = background
    this.progress = {
      ...createIdleProgress(),
      runId,
      mode,
      state: 'preparing'
    }
    if (!background) this.broadcast(this.progress)
    this.post(worker, { type: 'start', runId, mode, roots, databasePath })
    return runId
  }

  configureTracking(roots: string[], databasePath: string): void {
    if (this.shutdownRequested) return
    const normalizedRoots = [...new Set(roots)]
    const unchanged =
      this.watchDatabasePath === databasePath &&
      normalizedRoots.length === this.watchRoots.length &&
      normalizedRoots.every((root, index) => root === this.watchRoots[index])
    if (unchanged) return
    this.watchRoots = normalizedRoots
    this.watchDatabasePath = databasePath
    this.post(this.ensureWorker(), { type: 'watch', roots: normalizedRoots, databasePath })
  }

  pause(): boolean {
    if (!this.activeRunId || !this.worker) return false
    this.post(this.worker, { type: 'pause', runId: this.activeRunId })
    this.progress = { ...this.progress, state: 'paused' }
    this.broadcast(this.progress)
    return true
  }

  resume(): boolean {
    if (!this.activeRunId || !this.worker) return false
    this.post(this.worker, { type: 'resume', runId: this.activeRunId })
    this.progress = { ...this.progress, state: 'scanning' }
    this.broadcast(this.progress)
    return true
  }

  cancel(): boolean {
    if (!this.activeRunId || !this.worker) return false
    this.post(this.worker, { type: 'cancel', runId: this.activeRunId })
    this.progress = { ...this.progress, state: 'cancelling' }
    this.broadcast(this.progress)
    return true
  }

  async shutdown(): Promise<void> {
    this.shutdownRequested = true
    const worker = this.worker
    if (!worker) return
    this.post(worker, { type: 'shutdown' })

    await Promise.race([
      new Promise<void>((resolve) => worker.once('exit', () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, WORKER_SHUTDOWN_TIMEOUT_MS))
    ])
    if (this.worker) await this.worker.terminate()
    this.worker = null
    this.activeRunId = null
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new Worker(join(__dirname, 'sync-worker.js'))
    worker.on('message', (event: SyncWorkerEvent) => this.handleWorkerEvent(event))
    worker.on('error', (error) => this.handleWorkerFailure(error.message))
    worker.on('exit', (code) => {
      if (!this.shutdownRequested && code !== 0) {
        this.handleWorkerFailure(`Synchronization worker exited with code ${code}.`)
      }
      if (this.worker === worker) this.worker = null
    })
    this.worker = worker
    return worker
  }

  private handleWorkerEvent(event: SyncWorkerEvent): void {
    if (event.type === 'ready') return
    if (event.type === 'changes-detected') {
      if (!this.activeRunId && this.watchDatabasePath && this.watchRoots.length > 0) {
        this.start('incremental', this.watchRoots, this.watchDatabasePath, true)
      }
      return
    }
    if (event.runId && event.runId !== this.activeRunId) return

    if (event.type === 'progress') {
      this.progress = event.progress
      if (!this.activeRunIsBackground) this.broadcast(event.progress)
      return
    }

    if (event.type === 'completed') {
      this.finish(event.state)
      return
    }
    if (event.type === 'cancelled') {
      this.finish('cancelled')
      return
    }
    if (event.type === 'error') {
      this.finish('failed')
      return
    }
    if (event.type === 'warning') {
      process.stderr.write(`[sync-worker:${event.code}] ${event.message}\n`)
    }
  }

  private handleWorkerFailure(message: string): void {
    if (!this.activeRunId) return
    const runId = this.activeRunId
    try {
      getDb()
        .prepare(
          `
          UPDATE scan_sessions SET state = 'failed', finished_at = datetime('now'), errors = errors + 1
          WHERE run_key = ? AND finished_at IS NULL
        `
        )
        .run(runId)
      getDb()
        .prepare(
          `
          UPDATE sync_status SET last_sync_at = datetime('now'), last_state = 'failed',
            last_run_key = ?, last_errors = last_errors + 1
          WHERE id = 1
        `
        )
        .run(runId)
      getDb().prepare("UPDATE app_settings SET value = 'false' WHERE key = 'scanCompleted'").run()
    } catch {
      // The database may be the reason the worker failed; renderer still receives terminal state.
    }
    this.progress = { ...this.progress, state: 'failed', errors: this.progress.errors + 1 }
    if (!this.activeRunIsBackground) this.broadcast(this.progress)
    this.activeRunId = null
    this.activeRunIsBackground = false
    this.worker = null
    process.stderr.write(`[sync-worker] ${message}\n`)
  }

  private finish(
    state: Extract<ScanState, 'complete' | 'complete_with_warnings' | 'failed' | 'cancelled'>
  ): void {
    const background = this.activeRunIsBackground
    this.progress = { ...this.progress, state }
    if (!background) this.broadcast(this.progress)
    this.activeRunId = null
    this.activeRunIsBackground = false
  }

  private broadcast(progress: IndexerProgress): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send(IPC.INDEXER_PROGRESS, progress)
    })
  }

  private post(worker: Worker, command: SyncWorkerCommand): void {
    worker.postMessage(command)
  }
}

function createIdleProgress(): IndexerProgress {
  return {
    runId: null,
    mode: null,
    state: 'idle',
    currentRoot: null,
    currentPath: null,
    elapsedMs: 0,
    throughputPerSecond: 0,
    batchSize: 0,
    ...createEmptySyncCounters()
  }
}
