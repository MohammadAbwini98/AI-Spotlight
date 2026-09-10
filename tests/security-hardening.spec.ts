import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createRequire } from 'module'
import { afterEach, describe, expect, it } from 'vitest'
import { IPC } from '../electron/shared/ipc-channels'
import { TASK_TITLE_MAX_LENGTH, TODO_LIST_NAME_MAX_LENGTH } from '../electron/shared/types'
import { validateIpcArguments } from '../electron/main/ipc/security'
import { getUnsafeLaunchReason } from '../electron/main/security/file-launch'
import {
  EXPECTED_MIGRATION_VERSION,
  validateMigrationFiles
} from '../electron/main/db/migration-policy'
import { isStorageCapacityError } from '../electron/main/storage/errors'

// CommonJS keeps the integrity utility executable directly from package scripts.
const requireModule = createRequire(__filename)
const { createManifest, verifyManifest } = requireModule('../scripts/release-integrity.cjs') as {
  createManifest: (root: string) => unknown
  verifyManifest: (root: string) => boolean
}
const { createElectronEnvironment } = requireModule('../scripts/run-electron-vite.cjs') as {
  createElectronEnvironment: (source: NodeJS.ProcessEnv) => NodeJS.ProcessEnv
}

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true })))
})

describe('development toolchain', () => {
  it('runs scripts with the pinned supported Node runtime', () => {
    const [major, minor] = process.versions.node.split('.').map(Number)
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      engines: { node: string }
      devDependencies: { node: string }
    }

    expect(major > 22 || (major === 22 && minor >= 12)).toBe(true)
    expect(packageJson.engines.node).toBe('>=22.12.0')
    expect(packageJson.devDependencies.node).toBe('22.12.0')
    expect(createElectronEnvironment({ ELECTRON_RUN_AS_NODE: '1', SAFE_VALUE: 'kept' })).toEqual({
      SAFE_VALUE: 'kept'
    })
  })
})

describe('privileged IPC validation', () => {
  it('rejects settings bypasses and malformed search requests', () => {
    expect(() => validateIpcArguments(IPC.SETTINGS_SET, ['scanRoots', '["C:\\\\"]'])).toThrow(
      /not renderer-writable/i
    )
    expect(() =>
      validateIpcArguments(IPC.SEARCH_QUERY, [{ text: 'x', requestId: -1, limit: 5000 }])
    ).toThrow()
    expect(() => validateIpcArguments(IPC.APP_SET_HEIGHT, [99999])).toThrow(/approved/i)
  })

  it('accepts bounded application requests', () => {
    expect(() =>
      validateIpcArguments(IPC.SEARCH_QUERY, [{ text: 'report', requestId: 1, limit: 50 }])
    ).not.toThrow()
    expect(() => validateIpcArguments(IPC.SETTINGS_SET, ['theme', 'dark'])).not.toThrow()
    expect(() =>
      validateIpcArguments(IPC.TODO_UPDATE_TASK, [{ id: 1, status: 'follow_up' }])
    ).not.toThrow()
    expect(() => validateIpcArguments(IPC.TODO_EXPORT_NOTE_MARKDOWN, [1])).not.toThrow()
  })

  it('enforces the shared Todo list name limit', () => {
    expect(() =>
      validateIpcArguments(IPC.TODO_CREATE_LIST, [{ name: 'L'.repeat(TODO_LIST_NAME_MAX_LENGTH) }])
    ).not.toThrow()
    expect(() =>
      validateIpcArguments(IPC.TODO_CREATE_LIST, [
        { name: 'L'.repeat(TODO_LIST_NAME_MAX_LENGTH + 1) }
      ])
    ).toThrow(/characters/i)
  })

  it('enforces the shared task title limit', () => {
    expect(() =>
      validateIpcArguments(IPC.TODO_CREATE_TASK, [{ title: 'T'.repeat(TASK_TITLE_MAX_LENGTH) }])
    ).not.toThrow()
    expect(() =>
      validateIpcArguments(IPC.TODO_CREATE_TASK, [{ title: 'T'.repeat(TASK_TITLE_MAX_LENGTH + 1) }])
    ).toThrow(/characters/i)
  })
})

describe('file launch policy', () => {
  it.each(['setup.exe', 'run.cmd', 'shortcut.lnk', 'website.url', 'script.ps1'])(
    'blocks active file type %s',
    (filename) => expect(getUnsafeLaunchReason(filename)).toMatch(/blocked/i)
  )

  it('allows documents to continue through the OS file association', () => {
    expect(getUnsafeLaunchReason('quarterly-report.pdf')).toBeNull()
  })
})

describe('migration and storage failure policy', () => {
  it('requires the complete ordered migration inventory', () => {
    const filenames = readdirSync(join(process.cwd(), 'electron', 'main', 'db', 'migrations'))
    const migrations = validateMigrationFiles(filenames)
    expect(migrations).toHaveLength(EXPECTED_MIGRATION_VERSION)
    expect(() => validateMigrationFiles(filenames.slice(0, -1))).toThrow(/expected/i)
  })

  it('recognizes SQLite and operating-system disk-full failures', () => {
    expect(
      isStorageCapacityError({ code: 'SQLITE_FULL', message: 'database or disk is full' })
    ).toBe(true)
    expect(isStorageCapacityError({ code: 'ENOSPC', message: 'no space left on device' })).toBe(
      true
    )
    expect(isStorageCapacityError(new Error('unrelated'))).toBe(false)
  })
})

describe('release tamper detection', () => {
  it('detects modified and additional package files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'spotlight-release-integrity-'))
    temporaryDirectories.push(root)
    mkdirSync(join(root, 'win-unpacked'))
    const executable = join(root, 'win-unpacked', 'DeepDive.exe')
    writeFileSync(executable, 'signed-package-placeholder')

    createManifest(root)
    expect(verifyManifest(root)).toBe(true)
    expect(readFileSync(join(root, 'SHA256SUMS.json'), 'utf8')).toContain('DeepDive.exe')

    writeFileSync(executable, 'tampered')
    expect(() => verifyManifest(root)).toThrow(/integrity check failed/i)

    createManifest(root)
    writeFileSync(join(root, 'unexpected.dll'), 'injected')
    expect(() => verifyManifest(root)).toThrow(/inventory/i)
  })
})
