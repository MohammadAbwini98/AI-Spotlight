import { app } from 'electron'
import { existsSync, mkdirSync, accessSync, chmodSync, constants } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'
import {
  choosePersistentDataDirectory,
  isKnownCloudPath,
  migrateLegacyDatabase
} from './data-path-policy'

let _resolvedPath: string | null = null

/**
 * Resolves the writable app data directory.
 *
 * Strategy:
 *  1. Explicit absolute SPOTLIGHT_TODO_DATA_DIR override
 *  2. Portable wrapper directory when it is persistent and outside known OneDrive roots
 *  3. %LOCALAPPDATA%/SpotlightTodo/
 */
export function resolveDataPath(): string {
  if (_resolvedPath) return _resolvedPath

  const selectedPath = choosePersistentDataDirectory({
    env: process.env,
    homeDirectory: homedir()
  })
  const localDataPath = choosePersistentDataDirectory({
    env: { LOCALAPPDATA: process.env.LOCALAPPDATA },
    homeDirectory: homedir()
  })
  const legacyRoamingPath = join(app.getPath('appData'), 'SpotlightTodo')
  const legacyBesideExecutable = join(
    app.isPackaged ? dirname(process.execPath) : app.getAppPath(),
    'SpotlightData'
  )

  if (!isWritable(selectedPath)) {
    ensureDir(localDataPath)
    _resolvedPath = localDataPath
  } else {
    _resolvedPath = selectedPath
  }

  if (_resolvedPath === localDataPath) {
    migrateLegacyDatabase(
      legacyBesideExecutable,
      _resolvedPath,
      isKnownCloudPath(legacyBesideExecutable, process.env)
    )
    migrateLegacyDatabase(legacyRoamingPath, _resolvedPath)
  }
  ensureDir(_resolvedPath)
  return _resolvedPath
}

function isWritable(dirPath: string): boolean {
  try {
    ensureDir(dirPath)
    accessSync(dirPath, constants.W_OK)
    return true
  } catch {
    return false
  }
}

function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 })
  }
  try {
    chmodSync(dirPath, 0o700)
  } catch {
    // Windows primarily enforces the inherited user ACL; POSIX honors this mode.
  }
}

/** Returns the path to the log file. */
export function resolveLogPath(): string {
  return join(resolveDataPath(), 'spotlight.log')
}
