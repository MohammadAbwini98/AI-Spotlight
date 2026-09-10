import { statSync } from 'fs'
import { join } from 'path'
import { IPC } from '../../shared/ipc-channels'
import {
  startInitialScan,
  startSync,
  pauseIndexer,
  resumeIndexer,
  cancelIndexer,
  getSyncStatus
} from '../indexer/sync'
import { getDb } from '../db/database'
import { resolveDataPath } from '../storage/paths'
import type { ApiResult, IndexStats, SyncStatus } from '../../shared/types'
import { registerTrustedHandler } from './security'

export function registerIndexerHandlers(): void {
  registerTrustedHandler(IPC.INDEXER_START_SCAN, async (): Promise<ApiResult<void>> => {
    try {
      const runId = await startInitialScan()
      return runId
        ? { ok: true, data: undefined }
        : { ok: false, error: { code: 'INDEXER_BUSY', message: 'A sync is already active.' } }
    } catch (error) {
      return { ok: false, error: { code: 'SCAN_START_ERROR', message: String(error) } }
    }
  })

  registerTrustedHandler(IPC.INDEXER_START_SYNC, async (): Promise<ApiResult<void>> => {
    try {
      const runId = await startSync()
      return runId
        ? { ok: true, data: undefined }
        : { ok: false, error: { code: 'INDEXER_BUSY', message: 'A sync is already active.' } }
    } catch (error) {
      return { ok: false, error: { code: 'SYNC_START_ERROR', message: String(error) } }
    }
  })

  registerTrustedHandler(IPC.INDEXER_CANCEL_SCAN, (): ApiResult<void> => cancelResult())
  registerTrustedHandler(IPC.INDEXER_CANCEL_SYNC, (): ApiResult<void> => cancelResult())
  registerTrustedHandler(IPC.INDEXER_PAUSE_SYNC, (): ApiResult<void> =>
    pauseIndexer()
      ? { ok: true, data: undefined }
      : { ok: false, error: { code: 'INDEXER_IDLE', message: 'No sync is active.' } }
  )
  registerTrustedHandler(IPC.INDEXER_RESUME_SYNC, (): ApiResult<void> =>
    resumeIndexer()
      ? { ok: true, data: undefined }
      : { ok: false, error: { code: 'INDEXER_IDLE', message: 'No sync is active.' } }
  )

  registerTrustedHandler(IPC.INDEXER_GET_STATUS, (): ApiResult<SyncStatus> => {
    try {
      return { ok: true, data: getSyncStatus() }
    } catch (error) {
      return { ok: false, error: { code: 'STATUS_ERROR', message: String(error) } }
    }
  })

  registerTrustedHandler(IPC.STATS_GET_INDEX_STATS, (): ApiResult<IndexStats> => {
    try {
      const db = getDb()
      const fileCount = (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM files WHERE entry_type = 'file' AND is_available = 1"
          )
          .get() as { count: number }
      ).count
      const folderCount = (
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM files WHERE entry_type = 'directory' AND is_available = 1"
          )
          .get() as { count: number }
      ).count
      const databasePath = join(resolveDataPath(), 'spotlight.db')
      let dbSizeBytes = 0
      try {
        dbSizeBytes = statSync(databasePath).size
      } catch {
        // Database may not have been materialized yet.
      }
      const syncRow = db.prepare('SELECT last_sync_at FROM sync_status WHERE id = 1').get() as {
        last_sync_at: string | null
      }

      return {
        ok: true,
        data: {
          fileCount,
          folderCount,
          totalEntries: fileCount + folderCount,
          dbSizeBytes,
          lastSyncAt: syncRow?.last_sync_at ?? null
        }
      }
    } catch (error) {
      return { ok: false, error: { code: 'STATS_ERROR', message: String(error) } }
    }
  })

  registerTrustedHandler(IPC.STATS_GET_DATA_PATH, (): ApiResult<string> => {
    try {
      return { ok: true, data: resolveDataPath() }
    } catch (error) {
      return { ok: false, error: { code: 'PATH_ERROR', message: String(error) } }
    }
  })
}

function cancelResult(): ApiResult<void> {
  return cancelIndexer()
    ? { ok: true, data: undefined }
    : { ok: false, error: { code: 'INDEXER_IDLE', message: 'No sync is active.' } }
}
