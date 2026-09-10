const assert = require('node:assert/strict')
const Database = require('better-sqlite3')
const { Worker } = require('worker_threads')
const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} = require('fs')
const { rm } = require('fs/promises')
const { join, normalize } = require('path')
const { tmpdir } = require('os')

const projectRoot = join(__dirname, '..')
const workerPath = join(projectRoot, 'out', 'main', 'sync-worker.js')
const migrationsPath = join(projectRoot, 'electron', 'main', 'db', 'migrations')

function createMigratedDatabase(databasePath) {
  const db = new Database(databasePath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      filename TEXT NOT NULL
    )
  `)
  for (const filename of readdirSync(migrationsPath)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const version = Number(filename.match(/^(\d+)_/)?.[1])
    const sql = readFileSync(join(migrationsPath, filename), 'utf8')
    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO migrations (version, filename) VALUES (?, ?)').run(version, filename)
    })()
  }
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  return db
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function waitForReady(worker) {
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.type !== 'ready') return
      worker.off('message', onMessage)
      resolve()
    }
    worker.on('message', onMessage)
    worker.once('error', reject)
  })
}

function runSync(worker, databasePath, roots, mode, options = {}) {
  const runId = `integration-${mode}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  return new Promise((resolve, reject) => {
    let cancellationSent = false
    const onMessage = (event) => {
      if (event.runId !== runId) return
      if (event.type === 'progress' && options.cancelOnScan && !cancellationSent) {
        cancellationSent = true
        worker.postMessage({ type: 'cancel', runId })
      }
      if (event.type === 'completed' || event.type === 'cancelled') {
        worker.off('message', onMessage)
        resolve(event)
      } else if (event.type === 'error') {
        worker.off('message', onMessage)
        if (options.expectError) resolve(event)
        else reject(new Error(`${event.code}: ${event.message}`))
      }
    }
    worker.on('message', onMessage)
    worker.postMessage({ type: 'start', runId, mode, roots, databasePath })
  })
}

async function main() {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'spotlight-sync-integration-'))
  const fixtureRoot = join(temporaryRoot, 'fixture')
  const nestedRoot = join(fixtureRoot, 'nested')
  const appDataRoot = join(fixtureRoot, '.spotlight-data')
  const databasePath = join(appDataRoot, 'spotlight.db')
  mkdirSync(nestedRoot, { recursive: true })
  mkdirSync(appDataRoot)
  const alphaPath = join(fixtureRoot, 'alpha.txt')
  const betaPath = join(nestedRoot, 'beta.md')
  const gammaPath = join(nestedRoot, 'gamma.json')
  writeFileSync(alphaPath, 'alpha')
  writeFileSync(betaPath, 'beta')
  writeFileSync(gammaPath, '{"gamma":true}')
  let cycleLinkCreated = false
  try {
    symlinkSync(fixtureRoot, join(nestedRoot, 'cycle'), 'junction')
    cycleLinkCreated = true
  } catch {
    // Junction creation can be disabled by Windows policy; traversal still rejects Dirent symlinks.
  }

  const db = createMigratedDatabase(databasePath)
  const worker = new Worker(workerPath)
  let unsolicitedChangeNotifications = 0
  worker.on('message', (event) => {
    if (event.type === 'changes-detected') unsolicitedChangeNotifications++
  })
  await waitForReady(worker)
  worker.postMessage({ type: 'watch', roots: [fixtureRoot], databasePath })

  try {
    const initial = await runSync(worker, databasePath, [fixtureRoot], 'initial')
    assert.equal(initial.state, 'complete', JSON.stringify(initial))
    assert.equal(initial.counters.added, 4)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM files').get().count, 4)
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM files_fts').get().count, 4)
    if (cycleLinkCreated) assert.ok(initial.counters.excluded >= 1)
    assert.equal(
      db
        .prepare('SELECT COUNT(*) AS count FROM files WHERE normalized_path LIKE ?')
        .get(`${normalize(appDataRoot).toLowerCase()}%`).count,
      0,
      'the active application-data directory must never enter its own index'
    )
    await delay(900)
    assert.equal(
      unsolicitedChangeNotifications,
      0,
      'database and WAL writes must not trigger another synchronization'
    )

    const exactSearch = db.prepare(`
      WITH candidates AS MATERIALIZED (
        SELECT rowid, rank AS score FROM files_fts
        WHERE files_fts MATCH ? ORDER BY rank LIMIT 256
      )
      SELECT files.name FROM candidates
      JOIN files ON files.id = candidates.rowid
      WHERE files.is_available = 1
      ORDER BY (CASE WHEN files.name_normalized = ? THEN 10 ELSE 0 END) - candidates.score DESC
      LIMIT 1
    `)
    assert.equal(exactSearch.get('"alpha"*', 'alpha.txt').name, 'alpha.txt')

    const alphaNormalized = normalize(alphaPath).toLowerCase()
    const beforeUnchanged = db
      .prepare('SELECT indexed_at FROM files WHERE normalized_path = ?')
      .get(alphaNormalized).indexed_at
    const unchanged = await runSync(worker, databasePath, [fixtureRoot], 'reconcile')
    assert.equal(unchanged.state, 'complete')
    assert.equal(unchanged.counters.updated, 0)
    assert.equal(unchanged.counters.unchanged, 4)
    assert.equal(
      db.prepare('SELECT indexed_at FROM files WHERE normalized_path = ?').get(alphaNormalized)
        .indexed_at,
      beforeUnchanged
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM files_fts').get().count, 4)
    const persistedUnchanged = db.prepare('SELECT * FROM sync_status WHERE id = 1').get()
    assert.equal(persistedUnchanged.last_unchanged, 4)
    assert.equal(persistedUnchanged.last_state, 'complete')

    await delay(1100)
    writeFileSync(alphaPath, 'alpha changed')
    await delay(900)
    const changed = await runSync(worker, databasePath, [fixtureRoot], 'incremental')
    assert.equal(changed.state, 'complete')
    assert.ok(changed.counters.updated >= 1)
    assert.equal(
      db.prepare('SELECT size FROM files WHERE normalized_path = ?').get(alphaNormalized).size,
      13
    )

    unlinkSync(betaPath)
    await delay(900)
    const removed = await runSync(worker, databasePath, [fixtureRoot], 'incremental')
    assert.equal(removed.counters.newlyUnavailable, 1)
    assert.equal(
      db
        .prepare('SELECT is_available FROM files WHERE normalized_path = ?')
        .get(normalize(betaPath).toLowerCase()).is_available,
      0
    )

    const noChange = await runSync(worker, databasePath, [fixtureRoot], 'incremental')
    assert.equal(noChange.counters.newlyUnavailable, 0)

    writeFileSync(betaPath, 'beta restored')
    await delay(900)
    const restored = await runSync(worker, databasePath, [fixtureRoot], 'incremental')
    assert.equal(restored.counters.restored, 1)

    unlinkSync(gammaPath)
    const warningRun = await runSync(
      worker,
      databasePath,
      [fixtureRoot, join(temporaryRoot, 'missing-root')],
      'reconcile'
    )
    assert.equal(warningRun.state, 'complete_with_warnings')
    assert.equal(
      db
        .prepare('SELECT is_available FROM files WHERE normalized_path = ?')
        .get(normalize(gammaPath).toLowerCase()).is_available,
      1,
      'an incomplete reconciliation must preserve unseen availability'
    )

    const cancelled = await runSync(worker, databasePath, [fixtureRoot], 'reconcile', {
      cancelOnScan: true
    })
    assert.equal(cancelled.type, 'cancelled')
    assert.equal(
      db
        .prepare('SELECT is_available FROM files WHERE normalized_path = ?')
        .get(normalize(gammaPath).toLowerCase()).is_available,
      1,
      'a cancelled pass must not perform destructive global reconciliation'
    )
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM scan_sessions WHERE state = 'cancelled'").get()
        .count,
      1
    )

    const forcedFailurePath = join(fixtureRoot, 'forced-failure.txt')
    writeFileSync(forcedFailurePath, 'force an insert')
    db.exec(`
      CREATE TRIGGER force_sync_failure BEFORE INSERT ON files BEGIN
        SELECT RAISE(ABORT, 'forced integration failure');
      END;
    `)
    const failed = await runSync(worker, databasePath, [fixtureRoot], 'reconcile', {
      expectError: true
    })
    db.exec('DROP TRIGGER force_sync_failure')
    assert.equal(failed.type, 'error')
    assert.equal(
      db
        .prepare('SELECT is_available FROM files WHERE normalized_path = ?')
        .get(normalize(gammaPath).toLowerCase()).is_available,
      1,
      'a failed pass must not perform destructive global reconciliation'
    )
    assert.equal(
      db.prepare('SELECT state FROM scan_sessions ORDER BY id DESC LIMIT 1').get().state,
      'failed'
    )
    assert.equal(
      db.prepare('SELECT COUNT(*) AS count FROM scan_sessions WHERE finished_at IS NULL').get()
        .count,
      0
    )
    assert.equal(db.pragma('quick_check', { simple: true }), 'ok')

    const summary = {
      initial: initial.counters,
      unchanged: unchanged.counters,
      changed: changed.counters,
      removed: removed.counters,
      restored: restored.counters,
      cancellationState: cancelled.type,
      warningState: warningRun.state,
      failureState: failed.type,
      cycleLinkValidated: cycleLinkCreated,
      sessions: db.prepare('SELECT COUNT(*) AS count FROM scan_sessions').get().count
    }
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
  } finally {
    worker.postMessage({ type: 'shutdown' })
    await Promise.race([
      new Promise((resolve) => worker.once('exit', resolve)),
      delay(2000).then(() => worker.terminate())
    ])
    db.close()
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
  process.exit(0)
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exit(1)
})
