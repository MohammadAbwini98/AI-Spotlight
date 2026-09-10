import { dirname, normalize, resolve, sep } from 'path'

/** Prevents the indexer and watcher from reacting to Spotlight-Todo's own data writes. */
export function isAppDataPath(candidatePath: string, databasePath: string): boolean {
  const candidate = normalize(resolve(candidatePath)).toLowerCase()
  const dataDirectory = normalize(dirname(resolve(databasePath))).toLowerCase()
  return candidate === dataDirectory || candidate.startsWith(`${dataDirectory}${sep}`)
}
