const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

// We need to resolve where the db is. In dev, it's %APPDATA%/SpotlightTodo/spotlight.db
const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + "/.local/share")
const dbPath = path.join(appData, 'SpotlightTodo', 'spotlight.db')

if (!fs.existsSync(dbPath)) {
  console.log("DB not found at", dbPath)
  process.exit(1)
}

const db = new Database(dbPath)
const count = db.prepare('SELECT COUNT(*) as count FROM files').get()
console.log("Total files indexed:", count)
