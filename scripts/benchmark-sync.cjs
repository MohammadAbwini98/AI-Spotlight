const Database = require('better-sqlite3')
const { monitorEventLoopDelay } = require('perf_hooks')
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } = require('fs')
const { opendir, stat } = require('fs/promises')
const { join, normalize, extname } = require('path')
const { tmpdir } = require('os')

const profiles = {
  smoke: 1000,
  small: 10000,
  medium: 100000,
  large: 1000000
}

const profileArg =
  process.argv.find((arg) => arg.startsWith('--profile='))?.split('=')[1] ?? 'small'
const entryCount = profiles[profileArg]
if (!entryCount) throw new Error(`Unknown profile: ${profileArg}`)

const outputDir = join(__dirname, '..', 'artifacts', 'benchmarks')
mkdirSync(outputDir, { recursive: true })

function createFixture(totalEntries) {
  const root = mkdtempSync(join(tmpdir(), 'spotlight-sync-benchmark-'))
  const filesPerDirectory = 250
  const directoryCount = Math.ceil(totalEntries / filesPerDirectory)

  for (let directoryIndex = 0; directoryIndex < directoryCount; directoryIndex++) {
    const directory = join(root, `directory-${directoryIndex.toString().padStart(6, '0')}`)
    mkdirSync(directory)
    const remaining = totalEntries - directoryIndex * filesPerDirectory
    const filesHere = Math.min(filesPerDirectory, remaining)
    for (let fileIndex = 0; fileIndex < filesHere; fileIndex++) {
      writeFileSync(join(directory, `file-${fileIndex.toString().padStart(4, '0')}.txt`), '')
    }
  }

  return root
}

function createDatabase(databasePath) {
  const db = new Database(databasePath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -8192')
  db.pragma('temp_store = MEMORY')
  db.exec(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      normalized_path TEXT NOT NULL UNIQUE,
      display_path TEXT NOT NULL,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      parent_path TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      extension TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT,
      modified_at TEXT,
      indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_scan_id INTEGER,
      is_available INTEGER NOT NULL DEFAULT 1,
      open_count INTEGER NOT NULL DEFAULT 0,
      last_opened_at TEXT,
      first_opened_at TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE files_fts USING fts5(
      name, name_normalized, display_path, content=files, content_rowid=id,
      tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TRIGGER files_fts_insert AFTER INSERT ON files BEGIN
      INSERT INTO files_fts(rowid, name, name_normalized, display_path)
      VALUES (new.id, new.name, new.name_normalized, new.display_path);
    END;
    CREATE TRIGGER files_fts_update
    AFTER UPDATE OF name, name_normalized, display_path ON files
    WHEN old.name IS NOT new.name OR old.name_normalized IS NOT new.name_normalized
      OR old.display_path IS NOT new.display_path
    BEGIN
      INSERT INTO files_fts(files_fts, rowid, name, name_normalized, display_path)
      VALUES ('delete', old.id, old.name, old.name_normalized, old.display_path);
      INSERT INTO files_fts(rowid, name, name_normalized, display_path)
      VALUES (new.id, new.name, new.name_normalized, new.display_path);
    END;
  `)
  return db
}

async function runLegacyScan(root, db, scanId) {
  const batchSize = 250
  const batch = []
  let scanned = 0
  let transactions = 0

  const upsert = db.prepare(`
    INSERT INTO files
      (normalized_path, display_path, name, name_normalized, parent_path,
       entry_type, extension, size, created_at, modified_at, last_seen_scan_id, is_available)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(normalized_path) DO UPDATE SET
      display_path = excluded.display_path,
      name = excluded.name,
      name_normalized = excluded.name_normalized,
      parent_path = excluded.parent_path,
      extension = excluded.extension,
      size = excluded.size,
      modified_at = excluded.modified_at,
      last_seen_scan_id = excluded.last_seen_scan_id,
      is_available = 1,
      indexed_at = datetime('now')
  `)
  const flush = db.transaction((entries) => {
    for (const entry of entries) upsert.run(...entry)
  })
  const commit = async () => {
    if (batch.length === 0) return
    flush(batch.splice(0, batch.length))
    transactions++
    await new Promise((resolve) => setTimeout(resolve, 8))
  }

  const queue = [root]
  let queueIndex = 0
  while (queueIndex < queue.length) {
    const parent = queue[queueIndex++]
    const directory = await opendir(parent)
    for await (const entry of directory) {
      const absolutePath = join(parent, entry.name)
      const normalizedPath = normalize(absolutePath).toLowerCase()
      if (entry.isDirectory()) {
        queue.push(absolutePath)
        batch.push([
          normalizedPath,
          absolutePath,
          entry.name,
          entry.name.toLowerCase(),
          parent,
          'directory',
          null,
          0,
          null,
          null,
          scanId
        ])
      } else if (entry.isFile()) {
        const metadata = await stat(absolutePath)
        batch.push([
          normalizedPath,
          absolutePath,
          entry.name,
          entry.name.toLowerCase(),
          parent,
          'file',
          extname(entry.name).toLowerCase() || null,
          metadata.size,
          metadata.birthtime.toISOString(),
          metadata.mtime.toISOString(),
          scanId
        ])
      }
      scanned++
      if (batch.length >= batchSize) await commit()
    }
  }
  await commit()
  return { scanned, transactions }
}

function fileSize(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

async function main() {
  const fixtureRoot = createFixture(entryCount)
  const databasePath = join(fixtureRoot, 'benchmark.db')
  const db = createDatabase(databasePath)
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  eventLoop.enable()
  const rssBefore = process.memoryUsage().rss
  const searchLatencies = []
  const search = db.prepare(`
    SELECT f.id FROM files_fts JOIN files f ON f.id = files_fts.rowid
    WHERE files_fts MATCH ? AND f.is_available = 1 LIMIT 50
  `)
  const searchTimer = setInterval(() => {
    const started = performance.now()
    try {
      search.all('file*')
      searchLatencies.push(performance.now() - started)
    } catch {
      // The first batch may not have committed yet.
    }
  }, 100)

  const started = performance.now()
  const scan = await runLegacyScan(fixtureRoot, db, 1)
  const durationMs = performance.now() - started
  clearInterval(searchTimer)
  eventLoop.disable()
  db.pragma('wal_checkpoint(PASSIVE)')

  const rowCount = db.prepare('SELECT COUNT(*) AS count FROM files').get().count
  const result = {
    engine: 'legacy-main-thread-model',
    profile: profileArg,
    requestedFiles: entryCount,
    indexedRows: rowCount,
    durationMs: Math.round(durationMs),
    throughputPerSecond: Math.round((scan.scanned / durationMs) * 1000),
    transactions: scan.transactions,
    peakRssDeltaBytes: Math.max(0, process.memoryUsage().rss - rssBefore),
    eventLoopDelayMs: {
      mean: Number((eventLoop.mean / 1e6).toFixed(2)),
      max: Number((eventLoop.max / 1e6).toFixed(2)),
      p99: Number((eventLoop.percentile(99) / 1e6).toFixed(2))
    },
    searchLatencyMs: {
      samples: searchLatencies.length,
      max: Number(Math.max(0, ...searchLatencies).toFixed(2)),
      average: Number(
        (
          searchLatencies.reduce((sum, value) => sum + value, 0) /
          Math.max(1, searchLatencies.length)
        ).toFixed(2)
      )
    },
    databaseBytes: fileSize(databasePath),
    walBytes: fileSize(`${databasePath}-wal`)
  }

  db.close()
  const outputPath = join(outputDir, `baseline-${profileArg}.json`)
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

  // This directory was created by mkdtemp above and contains benchmark data only.
  rmSync(fixtureRoot, { recursive: true, force: true })
  if (process.versions.electron) process.exit(0)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
  if (process.versions.electron) process.exit(1)
})
