import Database from 'better-sqlite3'
import { app } from 'electron'
import { chmodSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { totalmem } from 'os'
import { resolveDataPath } from '../storage/paths'
import { validateMigrationFiles } from './migration-policy'

let _db: Database.Database | null = null

/** Returns the singleton SQLite connection, initializing it on first call. */
export function getDb(): Database.Database {
  if (_db) return _db

  const dbPath = join(resolveDataPath(), 'spotlight.db')

  _db = new Database(dbPath)
  try {
    chmodSync(dbPath, 0o600)
  } catch {
    // Windows uses inherited ACLs; POSIX platforms honor the restrictive mode.
  }
  applyPragmas(_db)
  runMigrations(_db)
  recoverInterruptedScans(_db)

  return _db
}

function recoverInterruptedScans(db: Database.Database): void {
  const interrupted = db
    .prepare(
      `
      UPDATE scan_sessions SET
        state = 'failed', finished_at = datetime('now'), errors = errors + 1
      WHERE finished_at IS NULL
    `
    )
    .run()
  if (interrupted.changes === 0) return

  db.prepare(
    `
    UPDATE sync_status SET
      last_sync_at = datetime('now'), last_state = 'failed',
      last_errors = last_errors + 1
    WHERE id = 1
  `
  ).run()
  db.prepare("UPDATE app_settings SET value = 'false' WHERE key = 'scanCompleted'").run()
}

/** Closes the database connection gracefully. */
export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

function applyPragmas(db: Database.Database): void {
  const cacheKiB = Math.max(8192, Math.min(65536, Math.floor(totalmem() / 1024 / 256)))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  db.pragma(`cache_size = -${cacheKiB}`)
  db.pragma('temp_store = MEMORY')
  db.pragma('busy_timeout = 5000')
  db.pragma('wal_autocheckpoint = 2000')
}

function runMigrations(db: Database.Database): void {
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      filename   TEXT NOT NULL
    )
  `)

  const appliedVersions = new Set<number>(
    (
      db.prepare('SELECT version FROM migrations ORDER BY version').all() as { version: number }[]
    ).map((r) => r.version)
  )

  const migrationsDir = app.isPackaged
    ? join(process.resourcesPath, 'migrations')
    : join(__dirname, '../../electron/main/db/migrations')

  const migrationFiles = validateMigrationFiles(readdirSync(migrationsDir))

  for (const { filename: file, version } of migrationFiles) {
    if (appliedVersions.has(version)) continue

    const sql = readFileSync(join(migrationsDir, file), 'utf-8')

    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO migrations (version, filename) VALUES (?, ?)').run(version, file)
    })()
  }
}
