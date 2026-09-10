import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'fs'
import { dirname, isAbsolute, join, normalize, resolve, sep } from 'path'

const DATABASE_FILES = ['spotlight.db', 'spotlight.db-wal', 'spotlight.db-shm'] as const

export interface DataDirectoryPolicyInput {
  env: NodeJS.ProcessEnv
  homeDirectory: string
  platform?: NodeJS.Platform
}

export function resolveLocalAppDataBase(
  env: NodeJS.ProcessEnv,
  homeDirectory: string,
  platform = process.platform
): string {
  const configured = env.LOCALAPPDATA?.trim()
  if (configured && isAbsolute(configured)) return resolve(configured)
  if (platform === 'win32') return join(homeDirectory, 'AppData', 'Local')
  return join(homeDirectory, '.local', 'share')
}

/**
 * Chooses a persistent data directory without placing application data in a
 * portable wrapper's temporary extraction folder or a known OneDrive tree.
 */
export function choosePersistentDataDirectory(input: DataDirectoryPolicyInput): string {
  const { env, homeDirectory, platform = process.platform } = input
  const override = env.SPOTLIGHT_TODO_DATA_DIR?.trim()
  if (override && isAbsolute(override)) return resolve(override)

  const localDataPath = join(resolveLocalAppDataBase(env, homeDirectory, platform), 'SpotlightTodo')
  const portableDirectory = env.PORTABLE_EXECUTABLE_DIR?.trim()
  if (!portableDirectory || !isAbsolute(portableDirectory)) return localDataPath

  const portableDataPath = join(resolve(portableDirectory), 'SpotlightData')
  return isKnownCloudPath(portableDataPath, env) ? localDataPath : portableDataPath
}

/** Returns true when a path is within a OneDrive root advertised by Windows. */
export function isKnownCloudPath(candidatePath: string, env: NodeJS.ProcessEnv): boolean {
  const candidate = normalize(resolve(candidatePath)).toLowerCase()
  const roots = [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value && isAbsolute(value)))
    .map((value) => normalize(resolve(value)).toLowerCase())

  return roots.some((root) => candidate === root || candidate.startsWith(`${root}${sep}`))
}

/**
 * Copies a legacy roaming database as one SQLite file family. The source is retained
 * as a rollback copy and the destination becomes visible only after copying succeeds.
 */
export function migrateLegacyDatabase(
  legacyDirectory: string,
  targetDirectory: string,
  removeSourceAfterCopy = false
): boolean {
  const sourceDatabase = join(legacyDirectory, 'spotlight.db')
  const targetDatabase = join(targetDirectory, 'spotlight.db')
  if (!existsSync(sourceDatabase) || existsSync(targetDatabase)) return false

  const parent = dirname(targetDirectory)
  mkdirSync(parent, { recursive: true })
  const stagingDirectory = `${targetDirectory}.migration-${process.pid}-${Date.now()}`

  try {
    mkdirSync(stagingDirectory, { recursive: false })
    for (const filename of DATABASE_FILES) {
      const source = join(legacyDirectory, filename)
      if (existsSync(source)) copyFileSync(source, join(stagingDirectory, filename))
    }
    if (statSync(join(stagingDirectory, 'spotlight.db')).size <= 0) {
      throw new Error('The legacy database copy is empty.')
    }

    if (!existsSync(targetDirectory)) {
      renameSync(stagingDirectory, targetDirectory)
    } else {
      // Sidecars must be present before the main database is exposed to SQLite.
      for (const filename of ['spotlight.db-wal', 'spotlight.db-shm', 'spotlight.db']) {
        const staged = join(stagingDirectory, filename)
        const target = join(targetDirectory, filename)
        if (existsSync(staged) && !existsSync(target)) renameSync(staged, target)
      }
      rmSync(stagingDirectory, { recursive: true, force: true })
    }
    if (removeSourceAfterCopy) {
      for (const filename of DATABASE_FILES) {
        const source = join(legacyDirectory, filename)
        try {
          if (existsSync(source)) rmSync(source, { force: true })
        } catch {
          // The verified local copy remains authoritative; cloud cleanup can be retried manually.
        }
      }
    }
    return true
  } catch (error) {
    if (existsSync(stagingDirectory)) rmSync(stagingDirectory, { recursive: true, force: true })
    throw error
  }
}
