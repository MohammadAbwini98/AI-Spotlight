import type { IndexerProgress, ScanMode, ScanState, SyncCounters } from './types'

export interface SyncWorkerStartMessage {
  type: 'start'
  runId: string
  mode: ScanMode
  roots: string[]
  databasePath: string
}

export type SyncWorkerCommand =
  | SyncWorkerStartMessage
  | { type: 'pause'; runId: string }
  | { type: 'resume'; runId: string }
  | { type: 'cancel'; runId: string }
  | { type: 'watch'; roots: string[]; databasePath: string }
  | { type: 'shutdown' }

export type SyncWorkerEvent =
  | { type: 'ready' }
  | { type: 'changes-detected'; pending: number; watcherTrusted: boolean }
  | { type: 'progress'; runId: string; progress: IndexerProgress }
  | { type: 'warning'; runId: string | null; code: string; message: string }
  | {
      type: 'completed'
      runId: string
      state: Extract<ScanState, 'complete' | 'complete_with_warnings'>
      counters: SyncCounters
      durationMs: number
    }
  | { type: 'cancelled'; runId: string; counters: SyncCounters; durationMs: number }
  | { type: 'error'; runId: string | null; code: string; message: string }

export function isTerminalScanState(state: ScanState): boolean {
  return (
    state === 'complete' ||
    state === 'complete_with_warnings' ||
    state === 'failed' ||
    state === 'cancelled'
  )
}

export function createEmptySyncCounters(): SyncCounters {
  return {
    discovered: 0,
    added: 0,
    updated: 0,
    unchanged: 0,
    newlyUnavailable: 0,
    restored: 0,
    skipped: 0,
    excluded: 0,
    errors: 0,
    directoriesVisited: 0,
    filesVisited: 0,
    bytesRepresented: 0
  }
}
