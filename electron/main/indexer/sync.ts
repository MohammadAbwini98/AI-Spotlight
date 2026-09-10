import { isAbsolute, join } from 'path'
import { getDb } from '../db/database'
import { resolveDataPath } from '../storage/paths'
import { getDefaultScanRoots, sanitizeScanRoots } from './exclusions'
import { SyncCoordinator } from './sync-coordinator'
import type { ScanMode, SyncStatus } from '../../shared/types'

const coordinator = new SyncCoordinator()

/** Returns true while a worker-owned scan is active. */
export function isIndexerActive(): boolean {
  return coordinator.isActive()
}

/** Starts the first trusted full index in the background worker. */
export async function startInitialScan(): Promise<string | null> {
  return startIndexer('initial')
}

/** Starts a correctness reconciliation in the background worker. */
export async function startSync(): Promise<string | null> {
  return startIndexer('incremental')
}

/** Validates watcher downtime on startup without animating the explicit Sync UI. */
export async function startStartupReconciliation(): Promise<string | null> {
  return startIndexer('incremental', true)
}

/** Keeps the low-cost filesystem change tracker alive between explicit syncs. */
export function startIndexWatchers(): void {
  const roots = getScanRootsFromSettings()
  coordinator.configureTracking(roots, join(resolveDataPath(), 'spotlight.db'))
}

export function pauseIndexer(): boolean {
  return coordinator.pause()
}

export function resumeIndexer(): boolean {
  return coordinator.resume()
}

export function cancelIndexer(): boolean {
  return coordinator.cancel()
}

export async function shutdownIndexer(): Promise<void> {
  await coordinator.shutdown()
}

export function hasScanCompleted(): boolean {
  const row = getDb()
    .prepare("SELECT value FROM app_settings WHERE key = 'scanCompleted'")
    .get() as { value: string } | undefined
  return row?.value === 'true'
}

export function getSyncStatus(): SyncStatus {
  const db = getDb()
  const row = db.prepare('SELECT * FROM sync_status WHERE id = 1').get() as Record<string, unknown>
  const progress = coordinator.getProgress()

  return {
    runId: progress.runId ?? ((row?.last_run_key as string) || null),
    mode: progress.mode ?? ((row?.last_mode as ScanMode) || null),
    state: coordinator.isActive()
      ? progress.state
      : (row?.last_state as SyncStatus['state']) || 'idle',
    lastSyncAt: (row?.last_sync_at as string) ?? null,
    lastSyncDuration: (row?.last_duration_ms as number) ?? null,
    discovered: (row?.last_discovered as number) ?? 0,
    added: (row?.last_added as number) ?? 0,
    updated: (row?.last_updated as number) ?? 0,
    unchanged: (row?.last_unchanged as number) ?? 0,
    newlyUnavailable: (row?.last_newly_unavailable as number) ?? 0,
    restored: (row?.last_restored as number) ?? 0,
    skipped: (row?.last_skipped as number) ?? 0,
    excluded: (row?.last_excluded as number) ?? 0,
    errors: (row?.last_errors as number) ?? 0,
    directoriesVisited: (row?.last_directories_visited as number) ?? 0,
    filesVisited: (row?.last_files_visited as number) ?? 0,
    bytesRepresented: (row?.last_bytes_represented as number) ?? 0,
    scanRoots: getScanRootsFromSettings()
  }
}

function startIndexer(mode: ScanMode, background = false): string | null {
  if (coordinator.isActive()) return null
  const roots = getScanRootsFromSettings()
  return coordinator.start(mode, roots, join(resolveDataPath(), 'spotlight.db'), background)
}

function getScanRootsFromSettings(): string[] {
  const runtimeRoots = process.env.SPOTLIGHT_TODO_SCAN_ROOTS
  if (runtimeRoots) {
    try {
      const parsed: unknown = JSON.parse(runtimeRoots)
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((root) => typeof root === 'string' && isAbsolute(root))
      ) {
        const validated = sanitizeScanRoots(parsed)
        if (validated.length > 0) return validated
      }
    } catch {
      // Invalid diagnostics override; continue with persisted settings.
    }
  }

  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = 'scanRoots'").get() as
    { value: string } | undefined

  try {
    const parsed: unknown = JSON.parse(row?.value ?? 'null')
    const validated = sanitizeScanRoots(parsed)
    if (validated.length > 0) return validated
  } catch {
    // Fall back to safe defaults.
  }
  return sanitizeScanRoots(getDefaultScanRoots())
}
