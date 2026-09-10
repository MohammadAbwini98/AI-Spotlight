import { describe, expect, it } from 'vitest'
import { isAppDataPath } from '../electron/main/indexer/index-paths'

describe('index app-data isolation', () => {
  const databasePath = 'C:\\Users\\User\\Desktop\\Spotlight-Todo\\SpotlightData\\spotlight.db'

  it('excludes the database family and its data directory from indexing', () => {
    expect(isAppDataPath(databasePath, databasePath)).toBe(true)
    expect(isAppDataPath(`${databasePath}-wal`, databasePath)).toBe(true)
    expect(
      isAppDataPath('C:\\Users\\User\\Desktop\\Spotlight-Todo\\SpotlightData', databasePath)
    ).toBe(true)
  })

  it('does not exclude ordinary files beside the app-data directory', () => {
    expect(isAppDataPath('C:\\Users\\User\\Desktop\\Documents\\report.pdf', databasePath)).toBe(
      false
    )
  })
})
