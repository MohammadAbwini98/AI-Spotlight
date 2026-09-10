import { describe, expect, it } from 'vitest'
import { minimizeScanRoots } from '../electron/main/indexer/exclusions'

describe('minimizeScanRoots', () => {
  it('removes duplicate roots case-insensitively', () => {
    expect(
      minimizeScanRoots(['C:\\Users\\User\\Documents', 'c:\\users\\user\\documents'])
    ).toHaveLength(1)
  })

  it('removes child roots already covered by a parent', () => {
    expect(
      minimizeScanRoots([
        'C:\\Users\\User\\OneDrive\\Documents',
        'C:\\Users\\User\\OneDrive',
        'C:\\Users\\User\\Downloads'
      ])
    ).toEqual(['C:\\Users\\User\\OneDrive', 'C:\\Users\\User\\Downloads'])
  })

  it('keeps independent roots', () => {
    expect(minimizeScanRoots(['C:\\Users\\User\\Documents', 'D:\\Shared'])).toHaveLength(2)
  })
})
