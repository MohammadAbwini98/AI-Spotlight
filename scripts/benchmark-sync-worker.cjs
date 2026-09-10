const Database = require('better-sqlite3')
const { Worker } = require('worker_threads')
const { monitorEventLoopDelay } = require('perf_hooks')
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')

const profiles = { smoke: 1000, small: 10000, medium: 100000, large: 1000000 }
const profile = process.argv.find((arg) => arg.startsWith('--profile='))?.split('=')[1] ?? 'small'
const requestedFiles = profiles[profile]
if (!requestedFiles) throw new Error(`Unknown profile: ${profile}`)

const projectRoot = join(__dirname, '..')
const migrationsPath = join(projectRoot, 'electron', 'main', 'db', 'migrations')
const outputDirectory = join(projectRoot, 'artifacts', 'benchmarks')
mkdirSync(outputDirectory, { recursive: true })

function createFixture(root, totalFiles) {
  const filesPerDirectory = 250
  for (
    let directoryIndex = 0;
    directoryIndex < Math.ceil(totalFiles / filesPerDirectory);
    directoryIndex++
  ) {
    const directory = join(root, `directory-${directoryIndex.toString().padStart(6, '0')}`)
    mkdirSync(directory)
    const filesHere = Math.min(filesPerDirectory, totalFiles - directoryIndex * filesPerDirectory)
    for (let fileIndex = 0; fileIndex < filesHere; fileIndex++) {
      writeFileSync(join(directory, `file-${fileIndex.toString().padStart(4, '0')}.txt`), '')
    }
  }
}

function migrate(db) {
  db.exec(`CREATE TABLE migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    filename TEXT NOT NULL
  )`)
  for (const filename of readdirSync(migrationsPath)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const version = Number(filename.match(/^(\d+)_/)[1])
    db.transaction(() => {
      db.exec(readFileSync(join(migrationsPath, filename), 'utf8'))
      db.prepare('INSERT INTO migrations (version, filename) VALUES (?, ?)').run(version, filename)
    })()
  }
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
}

function percentile(values, percentileValue) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1)]
}

function latencySummary(values) {
  return {
    samples: values.length,
    average: Number(
      (values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2)
    ),
    p50: Number(percentile(values, 50).toFixed(2)),
    p95: Number(percentile(values, 95).toFixed(2)),
    p99: Number(percentile(values, 99).toFixed(2)),
    max: Number(Math.max(0, ...values).toFixed(2))
  }
}

function fileSize(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function waitForReady(worker) {
  return new Promise((resolve, reject) => {
    const listener = (event) => {
      if (event.type !== 'ready') return
      worker.off('message', listener)
      resolve()
    }
    worker.on('message', listener)
    worker.once('error', reject)
  })
}

function run(worker, databasePath, roots, mode, cancelAtFirstProgress = false) {
  const runId = `benchmark-${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return new Promise((resolve, reject) => {
    const started = performance.now()
    let cancelRequestedAt = null
    const listener = (event) => {
      if (event.runId !== runId) return
      if (cancelAtFirstProgress && event.type === 'progress' && cancelRequestedAt === null) {
        cancelRequestedAt = performance.now()
        worker.postMessage({ type: 'cancel', runId })
      }
      if (event.type === 'completed' || event.type === 'cancelled') {
        worker.off('message', listener)
        resolve({
          durationMs: performance.now() - started,
          cancellationLatencyMs:
            cancelRequestedAt === null ? null : performance.now() - cancelRequestedAt,
          event
        })
      } else if (event.type === 'error') {
        worker.off('message', listener)
        reject(new Error(event.message))
      }
    }
    worker.on('message', listener)
    worker.postMessage({ type: 'start', runId, mode, roots, databasePath })
  })
}

async function main() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'spotlight-worker-benchmark-'))
  const fixtureRoot = join(temporaryRoot, 'fixture')
  const databasePath = join(temporaryRoot, 'spotlight.db')
  mkdirSync(fixtureRoot)
  createFixture(fixtureRoot, requestedFiles)

  const db = new Database(databasePath)
  migrate(db)
  const worker = new Worker(join(projectRoot, 'out', 'main', 'sync-worker.js'))
  await waitForReady(worker)
  worker.postMessage({ type: 'watch', roots: [fixtureRoot], databasePath })

  const search = db.prepare(`
    WITH fts_candidates AS MATERIALIZED (
      SELECT rowid, rank AS fts_score FROM files_fts
      WHERE files_fts MATCH ? ORDER BY rank LIMIT 400
    )
    SELECT f.id FROM fts_candidates AS candidate
    JOIN files AS f ON f.id = candidate.rowid
    WHERE f.is_available = 1
    ORDER BY candidate.fts_score, f.open_count DESC
    LIMIT 50
  `)
  const idleSearchLatencies = []
  for (let index = 0; index < 20; index++) {
    const started = performance.now()
    search.all('file*')
    idleSearchLatencies.push(performance.now() - started)
  }

  const activeSearchLatencies = []
  const loopDelay = monitorEventLoopDelay({ resolution: 10 })
  loopDelay.enable()
  let peakRss = process.memoryUsage().rss
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss)
    const started = performance.now()
    try {
      search.all('file*')
      activeSearchLatencies.push(performance.now() - started)
    } catch {
      // WAL readers remain available; a transient busy result is recorded as no sample.
    }
  }, 100)

  const rssBefore = process.memoryUsage().rss
  const cold = await run(worker, databasePath, [fixtureRoot], 'initial')
  const warm = await run(worker, databasePath, [fixtureRoot], 'reconcile')
  clearInterval(sampler)
  loopDelay.disable()

  const modifiedFile = join(fixtureRoot, 'directory-000000', 'file-0000.txt')
  writeFileSync(modifiedFile, 'changed')
  await delay(900)
  const modified = await run(worker, databasePath, [fixtureRoot], 'incremental')

  unlinkSync(modifiedFile)
  await delay(900)
  const deleted = await run(worker, databasePath, [fixtureRoot], 'incremental')
  const cancelled = await run(worker, databasePath, [fixtureRoot], 'reconcile', true)

  await delay(2500)
  db.pragma('wal_checkpoint(PASSIVE)')
  const rows = db.prepare('SELECT COUNT(*) AS count FROM files').get().count
  const ftsRows = db.prepare('SELECT COUNT(*) AS count FROM files_fts').get().count
  const result = {
    engine: 'background-worker-adaptive',
    profile,
    requestedFiles,
    indexedRows: rows,
    ftsRows,
    coldInitial: {
      durationMs: Math.round(cold.durationMs),
      throughputPerSecond: Math.round((cold.event.counters.discovered / cold.durationMs) * 1000),
      counters: cold.event.counters
    },
    warmReconciliation: {
      durationMs: Math.round(warm.durationMs),
      throughputPerSecond: Math.round((warm.event.counters.discovered / warm.durationMs) * 1000),
      counters: warm.event.counters
    },
    oneFileModification: {
      durationMs: Math.round(modified.durationMs),
      counters: modified.event.counters
    },
    oneFileDeletion: {
      durationMs: Math.round(deleted.durationMs),
      counters: deleted.event.counters
    },
    cancellationLatencyMs: Number(cancelled.cancellationLatencyMs.toFixed(2)),
    peakRssDeltaBytes: Math.max(0, peakRss - rssBefore),
    mainEventLoopDelayMs: {
      mean: Number((loopDelay.mean / 1e6).toFixed(2)),
      max: Number((loopDelay.max / 1e6).toFixed(2)),
      p99: Number((loopDelay.percentile(99) / 1e6).toFixed(2))
    },
    searchLatencyMs: {
      idle: latencySummary(idleSearchLatencies),
      duringInitialAndReconcile: latencySummary(activeSearchLatencies)
    },
    databaseBytes: fileSize(databasePath),
    walBytesAfterPassiveCheckpoint: fileSize(`${databasePath}-wal`)
  }

  const outputPath = join(outputDirectory, `worker-${profile}.json`)
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

  worker.postMessage({ type: 'shutdown' })
  await Promise.race([new Promise((resolve) => worker.once('exit', resolve)), delay(2000)])
  if (worker.threadId !== -1) await worker.terminate()
  db.close()
  rmSync(temporaryRoot, { recursive: true, force: true })
  process.exit(0)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exit(1)
})
