import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('recent files performance', () => {
  it('provides ordered partial indexes for both main-process lookups', () => {
    const migration = readFileSync(
      'electron/main/db/migrations/008_recent_files_indexes.sql',
      'utf8'
    )

    expect(migration).toContain('ON files(is_available, last_opened_at DESC)')
    expect(migration).toContain('WHERE last_opened_at IS NOT NULL')
    expect(migration).toContain('ON files(is_available, open_count DESC, last_opened_at DESC)')
    expect(migration).toContain('WHERE open_count > 0')
  })
})
