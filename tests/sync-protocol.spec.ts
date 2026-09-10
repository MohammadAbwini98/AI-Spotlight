import { describe, expect, it } from 'vitest'
import { createEmptySyncCounters, isTerminalScanState } from '../electron/shared/sync-protocol'

describe('canonical synchronization protocol', () => {
  it('recognizes only canonical terminal states', () => {
    expect(isTerminalScanState('complete')).toBe(true)
    expect(isTerminalScanState('complete_with_warnings')).toBe(true)
    expect(isTerminalScanState('cancelled')).toBe(true)
    expect(isTerminalScanState('failed')).toBe(true)
    expect(isTerminalScanState('scanning')).toBe(false)
    expect(isTerminalScanState('reconciling')).toBe(false)
  })

  it('creates a complete zeroed counter set', () => {
    expect(createEmptySyncCounters()).toEqual({
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
    })
  })
})
