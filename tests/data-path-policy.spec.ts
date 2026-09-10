import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { mkdtemp, rm } from 'fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import {
  choosePersistentDataDirectory,
  isKnownCloudPath,
  migrateLegacyDatabase,
  resolveLocalAppDataBase
} from '../electron/main/storage/data-path-policy'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('data path policy', () => {
  it('uses LOCALAPPDATA rather than roaming application data on Windows', () => {
    expect(
      resolveLocalAppDataBase(
        { LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local' },
        'C:\\Users\\Test',
        'win32'
      )
    ).toBe('C:\\Users\\Test\\AppData\\Local')
  })

  it('uses the portable wrapper directory instead of its temporary child executable', () => {
    expect(
      choosePersistentDataDirectory({
        env: {
          LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
          PORTABLE_EXECUTABLE_DIR: 'D:\\PortableApps\\Spotlight'
        },
        homeDirectory: 'C:\\Users\\Test',
        platform: 'win32'
      })
    ).toBe('D:\\PortableApps\\Spotlight\\SpotlightData')
  })

  it('keeps portable data outside known OneDrive roots by falling back to LOCALAPPDATA', () => {
    const env = {
      LOCALAPPDATA: 'C:\\Users\\Test\\AppData\\Local',
      PORTABLE_EXECUTABLE_DIR: 'C:\\Users\\Test\\OneDrive\\Apps',
      OneDrive: 'C:\\Users\\Test\\OneDrive'
    }
    expect(isKnownCloudPath('C:\\Users\\Test\\OneDrive\\Apps', env)).toBe(true)
    expect(
      choosePersistentDataDirectory({ env, homeDirectory: 'C:\\Users\\Test', platform: 'win32' })
    ).toBe('C:\\Users\\Test\\AppData\\Local\\SpotlightTodo')
  })

  it('copies the complete SQLite family and retains the legacy rollback copy', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-data-policy-'))
    temporaryDirectories.push(root)
    const legacy = join(root, 'roaming')
    const local = join(root, 'local')
    mkdirSync(legacy)
    writeFileSync(join(legacy, 'spotlight.db'), 'database')
    writeFileSync(join(legacy, 'spotlight.db-wal'), 'wal')

    expect(migrateLegacyDatabase(legacy, local)).toBe(true)
    expect(readFileSync(join(local, 'spotlight.db'), 'utf8')).toBe('database')
    expect(readFileSync(join(local, 'spotlight.db-wal'), 'utf8')).toBe('wal')
    expect(existsSync(join(legacy, 'spotlight.db'))).toBe(true)
    expect(migrateLegacyDatabase(legacy, local)).toBe(false)
  })

  it('removes the source database family after a cloud-path evacuation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-cloud-evacuation-'))
    temporaryDirectories.push(root)
    const cloud = join(root, 'OneDrive', 'SpotlightData')
    const local = join(root, 'Local', 'SpotlightTodo')
    mkdirSync(cloud, { recursive: true })
    writeFileSync(join(cloud, 'spotlight.db'), 'database')
    writeFileSync(join(cloud, 'spotlight.db-shm'), 'shared-memory')

    expect(migrateLegacyDatabase(cloud, local, true)).toBe(true)
    expect(readFileSync(join(local, 'spotlight.db'), 'utf8')).toBe('database')
    expect(existsSync(join(cloud, 'spotlight.db'))).toBe(false)
    expect(existsSync(join(cloud, 'spotlight.db-shm'))).toBe(false)
  })
})
