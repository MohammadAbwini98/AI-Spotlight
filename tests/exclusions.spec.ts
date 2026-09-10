import { describe, expect, it } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import {
  sanitizeScanRoots,
  shouldExclude,
  shouldSkipExtension,
  validateScanRoot
} from '../electron/main/indexer/exclusions'

describe('index exclusions', () => {
  it('excludes dependency, cache, temporary, and system paths', () => {
    expect(shouldExclude('C:\\work\\node_modules', 'node_modules')).toBe(true)
    expect(shouldExclude('C:\\Windows\\System32', 'System32')).toBe(true)
    expect(shouldSkipExtension('.tmp')).toBe(true)
    expect(shouldSkipExtension('.TXT')).toBe(false)
  })

  it('rejects whole drives and protected Windows roots', () => {
    expect(validateScanRoot('C:\\')).toMatch(/entire drive/i)
    expect(validateScanRoot('C:\\Windows\\System32')).toMatch(/system directories/i)
    expect(validateScanRoot('D:\\Documents')).toBeNull()
  })

  it('rejects relative, shared, and sensitive profile roots', () => {
    expect(validateScanRoot('relative\\folder')).toMatch(/absolute/i)
    expect(validateScanRoot('\\\\server\\share\\documents')).toMatch(/network|unc/i)
    expect(validateScanRoot(homedir())).toMatch(/entire profile/i)
    expect(validateScanRoot(join(homedir(), 'AppData', 'Roaming'))).toMatch(/sensitive/i)
  })

  it('drops unsafe persisted roots instead of trusting database settings', () => {
    expect(
      sanitizeScanRoots([
        'relative\\folder',
        '\\\\server\\share',
        'C:\\Windows\\System32',
        'D:\\Documents'
      ])
    ).toEqual(['D:\\Documents'])
  })
})
