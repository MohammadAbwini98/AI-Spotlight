const { app } = require('electron')
const Database = require('better-sqlite3')
const { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } = require('fs')
const { join, resolve } = require('path')
const { tmpdir } = require('os')

const profiles = { smoke: 1000, small: 10000, medium: 100000 }
const profile =
  process.argv.find((argument) => argument.startsWith('--profile='))?.split('=')[1] ?? 'medium'
const requestedFiles = profiles[profile]
if (!requestedFiles) throw new Error(`Unknown runtime profile: ${profile}`)

const projectRoot = resolve(__dirname, '..')
const temporaryRoot = mkdtempSync(join(tmpdir(), 'spotlight-electron-runtime-'))
const fixtureRoot = join(temporaryRoot, 'fixture')
const dataRoot = join(temporaryRoot, 'data')
const outputDirectory = join(projectRoot, 'artifacts', 'runtime')
const migrationsDirectory = join(projectRoot, 'electron', 'main', 'db', 'migrations')
mkdirSync(fixtureRoot)
mkdirSync(dataRoot)
mkdirSync(outputDirectory, { recursive: true })

function createFixture(totalFiles) {
  const filesPerDirectory = 250
  for (
    let directoryIndex = 0;
    directoryIndex < Math.ceil(totalFiles / filesPerDirectory);
    directoryIndex++
  ) {
    const directory = join(fixtureRoot, `directory-${directoryIndex.toString().padStart(6, '0')}`)
    mkdirSync(directory)
    const filesHere = Math.min(filesPerDirectory, totalFiles - directoryIndex * filesPerDirectory)
    for (let fileIndex = 0; fileIndex < filesHere; fileIndex++) {
      writeFileSync(join(directory, `file-${fileIndex.toString().padStart(4, '0')}.txt`), '')
    }
  }
}

function prepareInterruptedDatabase() {
  const databasePath = join(dataRoot, 'spotlight.db')
  const db = new Database(databasePath)
  db.exec(`CREATE TABLE migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    filename TEXT NOT NULL
  )`)
  for (const filename of readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const version = Number(filename.match(/^(\d+)_/)[1])
    db.transaction(() => {
      db.exec(readFileSync(join(migrationsDirectory, filename), 'utf8'))
      db.prepare('INSERT INTO migrations (version, filename) VALUES (?, ?)').run(version, filename)
    })()
  }
  db.prepare(
    "INSERT INTO scan_sessions (run_key, mode, state) VALUES ('interrupted-runtime-run', 'reconcile', 'scanning')"
  ).run()
  db.prepare("UPDATE app_settings SET value = 'true' WHERE key = 'scanCompleted'").run()
  db.close()
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}

async function evaluate(window, expression) {
  return window.webContents.executeJavaScript(expression, true)
}

async function waitForRenderer(window) {
  if (!window.webContents.isLoading()) return
  await new Promise((resolveLoad) => window.webContents.once('did-finish-load', resolveLoad))
}

async function runWalkthrough(window) {
  await waitForRenderer(window)
  const statesObserved = new Set()
  const rendererRoundTrips = []
  const searchLatencies = []
  let duplicateStartResult = null
  let todoNavigationWorked = false
  let todoIpcWorked = false
  let recentBackWorked = false
  let frameMaxGapMs = 0
  let terminalStatus = null
  let activeRunObserved = false
  const deadline = Date.now() + 10 * 60 * 1000

  while (Date.now() < deadline) {
    const statusResult = await evaluate(window, 'window.electronAPI.indexer.getStatus()')
    if (!statusResult.ok) throw new Error(statusResult.error.message)
    const status = statusResult.data
    statesObserved.add(status.state)

    if (['preparing', 'scanning', 'reconciling'].includes(status.state)) {
      activeRunObserved = true
      if (!duplicateStartResult) {
        duplicateStartResult = await evaluate(window, 'window.electronAPI.indexer.startSync()')

        const bounds = window.getBounds()
        const movementStarted = performance.now()
        window.setPosition(bounds.x + 2, bounds.y + 2)
        window.setBounds(bounds)
        window.minimize()
        window.restore()
        rendererRoundTrips.push(performance.now() - movementStarted)

        const frameResult = await evaluate(
          window,
          `new Promise((resolve) => {
            let previous = performance.now(); let maximum = 0; let frames = 0;
            function tick(now) {
              maximum = Math.max(maximum, now - previous); previous = now; frames += 1;
              if (frames >= 30) resolve(maximum); else requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
          })`
        )
        frameMaxGapMs = Number(frameResult)

        todoIpcWorked = Boolean((await evaluate(window, 'window.electronAPI.todo.getLists()')).ok)
        todoNavigationWorked = Boolean(
          await evaluate(
            window,
            `(() => {
              const button = document.querySelector('[aria-label="Open Todo"]');
              if (!button) return false; button.click(); return true;
            })()`
          )
        )
        await delay(250)
        todoNavigationWorked =
          todoNavigationWorked &&
          Boolean(await evaluate(window, `document.body.innerText.includes('All Tasks')`))
        await evaluate(
          window,
          `(() => {
            const button = [...document.querySelectorAll('button')]
              .find((candidate) => candidate.textContent?.trim() === 'Search');
            button?.click(); return Boolean(button);
          })()`
        )
        const recentOpened = Boolean(
          await evaluate(
            window,
            `new Promise((resolve) => {
              const deadline = performance.now() + 2000;
              function findButton() {
                const button = document.querySelector('[aria-label="Show recent files"]');
                if (button) { button.click(); resolve(true); return; }
                if (performance.now() >= deadline) { resolve(false); return; }
                requestAnimationFrame(findButton);
              }
              findButton();
            })`
          )
        )
        const recentBackFound = Boolean(
          await evaluate(
            window,
            `new Promise((resolve) => {
              const deadline = performance.now() + 2000;
              function findButton() {
                const button = document.querySelector('[aria-label="Back to Spotlight"]');
                if (button) { button.click(); resolve(true); return; }
                if (performance.now() >= deadline) { resolve(false); return; }
                requestAnimationFrame(findButton);
              }
              findButton();
            })`
          )
        )
        recentBackWorked = recentOpened && recentBackFound
      }

      const pingStarted = performance.now()
      await evaluate(window, 'performance.now()')
      rendererRoundTrips.push(performance.now() - pingStarted)

      const searchStarted = performance.now()
      const searchResult = await evaluate(
        window,
        `window.electronAPI.search.query({ text: 'file-0001', requestId: ${Date.now()}, limit: 50 })`
      )
      searchLatencies.push(performance.now() - searchStarted)
      if (!searchResult.ok) throw new Error(searchResult.error.message)
    }

    if (
      activeRunObserved &&
      ['complete', 'complete_with_warnings', 'failed', 'cancelled'].includes(status.state)
    ) {
      terminalStatus = status
      break
    }
    await delay(150)
  }

  if (!terminalStatus) throw new Error('The runtime scan did not reach a terminal state.')
  if (!['complete', 'complete_with_warnings'].includes(terminalStatus.state)) {
    throw new Error(`The runtime scan finished in ${terminalStatus.state}.`)
  }
  const dataPathResult = await evaluate(window, 'window.electronAPI.stats.getDataPath()')
  const verificationDb = new Database(join(dataRoot, 'spotlight.db'), { readonly: true })
  const interruptedRecovery = verificationDb
    .prepare(
      "SELECT state, finished_at FROM scan_sessions WHERE run_key = 'interrupted-runtime-run'"
    )
    .get()
  const unfinishedSessions = verificationDb
    .prepare('SELECT COUNT(*) AS count FROM scan_sessions WHERE finished_at IS NULL')
    .get().count
  verificationDb.close()
  const result = {
    profile,
    requestedFiles,
    productionBundle: true,
    dataPath: dataPathResult.ok ? dataPathResult.data : null,
    statesObserved: [...statesObserved],
    terminalState: terminalStatus.state,
    interruptedSessionRecovered:
      interruptedRecovery?.state === 'failed' && Boolean(interruptedRecovery.finished_at),
    unfinishedSessions,
    counters: {
      discovered: terminalStatus.discovered,
      added: terminalStatus.added,
      updated: terminalStatus.updated,
      unchanged: terminalStatus.unchanged,
      newlyUnavailable: terminalStatus.newlyUnavailable,
      errors: terminalStatus.errors
    },
    duplicateStartRejected:
      duplicateStartResult?.ok === false && duplicateStartResult.error?.code === 'INDEXER_BUSY',
    todoIpcWorked,
    todoNavigationWorked,
    recentBackWorked,
    windowMoveMinimizeRestoreWorked: window.isVisible(),
    rendererFrameMaxGapMs: Number(frameMaxGapMs.toFixed(2)),
    rendererRoundTripMaxMs: Number(Math.max(0, ...rendererRoundTrips).toFixed(2)),
    searchDuringSync: {
      samples: searchLatencies.length,
      averageMs: Number(
        (
          searchLatencies.reduce((sum, value) => sum + value, 0) /
          Math.max(1, searchLatencies.length)
        ).toFixed(2)
      ),
      maxMs: Number(Math.max(0, ...searchLatencies).toFixed(2))
    }
  }
  const outputPath = join(outputDirectory, `electron-${profile}.json`)
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  await delay(250)
  app.quit()
}

createFixture(requestedFiles)
prepareInterruptedDatabase()
process.env.SPOTLIGHT_TODO_DATA_DIR = dataRoot
process.env.SPOTLIGHT_TODO_SCAN_ROOTS = JSON.stringify([fixtureRoot])

app.on('browser-window-created', (_event, window) => {
  void runWalkthrough(window).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`)
    process.exitCode = 1
    app.quit()
  })
})

app.on('quit', () => {
  rmSync(temporaryRoot, { recursive: true, force: true })
})

require('../out/main/index.js')
