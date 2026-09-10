const { spawnSync } = require('child_process')
const { join } = require('path')

const electronPath = require('electron')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const result = spawnSync(
  electronPath,
  [join(__dirname, 'runtime-sync-walkthrough.cjs'), ...process.argv.slice(2)],
  { env, stdio: 'inherit' }
)

process.exit(result.status ?? 1)
