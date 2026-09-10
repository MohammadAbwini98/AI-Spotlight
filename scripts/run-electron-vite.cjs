const { spawn } = require('child_process')
const { join } = require('path')

function createElectronEnvironment(source = process.env) {
  const environment = { ...source }
  delete environment.ELECTRON_RUN_AS_NODE
  return environment
}

function run() {
  const cli = join(__dirname, '..', 'node_modules', 'electron-vite', 'bin', 'electron-vite.js')
  const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], {
    cwd: join(__dirname, '..'),
    env: createElectronEnvironment(),
    stdio: 'inherit'
  })

  child.once('error', (error) => {
    console.error(`[dev-launcher] ${error.message}`)
    process.exitCode = 1
  })

  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exitCode = code ?? 1
  })
}

if (require.main === module) run()

module.exports = { createElectronEnvironment }
